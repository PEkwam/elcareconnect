import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Activity, TrendingUp, Users, Phone, Clock, AlertCircle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AnalyticsData {
  activeCalls: number;
  availableAgents: number;
  queuedCalls: number;
  avgWaitTime: number;
  totalCallsToday: number;
  escalations: number;
  sentimentDistribution: { sentiment: string; count: number }[];
  callsPerHour: { hour: string; count: number }[];
  agentPerformance: { name: string; success_rate: number; calls: number }[];
}

export const RealtimeAnalyticsDashboard = () => {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    activeCalls: 0,
    availableAgents: 0,
    queuedCalls: 0,
    avgWaitTime: 0,
    totalCallsToday: 0,
    escalations: 0,
    sentimentDistribution: [],
    callsPerHour: [],
    agentPerformance: []
  });

  const fetchAnalytics = async () => {
    try {
      // Get active calls
      const { data: activeCalls } = await supabase
        .from('outbound_calls')
        .select('id')
        .eq('call_status', 'in-progress');

      // Get available agents
      const { data: agents } = await supabase
        .from('agent_status')
        .select('*');

      const availableAgents = agents?.filter(a => a.status === 'available').length || 0;

      // Get queued calls
      const { data: queuedCalls } = await supabase
        .from('call_queue')
        .select('*');

      // Get today's calls
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: todayCalls } = await supabase
        .from('outbound_calls')
        .select('*')
        .gte('created_at', today.toISOString());

      // Get escalations
      const { data: escalations } = await supabase
        .from('outbound_calls')
        .select('id')
        .eq('escalation_flagged', true)
        .gte('created_at', today.toISOString());

      // Get sentiment distribution
      const { data: sentimentData } = await supabase
        .from('outbound_calls')
        .select('sentiment')
        .not('sentiment', 'is', null)
        .gte('created_at', today.toISOString());

      const sentimentCounts = (sentimentData || []).reduce((acc, call) => {
        acc[call.sentiment] = (acc[call.sentiment] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const sentimentDistribution = Object.entries(sentimentCounts).map(([sentiment, count]) => ({
        sentiment,
        count
      }));

      // Get calls per hour (last 24 hours)
      const callsPerHour = Array.from({ length: 24 }, (_, i) => {
        const hour = new Date();
        hour.setHours(hour.getHours() - (23 - i), 0, 0, 0);
        const nextHour = new Date(hour);
        nextHour.setHours(nextHour.getHours() + 1);

        const callsInHour = todayCalls?.filter(call => {
          const callTime = new Date(call.created_at);
          return callTime >= hour && callTime < nextHour;
        }).length || 0;

        return {
          hour: hour.getHours().toString().padStart(2, '0') + ':00',
          count: callsInHour
        };
      });

      // Get top 5 agents by success rate (sort before slicing)
      const agentPerformance = (agents || [])
        .map(agent => ({
          name: (agent.agent_email || '').split('@')[0],
          success_rate: (agent.success_rate || 0) * 100,
          calls: agent.total_calls_handled || 0
        }))
        .sort((a, b) => b.success_rate - a.success_rate || b.calls - a.calls)
        .slice(0, 5);

      // Calculate average wait time
      const avgWaitTime = queuedCalls?.reduce((sum, call) => 
        sum + (call.estimated_wait_time || 0), 0) / (queuedCalls?.length || 1) || 0;

      setAnalytics({
        activeCalls: activeCalls?.length || 0,
        availableAgents,
        queuedCalls: queuedCalls?.length || 0,
        avgWaitTime: Math.round(avgWaitTime),
        totalCallsToday: todayCalls?.length || 0,
        escalations: escalations?.length || 0,
        sentimentDistribution,
        callsPerHour: callsPerHour.slice(-12), // Last 12 hours
        agentPerformance
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load analytics data',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchAnalytics();

    // Set up real-time subscriptions
    const callsChannel = supabase
      .channel('analytics-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outbound_calls' }, fetchAnalytics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_status' }, fetchAnalytics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_queue' }, fetchAnalytics)
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000);

    return () => {
      supabase.removeChannel(callsChannel);
      clearInterval(interval);
    };
  }, []);

  const COLORS = {
    positive: 'hsl(var(--chart-1))',
    neutral: 'hsl(var(--chart-2))',
    negative: 'hsl(var(--chart-3))'
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
            <Phone className="h-4 w-4 text-primary animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.activeCalls}</div>
            <p className="text-xs text-muted-foreground">Currently in progress</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Agents</CardTitle>
            <Users className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.availableAgents}</div>
            <p className="text-xs text-muted-foreground">Ready to take calls</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queue Length</CardTitle>
            <Clock className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.queuedCalls}</div>
            <p className="text-xs text-muted-foreground">Avg wait: {analytics.avgWaitTime}s</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calls Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-chart-1" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalCallsToday}</div>
            <p className="text-xs text-muted-foreground">Total completed</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Escalations</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.escalations}</div>
            <p className="text-xs text-muted-foreground">Flagged for review</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Online</div>
            <p className="text-xs text-muted-foreground">All systems operational</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calls Per Hour</CardTitle>
            <CardDescription>Last 12 hours activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.callsPerHour}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} name="Calls" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sentiment Distribution</CardTitle>
            <CardDescription>Call sentiment analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.sentimentDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ sentiment, percent }) => `${sentiment}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {analytics.sentimentDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.sentiment as keyof typeof COLORS] || 'hsl(var(--muted))'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Top Agent Performance</CardTitle>
            <CardDescription>Success rate and call volume</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.agentPerformance}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Bar dataKey="success_rate" fill="hsl(var(--chart-1))" name="Success Rate %" />
                <Bar dataKey="calls" fill="hsl(var(--chart-2))" name="Total Calls" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};