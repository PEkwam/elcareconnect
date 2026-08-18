import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PhoneIncoming, UserCheck, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type CallQueueRow = Tables<"call_queue">;
interface QueueItem extends CallQueueRow {
  client_name?: string;
  client_phone?: string;
}

export const LiveAgentQueue = () => {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickingUp, setPickingUp] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const { data: queueData, error } = await supabase
        .from("call_queue")
        .select("*")
        .eq("call_type", "transfer_from_ivr")
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (queueData && queueData.length > 0) {
        const clientIds = [...new Set(queueData.map((q) => q.client_id))];
        const { data: clientsData } = await supabase
          .from("clients")
          .select("id, name, phone")
          .in("id", clientIds);

        const clientMap = new Map(
          clientsData?.map((c) => [c.id, { name: c.name, phone: c.phone }]) || []
        );

        setQueueItems(
          queueData.map((q) => ({
            ...q,
            client_name: clientMap.get(q.client_id)?.name || "Unknown",
            client_phone: clientMap.get(q.client_id)?.phone || "N/A",
          }))
        );
      } else {
        setQueueItems([]);
      }
    } catch (error) {
      console.error("Error fetching queue:", error);
    } finally {
      setLoading(false);
    }
  };

  const pickUpCall = async (item: QueueItem) => {
    if (!user?.email) return;
    setPickingUp(item.id);

    try {
      // Update agent status to on_call
      await supabase
        .from("agent_status")
        .update({ status: "on_call" })
        .eq("agent_email", user.email);

      // Create an outbound call record for tracking
      await supabase.from("outbound_calls").insert({
        phone_number: item.client_phone || "unknown",
        client_id: item.client_id,
        agent_email: user.email,
        call_status: "in-progress",
        started_at: new Date().toISOString(),
        outcome: "picked_from_ivr_queue",
        priority_level: item.priority_level,
      });

      // Remove from queue
      await supabase.from("call_queue").delete().eq("id", item.id);

      toast({
        title: "Call picked up",
        description: `You are now handling the call for ${item.client_name}`,
      });

      fetchQueue();
    } catch (error) {
      console.error("Error picking up call:", error);
      toast({
        title: "Error",
        description: "Failed to pick up call",
        variant: "destructive",
      });
    } finally {
      setPickingUp(null);
    }
  };

  useEffect(() => {
    fetchQueue();

    const channel = supabase
      .channel("live-agent-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_queue", filter: "call_type=eq.transfer_from_ivr" },
        () => fetchQueue()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const priorityVariant = (p: string) => {
    switch (p) {
      case "high": return "destructive";
      case "urgent": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneIncoming className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Live Agent Queue — IVR Transfers</CardTitle>
            {queueItems.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {queueItems.length}
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {queueItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PhoneIncoming className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No calls waiting</p>
            <p className="text-sm">IVR-transferred calls will appear here in real time</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Waiting</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queueItems.map((item) => (
                <TableRow key={item.id} className={item.priority_level === "high" ? "bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{item.client_name}</TableCell>
                  <TableCell>{item.client_phone}</TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant(item.priority_level)} className="gap-1">
                      {item.priority_level === "high" && <AlertTriangle className="h-3 w-3" />}
                      {item.priority_level}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-muted-foreground text-sm">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: false })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => pickUpCall(item)}
                      disabled={pickingUp === item.id}
                      className="gap-1"
                    >
                      <UserCheck className="h-4 w-4" />
                      {pickingUp === item.id ? "Picking up…" : "Pick Up"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
