import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  AlertTriangle, 
  Clock, 
  Phone, 
  Users, 
  Zap, 
  UserCheck, 
  Shield, 
  User, 
  Bell,
  BellRing,
  RefreshCw,
  PhoneCall,
  CheckCircle,
  XCircle,
  Circle,
  Settings,
  TestTube
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { useDesktopNotifications } from "@/hooks/useDesktopNotifications";
import { normalizeQueuedCalls, type NormalizedQueuedCall as QueuedCall } from "@/lib/supabaseNormalizers";

interface AgentStatus {
  id: string;
  agent_email: string;
  status: string;
  current_call_id: string | null;
  success_rate: number | null;
  total_calls_handled: number | null;
  avg_resolution_time_minutes: number | null;
}

interface EscalationThresholds {
  warning: number;
  escalate: number;
  critical: number;
}

interface NotificationPreferences {
  warning: boolean;
  escalate: boolean;
  critical: boolean;
}

const DEFAULT_THRESHOLDS: EscalationThresholds = {
  warning: 5,
  escalate: 10,
  critical: 15,
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  warning: false,
  escalate: true,
  critical: true,
};

const NOTIFICATION_PREFS_KEY = "supervisor_notification_preferences";

export const SupervisorDashboard = () => {
  const [escalatedCalls, setEscalatedCalls] = useState<QueuedCall[]>([]);
  const [allQueuedCalls, setAllQueuedCalls] = useState<QueuedCall[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [thresholds, setThresholds] = useState<EscalationThresholds>(DEFAULT_THRESHOLDS);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATION_PREFS_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_NOTIFICATION_PREFS;
    } catch {
      return DEFAULT_NOTIFICATION_PREFS;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [assigningCallId, setAssigningCallId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousEscalatedCount = useRef(0);
  const notifiedCallIds = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  const { permission, isSupported, requestPermission, showNotification } = useDesktopNotifications();

  const updateNotificationPref = (level: keyof NotificationPreferences, enabled: boolean) => {
    const newPrefs = { ...notificationPrefs, [level]: enabled };
    setNotificationPrefs(newPrefs);
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(newPrefs));
    toast({
      title: "Preferences Updated",
      description: `${level.charAt(0).toUpperCase() + level.slice(1)} notifications ${enabled ? "enabled" : "disabled"}`,
    });
  };

  const sendTestNotification = () => {
    showNotification("🧪 Test Notification", {
      body: "Desktop notifications are working correctly!\nYou will receive alerts for escalated calls.",
      tag: "test-notification",
    });
    toast({
      title: "Test Notification Sent",
      description: "Check your desktop for the notification",
    });
  };

  const fetchEscalationSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("escalation_settings")
        .select("*")
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setThresholds({
          warning: data.warning_threshold_minutes,
          escalate: data.escalate_threshold_minutes,
          critical: data.critical_threshold_minutes,
        });
      }
    } catch (error) {
      console.error("Error fetching escalation settings:", error);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("agent_status")
        .select("*")
        .order("status", { ascending: true });

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      console.error("Error fetching agents:", error);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("call_queue")
        .select(`
          *,
          clients!inner (name, phone)
        `)
        .order("priority_level", { ascending: false })
        .order("queue_position", { ascending: true });

      if (error) throw error;

      const now = new Date();
      const calls = normalizeQueuedCalls(data as any);
      setAllQueuedCalls(calls);
      
      // Categorize calls by escalation level
      const categorizedCalls = calls.map(call => {
        const createdAt = new Date(call.created_at);
        const waitTimeMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
        let level: keyof NotificationPreferences = "warning";
        if (waitTimeMinutes >= thresholds.critical) level = "critical";
        else if (waitTimeMinutes >= thresholds.escalate) level = "escalate";
        else if (waitTimeMinutes >= thresholds.warning) level = "warning";
        return { call, waitTimeMinutes, level };
      });

      // Filter escalated calls (at or above escalate threshold)
      const escalated = categorizedCalls
        .filter(({ waitTimeMinutes }) => waitTimeMinutes >= thresholds.escalate)
        .map(({ call }) => call);
      
      // Find newly escalated calls that we haven't notified about yet
      const newEscalatedCalls = categorizedCalls.filter(
        ({ call, waitTimeMinutes }) => 
          waitTimeMinutes >= thresholds.warning && !notifiedCallIds.current.has(call.id)
      );
      
      // Play alert sound and show notifications for new escalations
      if (newEscalatedCalls.length > 0 && previousEscalatedCount.current !== 0) {
        playAlertSound();
        
        // Show toast notification
        toast({
          title: "New Escalated Call",
          description: `${newEscalatedCalls.length} call(s) reached escalation threshold`,
          variant: "destructive",
        });
        
        // Show desktop push notification based on preferences
        newEscalatedCalls.forEach(({ call, waitTimeMinutes, level }) => {
          // Only show notification if user has enabled notifications for this level
          if (notificationPrefs[level]) {
            const waitTime = Math.round(waitTimeMinutes);
            const levelEmoji = level === "critical" ? "🔴" : level === "escalate" ? "🟠" : "🟡";
            const clientLabel = call.clients
              ? `${call.clients.name} (${call.clients.phone})`
              : "Unknown client";
            showNotification(`${levelEmoji} ${level.toUpperCase()}: Call Requires Attention`, {
              body: `${clientLabel} - Waiting ${waitTime} min\nPriority: ${call.priority_level.toUpperCase()} | Type: ${call.call_type}`,
              tag: `escalated-call-${call.id}`,
            });
          }
          notifiedCallIds.current.add(call.id);
        });
      }
      
      // Clean up notified IDs for calls no longer in escalated list
      const currentEscalatedIds = new Set(escalated.map(c => c.id));
      notifiedCallIds.current.forEach(id => {
        if (!currentEscalatedIds.has(id)) {
          notifiedCallIds.current.delete(id);
        }
      });
      
      previousEscalatedCount.current = escalated.length;
      
      setEscalatedCalls(escalated);
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Error fetching queue:", error);
    }
  }, [thresholds.escalate, toast, showNotification]);

  const playAlertSound = () => {
    // Create a simple beep sound
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 200);
    } catch (error) {
      console.error("Error playing alert sound:", error);
    }
  };

  const oneClickAssign = async (call: QueuedCall, agentEmail: string) => {
    setAssigningCallId(call.id);
    try {
      // Create outbound call record
      const { data: newCall, error: callError } = await supabase
        .from("outbound_calls")
        .insert({
          client_id: call.client_id,
          phone_number: call.clients.phone,
          agent_email: agentEmail,
          call_status: "in_progress",
          priority_level: call.priority_level,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (callError) throw callError;

      // Update agent status
      await supabase
        .from("agent_status")
        .update({
          status: "on_call",
          current_call_id: newCall.id,
        })
        .eq("agent_email", agentEmail);

      // Remove from queue
      await supabase.from("call_queue").delete().eq("id", call.id);

      toast({
        title: "Call Assigned",
        description: `${call.clients.name} assigned to ${agentEmail}`,
      });

      fetchQueue();
      fetchAgents();
    } catch (error) {
      console.error("Error assigning call:", error);
      toast({
        title: "Assignment Failed",
        description: "Could not assign call to agent",
        variant: "destructive",
      });
    } finally {
      setAssigningCallId(null);
    }
  };

  const smartAssignCall = async (call: QueuedCall) => {
    setAssigningCallId(call.id);
    try {
      const { data: routingData, error: routingError } = await supabase.functions.invoke(
        "smart-call-routing",
        {
          body: {
            callType: call.call_type,
            priority: call.priority_level,
            clientId: call.client_id,
          },
        }
      );

      if (routingError || !routingData?.success) {
        throw new Error(routingData?.message || "Routing failed");
      }

      await oneClickAssign(call, routingData.recommended_agent);
    } catch (error: any) {
      console.error("Error in smart assignment:", error);
      toast({
        title: "Smart Assignment Failed",
        description: error.message || "No available agent for this call",
        variant: "destructive",
      });
      setAssigningCallId(null);
    }
  };

  useEffect(() => {
    fetchEscalationSettings();
    fetchAgents();
    fetchQueue();

    // Refresh data every 10 seconds
    const refreshInterval = setInterval(() => {
      fetchQueue();
      fetchAgents();
    }, 10000);

    // Set up real-time subscriptions
    const queueChannel = supabase
      .channel("supervisor-queue-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_queue" }, () => fetchQueue())
      .subscribe();

    const agentChannel = supabase
      .channel("supervisor-agent-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_status" }, () => fetchAgents())
      .subscribe();

    const callsChannel = supabase
      .channel("supervisor-calls-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "outbound_calls" }, () => fetchQueue())
      .subscribe();

    const escalationChannel = supabase
      .channel("supervisor-escalation-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "escalation_settings" }, () => fetchEscalationSettings())
      .subscribe();

    // Re-render wait-time cells/badges every 30s
    const tickInterval = setInterval(() => setLastRefresh(new Date()), 30000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(tickInterval);
      supabase.removeChannel(queueChannel);
      supabase.removeChannel(agentChannel);
      supabase.removeChannel(callsChannel);
      supabase.removeChannel(escalationChannel);
    };
  }, [fetchEscalationSettings, fetchAgents, fetchQueue]);

  const getWaitTime = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    return Math.round((now.getTime() - created.getTime()) / (1000 * 60));
  };

  const getEscalationLevel = (waitMinutes: number) => {
    if (waitMinutes >= thresholds.critical) return "critical";
    if (waitMinutes >= thresholds.escalate) return "escalated";
    if (waitMinutes >= thresholds.warning) return "warning";
    return "normal";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "available":
        return <Circle className="h-3 w-3 fill-green-500 text-green-500" />;
      case "on_call":
        return <PhoneCall className="h-3 w-3 text-blue-500" />;
      case "on_break":
        return <Clock className="h-3 w-3 text-yellow-500" />;
      default:
        return <XCircle className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const availableAgents = agents.filter((a) => a.status === "available");
  const onCallAgents = agents.filter((a) => a.status === "on_call");
  const criticalCalls = escalatedCalls.filter((c) => getWaitTime(c.created_at) >= thresholds.critical);

  return (
    <div className="space-y-6">
      {/* Notification Permission Banner */}
      {isSupported && permission !== "granted" && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BellRing className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold">Enable Desktop Notifications</h3>
                  <p className="text-sm text-muted-foreground">
                    {permission === "denied" 
                      ? "Notifications were blocked. Please enable them in your browser settings."
                      : "Get alerted about escalated calls even when this tab is in the background"}
                  </p>
                </div>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={async () => {
                  const granted = await requestPermission();
                  if (granted) {
                    toast({
                      title: "Notifications Enabled",
                      description: "You will now receive desktop alerts for escalated calls",
                    });
                  } else {
                    toast({
                      title: "Notifications Not Enabled",
                      description: "Please allow notifications in your browser to receive alerts",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={permission === "denied"}
              >
                <Bell className="h-4 w-4 mr-2" />
                {permission === "denied" ? "Blocked" : "Enable Notifications"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notification Settings Card - shown when notifications are enabled */}
      {isSupported && permission === "granted" && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <h3 className="font-semibold">Desktop Notifications Enabled</h3>
                  <p className="text-sm text-muted-foreground">
                    Receiving alerts for: {[
                      notificationPrefs.critical && "Critical",
                      notificationPrefs.escalate && "Escalate", 
                      notificationPrefs.warning && "Warning"
                    ].filter(Boolean).join(", ") || "None"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendTestNotification}
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  Test
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Preferences
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="end">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">Notification Levels</h4>
                        <p className="text-xs text-muted-foreground mb-3">
                          Choose which escalation levels trigger desktop notifications
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-destructive" />
                            <Label htmlFor="critical-notif" className="text-sm font-medium">
                              Critical ({thresholds.critical}+ min)
                            </Label>
                          </div>
                          <Checkbox
                            id="critical-notif"
                            checked={notificationPrefs.critical}
                            onCheckedChange={(checked) => updateNotificationPref("critical", !!checked)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-orange-500" />
                            <Label htmlFor="escalate-notif" className="text-sm font-medium">
                              Escalate ({thresholds.escalate}+ min)
                            </Label>
                          </div>
                          <Checkbox
                            id="escalate-notif"
                            checked={notificationPrefs.escalate}
                            onCheckedChange={(checked) => updateNotificationPref("escalate", !!checked)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                            <Label htmlFor="warning-notif" className="text-sm font-medium">
                              Warning ({thresholds.warning}+ min)
                            </Label>
                          </div>
                          <Checkbox
                            id="warning-notif"
                            checked={notificationPrefs.warning}
                            onCheckedChange={(checked) => updateNotificationPref("warning", !!checked)}
                          />
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Alert Banner */}
      {escalatedCalls.length > 0 && (
        <Card className="border-destructive bg-destructive/10 animate-pulse">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-6 w-6 text-destructive animate-bounce" />
                <div>
                  <h3 className="font-bold text-destructive">
                    {escalatedCalls.length} Escalated Call{escalatedCalls.length !== 1 ? "s" : ""} Require Attention
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {criticalCalls.length > 0 && `${criticalCalls.length} critical • `}
                    Last updated: {lastRefresh.toLocaleTimeString()}
                    {permission === "granted" && " • Desktop notifications enabled"}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchQueue();
                  fetchAgents();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{availableAgents.length}</p>
                <p className="text-sm text-muted-foreground">Available Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{onCallAgents.length}</p>
                <p className="text-sm text-muted-foreground">On Call</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{allQueuedCalls.length}</p>
                <p className="text-sm text-muted-foreground">In Queue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={escalatedCalls.length > 0 ? "border-destructive" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${escalatedCalls.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              <div>
                <p className={`text-2xl font-bold ${escalatedCalls.length > 0 ? "text-destructive" : ""}`}>
                  {escalatedCalls.length}
                </p>
                <p className="text-sm text-muted-foreground">Escalated</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Escalated Calls - Priority View */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-destructive" />
                Escalated Calls - One-Click Assignment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {escalatedCalls.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>No escalated calls - All clear!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {escalatedCalls.map((call) => {
                    const waitTime = getWaitTime(call.created_at);
                    const level = getEscalationLevel(waitTime);
                    const isAssigning = assigningCallId === call.id;

                    return (
                      <div
                        key={call.id}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          level === "critical"
                            ? "border-destructive bg-destructive/5 animate-pulse"
                            : "border-orange-500 bg-orange-500/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-lg">{call.clients.name}</span>
                              <Badge variant={level === "critical" ? "destructive" : "default"}>
                                {call.priority_level.toUpperCase()}
                              </Badge>
                              <Badge variant="outline">{call.call_type}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {call.clients.phone}
                              </span>
                              <span className={`flex items-center gap-1 font-medium ${
                                level === "critical" ? "text-destructive" : "text-orange-500"
                              }`}>
                                <Clock className="h-3 w-3" />
                                Waiting {waitTime} min
                              </span>
                            </div>
                            {/* Wait time progress bar */}
                            <div className="mt-2">
                              <Progress 
                                value={Math.min((waitTime / thresholds.critical) * 100, 100)} 
                                className={`h-2 ${level === "critical" ? "[&>div]:bg-destructive" : "[&>div]:bg-orange-500"}`}
                              />
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => smartAssignCall(call)}
                              disabled={isAssigning || availableAgents.length === 0}
                            >
                              {isAssigning ? (
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Zap className="h-4 w-4 mr-1" />
                              )}
                              Smart Assign
                            </Button>
                            {availableAgents.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {availableAgents.slice(0, 3).map((agent) => (
                                  <Button
                                    key={agent.id}
                                    size="sm"
                                    variant="outline"
                                    className="text-xs"
                                    onClick={() => oneClickAssign(call, agent.agent_email)}
                                    disabled={isAssigning}
                                  >
                                    <UserCheck className="h-3 w-3 mr-1" />
                                    {agent.agent_email.split("@")[0]}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Agent Availability Panel */}
        <div>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Agent Availability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {agents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No agents registered</p>
                ) : (
                  agents.map((agent) => (
                    <div
                      key={agent.id}
                      className={`p-3 rounded-lg border transition-all ${
                        agent.status === "available"
                          ? "bg-green-500/10 border-green-500/30"
                          : agent.status === "on_call"
                          ? "bg-blue-500/10 border-blue-500/30"
                          : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(agent.status)}
                          <span className="font-medium text-sm">
                            {agent.agent_email.split("@")[0]}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            agent.status === "available"
                              ? "border-green-500 text-green-500"
                              : agent.status === "on_call"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }`}
                        >
                          {agent.status.replace("_", " ")}
                        </Badge>
                      </div>
                      {agent.success_rate && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Success: {agent.success_rate}% • Calls: {agent.total_calls_handled || 0}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* All Queued Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Full Queue Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Position</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Wait Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allQueuedCalls.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Queue is empty
                  </TableCell>
                </TableRow>
              ) : (
                allQueuedCalls.map((call, index) => {
                  const waitTime = getWaitTime(call.created_at);
                  const level = getEscalationLevel(waitTime);
                  const isAssigning = assigningCallId === call.id;

                  return (
                    <TableRow 
                      key={call.id}
                      className={level !== "normal" ? "bg-destructive/5" : ""}
                    >
                      <TableCell>#{index + 1}</TableCell>
                      <TableCell className="font-medium">{call.clients.name}</TableCell>
                      <TableCell>{call.clients.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{call.call_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={call.priority_level === "emergency" || call.priority_level === "urgent" ? "destructive" : "secondary"}>
                          {call.priority_level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${
                          level === "critical" ? "text-destructive" : 
                          level === "escalated" ? "text-orange-500" : 
                          level === "warning" ? "text-yellow-600" : ""
                        }`}>
                          {waitTime} min
                        </span>
                      </TableCell>
                      <TableCell>
                        {level === "critical" && (
                          <Badge variant="destructive" className="animate-pulse">CRITICAL</Badge>
                        )}
                        {level === "escalated" && (
                          <Badge className="bg-orange-500">ESCALATED</Badge>
                        )}
                        {level === "warning" && (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-600">WARNING</Badge>
                        )}
                        {level === "normal" && (
                          <Badge variant="secondary">Normal</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={level !== "normal" ? "default" : "outline"}
                          onClick={() => smartAssignCall(call)}
                          disabled={isAssigning || availableAgents.length === 0}
                        >
                          {isAssigning ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
