import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, User, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TranscriptionRow {
  id: string;
  call_id: string | null;
  speaker: string | null;
  transcript: string;
  is_partial: boolean | null;
  created_at: string;
}

export const LiveTranscription = () => {
  const [transcripts, setTranscripts] = useState<TranscriptionRow[]>([]);

  useEffect(() => {
    const fetchInitial = async () => {
      const { data } = await supabase
        .from("call_transcriptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setTranscripts(data as TranscriptionRow[]);
    };
    fetchInitial();

    const channel = supabase
      .channel("call_transcriptions_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_transcriptions" },
        (payload) => {
          setTranscripts((prev) => [payload.new as TranscriptionRow, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          Live Transcription
          <Badge variant="outline" className="ml-2">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Realtime
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96 pr-4">
          {transcripts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No transcripts yet. Live transcripts will appear here as calls are processed.
            </p>
          ) : (
            <div className="space-y-3">
              {transcripts.map((t) => {
                const isAgent = (t.speaker || "").toLowerCase().includes("agent");
                const Icon = isAgent ? Bot : User;
                return (
                  <div
                    key={t.id}
                    className={`flex gap-3 p-3 rounded-lg border ${
                      isAgent ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                    }`}
                  >
                    <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">{t.speaker || "Unknown"}</span>
                        <span>{new Date(t.created_at).toLocaleTimeString()}</span>
                        {t.is_partial && (
                          <Badge variant="outline" className="text-[10px] py-0 h-4">
                            partial
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground break-words">{t.transcript}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default LiveTranscription;
