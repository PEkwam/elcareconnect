import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PhoneCall,
  Plus,
  Calendar,
  Clock,
  User,
  CheckCircle,
  XCircle,
  Phone,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface CallbackRequest {
  id: string;
  client_id: string | null;
  client_name: string;
  client_phone: string;
  preferred_date: string;
  preferred_time_slot: string;
  reason: string | null;
  status: string;
  assigned_agent: string | null;
  notes: string | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  phone: string;
}

const TIME_SLOTS = [
  "09:00 - 10:00",
  "10:00 - 11:00",
  "11:00 - 12:00",
  "12:00 - 13:00",
  "13:00 - 14:00",
  "14:00 - 15:00",
  "15:00 - 16:00",
  "16:00 - 17:00",
];

export const CallbackScheduler = () => {
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<{ agent_email: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { toast } = useToast();

  const [newCallback, setNewCallback] = useState({
    client_id: "",
    client_name: "",
    client_phone: "",
    preferred_date: format(new Date(), "yyyy-MM-dd"),
    preferred_time_slot: TIME_SLOTS[0],
    reason: "",
  });

  useEffect(() => {
    fetchCallbacks();
    fetchClients();
    fetchAgents();

    // Real-time subscription
    const channel = supabase
      .channel("callback-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "callback_requests" },
        () => fetchCallbacks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCallbacks = async () => {
    try {
      const { data, error } = await supabase
        .from("callback_requests")
        .select("*")
        .order("preferred_date", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCallbacks(data || []);
    } catch (error) {
      console.error("Error fetching callbacks:", error);
      toast({
        title: "Error",
        description: "Failed to fetch callback requests",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone")
        .order("name");

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  };

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from("agent_status")
        .select("agent_email")
        .eq("status", "available");

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      console.error("Error fetching agents:", error);
    }
  };

  const handleClientSelect = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setNewCallback({
        ...newCallback,
        client_id: client.id,
        client_name: client.name,
        client_phone: client.phone,
      });
    }
  };

  const handleAddCallback = async () => {
    if (!newCallback.client_name || !newCallback.client_phone || !newCallback.preferred_date) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from("callback_requests").insert([
        {
          client_id: newCallback.client_id || null,
          client_name: newCallback.client_name,
          client_phone: newCallback.client_phone,
          preferred_date: newCallback.preferred_date,
          preferred_time_slot: newCallback.preferred_time_slot,
          reason: newCallback.reason || null,
          status: "pending",
        },
      ]);

      if (error) throw error;

      toast({
        title: "Callback Scheduled",
        description: `Callback scheduled for ${newCallback.client_name}`,
      });

      setNewCallback({
        client_id: "",
        client_name: "",
        client_phone: "",
        preferred_date: format(new Date(), "yyyy-MM-dd"),
        preferred_time_slot: TIME_SLOTS[0],
        reason: "",
      });
      setIsAddDialogOpen(false);
      fetchCallbacks();
    } catch (error) {
      console.error("Error adding callback:", error);
      toast({
        title: "Error",
        description: "Failed to schedule callback",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateCallbackStatus = async (id: string, status: string, agentEmail?: string) => {
    try {
      const updateData: { status: string; assigned_agent?: string } = { status };
      if (agentEmail) {
        updateData.assigned_agent = agentEmail;
      }

      const { error } = await supabase
        .from("callback_requests")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Updated",
        description: `Callback marked as ${status}`,
      });

      fetchCallbacks();
    } catch (error) {
      console.error("Error updating callback:", error);
      toast({
        title: "Error",
        description: "Failed to update callback",
        variant: "destructive",
      });
    }
  };

  const initiateCall = async (callback: CallbackRequest) => {
    try {
      // Get a campaign for the call
      const { data: campaign } = await supabase
        .from("call_campaigns")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();

      // Create outbound call
      const { error } = await supabase.from("outbound_calls").insert([
        {
          client_id: callback.client_id,
          campaign_id: campaign?.id,
          phone_number: callback.client_phone,
          call_status: "scheduled",
          scheduled_at: new Date().toISOString(),
          notes: `Callback request: ${callback.reason || "No reason specified"}`,
        },
      ]);

      if (error) throw error;

      // Update callback status
      await updateCallbackStatus(callback.id, "in_progress");

      toast({
        title: "Call Initiated",
        description: `Call scheduled to ${callback.client_name}`,
      });
    } catch (error) {
      console.error("Error initiating call:", error);
      toast({
        title: "Error",
        description: "Failed to initiate call",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive"; className: string }> = {
      pending: { variant: "secondary", className: "bg-yellow-100 text-yellow-800" },
      in_progress: { variant: "default", className: "bg-blue-100 text-blue-800" },
      completed: { variant: "default", className: "bg-green-100 text-green-800" },
      cancelled: { variant: "destructive", className: "" },
    };

    const { variant, className } = config[status] || config.pending;

    return (
      <Badge variant={variant} className={className}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const pendingCallbacks = callbacks.filter((c) => c.status === "pending");
  const todayCallbacks = callbacks.filter(
    (c) => c.preferred_date === format(new Date(), "yyyy-MM-dd")
  );

  return (
    <Card className="border-primary/20">
      <CardHeader className="bg-gradient-to-r from-primary/10 via-background to-accent/10">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-primary" />
            Callback Scheduler
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {pendingCallbacks.length} pending
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Calendar className="h-3 w-3" />
              {todayCallbacks.length} today
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCallbacks}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Schedule Callback
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Schedule Callback Request</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Select Existing Client (Optional)</Label>
                    <Select onValueChange={handleClientSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a client..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name} - {client.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Client Name *</Label>
                      <Input
                        value={newCallback.client_name}
                        onChange={(e) =>
                          setNewCallback({ ...newCallback, client_name: e.target.value })
                        }
                        placeholder="Enter name..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number *</Label>
                      <Input
                        value={newCallback.client_phone}
                        onChange={(e) =>
                          setNewCallback({ ...newCallback, client_phone: e.target.value })
                        }
                        placeholder="+1234567890"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Preferred Date *</Label>
                      <Input
                        type="date"
                        value={newCallback.preferred_date}
                        onChange={(e) =>
                          setNewCallback({ ...newCallback, preferred_date: e.target.value })
                        }
                        min={format(new Date(), "yyyy-MM-dd")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Time Slot *</Label>
                      <Select
                        value={newCallback.preferred_time_slot}
                        onValueChange={(value) =>
                          setNewCallback({ ...newCallback, preferred_time_slot: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map((slot) => (
                            <SelectItem key={slot} value={slot}>
                              {slot}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Reason for Callback</Label>
                    <Textarea
                      value={newCallback.reason}
                      onChange={(e) =>
                        setNewCallback({ ...newCallback, reason: e.target.value })
                      }
                      placeholder="Why is the client requesting a callback?"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddCallback} disabled={isLoading}>
                    {isLoading ? "Scheduling..." : "Schedule Callback"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : callbacks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <PhoneCall className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No callback requests yet</p>
            <p className="text-sm">Schedule callbacks when clients request them</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Client</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callbacks.map((callback) => (
                  <TableRow key={callback.id} className="hover:bg-muted/20">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{callback.client_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {callback.client_phone}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {format(new Date(callback.preferred_date), "MMM d, yyyy")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {callback.preferred_time_slot}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm max-w-[200px] truncate">
                        {callback.reason || "No reason specified"}
                      </p>
                    </TableCell>
                    <TableCell>{getStatusBadge(callback.status)}</TableCell>
                    <TableCell>
                      {callback.status === "pending" ? (
                        <Select
                          onValueChange={(agent) =>
                            updateCallbackStatus(callback.id, "pending", agent)
                          }
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue placeholder="Assign..." />
                          </SelectTrigger>
                          <SelectContent>
                            {agents.map((agent) => (
                              <SelectItem key={agent.agent_email} value={agent.agent_email}>
                                {agent.agent_email.split("@")[0]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">
                          {callback.assigned_agent?.split("@")[0] || "-"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {callback.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => initiateCall(callback)}
                            className="gap-1 bg-green-600 hover:bg-green-700"
                          >
                            <Phone className="h-3 w-3" />
                            Call
                          </Button>
                        )}
                        {callback.status !== "completed" && callback.status !== "cancelled" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateCallbackStatus(callback.id, "completed")}
                              className="gap-1"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateCallbackStatus(callback.id, "cancelled")}
                              className="text-destructive"
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
