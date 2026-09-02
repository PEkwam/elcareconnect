import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const HEARTBEAT_INTERVAL = 20000; // 20s — must be well under OFFLINE_THRESHOLD
const OFFLINE_THRESHOLD = 90000; // 90s without a heartbeat = session is dead
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes of no interaction = sign out

type Presence = 'available' | 'offline' | 'away';

/**
 * Single source of truth for agent/admin presence.
 *
 * Design rules (learned the hard way):
 *  - Nothing writes "offline" except an explicit sign-out, the idle timeout,
 *    or the server-side-ish stale sweeper. NOT effect cleanup, NOT unload.
 *  - A page refresh must never change status: the row simply keeps its last
 *    heartbeat, and the new page picks the session back up within a second.
 *  - Idle is measured from real user interaction only, never from timers,
 *    so a throttled background tab can't fabricate activity or inactivity.
 */
export const useAgentPresence = () => {
  const { user, signOut } = useAuth();

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTrackedRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const statusRef = useRef<string>('offline');
  const signingOutRef = useRef(false);

  const userIdRef = useRef<string | undefined>(undefined);
  const userEmailRef = useRef<string | undefined>(undefined);
  userIdRef.current = user?.id;
  userEmailRef.current = user?.email;

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const writeStatus = useCallback(async (status: Presence) => {
    const userId = userIdRef.current;
    const email = userEmailRef.current;
    if (!userId || !email || !isTrackedRef.current) return;

    try {
      const { data: existing } = await supabase
        .from('agent_status')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      // Never stomp a status the user chose themselves.
      if (status === 'available' && existing?.status && ['on_call', 'on_break'].includes(existing.status)) {
        statusRef.current = existing.status;
        return;
      }

      if (existing?.status === status) {
        statusRef.current = status;
        return;
      }

      const now = new Date().toISOString();
      statusRef.current = status;

      await supabase.from('agent_status').upsert(
        {
          user_id: userId,
          agent_email: email,
          status,
          updated_at: now,
          session_started_at: status === 'offline' ? null : now,
          current_status_started_at: status === 'offline' ? null : now,
        },
        { onConflict: 'agent_email' }
      );
    } catch (error) {
      console.error('[presence] write failed', error);
    }
  }, []);

  const writeStatusRef = useRef(writeStatus);
  writeStatusRef.current = writeStatus;

  const heartbeat = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId || !isTrackedRef.current) return;
    try {
      await supabase
        .from('agent_status')
        .update({ updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    } catch (error) {
      console.error('[presence] heartbeat failed', error);
    }
  }, []);

  const goOfflineAndSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;

    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (idleCheckRef.current) clearInterval(idleCheckRef.current);

    await writeStatusRef.current('offline');
    isTrackedRef.current = false;
    statusRef.current = 'offline';

    try {
      const { toast } = await import('sonner');
      toast.info('You were signed out due to inactivity.');
    } catch { /* non-fatal */ }

    try {
      await signOutRef.current();
    } finally {
      signingOutRef.current = false;
      lastActivityRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelled = false;
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const onActivity = () => { lastActivityRef.current = Date.now(); };

    const init = async () => {
      // Fresh mount = fresh activity window.
      lastActivityRef.current = Date.now();
      signingOutRef.current = false;
      statusRef.current = 'offline';

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .in('role', ['agent', 'admin', 'super_admin', 'supervisor']);

      if (cancelled) return;
      if (!roles || roles.length === 0) return;

      isTrackedRef.current = true;

      const { data: existing } = await supabase
        .from('agent_status')
        .select('status, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      const stale = existing?.updated_at
        ? Date.now() - new Date(existing.updated_at).getTime() > OFFLINE_THRESHOLD
        : true;

      if (!existing || existing.status === 'offline' || stale) {
        await writeStatusRef.current('available');
      } else {
        // Refresh / navigation: keep whatever the row already says and just
        // refresh the heartbeat so the sweeper leaves it alone.
        statusRef.current = existing.status;
        await heartbeat();
      }

      if (cancelled) return;

      heartbeatRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL);
      idleCheckRef.current = setInterval(() => {
        if (!isTrackedRef.current || statusRef.current === 'offline') return;
        if (Date.now() - lastActivityRef.current >= IDLE_THRESHOLD) {
          goOfflineAndSignOut();
        }
      }, HEARTBEAT_INTERVAL);

      activityEvents.forEach((event) =>
        document.addEventListener(event, onActivity, { passive: true })
      );
    };

    init();

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);
      activityEvents.forEach((event) => document.removeEventListener(event, onActivity));
      // Intentionally no "offline" write here: this cleanup fires on StrictMode
      // double-mounts, refreshes and remounts. Closed tabs are handled by the
      // stale sweeper below.
    };
  }, [user?.id, heartbeat, goOfflineAndSignOut]);

  return { updatePresence: writeStatus, resetIdleTimer: () => { lastActivityRef.current = Date.now(); } };
};

// Marks sessions offline once their heartbeat has clearly stopped (tab closed,
// browser crashed, machine slept). Safe to call from any dashboard view.
export const checkStaleAgents = async () => {
  const threshold = new Date(Date.now() - OFFLINE_THRESHOLD).toISOString();

  try {
    const { data: staleAgents } = await supabase
      .from('agent_status')
      .select('agent_email')
      .lt('updated_at', threshold)
      .in('status', ['available', 'on_break', 'away', 'on_call']);

    if (staleAgents && staleAgents.length > 0) {
      await supabase
        .from('agent_status')
        .update({
          status: 'offline',
          session_started_at: null,
          current_status_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .in('agent_email', staleAgents.map((a) => a.agent_email));
    }
  } catch (error) {
    console.error('[presence] stale sweep failed', error);
  }
};
