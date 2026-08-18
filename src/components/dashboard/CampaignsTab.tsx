import { useState, useEffect, useRef } from "react";
import { TagPicker } from "./TagPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Phone, Calendar, Settings, Play, Languages, Trash2, Mic, Users, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { CampaignTranslationsEditor } from "./CampaignTranslationsEditor";
import { CampaignRecordingsPanel } from "./CampaignRecordingsPanel";
import { CampaignClientsPanel } from "./CampaignClientsPanel";
import { CampaignProgressPanel } from "./CampaignProgressPanel";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

interface Campaign {
  id: string;
  name: string;
  type: string;
  script: string;
  is_active: boolean;
  options: any;
  script_translations?: any;
  script_audio_urls?: any;
  created_at: string;
  updated_at: string;
}

const CampaignsTab = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isAddCampaignOpen, setIsAddCampaignOpen] = useState(false);
  const [isEditCampaignOpen, setIsEditCampaignOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [addCampaignTab, setAddCampaignTab] = useState("basic");
  const [activeRuns, setActiveRuns] = useState<Record<string, string>>({});
  const [editCampaignTab, setEditCampaignTab] = useState("basic");
  const { toast } = useToast();
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const editScriptRef = useRef<HTMLTextAreaElement>(null);

  const [campaignForm, setCampaignForm] = useState({
    name: "",
    type: "",
    customType: "",
    script: "",
    is_active: true,
    script_translations: {} as Record<string, string>,
    script_audio_urls: {} as Record<string, string>,
    options: {
      includeClientName: true,
      includePolicyNumber: true,
      includePremiumAmount: true,
      includeDueDate: true,
      includePaymentStatus: true,
      callTimeSlot: "business_hours",
      maxRetryAttempts: 3,
      followUpDelay: 24,
      recordCall: true,
      sendSMS: false,
      emailNotification: true,
      playGreeting: true,
      playIntro: true,
      playIvrMenu: true,
    },
  });

  const [campaignTypes, setCampaignTypes] = useState<Array<{ key: string; label: string }>>([]);

  useEffect(() => {
    fetchCampaigns();
    fetchCampaignTypes();
  }, []);

  useRealtimeRefresh(["call_campaigns"], () => fetchCampaigns());
  useRealtimeRefresh(["campaign_types"], () => fetchCampaignTypes());

  const fetchCampaignTypes = async () => {
    const { data } = await supabase
      .from("campaign_types" as any)
      .select("key,label,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    setCampaignTypes(((data as any) || []).map((t: any) => ({ key: t.key, label: t.label })));
  };

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("call_campaigns")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      toast({
        title: "Error",
        description: "Failed to fetch campaigns",
        variant: "destructive",
      });
    }
  };

  const resetCampaignForm = () => {
    setCampaignForm({
      name: "",
      type: "",
      customType: "",
      script: "",
      is_active: true,
      script_translations: {},
      script_audio_urls: {},
      options: {
        includeClientName: true,
        includePolicyNumber: true,
        includePremiumAmount: true,
        includeDueDate: true,
        includePaymentStatus: true,
        callTimeSlot: "business_hours",
        maxRetryAttempts: 3,
        followUpDelay: 24,
        recordCall: true,
        sendSMS: false,
        emailNotification: true,
        playGreeting: true,
        playIntro: true,
        playIvrMenu: true,
      },
    });
  };

  const handleAddCampaign = async (keepOpen = false) => {
    if (!campaignForm.name || !campaignForm.type || !campaignForm.script) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (campaignForm.type === "custom" && !campaignForm.customType) {
      toast({
        title: "Error",
        description: "Please enter a custom type name",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const finalType = campaignForm.type === "custom" ? campaignForm.customType : campaignForm.type;
      const { customType, ...campaignDataWithoutCustomType } = campaignForm;
      
      const campaignData = {
        ...campaignDataWithoutCustomType,
        type: finalType
      };
      
      const { error } = await supabase.from("call_campaigns").insert([campaignData]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Campaign added successfully",
      });

      resetCampaignForm();
      if (keepOpen) {
        setAddCampaignTab("basic");
      } else {
        setIsAddCampaignOpen(false);
      }
      fetchCampaigns();
    } catch (error) {
      console.error("Error adding campaign:", error);
      toast({
        title: "Error",
        description: "Failed to add campaign",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditCampaign = async () => {
    if (!selectedCampaign || !campaignForm.name || !campaignForm.script) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (campaignForm.type === "custom" && !campaignForm.customType) {
      toast({
        title: "Error",
        description: "Please enter a custom type name",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const finalType = campaignForm.type === "custom" ? campaignForm.customType : campaignForm.type;
      const { customType, ...campaignDataWithoutCustomType } = campaignForm;
      
      const campaignData = {
        ...campaignDataWithoutCustomType,
        type: finalType
      };
      
      const { error } = await supabase
        .from("call_campaigns")
        .update(campaignData)
        .eq("id", selectedCampaign.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Campaign updated successfully",
      });

      setIsEditCampaignOpen(false);
      setSelectedCampaign(null);
      fetchCampaigns();
    } catch (error) {
      console.error("Error updating campaign:", error);
      toast({
        title: "Error",
        description: "Failed to update campaign",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCampaignStatus = async (campaign: Campaign) => {
    try {
      const { error } = await supabase
        .from("call_campaigns")
        .update({ is_active: !campaign.is_active })
        .eq("id", campaign.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Campaign ${!campaign.is_active ? "activated" : "deactivated"}`,
      });

      fetchCampaigns();
    } catch (error) {
      console.error("Error toggling campaign status:", error);
      toast({
        title: "Error",
        description: "Failed to update campaign status",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .from("call_campaigns")
        .delete()
        .eq("id", campaign.id);
      if (error) throw error;
      toast({ title: "Deleted", description: "Campaign removed" });
      fetchCampaigns();
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast({
        title: "Error",
        description: "Failed to delete campaign",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      type: campaign.type,
      customType: "",
      script: campaign.script,
      is_active: campaign.is_active,
      script_translations: (campaign.script_translations as Record<string, string>) || {},
      script_audio_urls: (campaign.script_audio_urls as Record<string, string>) || {},
      options: {
        includeClientName: campaign.options?.includeClientName ?? true,
        includePolicyNumber: campaign.options?.includePolicyNumber ?? true,
        includePremiumAmount: campaign.options?.includePremiumAmount ?? true,
        includeDueDate: campaign.options?.includeDueDate ?? true,
        includePaymentStatus: campaign.options?.includePaymentStatus ?? true,
        callTimeSlot: campaign.options?.callTimeSlot ?? "business_hours",
        maxRetryAttempts: campaign.options?.maxRetryAttempts ?? 3,
        followUpDelay: campaign.options?.followUpDelay ?? 24,
        recordCall: campaign.options?.recordCall ?? true,
        sendSMS: campaign.options?.sendSMS ?? false,
        emailNotification: campaign.options?.emailNotification ?? true,
        playGreeting: campaign.options?.playGreeting ?? true,
        playIntro: campaign.options?.playIntro ?? true,
        playIvrMenu: campaign.options?.playIvrMenu ?? true,
      },
    });
    setIsEditCampaignOpen(true);
  };

  const executeCampaign = async (campaignId: string, immediate = false) => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('campaign-scheduler', {
        body: { 
          campaignId, 
          immediate 
        }
      });

      if (error) throw error;

      const result = data;
      
      toast({
        title: "Success",
        description: result.message || `Campaign ${immediate ? 'executed' : 'scheduled'} successfully`,
      });

      // Refresh campaigns to show updated status
      fetchCampaigns();
    } catch (error) {
      console.error("Error executing campaign:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to execute campaign",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Queue-based execution: enqueue every linked client as durable jobs.
  // Workers (campaign-worker, cron) drain the queue with retry + rate limiting.
  const queueCampaign = async (campaignId: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke("campaign-enqueue", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      const runId = (data as any)?.run_id;
      if (runId) setActiveRuns((p) => ({ ...p, [campaignId]: runId }));
      toast({
        title: "Queued",
        description: `Enqueued ${(data as any)?.enqueued ?? 0} calls${(data as any)?.invalid ? ` · ${(data as any).invalid} skipped (invalid number)` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Could not enqueue", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Load latest non-terminal run id per campaign once on mount.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("campaign_runs")
        .select("id, campaign_id, state, started_at")
        .in("state", ["running", "paused"])
        .order("started_at", { ascending: false });
      const map: Record<string, string> = {};
      for (const r of (data as any[]) ?? []) if (!map[r.campaign_id]) map[r.campaign_id] = r.id;
      setActiveRuns(map);
    })();
  }, []);

  const getCampaignIcon = (type: string) => {
    switch (type) {
      case "premium_reminder":
        return <div className="text-sm font-bold">₵</div>;
      case "failed_deduction":
        return <Phone className="h-4 w-4" />;
      case "medical_booking":
        return <Calendar className="h-4 w-4" />;
      case "policy_renewal":
        return <Calendar className="h-4 w-4" />;
      case "claim_follow_up":
        return <Phone className="h-4 w-4" />;
      case "customer_survey":
        return <Phone className="h-4 w-4" />;
      case "policy_update":
        return <Settings className="h-4 w-4" />;
      case "welcome_call":
        return <Phone className="h-4 w-4" />;
      case "retention_call":
        return <Phone className="h-4 w-4" />;
      case "cross_sell":
        return <div className="text-sm font-bold">₵</div>;
      case "appointment_reminder":
        return <Calendar className="h-4 w-4" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const variants = {
      premium_reminder: "bg-green-100 text-green-800",
      failed_deduction: "bg-red-100 text-red-800",
      medical_booking: "bg-blue-100 text-blue-800",
      policy_renewal: "bg-purple-100 text-purple-800",
      claim_follow_up: "bg-orange-100 text-orange-800",
      customer_survey: "bg-teal-100 text-teal-800",
      policy_update: "bg-indigo-100 text-indigo-800",
      welcome_call: "bg-cyan-100 text-cyan-800",
      retention_call: "bg-pink-100 text-pink-800",
      cross_sell: "bg-yellow-100 text-yellow-800",
      appointment_reminder: "bg-lime-100 text-lime-800",
    } as const;

    return (
      <Badge 
        variant="secondary"
        className={variants[type as keyof typeof variants] || "bg-gray-100 text-gray-800"}
      >
        {type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>AI Call Campaigns</CardTitle>
          <Dialog open={isAddCampaignOpen} onOpenChange={(open) => {
            setIsAddCampaignOpen(open);
            if (!open) setAddCampaignTab("basic");
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Add New Campaign</DialogTitle>
              </DialogHeader>
              <Tabs value={addCampaignTab} onValueChange={setAddCampaignTab} className="w-full">
                <div className="w-full overflow-x-auto -mx-1 px-1">
                  <TabsList className="inline-flex h-auto w-max min-w-full gap-1 p-1">
                    <TabsTrigger value="basic" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">Basic Info</TabsTrigger>
                    <TabsTrigger value="config" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">Configuration</TabsTrigger>
                    <TabsTrigger value="translations" className="whitespace-nowrap gap-1 px-3 py-1.5 text-xs sm:text-sm"><Languages className="h-3 w-3" />Translations</TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="basic" className="space-y-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Campaign Name *</Label>
                    <Input
                      id="name"
                      value={campaignForm.name}
                      onChange={(e) =>
                        setCampaignForm({ ...campaignForm, name: e.target.value })
                      }
                      placeholder="Campaign name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type">Campaign Type *</Label>
                    <Select
                      value={campaignForm.type}
                      onValueChange={(value) =>
                        setCampaignForm({ ...campaignForm, type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaignTypes.map((t) => (
                          <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                        ))}
                        <SelectItem value="custom">Custom Campaign</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {campaignForm.type === "custom" && (
                    <div className="grid gap-2">
                      <Label htmlFor="customType">Custom Type Name *</Label>
                      <Input
                        id="customType"
                        value={campaignForm.customType || ""}
                        onChange={(e) =>
                          setCampaignForm({ ...campaignForm, customType: e.target.value })
                        }
                        placeholder="Enter custom campaign type"
                      />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="script">AI Script *</Label>
                    <Textarea
                      ref={scriptRef}
                      id="script"
                      value={campaignForm.script}
                      onChange={(e) =>
                        setCampaignForm({ ...campaignForm, script: e.target.value })
                      }
                      placeholder="Enter the AI script for this campaign..."
                      rows={6}
                    />
                    <TagPicker
                      textareaRef={scriptRef}
                      value={campaignForm.script}
                      onChange={(next) => setCampaignForm({ ...campaignForm, script: next })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="active"
                      checked={campaignForm.is_active}
                      onCheckedChange={(checked) =>
                        setCampaignForm({ ...campaignForm, is_active: checked })
                      }
                    />
                    <Label htmlFor="active">Active Campaign</Label>
                  </div>
                </TabsContent>
                
                <TabsContent value="config" className="space-y-4 py-4 max-h-[50vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Include Data Fields</Label>
                      {[
                        { key: 'includeClientName', label: 'Client Name' },
                        { key: 'includePolicyNumber', label: 'Policy Number' },
                        { key: 'includePremiumAmount', label: 'Premium Amount' },
                        { key: 'includeDueDate', label: 'Due Date' },
                        { key: 'includePaymentStatus', label: 'Payment Status' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center space-x-2">
                          <Switch
                            id={key}
                            checked={campaignForm.options[key]}
                            onCheckedChange={(checked) =>
                              setCampaignForm({
                                ...campaignForm,
                                options: { ...campaignForm.options, [key]: checked }
                              })
                            }
                          />
                          <Label htmlFor={key} className="text-sm">{label}</Label>
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Call Settings</Label>
                      <div className="grid gap-2">
                        <Label htmlFor="timeSlot" className="text-xs">Call Time Slot</Label>
                        <Select
                          value={campaignForm.options.callTimeSlot}
                          onValueChange={(value) =>
                            setCampaignForm({
                              ...campaignForm,
                              options: { ...campaignForm.options, callTimeSlot: value }
                            })
                          }
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="business_hours">Business Hours (9-5)</SelectItem>
                            <SelectItem value="morning">Morning (8-12)</SelectItem>
                            <SelectItem value="afternoon">Afternoon (12-6)</SelectItem>
                            <SelectItem value="evening">Evening (6-9)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="retryAttempts" className="text-xs">Max Retry Attempts</Label>
                        <Input
                          id="retryAttempts"
                          type="number"
                          min="1"
                          max="10"
                          value={campaignForm.options.maxRetryAttempts}
                          onChange={(e) =>
                            setCampaignForm({
                              ...campaignForm,
                              options: { ...campaignForm.options, maxRetryAttempts: parseInt(e.target.value) }
                            })
                          }
                          className="text-xs"
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="followUpDelay" className="text-xs">Follow-up Delay (hours)</Label>
                        <Input
                          id="followUpDelay"
                          type="number"
                          min="1"
                          max="168"
                          value={campaignForm.options.followUpDelay}
                          onChange={(e) =>
                            setCampaignForm({
                              ...campaignForm,
                              options: { ...campaignForm.options, followUpDelay: parseInt(e.target.value) }
                            })
                          }
                          className="text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Additional Options</Label>
                    <div className="flex flex-wrap gap-4">
                      {[
                        { key: 'recordCall', label: 'Record Calls' },
                        { key: 'sendSMS', label: 'Send Follow-up SMS' },
                        { key: 'emailNotification', label: 'Email Notifications' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center space-x-2">
                          <Switch
                            id={key}
                            checked={campaignForm.options[key]}
                            onCheckedChange={(checked) =>
                              setCampaignForm({
                                ...campaignForm,
                                options: { ...campaignForm.options, [key]: checked }
                              })
                            }
                          />
                          <Label htmlFor={key} className="text-sm">{label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <Label className="text-sm font-medium">Call Flow Segments</Label>
                    <p className="text-xs text-muted-foreground">Toggle which intro recordings play before the campaign message. If all are off, the call goes straight to the campaign message in the client's preferred language (defaults to English).</p>
                    <div className="flex flex-wrap gap-4">
                      {[
                        { key: 'playGreeting', label: 'Play Greeting (Recording 1 — "Dear …")' },
                        { key: 'playIntro', label: 'Play Intro (Recording 2)' },
                        { key: 'playIvrMenu', label: 'Play IVR Language Menu' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center space-x-2">
                          <Switch
                            id={key}
                            checked={campaignForm.options[key] ?? true}
                            onCheckedChange={(checked) =>
                              setCampaignForm({
                                ...campaignForm,
                                options: { ...campaignForm.options, [key]: checked }
                              })
                            }
                          />
                          <Label htmlFor={key} className="text-sm">{label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="translations" className="space-y-4 py-4 max-h-[55vh] overflow-y-auto">
                  <CampaignTranslationsEditor
                    translations={campaignForm.script_translations}
                    audioUrls={campaignForm.script_audio_urls}
                    onChange={({ translations, audioUrls }) =>
                      setCampaignForm({ ...campaignForm, script_translations: translations, script_audio_urls: audioUrls })
                    }
                  />
                </TabsContent>
              </Tabs>
              
              <div className="flex flex-wrap justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsAddCampaignOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="secondary" onClick={() => handleAddCampaign(true)} disabled={isLoading}>
                  <Plus className="h-4 w-4 mr-1" /> Save & add another
                </Button>
                <Button onClick={() => handleAddCampaign(false)} disabled={isLoading}>
                  {isLoading ? "Adding..." : "Add Campaign"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getCampaignIcon(campaign.type)}
                  <div>
                    <h3 className="font-semibold">{campaign.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {getTypeBadge(campaign.type)}
                      <Badge variant={campaign.is_active ? "default" : "secondary"}>
                        {campaign.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => executeCampaign(campaign.id, true)}
                    disabled={!campaign.is_active || isLoading}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Execute Now
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => queueCampaign(campaign.id)}
                    disabled={!campaign.is_active || isLoading}
                    title="Enqueue all linked clients as durable jobs with retry"
                  >
                    <ListChecks className="h-3 w-3 mr-1" />
                    Queue Run
                  </Button>
                  <Switch
                    checked={campaign.is_active}
                    onCheckedChange={() => toggleCampaignStatus(campaign)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(campaign)}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteCampaign(campaign)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
              <div className="bg-muted p-3 rounded-md mb-3">
                <p className="text-sm text-muted-foreground mb-1">AI Script:</p>
                <p className="text-sm">{campaign.script}</p>
              </div>

              {activeRuns[campaign.id] && (
                <div className="mb-3">
                  <CampaignProgressPanel runId={activeRuns[campaign.id]} />
                </div>
              )}
              
              
              {campaign.options && (
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-sm text-muted-foreground mb-2">Configuration:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="font-medium">Call Time:</span> {campaign.options.callTimeSlot?.replace('_', ' ') || 'Business Hours'}
                    </div>
                    <div>
                      <span className="font-medium">Max Retries:</span> {campaign.options.maxRetryAttempts || 3}
                    </div>
                    <div>
                      <span className="font-medium">Follow-up:</span> {campaign.options.followUpDelay || 24}h
                    </div>
                    <div>
                      <span className="font-medium">Record Calls:</span> {campaign.options.recordCall ? 'Yes' : 'No'}
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="font-medium text-xs">Includes:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {campaign.options.includeClientName && <Badge variant="outline" className="text-xs">Name</Badge>}
                      {campaign.options.includePolicyNumber && <Badge variant="outline" className="text-xs">Policy#</Badge>}
                      {campaign.options.includePremiumAmount && <Badge variant="outline" className="text-xs">Amount</Badge>}
                      {campaign.options.includeDueDate && <Badge variant="outline" className="text-xs">Due Date</Badge>}
                      {campaign.options.includePaymentStatus && <Badge variant="outline" className="text-xs">Status</Badge>}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>

        {campaigns.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No campaigns found. Add your first campaign to get started.
          </div>
        )}

        {/* Edit Campaign Dialog */}
        <Dialog open={isEditCampaignOpen} onOpenChange={(open) => {
          setIsEditCampaignOpen(open);
          if (!open) setEditCampaignTab("basic");
        }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Edit Campaign</DialogTitle>
            </DialogHeader>
            <Tabs value={editCampaignTab} onValueChange={setEditCampaignTab} className="w-full min-w-0">
              <div className="w-full overflow-x-auto -mx-1 px-1">
                <TabsList className="inline-flex h-auto w-max min-w-full gap-1 p-1">
                  <TabsTrigger value="basic" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">Basic Info</TabsTrigger>
                  <TabsTrigger value="config" className="whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm">Configuration</TabsTrigger>
                  <TabsTrigger value="translations" className="whitespace-nowrap gap-1 px-3 py-1.5 text-xs sm:text-sm"><Languages className="h-3 w-3" />Translations</TabsTrigger>
                  <TabsTrigger value="recordings" className="whitespace-nowrap gap-1 px-3 py-1.5 text-xs sm:text-sm"><Mic className="h-3 w-3" />Recordings</TabsTrigger>
                  <TabsTrigger value="clients" className="whitespace-nowrap gap-1 px-3 py-1.5 text-xs sm:text-sm"><Users className="h-3 w-3" />Clients</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="basic" className="space-y-4 py-4 max-h-[55vh] overflow-y-auto">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Campaign Name *</Label>
                  <Input
                    id="edit-name"
                    value={campaignForm.name}
                    onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                    placeholder="Campaign name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-type">Campaign Type *</Label>
                  <Select
                    value={campaignForm.type}
                    onValueChange={(value) => setCampaignForm({ ...campaignForm, type: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {campaignTypes.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                      {campaignForm.type && !campaignTypes.some((t) => t.key === campaignForm.type) && campaignForm.type !== "custom" && (
                        <SelectItem value={campaignForm.type}>{campaignForm.type}</SelectItem>
                      )}
                      <SelectItem value="custom">Custom Campaign</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-script">AI Script *</Label>
                  <Textarea
                    ref={editScriptRef}
                    id="edit-script"
                    value={campaignForm.script}
                    onChange={(e) => setCampaignForm({ ...campaignForm, script: e.target.value })}
                    placeholder="Enter the AI script for this campaign..."
                    rows={6}
                  />
                  <TagPicker
                    textareaRef={editScriptRef}
                    value={campaignForm.script}
                    onChange={(next) => setCampaignForm({ ...campaignForm, script: next })}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-active"
                    checked={campaignForm.is_active}
                    onCheckedChange={(checked) => setCampaignForm({ ...campaignForm, is_active: checked })}
                  />
                  <Label htmlFor="edit-active">Active Campaign</Label>
                </div>
              </TabsContent>

              <TabsContent value="config" className="space-y-4 py-4 max-h-[55vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Include Data Fields</Label>
                    {[
                      { key: 'includeClientName', label: 'Client Name' },
                      { key: 'includePolicyNumber', label: 'Policy Number' },
                      { key: 'includePremiumAmount', label: 'Premium Amount' },
                      { key: 'includeDueDate', label: 'Due Date' },
                      { key: 'includePaymentStatus', label: 'Payment Status' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Switch
                          id={`edit-${key}`}
                          checked={campaignForm.options[key]}
                          onCheckedChange={(checked) =>
                            setCampaignForm({
                              ...campaignForm,
                              options: { ...campaignForm.options, [key]: checked }
                            })
                          }
                        />
                        <Label htmlFor={`edit-${key}`} className="text-sm">{label}</Label>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Call Settings</Label>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-timeSlot" className="text-xs">Call Time Slot</Label>
                      <Select
                        value={campaignForm.options.callTimeSlot}
                        onValueChange={(value) =>
                          setCampaignForm({
                            ...campaignForm,
                            options: { ...campaignForm.options, callTimeSlot: value }
                          })
                        }
                      >
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="business_hours">Business Hours (9-5)</SelectItem>
                          <SelectItem value="morning">Morning (8-12)</SelectItem>
                          <SelectItem value="afternoon">Afternoon (12-6)</SelectItem>
                          <SelectItem value="evening">Evening (6-9)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="edit-retryAttempts" className="text-xs">Max Retry Attempts</Label>
                      <Input
                        id="edit-retryAttempts"
                        type="number"
                        min="1"
                        max="10"
                        value={campaignForm.options.maxRetryAttempts}
                        onChange={(e) =>
                          setCampaignForm({
                            ...campaignForm,
                            options: { ...campaignForm.options, maxRetryAttempts: parseInt(e.target.value) }
                          })
                        }
                        className="text-xs"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="edit-followUpDelay" className="text-xs">Follow-up Delay (hours)</Label>
                      <Input
                        id="edit-followUpDelay"
                        type="number"
                        min="1"
                        max="168"
                        value={campaignForm.options.followUpDelay}
                        onChange={(e) =>
                          setCampaignForm({
                            ...campaignForm,
                            options: { ...campaignForm.options, followUpDelay: parseInt(e.target.value) }
                          })
                        }
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Additional Options</Label>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { key: 'recordCall', label: 'Record Calls' },
                      { key: 'sendSMS', label: 'Send Follow-up SMS' },
                      { key: 'emailNotification', label: 'Email Notifications' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Switch
                          id={`edit-opt-${key}`}
                          checked={campaignForm.options[key]}
                          onCheckedChange={(checked) =>
                            setCampaignForm({
                              ...campaignForm,
                              options: { ...campaignForm.options, [key]: checked }
                            })
                          }
                        />
                        <Label htmlFor={`edit-opt-${key}`} className="text-sm">{label}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <Label className="text-sm font-medium">Call Flow Segments</Label>
                  <p className="text-xs text-muted-foreground">Toggle which intro recordings play before the campaign message. If all are off, the call goes straight to the campaign message in the client's preferred language (defaults to English).</p>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { key: 'playGreeting', label: 'Play Greeting (Recording 1 — "Dear …")' },
                      { key: 'playIntro', label: 'Play Intro (Recording 2)' },
                      { key: 'playIvrMenu', label: 'Play IVR Language Menu' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Switch
                          id={`edit-opt-${key}`}
                          checked={campaignForm.options[key] ?? true}
                          onCheckedChange={(checked) =>
                            setCampaignForm({
                              ...campaignForm,
                              options: { ...campaignForm.options, [key]: checked }
                            })
                          }
                        />
                        <Label htmlFor={`edit-opt-${key}`} className="text-sm">{label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="translations" className="space-y-4 py-4 max-h-[55vh] overflow-y-auto">
                <CampaignTranslationsEditor
                  translations={campaignForm.script_translations}
                  audioUrls={campaignForm.script_audio_urls}
                  onChange={({ translations, audioUrls }) =>
                    setCampaignForm({ ...campaignForm, script_translations: translations, script_audio_urls: audioUrls })
                  }
                />
              </TabsContent>

              <TabsContent value="recordings" className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                {selectedCampaign ? (
                  <CampaignRecordingsPanel campaignId={selectedCampaign.id} script={campaignForm.script} />
                ) : (
                  <p className="text-sm text-muted-foreground">Save the campaign first to manage recordings.</p>
                )}
              </TabsContent>

              <TabsContent value="clients" className="space-y-4 py-4 max-h-[60vh] overflow-y-auto overflow-x-hidden min-w-0">
                {selectedCampaign ? (
                  <CampaignClientsPanel campaignId={selectedCampaign.id} script={campaignForm.script} />
                ) : (
                  <p className="text-sm text-muted-foreground">Save the campaign first to assign clients.</p>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsEditCampaignOpen(false)}>Cancel</Button>
              <Button onClick={handleEditCampaign} disabled={isLoading}>
                {isLoading ? "Updating..." : "Update Campaign"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default CampaignsTab;