import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { TrendingUp, Calendar } from "lucide-react";

interface SentimentData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  avgScore: number;
}

const COLORS = {
  positive: 'hsl(var(--chart-1))',
  neutral: 'hsl(var(--chart-2))',
  negative: 'hsl(var(--chart-3))'
};

export const SentimentTrendChart = () => {
  const [dailyData, setDailyData] = useState<SentimentData[]>([]);
  const [weeklyData, setWeeklyData] = useState<SentimentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSentimentData();
  }, []);

  const fetchSentimentData = async () => {
    setIsLoading(true);
    try {
      const { data: calls, error } = await supabase
        .from('outbound_calls')
        .select('created_at, sentiment, sentiment_score')
        .not('sentiment', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (calls && calls.length > 0) {
        const dailyAgg = aggregateByDay(calls);
        const weeklyAgg = aggregateByWeek(calls);
        
        setDailyData(dailyAgg);
        setWeeklyData(weeklyAgg);
      }
    } catch (error) {
      console.error('Error fetching sentiment data:', error);
      toast({
        title: "Error",
        description: "Failed to load sentiment trends",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const aggregateByDay = (calls: any[]): SentimentData[] => {
    const dayMap = new Map<string, { positive: number; neutral: number; negative: number; scores: number[] }>();

    calls.forEach(call => {
      const date = new Date(call.created_at).toISOString().split('T')[0];
      const current = dayMap.get(date) || { positive: 0, neutral: 0, negative: 0, scores: [] };
      
      if (call.sentiment === 'positive') current.positive++;
      else if (call.sentiment === 'neutral') current.neutral++;
      else if (call.sentiment === 'negative') current.negative++;
      
      if (call.sentiment_score !== null) {
        current.scores.push(call.sentiment_score);
      }
      
      dayMap.set(date, current);
    });

    return Array.from(dayMap.entries())
      .map(([date, counts]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        positive: counts.positive,
        neutral: counts.neutral,
        negative: counts.negative,
        total: counts.positive + counts.neutral + counts.negative,
        avgScore: counts.scores.length > 0 
          ? counts.scores.reduce((a, b) => a + b, 0) / counts.scores.length 
          : 0
      }))
      .reverse()
      .slice(-14); // Last 14 days
  };

  const aggregateByWeek = (calls: any[]): SentimentData[] => {
    const weekMap = new Map<string, { positive: number; neutral: number; negative: number; scores: number[] }>();

    calls.forEach(call => {
      const date = new Date(call.created_at);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      const current = weekMap.get(weekKey) || { positive: 0, neutral: 0, negative: 0, scores: [] };
      
      if (call.sentiment === 'positive') current.positive++;
      else if (call.sentiment === 'neutral') current.neutral++;
      else if (call.sentiment === 'negative') current.negative++;
      
      if (call.sentiment_score !== null) {
        current.scores.push(call.sentiment_score);
      }
      
      weekMap.set(weekKey, current);
    });

    return Array.from(weekMap.entries())
      .map(([weekStart, counts]) => ({
        date: `Week of ${new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        positive: counts.positive,
        neutral: counts.neutral,
        negative: counts.negative,
        total: counts.positive + counts.neutral + counts.negative,
        avgScore: counts.scores.length > 0 
          ? counts.scores.reduce((a, b) => a + b, 0) / counts.scores.length 
          : 0
      }))
      .reverse()
      .slice(-8); // Last 8 weeks
  };

  const calculateOverallStats = (data: SentimentData[]) => {
    const totals = data.reduce(
      (acc, item) => ({
        positive: acc.positive + item.positive,
        neutral: acc.neutral + item.neutral,
        negative: acc.negative + item.negative,
        total: acc.total + item.total
      }),
      { positive: 0, neutral: 0, negative: 0, total: 0 }
    );

    return [
      { name: 'Positive', value: totals.positive, percentage: ((totals.positive / totals.total) * 100).toFixed(1) },
      { name: 'Neutral', value: totals.neutral, percentage: ((totals.neutral / totals.total) * 100).toFixed(1) },
      { name: 'Negative', value: totals.negative, percentage: ((totals.negative / totals.total) * 100).toFixed(1) }
    ];
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sentiment Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse">Loading sentiment data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-card via-card to-muted/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Customer Sentiment Trends
            </CardTitle>
            <CardDescription>Track sentiment patterns over time to improve customer satisfaction</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="daily" className="gap-2">
              <Calendar className="h-4 w-4" />
              Daily View
            </TabsTrigger>
            <TabsTrigger value="weekly" className="gap-2">
              <Calendar className="h-4 w-4" />
              Weekly View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-6">
            {/* Line Chart - Sentiment Distribution */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Daily Sentiment Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Line type="monotone" dataKey="positive" stroke={COLORS.positive} strokeWidth={2} name="Positive" />
                  <Line type="monotone" dataKey="neutral" stroke={COLORS.neutral} strokeWidth={2} name="Neutral" />
                  <Line type="monotone" dataKey="negative" stroke={COLORS.negative} strokeWidth={2} name="Negative" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Stacked Bar Chart - Total Calls with Sentiment */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Call Volume by Sentiment</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="positive" stackId="a" fill={COLORS.positive} name="Positive" />
                  <Bar dataKey="neutral" stackId="a" fill={COLORS.neutral} name="Neutral" />
                  <Bar dataKey="negative" stackId="a" fill={COLORS.negative} name="Negative" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Overall Distribution Pie Chart */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Overall Sentiment Distribution (Last 14 Days)</h3>
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="50%" height={250}>
                  <PieChart>
                    <Pie
                      data={calculateOverallStats(dailyData)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {calculateOverallStats(dailyData).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={Object.values(COLORS)[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 flex-1">
                  {calculateOverallStats(dailyData).map((stat, index) => (
                    <div key={stat.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: Object.values(COLORS)[index] }}
                        />
                        <span className="font-medium">{stat.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{stat.value}</div>
                        <div className="text-xs text-muted-foreground">{stat.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="weekly" className="space-y-6">
            {/* Weekly Line Chart */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Weekly Sentiment Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Line type="monotone" dataKey="positive" stroke={COLORS.positive} strokeWidth={2} name="Positive" />
                  <Line type="monotone" dataKey="neutral" stroke={COLORS.neutral} strokeWidth={2} name="Neutral" />
                  <Line type="monotone" dataKey="negative" stroke={COLORS.negative} strokeWidth={2} name="Negative" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly Bar Chart */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Weekly Call Volume by Sentiment</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="positive" stackId="a" fill={COLORS.positive} name="Positive" />
                  <Bar dataKey="neutral" stackId="a" fill={COLORS.neutral} name="Neutral" />
                  <Bar dataKey="negative" stackId="a" fill={COLORS.negative} name="Negative" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Weekly Overall Distribution */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Overall Sentiment Distribution (Last 8 Weeks)</h3>
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="50%" height={250}>
                  <PieChart>
                    <Pie
                      data={calculateOverallStats(weeklyData)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {calculateOverallStats(weeklyData).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={Object.values(COLORS)[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 flex-1">
                  {calculateOverallStats(weeklyData).map((stat, index) => (
                    <div key={stat.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: Object.values(COLORS)[index] }}
                        />
                        <span className="font-medium">{stat.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{stat.value}</div>
                        <div className="text-xs text-muted-foreground">{stat.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
