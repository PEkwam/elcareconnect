import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, Mail, Phone, Clock, AlertTriangle, Shield, Trash2, Plus, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface EscalationSettingsData {
  id: string;
  warning_threshold_minutes: number;
  escalate_threshold_minutes: number;
  critical_threshold_minutes: number;
  notify_via_email: boolean;
  notify_via_sms: boolean;
  supervisor_emails: string[];
  supervisor_phones: string[];
}

export const EscalationSettings = () => {
  const [settings, setSettings] = useState<EscalationSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      let { data, error } = await supabase
        .from("escalation_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Auto-create a default settings row if none exists
      if (!data) {
        const { data: created, error: insertErr } = await supabase
          .from("escalation_settings")
          .insert({})
          .select()
          .single();
        if (insertErr) throw insertErr;
        data = created;
      }

      setSettings({
        ...data,
        supervisor_emails: data.supervisor_emails || [],
        supervisor_phones: data.supervisor_phones || [],
      });
    } catch (error) {
      console.error("Error fetching escalation settings:", error);
      toast({
        title: "Error",
        description: "Failed to load escalation settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("escalation_settings")
        .update({
          warning_threshold_minutes: settings.warning_threshold_minutes,
          escalate_threshold_minutes: settings.escalate_threshold_minutes,
          critical_threshold_minutes: settings.critical_threshold_minutes,
          notify_via_email: settings.notify_via_email,
          notify_via_sms: settings.notify_via_sms,
          supervisor_emails: settings.supervisor_emails,
          supervisor_phones: settings.supervisor_phones,
        })
        .eq("id", settings.id);

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "Escalation settings have been updated successfully",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Failed to save escalation settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addEmail = () => {
    if (!newEmail || !settings) return;
    if (!newEmail.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }
    if (settings.supervisor_emails.includes(newEmail)) {
      toast({
        title: "Duplicate Email",
        description: "This email is already in the list",
        variant: "destructive",
      });
      return;
    }
    setSettings({
      ...settings,
      supervisor_emails: [...settings.supervisor_emails, newEmail],
    });
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      supervisor_emails: settings.supervisor_emails.filter((e) => e !== email),
    });
  };

  const addPhone = () => {
    if (!newPhone || !settings) return;
    if (settings.supervisor_phones.includes(newPhone)) {
      toast({
        title: "Duplicate Phone",
        description: "This phone number is already in the list",
        variant: "destructive",
      });
      return;
    }
    setSettings({
      ...settings,
      supervisor_phones: [...settings.supervisor_phones, newPhone],
    });
    setNewPhone("");
  };

  const removePhone = (phone: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      supervisor_phones: settings.supervisor_phones.filter((p) => p !== phone),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Unable to load escalation settings
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Thresholds Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Escalation Thresholds
          </CardTitle>
          <CardDescription>
            Configure when calls should be flagged and escalated based on wait time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                Warning Threshold
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={settings.warning_threshold_minutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      warning_threshold_minutes: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-20"
                />
                <span className="text-muted-foreground">minutes</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Calls will show a yellow warning indicator
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                Escalate Threshold
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={settings.escalate_threshold_minutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      escalate_threshold_minutes: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-20"
                />
                <span className="text-muted-foreground">minutes</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Supervisors will be notified
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                Critical Threshold
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={settings.critical_threshold_minutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      critical_threshold_minutes: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-20"
                />
                <span className="text-muted-foreground">minutes</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Highest priority escalation
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Channels Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Notification Channels
          </CardTitle>
          <CardDescription>
            Choose how supervisors should be notified when calls are escalated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex items-center justify-between p-4 border rounded-lg flex-1">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Send escalation alerts via email
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.notify_via_email}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, notify_via_email: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg flex-1">
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">SMS Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Send escalation alerts via SMS
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.notify_via_sms}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, notify_via_sms: checked })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supervisor Contacts Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Supervisor Contacts
          </CardTitle>
          <CardDescription>
            Add supervisors who should receive escalation notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Contacts */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Supervisor Emails
            </Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="supervisor@company.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()}
              />
              <Button onClick={addEmail} size="icon" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.supervisor_emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No supervisor emails added</p>
              ) : (
                settings.supervisor_emails.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1 py-1">
                    {email}
                    <button
                      onClick={() => removeEmail(email)}
                      className="ml-1 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          <Separator />

          {/* Phone Contacts */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Supervisor Phone Numbers
            </Label>
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="+1234567890"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPhone()}
              />
              <Button onClick={addPhone} size="icon" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.supervisor_phones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No supervisor phones added</p>
              ) : (
                settings.supervisor_phones.map((phone) => (
                  <Badge key={phone} variant="secondary" className="gap-1 py-1">
                    {phone}
                    <button
                      onClick={() => removePhone(phone)}
                      className="ml-1 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
};
