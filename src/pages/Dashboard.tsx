import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RippleButton } from "@/components/ui/ripple-button";
import { ParticleButton } from "@/components/ui/particle-button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Phone, Users, Calendar, MessageSquare, Activity, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import { useAgentPresence } from "@/hooks/useAgentPresence";
import { fireSuccessConfetti } from "@/utils/confetti";
import ClientsTab from "@/components/dashboard/ClientsTab";
import CallsTab from "@/components/dashboard/CallsTab";
import CampaignsTab from "@/components/dashboard/CampaignsTab";
import AppointmentsTab from "@/components/dashboard/AppointmentsTab";

import OfficerChat from "@/components/dashboard/OfficerChat";
import { RealtimeAnalyticsDashboard } from "@/components/dashboard/RealtimeAnalyticsDashboard";
import { SentimentTrendChart } from '@/components/dashboard/SentimentTrendChart';
import { RouteCallButton } from '@/components/dashboard/RouteCallButton';

import { LiveAgentQueue } from '@/components/dashboard/LiveAgentQueue';
import { DashboardCustomizer, useDashboardWidgets } from '@/components/dashboard/DashboardCustomizer';
import { AgentStatusWidget } from '@/components/dashboard/AgentStatusWidget';

interface DashboardStats {
  total_clients: number;
  total_calls: number;
  pending_calls: number;
  pending_medicals: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    total_clients: 0,
    total_calls: 0,
    pending_calls: 0,
    pending_medicals: 0,
  });
  const { toast } = useToast();
  const { user } = useAuth();

  // Initialize session timeout
  useSessionTimeout();

  // Presence tracking is owned globally by <PresenceTracker /> in App.tsx.


  // Initialize onboarding tour
  const { hasCompletedOnboarding, startTour } = useOnboardingTour();

  // Dashboard customization
  const { widgets, toggleWidget, reorderWidgets, resetToDefault, isWidgetEnabled } = useDashboardWidgets();

  useEffect(() => {
    // Start tour for new users
    if (!hasCompletedOnboarding) {
      const timer = setTimeout(() => {
        startTour();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedOnboarding, startTour]);

  useEffect(() => {
    fetchStats();

    // Realtime subscriptions to keep cards in sync
    const channel = supabase
      .channel("dashboard-stats")
      .on("postgres_changes", { event: "*", schema: "public", table: "outbound_calls" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_appointments" }, fetchStats)
      .subscribe();

    // Safety polling fallback every 30s
    const interval = setInterval(fetchStats, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const fetchStats = async () => {
    try {
      // Get total clients
      const { count: totalClients } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true });

      // Get total successful calls today
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count: totalCalls } = await supabase
        .from("outbound_calls")
        .select("*", { count: "exact", head: true })
        .in("call_status", ["completed", "in-progress"])
        .gte("created_at", startOfDay.toISOString());

      // Get pending calls
      const { count: pendingCalls } = await supabase
        .from("outbound_calls")
        .select("*", { count: "exact", head: true })
        .eq("call_status", "scheduled");

      // Get pending medical appointments
      const { count: pendingMedicals } = await supabase
        .from("medical_appointments")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      setStats({
        total_clients: totalClients || 0,
        total_calls: totalCalls || 0,
        pending_calls: pendingCalls || 0,
        pending_medicals: pendingMedicals || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast({
        title: "Error",
        description: "Failed to fetch dashboard statistics",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary to-accent-foreground bg-clip-text text-transparent">
                Care Connect Dashboard
              </h1>
              {user?.email && (
                <p className="text-base text-muted-foreground flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse"></span>
                  Welcome back, ready to make an impact!
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <DashboardCustomizer 
                widgets={widgets}
                onToggle={toggleWidget}
                onReorder={reorderWidgets}
                onReset={resetToDefault}
              />
              <Button variant="outline" size="sm" onClick={startTour} className="gap-2">
                <HelpCircle className="h-4 w-4" />
                Tour
              </Button>
              <div data-tour="route-call">
                <RouteCallButton />
              </div>
              <RippleButton
                className="gradient-primary shadow-primary-lg hover:shadow-glow transition-all duration-300 hover:scale-105"
                size="sm"
                onClick={async () => {
                  try {
                    await supabase.functions.invoke("sample-data");
                    fireSuccessConfetti();
                    toast({
                      title: "Success",
                      description: "Sample data loaded successfully",
                    });
                    fetchStats();
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to load sample data",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Load Sample Data
              </RippleButton>
            </div>
          </div>
        </div>

        {/* Stats Cards - Enhanced */}
        <div data-tour="stats-cards" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-300"></div>
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Clients
                </CardTitle>
                <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-all duration-300">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="text-3xl font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                {stats.total_clients}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Active policies</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in [animation-delay:100ms] group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-300"></div>
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Calls
                </CardTitle>
                <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-all duration-300">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="text-3xl font-bold text-primary">
                {stats.total_calls}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Made today</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card to-accent/10 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in [animation-delay:200ms] group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-accent/20 rounded-full blur-3xl group-hover:bg-accent/30 transition-all duration-300"></div>
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending Calls
                </CardTitle>
                <div className="p-2 rounded-lg bg-accent/20 group-hover:bg-accent/30 transition-all duration-300">
                  <Phone className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="text-3xl font-bold text-primary">
                {stats.pending_calls}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Scheduled today</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-accent-foreground/20 bg-gradient-to-br from-card to-secondary hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in [animation-delay:300ms] group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-secondary rounded-full blur-3xl group-hover:bg-accent transition-all duration-300"></div>
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Appointments
                </CardTitle>
                <div className="p-2 rounded-lg bg-secondary group-hover:bg-accent transition-all duration-300">
                  <Calendar className="h-5 w-5 text-accent-foreground" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="text-3xl font-bold text-accent-foreground">
                {stats.pending_medicals}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Medical pending</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="campaigns" className="space-y-6 animate-scale-in">
          <TabsList className="grid w-full grid-cols-5 h-12 rounded-xl bg-gradient-to-r from-muted to-muted/50 p-1 shadow-md">
            <TabsTrigger data-tour="campaigns-tab" value="campaigns" className="gap-2 text-sm data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Campaigns</span>
              <span className="sm:hidden">Campaigns</span>
            </TabsTrigger>
            <TabsTrigger data-tour="clients-tab" value="clients" className="gap-2 text-sm data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Clients</span>
              <span className="sm:hidden">Clients</span>
            </TabsTrigger>
            <TabsTrigger data-tour="calls-tab" value="calls" className="gap-2 text-sm data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">Calls</span>
              <span className="sm:hidden">Calls</span>
            </TabsTrigger>
            <TabsTrigger value="appointments" className="gap-2 text-sm data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Appointments</span>
              <span className="sm:hidden">Appts</span>
            </TabsTrigger>
            <TabsTrigger data-tour="analytics-tab" value="analytics" className="gap-2 text-sm data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Analytics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-4">
            <CampaignsTab />
          </TabsContent>

          <TabsContent value="clients" className="space-y-4">
            <ClientsTab onStatsUpdate={fetchStats} />
          </TabsContent>

          <TabsContent value="calls" className="space-y-4">
            <div className="grid gap-4">
              <LiveAgentQueue />
              <CallsTab onStatsUpdate={fetchStats} />
            </div>
          </TabsContent>

          <TabsContent value="appointments" className="space-y-4">
            <AppointmentsTab />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <RealtimeAnalyticsDashboard />
            <SentimentTrendChart />
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating Officer Chat Button - Enhanced */}
      <Sheet modal={false}>
        <SheetTrigger asChild>
          <ParticleButton
            data-tour="chat-button"
            size="lg"
            className="fixed bottom-6 right-6 h-16 w-16 rounded-full gradient-primary shadow-primary-lg hover:shadow-glow hover:scale-110 transition-all duration-300 z-50 animate-float"
            particleCount={16}
          >
            <MessageSquare className="h-7 w-7" />
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive rounded-full animate-pulse"></span>
          </ParticleButton>
        </SheetTrigger>
        <SheetContent side="right" className="w-[380px] p-0 border-l-2 border-primary/20 shadow-2xl">
          <OfficerChat agentEmail={user?.email || 'agent@careconnect.com'} />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Dashboard;