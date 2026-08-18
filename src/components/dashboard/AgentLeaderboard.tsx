import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Trophy,
  Medal,
  Star,
  Flame,
  Target,
  Zap,
  Crown,
  TrendingUp,
  Phone,
  ThumbsUp,
  Award,
  CheckCircle,
  XCircle,
  Timer,
  BarChart3,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface AgentStats {
  agent_email: string;
  total_calls_handled: number;
  success_rate: number;
  avg_resolution_time_minutes: number;
  points: number;
  streak_days: number;
  achievements: unknown[];
  status: string;
  // Extended stats
  calls_today: number;
  calls_this_week: number;
  successful_calls: number;
  failed_calls: number;
  inbound_calls: number;
  outbound_calls: number;
  avg_call_duration: number;
  customer_satisfaction: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  requirement: (stats: AgentStats) => boolean;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_call",
    name: "First Steps",
    description: "Complete your first call",
    icon: <Phone className="h-4 w-4" />,
    color: "bg-blue-500",
    requirement: (stats) => stats.total_calls_handled >= 1,
  },
  {
    id: "call_champion",
    name: "Call Champion",
    description: "Handle 50 calls",
    icon: <Trophy className="h-4 w-4" />,
    color: "bg-yellow-500",
    requirement: (stats) => stats.total_calls_handled >= 50,
  },
  {
    id: "century_club",
    name: "Century Club",
    description: "Handle 100 calls",
    icon: <Crown className="h-4 w-4" />,
    color: "bg-purple-500",
    requirement: (stats) => stats.total_calls_handled >= 100,
  },
  {
    id: "speed_demon",
    name: "Speed Demon",
    description: "Avg resolution under 5 min",
    icon: <Zap className="h-4 w-4" />,
    color: "bg-orange-500",
    requirement: (stats) => stats.avg_resolution_time_minutes < 5 && stats.total_calls_handled > 10,
  },
  {
    id: "perfectionist",
    name: "Perfectionist",
    description: "90%+ success rate",
    icon: <Target className="h-4 w-4" />,
    color: "bg-green-500",
    requirement: (stats) => (stats.success_rate || 0) >= 90 && stats.total_calls_handled > 20,
  },
  {
    id: "on_fire",
    name: "On Fire",
    description: "5 day streak",
    icon: <Flame className="h-4 w-4" />,
    color: "bg-red-500",
    requirement: (stats) => stats.streak_days >= 5,
  },
  {
    id: "rising_star",
    name: "Rising Star",
    description: "Earn 500 points",
    icon: <Star className="h-4 w-4" />,
    color: "bg-indigo-500",
    requirement: (stats) => stats.points >= 500,
  },
  {
    id: "legend",
    name: "Legend",
    description: "Earn 1000 points",
    icon: <Medal className="h-4 w-4" />,
    color: "bg-gradient-to-r from-yellow-400 to-orange-500",
    requirement: (stats) => stats.points >= 1000,
  },
];



export const AgentLeaderboard = () => {
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [callStats, setCallStats] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"points" | "calls" | "success" | "speed">("points");
  const { toast } = useToast();

  useEffect(() => {
    fetchAgentStats();
    fetchCallStats();

    const channel = supabase
      .channel("agent-leaderboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_status" },
        () => fetchAgentStats()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "outbound_calls" },
        () => fetchCallStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCallStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: calls, error } = await supabase
        .from("outbound_calls")
        .select("agent_email, call_status, outcome, call_duration, customer_satisfaction, created_at")
        .gte("created_at", weekAgo.toISOString());

      if (error) throw error;

      const stats: Record<string, any> = {};
      
      (calls || []).forEach((call) => {
        if (!call.agent_email) return;
        
        if (!stats[call.agent_email]) {
          stats[call.agent_email] = {
            calls_today: 0,
            calls_this_week: 0,
            successful_calls: 0,
            failed_calls: 0,
            total_duration: 0,
            call_count_with_duration: 0,
            satisfaction_sum: 0,
            satisfaction_count: 0,
          };
        }

        const s = stats[call.agent_email];
        const callDate = new Date(call.created_at);
        
        s.calls_this_week++;
        if (callDate >= today) {
          s.calls_today++;
        }

        if (call.outcome === "success" || call.call_status === "completed") {
          s.successful_calls++;
        } else if (call.outcome === "failed" || call.call_status === "failed") {
          s.failed_calls++;
        }

        if (call.call_duration) {
          s.total_duration += call.call_duration;
          s.call_count_with_duration++;
        }

        if (call.customer_satisfaction) {
          s.satisfaction_sum += call.customer_satisfaction;
          s.satisfaction_count++;
        }
      });

      setCallStats(stats);
    } catch (error) {
      console.error("Error fetching call stats:", error);
    }
  };

  const fetchAgentStats = async () => {
    try {
      const { data, error } = await supabase
        .from("agent_status")
        .select("*")
        .order("total_calls_handled", { ascending: false });

      if (error) throw error;

      const agentsWithPoints = (data || []).map((agent) => {
        const calculatedPoints =
          (agent.total_calls_handled || 0) * 10 +
          (agent.success_rate || 0) * 5 +
          Math.max(0, 30 - (agent.avg_resolution_time_minutes || 30)) * 2;

        const agentCallStats = callStats[agent.agent_email] || {};

        return {
          agent_email: agent.agent_email,
          total_calls_handled: agent.total_calls_handled || 0,
          success_rate: agent.success_rate || 0,
          avg_resolution_time_minutes: agent.avg_resolution_time_minutes || 0,
          points: agent.points || Math.floor(calculatedPoints),
          streak_days: agent.streak_days || 0,
          achievements: Array.isArray(agent.achievements) ? agent.achievements : [],
          status: agent.status,
          calls_today: agentCallStats.calls_today || 0,
          calls_this_week: agentCallStats.calls_this_week || 0,
          successful_calls: agentCallStats.successful_calls || 0,
          failed_calls: agentCallStats.failed_calls || 0,
          inbound_calls: 0,
          outbound_calls: agentCallStats.calls_this_week || 0,
          avg_call_duration: agentCallStats.call_count_with_duration > 0 
            ? Math.round(agentCallStats.total_duration / agentCallStats.call_count_with_duration / 60) 
            : 0,
          customer_satisfaction: agentCallStats.satisfaction_count > 0
            ? Math.round((agentCallStats.satisfaction_sum / agentCallStats.satisfaction_count) * 20)
            : 0,
        } as AgentStats;
      });

      setAgents(agentsWithPoints);
    } catch (error) {
      console.error("Error fetching agent stats:", error);
      toast({
        title: "Error",
        description: "Failed to fetch leaderboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (Object.keys(callStats).length > 0) {
      fetchAgentStats();
    }
  }, [callStats]);

  const sortedAgents = [...agents].sort((a, b) => {
    switch (sortBy) {
      case "calls":
        return b.total_calls_handled - a.total_calls_handled;
      case "success":
        return b.success_rate - a.success_rate;
      case "speed":
        return (a.avg_resolution_time_minutes || 999) - (b.avg_resolution_time_minutes || 999);
      default:
        return b.points - a.points;
    }
  });

  const getRankBadge = (index: number) => {
    if (index === 0)
      return (
        <div className="flex items-center gap-1 text-yellow-500">
          <Crown className="h-5 w-5" />
          <span className="font-bold">1st</span>
        </div>
      );
    if (index === 1)
      return (
        <div className="flex items-center gap-1 text-gray-400">
          <Medal className="h-5 w-5" />
          <span className="font-bold">2nd</span>
        </div>
      );
    if (index === 2)
      return (
        <div className="flex items-center gap-1 text-amber-600">
          <Medal className="h-5 w-5" />
          <span className="font-bold">3rd</span>
        </div>
      );
    return <span className="text-muted-foreground font-medium">#{index + 1}</span>;
  };

  const getAgentInitials = (email: string) => {
    return email
      .split("@")[0]
      .split(".")
      .map((n) => n[0]?.toUpperCase())
      .join("")
      .slice(0, 2);
  };

  const getUnlockedAchievements = (agent: AgentStats) => {
    return ACHIEVEMENTS.filter((a) => a.requirement(agent));
  };

  // Calculate totals for overview
  const totalCalls = agents.reduce((sum, a) => sum + a.total_calls_handled, 0);
  const totalCallsToday = agents.reduce((sum, a) => sum + a.calls_today, 0);
  const totalCallsWeek = agents.reduce((sum, a) => sum + a.calls_this_week, 0);
  const avgSuccessRate = agents.length > 0 
    ? Math.round(agents.reduce((sum, a) => sum + a.success_rate, 0) / agents.length)
    : 0;
  const avgResolutionTime = agents.length > 0
    ? (agents.reduce((sum, a) => sum + (a.avg_resolution_time_minutes || 0), 0) / agents.length).toFixed(1)
    : "0";

  // Chart data
  const performanceChartData = sortedAgents.slice(0, 5).map((agent) => ({
    name: agent.agent_email.split("@")[0],
    calls: agent.total_calls_handled,
    success: agent.success_rate,
    points: agent.points,
  }));

  const outcomeData = [
    { name: "Successful", value: agents.reduce((sum, a) => sum + a.successful_calls, 0), color: "#10b981" },
    { name: "Failed", value: agents.reduce((sum, a) => sum + a.failed_calls, 0), color: "#ef4444" },
    { name: "Pending", value: Math.max(0, totalCallsWeek - agents.reduce((sum, a) => sum + a.successful_calls + a.failed_calls, 0)), color: "#f59e0b" },
  ].filter(d => d.value > 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-500/20">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{agents.length}</p>
                <p className="text-sm text-muted-foreground">Active Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/20">
                <Phone className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCalls}</p>
                <p className="text-sm text-muted-foreground">Total Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-500/20">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCallsToday}</p>
                <p className="text-sm text-muted-foreground">Calls Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-yellow-500/20">
                <Target className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{avgSuccessRate}%</p>
                <p className="text-sm text-muted-foreground">Avg Success</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-orange-500/20">
                <Timer className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{avgResolutionTime}m</p>
                <p className="text-sm text-muted-foreground">Avg Resolution</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Leaderboard Card */}
      <Card className="border-primary/20">
        <CardHeader className="bg-gradient-to-r from-primary/10 via-background to-accent/10">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-500" />
              Agent Leaderboard
            </CardTitle>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="points">By Points</SelectItem>
                <SelectItem value="calls">By Calls</SelectItem>
                <SelectItem value="success">By Success Rate</SelectItem>
                <SelectItem value="speed">By Speed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="rankings" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="rankings" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                Rankings
              </TabsTrigger>
              <TabsTrigger value="stats" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Statistics
              </TabsTrigger>
              <TabsTrigger value="charts" className="gap-2">
                <Target className="h-4 w-4" />
                Charts
              </TabsTrigger>
              <TabsTrigger value="achievements" className="gap-2">
                <Award className="h-4 w-4" />
                Achievements
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rankings" className="space-y-4">
              {sortedAgents.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No agent data available yet
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedAgents.slice(0, 10).map((agent, index) => (
                    <div
                      key={agent.agent_email}
                      className={`flex items-center gap-4 p-4 rounded-lg border transition-all hover:shadow-md ${
                        index === 0
                          ? "bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30"
                          : index === 1
                          ? "bg-gradient-to-r from-gray-300/10 to-gray-400/10 border-gray-400/30"
                          : index === 2
                          ? "bg-gradient-to-r from-amber-500/10 to-amber-600/10 border-amber-500/30"
                          : "bg-muted/30"
                      }`}
                    >
                      <div className="w-12 text-center">{getRankBadge(index)}</div>

                      <Avatar className="h-12 w-12 border-2 border-primary/20">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {getAgentInitials(agent.agent_email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{agent.agent_email}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {agent.total_calls_handled} total
                          </span>
                          <span className="flex items-center gap-1 text-green-500">
                            <CheckCircle className="h-3 w-3" />
                            {agent.successful_calls} success
                          </span>
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="h-3 w-3" />
                            {agent.success_rate}%
                          </span>
                          {agent.streak_days > 0 && (
                            <span className="flex items-center gap-1 text-orange-500">
                              <Flame className="h-3 w-3" />
                              {agent.streak_days} day streak
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="hidden md:flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="font-bold text-purple-500">{agent.calls_today}</p>
                          <p className="text-xs text-muted-foreground">Today</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-blue-500">{agent.calls_this_week}</p>
                          <p className="text-xs text-muted-foreground">This Week</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-orange-500">{agent.avg_call_duration}m</p>
                          <p className="text-xs text-muted-foreground">Avg Time</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {getUnlockedAchievements(agent)
                          .slice(0, 3)
                          .map((achievement) => (
                            <div
                              key={achievement.id}
                              className={`p-1.5 rounded-full ${achievement.color} text-white`}
                              title={achievement.name}
                            >
                              {achievement.icon}
                            </div>
                          ))}
                      </div>

                      <div className="text-right">
                        <div className="flex items-center gap-1 text-primary font-bold text-lg">
                          <Star className="h-4 w-4 fill-primary" />
                          {agent.points}
                        </div>
                        <p className="text-xs text-muted-foreground">points</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              {agents.map((agent) => (
                <div
                  key={agent.agent_email}
                  className="p-4 rounded-lg border bg-muted/20"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getAgentInitials(agent.agent_email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">{agent.agent_email}</p>
                      <Badge variant={agent.status === "available" ? "default" : "secondary"}>
                        {agent.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-primary font-bold">
                        <Star className="h-4 w-4 fill-primary" />
                        {agent.points} pts
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div className="text-center p-3 bg-background rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Phone className="h-4 w-4 text-blue-500" />
                      </div>
                      <p className="text-xl font-bold">{agent.total_calls_handled}</p>
                      <p className="text-xs text-muted-foreground">Total Calls</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <TrendingUp className="h-4 w-4 text-purple-500" />
                      </div>
                      <p className="text-xl font-bold">{agent.calls_today}</p>
                      <p className="text-xs text-muted-foreground">Today</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                      <p className="text-xl font-bold text-green-500">{agent.successful_calls}</p>
                      <p className="text-xs text-muted-foreground">Successful</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <XCircle className="h-4 w-4 text-red-500" />
                      </div>
                      <p className="text-xl font-bold text-red-500">{agent.failed_calls}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Target className="h-4 w-4 text-yellow-500" />
                      </div>
                      <p className="text-xl font-bold">{agent.success_rate}%</p>
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                      <Progress value={agent.success_rate} className="h-1 mt-1" />
                    </div>
                    <div className="text-center p-3 bg-background rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Timer className="h-4 w-4 text-orange-500" />
                      </div>
                      <p className="text-xl font-bold">{agent.avg_resolution_time_minutes?.toFixed(1) || "0"}m</p>
                      <p className="text-xs text-muted-foreground">Avg Resolution</p>
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="charts" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Performance Bar Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top 5 Agents - Calls & Success</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={performanceChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" className="text-xs" />
                          <YAxis className="text-xs" />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--background))', 
                              border: '1px solid hsl(var(--border))' 
                            }} 
                          />
                          <Bar dataKey="calls" fill="#3b82f6" name="Calls" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="success" fill="#10b981" name="Success %" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Call Outcomes Pie Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Call Outcomes This Week</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 flex items-center justify-center">
                      {outcomeData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={outcomeData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                              {outcomeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-muted-foreground">No data available</p>
                      )}
                    </div>
                    <div className="flex justify-center gap-4 mt-4">
                      {outcomeData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="text-sm">{entry.name}: {entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Points Chart */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Agent Points Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={performanceChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" className="text-xs" />
                          <YAxis dataKey="name" type="category" className="text-xs" width={80} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--background))', 
                              border: '1px solid hsl(var(--border))' 
                            }} 
                          />
                          <Bar dataKey="points" fill="#8b5cf6" name="Points" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="achievements" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {ACHIEVEMENTS.map((achievement) => {
                  const unlockedBy = agents.filter((a) =>
                    achievement.requirement(a)
                  ).length;
                  return (
                    <div
                      key={achievement.id}
                      className={`p-4 rounded-lg border text-center transition-all ${
                        unlockedBy > 0
                          ? "bg-gradient-to-b from-muted/50 to-background border-primary/30"
                          : "bg-muted/20 border-muted opacity-50"
                      }`}
                    >
                      <div
                        className={`mx-auto w-12 h-12 rounded-full ${achievement.color} flex items-center justify-center text-white mb-3`}
                      >
                        {achievement.icon}
                      </div>
                      <h4 className="font-semibold text-sm">{achievement.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {achievement.description}
                      </p>
                      <Badge variant="secondary" className="mt-2">
                        {unlockedBy} unlocked
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
