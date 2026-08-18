import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication and role-based access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Check for admin or agent role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      return new Response(
        JSON.stringify({ error: 'Error checking permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasPermission = roles?.some(r => r.role === 'admin' || r.role === 'agent');
    if (!hasPermission) {
      console.log('User lacks required role. User roles:', roles);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin or agent role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authorized with role:', roles?.[0]?.role);

    const { clientId, policyNumber, context } = await req.json();

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating AI note for client:', clientId, 'policy:', policyNumber);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Fetch client data
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError) {
      console.error('Error fetching client:', clientError);
      throw new Error('Client not found');
    }

    // Fetch recent call history
    const { data: recentCalls } = await supabaseAdmin
      .from('outbound_calls')
      .select('call_status, outcome, call_duration, notes, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Create context for AI
    const systemPrompt = `You are an AI assistant analyzing insurance policy and client data. 
Generate a concise, professional note about the client's policy status based on the provided information.
Focus on payment status, recent call outcomes, and any important observations.
Keep the note under 200 words and make it actionable for customer service agents.`;

    const userPrompt = `Client Information:
- Name: ${client.name}
- Policy Number: ${client.policy_number || 'N/A'}
- Payment Status: ${client.payment_status}
- Premium Amount: $${client.premium_amount || 'N/A'}
- Premium Due Date: ${client.premium_due_date || 'N/A'}
- Last Payment: ${client.last_payment_date || 'Never'}

Recent Call History:
${recentCalls?.map(call => `- Status: ${call.call_status}, Outcome: ${call.outcome || 'N/A'}, Duration: ${call.call_duration || 0}s`).join('\n') || 'No recent calls'}

${context ? `Additional Context: ${context}` : ''}

Generate a professional note summarizing the policy status and any recommended actions.`;

    console.log('Calling Lovable AI...');
    
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add funds to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const generatedNote = aiData.choices[0].message.content;

    console.log('AI note generated, saving to database...');

    // Save the AI-generated note to customer_notes
    const { data: note, error: noteError } = await supabaseAdmin
      .from('customer_notes')
      .insert({
        client_id: clientId,
        content: generatedNote,
        note_type: 'policy_analysis',
        agent_email: user.email || 'ai-assistant@system.com',
        is_emergency: false,
      })
      .select()
      .single();

    if (noteError) {
      console.error('Error saving note:', noteError);
      throw new Error('Failed to save note');
    }

    console.log('AI note saved successfully:', note.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        note: generatedNote,
        noteId: note.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-policy-notes function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while generating the policy note. Please try again or contact support.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
