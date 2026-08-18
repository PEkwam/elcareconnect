import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface UseWebRTCCallOptions {
  onStatusChange?: (status: CallStatus) => void;
  onError?: (error: string) => void;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTCCall(options?: UseWebRTCCallOptions) {
  const { user } = useAuth();
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hangupRef = useRef<() => void>(() => {});
  const hasConnectedRef = useRef(false);

  const updateStatus = useCallback((status: CallStatus) => {
    setCallStatus(status);
    options?.onStatusChange?.(status);
  }, [options]);

  // Clean up duration timer
  const stopDurationTimer = useCallback(() => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    setCallDuration(0);
    durationInterval.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
  }, []);

  // Initialize peer connection
  const createPeerConnection = useCallback((sessionId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = async (event) => {
      if (event.candidate && user) {
        // Send ICE candidate via Supabase Realtime broadcast
        channelRef.current?.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            candidate: event.candidate.toJSON(),
            from: user.id,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setRemoteStream(stream);
      if (remoteAudio.current) {
        remoteAudio.current.srcObject = stream;
        remoteAudio.current.play().catch(console.error);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        hasConnectedRef.current = true;
        updateStatus('connected');
        startDurationTimer();
      } else if (
        (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') &&
        hasConnectedRef.current
      ) {
        // Only auto-hangup if we were previously connected.
        // Otherwise, let the user wait/cancel manually (no callee yet).
        hangupRef.current();
      }
    };

    peerConnection.current = pc;
    return pc;
  }, [user, updateStatus, startDurationTimer]);

  // Start a call (caller side)
  const startCall = useCallback(async (callId: string, language: string = 'en') => {
    if (!user) {
      options?.onError?.('Not authenticated');
      return;
    }

    try {
      // Reset connected flag for this new call attempt
      hasConnectedRef.current = false;

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.current = stream;

      // Create session in DB
      const { data: session, error } = await supabase
        .from('webrtc_sessions')
        .insert({
          call_id: callId,
          caller_user_id: user.id,
          session_type: 'offer',
          status: 'pending',
          language,
        })
        .select()
        .single();

      if (error) throw error;
      setCurrentSessionId(session.id);

      // Set up realtime channel for signaling
      const channel = supabase.channel(`call-${session.id}`);
      channelRef.current = channel;

      const pc = createPeerConnection(session.id);

      // Add local tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Listen for signaling messages
      channel
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (payload.from !== user.id && payload.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          }
        })
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          if (payload.from !== user.id && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        })
        .on('broadcast', { event: 'hangup' }, () => {
          hangupRef.current();
        })
        .subscribe();

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Store offer in DB for the callee to pick up
      await supabase
        .from('webrtc_sessions')
        .update({ sdp_data: { type: offer.type, sdp: offer.sdp } })
        .eq('id', session.id);

      updateStatus('calling');
    } catch (err: any) {
      console.error('Failed to start call:', err);
      options?.onError?.(err.message || 'Failed to start call');
      hangupRef.current();
    }
  }, [user, createPeerConnection, updateStatus, options]);

  // Answer an incoming call
  const answerCall = useCallback(async (sessionId: string) => {
    if (!user) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.current = stream;

      // Get the offer from DB
      const { data: session, error } = await supabase
        .from('webrtc_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error || !session) throw error || new Error('Session not found');
      setCurrentSessionId(sessionId);

      const channel = supabase.channel(`call-${sessionId}`);
      channelRef.current = channel;

      const pc = createPeerConnection(sessionId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      channel
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          if (payload.from !== user.id && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        })
        .on('broadcast', { event: 'hangup' }, () => {
          hangupRef.current();
        })
        .subscribe();

      // Set remote description from offer
      const offerSdp = session.sdp_data as { type: RTCSdpType; sdp: string };
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer via broadcast
      channel.send({
        type: 'broadcast',
        event: 'answer',
        payload: {
          sdp: { type: answer.type, sdp: answer.sdp },
          from: user.id,
        },
      });

      // Update session
      await supabase
        .from('webrtc_sessions')
        .update({
          callee_user_id: user.id,
          session_type: 'answer',
          status: 'active',
          sdp_data: { type: answer.type, sdp: answer.sdp },
        })
        .eq('id', sessionId);

      updateStatus('connected');
      startDurationTimer();
    } catch (err: any) {
      console.error('Failed to answer call:', err);
      options?.onError?.(err.message || 'Failed to answer call');
      hangupRef.current();
    }
  }, [user, createPeerConnection, updateStatus, startDurationTimer, options]);

  // Hang up
  const hangup = useCallback(() => {
    // Notify peer
    channelRef.current?.send({
      type: 'broadcast',
      event: 'hangup',
      payload: { from: user?.id },
    });

    // Clean up peer connection
    peerConnection.current?.close();
    peerConnection.current = null;

    // Stop local tracks
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;

    // Clean up audio
    if (remoteAudio.current) {
      remoteAudio.current.srcObject = null;
    }
    setRemoteStream(null);

    // Remove channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Update DB
    if (currentSessionId) {
      supabase
        .from('webrtc_sessions')
        .update({ status: 'ended' })
        .eq('id', currentSessionId)
        .then();
    }

    stopDurationTimer();
    hasConnectedRef.current = false;
    updateStatus('ended');
    setCurrentSessionId(null);

    // Reset to idle after a moment
    setTimeout(() => updateStatus('idle'), 2000);
  }, [user, currentSessionId, stopDurationTimer, updateStatus]);

  // Keep hangupRef in sync with the latest hangup callback
  useEffect(() => {
    hangupRef.current = hangup;
  }, [hangup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    // Create audio element for remote stream
    const audio = new Audio();
    audio.autoplay = true;
    remoteAudio.current = audio;

    return () => {
      hangupRef.current();
      audio.remove();
    };
  }, []);

  return {
    callStatus,
    isMuted,
    callDuration,
    remoteStream,
    currentSessionId,
    startCall,
    answerCall,
    hangup,
    toggleMute,
  };
}
