import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneOff, CheckCircle2, Clock, TrendingUp, Calendar, RefreshCw, Filter } from "lucide-react";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import CampaignClientsBreakdown from "@/components/dashboard/CampaignClientsBreakdown";

type Range = "1d" | "7d" | "30d" | "all";

interface Campaign {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

interface CallRow {
  campaign_id: string | null;
  call_status: string | null;
  call_duration: number | null;
  outcome: string | null;
  sentiment_score: number | null;
  created_at: string;
}

const rangeToHours = (r: Range) => (r === "1d" ? 24 : r === "7d" ? 24 * 7 : r === "30d" ? 24 * 30 : null);

const CampaignAnalytics = () => {
  const [range, setRange] = useState<Range>("7d");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialLoadedRef = useRef(false);

  const sinceISO = useMemo(() => {
    const hrs = rangeToHours(range);
    return hrs ? new Date(Date.now() - hrs * 3600 * 1000).toISOString() : null;
  }, [range]);

  const load = async (background = false) => {
    if (background && initialLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    const { data: camps } = await supabase
      .from("call_campaigns")
      .select("id, name, type, is_active")
      .order("name");

    let q = supabase
      .from("outbound_calls")
      .select("campaign_id, call_status, call_duration, outcome, sentiment_score, created_at")
      .not("campaign_id", "is", null);
    if (sinceISO) q = q.gte("created_at", sinceISO);
    const { data: rows } = await q;
    setCampaigns(camps || []);
    setCalls((rows || []) as CallRow[]);
    setLoading(false);
    setRefreshing(false);
    initialLoadedRef.current = true;
  };

  // Foreground load when range changes (or initial mount)
  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [range]);
  // Realtime updates run in background — no skeleton flash
  useRealtimeRefresh(["outbound_calls", "call_campaigns"], () => load(true));

  const visibleCalls = useMemo(() => {
    return selectedCampaignId === "all" ? calls : calls.filter((r) => r.campaign_id === selectedCampaignId);
  }, [calls, selectedCampaignId]);


  const totals = useMemo(() => {
    const total = visibleCalls.length;
    const completed = visibleCalls.filter((r) => r.call_status === "completed").length;
    const failed = visibleCalls.filter((r) => ["failed", "no-answer", "busy", "canceled"].includes(r.call_status || "")).length;
    const durations = visibleCalls.map((r) => r.call_duration || 0).filter((d) => d > 0);
    const avgDur = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    return { total, completed, failed, avgDur, successRate: total ? (completed / total) * 100 : 0 };
  }, [visibleCalls]);

  const fmtDur = (s: number) => {
    if (!s) return "0s";
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m ? `${m}m ${sec}s` : `${sec}s`;
  };

  const selectedCampaign = selectedCampaignId !== "all"
    ? campaigns.find((c) => c.id === selectedCampaignId) || null
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary to-accent-foreground bg-clip-text text-transparent">
              Campaign Analytics
            </h1>
            <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Per-campaign performance KPIs
              {refreshing && (
                <span className="inline-flex items-center gap-1 text-xs text-primary ml-2">
                  <RefreshCw className="h-3 w-3 animate-spin" /> updating…
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
            </div>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="All campaigns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Calls", value: totals.total, icon: Phone, hint: selectedCampaign ? selectedCampaign.name : "Across campaigns" },
            { label: "Completed", value: totals.completed, icon: CheckCircle2, hint: `${totals.successRate.toFixed(1)}% success` },
            { label: "Failed / Missed", value: totals.failed, icon: PhoneOff, hint: "Failed, busy, no-answer" },
            { label: "Avg Duration", value: fmtDur(totals.avgDur), icon: Clock, hint: selectedCampaign ? "This campaign" : "All campaigns" },
          ].map((s, i) => (
            <Card key={i} className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full blur-3xl" />
              <CardHeader className="pb-3 pt-5 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-all">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="text-3xl font-bold text-primary">{s.value}</div>
                <p className="text-xs text-muted-foreground mt-1 truncate">{s.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedCampaign ? (
          <CampaignClientsBreakdown
            campaignId={selectedCampaign.id}
            campaignName={selectedCampaign.name}
            sinceISO={sinceISO}
          />
        ) : (
          <Card className="animate-scale-in">
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">Select a specific campaign above to view the detailed breakdown.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CampaignAnalytics;
