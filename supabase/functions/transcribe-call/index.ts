import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { callId, audioData } = await req.json();
    
    if (!callId) {
      return new Response(
        JSON.stringify({ error: "Call ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // If audio data is provided, transcribe it using Lovable AI
    if (audioData) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      
      if (!LOVABLE_API_KEY) {
        console.error("LOVABLE_API_KEY not configured");
        return new Response(
          JSON.stringify({ error: "Transcription service not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use AI to generate a simulated transcription for demo purposes
      // In production, you would integrate with a real speech-to-text service
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You are simulating a call center conversation transcription. Generate a realistic snippet of dialogue that might occur during a customer service call about insurance. Keep it brief (1-2 sentences). Alternate between agent and customer perspectives."
            },
            {
              role: "user",
              content: "Generate the next line of the call transcript."
            }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI API error:", errorText);
        throw new Error("Failed to generate transcription");
      }

      const aiResult = await response.json();
      const transcript = aiResult.choices?.[0]?.message?.content || "";
      
      // Randomly assign speaker
      const speaker = Math.random() > 0.5 ? "agent" : "customer";
      
      // Get current call duration for timestamp
      const { data: callData } = await supabase
        .from("outbound_calls")
        .select("started_at")
        .eq("id", callId)
        .single();
      
      let timestampSeconds = 0;
      if (callData?.started_at) {
        timestampSeconds = Math.floor((Date.now() - new Date(callData.started_at).getTime()) / 1000);
      }

      // Save transcription to database
      const { data, error } = await supabase
        .from("call_transcriptions")
        .insert({
          call_id: callId,
          transcript: transcript,
          is_partial: false,
          speaker: speaker,
          timestamp_seconds: timestampSeconds,
          confidence: 0.85 + Math.random() * 0.15, // Simulated confidence
        })
        .select()
        .single();

      if (error) {
        console.error("Error saving transcription:", error);
        throw error;
      }

      console.log("Transcription saved:", data);

      return new Response(
        JSON.stringify({ success: true, transcription: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If no audio data, just acknowledge the transcription session start
    console.log("Transcription session started for call:", callId);
    
    return new Response(
      JSON.stringify({ success: true, message: "Transcription session initialized" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: "Transcription failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
