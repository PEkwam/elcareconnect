import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Realtime chat request received:', req.method, req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication before proceeding
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
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
      console.error('Authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Check for admin or agent role
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
      console.log('User lacks required role');
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin or agent role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authorized with role:', roles?.[0]?.role);

    const GOOGLE_CLOUD_API_KEY = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    console.log('Google Cloud API Key available:', !!GOOGLE_CLOUD_API_KEY);
    
    if (!GOOGLE_CLOUD_API_KEY) {
      console.error('GOOGLE_CLOUD_API_KEY environment variable is not set');
      return new Response(
        JSON.stringify({ error: 'Google Cloud API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if this is a WebSocket upgrade request
    const upgrade = req.headers.get("upgrade");
    console.log('Upgrade header:', upgrade);
    
    if (upgrade !== "websocket") {
      console.log('Not a WebSocket upgrade request');
      return new Response("Expected WebSocket connection", { 
        status: 400,
        headers: corsHeaders 
      });
    }

    console.log('Setting up text-based chat with Google Cloud API');
    
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let chatHistory: Array<{role: string, content: string}> = [];
    let sessionActive = false;

    socket.onopen = () => {
      console.log('Client WebSocket connected successfully');
      sessionActive = true;
      
      // Send session created event to mimic OpenAI format
      socket.send(JSON.stringify({
        type: 'session.created',
        session: {
          id: `session_${Date.now()}`,
          object: 'realtime.session',
          model: 'gemini-1.5-flash-latest'
        }
      }));
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Client message type:', data.type);
        
        if (!sessionActive) {
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Session not active'
          }));
          return;
        }

        // Handle text input messages
        if (data.type === 'conversation.item.create' && data.item?.content?.[0]?.type === 'input_text') {
          const userText = data.item.content[0].text;
          console.log('Processing text message:', userText);
          
          // Add to chat history
          chatHistory.push({ role: 'user', content: userText });
          
          // Call Google Cloud Gemini API
          try {
            const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GOOGLE_CLOUD_API_KEY}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: chatHistory.map(msg => ({
                  role: msg.role === 'user' ? 'user' : 'model',
                  parts: [{ text: msg.content }]
                })),
                systemInstruction: {
                  parts: [{ 
                    text: 'You are a helpful AI assistant for LifeVoice, an AI-powered calling service. You help users with premium payment reminders, appointment scheduling, and general inquiries. Be friendly, professional, and efficient. Always confirm important details before proceeding with any actions.'
                  }]
                },
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 1000
                }
              }),
            });

            if (!geminiResponse.ok) {
              throw new Error(`Google Cloud API error: ${await geminiResponse.text()}`);
            }

            const result = await geminiResponse.json();
            const assistantResponse = result.candidates[0].content.parts[0].text;
            
            // Add to chat history
            chatHistory.push({ role: 'assistant', content: assistantResponse });
            
            // Send response back to client in OpenAI format
            socket.send(JSON.stringify({
              type: 'response.created',
              response: {
                id: `resp_${Date.now()}`,
                object: 'realtime.response'
              }
            }));

            // Send text response
            socket.send(JSON.stringify({
              type: 'response.text.delta',
              delta: assistantResponse
            }));

            socket.send(JSON.stringify({
              type: 'response.text.done'
            }));

            socket.send(JSON.stringify({
              type: 'response.done'
            }));

          } catch (error) {
            console.error('Error calling Google Cloud API:', error);
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Failed to get AI response'
            }));
          }
        }
        
        // Handle audio input (not supported in this Google Cloud implementation)
        if (data.type === 'input_audio_buffer.append') {
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Audio input not supported with Google Cloud API'
          }));
        }
        
      } catch (error) {
        console.error('Error parsing client message:', error);
      }
    };

    socket.onerror = (error) => {
      console.error('Client WebSocket error:', error);
    };

    socket.onclose = (event) => {
      console.log('Client WebSocket disconnected:', event.code, event.reason);
      sessionActive = false;
      chatHistory = [];
    };

    return response;

  } catch (error) {
    console.error('Critical error in realtime chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred. Please try again or contact support.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});