import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Users,
  Clock,
  Activity,
  PhoneCall,
  Circle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Headphones,
  Coffee,
  UserX,
  Bell,
  BellOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDesktopNotifications } from "@/hooks/useDesktopNotifications";
import { useToast } from "@/hooks/use-toast";

interface AgentStatus {
  id: string;
  agent_email: string;
  status: string;
  current_call_id: string | null;
  total_calls_handled: number | null;
  avg_resolution_time_minutes: number | null;
  success_rate: number | null;
  session_started_at: string | null;
  current_status_started_at: string | null;
}

import { normalizeQueuedCalls, type NormalizedQueuedCall as QueueItem } from "@/lib/supabaseNormalizers";

interface ActiveCall {
  id: string;
  phone_number: string;
  call_status: string;
  agent_email: string | null;
  started_at: string | null;
  priority_level: string | null;
  clients: { name: string } | null;
}

interface EscalationThresholds {
  warning: number;
  escalation: number;
  critical: number;
}

const SupervisorView = () => {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [thresholds, setThresholds] = useState<EscalationThresholds>({ warning: 5, escalation: 10, critical: 15 });
  const notifiedQueueItems = useRef<Set<string>>(new Set());
  const { permission, isSupported, requestPermission, showNotification } = useDesktopNotifications();
  const { toast } = useToast();

  // Fetch escalation thresholds
  useEffect(() => {
    const fetchThresholds = async () => {
      const { data } = await supabase
        .from("escalation_settings")
        .select("warning_threshold_minutes, escalate_threshold_minutes, critical_threshold_minutes")
        .limit(1)
        .maybeSingle();
      if (data) {
        setThresholds({
          warning: data.warning_threshold_minutes,
          escalation: data.escalate_threshold_minutes,
          critical: data.critical_threshold_minutes,
        });
      }
    };
    fetchThresholds();
  }, []);

  const fetchAgents = useCallback(async () => {
    const { data } = await supabase
      .from("agent_status")
      .select("*")
      .order("status");
    setAgents(data || []);
  }, []);

  const fetchQueue = useCallback(async () => {
    const { data } = await supabase
      .from("call_queue")
      .select("*, clients!inner(name, phone)")
      .order("priority_level", { ascending: false })
      .order("queue_position");
    setQueue(normalizeQueuedCalls(data as any));
  }, []);

  const fetchActiveCalls = useCallback(async () => {
    const { data } = await supabase
      .from("outbound_calls")
      .select("id, phone_number, call_status, agent_email, started_at, priority_level, clients(name)")
      .eq("call_status", "in_progress")
      .order("started_at", { ascending: false });
    setActiveCalls(data || []);
    setLastRefresh(new Date());
  }, []);

  // Check queue wait times and trigger notifications
  const checkEscalations = useCallback(() => {
    if (permission !== "granted") return;

    queue.forEach((q) => {
      const waitMin = Math.round((Date.now() - new Date(q.created_at).getTime()) / 60000);
      const itemKey = `${q.id}`;

      if (waitMin >= thresholds.critical && !notifiedQueueItems.current.has(`${itemKey}-critical`)) {
        notifiedQueueItems.current.add(`${itemKey}-critical`);
        showNotification("🚨 CRITICAL: Queue Wait Time", {
          body: `${q.clients.name} has been waiting ${waitMin}m (Critical threshold: ${thresholds.critical}m). Priority: ${q.priority_level}`,
          tag: `critical-${q.id}`,
          silent: false,
        });
      } else if (waitMin >= thresholds.escalation && !notifiedQueueItems.current.has(`${itemKey}-escalation`)) {
        notifiedQueueItems.current.add(`${itemKey}-escalation`);
        showNotification("⚠️ Escalation: Queue Wait Time", {
          body: `${q.clients.name} has been waiting ${waitMin}m (Escalation threshold: ${thresholds.escalation}m). Priority: ${q.priority_level}`,
          tag: `escalation-${q.id}`,
        });
      } else if (waitMin >= thresholds.warning && !notifiedQueueItems.current.has(`${itemKey}-warning`)) {
        notifiedQueueItems.current.add(`${itemKey}-warning`);
        showNotification("⏰ Warning: Queue Wait Time", {
          body: `${q.clients.name} has been waiting ${waitMin}m (Warning threshold: ${thresholds.warning}m). Priority: ${q.priority_level}`,
          tag: `warning-${q.id}`,
        });
      }
    });

    // Clean up notifications for items no longer in queue
    const currentIds = new Set(queue.map((q) => q.id));
    notifiedQueueItems.current.forEach((key) => {
      const id = key.split("-").slice(0, -1).join("-");
      if (!currentIds.has(id)) {
        notifiedQueueItems.current.delete(key);
      }
    });
  }, [queue, thresholds, permission, showNotification]);

  // Run escalation check when queue updates
  useEffect(() => {
    checkEscalations();
  }, [checkEscalations]);

  // Also check every 30s
  useEffect(() => {
    const interval = setInterval(checkEscalations, 30000);
    return () => clearInterval(interval);
  }, [checkEscalations]);

  useEffect(() => {
    fetchAgents();
    fetchQueue();
    fetchActiveCalls();

    const interval = setInterval(() => {
      fetchAgents();
      fetchQueue();
      fetchActiveCalls();
    }, 10000);

    const ch1 = supabase
      .channel("sv-agents")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_status" }, fetchAgents)
      .subscribe();
    const ch2 = supabase
      .channel("sv-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_queue" }, fetchQueue)
      .subscribe();
    const ch3 = supabase
      .channel("sv-calls")
      .on("postgres_changes", { event: "*", schema: "public", table: "outbound_calls" }, fetchActiveCalls)
      .subscribe();
    const ch4 = supabase
      .channel("sv-escalation")
      .on("postgres_changes", { event: "*", schema: "public", table: "escalation_settings" }, async () => {
        const { data } = await supabase
          .from("escalation_settings")
          .select("warning_threshold_minutes, escalate_threshold_minutes, critical_threshold_minutes")
          .limit(1)
          .maybeSingle();
        if (data) setThresholds({
          warning: data.warning_threshold_minutes,
          escalation: data.escalate_threshold_minutes,
          critical: data.critical_threshold_minutes,
        });
      })
      .subscribe();
    // Tick every 30s so wait-time cells re-render even without DB changes
    const tickInterval = setInterval(() => setLastRefresh(new Date()), 30000);

    return () => {
      clearInterval(interval);
      clearInterval(tickInterval);
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
      supabase.removeChannel(ch4);
    };
  }, [fetchAgents, fetchQueue, fetchActiveCalls]);

  const available = agents.filter((a) => a.status === "available");
  const onCall = agents.filter((a) => a.status === "on_call");
  const onBreak = agents.filter((a) => a.status === "on_break");
  const offline = agents.filter((a) => a.status === "offline");

  const getWaitMin = (createdAt: string) =>
    Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);

  const getDuration = (startedAt: string | null) => {
    if (!startedAt) return "—";
    const mins = Math.round((Date.now() - new Date(startedAt).getTime()) / 60000);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case "available": return <Circle className="h-3 w-3 fill-green-500 text-green-500" />;
      case "on_call": return <PhoneCall className="h-3 w-3 text-blue-500" />;
      case "on_break": return <Coffee className="h-3 w-3 text-yellow-500" />;
      default: return <XCircle className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case "critical": return "destructive";
      case "high": return "destructive";
      case "normal": return "secondary";
      default: return "outline";
    }
  };

  const getWaitBadge = (waitMin: number) => {
    if (waitMin >= thresholds.critical) return { variant: "destructive" as const, label: "CRITICAL", icon: <AlertTriangle className="h-3 w-3" /> };
    if (waitMin >= thresholds.escalation) return { variant: "destructive" as const, label: "ESCALATED", icon: <AlertTriangle className="h-3 w-3" /> };
    if (waitMin >= thresholds.warning) return { variant: "secondary" as const, label: "WARNING", icon: <Clock className="h-3 w-3" /> };
    return null;
  };

  const handleEnableNotifications = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast({ title: "Notifications enabled", description: "You'll be alerted when queue wait times exceed thresholds." });
    } else {
      toast({ title: "Notifications blocked", description: "Please enable notifications in your browser settings.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
                Supervisor Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Real-time monitoring · Last updated {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isSupported && permission !== "granted" && (
                <Button variant="outline" size="sm" className="gap-2" onClick={handleEnableNotifications}>
                  <Bell className="h-4 w-4" />
                  Enable Alerts
                </Button>
              )}
              {permission === "granted" && (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
                  <Bell className="h-3 w-3" />
                  Alerts On
                </Badge>
              )}
              <Badge variant="outline" className="gap-1">
                <Activity className="h-3 w-3 animate-pulse text-green-500" />
                Live
              </Badge>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard icon={<Users className="h-5 w-5 text-green-500" />} label="Available Agents" value={available.length} sub={`${agents.length} total`} color="green" />
          <KPICard icon={<Headphones className="h-5 w-5 text-blue-500" />} label="Active Calls" value={activeCalls.length} sub={`${onCall.length} agents on call`} color="blue" />
          <KPICard icon={<Clock className="h-5 w-5 text-yellow-500" />} label="Queue Size" value={queue.length} sub={queue.length > 0 ? `Avg wait ${Math.round(queue.reduce((s, q) => s + getWaitMin(q.created_at), 0) / queue.length)}m` : "No wait"} color="yellow" />
          <KPICard icon={<Coffee className="h-5 w-5 text-orange-500" />} label="On Break" value={onBreak.length} sub={`${offline.length} offline`} color="orange" />
        </div>

        {/* Agent Status & Utilization */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Agent Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {agents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No agents online</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Success</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-sm">{a.agent_email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {statusIcon(a.status)}
                            <span className="text-sm capitalize">{a.status.replace("_", " ")}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{a.total_calls_handled ?? 0}</TableCell>
                        <TableCell className="text-right">
                          {a.success_rate != null ? (
                            <div className="flex items-center gap-2 justify-end">
                              <Progress value={Number(a.success_rate)} className="w-16 h-2" />
                              <span className="text-xs text-muted-foreground w-8">{Number(a.success_rate).toFixed(0)}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Active Calls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-blue-500" />
                Active Calls
                {activeCalls.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">{activeCalls.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No active calls</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeCalls.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm font-medium">
                          {c.clients?.name || c.phone_number}
                        </TableCell>
                        <TableCell className="text-sm">{c.agent_email || "Unassigned"}</TableCell>
                        <TableCell className="text-right text-sm">{getDuration(c.started_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Call Queue
              {queue.length > 0 && (
                <Badge variant="secondary" className="ml-auto">{queue.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Queue is empty</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Alert</TableHead>
                    <TableHead className="text-right">Wait Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((q, i) => {
                    const wait = getWaitMin(q.created_at);
                    const escalationBadge = getWaitBadge(wait);
                    return (
                      <TableRow key={q.id} className={wait >= thresholds.critical ? "bg-destructive/10" : wait >= thresholds.escalation ? "bg-destructive/5" : wait >= thresholds.warning ? "bg-yellow-500/5" : ""}>
                        <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{q.clients.name}</TableCell>
                        <TableCell className="text-sm">{q.call_type}</TableCell>
                        <TableCell>
                          <Badge variant={priorityColor(q.priority_level) as any} className="text-xs">
                            {q.priority_level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {escalationBadge ? (
                            <Badge variant={escalationBadge.variant} className="gap-1 text-xs animate-pulse">
                              {escalationBadge.icon}
                              {escalationBadge.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">OK</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm ${wait >= thresholds.escalation ? "text-destructive font-semibold" : ""}`}>
                            {wait}m
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const KPICard = ({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: number; sub: string; color: string }) => (
  <Card className="relative overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 animate-fade-in group">
    <div className={`absolute top-0 right-0 w-16 h-16 bg-${color}-500/10 rounded-full blur-2xl`} />
    <CardHeader className="pb-2 pt-4 px-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <div className="p-1.5 rounded-md bg-muted">{icon}</div>
      </div>
    </CardHeader>
    <CardContent className="px-4 pb-4">
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </CardContent>
  </Card>
);

export default SupervisorView;
