import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, MessageSquare, PhoneCall, FileText, BookOpen, Trophy, CalendarDays, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import CallHistoryAnalytics from "@/components/dashboard/CallHistoryAnalytics";
import AIPolicyNotes from "@/components/dashboard/AIPolicyNotes";
import OfficerChat from "@/components/dashboard/OfficerChat";
import CallTransferSystem from "@/components/dashboard/CallTransferSystem";
import CustomerNotesPanel from "@/components/dashboard/CustomerNotesPanel";
import KnowledgeBase from "@/components/dashboard/KnowledgeBase";
import { AgentLeaderboard } from "@/components/dashboard/AgentLeaderboard";
import { CallbackScheduler } from "@/components/dashboard/CallbackScheduler";
import { SMSCampaignManager } from "@/components/dashboard/SMSCampaignManager";
import { AgentShiftScheduler } from "@/components/dashboard/AgentShiftScheduler";
import { CallTranscription } from "@/components/dashboard/CallTranscription";

const Miscellaneous = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [clients, setClients] = useState<Array<{ id: string; name: string; policy_number: string | null }>>([]);

  const fetchClients = async () => {
    const { data } = await supabase
      .from("clients")
      .select("id, name, policy_number")
      .order("created_at", { ascending: false });
    if (data) setClients(data);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-background">
      <div className="container mx-auto p-4 md:p-8">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary via-primary to-accent-foreground bg-clip-text text-transparent">
            Miscellaneous
          </h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse"></span>
            Additional tools and features
          </p>
        </div>

        <Tabs defaultValue="analytics" className="space-y-6 animate-scale-in">
          <ScrollArea className="w-full">
            <TabsList className="inline-flex w-max gap-1 p-1">
              <TabsTrigger value="analytics" className="gap-2 text-sm">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Analytics</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Notes & AI</span>
              </TabsTrigger>
              <TabsTrigger value="call-management" className="gap-2 text-sm">
                <PhoneCall className="h-4 w-4" />
                <span className="hidden sm:inline">Call Management</span>
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="gap-2 text-sm">
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">Leaderboard</span>
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="gap-2 text-sm">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Knowledge</span>
              </TabsTrigger>
              {isAdmin && (
                <>
                  <TabsTrigger value="sms-campaigns" className="gap-2 text-sm">
                    <Smartphone className="h-4 w-4" />
                    <span className="hidden sm:inline">SMS/WhatsApp</span>
                  </TabsTrigger>
                  <TabsTrigger value="shifts" className="gap-2 text-sm">
                    <CalendarDays className="h-4 w-4" />
                    <span className="hidden sm:inline">Shifts</span>
                  </TabsTrigger>
                </>
              )}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <TabsContent value="analytics">
            <CallHistoryAnalytics />
          </TabsContent>

          <TabsContent value="notes" className="space-y-6">
            <Tabs defaultValue="customer-notes" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="customer-notes">Customer Notes</TabsTrigger>
                <TabsTrigger value="ai-notes">AI Policy Notes</TabsTrigger>
                <TabsTrigger value="transcripts">Call Transcripts</TabsTrigger>
              </TabsList>
              <TabsContent value="customer-notes"><CustomerNotesPanel /></TabsContent>
              <TabsContent value="ai-notes"><AIPolicyNotes clients={clients} onNoteCreated={fetchClients} /></TabsContent>
              <TabsContent value="transcripts"><CallTranscription /></TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="call-management" className="space-y-6">
            <Tabs defaultValue="transfers" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="transfers">Call Transfers</TabsTrigger>
                <TabsTrigger value="callbacks">Callback Scheduler</TabsTrigger>
              </TabsList>
              <TabsContent value="transfers"><CallTransferSystem /></TabsContent>
              <TabsContent value="callbacks"><CallbackScheduler /></TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="leaderboard">
            <AgentLeaderboard />
          </TabsContent>

          <TabsContent value="knowledge">
            <KnowledgeBase />
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="sms-campaigns"><SMSCampaignManager /></TabsContent>
              <TabsContent value="shifts"><AgentShiftScheduler /></TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Floating Officer Chat */}
      <Sheet modal={false}>
        <SheetTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform z-50"
          >
            <MessageSquare className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:w-[500px] p-0">
          <OfficerChat agentEmail={user?.email || 'agent@el.com'} />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Miscellaneous;
