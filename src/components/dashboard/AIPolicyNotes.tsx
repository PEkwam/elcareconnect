import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface AIPolicyNotesProps {
  clients?: Array<{ id: string; name: string; policy_number: string | null }>;
  onNoteCreated?: () => void;
}

const AIPolicyNotes = ({ clients = [], onNoteCreated }: AIPolicyNotesProps) => {
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [context, setContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedNote, setGeneratedNote] = useState("");
  const { toast } = useToast();

  const handleGenerateNote = async () => {
    if (!selectedClient) {
      toast({
        title: "Client Required",
        description: "Please select a client to generate a policy note",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedNote("");

    try {
      const client = clients.find(c => c.id === selectedClient);
      
      const { data, error } = await supabase.functions.invoke('ai-policy-notes', {
        body: {
          clientId: selectedClient,
          policyNumber: client?.policy_number,
          context: context.trim() || undefined,
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedNote(data.note);
      setContext("");
      
      toast({
        title: "AI Note Generated",
        description: "Policy analysis note created successfully",
      });

      onNoteCreated?.();

    } catch (error: any) {
      console.error('Error generating AI note:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate AI policy note",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Policy Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Client</label>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a client..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name} {client.policy_number ? `(${client.policy_number})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Additional Context (Optional)</label>
          <Textarea
            placeholder="Add any specific details or concerns to include in the analysis..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
          />
        </div>

        <Button 
          onClick={handleGenerateNote} 
          disabled={isGenerating || !selectedClient}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate AI Policy Note
            </>
          )}
        </Button>

        {generatedNote && (
          <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Generated Note:</p>
            <p className="text-sm whitespace-pre-wrap">{generatedNote}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AIPolicyNotes;
