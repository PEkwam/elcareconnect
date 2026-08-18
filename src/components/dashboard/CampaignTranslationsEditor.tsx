import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { validateAudioFile } from "@/utils/audioValidation";
import { TagPicker } from "./TagPicker";

interface Lang {
  code: string;
  name: string;
  native_name: string;
}

interface Props {
  translations: Record<string, string>;
  audioUrls: Record<string, string>;
  onChange: (next: { translations: Record<string, string>; audioUrls: Record<string, string> }) => void;
}

export const CampaignTranslationsEditor = ({ translations, audioUrls, onChange }: Props) => {
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [uploadingCode, setUploadingCode] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("supported_languages")
        .select("code,name,native_name")
        .eq("is_active", true)
        .order("display_order");
      setLanguages(data || []);
    })();
  }, []);

  const setText = (code: string, value: string) => {
    onChange({ translations: { ...translations, [code]: value }, audioUrls });
  };

  const setAudio = (code: string, url: string | null) => {
    const next = { ...audioUrls };
    if (url) next[code] = url;
    else delete next[code];
    onChange({ translations, audioUrls: next });
  };

  const upload = async (code: string, file: File) => {
    const err = await validateAudioFile(file, { maxSizeMB: 5, maxDurationSec: 120, minDurationSec: 0.5 });
    if (err) {
      toast({ title: "Invalid audio file", description: err, variant: "destructive" });
      return;
    }
    setUploadingCode(code);
    try {
      const path = `campaigns/${code}-${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("language-audio").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("language-audio").getPublicUrl(path);
      setAudio(code, data.publicUrl);
      toast({ title: "Uploaded", description: `Audio saved for ${code.toUpperCase()}` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploadingCode(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Provide a localized script and/or pre-recorded MP3 per language. If no MP3 is uploaded, the
        text will be read using the language's TTS provider. If neither is set, the default English script is used.
      </p>
      {languages.map((l) => (
        <div key={l.code} className="border rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{l.code.toUpperCase()}</Badge>
              <span className="text-sm font-medium">{l.name}</span>
              <span className="text-xs text-muted-foreground">({l.native_name})</span>
            </div>
            {audioUrls[l.code] && (
              <audio controls src={audioUrls[l.code]} className="h-8" />
            )}
          </div>
          <Textarea
            ref={(el) => (textareaRefs.current[l.code] = el)}
            value={translations[l.code] || ""}
            onChange={(e) => setText(l.code, e.target.value)}
            placeholder={`Script in ${l.name} (supports {{client_name}}, {{premium_amount}}...)`}
            rows={3}
          />
          <TagPicker
            textareaRef={{ current: textareaRefs.current[l.code] } as React.RefObject<HTMLTextAreaElement>}
            value={translations[l.code] || ""}
            onChange={(next) => setText(l.code, next)}
          />
          <div className="flex items-center gap-2">
            <Label className="text-xs cursor-pointer flex items-center gap-1 px-2 py-1 border rounded hover:bg-accent">
              {uploadingCode === l.code ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              Upload MP3
              <Input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(l.code, f);
                  e.target.value = "";
                }}
              />
            </Label>
            {audioUrls[l.code] && (
              <Button size="sm" variant="ghost" onClick={() => setAudio(l.code, null)}>
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
