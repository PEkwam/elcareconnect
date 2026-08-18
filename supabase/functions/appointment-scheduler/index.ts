import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Check if user has admin or agent role
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const hasPermission = roles?.some(r => r.role === 'admin' || r.role === 'agent');
    
    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Agent or admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { callId, clientAvailability, appointmentType = 'general', medicalCenter = 'DCK Medical Center' } = await req.json();

    // Input validation
    if (!callId || typeof callId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid call ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof appointmentType !== 'string' || appointmentType.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Appointment type must be a string (max 100 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof medicalCenter !== 'string' || medicalCenter.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Medical center must be a string (max 200 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get call and client details
    const { data: callData, error: callError } = await supabaseAdmin
      .from('outbound_calls')
      .select(`
        id,
        client_id,
        campaign_id,
        clients (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('id', callId)
      .single();

    if (callError || !callData) {
      throw new Error('Call not found');
    }

    const client = callData.clients;
    if (!client) {
      throw new Error('Client not found');
    }

    // Parse availability (expecting array of date strings or date objects)
    let scheduledDate: string;
    
    if (clientAvailability && Array.isArray(clientAvailability) && clientAvailability.length > 0) {
      // Use the first available date
      scheduledDate = new Date(clientAvailability[0]).toISOString().split('T')[0];
    } else {
      // Default to next week if no availability provided
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      scheduledDate = nextWeek.toISOString().split('T')[0];
    }

    // Create medical appointment
    const { data: appointmentData, error: appointmentError } = await supabaseAdmin
      .from('medical_appointments')
      .insert({
        client_id: client.id,
        appointment_type: appointmentType,
        scheduled_date: scheduledDate,
        medical_center: medicalCenter,
        status: 'scheduled',
        notes: `Appointment scheduled via AI call campaign. Client availability: ${JSON.stringify(clientAvailability)}`
      })
      .select()
      .single();

    if (appointmentError) {
      throw new Error(`Failed to create appointment: ${appointmentError.message}`);
    }

    // Update call record with appointment outcome
    const { error: updateError } = await supabaseAdmin
      .from('outbound_calls')
      .update({
        outcome: 'appointment_scheduled',
        notes: `Medical appointment scheduled for ${scheduledDate} at ${medicalCenter}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', callId);

    if (updateError) {
      console.error('Failed to update call record:', updateError);
    }

    // Send appointment confirmation email
    if (client.email) {
      try {
        const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
        
        const appointmentDate = new Date(scheduledDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const emailResult = await resend.emails.send({
          from: 'DCK Medical Center <appointments@resend.dev>',
          to: [client.email],
          subject: 'Medical Appointment Confirmation - DCK Medical Center',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .appointment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669; }
                .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; border-bottom: 1px solid #eee; }
                .detail-label { font-weight: bold; color: #059669; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                .button { display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Appointment Confirmation</h1>
                  <p>Your medical appointment has been scheduled</p>
                </div>
                <div class="content">
                  <p>Dear ${client.name},</p>
                  <p>We're pleased to confirm your medical appointment has been successfully scheduled.</p>
                  
                  <div class="appointment-details">
                    <h3 style="color: #059669; margin-top: 0;">Appointment Details</h3>
                    <div class="detail-row">
                      <span class="detail-label">Patient Name:</span>
                      <span>${client.name}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Appointment Date:</span>
                      <span>${appointmentDate}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Appointment Type:</span>
                      <span>${appointmentType}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Medical Center:</span>
                      <span>${medicalCenter}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Status:</span>
                      <span>Confirmed</span>
                    </div>
                  </div>

                  <p><strong>Important Notes:</strong></p>
                  <ul>
                    <li>Please arrive 15 minutes before your scheduled appointment time</li>
                    <li>Bring a valid ID and insurance card</li>
                    <li>If you need to reschedule, please contact us at least 24 hours in advance</li>
                  </ul>

                  <p>If you have any questions or need to make changes to your appointment, please contact our office.</p>
                  
                  <div class="footer">
                    <p><strong>DCK Medical Center</strong></p>
                    <p>Phone: ${client.phone} | Email: appointments@dckmedical.com</p>
                    <p>Thank you for choosing DCK Medical Center for your healthcare needs.</p>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `
        });

        console.log('Appointment confirmation email sent:', emailResult);
      } catch (emailError) {
        console.error('Failed to send appointment confirmation email:', emailError);
        // Don't fail the entire operation if email fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Appointment scheduled successfully',
        appointment: appointmentData,
        scheduledDate,
        emailSent: !!client.email
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in appointment scheduler:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'An unexpected error occurred.',
        success: false 
      }),

      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});