import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Package, Award, Bell, Globe, Users, Phone, Music, ListOrdered, KeyRound, Megaphone, Radio, UserCog, Mic2, PhoneCall, Library, Building2 } from "lucide-react";
import { ActiveDirectorySetup } from "@/components/dashboard/ActiveDirectorySetup";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { AgentManagement } from "@/components/dashboard/AgentManagement";
import ProductTypesTab from "@/components/dashboard/ProductTypesTab";
import { AgentSkillsManager } from "@/components/dashboard/AgentSkillsManager";
import { EscalationSettings } from "@/components/dashboard/EscalationSettings";
import { LanguageManagement } from "@/components/dashboard/LanguageManagement";
import { LanguageAudioUploader } from "@/components/dashboard/LanguageAudioUploader";
import { IVRMenuManager } from "@/components/dashboard/IVRMenuManager";
import { UserRoleManagement } from "@/components/dashboard/UserRoleManagement";
import { CallSettingsManager } from "@/components/dashboard/CallSettingsManager";
import { AppSecretsManager } from "@/components/dashboard/AppSecretsManager";
import { CampaignTypesManager } from "@/components/dashboard/CampaignTypesManager";
import { SystemRecordingsManager } from "@/components/dashboard/SystemRecordingsManager";
import { SipTrunkManager } from "@/components/dashboard/SipTrunkManager";
import { useUserRole } from "@/hooks/useUserRole";

const groupTriggerCls =
  "gap-2 px-5 h-10 rounded-full font-medium text-muted-foreground hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/30 transition-all duration-300";

const subTriggerCls =
  "gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all duration-200";

const Setup = () => {
  const { isSuperAdmin } = useUserRole();
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary via-primary to-accent-foreground bg-clip-text text-transparent">
            Setup & Configuration
          </h1>
          <p className="text-base text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse"></span>
            Configure agents, products, and system settings
          </p>
        </div>

        <Tabs defaultValue="people" className="space-y-6 animate-scale-in">
          <ScrollArea className="w-full">
            <TabsList className="inline-flex w-max h-14 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 p-1.5 shadow-lg shadow-primary/5">
              <TabsTrigger value="people" className={groupTriggerCls}>
                <UserCog className="h-4 w-4" /> People
              </TabsTrigger>
              <TabsTrigger value="voice" className={groupTriggerCls}>
                <Mic2 className="h-4 w-4" /> Voice & Languages
              </TabsTrigger>
              <TabsTrigger value="telephony" className={groupTriggerCls}>
                <PhoneCall className="h-4 w-4" /> Telephony
              </TabsTrigger>
              <TabsTrigger value="catalog" className={groupTriggerCls}>
                <Library className="h-4 w-4" /> Catalog
              </TabsTrigger>
              {isSuperAdmin && (
                <TabsTrigger value="secrets" className={groupTriggerCls}>
                  <KeyRound className="h-4 w-4" /> Secrets
                </TabsTrigger>
              )}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* People */}
          <TabsContent value="people" className="animate-fade-in space-y-4">
            <Tabs defaultValue="users" className="space-y-4">
              <TabsList className="bg-muted/40">
                <TabsTrigger value="users" className={subTriggerCls}><Users className="h-4 w-4" /> Users</TabsTrigger>
                <TabsTrigger value="agents" className={subTriggerCls}><ShieldCheck className="h-4 w-4" /> Agents</TabsTrigger>
                <TabsTrigger value="skills" className={subTriggerCls}><Award className="h-4 w-4" /> Skills</TabsTrigger>
                {isSuperAdmin && (
                  <TabsTrigger value="active-directory" className={subTriggerCls}><Building2 className="h-4 w-4" /> Active Directory</TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="users"><UserRoleManagement /></TabsContent>
              <TabsContent value="agents"><AgentManagement /></TabsContent>
              <TabsContent value="skills"><AgentSkillsManager /></TabsContent>
              {isSuperAdmin && (
                <TabsContent value="active-directory"><ActiveDirectorySetup /></TabsContent>
              )}
            </Tabs>
          </TabsContent>

          {/* Voice & Languages */}
          <TabsContent value="voice" className="animate-fade-in space-y-4">
            <Tabs defaultValue="languages" className="space-y-4">
              <TabsList className="bg-muted/40">
                <TabsTrigger value="languages" className={subTriggerCls}><Globe className="h-4 w-4" /> Languages</TabsTrigger>
                <TabsTrigger value="audio" className={subTriggerCls}><Music className="h-4 w-4" /> Audio</TabsTrigger>
                <TabsTrigger value="system-recordings" className={subTriggerCls}><Radio className="h-4 w-4" /> System Recordings</TabsTrigger>
                <TabsTrigger value="ivr" className={subTriggerCls}><ListOrdered className="h-4 w-4" /> IVR Menu</TabsTrigger>
              </TabsList>
              <TabsContent value="languages"><LanguageManagement /></TabsContent>
              <TabsContent value="audio"><LanguageAudioUploader /></TabsContent>
              <TabsContent value="system-recordings"><SystemRecordingsManager /></TabsContent>
              <TabsContent value="ivr"><IVRMenuManager /></TabsContent>
            </Tabs>
          </TabsContent>

          {/* Telephony */}
          <TabsContent value="telephony" className="animate-fade-in space-y-4">
            <Tabs defaultValue="calls" className="space-y-4">
              <TabsList className="bg-muted/40">
                <TabsTrigger value="calls" className={subTriggerCls}><Phone className="h-4 w-4" /> Call Settings</TabsTrigger>
                <TabsTrigger value="escalation" className={subTriggerCls}><Bell className="h-4 w-4" /> Escalation</TabsTrigger>
                {isSuperAdmin && (
                  <TabsTrigger value="sip" className={subTriggerCls}><Radio className="h-4 w-4" /> SIP Trunks</TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="calls"><CallSettingsManager /></TabsContent>
              <TabsContent value="escalation"><EscalationSettings /></TabsContent>
              {isSuperAdmin && (
                <TabsContent value="sip"><SipTrunkManager /></TabsContent>
              )}
            </Tabs>
          </TabsContent>

          {/* Catalog */}
          <TabsContent value="catalog" className="animate-fade-in space-y-4">
            <Tabs defaultValue="products" className="space-y-4">
              <TabsList className="bg-muted/40">
                <TabsTrigger value="products" className={subTriggerCls}><Package className="h-4 w-4" /> Product Types</TabsTrigger>
                <TabsTrigger value="campaign-types" className={subTriggerCls}><Megaphone className="h-4 w-4" /> Campaign Types</TabsTrigger>
              </TabsList>
              <TabsContent value="products"><ProductTypesTab /></TabsContent>
              <TabsContent value="campaign-types"><CampaignTypesManager /></TabsContent>
            </Tabs>
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="secrets" className="animate-fade-in"><AppSecretsManager /></TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default Setup;
