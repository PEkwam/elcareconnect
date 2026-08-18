import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Phone, User, Bot, Filter, ChevronLeft, ChevronRight, X } from "lucide-react";
import SentimentBadge from "./SentimentBadge";

interface CallRow {
  id: string;
  phone_number: string | null;
  call_status: string | null;
  call_duration: number | null;
  outcome: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  escalation_flagged: boolean | null;
  agent_email: string | null;
  ai_summary: string | null;
  started_at: string | null;
  created_at: string;
}

interface TranscriptRow {
  id: string;
  speaker: string | null;
  transcript: string;
  timestamp_seconds: number | null;
  created_at: string;
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

const fmtDur = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}m ${sec}s` : `${sec}s`;
};

interface Props {
  campaignId: string;
  campaignName: string;
  sinceISO: string | null;
  clientId?: string | null;
}

const PAGE_SIZE = 25;

export const CampaignCallsDrillDown = ({ campaignId, campaignName, sinceISO, clientId }: Props) => {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
  const [tLoading, setTLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let q = supabase
        .from("outbound_calls")
        .select("id, phone_number, call_status, call_duration, outcome, sentiment, sentiment_score, escalation_flagged, agent_email, ai_summary, started_at, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (sinceISO) q = q.gte("created_at", sinceISO);
      if (clientId) q = q.eq("client_id", clientId);
      const { data } = await q;
      setCalls((data || []) as CallRow[]);
      setLoading(false);
    };
    load();
  }, [campaignId, sinceISO, clientId]);

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (statusFilter !== "all" && c.call_status !== statusFilter) return false;
      if (sentimentFilter !== "all") {
        if (sentimentFilter === "escalated" && !c.escalation_flagged) return false;
        else if (sentimentFilter !== "escalated" && (c.sentiment || "").toLowerCase() !== sentimentFilter) return false;
      }
      if (outcomeFilter && !(c.outcome || "").toLowerCase().includes(outcomeFilter.toLowerCase())) return false;
      if (dateFrom && new Date(c.created_at) < new Date(dateFrom)) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(c.created_at) > end) return false;
      }
      return true;
    });
  }, [calls, statusFilter, sentimentFilter, outcomeFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(0); }, [statusFilter, sentimentFilter, outcomeFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const clearFilters = () => {
    setStatusFilter("all"); setSentimentFilter("all"); setOutcomeFilter(""); setDateFrom(""); setDateTo("");
  };
  const hasFilters = statusFilter !== "all" || sentimentFilter !== "all" || outcomeFilter || dateFrom || dateTo;

  const openTranscript = async (call: CallRow) => {
    setSelected(call);
    setTLoading(true);
    setTranscripts([]);
    const { data } = await supabase
      .from("call_transcriptions")
      .select("id, speaker, transcript, timestamp_seconds, created_at")
      .eq("call_id", call.id)
      .order("created_at", { ascending: true });
    setTranscripts((data || []) as TranscriptRow[]);
    setTLoading(false);
  };

  return (
    <div className="border-l-2 border-primary/30 ml-2 pl-4 py-2 bg-muted/20 rounded-r-lg">
      <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <Phone className="h-4 w-4" /> Calls for "{campaignName}"
        <span className="text-xs ml-auto">
          {filtered.length} of {calls.length} call{calls.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg border bg-background/50">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in-progress">In progress</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="no-answer">No answer</SelectItem>
            <SelectItem value="busy">Busy</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Sentiment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sentiments</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Outcome contains…"
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="h-8 w-[160px] text-xs"
        />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
        <span className="text-xs text-muted-foreground">→</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-[140px] text-xs" />
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {calls.length === 0 ? "No calls in this period." : "No calls match the current filters."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(c.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.phone_number || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(c.call_status)}>
                        {c.call_status || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{c.outcome || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs">{c.agent_email || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{fmtDur(c.call_duration)}</TableCell>
                    <TableCell>
                      <SentimentBadge
                        sentiment={(c.sentiment as any) || null}
                        escalationFlagged={!!c.escalation_flagged}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openTranscript(c)}>
                        <FileText className="h-4 w-4 mr-1" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="text-muted-foreground">
              Page {page + 1} of {totalPages} • Showing {paged.length} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Call Details {selected?.phone_number ? `• ${selected.phone_number}` : ""}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={statusColor(selected.call_status)}>{selected.call_status}</Badge></div>
                <div><span className="text-muted-foreground">Duration:</span> {fmtDur(selected.call_duration)}</div>
                <div><span className="text-muted-foreground">Outcome:</span> {selected.outcome || "—"}</div>
                <div><span className="text-muted-foreground">Agent:</span> {selected.agent_email || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Sentiment:</span> <SentimentBadge sentiment={(selected.sentiment as any) || null} escalationFlagged={!!selected.escalation_flagged} /></div>
              </div>
              {selected.ai_summary && (
                <div className="rounded-lg border bg-primary/5 p-3">
                  <div className="text-xs font-medium text-primary mb-1">AI Summary</div>
                  <p className="text-sm">{selected.ai_summary}</p>
                </div>
              )}
              <div>
                <div className="text-sm font-medium mb-2">Transcript</div>
                <ScrollArea className="h-72 pr-3 rounded-lg border bg-muted/20 p-2">
                  {tLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : transcripts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No transcript available for this call.</p>
                  ) : (
                    <div className="space-y-2">
                      {transcripts.map((t) => {
                        const isAgent = (t.speaker || "").toLowerCase().includes("agent");
                        const Icon = isAgent ? Bot : User;
                        return (
                          <div key={t.id} className={`flex gap-2 p-2 rounded border ${isAgent ? "bg-primary/5 border-primary/20" : "bg-background"}`}>
                            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                {t.speaker || "unknown"}
                                {typeof t.timestamp_seconds === "number" && ` • ${t.timestamp_seconds}s`}
                              </div>
                              <p className="text-sm break-words">{t.transcript}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampaignCallsDrillDown;
