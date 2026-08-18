import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to postgres_changes for one or more tables and invokes
 * the provided callback whenever any change occurs. Includes a
 * polling fallback for resilience.
 */
export function useRealtimeRefresh(
  tables: string[],
  onChange: () => void,
  options: { pollMs?: number; channelName?: string } = {}
) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    const name =
      options.channelName ||
      `rt-${tables.join("-")}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(name);
    tables.forEach((t) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t },
        () => cbRef.current()
      );
    });
    channel.subscribe();

    const interval = setInterval(() => cbRef.current(), options.pollMs ?? 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join("|")]);
}
