import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioRecorder, encodeAudioForAPI, playAudioData, clearAudioQueue } from '@/utils/audioUtils';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UseRealtimeChatProps {
  onConnectionChange?: (connected: boolean) => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

export const useRealtimeChat = ({ onConnectionChange, onSpeakingChange }: UseRealtimeChatProps = {}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionCreatedRef = useRef(false);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('Already connected');
      return;
    }

    try {
      console.log('Connecting to realtime chat...');
      
      // Use the full URL to the edge function
      const wsUrl = `wss://prtvithyqpepdyaglzpg.functions.supabase.co/functions/v1/realtime-chat`;
      console.log('Connecting to:', wsUrl);
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        onConnectionChange?.(true);
      };

      wsRef.current.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received message type:', data.type);

          switch (data.type) {
            case 'session.created':
              console.log('Session created successfully');
              sessionCreatedRef.current = true;
              break;

            case 'session.updated':
              console.log('Session updated successfully');
              break;

            case 'error':
              console.error('WebSocket error from server:', data.message);
              if (data.message?.includes('OPENAI_API_KEY')) {
                throw new Error('OpenAI API key not configured. Please check your environment variables.');
              }
              break;

            case 'response.audio.delta':
              if (data.delta) {
                // Convert base64 to Uint8Array
                const binaryString = atob(data.delta);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                
                if (audioContextRef.current) {
                  await playAudioData(audioContextRef.current, bytes);
                  setIsSpeaking(true);
                  onSpeakingChange?.(true);
                }
              }
              break;

            case 'response.audio.done':
              console.log('Audio response completed');
              setIsSpeaking(false);
              onSpeakingChange?.(false);
              break;

            case 'response.audio_transcript.delta':
              if (data.delta) {
                setCurrentTranscript(prev => prev + data.delta);
              }
              break;

            case 'response.audio_transcript.done':
              if (currentTranscript) {
                setMessages(prev => [...prev, {
                  id: Date.now().toString(),
                  type: 'assistant',
                  content: currentTranscript,
                  timestamp: new Date()
                }]);
                setCurrentTranscript('');
              }
              break;

            case 'conversation.item.input_audio_transcription.completed':
              if (data.transcript) {
                setMessages(prev => [...prev, {
                  id: Date.now().toString(),
                  type: 'user',
                  content: data.transcript,
                  timestamp: new Date()
                }]);
              }
              break;

            case 'response.function_call_arguments.done':
              console.log('Function call completed:', data.arguments);
              // Handle function calls here if needed
              break;

            case 'error':
              console.error('WebSocket error:', data.message);
              break;

            default:
              console.log('Unhandled message type:', data.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket connection error:', error);
        console.error('WebSocket state:', wsRef.current?.readyState);
        setIsConnected(false);
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed - Code:', event.code, 'Reason:', event.reason);
        console.log('Was clean closure:', event.wasClean);
        setIsConnected(false);
        setIsRecording(false);
        sessionCreatedRef.current = false;
        onConnectionChange?.(false);
        
        // Provide specific error messages based on close codes
        if (event.code === 1006) {
          console.error('WebSocket closed abnormally - likely server connection issue');
        } else if (event.code === 1011) {
          console.error('WebSocket closed due to server error');
        }
      };

    } catch (error) {
      console.error('Error connecting to realtime chat:', error);
      setIsConnected(false);
      throw error;
    }
  }, [onConnectionChange, onSpeakingChange, currentTranscript]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting from realtime chat...');
    
    // Stop recording
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      audioRecorderRef.current = null;
    }
    
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Clear audio queue
    clearAudioQueue();
    
    setIsConnected(false);
    setIsRecording(false);
    setIsSpeaking(false);
    sessionCreatedRef.current = false;
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    if (!sessionCreatedRef.current) {
      console.error('Session not ready');
      return;
    }

    try {
      console.log('Starting recording...');
      
      audioRecorderRef.current = new AudioRecorder((audioData) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const encodedAudio = encodeAudioForAPI(audioData);
          wsRef.current.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: encodedAudio
          }));
        }
      });

      await audioRecorderRef.current.start();
      setIsRecording(true);
      
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    console.log('Stopping recording...');
    
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      audioRecorderRef.current = null;
    }
    
    setIsRecording(false);
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    if (!sessionCreatedRef.current) {
      console.error('Session not ready');
      return;
    }

    console.log('Sending text message:', text);

    // Add user message to chat
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date()
    }]);

    // Send to OpenAI
    const conversationItemEvent = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text
          }
        ]
      }
    };

    wsRef.current.send(JSON.stringify(conversationItemEvent));
    wsRef.current.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    messages,
    isConnected,
    isRecording,
    isSpeaking,
    currentTranscript,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    sendTextMessage
  };
};