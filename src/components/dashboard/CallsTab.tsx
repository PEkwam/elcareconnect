import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Phone, ExternalLink, Trash2, RefreshCw, Brain, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { SentimentBadge } from "./SentimentBadge";
import { LiveTranscription } from "./LiveTranscription";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

interface OutboundCall {
  id: string;
  client_id: string;
  campaign_id: string;
  phone_number: string;
  call_status: string;
  outcome: string | null;
  payment_link: string | null;
  notes: string | null;
  scheduled_at: string;
  started_at: string | null;
  ended_at: string | null;
  call_duration: number | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  sentiment_score: number | null;
  escalation_flagged: boolean | null;
  ai_summary: string | null;
  clients: {
    name: string;
    policy_number: string;
  };
  call_campaigns: {
    name: string;
    type: string;
  };
}

interface CallsTabProps {
  onStatsUpdate: () => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const CallsTab = ({ onStatsUpdate }: CallsTabProps) => {
  const [calls, setCalls] = useState<OutboundCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCall, setSelectedCall] = useState<OutboundCall | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    fetchCalls();
    // Background safety net: reconcile any stuck "in_progress" rows with the
    // real Twilio call status so a missed webhook never leaves the UI wrong.
    const reconcile = async () => {
      try {
        await supabase.functions.invoke("reconcile-call-status", { body: {} });
        fetchCalls();
      } catch {
        /* silent */
      }
    };
    reconcile();
    const id = setInterval(reconcile, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useRealtimeRefresh(["outbound_calls"], () => {
    fetchCalls();
    onStatsUpdate();
  });

  const fetchCalls = async () => {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from("outbound_calls")
        .select(`
          *,
          clients (name, policy_number),
          call_campaigns (name, type)
        `, { count: "exact" })
        .order("scheduled_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setCalls(data as OutboundCall[] || []);
      const total = count ?? 0;
      setTotalCount(total);
      // If the current page fell out of range (e.g. after Clear All), step back.
      if (total > 0 && from >= total) {
        setPage(Math.ceil(total / pageSize));
      }
    } catch (error) {
      console.error("Error fetching calls:", error);
      toast({
        title: "Error",
        description: "Failed to fetch calls",
        variant: "destructive",
      });
    }
  };

  const startCall = async (callId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-voice-call", {
        body: { callId },
      });

      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Call could not be started");

      toast({
        title: "Call Started",
        description: "AI voice call initiated",
      });

      fetchCalls();
      onStatsUpdate();
    } catch (error) {
      console.error("Error starting call:", error);
      const message = error instanceof Error ? error.message : "Failed to start call";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearAllCalls = async () => {
    if (!confirm("Are you sure you want to clear all calls? This action cannot be undone.")) {
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("outbound_calls")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all records

      if (error) throw error;

      toast({
        title: "Success",
        description: "All calls cleared successfully",
      });
      
      fetchCalls();
      onStatsUpdate();
    } catch (error) {
      console.error("Error clearing calls:", error);
      toast({
        title: "Error",
        description: "Failed to clear calls",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeSentiment = async (callId: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('analyze-call-sentiment', {
        body: { callId }
      });

      if (error) throw error;

      toast({
        title: "Analysis Complete",
        description: "Call sentiment analyzed successfully"
      });

      fetchCalls();
    } catch (error) {
      console.error("Error analyzing sentiment:", error);
      toast({
        title: "Error",
        description: "Failed to analyze call sentiment",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateCallStatus = async (callId: string, newStatus: string) => {
    try {
      const updateData: any = { call_status: newStatus };
      
      if (newStatus === "in_progress" && !calls.find(c => c.id === callId)?.started_at) {
        updateData.started_at = new Date().toISOString();
      } else if (newStatus === "completed" || newStatus === "failed") {
        updateData.ended_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("outbound_calls")
        .update(updateData)
        .eq("id", callId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Call status updated",
      });
      
      fetchCalls();
      onStatsUpdate();
    } catch (error) {
      console.error("Error updating call status:", error);
      toast({
        title: "Error",
        description: "Failed to update call status",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      scheduled: "secondary",
      in_progress: "default",
      completed: "default",
      failed: "destructive",
      no_answer: "secondary",
    } as const;

    const colors = {
      scheduled: "bg-secondary",
      in_progress: "bg-primary",
      completed: "bg-green-100 text-green-800",
      failed: "bg-destructive",
      no_answer: "bg-secondary",
    } as const;

    return (
      <Badge 
        variant={variants[status as keyof typeof variants] || "default"}
        className={status === "completed" ? colors[status] : ""}
      >
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return null;

    const variants = {
      payment_agreed: "bg-green-100 text-green-800",
      appointment_scheduled: "bg-blue-100 text-blue-800",
      callback_requested: "bg-yellow-100 text-yellow-800",
      refused: "bg-red-100 text-red-800",
      no_response: "bg-gray-100 text-gray-800",
    } as const;

    return (
      <Badge 
        variant="secondary"
        className={variants[outcome as keyof typeof variants] || ""}
      >
        {outcome.replace("_", " ")}
      </Badge>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const canStartCall = (call: OutboundCall) => {
    if (["scheduled", "failed"].includes(call.call_status)) return true;
    if (call.call_status !== "in_progress" || !call.started_at) return false;

    const startedAt = new Date(call.started_at).getTime();
    return Number.isFinite(startedAt) && Date.now() - startedAt > 2 * 60 * 1000;
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="calls" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="calls" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Call Management
          </TabsTrigger>
          <TabsTrigger value="transcription" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Live Transcription
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="calls" className="mt-6">
          <Card className="bg-gradient-to-r from-primary/5 via-background to-accent/5">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl font-semibold">Call Management Dashboard</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Track and manage all outbound AI voice calls</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={fetchCalls}
                disabled={isLoading}
                size="sm"
                className="hover:bg-primary/10"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="destructive"
                onClick={clearAllCalls}
                disabled={isLoading || calls.length === 0}
                size="sm"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold">Client Details</TableHead>
                  <TableHead className="font-semibold">Campaign Type</TableHead>
                  <TableHead className="font-semibold">Contact</TableHead>
                  <TableHead className="font-semibold">Call Status</TableHead>
                  <TableHead className="font-semibold">Outcome</TableHead>
                  <TableHead className="font-semibold">Sentiment</TableHead>
                  <TableHead className="font-semibold">Duration</TableHead>
                  <TableHead className="font-semibold">Scheduled Time</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow key={call.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <div className="font-semibold text-foreground">{call.clients?.name}</div>
                        <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-fit">
                          Policy: {call.clients?.policy_number}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-primary">{call.call_campaigns?.name}</div>
                        <Badge variant="outline" className="text-xs">
                          {call.call_campaigns?.type?.replace("_", " ")}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{call.phone_number}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(call.call_status)}
                        <Select
                          value={call.call_status}
                          onValueChange={(value) => updateCallStatus(call.id, value)}
                        >
                          <SelectTrigger className="w-auto h-8 text-xs border-border/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="no_answer">No Answer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        {getOutcomeBadge(call.outcome) || (
                          <Badge variant="outline" className="text-muted-foreground">
                            Pending
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <SentimentBadge 
                        sentiment={call.sentiment}
                        escalationFlagged={call.escalation_flagged || false}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm font-medium">
                        {formatDuration(call.call_duration)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{new Date(call.scheduled_at).toLocaleDateString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(call.scheduled_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canStartCall(call) && (
                          <Button
                            size="sm"
                            onClick={() => startCall(call.id)}
                            disabled={isLoading}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Play className="h-3 w-3 mr-1" />
                            {call.call_status === "scheduled" ? "Start" : "Retry"}
                          </Button>
                        )}
                        {call.call_status === "completed" && !call.sentiment && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => analyzeSentiment(call.id)}
                            disabled={isLoading}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                          >
                            <Brain className="h-3 w-3 mr-1" />
                            Analyze
                          </Button>
                        )}
                        {call.payment_link && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(call.payment_link!, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Pay
                          </Button>
                        )}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedCall(call)}
                            >
                              Details
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle className="text-xl">Call Details</DialogTitle>
                            </DialogHeader>
                            {selectedCall && (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-sm font-medium text-muted-foreground">Client</label>
                                    <p className="font-medium">{selectedCall.clients?.name}</p>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium text-muted-foreground">Policy</label>
                                    <p className="font-mono text-sm">{selectedCall.clients?.policy_number}</p>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Campaign</label>
                                  <p className="font-medium">{selectedCall.call_campaigns?.name}</p>
                                  <Badge variant="outline" className="mt-1">
                                    {selectedCall.call_campaigns?.type?.replace("_", " ")}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                                    <div className="mt-1">{getStatusBadge(selectedCall.call_status)}</div>
                                  </div>
                                  {selectedCall.outcome && (
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">Outcome</label>
                                      <div className="mt-1">{getOutcomeBadge(selectedCall.outcome)}</div>
                                    </div>
                                  )}
                                </div>
                                {selectedCall.notes && (
                                  <div>
                                    <label className="text-sm font-medium text-muted-foreground">Notes</label>
                                    <div className="mt-1 p-3 bg-muted/50 rounded-md text-sm">
                                      {selectedCall.notes}
                                    </div>
                                  </div>
                                )}
                                {selectedCall.payment_link && (
                                  <div className="flex items-center justify-between p-3 bg-primary/5 rounded-md">
                                    <span className="text-sm font-medium">Payment Link Available</span>
                                    <Button
                                      size="sm"
                                      onClick={() => window.open(selectedCall.payment_link!, "_blank")}
                                    >
                                      <ExternalLink className="h-3 w-3 mr-1" />
                                      Open Payment
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {calls.length === 0 && (
              <div className="text-center py-12">
                <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Phone className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No Calls Scheduled</h3>
                <p className="text-muted-foreground">Start by scheduling calls from the Clients or Campaigns tab.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
        </TabsContent>
        
        <TabsContent value="transcription" className="mt-6">
          <LiveTranscription />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CallsTab;