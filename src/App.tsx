import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTop } from "@/components/ScrollToTop";
import { AnimatePresence } from "framer-motion";
import { CommandPalette } from "@/components/CommandPalette";
import { AgentStatusWidget } from "@/components/dashboard/AgentStatusWidget";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import Miscellaneous from "./pages/Miscellaneous";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import SupervisorView from "./pages/SupervisorView";
import CampaignAnalytics from "./pages/CampaignAnalytics";
import Documentation from "./pages/Documentation";
import VoiceInterface from "./components/VoiceInterface";
import WebRTCCallPanel from "./components/call/WebRTCCallPanel";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import { PresenceTracker } from "./components/PresenceTracker";

const queryClient = new QueryClient();

const HeaderStatus = () => {
  const { user } = useAuth();
  if (!user) return null;
  return <AgentStatusWidget />;
};

const AppContent = () => {
  const location = useLocation();
  const showSidebar = location.pathname !== '/';

  if (!showSidebar) {
    return (
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><Auth /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="sticky top-0 z-40 border-b border-primary/10 bg-gradient-to-r from-background via-secondary/5 to-background backdrop-blur-xl shadow-sm">
            <div className="flex h-14 items-center px-4 gap-4">
              <SidebarTrigger />
              <div className="flex-1" />
              <HeaderStatus />
              <ThemeToggle />
            </div>
          </header>
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/landing" element={<PageTransition><Index /></PageTransition>} />
                <Route 
                  path="/dashboard" 
                  element={
                    <ProtectedRoute>
                      <PageTransition><Dashboard /></PageTransition>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/setup" 
                  element={
                    <ProtectedRoute>
                      <AdminRoute>
                        <PageTransition><Setup /></PageTransition>
                      </AdminRoute>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/miscellaneous" 
                  element={
                    <ProtectedRoute>
                      <AdminRoute>
                        <PageTransition><Miscellaneous /></PageTransition>
                      </AdminRoute>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/voice" 
                  element={
                    <ProtectedRoute>
                      <PageTransition><VoiceInterface /></PageTransition>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/call" 
                  element={
                    <ProtectedRoute>
                      <PageTransition><WebRTCCallPanel /></PageTransition>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/profile" 
                  element={
                    <ProtectedRoute>
                      <PageTransition><Profile /></PageTransition>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/supervisor" 
                  element={
                    <ProtectedRoute>
                      <PageTransition><SupervisorView /></PageTransition>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/campaign-analytics" 
                  element={
                    <ProtectedRoute>
                      <AdminRoute>
                        <PageTransition><CampaignAnalytics /></PageTransition>
                      </AdminRoute>
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/documentation" 
                  element={
                    <ProtectedRoute>
                      <PageTransition><Documentation /></PageTransition>
                    </ProtectedRoute>
                  } 
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
              </Routes>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <CommandPalette />
            <PresenceTracker />
            <AppContent />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
