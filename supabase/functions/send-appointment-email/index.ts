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

    // Initialize Supabase admin client
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

    const { appointmentId } = await req.json();

    // Input validation
    if (!appointmentId || typeof appointmentId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid appointment ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get appointment and client details
    const { data: appointmentData, error: appointmentError } = await supabaseAdmin
      .from('medical_appointments')
      .select(`
        id,
        scheduled_date,
        appointment_type,
        medical_center,
        status,
        client_id,
        clients (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointmentData) {
      return new Response(
        JSON.stringify({ error: 'Appointment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const client = appointmentData.clients;
    if (!client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!client.email) {
      return new Response(
        JSON.stringify({ error: 'Client email not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format appointment date
    const appointmentDate = new Date(appointmentData.scheduled_date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Send appointment confirmation email
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    
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
                  <span>${appointmentData.appointment_type}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Medical Center:</span>
                  <span>${appointmentData.medical_center}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Status:</span>
                  <span>${appointmentData.status === 'scheduled' ? 'Confirmed' : appointmentData.status}</span>
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

    console.log('Appointment confirmation email sent successfully:', emailResult);

    // Update client record
    await supabaseAdmin
      .from('clients')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', client.id);

    // Log the email sent
    await supabaseAdmin
      .from('customer_notes')
      .insert({
        client_id: client.id,
        content: `Appointment confirmation email sent for ${appointmentData.appointment_type} on ${appointmentDate} at ${appointmentData.medical_center}`,
        note_type: 'email',
        agent_email: user.email || 'system@dck.com'
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Appointment confirmation email sent successfully',
        emailId: emailResult.data?.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in send-appointment-email:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to send appointment email',
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
