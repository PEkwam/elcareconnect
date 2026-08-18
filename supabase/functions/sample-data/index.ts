import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Admin-only
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: claimsData.claims.sub });
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    const sampleClients = [
      { name: "John Smith", email: "john.smith@email.com", phone: "+1234567890", policy_number: "POL001", premium_amount: 299.99, premium_due_date: "2024-09-15", payment_status: "overdue" },
      { name: "Sarah Johnson", email: "sarah.johnson@email.com", phone: "+1234567891", policy_number: "POL002", premium_amount: 450.00, premium_due_date: "2024-09-20", payment_status: "failed" },
      { name: "Michael Brown", email: "michael.brown@email.com", phone: "+1234567892", policy_number: "POL003", premium_amount: 199.99, premium_due_date: "2024-10-01", payment_status: "current" },
      { name: "Emily Davis", email: "emily.davis@email.com", phone: "+1234567893", policy_number: "POL004", premium_amount: 349.99, premium_due_date: "2024-08-30", payment_status: "overdue" },
      { name: "David Wilson", email: "david.wilson@email.com", phone: "+1234567894", policy_number: "POL005", premium_amount: 525.00, premium_due_date: "2024-09-25", payment_status: "failed" },
    ];

    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients').insert(sampleClients).select();
    if (clientsError) console.log('Clients may already exist');

    const { data: campaigns } = await supabaseAdmin.from('call_campaigns').select('*');

    if (clients && clients.length > 0 && campaigns && campaigns.length > 0) {
      const sampleMedicals = [
        { client_id: clients[0].id, appointment_type: "Annual Health Check", status: "pending", notes: "Required for policy renewal" },
        { client_id: clients[2].id, appointment_type: "Eye Examination", status: "pending", notes: "Vision coverage requirement" },
        { client_id: clients[3].id, appointment_type: "Blood Test", scheduled_date: "2024-09-30", status: "scheduled", medical_center: "City Medical Lab" },
      ];
      const { error: medicalsError } = await supabaseAdmin.from('medical_appointments').insert(sampleMedicals);
      if (medicalsError) console.log('Medical appointments may already exist');

      const sampleCalls = [
        { client_id: clients[0].id, campaign_id: campaigns.find(c => c.type === 'premium_reminder')?.id, phone_number: clients[0].phone, call_status: "scheduled", scheduled_at: new Date().toISOString() },
        { client_id: clients[1].id, campaign_id: campaigns.find(c => c.type === 'failed_deduction')?.id, phone_number: clients[1].phone, call_status: "completed", outcome: "callback_requested", call_duration: 85, notes: "Client requested callback tomorrow", scheduled_at: new Date(Date.now() - 86400000).toISOString(), started_at: new Date(Date.now() - 86400000 + 300000).toISOString(), ended_at: new Date(Date.now() - 86400000 + 385000).toISOString() },
        { client_id: clients[3].id, campaign_id: campaigns.find(c => c.type === 'medical_booking')?.id, phone_number: clients[3].phone, call_status: "completed", outcome: "appointment_scheduled", call_duration: 142, notes: "Appointment scheduled for next week", scheduled_at: new Date(Date.now() - 172800000).toISOString(), started_at: new Date(Date.now() - 172800000 + 600000).toISOString(), ended_at: new Date(Date.now() - 172800000 + 742000).toISOString() },
      ];
      const { error: callsError } = await supabaseAdmin.from('outbound_calls').insert(sampleCalls);
      if (callsError) console.log('Calls may already exist');
    }

    return json({
      message: 'Sample data created successfully',
      clients: clients?.length || 0,
      campaigns: campaigns?.length || 0,
    });
  } catch (error) {
    console.error('Error creating sample data:', error);
    return json({ error: 'An unexpected error occurred.' }, 500);
  }
});
