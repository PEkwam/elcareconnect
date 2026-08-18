import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EscalationRequest {
  callId: string;
  clientName: string;
  clientPhone: string;
  waitTimeMinutes: number;
  callType: string;
  priority: string;
  notifyViaEmail?: boolean;
  notifyViaSms?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ---- Authn / Authz ----
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: isSup } = await admin.rpc("is_supervisor_or_admin", {
      _user_id: claimsData.claims.sub,
    });
    if (!isSup) return json({ error: "Forbidden" }, 403);

    const {
      callId,
      clientName,
      clientPhone,
      waitTimeMinutes,
      callType,
      priority,
      notifyViaEmail = true,
      notifyViaSms = false,
    }: EscalationRequest = await req.json();

    // ---- Pull trusted recipient lists from escalation_settings (do NOT trust client) ----
    const { data: settings } = await admin
      .from("escalation_settings")
      .select("supervisor_emails, supervisor_phones")
      .limit(1)
      .maybeSingle();

    const supervisorEmails: string[] = Array.isArray(settings?.supervisor_emails)
      ? (settings!.supervisor_emails as string[])
      : [];
    const supervisorPhones: string[] = Array.isArray(settings?.supervisor_phones)
      ? (settings!.supervisor_phones as string[])
      : [];

    const results: { email?: boolean; sms?: boolean } = {};

    if (notifyViaEmail && supervisorEmails.length > 0) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        try {
          await resend.emails.send({
            from: "VoiceLife Alerts <onboarding@resend.dev>",
            to: supervisorEmails,
            subject: `🚨 Call Escalation Alert - ${clientName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 20px; border-radius: 8px 8px 0 0;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Call Escalation Alert</h1>
                </div>
                <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                  <p>Client: <strong>${clientName}</strong></p>
                  <p>Phone: ${clientPhone}</p>
                  <p>Wait: ${waitTimeMinutes} min</p>
                  <p>Type: ${callType} — Priority: ${priority}</p>
                  <p>Call ID: ${callId}</p>
                </div>
              </div>
            `,
          });
          results.email = true;
        } catch (emailError) {
          console.error("Failed to send email:", emailError);
          results.email = false;
        }
      } else {
        results.email = false;
      }
    }

    if (notifyViaSms && supervisorPhones.length > 0) {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
      if (accountSid && authToken && fromPhone) {
        try {
          for (const phone of supervisorPhones) {
            await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
                },
                body: new URLSearchParams({
                  To: phone,
                  From: fromPhone,
                  Body: `🚨 ESCALATION: ${clientName} waiting ${waitTimeMinutes} min. Type: ${callType}, Priority: ${priority}.`,
                }),
              },
            );
          }
          results.sms = true;
        } catch (smsError) {
          console.error("Failed to send SMS:", smsError);
          results.sms = false;
        }
      } else {
        results.sms = false;
      }
    }

    return json({ success: true, message: "Escalation notifications processed", results });
  } catch (error) {
    console.error("Error in escalation notification:", error);
    return json({ success: false, error: "Failed to send notifications" }, 500);
  }
};

serve(handler);
