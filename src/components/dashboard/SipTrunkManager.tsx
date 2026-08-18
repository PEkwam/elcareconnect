import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { AlertCircle, Edit, Plus, Server, Star, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface SipTrunk {
  id?: string;
  name: string;
  provider: string | null;
  sip_domain: string;
  sip_port: number;
  transport: string;
  username: string | null;
  password: string | null;
  outbound_proxy: string | null;
  codecs: string | null;
  caller_id: string | null;
  region: string | null;
  notes: string | null;
  is_active: boolean;
  is_default: boolean;
}

const emptyTrunk: SipTrunk = {
  name: "",
  provider: "",
  sip_domain: "",
  sip_port: 5060,
  transport: "UDP",
  username: "",
  password: "",
  outbound_proxy: "",
  codecs: "PCMU,PCMA,G729",
  caller_id: "",
  region: "",
  notes: "",
  is_active: true,
  is_default: false,
};

export const SipTrunkManager = () => {
  const { toast } = useToast();
  const [trunks, setTrunks] = useState<SipTrunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SipTrunk>(emptyTrunk);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sip_trunks")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load SIP trunks", description: error.message, variant: "destructive" });
    } else {
      setTrunks((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(emptyTrunk);
    setDialogOpen(true);
  };

  const openEdit = (t: SipTrunk) => {
    setEditing({ ...t });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!editing.name.trim() || !editing.sip_domain.trim()) {
      toast({ title: "Name and SIP domain are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      ...editing,
      provider: editing.provider || null,
      username: editing.username || null,
      password: editing.password || null,
      outbound_proxy: editing.outbound_proxy || null,
      codecs: editing.codecs || null,
      caller_id: editing.caller_id || null,
      region: editing.region || null,
      notes: editing.notes || null,
    };

    // If marking as default, clear other defaults first
    if (payload.is_default) {
      await supabase.from("sip_trunks").update({ is_default: false }).neq("id", payload.id ?? "00000000-0000-0000-0000-000000000000");
    }

    const { error } = editing.id
      ? await supabase.from("sip_trunks").update(payload).eq("id", editing.id)
      : await supabase.from("sip_trunks").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "SIP trunk updated" : "SIP trunk created" });
    setDialogOpen(false);
    load();
  };

  const remove = async (id?: string) => {
    if (!id) return;
    if (!confirm("Delete this SIP trunk?")) return;
    const { error } = await supabase.from("sip_trunks").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "SIP trunk deleted" });
    load();
  };

  const setDefault = async (t: SipTrunk) => {
    if (!t.id) return;
    await supabase.from("sip_trunks").update({ is_default: false }).neq("id", t.id);
    const { error } = await supabase.from("sip_trunks").update({ is_default: true }).eq("id", t.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${t.name} set as default` });
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" /> SIP Trunk Configuration
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add SIP Trunk
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit SIP Trunk" : "Add SIP Trunk"}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <div className="md:col-span-2">
                <Label>Name *</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Primary SIP Trunk"
                />
              </div>

              <div>
                <Label>Provider</Label>
                <Input
                  value={editing.provider || ""}
                  onChange={(e) => setEditing({ ...editing, provider: e.target.value })}
                  placeholder="Twilio, Telnyx, Vonage…"
                />
              </div>

              <div>
                <Label>Region</Label>
                <Input
                  value={editing.region || ""}
                  onChange={(e) => setEditing({ ...editing, region: e.target.value })}
                  placeholder="e.g. eu-west, us-east"
                />
              </div>

              <div>
                <Label>SIP Domain / Host *</Label>
                <Input
                  value={editing.sip_domain}
                  onChange={(e) => setEditing({ ...editing, sip_domain: e.target.value })}
                  placeholder="sip.provider.com"
                />
              </div>

              <div>
                <Label>Port</Label>
                <Input
                  type="number"
                  value={editing.sip_port}
                  onChange={(e) => setEditing({ ...editing, sip_port: Number(e.target.value) || 5060 })}
                />
              </div>

              <div>
                <Label>Transport</Label>
                <Select
                  value={editing.transport}
                  onValueChange={(v) => setEditing({ ...editing, transport: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UDP">UDP</SelectItem>
                    <SelectItem value="TCP">TCP</SelectItem>
                    <SelectItem value="TLS">TLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Outbound Proxy</Label>
                <Input
                  value={editing.outbound_proxy || ""}
                  onChange={(e) => setEditing({ ...editing, outbound_proxy: e.target.value })}
                  placeholder="proxy.provider.com:5060"
                />
              </div>

              <div>
                <Label>Username</Label>
                <Input
                  value={editing.username || ""}
                  onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                  autoComplete="off"
                />
              </div>

              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={editing.password || ""}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <Label>Caller ID</Label>
                <Input
                  value={editing.caller_id || ""}
                  onChange={(e) => setEditing({ ...editing, caller_id: e.target.value })}
                  placeholder="+233246052499"
                />
              </div>

              <div>
                <Label>Codecs</Label>
                <Input
                  value={editing.codecs || ""}
                  onChange={(e) => setEditing({ ...editing, codecs: e.target.value })}
                  placeholder="PCMU,PCMA,G729"
                />
              </div>

              <div className="md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="text-sm">Active</Label>
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="text-sm">Default Trunk</Label>
                <Switch
                  checked={editing.is_default}
                  onCheckedChange={(v) => setEditing({ ...editing, is_default: v })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2 mb-4">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            SIP trunk credentials are sensitive. Only super admins can view or modify these settings.
            The default trunk is used for outbound calls unless a campaign overrides it.
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : trunks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No SIP trunks configured yet. Click "Add SIP Trunk" to create one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trunks.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {t.is_default && <Star className="h-3 w-3 fill-primary text-primary" />}
                        {t.name}
                      </div>
                    </TableCell>
                    <TableCell>{t.provider || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{t.sip_domain}:{t.sip_port}</TableCell>
                    <TableCell>{t.transport}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Badge variant={t.is_active ? "default" : "secondary"}>
                          {t.is_active ? "Active" : "Disabled"}
                        </Badge>
                        {t.is_default && <Badge variant="outline">Default</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!t.is_default && (
                          <Button size="sm" variant="ghost" onClick={() => setDefault(t)} title="Set as default">
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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

export default SipTrunkManager;
