import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Plus, Lock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { isReservedSystemTag } from "@/lib/reservedTags";

interface CampaignTag {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  category?: string | null;
}

interface Props {
  /** Ref to the textarea so we can insert at the caret position. */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  /** Current text value. */
  value: string;
  /** Called with updated text after inserting a tag. */
  onChange: (next: string) => void;
}

export const TagPicker = ({ textareaRef, value, onChange }: Props) => {
  const [tags, setTags] = useState<CampaignTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const { toast } = useToast();
  const valueRef = useRef(value);
  valueRef.current = value;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaign_tags")
      .select("id,key,label,description,category")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("label", { ascending: true });
    setTags((data as CampaignTag[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const insertTag = (key: string) => {
    const token = `{{${key}}}`;
    const ta = textareaRef?.current;
    const current = valueRef.current || "";
    if (ta && typeof ta.selectionStart === "number") {
      const start = ta.selectionStart;
      const end = ta.selectionEnd ?? start;
      const next = current.slice(0, start) + token + current.slice(end);
      onChange(next);
      // restore caret after the inserted token
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + token.length;
        ta.setSelectionRange(pos, pos);
      });
    } else {
      onChange((current ? current + " " : "") + token);
    }
  };

  const suggest = async () => {
    const desc = description.trim();
    if (!desc) return;
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-tag", {
        body: { description: desc },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const tag: CampaignTag = data.tag;
      if (!tags.find((t) => t.key === tag.key)) {
        setTags((prev) =>
          [...prev, tag].sort((a, b) => a.label.localeCompare(b.label)),
        );
      }
      insertTag(tag.key);
      setDescription("");
      toast({
        title: data.reused ? "Tag reused" : "Tag created",
        description: `Inserted {{${tag.key}}} — available in all campaigns.`,
      });
    } catch (e: any) {
      toast({
        title: "Could not suggest tag",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Insert a tag
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => {
          const reserved = isReservedSystemTag(t.key);
          return (
            <Badge
              key={t.id}
              variant="secondary"
              className={
                reserved
                  ? "opacity-60 cursor-not-allowed gap-1"
                  : "cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
              }
              onClick={() => !reserved && insertTag(t.key)}
              title={
                reserved
                  ? `{{${t.key}}} is spoken by the global system recording — don't reuse it in a campaign script.`
                  : t.description || t.key
              }
            >
              {reserved && <Lock className="h-2.5 w-2.5" />}
              {`{{${t.key}}}`}
            </Badge>
          );
        })}
        {!loading && tags.length === 0 && (
          <span className="text-xs text-muted-foreground">No tags yet</span>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe a tag (e.g. branch office address)"
          className="h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              suggest();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={suggesting || !description.trim()}
          onClick={suggest}
        >
          {suggesting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Suggest
        </Button>
      </div>
    </div>
  );
};
