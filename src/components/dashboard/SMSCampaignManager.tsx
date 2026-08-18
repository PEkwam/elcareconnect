import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  MessageSquare, 
  Phone, 
  Plus, 
  Send, 
  Pause, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock,
  Users,
  MessageCircle,
  Smartphone
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

import {
  normalizeSMSCampaigns,
  buildSMSCampaignPayload,
  type NormalizedSMSCampaign as SMSCampaign,
} from "@/lib/supabaseNormalizers";

interface Client {
  id: string;
  name: string;
  phone: string;
}

export const SMSCampaignManager = () => {
  const [campaigns, setCampaigns] = useState<SMSCampaign[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    message_template: "",
    channel: "sms",
    scheduled_at: ""
  });
  const { toast } = useToast();

  const fetchCampaigns = async () => {
    const { data, error } = await supabase
      .from("sms_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching campaigns:", error);
      return;
    }
    setCampaigns(normalizeSMSCampaigns(data));
  };

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, phone")
      .order("name");

    if (error) {
      console.error("Error fetching clients:", error);
      return;
    }
    setClients(data || []);
  };

  useEffect(() => {
    fetchCampaigns();
    fetchClients();
  }, []);

  useRealtimeRefresh(["sms_campaigns"], () => fetchCampaigns());
  useRealtimeRefresh(["clients"], () => fetchClients());

  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.message_template) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_campaigns")
        .insert(
          buildSMSCampaignPayload({
            name: newCampaign.name,
            message_template: newCampaign.message_template,
            channel: newCampaign.channel,
            scheduled_at: newCampaign.scheduled_at,
            total_recipients: selectedClients.length,
          })
        )
        .select()
        .single();

      if (error) throw error;

      // Create message records for each selected client
      if (selectedClients.length > 0 && data) {
        const messages = selectedClients.map(clientId => {
          const client = clients.find(c => c.id === clientId);
          return {
            campaign_id: data.id,
            client_id: clientId,
            phone_number: client?.phone || "",
            message: newCampaign.message_template,
            channel: newCampaign.channel
          };
        });

        await supabase.from("sms_messages").insert(messages);
      }

      toast({
        title: "Campaign Created",
        description: `${newCampaign.name} has been created successfully`
      });

      setNewCampaign({ name: "", message_template: "", channel: "sms", scheduled_at: "" });
      setSelectedClients([]);
      setDialogOpen(false);
      fetchCampaigns();
    } catch (error) {
      console.error("Error creating campaign:", error);
      toast({
        title: "Error",
        description: "Failed to create campaign",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartCampaign = async (campaignId: string) => {
    try {
      await supabase
        .from("sms_campaigns")
        .update({ status: "in_progress" })
        .eq("id", campaignId);

      toast({
        title: "Campaign Started",
        description: "Messages are being sent"
      });
      fetchCampaigns();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start campaign",
        variant: "destructive"
      });
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      await supabase
        .from("sms_campaigns")
        .update({ status: "paused" })
        .eq("id", campaignId);

      toast({
        title: "Campaign Paused",
        description: "Campaign has been paused"
      });
      fetchCampaigns();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to pause campaign",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      draft: { variant: "secondary", icon: <Clock className="h-3 w-3" /> },
      scheduled: { variant: "outline", icon: <Clock className="h-3 w-3" /> },
      in_progress: { variant: "default", icon: <Send className="h-3 w-3" /> },
      completed: { variant: "secondary", icon: <CheckCircle className="h-3 w-3" /> },
      paused: { variant: "destructive", icon: <Pause className="h-3 w-3" /> }
    };
    const style = styles[status] || styles.draft;
    return (
      <Badge variant={style.variant} className="flex items-center gap-1">
        {style.icon}
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const getChannelIcon = (channel: string) => {
    return channel === "whatsapp" ? (
      <MessageCircle className="h-4 w-4 text-green-500" />
    ) : (
      <Smartphone className="h-4 w-4 text-blue-500" />
    );
  };

  const toggleClientSelection = (clientId: string) => {
    setSelectedClients(prev => 
      prev.includes(clientId) 
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const selectAllClients = () => {
    if (selectedClients.length === clients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(clients.map(c => c.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            SMS & WhatsApp Campaigns
          </h2>
          <p className="text-muted-foreground">
            Create and manage multi-channel messaging campaigns
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Campaign</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Campaign Details</TabsTrigger>
                <TabsTrigger value="recipients">Recipients ({selectedClients.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    value={newCampaign.name}
                    onChange={e => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Payment Reminder Campaign"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel">Channel</Label>
                  <Select
                    value={newCampaign.channel}
                    onValueChange={value => setNewCampaign(prev => ({ ...prev, channel: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sms">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4" />
                          SMS
                        </div>
                      </SelectItem>
                      <SelectItem value="whatsapp">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message Template</Label>
                  <Textarea
                    id="message"
                    value={newCampaign.message_template}
                    onChange={e => setNewCampaign(prev => ({ ...prev, message_template: e.target.value }))}
                    placeholder="Hi {name}, this is a reminder about your upcoming payment..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{name}"} to personalize with client name
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduled">Schedule (Optional)</Label>
                  <Input
                    id="scheduled"
                    type="datetime-local"
                    value={newCampaign.scheduled_at}
                    onChange={e => setNewCampaign(prev => ({ ...prev, scheduled_at: e.target.value }))}
                  />
                </div>
              </TabsContent>
              <TabsContent value="recipients" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {selectedClients.length} of {clients.length} selected
                    </span>
                    <Button variant="outline" size="sm" onClick={selectAllClients}>
                      {selectedClients.length === clients.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    {clients.map(client => (
                      <div
                        key={client.id}
                        className={`flex items-center justify-between p-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 ${
                          selectedClients.includes(client.id) ? "bg-primary/5" : ""
                        }`}
                        onClick={() => toggleClientSelection(client.id)}
                      >
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-sm text-muted-foreground">{client.phone}</p>
                        </div>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                          selectedClients.includes(client.id) 
                            ? "bg-primary border-primary text-primary-foreground" 
                            : "border-muted-foreground"
                        }`}>
                          {selectedClients.includes(client.id) && <CheckCircle className="h-3 w-3" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCampaign} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Campaign"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{campaigns.length}</p>
                <p className="text-sm text-muted-foreground">Total Campaigns</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Send className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {campaigns.reduce((acc, c) => acc + c.sent_count, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Messages Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {campaigns.reduce((acc, c) => acc + c.delivered_count, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {campaigns.reduce((acc, c) => acc + c.failed_count, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No campaigns yet. Create your first campaign to get started.
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map(campaign => (
                  <TableRow key={campaign.id}>
                    <TableCell>{getChannelIcon(campaign.channel)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-xs">
                          {campaign.message_template}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress 
                          value={campaign.total_recipients > 0 
                            ? (campaign.sent_count / campaign.total_recipients) * 100 
                            : 0
                          } 
                          className="h-2 w-24" 
                        />
                        <p className="text-xs text-muted-foreground">
                          {campaign.sent_count}/{campaign.total_recipients}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {format(new Date(campaign.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {campaign.status === "draft" && (
                          <Button 
                            size="sm" 
                            onClick={() => handleStartCampaign(campaign.id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Start
                          </Button>
                        )}
                        {campaign.status === "in_progress" && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handlePauseCampaign(campaign.id)}
                          >
                            <Pause className="h-3 w-3 mr-1" />
                            Pause
                          </Button>
                        )}
                        {campaign.status === "paused" && (
                          <Button 
                            size="sm"
                            onClick={() => handleStartCampaign(campaign.id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Resume
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
