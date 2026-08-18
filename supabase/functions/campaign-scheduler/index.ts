import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    // Check if user has admin role (only admins can schedule campaigns)
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = roles?.some(r => r.role === 'admin' || r.role === 'super_admin');
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required to schedule campaigns' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { campaignId, immediate = false } = await req.json();

    // Input validation
    if (!campaignId || typeof campaignId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid campaign ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof immediate !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'Immediate flag must be a boolean' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('call_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('is_active', true)
      .single();

    if (campaignError) throw campaignError;
    if (!campaign) throw new Error('Campaign not found or inactive');

    console.log('Executing campaign:', campaign.name, campaign.type);

    // PREFERRED PATH: use clients explicitly assigned to this campaign via campaign_clients
    const { data: assignedRows, error: assignedErr } = await supabaseAdmin
      .from('campaign_clients')
      .select('client_id, clients:client_id (*)')
      .eq('campaign_id', campaignId);

    if (assignedErr) console.warn('campaign_clients lookup failed:', assignedErr.message);

    const assignedClients = (assignedRows || [])
      .map((r: any) => r.clients)
      .filter((c: any) => c && c.phone);

    if (assignedClients.length > 0) {
      const callsToCreate = assignedClients.map((client: any, index: number) => ({
        client_id: client.id,
        campaign_id: campaignId,
        phone_number: client.phone,
        call_status: 'scheduled',
        scheduled_at: immediate
          ? new Date().toISOString()
          : new Date(Date.now() + index * 300000).toISOString(),
      }));

      const { data: createdCalls, error: insertError } = await supabaseAdmin
        .from('outbound_calls')
        .insert(callsToCreate)
        .select('id');

      if (insertError) throw insertError;

      if (immediate && createdCalls) {
        console.log(`Auto-dialing ${createdCalls.length} assigned clients...`);
        for (const call of createdCalls) {
          EdgeRuntime.waitUntil(
            fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ callId: call.id }),
            }).catch((e) => console.error(`Auto-dial failed for ${call.id}:`, e))
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `${callsToCreate.length} assigned client(s) ${immediate ? 'are being called now' : 'scheduled'}.`,
          callsCreated: callsToCreate.length,
          immediate,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // FALLBACK: no explicit assignments — target clients based on campaign type
    let clientQuery = supabaseAdmin.from('clients').select('*');
    
    switch (campaign.type) {
      case 'premium_reminder':
        clientQuery = clientQuery.in('payment_status', ['overdue', 'failed']);
        break;
      case 'failed_deduction':
        clientQuery = clientQuery.eq('payment_status', 'failed');
        break;
      case 'medical_booking':
        // Target clients who need medical appointments (no recent appointments)
        const { data: clientsWithoutAppointments } = await supabaseAdmin
          .from('clients')
          .select(`
            *,
            medical_appointments!left (
              id,
              scheduled_date,
              status
            )
          `)
          .is('medical_appointments.id', null)
          .or('medical_appointments.status.eq.completed,medical_appointments.status.eq.cancelled', { foreignTable: 'medical_appointments' });
        
        if (clientsWithoutAppointments) {
          // Create calls for these clients directly
          const callsToCreate = clientsWithoutAppointments.map(client => ({
            client_id: client.id,
            campaign_id: campaignId,
            phone_number: client.phone,
            call_status: 'scheduled',
            scheduled_at: immediate ? new Date().toISOString() : 
              new Date(Date.now() + Math.random() * 3600000).toISOString() // Random within 1 hour
          }));

          const { error: insertError } = await supabaseAdmin
            .from('outbound_calls')
            .insert(callsToCreate);

          if (insertError) throw insertError;

          // Auto-execute calls if immediate
          if (immediate) {
            for (const call of callsToCreate) {
              const { data: createdCall } = await supabaseAdmin
                .from('outbound_calls')
                .select('id')
                .eq('client_id', call.client_id)
                .eq('campaign_id', campaignId)
                .eq('call_status', 'scheduled')
                .single();

              if (createdCall) {
                // Trigger AI call
                EdgeRuntime.waitUntil(
                  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ callId: createdCall.id })
                  })
                );
              }
            }
          }

          return new Response(
            JSON.stringify({ 
              success: true,
              message: `Campaign scheduled for ${callsToCreate.length} clients`,
              callsCreated: callsToCreate.length
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;
      default:
        // For other campaign types, get all clients
        break;
    }

    // Get clients for standard campaigns
    const { data: clients, error: clientsError } = await clientQuery;
    
    if (clientsError) throw clientsError;
    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No eligible clients found for this campaign',
          callsCreated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${clients.length} eligible clients for campaign`);

    // Create outbound calls for each client
    const callsToCreate = clients.map((client, index) => ({
      client_id: client.id,
      campaign_id: campaignId,
      phone_number: client.phone,
      call_status: 'scheduled',
      // Stagger calls over time if not immediate
      scheduled_at: immediate ? new Date().toISOString() : 
        new Date(Date.now() + (index * 300000)).toISOString() // 5 minutes apart
    }));

    const { data: createdCalls, error: insertError } = await supabaseAdmin
      .from('outbound_calls')
      .insert(callsToCreate)
      .select('id');

    if (insertError) throw insertError;

    // If immediate execution, trigger AI calls
    if (immediate && createdCalls) {
      console.log('Triggering immediate AI calls...');
      
      for (const call of createdCalls) {
        // Use background task to not block response
        EdgeRuntime.waitUntil(
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ callId: call.id })
          }).then(response => {
            console.log(`AI call triggered for ${call.id}:`, response.status);
          }).catch(error => {
            console.error(`Failed to trigger AI call for ${call.id}:`, error);
          })
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Campaign executed successfully. ${callsToCreate.length} calls ${immediate ? 'started' : 'scheduled'}.`,
        callsCreated: callsToCreate.length,
        immediate
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in campaign scheduler:', error);
    
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