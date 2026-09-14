// Temporary self-test for the natural voice pipeline. Removed after verification.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { naturalizeTwiml } from "../_shared/voice.ts";

serve(async () => {
  const out = await naturalizeTwiml(
    '<Response><Say voice="Polly.Joanna-Neural">Dear Kwame, your premium of 250 cedis is due on Friday.</Say></Response>',
  );
  return new Response(out, { headers: { "Content-Type": "text/xml" } });
});
