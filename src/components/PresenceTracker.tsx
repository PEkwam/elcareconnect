import { useAgentPresence } from "@/hooks/useAgentPresence";

/**
 * Headless component that initializes agent/supervisor/admin presence
 * tracking globally. Mount it once inside AuthProvider.
 */
export const PresenceTracker = () => {
  useAgentPresence();
  return null;
};

export default PresenceTracker;
