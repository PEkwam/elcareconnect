import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Save, ShieldAlert, ShieldCheck, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";

interface SecretItem {
  key: string;
  has_value: boolean;
  masked: string;
  value?: string;
  updated_at: string | null;
}

const SECRET_META: Record<string, { label: string; help: string }> = {
  OPENAI_API_KEY: { label: "OpenAI API Key", help: "Used for transcription and realtime voice." },
  TWILIO_ACCOUNT_SID: { label: "Twilio Account SID", help: "Your Twilio account identifier." },
  TWILIO_AUTH_TOKEN: { label: "Twilio Auth Token", help: "Authentication token for Twilio API." },
  TWILIO_PHONE_NUMBER: { label: "Twilio Phone Number", help: "Outbound caller ID in E.164 format." },
  GOOGLE_CLOUD_API_KEY: { label: "Google Cloud API Key", help: "Used for Google Cloud services." },
  RESEND_API_KEY: { label: "Resend API Key", help: "Used for transactional email delivery." },
  CRON_SECRET: { label: "Cron Secret", help: "Shared secret the scheduler uses to authenticate scheduled jobs (campaign worker, reconcile)." },
};

export const AppSecretsManager = () => {
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string; checks: Array<{ name: string; status: string; detail: string }> } | null>(null);

  const verifyTwilio = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-verify", { body: {} });
      if (error) throw error;
      setVerifyResult(data);
      toast({
        title: data.ok ? "Twilio verified" : "Twilio setup needs attention",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Verification failed", description: "Could not reach the verification service.", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const load = async (withValues = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-app-secrets", {
        body: { action: "list", reveal: withValues },
      });
      if (error) throw error;
      setSecrets(data.secrets || []);
      if (withValues) {
        const next: Record<string, string> = {};
        for (const s of data.secrets || []) next[s.key] = s.value ?? "";
        setDrafts(next);
      }
    } catch (e) {
      toast({ title: "Could not load secrets", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) load(false);
  }, [isSuperAdmin]);

  const toggleReveal = async (key: string) => {
    const willReveal = !reveal[key];
    setReveal((r) => ({ ...r, [key]: willReveal }));
    if (willReveal && drafts[key] === undefined) {
      const { data, error } = await supabase.functions.invoke("manage-app-secrets", {
        body: { action: "list", reveal: true },
      });
      if (!error) {
        const item = (data.secrets || []).find((s: SecretItem) => s.key === key);
        setDrafts((d) => ({ ...d, [key]: item?.value ?? "" }));
      }
    }
  };

  const save = async (key: string) => {
    setSavingKey(key);
    try {
      const { error } = await supabase.functions.invoke("manage-app-secrets", {
        body: { action: "upsert", key, value: drafts[key] ?? "" },
      });
      if (error) throw error;
      toast({ title: `${key} updated` });
      await load(false);
    } catch (e) {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  if (roleLoading) return null;
  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
          <ShieldAlert className="h-5 w-5" />
          Only super admins can manage application secrets.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Application Secrets
        </CardTitle>
        <CardDescription>
          Manage runtime API credentials. Values are stored securely and read by backend services.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Twilio Setup Verification
              </Label>
              <p className="text-xs text-muted-foreground">
                Validates the Account SID, Auth Token and From phone number against Twilio.
              </p>
            </div>
            <Button type="button" onClick={verifyTwilio} disabled={verifying}>
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span className="ml-2">Verify Twilio setup</span>
            </Button>
          </div>
          {verifyResult && (
            <div className="space-y-2">
              <div className={`text-sm font-medium ${verifyResult.ok ? "text-green-600" : "text-destructive"}`}>
                {verifyResult.message}
              </div>
              <ul className="space-y-1">
                {verifyResult.checks.map((c, i) => {
                  const Icon = c.status === "pass" ? CheckCircle2 : c.status === "warn" ? AlertTriangle : XCircle;
                  const color = c.status === "pass" ? "text-green-600" : c.status === "warn" ? "text-amber-500" : "text-destructive";
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Icon className={`h-4 w-4 mt-0.5 ${color}`} />
                      <div>
                        <span className="font-medium">{c.name}:</span>{" "}
                        <span className="text-muted-foreground">{c.detail}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {!loading &&
          secrets.map((s) => {
            const meta = SECRET_META[s.key] ?? { label: s.key, help: "" };
            const revealed = !!reveal[s.key];
            const draft = drafts[s.key];
            const dirty = draft !== undefined && draft !== "" && revealed;
            return (
              <div key={s.key} className="rounded-lg border bg-card/50 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-semibold">{meta.label}</Label>
                    <p className="text-xs text-muted-foreground">{meta.help}</p>
                  </div>
                  <Badge variant={s.has_value ? "default" : "secondary"}>
                    {s.has_value ? "Set" : "Empty"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={revealed ? "text" : "password"}
                      placeholder={s.has_value ? s.masked : "Enter value"}
                      value={revealed ? (draft ?? "") : ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                      onFocus={() => !revealed && toggleReveal(s.key)}
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" onClick={() => toggleReveal(s.key)}>
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => save(s.key)}
                    disabled={savingKey === s.key || !dirty}
                  >
                    {savingKey === s.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-2">Save</span>
                  </Button>
                </div>
                {s.updated_at && (
                  <p className="text-[11px] text-muted-foreground">
                    Last updated {new Date(s.updated_at).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
};

export default AppSecretsManager;
