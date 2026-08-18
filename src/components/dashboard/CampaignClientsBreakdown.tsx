import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Users, Search, ChevronDown, ChevronRight, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import CampaignCallsDrillDown from "./CampaignCallsDrillDown";

const MAX_ATTEMPTS = 3;
const MIN_GAP_MS = 2 * 60 * 60 * 1000;
const RETRY_STATUSES = new Set(["failed", "no-answer", "busy", "canceled"]);

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  payment_status: string | null;
}

interface CallRow {
  id: string;
  client_id: string | null;
  phone_number: string | null;
  call_status: string | null;
  outcome: string | null;
  sentiment: string | null;
  created_at: string;
}

interface Props {
  campaignId: string;
  campaignName: string;
  sinceISO: string | null;
}

interface ClientStats {
  client: Client | null;
  phone: string;
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  scheduled: number;
  latestStatus: string | null;
  latestAt: string | null;
  latestOutcome: string | null;
}

const statusColor = (s: string | null) => {
  switch (s) {
    case "completed": return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
    case "in-progress": return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    case "scheduled": return "bg-muted text-muted-foreground";
    case "failed":
    case "no-answer":
    case "busy":
    case "canceled":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default: return "bg-muted text-muted-foreground";
  }
};

export const CampaignClientsBreakdown = ({ campaignId, campaignName, sinceISO }: Props) => {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [bulkRetrying, setBulkRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let q = supabase
        .from("outbound_calls")
        .select("id, client_id, phone_number, call_status, outcome, sentiment, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (sinceISO) q = q.gte("created_at", sinceISO);
      const { data: callRows } = await q;
      if (cancelled) return;
      const rows = (callRows || []) as CallRow[];
      setCalls(rows);

      const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean) as string[]));
      if (clientIds.length) {
        const { data: cs } = await supabase
          .from("clients")
          .select("id, name, phone, email, payment_status")
          .in("id", clientIds);
        if (cancelled) return;
        const map: Record<string, Client> = {};
        (cs || []).forEach((c) => { map[c.id] = c as Client; });
        setClients(map);
      } else {
        setClients({});
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [campaignId, sinceISO]);

  const stats: ClientStats[] = useMemo(() => {
    const groups = new Map<string, CallRow[]>();
    for (const r of calls) {
      const key = r.client_id || `phone:${r.phone_number || "unknown"}`;
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }
    const out: ClientStats[] = [];
    groups.forEach((rows, key) => {
      const client = key.startsWith("phone:") ? null : clients[key] || null;
      // rows are already sorted desc by created_at
      const latest = rows[0];
      out.push({
        client,
        phone: client?.phone || rows[0]?.phone_number || "—",
        total: rows.length,
        completed: rows.filter((r) => r.call_status === "completed").length,
        failed: rows.filter((r) => ["failed","no-answer","busy","canceled"].includes(r.call_status || "")).length,
        inProgress: rows.filter((r) => r.call_status === "in-progress").length,
        scheduled: rows.filter((r) => r.call_status === "scheduled").length,
        latestStatus: latest?.call_status || null,
        latestAt: latest?.created_at || null,
        latestOutcome: latest?.outcome || null,
      });
    });
    return out.sort((a, b) => b.total - a.total);
  }, [calls, clients]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stats;
    const s = search.toLowerCase();
    return stats.filter((st) =>
      (st.client?.name || "").toLowerCase().includes(s) ||
      (st.client?.email || "").toLowerCase().includes(s) ||
      (st.phone || "").toLowerCase().includes(s)
    );
  }, [stats, search]);

  const isEligibleForRetry = (st: ClientStats) => {
    if (!st.client?.id) return false;
    if (st.completed > 0) return false;
    if (st.total >= MAX_ATTEMPTS) return false;
    if (st.inProgress > 0 || st.scheduled > 0) return false;
    if (!RETRY_STATUSES.has(st.latestStatus || "")) return false;
    if (!st.latestAt) return false;
    return Date.now() - new Date(st.latestAt).getTime() >= MIN_GAP_MS;
  };

  const eligibleClients = useMemo(() => filtered.filter(isEligibleForRetry), [filtered]);

  const triggerRetry = async (clientIds: string[]) => {
    const { data, error } = await supabase.functions.invoke("retry-campaign-calls", {
      body: { campaign_id: campaignId, client_ids: clientIds },
    });
    if (error) throw error;
    return data as { queued: number };
  };

  const retryOne = async (clientId: string) => {
    setRetrying((p) => new Set(p).add(clientId));
    try {
      const res = await triggerRetry([clientId]);
      toast.success(res.queued ? "Retry queued" : "No retry needed yet");
    } catch (e) {
      toast.error("Could not queue retry");
    } finally {
      setRetrying((p) => { const n = new Set(p); n.delete(clientId); return n; });
    }
  };

  const retryAll = async () => {
    if (!eligibleClients.length) return;
    setBulkRetrying(true);
    try {
      const ids = eligibleClients.map((s) => s.client!.id);
      const res = await triggerRetry(ids);
      toast.success(`Queued ${res.queued} retry${res.queued === 1 ? "" : "s"}`);
    } catch {
      toast.error("Bulk retry failed");
    } finally {
      setBulkRetrying(false);
    }
  };

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <Card className="animate-scale-in">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Clients in "{campaignName}"
            <Badge variant="secondary" className="ml-2">{filtered.length}</Badge>
          </CardTitle>
          <div className="ml-auto flex items-center gap-2">
            {eligibleClients.length > 0 && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                {eligibleClients.length} unreachable
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={retryAll}
              disabled={!eligibleClients.length || bulkRetrying}
              className="gap-1.5"
            >
              {bulkRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Retry unreachable
            </Button>
          </div>
        </div>
        <div className="relative mt-2 max-w-xs">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search client / phone / email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {stats.length === 0 ? "No clients have been called in this campaign yet." : "No clients match the search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">In Progress</TableHead>
                  <TableHead className="text-right">Scheduled</TableHead>
                  <TableHead>Latest Status</TableHead>
                  <TableHead>Latest Outcome</TableHead>
                  <TableHead className="text-right">Retry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((st) => {
                  const key = st.client?.id || `phone:${st.phone}`;
                  const isOpen = expanded.has(key);
                  const eligible = isEligibleForRetry(st);
                  const isRetrying = st.client?.id ? retrying.has(st.client.id) : false;
                  return (
                    <Fragment key={key}>
                      <TableRow className="cursor-pointer" onClick={() => toggle(key)}>
                        <TableCell className="p-2">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); toggle(key); }}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">
                          {st.client?.name || <span className="text-muted-foreground italic">Unknown</span>}
                          {st.client?.email && <div className="text-xs text-muted-foreground">{st.client.email}</div>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{st.phone}</TableCell>
                        <TableCell className="text-right font-semibold">{st.total}</TableCell>
                        <TableCell className="text-right text-green-600">{st.completed}</TableCell>
                        <TableCell className="text-right text-destructive">{st.failed}</TableCell>
                        <TableCell className="text-right text-blue-600">{st.inProgress}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{st.scheduled}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColor(st.latestStatus)}>{st.latestStatus || "—"}</Badge>
                          {st.latestAt && <div className="text-[10px] text-muted-foreground mt-1">{new Date(st.latestAt).toLocaleString()}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{st.latestOutcome || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right">
                          {st.client?.id ? (
                            <Button
                              size="sm"
                              variant={eligible ? "default" : "ghost"}
                              disabled={!eligible || isRetrying}
                              onClick={(e) => { e.stopPropagation(); retryOne(st.client!.id); }}
                              className="h-7 gap-1.5"
                              title={
                                st.completed > 0 ? "Already reached" :
                                st.total >= MAX_ATTEMPTS ? "Max attempts reached" :
                                st.inProgress + st.scheduled > 0 ? "Call in progress" :
                                !RETRY_STATUSES.has(st.latestStatus || "") ? "Not in retry state" :
                                "Wait 2h between retries"
                              }
                            >
                              {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                              {eligible ? "Retry" : ""}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && st.client?.id && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={11} className="p-2 bg-muted/10">
                            <CampaignCallsDrillDown
                              campaignId={campaignId}
                              campaignName={`${campaignName} • ${st.client.name}`}
                              sinceISO={sinceISO}
                              clientId={st.client.id}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CampaignClientsBreakdown;
