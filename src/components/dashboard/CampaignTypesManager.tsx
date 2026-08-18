import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface CampaignType {
  id: string;
  key: string;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export const CampaignTypesManager = () => {
  const { toast } = useToast();
  const [types, setTypes] = useState<CampaignType[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignType | null>(null);
  const [form, setForm] = useState({ key: "", label: "", description: "", is_active: true, sort_order: 0 });

  const fetchTypes = async () => {
    const { data, error } = await supabase
      .from("campaign_types" as any)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    if (error) {
      toast({ title: "Error", description: "Failed to load campaign types", variant: "destructive" });
      return;
    }
    const sorted = ((data as any) || []).sort((a: CampaignType, b: CampaignType) =>
      a.label.localeCompare(b.label)
    );
    setTypes(sorted);
  };

  useEffect(() => { fetchTypes(); }, []);

  const resetForm = () => {
    setEditing(null);
    setForm({ key: "", label: "", description: "", is_active: true, sort_order: types.length + 1 });
  };

  const openAdd = () => { resetForm(); setOpen(true); };
  const openEdit = (t: CampaignType) => {
    setEditing(t);
    setForm({ key: t.key, label: t.label, description: t.description || "", is_active: t.is_active, sort_order: t.sort_order });
    setOpen(true);
  };

  const handleSave = async (keepOpen = false) => {
    if (!form.label.trim()) {
      toast({ title: "Label required", variant: "destructive" });
      return;
    }
    const key = (form.key.trim() || slugify(form.label));
    setLoading(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("campaign_types" as any)
          .update({ key, label: form.label, description: form.description || null, is_active: form.is_active, sort_order: form.sort_order })
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Updated" });
      } else {
        const { error } = await supabase
          .from("campaign_types" as any)
          .insert([{ key, label: form.label, description: form.description || null, is_active: form.is_active, sort_order: form.sort_order }]);
        if (error) throw error;
        toast({ title: "Added" });
      }
      await fetchTypes();
      if (keepOpen && !editing) {
        resetForm();
      } else {
        setOpen(false);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (t: CampaignType) => {
    if (!confirm(`Delete campaign type "${t.label}"?`)) return;
    const { error } = await supabase.from("campaign_types" as any).delete().eq("id", t.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted" });
    fetchTypes();
  };

  const toggleActive = async (t: CampaignType) => {
    const { error } = await supabase.from("campaign_types" as any).update({ is_active: !t.is_active }).eq("id", t.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    fetchTypes();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Campaign Types</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Manage the types of campaigns available when creating a new campaign.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add Type</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit" : "Add"} Campaign Type</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid gap-2">
                <Label>Label *</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Holiday Promo" />
              </div>
              <div className="grid gap-2">
                <Label>Key</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder={slugify(form.label) || "auto_generated_from_label"}
                />
                <p className="text-xs text-muted-foreground">Internal identifier. Leave blank to auto-generate from label.</p>
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
              </div>
              <div className="grid gap-2">
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              {!editing && (
                <Button variant="secondary" onClick={() => handleSave(true)} disabled={loading}>
                  <Plus className="h-4 w-4 mr-1" /> Save & add another
                </Button>
              )}
              <Button onClick={() => handleSave(false)} disabled={loading}>{editing ? "Save" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {types.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No campaign types yet.</p>
          )}
          {types.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{t.label}</span>
                  <Badge variant="outline" className="text-xs font-mono">{t.key}</Badge>
                  {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                </div>
                {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default CampaignTypesManager;
