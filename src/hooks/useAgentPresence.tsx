import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const OFFLINE_THRESHOLD = 60000; // 60 seconds without heartbeat = offline
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes of inactivity = away

export const useAgentPresence = () => {
  const { user } = useAuth();
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isAgentRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const currentStatusRef = useRef<string>('offline');

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
        .eq('agent_email', user.email)
        .maybeSingle();

      // Don't change status if agent is on a call or break (unless going offline)
      if (status === 'available' && currentStatus?.status && 
          ['on_call', 'on_break'].includes(currentStatus.status)) {
        // Just update the timestamp to show they're still active
        await supabase
          .from('agent_status')
          .update({ updated_at: new Date().toISOString() })
          .eq('agent_email', user.email);
        return;
      }

      // Don't update if already in this status (avoid unnecessary updates)
      if (currentStatus?.status === status) {
        await supabase
          .from('agent_status')
          .update({ updated_at: new Date().toISOString() })
          .eq('agent_email', user.email);
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

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Clear existing idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    // If currently away, set back to available
    if (currentStatusRef.current === 'away' && isAgentRef.current) {
      updatePresence('available');
    }

    // Start new idle timer. After 5 minutes of inactivity, mark tracked users
    // offline so admins, agents, and supervisors are not shown as available.
    idleTimerRef.current = setTimeout(() => {
      if (isAgentRef.current && currentStatusRef.current !== 'offline') {
        console.log('Agent idle for 5 minutes - setting to offline');
        updatePresence('offline');
      }
    }, IDLE_THRESHOLD);
  }, [updatePresence]);

  const sendHeartbeat = useCallback(async () => {
    if (!user?.email || !isAgentRef.current) return;

    try {
      await supabase
        .from('agent_status')
        .update({ updated_at: new Date().toISOString() })
        .eq('agent_email', user.email);
    } catch (error) {
      console.error('Error sending heartbeat:', error);
    }
  }, [user?.email]);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      // User returned to tab - reset idle and send heartbeat
      resetIdleTimer();
      sendHeartbeat();
    }
  }, [sendHeartbeat, resetIdleTimer]);

  const handleBeforeUnload = useCallback(() => {
    if (!user?.email || !isAgentRef.current) return;
    
    // Use sendBeacon for reliable offline status on page close
    const payload = JSON.stringify({
      user_id: user.id,
      agent_email: user.email,
      status: 'offline',
    });
    
    // Best effort to set offline - sendBeacon is more reliable for unload events
    navigator.sendBeacon?.(
      `https://prtvithyqpepdyaglzpg.supabase.co/rest/v1/agent_status?agent_email=eq.${encodeURIComponent(user.email)}`,
      payload
    );
  }, [user?.email, user?.id]);

  const handleUserActivity = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    const initPresence = async () => {
      const isAgent = await checkIfAgent();
      isAgentRef.current = isAgent;
      
      if (isAgent) {
        // Only auto-set to available on login if user is currently offline (or has no row).
        // Respect any existing status (away, on_break, on_call) the user previously set.
        const { data: existing } = await supabase
          .from('agent_status')
          .select('status')
          .eq('agent_email', user!.email!)
          .maybeSingle();

        if (!existing || existing.status === 'offline') {
          await updatePresence('available');
          currentStatusRef.current = 'available';
        } else {
          currentStatusRef.current = existing.status;
        }
        
        // Start heartbeat
        heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
        
        // Start idle detection
        resetIdleTimer();
        
        // Activity events for idle detection
        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        activityEvents.forEach(event => {
          document.addEventListener(event, handleUserActivity, { passive: true });
        });
        
        // Listen for visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Listen for page close
        window.addEventListener('beforeunload', handleBeforeUnload);
      }
    };

    if (user?.id) {
      initPresence();
    }

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      
      // Remove activity listeners
      const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Set offline when component unmounts (logout)
      if (isAgentRef.current) {
        updatePresence('offline');
      }
    };
  }, [user?.id, checkIfAgent, updatePresence, sendHeartbeat, handleVisibilityChange, handleBeforeUnload, resetIdleTimer, handleUserActivity]);

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
        .update({ status: 'offline' })
        .in('agent_email', staleAgents.map(a => a.agent_email));
    }
  } catch (error) {
    console.error('Error checking stale agents:', error);
  }
};
