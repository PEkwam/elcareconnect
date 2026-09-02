import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { checkStaleAgents } from "@/hooks/useAgentPresence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Coffee, PhoneCall, Wifi, WifiOff, Timer, Moon } from "lucide-react";

interface AgentStatus {
  id: string;
  agent_email: string;
  status: string;
  break_type: string | null;
  current_call_id: string | null;
  updated_at: string;
  session_started_at: string | null;
  current_status_started_at: string | null;
  total_time_available_seconds: number;
  total_time_on_call_seconds: number;
  total_time_on_break_seconds: number;
}

// Must match OFFLINE_THRESHOLD in useAgentPresence (heartbeat is every 20s).
const STALE_THRESHOLD_MS = 90000;

// Helper function to format seconds to readable duration
const formatDuration = (seconds: number): string => {
  if (!seconds || seconds < 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Helper to calculate live duration from a start time
const getLiveDuration = (startTime: string | null): string => {
  if (!startTime) return '0m';
  const seconds = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
  return formatDuration(seconds);
};

export const AgentStatusManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  // Note: useAgentPresence is now called at Dashboard level
  
  const [myStatus, setMyStatus] = useState<AgentStatus | null>(null);
  const [allAgents, setAllAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("available");
  const [breakType, setBreakType] = useState<string>("lunch");

  const isAgentStale = useCallback((updatedAt: string) => {
    const lastUpdate = new Date(updatedAt).getTime();
    const now = Date.now();
    return now - lastUpdate > STALE_THRESHOLD_MS;
  }, []);

  const getEffectiveStatus = useCallback((agent: AgentStatus) => {
    // If agent hasn't sent heartbeat in 60s and isn't already offline, they're stale
    if (agent.status !== 'offline' && isAgentStale(agent.updated_at)) {
      return 'offline';
    }
    return agent.status;
  }, [isAgentStale]);

  useEffect(() => {
    fetchStatuses();
    
    // Check for stale agents periodically
    const staleCheckInterval = setInterval(() => {
      checkStaleAgents();
      fetchStatuses();
    }, 30000);

    // Subscribe to real-time updates
    const channel = supabase
      .channel('agent-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_status'
        },
        () => {
          fetchStatuses();
        }
      )
      .subscribe();

    return () => {
      clearInterval(staleCheckInterval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchStatuses = async () => {
    try {
      const { data: statuses, error } = await supabase
        .from('agent_status')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setAllAgents(statuses || []);
      
      // Find current user's status
      const currentUserStatus = statuses?.find(s => s.agent_email === user?.email);
      setMyStatus(currentUserStatus || null);
      if (currentUserStatus) {
        setSelectedStatus(currentUserStatus.status);
        if (currentUserStatus.break_type) {
          setBreakType(currentUserStatus.break_type);
        }
      }
    } catch (error) {
      console.error('Error fetching agent statuses:', error);
      toast({
        title: "Error",
        description: "Failed to load agent statuses",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateMyStatus = async () => {
    if (!user?.email || !user?.id) return;

    try {
      const statusData = {
        user_id: user.id,
        agent_email: user.email,
        status: selectedStatus,
        break_type: selectedStatus === 'on_break' ? breakType : null,
        current_call_id: selectedStatus === 'on_call' ? myStatus?.current_call_id : null,
      };

      const { error } = await supabase
        .from('agent_status')
        .upsert(statusData, { onConflict: 'agent_email' });

      if (error) throw error;

      toast({
        title: "Status Updated",
        description: `Your status has been set to ${selectedStatus.replace('_', ' ')}`,
      });
      
      fetchStatuses();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string, isStale?: boolean) => {
    const effectiveStatus = isStale ? 'offline' : status;
    
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: any, className?: string }> = {
      available: { variant: "default", icon: Wifi, className: "bg-primary hover:bg-primary/90" },
      on_call: { variant: "secondary", icon: PhoneCall },
      on_break: { variant: "outline", icon: Coffee },
      away: { variant: "outline", icon: Moon, className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
      offline: { variant: "destructive", icon: WifiOff },
    };

    const config = variants[effectiveStatus] || variants.offline;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={`gap-1 ${config.className || ''}`}>
        <Icon className="h-3 w-3" />
        {effectiveStatus.replace('_', ' ')}
        {isStale && effectiveStatus !== 'offline' && ' (stale)'}
      </Badge>
    );
  };

  if (loading) {
    return <div>Loading agent statuses...</div>;
  }

  return (
    <div className="space-y-6">
      {/* My Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>My Status</CardTitle>
          <CardDescription>Update your availability for call transfers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="on_call">On Call</SelectItem>
                  <SelectItem value="on_break">On Break</SelectItem>
                  <SelectItem value="away">Away</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedStatus === 'on_break' && (
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Break Type</label>
                <Select value={breakType} onValueChange={setBreakType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lunch">Lunch</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Button onClick={updateMyStatus} className="w-full">
            Update Status
          </Button>

          {myStatus && (
            <div className="p-3 bg-muted rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Status:</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-primary">
                    <Wifi className="h-3 w-3 animate-pulse" />
                    Online
                  </span>
                  {getStatusBadge(myStatus.status)}
                </div>
              </div>
              {myStatus.break_type && myStatus.status === 'on_break' && (
                <div className="text-sm text-muted-foreground">
                  Break: {myStatus.break_type}
                </div>
              )}
              
              {/* Session Duration */}
              {myStatus.session_started_at && (
                <div className="flex items-center gap-2 text-sm">
                  <Timer className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Session:</span>
                  <span className="font-medium">{getLiveDuration(myStatus.session_started_at)}</span>
                </div>
              )}
              
              {/* Today's Time Stats */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Available</div>
                  <div className="text-sm font-medium text-primary">
                    {formatDuration(myStatus.total_time_available_seconds || 0)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">On Call</div>
                  <div className="text-sm font-medium text-chart-2">
                    {formatDuration(myStatus.total_time_on_call_seconds || 0)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">On Break</div>
                  <div className="text-sm font-medium text-chart-4">
                    {formatDuration(myStatus.total_time_on_break_seconds || 0)}
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground">
                Last updated: {new Date(myStatus.updated_at).toLocaleString()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Agents Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Agents ({allAgents.length})
          </CardTitle>
          <CardDescription>Real-time status of all agents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {allAgents.map((agent) => {
              const stale = isAgentStale(agent.updated_at);
              const effectiveStatus = getEffectiveStatus(agent);
              
              return (
                <div
                  key={agent.id}
                  className={`p-3 border rounded-lg hover:bg-muted/50 transition-colors ${stale && effectiveStatus !== 'offline' ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{agent.agent_email}</div>
                      <div className="text-xs text-muted-foreground">
                        Last active: {new Date(agent.updated_at).toLocaleTimeString()}
                        {stale && <span className="text-destructive ml-2">(inactive)</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {agent.session_started_at && effectiveStatus !== 'offline' && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Timer className="h-3 w-3" />
                          {getLiveDuration(agent.session_started_at)}
                        </span>
                      )}
                      {agent.break_type && effectiveStatus === 'on_break' && (
                        <span className="text-xs text-muted-foreground">
                          ({agent.break_type})
                        </span>
                      )}
                      {getStatusBadge(effectiveStatus, stale && agent.status !== 'offline')}
                    </div>
                  </div>
                  
                  {/* Duration stats row */}
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-muted-foreground">
                      Available: <span className="text-primary font-medium">{formatDuration(agent.total_time_available_seconds || 0)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      On Call: <span className="text-chart-2 font-medium">{formatDuration(agent.total_time_on_call_seconds || 0)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Break: <span className="text-chart-4 font-medium">{formatDuration(agent.total_time_on_break_seconds || 0)}</span>
                    </span>
                  </div>
                </div>
              );
            })}

            {allAgents.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No agents found
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
