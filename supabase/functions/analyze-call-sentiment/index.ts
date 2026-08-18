import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
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

    const { callId } = await req.json();

    if (!callId) {
      return new Response(
        JSON.stringify({ error: 'Call ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch call details
    const { data: call, error: callError } = await supabaseClient
      .from('outbound_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return new Response(
        JSON.stringify({ error: 'Call not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analyze sentiment using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const analysisText = `Call Notes: ${call.notes || 'No notes'}
Call Outcome: ${call.outcome || 'Unknown'}
Call Duration: ${call.call_duration || 0} seconds`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a sentiment analysis expert for call center conversations. Analyze the call data and respond with a JSON object containing:
{
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": number between 0 and 1,
  "escalation_flagged": boolean,
  "summary": "brief summary of the call"
}

Guidelines:
- positive: Customer satisfied, issue resolved, payment agreed
- neutral: Informational call, no strong emotion
- negative: Customer frustrated, issue unresolved, conflict
- escalation_flagged: true if customer angry, threatening, or issue requires manager attention
- sentiment_score: 1 = very positive, 0.5 = neutral, 0 = very negative`
          },
          {
            role: 'user',
            content: analysisText
          }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    const analysis = JSON.parse(aiData.choices[0].message.content);

    // Update call with sentiment analysis
    const { error: updateError } = await supabaseClient
      .from('outbound_calls')
      .update({
        sentiment: analysis.sentiment,
        sentiment_score: analysis.sentiment_score,
        escalation_flagged: analysis.escalation_flagged,
        ai_summary: analysis.summary
      })
      .eq('id', callId);

    if (updateError) {
      throw new Error('Failed to update call');
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-call-sentiment:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while analyzing sentiment. Please try again or contact support.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});