// Live progress for a campaign_run: totals + pause/resume/cancel/retry actions.
// Subscribes to campaign_jobs realtime so the bar updates as the worker dispatches.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pause, Play, X, RotateCcw } from "lucide-react";

type Run = {
  id: string;
  campaign_id: string;
  state: "running" | "paused" | "completed" | "cancelled";
  total: number;
  rate_limit_per_minute: number;
  concurrency: number;
  started_at: string;
  finished_at: string | null;
};

type Counts = { queued: number; active: number; completed: number; failed: number; cancelled: number };

export function CampaignProgressPanel({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [counts, setCounts] = useState<Counts>({ queued: 0, active: 0, completed: 0, failed: 0, cancelled: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: r } = await supabase.from("campaign_runs").select("*").eq("id", runId).maybeSingle();
      if (cancelled) return;
      setRun((r as Run) ?? null);
      if (!r) return;
      const { data: rows } = await supabase
        .from("campaign_jobs")
        .select("state")
        .eq("campaign_id", (r as Run).campaign_id);
      if (cancelled) return;
      const next: Counts = { queued: 0, active: 0, completed: 0, failed: 0, cancelled: 0 };
      for (const row of (rows as any[]) ?? []) next[row.state as keyof Counts] = (next[row.state as keyof Counts] ?? 0) + 1;
      setCounts(next);
    };
    load();
    const ch = supabase
      .channel(`campaign-run-${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_jobs" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_runs", filter: `id=eq.${runId}` }, load)
      .subscribe();
    const t = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(t); supabase.removeChannel(ch); };
  }, [runId]);

  const total = run?.total ?? 0;
  const done = counts.completed + counts.failed + counts.cancelled;
  const pct = useMemo(() => (total > 0 ? Math.round((done / total) * 100) : 0), [done, total]);

  const act = async (action: "pause" | "resume" | "cancel" | "retry_failed") => {
    if (!run) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("campaign-control", {
        body: { run_id: run.id, action },
      });
      if (error) throw error;
      toast.success(`Run ${action.replace("_", " ")}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (!run) return null;

  const stateBadge: Record<Run["state"], string> = {
    running: "bg-green-500/15 text-green-700 dark:text-green-300",
    paused: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    completed: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    cancelled: "bg-muted text-muted-foreground",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            Campaign progress
            <Badge className={stateBadge[run.state]}>{run.state}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {run.rate_limit_per_minute}/min · concurrency {run.concurrency}
          </p>
        </div>
        <div className="flex gap-2">
          {run.state === "running" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("pause")}>
              <Pause className="h-4 w-4 mr-1" /> Pause
            </Button>
          )}
          {run.state === "paused" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("resume")}>
              <Play className="h-4 w-4 mr-1" /> Resume
            </Button>
          )}
          {counts.failed > 0 && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("retry_failed")}>
              <RotateCcw className="h-4 w-4 mr-1" /> Retry failed ({counts.failed})
            </Button>
          )}
          {(run.state === "running" || run.state === "paused") && (
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => act("cancel")}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} />
        <div className="grid grid-cols-5 gap-2 text-center text-sm">
          <Stat label="Queued" value={counts.queued} />
          <Stat label="Active" value={counts.active} />
          <Stat label="Completed" value={counts.completed} tone="success" />
          <Stat label="Failed" value={counts.failed} tone="destructive" />
          <Stat label="Total" value={total} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "destructive" }) {
  const cls = tone === "success" ? "text-green-600 dark:text-green-400"
    : tone === "destructive" ? "text-red-600 dark:text-red-400" : "";
  return (
    <div className="rounded-md border bg-card/50 p-2">
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
