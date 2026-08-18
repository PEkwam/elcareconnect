import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, AlertTriangle, Save, Plus, Search, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";

interface CustomerNote {
  id: string;
  client_id: string;
  call_id: string | null;
  agent_email: string | null;
  note_type: string;
  content: string;
  is_emergency: boolean;
  created_at: string;
  clients: {
    name: string;
    phone: string;
  };
}

interface CustomerNotesProps {
  clientId?: string;
  callId?: string;
}

const CustomerNotesPanel = ({ clientId, callId }: CustomerNotesProps) => {
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<string>("general");
  const [isEmergency, setIsEmergency] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [clients, setClients] = useState<Array<{id: string, name: string, phone: string}>>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (clientId) {
      setSelectedClient(clientId);
      fetchNotes(clientId);
    } else {
      fetchClients();
    }
  }, [clientId]);

  useEffect(() => {
    if (selectedClient) {
      fetchNotes(selectedClient);
    }
  }, [selectedClient]);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone")
        .order("name");

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  };

  const fetchNotes = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from("customer_notes")
        .select(`
          *,
          clients!inner (name, phone)
        `)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error("Error fetching notes:", error);
      toast({
        title: "Error",
        description: "Failed to fetch customer notes",
        variant: "destructive",
      });
    }
  };

  const saveNote = async () => {
    if (!newNote.trim() || !selectedClient) {
      toast({
        title: "Error",
        description: "Please select a client and enter a note",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("customer_notes")
        .insert({
          client_id: selectedClient,
          call_id: callId,
          agent_email: "current_agent@example.com", // Replace with actual agent email
          note_type: noteType,
          content: newNote.trim(),
          is_emergency: isEmergency,
        });

      if (error) throw error;

      toast({
        title: "Note Saved",
        description: "Customer note has been saved successfully",
      });

      setNewNote("");
      setNoteType("general");
      setIsEmergency(false);
      fetchNotes(selectedClient);
    } catch (error) {
      console.error("Error saving note:", error);
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getNoteTypeBadge = (type: string) => {
    const variants = {
      general: "outline",
      medical: "secondary",
      payment: "default",
      emergency: "destructive",
    } as const;
    
    return (
      <Badge variant={variants[type as keyof typeof variants] || "outline"}>
        {type}
      </Badge>
    );
  };

  const formatNoteDate = (dateString: string) => {
    return format(new Date(dateString), 'MM/dd/yyyy HH:mm');
  };

  return (
    <div className="space-y-6">
      {/* Client Selection (if not provided via props) */}
      {!clientId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Select Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client to view notes..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name} - {client.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Add New Note */}
      {selectedClient && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New Note
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="emergency"
                  checked={isEmergency}
                  onChange={(e) => setIsEmergency(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="emergency" className="text-sm font-medium">
                  Emergency Priority
                </label>
                {isEmergency && <AlertTriangle className="h-4 w-4 text-destructive" />}
              </div>
            </div>

            <Textarea
              placeholder="Enter note details..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
            />

            <Button
              onClick={saveNote}
              disabled={isLoading || !newNote.trim()}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save Note
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Notes History */}
      {selectedClient && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Note History
              <Badge variant="outline" className="ml-2">
                {notes.length} notes
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notes.length > 0 ? (
              <ScrollArea className="h-96">
                <div className="space-y-4">
                  {notes.map((note) => (
                    <Card key={note.id} className={note.is_emergency ? "border-red-200 bg-red-50" : ""}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getNoteTypeBadge(note.note_type)}
                            {note.is_emergency && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                EMERGENCY
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatNoteDate(note.created_at)}
                          </span>
                        </div>
                        
                        <p className="text-sm text-foreground mb-2">{note.content}</p>
                        
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Agent: {note.agent_email || 'System'}</span>
                          {note.call_id && (
                            <span>Call ID: {note.call_id.slice(0, 8)}...</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No notes available</p>
                <p className="text-sm">Add the first note for this client</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CustomerNotesPanel;