import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  FileText, 
  Mic, 
  MicOff, 
  Download, 
  Search,
  User,
  Headphones,
  Clock,
  Loader2,
  Volume2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";

interface Transcription {
  id: string;
  call_id: string;
  transcript: string;
  is_partial: boolean;
  speaker: string | null;
  timestamp_seconds: number | null;
  confidence: number | null;
  created_at: string;
}

interface Call {
  id: string;
  phone_number: string;
  call_status: string;
  started_at: string | null;
  ended_at: string | null;
  clients: {
    name: string;
  } | null;
}

export const CallTranscription = () => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const fetchCalls = async () => {
    const { data, error } = await supabase
      .from("outbound_calls")
      .select(`
        id,
        phone_number,
        call_status,
        started_at,
        ended_at,
        clients (name)
      `)
      .in("call_status", ["completed", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching calls:", error);
      return;
    }
    setCalls(data || []);
  };

  const fetchTranscriptions = async (callId: string) => {
    const { data, error } = await supabase
      .from("call_transcriptions")
      .select("*")
      .eq("call_id", callId)
      .order("timestamp_seconds", { ascending: true });

    if (error) {
      console.error("Error fetching transcriptions:", error);
      return;
    }
    setTranscriptions(data || []);
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  useEffect(() => {
    if (selectedCall) {
      fetchTranscriptions(selectedCall.id);

      // Set up real-time subscription for live transcriptions
      const channel = supabase
        .channel(`transcription-${selectedCall.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "call_transcriptions",
            filter: `call_id=eq.${selectedCall.id}`
          },
          (payload) => {
            setTranscriptions(prev => [...prev, payload.new as Transcription]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedCall]);

  const handleStartTranscription = async () => {
    if (!selectedCall) return;

    setIsTranscribing(true);
    try {
      const { error } = await supabase.functions.invoke("transcribe-call", {
        body: { callId: selectedCall.id }
      });

      if (error) throw error;

      toast({
        title: "Transcription Started",
        description: "Real-time transcription is now active"
      });
    } catch (error) {
      console.error("Transcription error:", error);
      toast({
        title: "Transcription Error",
        description: "Failed to start transcription",
        variant: "destructive"
      });
      setIsTranscribing(false);
    }
  };

  const handleStopTranscription = () => {
    setIsTranscribing(false);
    toast({
      title: "Transcription Stopped",
      description: "Transcription has been paused"
    });
  };

  const handleDownloadTranscript = () => {
    if (!selectedCall || transcriptions.length === 0) return;

    const content = transcriptions
      .map(t => {
        const speaker = t.speaker === "agent" ? "Agent" : "Customer";
        const time = t.timestamp_seconds 
          ? `[${Math.floor(t.timestamp_seconds / 60)}:${String(Math.floor(t.timestamp_seconds % 60)).padStart(2, "0")}]`
          : "";
        return `${time} ${speaker}: ${t.transcript}`;
      })
      .join("\n\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${selectedCall.id.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Transcript Downloaded",
      description: "The transcript has been saved as a text file"
    });
  };

  const getSpeakerIcon = (speaker: string | null) => {
    return speaker === "agent" ? (
      <Headphones className="h-4 w-4 text-primary" />
    ) : (
      <User className="h-4 w-4 text-muted-foreground" />
    );
  };

  const formatTimestamp = (seconds: number | null) => {
    if (!seconds) return "";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const filteredCalls = calls.filter(call => 
    call.clients?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    call.phone_number.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Call Transcription
        </h2>
        <p className="text-muted-foreground">
          Real-time AI-powered call transcription and history
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calls List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Recent Calls
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search calls..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredCalls.map(call => (
                  <div
                    key={call.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedCall?.id === call.id
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedCall(call)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{call.clients?.name || "Unknown"}</p>
                      <Badge variant={call.call_status === "in_progress" ? "default" : "secondary"}>
                        {call.call_status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{call.phone_number}</p>
                    {call.started_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(call.started_at), "MMM d, h:mm a")}
                      </p>
                    )}
                  </div>
                ))}
                {filteredCalls.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground">
                    No calls found
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Transcription Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {selectedCall ? `Transcript: ${selectedCall.clients?.name || selectedCall.phone_number}` : "Select a Call"}
              </CardTitle>
              {selectedCall && (
                <div className="flex items-center gap-2">
                  {selectedCall.call_status === "in_progress" && (
                    <>
                      {isTranscribing ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleStopTranscription}
                        >
                          <MicOff className="h-4 w-4 mr-1" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleStartTranscription}
                        >
                          <Mic className="h-4 w-4 mr-1" />
                          Start Transcribing
                        </Button>
                      )}
                    </>
                  )}
                  {transcriptions.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTranscript}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedCall ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileText className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg">Select a call to view its transcript</p>
                <p className="text-sm">Choose from the list on the left</p>
              </div>
            ) : transcriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                {isTranscribing ? (
                  <>
                    <Loader2 className="h-12 w-12 mb-4 animate-spin" />
                    <p className="text-lg">Listening for speech...</p>
                    <p className="text-sm">Transcription will appear here</p>
                  </>
                ) : (
                  <>
                    <Mic className="h-16 w-16 mb-4 opacity-50" />
                    <p className="text-lg">No transcript available</p>
                    {selectedCall.call_status === "in_progress" && (
                      <p className="text-sm">Click "Start Transcribing" to begin</p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-4 pr-4">
                  {transcriptions.map((t, index) => (
                    <div
                      key={t.id}
                      className={`flex gap-3 ${
                        t.speaker === "agent" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div className={`flex-shrink-0 p-2 rounded-full ${
                        t.speaker === "agent" ? "bg-primary/10" : "bg-muted"
                      }`}>
                        {getSpeakerIcon(t.speaker)}
                      </div>
                      <div className={`flex-1 ${t.speaker === "agent" ? "text-right" : ""}`}>
                        <div className={`inline-block max-w-[80%] p-3 rounded-lg ${
                          t.speaker === "agent" 
                            ? "bg-primary/10 text-foreground" 
                            : "bg-muted"
                        } ${t.is_partial ? "opacity-70 italic" : ""}`}>
                          <p className="text-sm">{t.transcript}</p>
                          <div className={`flex items-center gap-2 mt-1 text-xs text-muted-foreground ${
                            t.speaker === "agent" ? "justify-end" : ""
                          }`}>
                            {t.timestamp_seconds && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(t.timestamp_seconds)}
                              </span>
                            )}
                            {t.confidence && (
                              <span>{Math.round(t.confidence * 100)}% confidence</span>
                            )}
                            {t.is_partial && (
                              <Badge variant="outline" className="text-xs">
                                Partial
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTranscribing && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Listening...</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
