import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Phone, Save, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Settings {
  id?: string;
  default_caller_id: string;
  dial_me_first_enabled: boolean;
  admin_bridge_phone: string;
}

const E164 = /^\+\d{8,15}$/;

export const CallSettingsManager = () => {
  const { toast } = useToast();
  const [s, setS] = useState<Settings>({
    default_caller_id: "+233246052499",
    dial_me_first_enabled: true,
    admin_bridge_phone: "+233246052499",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (data) setS(data as Settings);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!E164.test(s.default_caller_id)) {
      toast({ title: "Invalid caller ID", description: "Use E.164 format, e.g. +233246052499", variant: "destructive" });
      return;
    }
    if (s.dial_me_first_enabled && !E164.test(s.admin_bridge_phone)) {
      toast({ title: "Invalid bridge number", description: "Use E.164 format, e.g. +233246052499", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      default_caller_id: s.default_caller_id,
      dial_me_first_enabled: s.dial_me_first_enabled,
      admin_bridge_phone: s.admin_bridge_phone,
    };
    const { error } = s.id
      ? await supabase.from("system_settings").update(payload).eq("id", s.id)
      : await supabase.from("system_settings").insert(payload);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Call settings saved" });
  };

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" /> Call Routing Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Dial-Me-First (Bridge mode)</strong>: Twilio rings your mobile first; when you
            answer, it calls the client and connects you. The client sees your <em>Caller ID</em> below.
            <br />
            <strong>Note</strong>: To show a non-Twilio number as caller ID, that number must be
            verified in your Twilio console (Phone Numbers → Verified Caller IDs). Otherwise Twilio
            will fall back to your Twilio number.
          </span>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm">Enable Dial-Me-First (bridge to my mobile)</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Best for demos — you talk to the client live from your own SIM.
            </p>
          </div>
          <Switch
            checked={s.dial_me_first_enabled}
            onCheckedChange={(v) => setS({ ...s, dial_me_first_enabled: v })}
          />
        </div>

        <div>
          <Label>My mobile (bridge target)</Label>
          <Input
            value={s.admin_bridge_phone}
            onChange={(e) => setS({ ...s, admin_bridge_phone: e.target.value.trim() })}
            placeholder="+233246052499"
            disabled={!s.dial_me_first_enabled}
          />
        </div>

        <div>
          <Label>Default Caller ID shown to clients</Label>
          <Input
            value={s.default_caller_id}
            onChange={(e) => setS({ ...s, default_caller_id: e.target.value.trim() })}
            placeholder="+233246052499"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Must be E.164 (e.g. +233246052499). Verify it in Twilio first.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
