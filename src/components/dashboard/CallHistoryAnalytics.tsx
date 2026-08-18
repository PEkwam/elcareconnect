import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Phone, TrendingUp, Calendar, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { format, startOfDay, startOfWeek } from "date-fns";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

interface CallAnalytics {
  totalCalls: number;
  avgDuration: number;
  successRate: number;
  totalRevenue: number;
  peakHours: string;
}

interface CallHistoryItem {
  id: string;
  phone_number: string;
  call_status: string;
  call_duration: number | null;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  clients: {
    name: string;
  };
  call_campaigns: {
    name: string;
    type: string;
  };
}

const CallHistoryAnalytics = () => {
  const [filter, setFilter] = useState<'today' | 'week' | 'all'>('today');
  const [analytics, setAnalytics] = useState<CallAnalytics>({
    totalCalls: 0,
    avgDuration: 0,
    successRate: 0,
    totalRevenue: 0,
    peakHours: 'N/A',
  });
  const [recentCalls, setRecentCalls] = useState<CallHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
  }, [filter]);

  useRealtimeRefresh(["outbound_calls"], () => fetchAnalytics());

  const getDateRange = () => {
    const now = new Date();
    switch (filter) {
      case 'today':
        return { start: startOfDay(now), end: now };
      case 'week':
        return { start: startOfWeek(now), end: now };
      case 'all':
        return { start: new Date('2020-01-01'), end: now };
      default:
        return { start: startOfDay(now), end: now };
    }
  };

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const { start, end } = getDateRange();
      
      // Fetch call data for the date range
      const { data: calls, error } = await supabase
        .from("outbound_calls")
        .select(`
          id,
          phone_number,
          call_status,
          call_duration,
          outcome,
          started_at,
          ended_at,
          clients (name),
          call_campaigns (name, type)
        `)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      const callData = calls || [];

      // Total Calls card = today's successful + in-progress calls (using local-day window converted to UTC)
      const countedForTotal = callData.filter(
        (c) =>
          c.call_status === "in_progress" ||
          c.outcome === "successful" ||
          c.outcome === "payment_scheduled"
      );
      const totalCalls = countedForTotal.length;
      const completedCalls = callData.filter(call => call.call_status === 'completed');
      const totalDuration = completedCalls.reduce((sum, call) => sum + (call.call_duration || 0), 0);
      const avgDuration = completedCalls.length > 0 ? Math.round(totalDuration / completedCalls.length) : 0;
      const successfulCalls = callData.filter(call => call.outcome === 'successful' || call.outcome === 'payment_scheduled');
      const successRate = totalCalls > 0 ? Math.round((successfulCalls.length / totalCalls) * 100) : 0;
      
      // Calculate peak hours from actual call data
      const hourCounts: Record<number, number> = {};
      callData.forEach(call => {
        if (call.started_at) {
          const hour = new Date(call.started_at).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
      });
      
      let peakHours = 'N/A';
      if (Object.keys(hourCounts).length > 0) {
        const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
        const peakHour = parseInt(sortedHours[0][0]);
        const endHour = (peakHour + 2) % 24;
        const formatHour = (h: number) => {
          const period = h >= 12 ? 'PM' : 'AM';
          const hour12 = h % 12 || 12;
          return `${hour12} ${period}`;
        };
        peakHours = `${formatHour(peakHour)}-${formatHour(endHour)}`;
      }
      
      setAnalytics({
        totalCalls,
        avgDuration,
        successRate,
        totalRevenue: 0,
        peakHours,
      });

      setRecentCalls(callData.slice(0, 10));
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast({
        title: "Error",
        description: "Failed to fetch call analytics",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      completed: "default",
      in_progress: "secondary",
      scheduled: "outline",
      failed: "destructive",
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "outline"}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return <Badge variant="outline">No outcome</Badge>;
    
    const variants = {
      successful: "default",
      payment_scheduled: "secondary",
      no_answer: "outline",
      busy: "outline",
      voicemail: "outline",
      declined: "destructive",
    } as const;
    
    return (
      <Badge variant={variants[outcome as keyof typeof variants] || "outline"}>
        {outcome.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filter Buttons */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Filter by:</span>
        <div className="flex gap-2">
          {(['today', 'week', 'all'] as const).map((period) => (
            <Button
              key={period}
              variant={filter === period ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(period)}
            >
              {period === 'today' ? 'Today' : period === 'week' ? 'This Week' : 'All'}
            </Button>
          ))}
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Calls
            </CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {analytics.totalCalls}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {filter === 'today' ? 'Today' : filter === 'week' ? 'This week' : 'All time'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Duration
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary-foreground">
              {formatDuration(analytics.avgDuration)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Per completed call
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent-foreground">
              {analytics.successRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Successful outcomes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Peak Hours
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {analytics.peakHours}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Most active period
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Recent Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="text-sm text-muted-foreground">Loading call history...</div>
            </div>
          ) : recentCalls.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCalls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-medium">
                      {call.clients?.name ?? '—'}
                    </TableCell>
                    <TableCell>{call.phone_number}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{call.call_campaigns?.name ?? '—'}</div>
                        {call.call_campaigns?.type && (
                          <Badge variant="outline" className="text-xs">
                            {call.call_campaigns.type}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(call.call_status)}</TableCell>
                    <TableCell>{getOutcomeBadge(call.outcome)}</TableCell>
                    <TableCell>{formatDuration(call.call_duration)}</TableCell>
                    <TableCell>
                      {call.started_at ? format(new Date(call.started_at), 'MM/dd HH:mm') : 'Not started'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No calls found for the selected period
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CallHistoryAnalytics;