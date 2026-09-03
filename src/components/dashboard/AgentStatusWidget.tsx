import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Phone,
  Coffee,
  Moon,
  Power,
  Clock,
  Utensils,
  User,
  Users,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AgentStatusData {
  status: string;
  break_type: string | null;
  session_started_at: string | null;
  current_status_started_at: string | null;
}

const STATUS_CONFIG = {
  available: { icon: Check, label: "Available", dot: "bg-emerald-500" },
  on_call: { icon: Phone, label: "On Call", dot: "bg-sky-500" },
  on_break: { icon: Coffee, label: "On Break", dot: "bg-amber-500" },
  away: { icon: Moon, label: "Away", dot: "bg-orange-400" },
  offline: { icon: Power, label: "Offline", dot: "bg-muted-foreground/50" },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

const BREAK_TYPES = [
  { key: "lunch", label: "Lunch", icon: Utensils },
  { key: "personal", label: "Personal", icon: User },
  { key: "meeting", label: "Meeting", icon: Users },
];

const formatDuration = (startTime: string | null): string => {
  if (!startTime) return "";
  const diffMs = Date.now() - new Date(startTime).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const AgentStatusWidget = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<AgentStatusData | null>(null);
  const [sessionDuration, setSessionDuration] = useState<string>("0h 0m");
  const [statusDuration, setStatusDuration] = useState<string>("");

  const fetchStatus = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("agent_status")
      .select("status, break_type, session_started_at, current_status_started_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setStatus(data);
      if (data.status === "offline") {
        setSessionDuration("0h 0m");
        setStatusDuration("");
        return;
      }
      setSessionDuration(data.session_started_at ? formatDuration(data.session_started_at) : "0h 0m");
      setStatusDuration(data.current_status_started_at ? formatDuration(data.current_status_started_at) : "");
    }
  };

  // Keep the latest status in a ref so the ticking interval never needs to
  // re-subscribe the realtime channel (which would drop events).
  const statusRef = useRef<AgentStatusData | null>(null);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!user?.id) return;

    fetchStatus();

    const channel = supabase
      .channel(`agent-status-widget-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_status",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchStatus();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      const s = statusRef.current;
      if (!s || s.status === "offline") {
        setSessionDuration("0h 0m");
        setStatusDuration("");
        return;
      }
      if (s.session_started_at) setSessionDuration(formatDuration(s.session_started_at));
      if (s.current_status_started_at) setStatusDuration(formatDuration(s.current_status_started_at));
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);


  const updateStatus = async (newStatus: string, breakType?: string) => {
    if (!user?.email || !user?.id) return;

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status: newStatus,
      current_status_started_at: now,
      updated_at: now,
    };

    if (newStatus === "on_break" && breakType) {
      updateData.break_type = breakType;
    } else {
      updateData.break_type = null;
    }

    if (newStatus === "available" && !status?.session_started_at) {
      updateData.session_started_at = now;
    }
    if (newStatus === "offline") {
      updateData.session_started_at = null;
      updateData.current_status_started_at = null;
    }

    const { error } = await supabase.from("agent_status").upsert(
      {
        user_id: user.id,
        agent_email: user.email,
        ...updateData,
      },
      { onConflict: "agent_email" }
    );

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } else {
      const breakLabel = breakType ? BREAK_TYPES.find((b) => b.key === breakType)?.label : null;
      const statusLabel = STATUS_CONFIG[newStatus as StatusKey]?.label || newStatus;
      toast({
        title: "Status updated",
        description: breakLabel ? `You are now on ${breakLabel} break` : `You are now ${statusLabel}`,
      });
      fetchStatus();
    }
  };

  const currentStatus = (status?.status || "offline") as StatusKey;
  const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.offline;
  const isOffline = currentStatus === "offline";
  const breakLabel =
    currentStatus === "on_break" && status?.break_type
      ? BREAK_TYPES.find((b) => b.key === status.break_type)?.label
      : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-3 pr-3.5 text-sm",
            "shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          aria-label="Change my status"
        >
          <span className="relative flex h-2 w-2">
            {currentStatus === "available" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            )}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", config.dot)} />
          </span>
          <span className="font-medium text-foreground/90">
            {breakLabel || config.label}
          </span>
          {!isOffline && statusDuration && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {statusDuration}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-60 z-50 bg-popover border border-border shadow-lg"
      >
        <DropdownMenuLabel className="flex items-center justify-between py-2">
          <span className="text-sm font-semibold">My status</span>
          {!isOffline && status?.session_started_at && (
            <span className="flex items-center gap-1 text-xs font-normal tabular-nums text-muted-foreground">
              <Clock className="h-3 w-3" />
              {sessionDuration}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="p-1">
          {(Object.entries(STATUS_CONFIG) as [StatusKey, (typeof STATUS_CONFIG)[StatusKey]][]).map(
            ([key, value]) => {
              const Icon = value.icon;
              const isCurrent = currentStatus === key;

              if (key === "on_break") {
                return (
                  <DropdownMenuSub key={key}>
                    <DropdownMenuSubTrigger className="gap-2.5 rounded-md">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", value.dot)} />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{value.label}</span>
                      {isCurrent && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {breakLabel || "Current"}
                        </span>
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="bg-popover border border-border shadow-lg">
                        {BREAK_TYPES.map((breakType) => {
                          const BreakIcon = breakType.icon;
                          const isCurrentBreak = isCurrent && status?.break_type === breakType.key;
                          return (
                            <DropdownMenuItem
                              key={breakType.key}
                              onClick={() => updateStatus("on_break", breakType.key)}
                              className="gap-2.5"
                            >
                              <BreakIcon className="h-4 w-4 text-muted-foreground" />
                              {breakType.label}
                              {isCurrentBreak && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                );
              }

              return (
                <DropdownMenuItem
                  key={key}
                  onClick={() => updateStatus(key)}
                  className="gap-2.5 rounded-md"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", value.dot)} />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{value.label}</span>
                  {isCurrent && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              );
            }
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AgentStatusWidget;
