import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    // Check if user has admin or agent role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

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
    const chatRequestSchema = z.object({
      message: z.string().trim().min(1).max(2000, { message: 'Message must be between 1 and 2000 characters' }),
      agentEmail: z.string().email({ message: 'Invalid email format' }),
    });

    const requestBody = await req.json();
    const validationResult = chatRequestSchema.safeParse(requestBody);
    
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input', 
          details: validationResult.error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { message, agentEmail } = validationResult.data;

    console.log('Officer chat request:', { message, agentEmail });

    // Get relevant knowledge base articles
    const { data: knowledgeArticles } = await supabaseAdmin
      .from('knowledge_base')
      .select('*')
      .limit(5);

    // Get recent customer notes for context
    const { data: recentNotes } = await supabaseAdmin
      .from('customer_notes')
      .select('content, note_type, created_at')
      .order('created_at', { ascending: false })
      .limit(3);

    // Build context for AI
    const knowledgeContext = knowledgeArticles?.map(kb => 
      `${kb.title} (${kb.category}): ${kb.content}`
    ).join('\n\n') || '';

    const notesContext = recentNotes?.map(note => 
      `[${note.note_type}] ${note.content}`
    ).join('\n') || '';

    const systemPrompt = `You are an AI assistant for DCK Medical insurance officers. Help them with:
- Policy information and procedures
- Client management guidance
- Emergency protocols
- General administrative questions

Knowledge Base:
${knowledgeContext}

Recent Activity Context:
${notesContext}

Provide clear, professional responses. If you don't know something, say so and suggest they check the knowledge base or contact a supervisor.`;

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (aiResponse.status === 402) {
        throw new Error('AI service requires payment. Please contact your administrator.');
      }
      throw new Error(`AI service error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiMessage = aiData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

    console.log('AI response generated successfully');

    return new Response(
      JSON.stringify({ 
        response: aiMessage,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in officer-chat:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred while processing your chat request. Please try again or contact support.' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
