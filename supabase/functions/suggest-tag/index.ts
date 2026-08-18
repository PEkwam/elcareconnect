import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Require staff JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: isStaff } = await adminClient.rpc('is_staff', { _user_id: claimsData.claims.sub });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { description } = await req.json();
    if (!description || typeof description !== 'string' || description.length > 300) {
      return new Response(JSON.stringify({ error: 'Invalid description' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'You generate placeholder tags for campaign scripts. Return a compact JSON object only: {"key":"snake_case","label":"Title Case","description":"short","example":"sample value","category":"client|billing|agent|appointment|general"}. The key must be lowercase snake_case, max 30 chars, no spaces.',
          },
          { role: 'user', content: `Describe a tag: ${description}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error('AI gateway error:', aiRes.status, t);
      return new Response(JSON.stringify({ error: 'Unable to suggest tag right now' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiRes.json();
    let parsed: any;
    try {
      parsed = JSON.parse(aiJson.choices?.[0]?.message?.content ?? '{}');
    } catch {
      parsed = {};
    }

    const key = String(parsed.key || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);

    if (!key) {
      return new Response(JSON.stringify({ error: 'Could not infer a valid tag key' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = adminClient;

    const { data: existing } = await supabase
      .from('campaign_tags')
      .select('*')
      .eq('key', key)
      .maybeSingle();


    if (existing) {
      return new Response(JSON.stringify({ tag: existing, reused: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const row = {
      key,
      label: String(parsed.label || key).slice(0, 60),
      description: String(parsed.description || description).slice(0, 200),
      example: parsed.example ? String(parsed.example).slice(0, 100) : null,
      category: ['client', 'billing', 'agent', 'appointment', 'general'].includes(parsed.category)
        ? parsed.category
        : 'general',
    };

    const { data: inserted, error } = await supabase
      .from('campaign_tags')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      return new Response(JSON.stringify({ error: 'Could not save tag' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ tag: inserted, reused: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('suggest-tag error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
