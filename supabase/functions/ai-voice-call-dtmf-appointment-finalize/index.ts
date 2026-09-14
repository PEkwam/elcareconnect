import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@4.0.0";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";
import { getAppSecret } from "../_shared/app-secrets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

// Resend is constructed lazily so the admin-managed key (Setup → Application
// Secrets) is picked up at request time rather than cold-start time.
const getResend = async () => {
  const key = await getAppSecret("RESEND_API_KEY");
  return key ? new Resend(key) : null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verify = await verifyTwilioRequest(req, 'ai-voice-call-dtmf-appointment-finalize', corsHeaders);
    if (!verify.ok) return verify.response!;
    const params = verify.params;

    const callSid = params.CallSid;
    const from = params.From;
    const to = params.To;

    console.log('Finalize called with Twilio data:', {
      callSid,
      from,
      to,
      allFormData: params,
    });

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Find the call record by CallSid stored in notes
    const { data: callRecords } = await supabaseAdmin
      .from('outbound_calls')
      .select('*, clients(*)')
      .order('created_at', { ascending: false })
      .limit(10);
    
    console.log(`Found ${callRecords?.length || 0} recent call records`);

    // Find by CallSid in notes
    let callData = callRecords?.find(record => 
      callSid && record.notes?.includes(`CallSid:${callSid}`)
    );

    // Fallback: find by phone number (To field)
    if (!callData && to) {
      callData = callRecords?.find(record => record.phone_number === to);
      console.log('Fallback search by phone:', to, 'Found:', !!callData);
    }

    if (!callData) {
      console.error('Call record not found for CallSid:', callSid, 'or phone:', to);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We could not find your call record. An agent will contact you. Goodbye!</Say></Response>',
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }

    console.log('Found call record:', { 
      callId: callData.id,
      clientName: callData.clients?.name || 'Unknown',
      clientEmail: callData.clients?.email || 'No email',
      notes: callData.notes
    });

    // Extract appointment preference from notes
    const match = callData.notes?.match(/Appointment preference: ([^|]+)/);
    const appointmentPreference = match?.[1]?.trim() || 'Not specified';

    console.log('Processing appointment with preference:', appointmentPreference);

    // Parse the spoken/keyed appointment preference into a concrete date+time
    // using the built-in AI gateway (no third-party key required).
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const today = new Date();

    let scheduledDate = new Date();
    let scheduledTime = '09:00';
    let parsedSuccessfully = false;

    let aiResponse: Response | null = null;
    if (lovableApiKey) {
      aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'user',
              content: `Parse appointment: "${appointmentPreference}". Today: ${today.toISOString().split('T')[0]}. Reply with JSON only: {"date":"YYYY-MM-DD","time":"HH:MM"}`,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });
    } else {
      console.error('LOVABLE_API_KEY not configured; falling back to default appointment slot');
    }

    if (aiResponse?.ok) {
      const aiResult = await aiResponse.json();
      const aiText = aiResult.choices?.[0]?.message?.content ?? '';
      try {
        const parsed = JSON.parse(aiText);
        if (parsed.date && parsed.date !== 'null') {
          scheduledDate = new Date(parsed.date);
          scheduledTime = parsed.time || '09:00';
          parsedSuccessfully = true;
          console.log('Parsed appointment date:', scheduledDate, 'time:', scheduledTime);
        }
      } catch (e) {
        console.error('Could not parse AI date response:', e);
      }
    } else if (aiResponse) {
      console.error(`AI gateway error [${aiResponse.status}]: ${await aiResponse.text()}`);
    }

    if (!parsedSuccessfully) {
      console.log('Using default date (7 days from now) at 9:00 AM');
      scheduledDate.setDate(scheduledDate.getDate() + 7);
    }

    // Validate date is not in the past
    const validationToday = new Date();
    validationToday.setHours(0, 0, 0, 0);
    if (scheduledDate < validationToday) {
      console.log('Requested date is in the past, moving to next available weekday');
      scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 1);
      scheduledTime = '09:00';
    }

    // Validate date is not a weekend, skip to Monday if needed
    let dayOfWeek = scheduledDate.getDay();
    if (dayOfWeek === 0) { // Sunday
      console.log('Date falls on Sunday, moving to Monday');
      scheduledDate.setDate(scheduledDate.getDate() + 1);
    } else if (dayOfWeek === 6) { // Saturday
      console.log('Date falls on Saturday, moving to Monday');
      scheduledDate.setDate(scheduledDate.getDate() + 2);
    }

    console.log('Final validated date:', scheduledDate.toISOString().split('T')[0], 'time:', scheduledTime);

    // Check for conflicting appointments (prevent double booking)
    const { data: existingAppointments } = await supabaseAdmin
      .from('medical_appointments')
      .select('*')
      .eq('scheduled_date', scheduledDate.toISOString().split('T')[0])
      .eq('medical_center', 'DCK Medical Center')
      .eq('status', 'scheduled');

    console.log(`Found ${existingAppointments?.length || 0} existing appointments for ${scheduledDate.toISOString().split('T')[0]}`);

    const timeSlotTaken = existingAppointments?.some(appt => {
      // Check if appointment is within same hour
      const apptTime = appt.notes?.match(/(\d{1,2}:\d{2})/)?.[0] || scheduledTime;
      return apptTime === scheduledTime;
    });

    if (timeSlotTaken) {
      console.log(`Time slot ${scheduledTime} is already booked, suggesting alternative`);
      // Find next available slot
      const availableSlots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
      const bookedTimes = existingAppointments?.map(appt => 
        appt.notes?.match(/(\d{1,2}:\d{2})/)?.[0]
      ).filter(Boolean) || [];
      
      const nextAvailable = availableSlots.find(slot => !bookedTimes.includes(slot));
      
      if (nextAvailable) {
        scheduledTime = nextAvailable;
        console.log(`Rescheduling to next available slot: ${scheduledTime}`);
      } else {
        // No slots available, move to next weekday
        scheduledDate.setDate(scheduledDate.getDate() + 1);
        
        // Skip weekend if we land on Saturday or Sunday
        dayOfWeek = scheduledDate.getDay();
        if (dayOfWeek === 0) { // Sunday
          scheduledDate.setDate(scheduledDate.getDate() + 1);
        } else if (dayOfWeek === 6) { // Saturday
          scheduledDate.setDate(scheduledDate.getDate() + 2);
        }
        
        scheduledTime = '09:00';
        console.log(`No slots available, moving to next weekday: ${scheduledDate.toISOString().split('T')[0]}`);
      }
    }

    // Use existing client email - no need to collect it
    const email = callData.clients?.email || null;
    console.log('Client email for confirmation:', email || 'None provided');

    // Check if appointment already exists for this call to prevent duplicates
    const { data: existingAppointment } = await supabaseAdmin
      .from('medical_appointments')
      .select('*')
      .eq('client_id', callData.clients.id)
      .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Created in last 60 seconds
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAppointment) {
      console.log('Appointment already exists for this call, skipping duplicate creation');
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">Your appointment is already confirmed for ${new Date(existingAppointment.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}. See you then. Goodbye!</Say></Response>`;
      return new Response(twimlResponse, { headers: { 'Content-Type': 'text/xml', ...corsHeaders } });
    }

    // Create appointment with time
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from('medical_appointments')
      .insert({
        client_id: callData.clients.id,
        appointment_type: 'General Consultation',
        scheduled_date: scheduledDate.toISOString().split('T')[0],
        status: 'scheduled',
        medical_center: 'DCK Medical Center',
        notes: `Scheduled via AI call. Time: ${scheduledTime}. Client said: "${appointmentPreference}"`
      })
      .select()
      .single();

    if (appointmentError) {
      console.error('Error creating appointment:', appointmentError);
      console.error('Appointment error details:', JSON.stringify(appointmentError));
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We encountered an error scheduling your appointment. Our team will contact you shortly. Goodbye!</Say></Response>',
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }

    console.log('Appointment created successfully:', { 
      appointmentId: appointment?.id, 
      scheduledDate: scheduledDate.toISOString() 
    });

    // Create customer note for the appointment
    const noteResult = await supabaseAdmin
      .from('customer_notes')
      .insert({
        client_id: callData.clients.id,
        call_id: callData.id,
        note_type: 'appointment',
        content: `Medical appointment: ${scheduledDate.toLocaleDateString()} at ${scheduledTime}. Client said: "${appointmentPreference}". Location: DCK Medical Center. Email: ${email || 'Not provided'}`,
        agent_email: 'ai-system@dck.com'
      });

    if (noteResult.error) {
      console.error('Error creating customer note:', noteResult.error);
    } else {
      console.log('Customer note created for appointment');
    }

    // Update call record - preserve original preference
    const callUpdateResult = await supabaseAdmin
      .from('outbound_calls')
      .update({
        call_status: 'completed',
        outcome: 'appointment_scheduled',
        notes: `${callData.notes} | Confirmed: ${scheduledDate.toLocaleDateString()} at ${scheduledTime}`,
        ended_at: new Date().toISOString()
      })
      .eq('id', callData.id);

    if (callUpdateResult.error) {
      console.error('Error updating call record:', callUpdateResult.error);
    } else {
      console.log('Call record updated with appointment details');
    }

    // Send confirmation email if client has email
    const resend = await getResend();
    console.log('Resend configured:', !!resend);

    if (email && email.includes('@') && resend) {
      console.log('Attempting to send appointment confirmation email');

      try {
        const emailResult = await resend.emails.send({
          from: 'Care Connect <onboarding@resend.dev>',
          to: [email],
          subject: 'Medical Appointment Confirmation',
          html: `
            <h2>Appointment Confirmation</h2>
            <p>Dear ${callData.clients?.name || 'Valued Client'},</p>
            <p>Your medical appointment has been scheduled:</p>
            <ul>
              <li><strong>Date:</strong> ${scheduledDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</li>
              <li><strong>Time:</strong> ${scheduledTime}</li>
              <li><strong>Location:</strong> DCK Medical Center</li>
              <li><strong>Type:</strong> General Consultation</li>
            </ul>
            <p>We look forward to seeing you!</p>
            <p>Best regards,<br>DCK Medical Team</p>
          `,
        });
        console.log('✅ Email sent successfully!');
        console.log('Email result:', JSON.stringify(emailResult, null, 2));
      } catch (emailError) {
        console.error('❌ Failed to send email');
        console.error('Email error:', emailError);
        console.error('Email error details:', JSON.stringify(emailError, null, 2));
        console.error('Error message:', emailError?.message);
        console.error('Error stack:', emailError?.stack);
      }
    } else {
      console.log('⚠️ No valid email found for client:', callData.clients?.name || 'Unknown');
      console.log('Email value:', email);
    }

    // Return TwiML response to thank the client
    const timeFormatted = scheduledTime.replace(':', ' ');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">Perfect! Your appointment is confirmed for ${scheduledDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${timeFormatted}. ${email && email.includes('@') ? 'Check your email for details.' : ''} See you then. Goodbye!</Say></Response>`,
      { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error finalizing appointment:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We encountered an error processing your request. Our team will contact you shortly. Goodbye!</Say></Response>',
      {
        status: 500,
        headers: { 'Content-Type': 'text/xml', ...corsHeaders }
      }
    );
  }
});
