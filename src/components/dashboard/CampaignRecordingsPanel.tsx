import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Trash2, Mic, Tag, RefreshCw, Wand2, AlertTriangle } from "lucide-react";
import { findReservedTagsInScript } from "@/lib/reservedTags";

interface Lang { code: string; name: string; native_name: string }
interface Recording {
  id: string;
  campaign_id: string | null;
  language_code: string;
  kind: "system_intro" | "system_ivr" | "segment";
  segment_order: number;
  text_content: string | null;
  tag_name: string | null;
  is_tag: boolean;
  audio_url: string | null;
}

type Part = { text: string; is_tag: boolean; tag_name?: string };

function parseScript(script: string): Part[] {
  if (!script) return [];
  const parts: Part[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    const before = script.slice(last, m.index).trim();
    if (before) parts.push({ text: before, is_tag: false });
    parts.push({ text: `{{${m[1]}}}`, is_tag: true, tag_name: m[1] });
    last = m.index + m[0].length;
  }
  const tail = script.slice(last).trim();
  if (tail) parts.push({ text: tail, is_tag: false });
  return parts;
}

interface Props {
  campaignId: string;
  script: string;
}

export const CampaignRecordingsPanel = ({ campaignId, script }: Props) => {
  const { toast } = useToast();
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [langCode, setLangCode] = useState<string>("en");
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [syncing, setSyncing] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const parts = useMemo(() => parseScript(script), [script]);

  const loadLanguages = async () => {
    const { data } = await supabase
      .from("supported_languages")
      .select("code,name,native_name")
      .eq("is_active", true)
      .order("display_order");
    setLanguages((data as Lang[]) || []);
  };

  const loadRecordings = async () => {
    if (!campaignId) return;
    const { data } = await (supabase as any)
      .from("campaign_recordings")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("language_code", langCode)
      .order("segment_order");
    setRecordings((data as Recording[]) || []);
  };

  useEffect(() => { loadLanguages(); }, []);
  useEffect(() => { loadRecordings(); }, [campaignId, langCode]);

  const segmentRow = (order: number) =>
    recordings.find((r) => r.kind === "segment" && r.segment_order === order);

  const syncSegments = async () => {
    if (!campaignId) return;
    setSyncing(true);
    try {
      await (supabase as any).from("campaign_recordings")
        .delete()
        .eq("campaign_id", campaignId)
        .eq("language_code", langCode)
        .eq("kind", "segment");

      const rows = parts.map((p, idx) => ({
        campaign_id: campaignId,
        language_code: langCode,
        kind: "segment",
        segment_order: idx,
        text_content: p.is_tag ? null : p.text,
        tag_name: p.is_tag ? p.tag_name : null,
        is_tag: p.is_tag,
      }));
      if (rows.length) await (supabase as any).from("campaign_recordings").insert(rows);
      toast({ title: "Synced", description: `Created ${rows.length} segment slots` });
      loadRecordings();
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const uploadFile = async (key: string, file: File, target: { id?: string; insert?: Partial<Recording> }) => {
    if (!file || file.size === 0) return;
    setUploading(key);
    setProgress((p) => ({ ...p, [key]: 0 }));
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const path = `campaigns/${campaignId}/${langCode}/${key}-${Date.now()}.${ext}`;

      // Create signed upload URL so we can track progress via XHR
      const { data: signed, error: signErr } = await supabase.storage
        .from("language-audio")
        .createSignedUploadUrl(path);
      if (signErr || !signed) throw signErr || new Error("Could not create upload URL");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signed.signedUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
        xhr.setRequestHeader("x-upsert", "true");
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setProgress((p) => ({ ...p, [key]: pct }));
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      const { data: { publicUrl } } = supabase.storage.from("language-audio").getPublicUrl(path);

      if (target.id) {
        await (supabase as any).from("campaign_recordings").update({ audio_url: publicUrl }).eq("id", target.id);
      } else if (target.insert) {
        await (supabase as any).from("campaign_recordings").insert({ ...target.insert, audio_url: publicUrl, language_code: langCode });
      }
      setProgress((p) => ({ ...p, [key]: 100 }));
      toast({ title: "Audio uploaded" });
      loadRecordings();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(null);
      setTimeout(() => setProgress((p) => { const n = { ...p }; delete n[key]; return n; }), 1200);
    }
  };

  const removeAudio = async (id: string) => {
    await (supabase as any).from("campaign_recordings").update({ audio_url: null }).eq("id", id);
    loadRecordings();
  };

  const hasSyncedSegments = recordings.some((r) => r.kind === "segment");

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <Label>Language</Label>
          <Select value={langCode} onValueChange={setLangCode}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {languages.map((l) => <SelectItem key={l.code} value={l.code}>{l.name} ({l.native_name})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={syncSegments} disabled={syncing || !script} className="gradient-primary">
          <Wand2 className="h-4 w-4 mr-1" /> {syncing ? "Syncing..." : "Sync from script"}
        </Button>
        <Button variant="ghost" size="sm" onClick={loadRecordings}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Script auto-splits into segments at each <code>{"{{tag}}"}</code>. Upload an MP3 for each text segment in the selected language. Tags are spoken by TTS at call time. The global greeting ("Dear {`{{client_name}}`}") and the IVR language menu play <strong>before</strong> this campaign message — manage them in Setup → Voice & Languages → System Recordings.
      </p>

      {(() => {
        const reserved = findReservedTagsInScript(script);
        if (reserved.length === 0) return null;
        return (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <strong>Tag overlap:</strong> your script uses{" "}
              {reserved.map((k) => <code key={k} className="mx-1">{`{{${k}}}`}</code>)}
              which is already spoken by the global system recording. Remove it from this campaign script to avoid it being spoken twice.
            </div>
          </div>
        );
      })()}

      {!script && (
        <p className="text-sm text-muted-foreground italic">Add a script first, then click "Sync from script".</p>
      )}

      {script && !hasSyncedSegments && parts.length > 0 && (
        <p className="text-sm text-amber-600">No recording slots yet for this language. Click "Sync from script" to create them.</p>
      )}

      <div className="space-y-2">
        {parts.map((p, idx) => {
          const row = segmentRow(idx);
          const key = `seg-${idx}`;
          return (
            <Card key={idx} className={`border ${p.is_tag ? "bg-amber-500/5" : "bg-card"}`}>
              <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className="font-mono">#{idx + 1}</Badge>
                {p.is_tag ? (
                  <>
                    <Tag className="h-4 w-4 text-amber-600" />
                    <span className="flex-1 font-mono text-sm">{p.text}</span>
                    <Badge variant="secondary">TTS at call time</Badge>
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 text-primary" />
                    <span className="flex-1 text-sm">{p.text}</span>
                    {row?.audio_url ? <audio controls src={row.audio_url} className="h-8" /> : <Badge variant="outline">No audio</Badge>}
                    <input
                      ref={(el) => (fileRefs.current[key] = el)}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (row) {
                          uploadFile(key, f, { id: row.id });
                        } else {
                          uploadFile(key, f, {
                            insert: {
                              campaign_id: campaignId,
                              kind: "segment",
                              segment_order: idx,
                              text_content: p.text,
                              tag_name: null,
                              is_tag: false,
                            },
                          });
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploading === key || !campaignId}
                      onClick={() => fileRefs.current[key]?.click()}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {uploading === key ? `${progress[key] ?? 0}%` : row?.audio_url ? "Replace" : "Upload"}
                    </Button>
                    {uploading === key && (
                      <div className="w-24 h-1.5 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${progress[key] ?? 0}%` }} />
                      </div>
                    )}
                    {row?.audio_url && (
                      <Button size="sm" variant="ghost" onClick={() => removeAudio(row.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default CampaignRecordingsPanel;
