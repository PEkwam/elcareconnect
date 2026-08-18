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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: isStaff } = await adminClient.rpc('is_staff', { _user_id: user.id });
    if (!isStaff) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    const { callType, priority, clientId } = await req.json();

    if (!callType) {
      return new Response(
        JSON.stringify({ error: 'Call type is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all available agents
    const { data: agents, error: agentsError } = await supabaseClient
      .from('agent_status')
      .select('*')
      .eq('status', 'available');

    if (agentsError || !agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false,
          message: 'No agents available',
          recommended_agent: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch agent skills
    const { data: skills, error: skillsError } = await supabaseClient
      .from('agent_skills')
      .select('*');

    // Calculate best agent
    const agentScores = agents.map(agent => {
      let score = 0;
      
      // Skill match (highest priority)
      const agentSkills = skills?.filter(s => s.agent_email === agent.agent_email) || [];
      const matchingSkill = agentSkills.find(s => s.skill_type === callType);
      if (matchingSkill) {
        score += matchingSkill.proficiency_level * 30; // 0-150 points
      }

      // Success rate
      if (agent.success_rate) {
        score += agent.success_rate * 50; // 0-50 points
      } else {
        score += 25; // Default for new agents
      }

      // Lower workload is better
      const callsHandled = agent.total_calls_handled || 0;
      if (callsHandled < 50) {
        score += 20; // New agent bonus
      } else {
        score += Math.max(0, 20 - (callsHandled / 100)); // Decrease as workload increases
      }

      // Resolution time (lower is better)
      if (agent.avg_resolution_time_minutes) {
        const resolutionScore = Math.max(0, 30 - (agent.avg_resolution_time_minutes / 10));
        score += resolutionScore;
      } else {
        score += 15; // Default for agents without history
      }

      return {
        agent_email: agent.agent_email,
        score,
        has_skill: !!matchingSkill,
        proficiency: matchingSkill?.proficiency_level || 0,
        success_rate: agent.success_rate || 0,
        total_calls: agent.total_calls_handled || 0
      };
    });

    // Sort by score (highest first)
    agentScores.sort((a, b) => b.score - a.score);

    const bestAgent = agentScores[0];

    return new Response(
      JSON.stringify({
        success: true,
        recommended_agent: bestAgent.agent_email,
        score: bestAgent.score,
        reasoning: {
          has_matching_skill: bestAgent.has_skill,
          proficiency_level: bestAgent.proficiency,
          success_rate: bestAgent.success_rate,
          total_calls_handled: bestAgent.total_calls
        },
        alternative_agents: agentScores.slice(1, 4).map(a => ({
          agent_email: a.agent_email,
          score: a.score
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in smart-call-routing:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred during call routing. Please try again or contact support.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});