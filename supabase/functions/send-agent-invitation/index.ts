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

    // Admin-only authn
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: claimsData.claims.sub });
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    const callerEmail = (claimsData.claims.email as string | undefined) ?? '';

    const { email, invitedBy } = await req.json();
    if (!email || typeof email !== 'string') return json({ error: 'Email is required' }, 400);

    // Force invitedBy to caller identity — never trust client
    const safeInvitedBy = callerEmail || (typeof invitedBy === 'string' ? invitedBy : 'An administrator');

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return json({ error: 'Email service not configured' }, 500);
    }

    const appUrl = 'https://dckcalls.lovable.app';
    const emailHtml = `
      <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333">
        <div style="max-width:600px;margin:0 auto;padding:20px">
          <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:30px;text-align:center;border-radius:8px 8px 0 0">
            <h1>🎉 Welcome to the Team!</h1>
          </div>
          <div style="background:#f9fafb;padding:30px;border-radius:0 0 8px 8px">
            <h2>You've Been Added as an Agent</h2>
            <p>${safeInvitedBy} has added you as an agent to Care Connect.</p>
            <a href="${appUrl}" style="display:inline-block;background:#667eea;color:#fff;padding:12px 30px;text-decoration:none;border-radius:6px;margin:20px 0">Log In to Dashboard</a>
            <p>If you don't have an account yet, please sign up using this email address.</p>
          </div>
        </div>
      </body></html>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Care Connect <onboarding@resend.dev>',
        to: email,
        subject: "You've Been Added as an Agent",
        html: emailHtml,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Resend API error:', data);
      return json({ error: 'Failed to send invitation' }, 502);
    }

    return json({ success: true, messageId: data.id });
  } catch (error) {
    console.error('Error in send-agent-invitation:', error);
    return json({ error: 'An unexpected error occurred.' }, 500);
  }
});
