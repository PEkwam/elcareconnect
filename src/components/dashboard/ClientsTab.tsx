import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Plus, Phone, Calendar, Upload, Download, Edit, Trash2, UserPlus, Megaphone, Filter } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { normalizePhoneE164, isE164 } from "@/lib/phone";
import {
  parseCSV,
  detectDelimiter,
  normalizeDelimiter,
  prepareClientRow,
  downloadClientTemplate,
} from "@/lib/clientImport";

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  policy_number: string;
  product_type: string;
  premium_amount: number;
  premium_due_date: string;
  payment_status: string;
  created_at: string;
}

interface ClientsTabProps {
  onStatsUpdate: () => void;
}

interface CampaignAssignment {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  status: string;
  custom_data: Record<string, any>;
}

const formatMonthYear = (value?: string | null): string => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }).replace(" ", "-");
  } catch {
    return "-";
  }
};

const BUILTIN_TAG_KEYS = new Set([
  "client_name",
  "due_date",
  "premium_amount",
  "policy_number",
  "product_type",
  "policy_type",
  "this_month",
]);

interface CampaignTag {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
}

const ClientsTab = ({ onStatsUpdate }: ClientsTabProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [productTypes, setProductTypes] = useState<Array<{ code: string; name: string }>>([]);
  const [campaignTags, setCampaignTags] = useState<CampaignTag[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [assignments, setAssignments] = useState<Record<string, CampaignAssignment[]>>({});
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isAssignCampaignOpen, setIsAssignCampaignOpen] = useState(false);
  const [assigningClient, setAssigningClient] = useState<Client | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [bulkAssignMode, setBulkAssignMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [addClientTab, setAddClientTab] = useState("basic");
  const [editClientTab, setEditClientTab] = useState("basic");
  const { toast } = useToast();

  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    phone: "",
    policy_number: "",
    product_type: "",
    premium_amount: "",
    premium_due_date: "",
    payment_status: "current",
  });
  const [newClientTagValues, setNewClientTagValues] = useState<Record<string, string>>({});

  const [editClient, setEditClient] = useState({
    name: "",
    email: "",
    phone: "",
    policy_number: "",
    product_type: "",
    premium_amount: "",
    premium_due_date: "",
    payment_status: "current",
  });
  const [editClientTagValues, setEditClientTagValues] = useState<Record<string, string>>({});

  const customTags = campaignTags.filter(
    (t) => t.is_active && !BUILTIN_TAG_KEYS.has(t.key)
  );

  useEffect(() => {
    fetchClients();
    fetchProductTypes();
    fetchCampaignTags();
    fetchCampaigns();
    fetchAssignments();
  }, []);


  useRealtimeRefresh(["clients"], () => {
    fetchClients();
    onStatsUpdate();
  });
  useRealtimeRefresh(["call_campaigns"], () => fetchCampaigns());
  useRealtimeRefresh(["campaign_clients"], () => fetchAssignments());

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("call_campaigns")
        .select("id, name, type")
        .order("name");
      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    }
  };

  const fetchAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from("campaign_clients")
        .select("client_id, campaign_id, status, custom_data, call_campaigns(name, type)");
      if (error) throw error;
      const map: Record<string, CampaignAssignment[]> = {};
      (data || []).forEach((row: any) => {
        const a: CampaignAssignment = {
          campaign_id: row.campaign_id,
          campaign_name: row.call_campaigns?.name || "Campaign",
          campaign_type: row.call_campaigns?.type || "",
          status: row.status || "pending",
          custom_data: row.custom_data || {},
        };
        if (!map[row.client_id]) map[row.client_id] = [];
        map[row.client_id].push(a);
      });
      setAssignments(map);
    } catch (error) {
      console.error("Error fetching campaign assignments:", error);
    }
  };

  const assignCampaignToClient = async () => {
    const targetClients: Client[] = bulkAssignMode
      ? clients.filter((c) => selectedClientIds.includes(c.id))
      : assigningClient
        ? [assigningClient]
        : [];

    if (targetClients.length === 0 || !selectedCampaignId) {
      toast({ title: "Error", description: "Please select a campaign and at least one client", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const callRows = targetClients.map((c) => ({
        client_id: c.id,
        campaign_id: selectedCampaignId,
        phone_number: c.phone,
        call_status: "scheduled",
        scheduled_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("outbound_calls").insert(callRows);
      if (error) throw error;

      // Also record the assignment in campaign_clients so it shows on the dashboard
      const assignRows = targetClients.map((c) => ({
        client_id: c.id,
        campaign_id: selectedCampaignId,
        status: "pending",
        custom_data: {},
      }));
      const { error: assignErr } = await supabase
        .from("campaign_clients")
        .upsert(assignRows, { onConflict: "campaign_id,client_id" });
      if (assignErr) console.warn("campaign_clients upsert failed:", assignErr);

      const campaign = campaigns.find((c) => c.id === selectedCampaignId);
      toast({
        title: "Campaign Assigned",
        description: bulkAssignMode
          ? `"${campaign?.name}" assigned to ${targetClients.length} client(s)`
          : `"${campaign?.name}" assigned to ${targetClients[0].name}`,
      });
      setIsAssignCampaignOpen(false);
      setAssigningClient(null);
      setSelectedCampaignId("");
      setSelectedClientIds([]);
      setBulkAssignMode(false);
      fetchAssignments();
      onStatsUpdate();
    } catch (error) {
      console.error("Error assigning campaign:", error);
      toast({ title: "Error", description: "Failed to assign campaign", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleClientSelection = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedClientIds.length === clients.length) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(clients.map((c) => c.id));
    }
  };

  const fetchCampaignTags = async () => {
    try {
      const { data, error } = await supabase
        .from("campaign_tags")
        .select("id, key, label, description, category, is_active")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      setCampaignTags((data as CampaignTag[]) || []);
    } catch (error) {
      console.error("Error fetching campaign tags:", error);
    }
  };

  const fetchProductTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("product_types")
        .select("code, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setProductTypes(data || []);
    } catch (error) {
      console.error("Error fetching product types:", error);
      toast({
        title: "Error",
        description: "Failed to fetch product types",
        variant: "destructive",
      });
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast({
        title: "Error",
        description: "Failed to fetch clients",
        variant: "destructive",
      });
    }
  };

  const handleAddClient = async () => {
    if (!newClient.name || !newClient.phone || !newClient.policy_number || !newClient.product_type) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const normalizedPhone = normalizePhoneE164(newClient.phone);
    if (!isE164(normalizedPhone)) {
      toast({
        title: "Invalid phone number",
        description: `"${newClient.phone}" is not a valid phone number. Use international format, e.g. +233241234567.`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const cleanedTagValues = Object.fromEntries(
        Object.entries(newClientTagValues).filter(([, v]) => v !== "" && v !== null && v !== undefined)
      );
      const { data, error } = await supabase.from("clients").insert([
        {
          ...newClient,
          phone: normalizedPhone,
          premium_amount: parseFloat(newClient.premium_amount) || 0,
          tag_values: cleanedTagValues,
        },
      ]).select();

      if (error) throw error;

      // Auto-schedule welcome call for new clients
      try {
        const { data: welcomeCampaign } = await supabase
          .from("call_campaigns")
          .select("*")
          .eq("type", "welcome_call")
          .single();

        if (welcomeCampaign) {
          await supabase.from("outbound_calls").insert([
            {
              client_id: data[0].id,
              campaign_id: welcomeCampaign.id,
              phone_number: newClient.phone,
              call_status: "scheduled",
              scheduled_at: new Date().toISOString(),
            },
          ]);
        }
      } catch (welcomeError) {
        console.log("Welcome campaign not found, skipping auto-schedule");
      }

      toast({
        title: "Success",
        description: "Client added successfully and welcome call scheduled",
      });

      setNewClient({
        name: "",
        email: "",
        phone: "",
        policy_number: "",
        product_type: "",
        premium_amount: "",
        premium_due_date: "",
        payment_status: "current",
      });
      setNewClientTagValues({});
      setIsAddClientOpen(false);
      fetchClients();
      onStatsUpdate();
    } catch (error) {
      console.error("Error adding client:", error);
      toast({
        title: "Error",
        description: "Failed to add client",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const scheduleCall = async (client: Client, campaignType: string) => {
    try {
      // Get campaign
      const { data: campaign } = await supabase
        .from("call_campaigns")
        .select("*")
        .eq("type", campaignType)
        .single();

      if (!campaign) throw new Error("Campaign not found");

      // Schedule call
      const { error } = await supabase.from("outbound_calls").insert([
        {
          client_id: client.id,
          campaign_id: campaign.id,
          phone_number: client.phone,
          call_status: "scheduled",
          scheduled_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Call scheduled for ${client.name}`,
      });

      onStatsUpdate();
    } catch (error) {
      console.error("Error scheduling call:", error);
      toast({
        title: "Error",
        description: "Failed to schedule call",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (!confirm(`Are you sure you want to delete ${client.name}? This action cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", client.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Client deleted successfully",
      });

      fetchClients();
      onStatsUpdate();
    } catch (error) {
      console.error("Error deleting client:", error);
      toast({
        title: "Error",
        description: "Failed to delete client",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClient = async () => {
    if (!editClient.name || !editClient.phone || !editClient.policy_number || !editClient.product_type || !editingClient) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const cleanedTagValues = Object.fromEntries(
        Object.entries(editClientTagValues).filter(([, v]) => v !== "" && v !== null && v !== undefined)
      );
      const { error } = await supabase
        .from("clients")
        .update({
          ...editClient,
          premium_amount: parseFloat(editClient.premium_amount) || 0,
          tag_values: cleanedTagValues,
        })
        .eq("id", editingClient.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Client updated successfully",
      });

      setIsEditClientOpen(false);
      setEditingClient(null);
      fetchClients();
      onStatsUpdate();
    } catch (error) {
      console.error("Error updating client:", error);
      toast({
        title: "Error",
        description: "Failed to update client",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    // Resolve stored product code to product name for the Select
    const storedProduct = client.product_type || "";
    const matchedProduct = productTypes.find(
      (p) => p.code === storedProduct || p.name === storedProduct
    );
    const displayProduct = matchedProduct ? matchedProduct.name : storedProduct;
    setEditClient({
      name: client.name,
      email: client.email || "",
      phone: client.phone,
      policy_number: client.policy_number || "",
      product_type: displayProduct,
      premium_amount: client.premium_amount?.toString() || "",
      premium_due_date: client.premium_due_date || "",
      payment_status: client.payment_status,
    });
    const existing = ((client as any).tag_values || {}) as Record<string, any>;
    const asStrings: Record<string, string> = {};
    Object.entries(existing).forEach(([k, v]) => {
      asStrings[k] = v === null || v === undefined ? "" : String(v);
    });
    setEditClientTagValues(asStrings);
    setIsEditClientOpen(true);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Error",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: async (results) => {
        try {
          setIsLoading(true);
          const rows = results.data as any[];

          const pickName = (r: any) =>
            r.client_name || r.name || r.full_name || r.customer_name || "";
          const pickPremium = (r: any) =>
            r.cur_premium ?? r.premium_amount ?? r.premium ?? r.current_premium;

          const skipped: string[] = [];
          const clientsToInsert = rows
            .filter((row: any) => {
              const phone = String(row.phone ?? "").trim();
              const policy = String(row.policy_number ?? "").trim();
              return phone && policy;
            })
            .map((row: any) => {
              const premiumRaw = pickPremium(row);
              const premium = premiumRaw !== undefined && premiumRaw !== null && String(premiumRaw).trim() !== ""
                ? parseFloat(String(premiumRaw).replace(/[^0-9.\-]/g, ""))
                : 0;
              const rawProduct = String(row.product_type ?? row.product ?? row.policy_type ?? "").trim();
              let resolvedProduct = "";
              if (rawProduct) {
                const lc = rawProduct.toLowerCase();
                const match = productTypes.find(
                  (p) => p.name?.toLowerCase() === lc || p.code?.toLowerCase() === lc
                );
                resolvedProduct = match ? match.name : rawProduct;
              }
              const normalizedPhone = normalizePhoneE164(String(row.phone).trim());
              return {
                name: String(pickName(row) || "Unknown").trim(),
                email: (row.email || "").trim(),
                phone: normalizedPhone,
                policy_number: String(row.policy_number).trim(),
                product_type: resolvedProduct,
                premium_amount: isNaN(premium) ? 0 : premium,
                premium_due_date: row.premium_due_date || null,
                payment_status: row.payment_status || "current",
              };
            })
            .filter((c) => {
              if (!isE164(c.phone)) {
                skipped.push(`${c.name} (${c.phone || 'blank'})`);
                return false;
              }
              return true;
            });

          if (clientsToInsert.length === 0) {
            toast({
              title: "Error",
              description: skipped.length
                ? `All ${skipped.length} rows had invalid phone numbers. Use international format (e.g. +233241234567).`
                : "No valid rows. Ensure CSV has 'phone' and 'policy_number' columns with values.",
              variant: "destructive",
            });
            return;
          }

          if (skipped.length) {
            toast({
              title: `Skipped ${skipped.length} row(s)`,
              description: `Invalid phone numbers: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}`,
            });
          }

          const { error } = await supabase
            .from("clients")
            .insert(clientsToInsert);

          if (error) throw error;

          toast({
            title: "Success",
            description: `${clientsToInsert.length} clients imported successfully`,
          });

          setIsUploadDialogOpen(false);
          fetchClients();
          onStatsUpdate();
        } catch (error: any) {
          console.error("Error importing clients:", error);
          toast({
            title: "Error",
            description: error?.message || "Failed to import clients",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
      },
      error: (error) => {
        toast({
          title: "Error",
          description: "Failed to parse CSV file",
          variant: "destructive",
        });
      },
    });
  };


  const getStatusBadge = (status: string) => {
    const variants = {
      current: "default",
      overdue: "destructive",
      failed: "secondary",
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || "default"}>
        {status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Client Management</CardTitle>
          <div className="flex gap-2">
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload Client Data</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="csv-file">CSV File</Label>
                    <Input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      disabled={isLoading}
                    />
                    <p className="text-sm text-muted-foreground">
                      Required columns: <strong>phone</strong>, <strong>policy_number</strong>. Optional: client_name, cur_premium, product_type, email, premium_due_date, payment_status.
                    </p>

                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsUploadDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isAddClientOpen} onOpenChange={(open) => {
              setIsAddClientOpen(open);
              if (!open) setAddClientTab("basic");
            }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh]">
              <DialogHeader>
                <DialogTitle>Add New Client</DialogTitle>
              </DialogHeader>
              <Tabs value={addClientTab} onValueChange={setAddClientTab} className="w-full">
                <TabsList className={`grid w-full ${customTags.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="policy">Policy Details</TabsTrigger>
                  {customTags.length > 0 && (
                    <TabsTrigger value="tags">Campaign Tags</TabsTrigger>
                  )}
                </TabsList>
                
                <TabsContent value="basic" className="space-y-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={newClient.name}
                      onChange={(e) =>
                        setNewClient({ ...newClient, name: e.target.value })
                      }
                      placeholder="Client name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newClient.email}
                      onChange={(e) =>
                        setNewClient({ ...newClient, email: e.target.value })
                      }
                      placeholder="client@example.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      value={newClient.phone}
                      onChange={(e) =>
                        setNewClient({ ...newClient, phone: e.target.value })
                      }
                      placeholder="+1234567890"
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="policy" className="space-y-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="policy">Policy Number *</Label>
                    <Input
                      id="policy"
                      value={newClient.policy_number}
                      onChange={(e) =>
                        setNewClient({ ...newClient, policy_number: e.target.value })
                      }
                      placeholder="POL123456"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="product_type">Policy Type *</Label>
                    <Select
                      value={newClient.product_type}
                      onValueChange={(value) =>
                        setNewClient({ ...newClient, product_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Policy Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {productTypes.map((type) => (
                          <SelectItem key={type.code || type.name} value={type.name}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Premium Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={newClient.premium_amount}
                      onChange={(e) =>
                        setNewClient({ ...newClient, premium_amount: e.target.value })
                      }
                      placeholder="299.99"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="due_date">Due Date</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={newClient.premium_due_date}
                      onChange={(e) =>
                        setNewClient({ ...newClient, premium_due_date: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="status">Payment Status</Label>
                    <Select
                      value={newClient.payment_status}
                      onValueChange={(value) =>
                        setNewClient({ ...newClient, payment_status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">Current</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                {customTags.length > 0 && (
                  <TabsContent value="tags" className="space-y-4 py-4 max-h-[50vh] overflow-y-auto">
                    <p className="text-xs text-muted-foreground">
                      Per-client values for tags used in campaign scripts. Leave blank to skip a tag.
                    </p>
                    {customTags.map((tag) => (
                      <div key={tag.key} className="grid gap-2">
                        <Label htmlFor={`new-tag-${tag.key}`}>
                          {tag.label}{" "}
                          <span className="text-xs text-muted-foreground">{`{{${tag.key}}}`}</span>
                        </Label>
                        <Input
                          id={`new-tag-${tag.key}`}
                          value={newClientTagValues[tag.key] || ""}
                          onChange={(e) =>
                            setNewClientTagValues({ ...newClientTagValues, [tag.key]: e.target.value })
                          }
                          placeholder={tag.description || tag.label}
                        />
                      </div>
                    ))}
                  </TabsContent>
                )}
              </Tabs>
              
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsAddClientOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddClient} disabled={isLoading}>
                  {isLoading ? "Adding..." : "Add Client"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
            <Dialog open={isEditClientOpen} onOpenChange={(open) => {
              setIsEditClientOpen(open);
              if (!open) setEditClientTab("basic");
            }}>
              <DialogContent className="max-w-2xl max-h-[85vh]">
                <DialogHeader>
                  <DialogTitle>Edit Client</DialogTitle>
                </DialogHeader>
                <Tabs value={editClientTab} onValueChange={setEditClientTab} className="w-full">
                  <TabsList className={`grid w-full ${customTags.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <TabsTrigger value="basic">Basic Info</TabsTrigger>
                    <TabsTrigger value="policy">Policy Details</TabsTrigger>
                    {customTags.length > 0 && (
                      <TabsTrigger value="tags">Campaign Tags</TabsTrigger>
                    )}
                  </TabsList>
                  
                  <TabsContent value="basic" className="space-y-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-name">Name *</Label>
                      <Input
                        id="edit-name"
                        value={editClient.name}
                        onChange={(e) =>
                          setEditClient({ ...editClient, name: e.target.value })
                        }
                        placeholder="Client name"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-email">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editClient.email}
                        onChange={(e) =>
                          setEditClient({ ...editClient, email: e.target.value })
                        }
                        placeholder="client@example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-phone">Phone *</Label>
                      <Input
                        id="edit-phone"
                        value={editClient.phone}
                        onChange={(e) =>
                          setEditClient({ ...editClient, phone: e.target.value })
                        }
                        placeholder="+1234567890"
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="policy" className="space-y-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-policy">Policy Number *</Label>
                      <Input
                        id="edit-policy"
                        value={editClient.policy_number}
                        onChange={(e) =>
                          setEditClient({ ...editClient, policy_number: e.target.value })
                        }
                        placeholder="POL123456"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-product_type">Policy Type *</Label>
                      <Select
                        value={editClient.product_type}
                        onValueChange={(value) =>
                          setEditClient({ ...editClient, product_type: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Policy Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {productTypes.map((type) => (
                            <SelectItem key={type.code || type.name} value={type.name}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-amount">Premium Amount</Label>
                      <Input
                        id="edit-amount"
                        type="number"
                        value={editClient.premium_amount}
                        onChange={(e) =>
                          setEditClient({ ...editClient, premium_amount: e.target.value })
                        }
                        placeholder="299.99"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-due_date">Due Date</Label>
                      <Input
                        id="edit-due_date"
                        type="date"
                        value={editClient.premium_due_date}
                        onChange={(e) =>
                          setEditClient({ ...editClient, premium_due_date: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-status">Payment Status</Label>
                      <Select
                        value={editClient.payment_status}
                        onValueChange={(value) =>
                          setEditClient({ ...editClient, payment_status: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">Current</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  {customTags.length > 0 && (
                    <TabsContent value="tags" className="space-y-4 py-4 max-h-[50vh] overflow-y-auto">
                      <p className="text-xs text-muted-foreground">
                        Per-client values for tags used in campaign scripts. Leave blank to skip a tag.
                      </p>
                      {customTags.map((tag) => (
                        <div key={tag.key} className="grid gap-2">
                          <Label htmlFor={`edit-tag-${tag.key}`}>
                            {tag.label}{" "}
                            <span className="text-xs text-muted-foreground">{`{{${tag.key}}}`}</span>
                          </Label>
                          <Input
                            id={`edit-tag-${tag.key}`}
                            value={editClientTagValues[tag.key] || ""}
                            onChange={(e) =>
                              setEditClientTagValues({ ...editClientTagValues, [tag.key]: e.target.value })
                            }
                            placeholder={tag.description || tag.label}
                          />
                        </div>
                      ))}
                    </TabsContent>
                  )}
                </Tabs>
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditClientOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleEditClient} disabled={isLoading}>
                    {isLoading ? "Updating..." : "Update Client"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm text-muted-foreground">Filter by campaign:</Label>
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                <SelectItem value="__unassigned">Unassigned</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs text-muted-foreground">
            {(() => {
              const visible = clients.filter((c) => {
                if (campaignFilter === "all") return true;
                const list = assignments[c.id] || [];
                if (campaignFilter === "__unassigned") return list.length === 0;
                return list.some((a) => a.campaign_id === campaignFilter);
              });
              return `${visible.length} of ${clients.length} clients`;
            })()}
          </span>
        </div>
        {selectedClientIds.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/40 p-3">
            <span className="text-sm font-medium">
              {selectedClientIds.length} client(s) selected
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedClientIds([])}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setBulkAssignMode(true);
                  setAssigningClient(null);
                  setSelectedCampaignId("");
                  setIsAssignCampaignOpen(true);
                }}
              >
                <Megaphone className="h-3 w-3 mr-1" />
                Bulk Assign Campaign
              </Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={clients.length > 0 && selectedClientIds.length === clients.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all clients"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Policy #</TableHead>
              <TableHead>Product Type</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Premium</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Campaigns</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients
              .filter((c) => {
                if (campaignFilter === "all") return true;
                const list = assignments[c.id] || [];
                if (campaignFilter === "__unassigned") return list.length === 0;
                return list.some((a) => a.campaign_id === campaignFilter);
              })
              .map((client) => (
              <TableRow key={client.id} data-state={selectedClientIds.includes(client.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selectedClientIds.includes(client.id)}
                    onCheckedChange={() => toggleClientSelection(client.id)}
                    aria-label={`Select ${client.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{client.name}</TableCell>
                <TableCell>{client.policy_number}</TableCell>
                <TableCell>
                  {(() => {
                    const match = productTypes.find(
                      (p) => p.code === client.product_type || p.name === client.product_type
                    );
                    return match ? match.name : client.product_type || <span className="text-xs text-muted-foreground">—</span>;
                  })()}
                </TableCell>
                <TableCell>{client.phone}</TableCell>
                <TableCell>₵{client.premium_amount?.toFixed(2) || "0.00"}</TableCell>
                <TableCell>{formatMonthYear(client.premium_due_date)}</TableCell>
                <TableCell>{getStatusBadge(client.payment_status)}</TableCell>
                <TableCell>
                  {(assignments[client.id] || []).length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <TooltipProvider>
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {(assignments[client.id] || []).map((a) => {
                          const customKeys = Object.keys(a.custom_data || {});
                          const tooltipText = customKeys.length
                            ? customKeys.map((k) => {
                                const v = (k === "due_date" || k === "premium_due_date")
                                  ? formatMonthYear(a.custom_data[k])
                                  : a.custom_data[k];
                                return `${k}: ${v}`;
                              }).join("\n")
                            : `Status: ${a.status}`;
                          return (
                            <Tooltip key={a.campaign_id}>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant={a.status === "completed" ? "default" : a.status === "failed" ? "destructive" : "secondary"}
                                  className="text-[10px] font-normal cursor-default"
                                >
                                  {a.campaign_name}
                                  <span className="ml-1 opacity-70">· {a.status}</span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <pre className="text-xs whitespace-pre-wrap max-w-[260px]">{tooltipText}</pre>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(client)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteClient(client)}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        setBulkAssignMode(false);
                        setAssigningClient(client);
                        setSelectedCampaignId("");
                        setIsAssignCampaignOpen(true);
                      }}
                    >
                      <Megaphone className="h-3 w-3 mr-1" />
                      Assign Campaign
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {clients.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No clients found. Add your first client to get started.
          </div>
        )}

        <Dialog open={isAssignCampaignOpen} onOpenChange={(open) => {
          setIsAssignCampaignOpen(open);
          if (!open) { setAssigningClient(null); setSelectedCampaignId(""); setBulkAssignMode(false); }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {bulkAssignMode
                  ? `Assign Campaign to ${selectedClientIds.length} client(s)`
                  : `Assign Campaign${assigningClient ? ` to ${assigningClient.name}` : ""}`}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Campaign</Label>
                <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a campaign (e.g. Akwaaba)" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No campaigns available. Create one in the Campaigns tab.
                      </div>
                    ) : (
                      campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.type ? ` — ${c.type}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {bulkAssignMode
                    ? "This will schedule an outbound call for each selected client under the chosen campaign."
                    : "This will schedule an outbound call for this client under the selected campaign."}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAssignCampaignOpen(false)}>
                Cancel
              </Button>
              <Button onClick={assignCampaignToClient} disabled={isLoading || !selectedCampaignId}>
                {isLoading ? "Assigning..." : "Assign Campaign"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default ClientsTab;