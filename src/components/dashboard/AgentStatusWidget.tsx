import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { 
  Circle, 
  Phone, 
  Coffee, 
  Moon, 
  Power,
  Clock,
  ChevronDown,
  Utensils,
  User,
  Users
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface AgentStatusData {
  status: string;
  break_type: string | null;
  session_started_at: string | null;
  current_status_started_at: string | null;
  total_time_available_seconds: number | null;
  total_time_on_call_seconds: number | null;
  total_time_on_break_seconds: number | null;
}

const STATUS_CONFIG = {
  available: { icon: Circle, label: "Available", className: "bg-green-600 text-white" },
  on_call: { icon: Phone, label: "On Call", className: "bg-blue-600 text-white" },
  on_break: { icon: Coffee, label: "On Break", className: "bg-amber-500 text-white" },
  away: { icon: Moon, label: "Away", className: "bg-orange-500 text-white" },
  offline: { icon: Power, label: "Offline", className: "bg-slate-500 text-white" },
};

const BREAK_TYPES = [
  { key: "lunch", label: "Lunch", icon: Utensils },
  { key: "personal", label: "Personal", icon: User },
  { key: "meeting", label: "Meeting", icon: Users },
];

const formatDuration = (startTime: string | null): string => {
  if (!startTime) return "";
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
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

  useEffect(() => {
    if (!user?.email) return;

    fetchStatus();

    // Subscribe to status changes
    const channel = supabase
      .channel('agent-status-widget')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_status',
        filter: `agent_email=eq.${user.email}`
      }, () => {
        fetchStatus();
      })
      .subscribe();

    // Update durations periodically (paused while offline)
    const interval = setInterval(() => {
      if (status?.status === 'offline') {
        setSessionDuration("0h 0m");
        setStatusDuration("");
        return;
      }
      setSessionDuration(status?.session_started_at ? formatDuration(status.session_started_at) : "0h 0m");
      setStatusDuration(status?.current_status_started_at ? formatDuration(status.current_status_started_at) : "");
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user?.email, status?.session_started_at, status?.current_status_started_at]);

  const fetchStatus = async () => {
    if (!user?.email) return;

    const { data, error } = await supabase
      .from('agent_status')
      .select('status, break_type, session_started_at, current_status_started_at, total_time_available_seconds, total_time_on_call_seconds, total_time_on_break_seconds')
      .eq('agent_email', user.email)
      .maybeSingle();

    if (!error && data) {
      setStatus(data);
      // Offline means no session: timers reset and stop counting
      if (data.status === 'offline') {
        setSessionDuration("0h 0m");
        setStatusDuration("");
        return;
      }
      setSessionDuration(data.session_started_at ? formatDuration(data.session_started_at) : "0h 0m");
      setStatusDuration(data.current_status_started_at ? formatDuration(data.current_status_started_at) : "");
    }
  };

  const updateStatus = async (newStatus: string, breakType?: string) => {
    if (!user?.email || !user?.id) return;

    const now = new Date().toISOString();
    const updateData: Record<string, any> = { 
      status: newStatus,
      current_status_started_at: now,
      updated_at: now,
    };

    // Set break_type only when going on break, clear it otherwise
    if (newStatus === 'on_break' && breakType) {
      updateData.break_type = breakType;
    } else {
      updateData.break_type = null;
    }

    // Set session_started_at when going online, clear when going offline
    if (newStatus === 'available' && (!status?.session_started_at)) {
      updateData.session_started_at = now;
    }
    if (newStatus === 'offline') {
      updateData.session_started_at = null;
      updateData.current_status_started_at = null;
    }

    // Upsert to handle case where row doesn't exist yet
    const { error } = await supabase
      .from('agent_status')
      .upsert({
        user_id: user.id,
        agent_email: user.email,
        ...updateData,
      }, { onConflict: 'agent_email' });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } else {
      const breakLabel = breakType ? BREAK_TYPES.find(b => b.key === breakType)?.label : null;
      const statusLabel = STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG]?.label || newStatus;
      toast({
        title: "Status Updated",
        description: breakLabel ? `You are now on ${breakLabel} break` : `You are now ${statusLabel}`,
      });
      fetchStatus();
    }
  };

  const currentStatus = status?.status || 'offline';
  const config = STATUS_CONFIG[currentStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.offline;
  const StatusIcon = config.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <Badge className={`${config.className} gap-1 px-2`}>
            <span className="relative flex h-3 w-3">
              {currentStatus === 'available' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              )}
              <StatusIcon className="relative h-3 w-3" />
            </span>
            {currentStatus === 'on_break' && status?.break_type 
              ? `${BREAK_TYPES.find(b => b.key === status.break_type)?.label || 'Break'}`
              : config.label}
          </Badge>
          {currentStatus !== 'offline' && statusDuration && (
            <span className="text-xs text-muted-foreground">{statusDuration}</span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-50 bg-popover border border-border shadow-lg">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>My Status</span>
          {currentStatus !== 'offline' && status?.session_started_at && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {sessionDuration}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(STATUS_CONFIG).map(([key, value]) => {
          const Icon = value.icon;
          
          // Special handling for on_break - show submenu with break types
          if (key === 'on_break') {
            return (
              <DropdownMenuSub key={key}>
                <DropdownMenuSubTrigger className={currentStatus === key ? "bg-muted" : ""}>
                  <Icon className="h-4 w-4 mr-2" />
                  {value.label}
                  {currentStatus === key && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {status?.break_type ? BREAK_TYPES.find(b => b.key === status.break_type)?.label : 'Current'}
                    </Badge>
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="bg-popover border border-border shadow-lg">
                    {BREAK_TYPES.map((breakType) => {
                      const BreakIcon = breakType.icon;
                      const isCurrentBreak = currentStatus === 'on_break' && status?.break_type === breakType.key;
                      return (
                        <DropdownMenuItem
                          key={breakType.key}
                          onClick={() => updateStatus('on_break', breakType.key)}
                          className={isCurrentBreak ? "bg-muted" : ""}
                        >
                          <BreakIcon className="h-4 w-4 mr-2" />
                          {breakType.label}
                          {isCurrentBreak && (
                            <Badge variant="secondary" className="ml-auto text-xs">Current</Badge>
                          )}
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
              className={currentStatus === key ? "bg-muted" : ""}
            >
              <Icon className="h-4 w-4 mr-2" />
              {value.label}
              {currentStatus === key && (
                <Badge variant="secondary" className="ml-auto text-xs">Current</Badge>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AgentStatusWidget;
