import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@4.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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

    // Input validation schema
    const paymentEmailSchema = z.object({
      clientId: z.string().uuid({ message: 'Invalid client ID format' }),
      emailType: z.enum(['payment', 'billing_mandate'], { 
        errorMap: () => ({ message: 'Email type must be either "payment" or "billing_mandate"' }) 
      }).default('payment'),
      amount: z.number().positive({ message: 'Amount must be a positive number' }).optional(),
      dueDate: z.string().optional(),
    });

    const requestBody = await req.json();
    const validationResult = paymentEmailSchema.safeParse(requestBody);
    
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input', 
          details: validationResult.error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { clientId, emailType, amount, dueDate } = validationResult.data;

    // Get client details
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      throw new Error('Client not found');
    }

    if (!client.email) {
      throw new Error('Client email not available');
    }

    // Initialize Resend
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    
    // Generate payment link (in real implementation, this would be a secure payment gateway link)
    const paymentLink = `https://payments.dck.com/pay?client=${client.id}&amount=${amount || client.premium_amount}&policy=${client.policy_number}`;
    
    // Create email content based on type
    let subject: string;
    let htmlContent: string;

    if (emailType === 'payment') {
      subject = `Payment Due - Policy ${client.policy_number}`;
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #dc2626, #ef4444); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .payment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626; }
            .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; border-bottom: 1px solid #eee; }
            .detail-label { font-weight: bold; color: #dc2626; }
            .payment-button { display: inline-block; background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .urgent { background: #fef2f2; border: 2px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Reminder</h1>
              <p>Your premium payment is due</p>
            </div>
            <div class="content">
              <p>Dear ${client.name},</p>
              <p>This is a friendly reminder that your insurance premium payment is due.</p>
              
              <div class="payment-details">
                <h3 style="color: #dc2626; margin-top: 0;">Payment Details</h3>
                <div class="detail-row">
                  <span class="detail-label">Policy Number:</span>
                  <span>${client.policy_number}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Amount Due:</span>
                  <span>$${amount || client.premium_amount}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Due Date:</span>
                  <span>${dueDate || new Date(client.premium_due_date).toLocaleDateString()}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Payment Status:</span>
                  <span>${client.payment_status}</span>
                </div>
              </div>

              <div class="urgent">
                <p><strong>⚠️ Action Required:</strong> Please make your payment by the due date to avoid policy cancellation.</p>
              </div>

              <div style="text-align: center;">
                <a href="${paymentLink}" class="payment-button">Make Payment Now</a>
              </div>

              <p><strong>Payment Options:</strong></p>
              <ul>
                <li>Online payment using the link above</li>
                <li>Call our customer service at (555) 123-4567</li>
                <li>Mail a check to our payment processing center</li>
                <li>Set up automatic billing for future convenience</li>
              </ul>

              <p>If you have already made this payment, please disregard this notice. If you have any questions about your policy or payment, please contact our customer service team.</p>
              
              <div class="footer">
                <p><strong>DCK Insurance Company</strong></p>
                <p>Phone: (555) 123-4567 | Email: payments@dckinsurance.com</p>
                <p>Thank you for choosing DCK Insurance for your coverage needs.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
    } else if (emailType === 'billing_mandate') {
      subject = `Billing Mandate Setup - Policy ${client.policy_number}`;
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .mandate-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669; }
            .setup-button { display: inline-block; background: #059669; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .benefits { background: #f0fdf4; border-radius: 8px; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Set Up Automatic Billing</h1>
              <p>Never miss a payment again</p>
            </div>
            <div class="content">
              <p>Dear ${client.name},</p>
              <p>Make your life easier by setting up automatic billing for your insurance premium payments.</p>
              
              <div class="benefits">
                <h3 style="color: #059669; margin-top: 0;">Benefits of Automatic Billing:</h3>
                <ul>
                  <li>✅ Never miss a payment deadline</li>
                  <li>✅ No more manual payment reminders</li>
                  <li>✅ Secure and convenient</li>
                  <li>✅ Cancel anytime</li>
                  <li>✅ Peace of mind with continuous coverage</li>
                </ul>
              </div>

              <div class="mandate-details">
                <h3 style="color: #059669; margin-top: 0;">Your Policy Details</h3>
                <p><strong>Policy Number:</strong> ${client.policy_number}</p>
                <p><strong>Monthly Premium:</strong> $${client.premium_amount}</p>
                <p><strong>Current Status:</strong> ${client.payment_status}</p>
              </div>

              <div style="text-align: center;">
                <a href="${paymentLink}" class="setup-button">Set Up Automatic Billing</a>
              </div>

              <p><strong>How it works:</strong></p>
              <ol>
                <li>Click the link above to access our secure billing setup</li>
                <li>Choose your preferred payment method (bank account or credit card)</li>
                <li>Select your payment date preference</li>
                <li>Review and confirm your setup</li>
              </ol>

              <p>Your first automatic payment will be processed on your next due date. You'll receive a confirmation email once the setup is complete.</p>
              
              <div class="footer">
                <p><strong>DCK Insurance Company</strong></p>
                <p>Phone: (555) 123-4567 | Email: billing@dckinsurance.com</p>
                <p>Secure, reliable insurance coverage you can count on.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Send email
    const emailResult = await resend.emails.send({
      from: 'DCK Insurance <billing@resend.dev>',
      to: [client.email],
      subject: subject,
      html: htmlContent
    });

    console.log('Payment email sent successfully:', emailResult);

    // Update client record with payment link
    await supabaseAdmin
      .from('clients')
      .update({ 
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId);

    // Log the email sending activity
    await supabaseAdmin
      .from('customer_notes')
      .insert({
        client_id: clientId,
        content: `${emailType === 'payment' ? 'Payment reminder' : 'Billing mandate setup'} email sent to ${client.email}`,
        note_type: 'email',
        agent_email: 'system@dck.com'
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Email sent successfully',
        emailSent: true,
        paymentLink
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in send-payment-email:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred while sending the payment email. Please try again or contact support.',
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});