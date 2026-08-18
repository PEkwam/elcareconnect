import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Trash2, Radio, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

interface Recording {
  id: string;
  campaign_id: string | null;
  language_code: string;
  kind: "system_intro" | "system_message_intro" | "system_ivr" | "segment";
  audio_url: string | null;
}

// Single default recording shared across all languages.
// Language only matters for the per-campaign message that plays AFTER the IVR selection.
const DEFAULT_LANG = "default";

export const SystemRecordingsManager = () => {
  const { toast } = useToast();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [validation, setValidation] = useState<Record<string, { ok: boolean; msg: string } | undefined>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const validatePlayback = (url: string): Promise<{ ok: boolean; msg: string }> =>
    new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve({ ok: false, msg: "Timed out loading audio" });
      }, 10000);
      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        cleanup();
        if (!isFinite(audio.duration) || audio.duration <= 0) {
          resolve({ ok: false, msg: "Invalid duration — file may be corrupt" });
        } else {
          resolve({ ok: true, msg: `Playable (${audio.duration.toFixed(1)}s)` });
        }
      };
      audio.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve({ ok: false, msg: "Browser could not decode the audio" });
      };
      audio.src = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
    });

  const reuploadFix = async (row: Recording, key: string) => {
    if (!row.audio_url) return;
    setFixing(key);
    setValidation((v) => ({ ...v, [key]: undefined }));
    try {
      const res = await fetch(`${row.audio_url}${row.audio_url.includes("?") ? "&" : "?"}cb=${Date.now()}`);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("Source file is empty");
      const fixedBlob = new Blob([blob], { type: "audio/mpeg" });
      const path = `system/${DEFAULT_LANG}/${row.kind}-fixed-${Date.now()}.mp3`;
      const { error: upErr } = await supabase.storage
        .from("language-audio")
        .upload(path, fixedBlob, { upsert: true, contentType: "audio/mpeg" });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("language-audio").getPublicUrl(path);
      const { error: dbErr } = await (supabase as any)
        .from("campaign_recordings")
        .update({ audio_url: publicUrl })
        .eq("id", row.id);
      if (dbErr) throw dbErr;
      const result = await validatePlayback(publicUrl);
      setValidation((v) => ({ ...v, [key]: result }));
      toast({
        title: result.ok ? "Reuploaded & validated" : "Reuploaded but validation failed",
        description: result.msg,
        variant: result.ok ? "default" : "destructive",
      });
      loadRecordings();
    } catch (e: any) {
      setValidation((v) => ({ ...v, [key]: { ok: false, msg: e.message } }));
      toast({ title: "Reupload failed", description: e.message, variant: "destructive" });
    } finally {
      setFixing(null);
    }
  };

  const loadRecordings = async () => {
    const { data } = await (supabase as any)
      .from("campaign_recordings")
      .select("*")
      .is("campaign_id", null)
      .eq("language_code", DEFAULT_LANG);
    setRecordings((data as Recording[]) || []);
  };

  useEffect(() => { loadRecordings(); }, []);

  const systemRow = (kind: "system_intro" | "system_message_intro" | "system_ivr") =>
    recordings.find((r) => r.kind === kind);

  const uploadFile = async (key: string, file: File, target: { id?: string; insert?: any }) => {
    if (!file || file.size === 0) return;
    setUploading(key);
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const path = `system/${DEFAULT_LANG}/${key}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("language-audio")
        .upload(path, file, { upsert: true, contentType: file.type || "audio/mpeg" });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("language-audio").getPublicUrl(path);

      if (target.id) {
        await (supabase as any).from("campaign_recordings").update({ audio_url: publicUrl }).eq("id", target.id);
      } else if (target.insert) {
        await (supabase as any).from("campaign_recordings").insert({ ...target.insert, audio_url: publicUrl, language_code: DEFAULT_LANG });
      }
      toast({ title: "Default recording uploaded" });
      loadRecordings();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const removeAudio = async (id: string) => {
    await (supabase as any).from("campaign_recordings").update({ audio_url: null }).eq("id", id);
    loadRecordings();
  };

  return (
    <Card className="border-2 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" /> Default System Recordings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These two recordings are <strong>shared across all languages</strong> and play at the start of every campaign call.
          Language selection only affects the <em>per-campaign message</em> that plays after the caller picks an option from the IVR menu.
          <br />• <strong>Recording 1 — Greeting:</strong> e.g. "Dear" (audio). The client's name <code>{"{{client_name}}"}</code> is appended automatically via TTS, so do not bake it into the MP3.
          <br />• <strong>Recording 2 — Intro Message:</strong> e.g. "You have a message from Enterprise Life."
          <br />• <strong>Recording 3 — IVR Language Menu:</strong> e.g. "For English press 1, Twi press 2, Ga press 3, Hausa press 4, Ewe press 5, press 9 to repeat."
        </p>

        {(["system_intro", "system_message_intro", "system_ivr"] as const).map((kind) => {
          const row = systemRow(kind);
          const key = `sys-${kind}`;
          const label =
            kind === "system_intro" ? "Recording 1 — Greeting (e.g. 'Dear')"
            : kind === "system_message_intro" ? "Recording 2 — Intro Message (e.g. 'You have a message from…')"
            : "Recording 3 — IVR Language Menu";
          return (
            <Card key={kind} className="border bg-gradient-to-br from-card to-muted/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{label}</h4>
                  {row?.audio_url ? <Badge>Uploaded</Badge> : <Badge variant="outline">Empty</Badge>}
                </div>
                {row?.audio_url && <audio controls src={row.audio_url} className="w-full h-10" />}
                <input
                  ref={(el) => (fileRefs.current[key] = el)}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    uploadFile(key, f, row ? { id: row.id } : { insert: { campaign_id: null, kind, segment_order: 0, is_tag: false } });
                  }}
                />
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => fileRefs.current[key]?.click()} disabled={uploading === key} className="flex-1 min-w-[120px]">
                    <Upload className="h-4 w-4 mr-1" />
                    {uploading === key ? "Uploading..." : row?.audio_url ? "Replace" : "Upload"}
                  </Button>
                  {row?.audio_url && (kind === "system_message_intro" || kind === "system_ivr") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => reuploadFix(row, key)}
                      disabled={fixing === key}
                      title="Re-uploads with correct audio/mpeg content-type and validates playback"
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${fixing === key ? "animate-spin" : ""}`} />
                      {fixing === key ? "Fixing..." : "Reupload audio"}
                    </Button>
                  )}
                  {row?.audio_url && (
                    <Button size="sm" variant="ghost" onClick={() => removeAudio(row.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {validation[key] && (
                  <div className={`flex items-center gap-2 text-xs ${validation[key]!.ok ? "text-green-600" : "text-destructive"}`}>
                    {validation[key]!.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    {validation[key]!.msg}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default SystemRecordingsManager;
