import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const OFFLINE_THRESHOLD = 60000; // 60 seconds without heartbeat = offline
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes of inactivity = away

export const useAgentPresence = () => {
  const { user, session, signOut } = useAuth();
  const accessTokenRef = useRef<string | undefined>(undefined);
  accessTokenRef.current = session?.access_token;
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAgentRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const currentStatusRef = useRef<string>('offline');
  const autoOfflineRef = useRef(false);
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  // After the inactivity threshold the agent is marked offline AND signed out,
  // so the session cannot be silently kept alive by a background tab.
  const goOfflineAndSignOut = useCallback(async () => {
    if (currentStatusRef.current !== 'offline') {
      autoOfflineRef.current = true;
      await updatePresenceRef.current('offline');
    }
    try {
      const { toast } = await import('sonner');
      toast.info('You were signed out due to inactivity.');
    } catch { /* non-fatal */ }
    await signOutRef.current();
  }, []);

  const checkIfAgent = useCallback(async () => {
    if (!user?.id) return false;
    
    // Check for any non-user role that needs presence tracking
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['agent', 'admin', 'super_admin', 'supervisor']);
    
    return data && data.length > 0;
  }, [user?.id]);

  const updatePresence = useCallback(async (status: 'available' | 'offline' | 'away') => {
    if (!user?.email || !user?.id || !isAgentRef.current) return;

    try {
      // Get current status to avoid overwriting 'on_call' or 'on_break'
      const { data: currentStatus } = await supabase
        .from('agent_status')
        .select('status, current_status_started_at')
        .eq('user_id', user.id)
        .maybeSingle();

      // Don't change status if agent is on a call or break (unless going offline)
      if (status === 'available' && currentStatus?.status && 
          ['on_call', 'on_break'].includes(currentStatus.status)) {
        // Just update the timestamp to show they're still active
        await supabase
          .from('agent_status')
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        return;
      }

      // Don't update if already in this status (avoid unnecessary updates)
      if (currentStatus?.status === status) {
        await supabase
          .from('agent_status')
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        return;
      }

      const now = new Date().toISOString();
      currentStatusRef.current = status;

      await supabase
        .from('agent_status')
        .upsert({
          user_id: user.id,
          agent_email: user.email,
          status,
          updated_at: now,
          // Going offline clears the session so timers reset and stop counting.
          session_started_at: status === 'offline' ? null : (status === 'available' ? now : undefined),
          current_status_started_at: status === 'offline' ? null : now,
        }, { onConflict: 'agent_email' });
        
      console.log(`Agent presence updated: ${user.email} -> ${status}`);
    } catch (error) {
      console.error('Error updating presence:', error);
    }
  }, [user?.email, user?.id]);

  const updatePresenceRef = useRef(updatePresence);
  updatePresenceRef.current = updatePresence;

  const resetIdleTimer = useCallback(() => {
    const wasInactive = Date.now() - lastActivityRef.current >= IDLE_THRESHOLD;
    lastActivityRef.current = Date.now();
    
    // Clear existing idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    // Returning after a long idle period signs the user out instead of
    // silently starting a fresh presence session.
    if (wasInactive && currentStatusRef.current !== 'offline' && isAgentRef.current) {
      goOfflineAndSignOut();
      return;
    } else if ((currentStatusRef.current === 'away' || autoOfflineRef.current) && isAgentRef.current) {
      autoOfflineRef.current = false;
      updatePresence('available');
    }

    // Start new idle timer. After 5 minutes of inactivity, mark tracked users
    // offline so admins, agents, and supervisors are not shown as available.
    idleTimerRef.current = setTimeout(() => {
      if (isAgentRef.current && currentStatusRef.current !== 'offline') {
        console.log('Agent idle for 5 minutes - going offline and signing out');
        goOfflineAndSignOut();
      }
    }, IDLE_THRESHOLD);
  }, [updatePresence, goOfflineAndSignOut]);

  const sendHeartbeat = useCallback(async () => {
    if (!user?.email || !user?.id || !isAgentRef.current) return;

    // A background tab can throttle the idle timeout while intervals continue.
    // Never let heartbeats keep an inactive session alive indefinitely.
    if (Date.now() - lastActivityRef.current >= IDLE_THRESHOLD) {
      await goOfflineAndSignOut();
      return;
    }

    try {
      await supabase
        .from('agent_status')
        .update({ updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    } catch (error) {
      console.error('Error sending heartbeat:', error);
    }
  }, [user?.email, user?.id, updatePresence]);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      // User returned to tab - reset idle and send heartbeat
      resetIdleTimer();
      sendHeartbeat();
    }
  }, [sendHeartbeat, resetIdleTimer]);

  const handleBeforeUnload = useCallback(() => {
    if (!user?.email || !isAgentRef.current) return;

    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const token = accessTokenRef.current;
    if (!url || !anonKey || !token) return;

    // keepalive fetch survives page unload and lets us send auth headers
    // (sendBeacon cannot), so RLS accepts the write.
    fetch(
      `${url}/rest/v1/agent_status?agent_email=eq.${encodeURIComponent(user.email)}`,
      {
        method: 'PATCH',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status: 'offline',
          session_started_at: null,
          current_status_started_at: null,
          updated_at: new Date().toISOString(),
        }),
      }
    ).catch(() => {});
  }, [user?.email]);

  const handleUserActivity = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  // Keep latest callbacks in refs so the effect can depend only on the user id.
  // (Re-running the effect on callback identity changes made the cleanup fire and
  // immediately flip a logged-in user back to "offline".)
  const fnRefs = useRef({
    checkIfAgent,
    updatePresence,
    sendHeartbeat,
    handleVisibilityChange,
    handleBeforeUnload,
    resetIdleTimer,
    handleUserActivity,
  });
  fnRefs.current = {
    checkIfAgent,
    updatePresence,
    sendHeartbeat,
    handleVisibilityChange,
    handleBeforeUnload,
    resetIdleTimer,
    handleUserActivity,
  };

  useEffect(() => {
    let cancelled = false;
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const onActivity = () => fnRefs.current.handleUserActivity();
    const onVisibility = () => fnRefs.current.handleVisibilityChange();
    const onUnload = () => fnRefs.current.handleBeforeUnload();

    const initPresence = async () => {
      const userId = user?.id;
      if (!userId) return;
      const isAgent = await fnRefs.current.checkIfAgent();
      if (cancelled) return;
      isAgentRef.current = isAgent;

      if (isAgent) {
        // Only auto-set to available on login if user is currently offline (or has no row).
        // Respect any existing status (away, on_break, on_call) the user previously set.
        const { data: existing } = await supabase
          .from('agent_status')
          .select('status, updated_at')
          .eq('user_id', userId)
          .maybeSingle();

        if (cancelled) return;

        // Stale row (browser closed without a clean offline write) counts as a new session.
        const stale = existing?.updated_at
          ? Date.now() - new Date(existing.updated_at).getTime() > OFFLINE_THRESHOLD
          : true;

        if (!existing || existing.status === 'offline' || stale) {
          autoOfflineRef.current = false;
          await fnRefs.current.updatePresence('available');
          currentStatusRef.current = 'available';
        } else {
          currentStatusRef.current = existing.status;
        }

        heartbeatRef.current = setInterval(() => fnRefs.current.sendHeartbeat(), HEARTBEAT_INTERVAL);
        fnRefs.current.resetIdleTimer();

        activityEvents.forEach(event => {
          document.addEventListener(event, onActivity, { passive: true });
        });
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('beforeunload', onUnload);
      }
    };

    if (user?.id) {
      initPresence();
    }

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      activityEvents.forEach(event => {
        document.removeEventListener(event, onActivity);
      });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);

      // Set offline when the user actually leaves (logout / unmount).
      if (isAgentRef.current) {
        fnRefs.current.updatePresence('offline');
      }
    };
  }, [user?.id]);


  return { updatePresence, resetIdleTimer };
};

// Utility function to check if agents are stale (no heartbeat)
export const checkStaleAgents = async () => {
  const threshold = new Date(Date.now() - OFFLINE_THRESHOLD).toISOString();
  
  try {
    // Get agents who haven't sent a heartbeat and are marked as available/away
    const { data: staleAgents } = await supabase
      .from('agent_status')
      .select('agent_email')
      .lt('updated_at', threshold)
      .in('status', ['available', 'on_break', 'away']);

    if (staleAgents && staleAgents.length > 0) {
      // Mark them as offline
      await supabase
        .from('agent_status')
        .update({
          status: 'offline',
          session_started_at: null,
          current_status_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .in('agent_email', staleAgents.map(a => a.agent_email));
    }
  } catch (error) {
    console.error('Error checking stale agents:', error);
  }
};
