import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PhoneCall, Users, ArrowRight, Clock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface CallTransfer {
  id: string;
  call_id: string;
  from_agent: string;
  to_specialist: string;
  specialist_type: string;
  transfer_reason: string;
  transfer_notes: string;
  transfer_status: string;
  created_at: string;
  updated_at: string;
}

interface ActiveCall {
  id: string;
  client_id: string;
  phone_number: string;
  call_status: string;
  agent_email: string;
  started_at: string;
  clients?: {
    name: string;
  };
}

interface AgentStatus {
  id: string;
  agent_email: string;
  status: string;
  break_type: string | null;
  updated_at: string;
}

const CallTransferSystem = () => {
  const [transfers, setTransfers] = useState<CallTransfer[]>([]);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [transferReason, setTransferReason] = useState<string>("");
  const [transferNotes, setTransferNotes] = useState<string>("");
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchTransfers();
    fetchActiveCalls();
    fetchAvailableAgents();

    // Subscribe to real-time agent status updates
    const channel = supabase
      .channel('agent-status-transfers')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_status'
        },
        () => {
          fetchAvailableAgents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTransfers = async () => {
    try {
      const { data, error } = await supabase
        .from("call_transfers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setTransfers(data || []);
    } catch (error) {
      console.error("Error fetching transfers:", error);
      toast({
        title: "Error",
        description: "Failed to fetch call transfers",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActiveCalls = async () => {
    try {
      const { data, error } = await supabase
        .from("outbound_calls")
        .select(`
          *,
          clients!inner (name)
        `)
        .eq("call_status", "in_progress");

      if (error) throw error;
      setActiveCalls(data || []);
    } catch (error) {
      console.error("Error fetching active calls:", error);
    }
  };

  const fetchAvailableAgents = async () => {
    try {
      const { data, error } = await supabase
        .from("agent_status")
        .select("*")
        .eq("status", "available")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setAvailableAgents(data || []);
    } catch (error) {
      console.error("Error fetching available agents:", error);
    }
  };

  const handleTransferCall = async () => {
    if (!selectedCall || !selectedAgent || !transferReason) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Real-time availability check before transfer
    const { data: currentStatus, error: statusError } = await supabase
      .from("agent_status")
      .select("status")
      .eq("agent_email", selectedAgent)
      .maybeSingle();

    if (statusError) {
      toast({
        title: "Error",
        description: "Failed to verify agent availability",
        variant: "destructive",
      });
      return;
    }

    if (!currentStatus || currentStatus.status !== "available") {
      toast({
        title: "Agent Unavailable",
        description: `${selectedAgent} is no longer available. Please select another agent.`,
        variant: "destructive",
      });
      fetchAvailableAgents(); // Refresh the list
      return;
    }

    // Verify the SELECTED agent actually holds the agent role
    const { data: agentProfile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", selectedAgent)
      .maybeSingle();

    if (profileError || !agentProfile?.user_id) {
      toast({
        title: "Error",
        description: "Could not verify the selected agent's account",
        variant: "destructive",
      });
      return;
    }

    const { data: agentRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", agentProfile.user_id)
      .eq("role", "agent")
      .maybeSingle();

    if (roleError || !agentRole) {
      toast({
        title: "Error",
        description: "Selected user is not an agent",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("call_transfers")
        .insert({
          call_id: selectedCall,
          from_agent: user?.email || "unknown",
          to_specialist: selectedAgent,
          specialist_type: "agent",
          transfer_reason: transferReason,
          transfer_notes: transferNotes,
          transfer_status: "pending"
        });

      if (error) throw error;

      // Update agent status to on_call
      await supabase
        .from("agent_status")
        .update({ status: "on_call", current_call_id: selectedCall })
        .eq("agent_email", selectedAgent);

      toast({
        title: "Success",
        description: `Call transferred to ${selectedAgent} successfully`,
      });

      // Reset form
      setSelectedCall("");
      setSelectedAgent("");
      setTransferReason("");
      setTransferNotes("");
      
      // Refresh data
      fetchTransfers();
      fetchAvailableAgents();
    } catch (error) {
      console.error("Error transferring call:", error);
      toast({
        title: "Error",
        description: "Failed to transfer call",
        variant: "destructive",
      });
    }
  };

  const updateTransferStatus = async (transferId: string, status: string) => {
    try {
      const { error } = await supabase
        .from("call_transfers")
        .update({ transfer_status: status, updated_at: new Date().toISOString() })
        .eq("id", transferId);

      if (error) throw error;
      
      fetchTransfers();
      toast({
        title: "Success",
        description: `Transfer ${status} successfully`,
      });
    } catch (error) {
      console.error("Error updating transfer status:", error);
      toast({
        title: "Error",
        description: "Failed to update transfer status",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Transfer Call Dialog */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Call Transfer System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="mb-4">
                <PhoneCall className="h-4 w-4 mr-2" />
                Transfer Call
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Transfer Active Call</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Select Active Call</label>
                  <Select value={selectedCall} onValueChange={setSelectedCall}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a call to transfer" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCalls.map((call) => (
                        <SelectItem key={call.id} value={call.id}>
                          {call.clients?.name || call.phone_number} - {call.phone_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Transfer To Agent</label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select available agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAgents.length === 0 ? (
                        <SelectItem value="none" disabled>No agents available</SelectItem>
                      ) : (
                        availableAgents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.agent_email}>
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              {agent.agent_email}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {availableAgents.length === 0 && (
                    <p className="text-xs text-destructive mt-1">
                      No agents currently available for transfer
                    </p>
                  )}
                  {availableAgents.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {availableAgents.length} agent(s) available
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Transfer Reason</label>
                  <Select value={transferReason} onValueChange={setTransferReason}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select transfer reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical_issue">Technical Issue</SelectItem>
                      <SelectItem value="billing_inquiry">Billing Inquiry</SelectItem>
                      <SelectItem value="escalation">Escalation Required</SelectItem>
                      <SelectItem value="specialist_needed">Specialist Needed</SelectItem>
                      <SelectItem value="clarity_needed">Further Clarity Needed</SelectItem>
                      <SelectItem value="language_barrier">Language Barrier</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Transfer Notes</label>
                  <Textarea
                    placeholder="Add any relevant notes about the transfer..."
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                  />
                </div>

                <Button 
                  onClick={handleTransferCall} 
                  className="w-full"
                  disabled={availableAgents.length === 0}
                >
                  Transfer Call
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Active Calls */}
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Active Calls ({activeCalls.length})
            </h3>
            {activeCalls.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active calls</p>
            ) : (
              <div className="grid gap-2">
                {activeCalls.map((call) => (
                  <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{call.clients?.name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">{call.phone_number}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {call.started_at ? new Date(call.started_at).toLocaleTimeString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Transfers */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading transfers...</p>
          ) : transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent transfers</p>
          ) : (
            <div className="space-y-4">
              {transfers.map((transfer) => (
                <div key={transfer.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Transfer #{transfer.id.slice(0, 8)}</span>
                      {getStatusBadge(transfer.transfer_status)}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(transfer.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">From:</span> {transfer.from_agent}
                    </div>
                    <div>
                      <span className="text-muted-foreground">To:</span> {transfer.to_specialist}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type:</span> {transfer.specialist_type}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Reason:</span> {transfer.transfer_reason}
                    </div>
                  </div>
                  
                  {transfer.transfer_notes && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Notes:</span> {transfer.transfer_notes}
                    </div>
                  )}

                  {transfer.transfer_status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateTransferStatus(transfer.id, 'completed')}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => updateTransferStatus(transfer.id, 'rejected')}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CallTransferSystem;