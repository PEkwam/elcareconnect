import { useMemo, useState, type ComponentType } from "react";
import {
  Users, ShieldCheck, Award, Building2, Globe, Music, Radio, ListOrdered,
  Phone, Bell, Package, Megaphone, KeyRound, type LucideIcon,
} from "lucide-react";
import { ActiveDirectorySetup } from "@/components/dashboard/ActiveDirectorySetup";
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
import { cn } from "@/lib/utils";

interface SetupItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  component: ComponentType;
  adminOnly?: boolean;
}

interface SetupGroup {
  id: string;
  label: string;
  items: SetupItem[];
}

const GROUPS: SetupGroup[] = [
  {
    id: "people",
    label: "People",
    items: [
      { id: "users", label: "Users & Roles", description: "Invite users and manage roles and permissions.", icon: Users, component: UserRoleManagement },
      { id: "agents", label: "Agents", description: "Configure agent profiles and availability.", icon: ShieldCheck, component: AgentManagement },
      { id: "skills", label: "Skills", description: "Define skills used for smart call routing.", icon: Award, component: AgentSkillsManager },
      { id: "active-directory", label: "Active Directory", description: "Connect and sync your directory (SSO / SAML).", icon: Building2, component: ActiveDirectorySetup, adminOnly: true },
    ],
  },
  {
    id: "voice",
    label: "Voice & Languages",
    items: [
      { id: "languages", label: "Languages", description: "Manage supported call languages.", icon: Globe, component: LanguageManagement },
      { id: "audio", label: "Audio", description: "Upload language audio prompts.", icon: Music, component: LanguageAudioUploader },
      { id: "system-recordings", label: "System Recordings", description: "Manage system-wide voice recordings.", icon: Radio, component: SystemRecordingsManager },
      { id: "ivr", label: "IVR Menu", description: "Build the interactive voice response menu.", icon: ListOrdered, component: IVRMenuManager },
    ],
  },
  {
    id: "telephony",
    label: "Telephony",
    items: [
      { id: "calls", label: "Call Settings", description: "Caller ID, recording and call behavior.", icon: Phone, component: CallSettingsManager },
      { id: "escalation", label: "Escalation", description: "Escalation rules and notifications.", icon: Bell, component: EscalationSettings },
      { id: "sip", label: "SIP Trunks", description: "Manage SIP trunk connections.", icon: Radio, component: SipTrunkManager, adminOnly: true },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { id: "products", label: "Product Types", description: "Manage the product catalog used in campaigns.", icon: Package, component: ProductTypesTab },
      { id: "campaign-types", label: "Campaign Types", description: "Types of campaigns available when creating campaigns.", icon: Megaphone, component: CampaignTypesManager },
    ],
  },
  {
    id: "secrets",
    label: "Secrets",
    adminOnly: true,
    items: [
      { id: "app-secrets", label: "App Secrets", description: "Manage API keys and integration secrets.", icon: KeyRound, component: AppSecretsManager, adminOnly: true },
    ],
  },
] as (SetupGroup & { adminOnly?: boolean })[];

const headingFont = { fontFamily: "'Sora', sans-serif" } as const;

const Setup = () => {
  const { isSuperAdmin } = useUserRole();

  const visibleGroups = useMemo(
    () =>
      GROUPS
        .filter((g) => !(g as any).adminOnly || isSuperAdmin)
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isSuperAdmin) })),
    [isSuperAdmin]
  );

  const [activeId, setActiveId] = useState("users");
  const activeItem =
    visibleGroups.flatMap((g) => g.items).find((i) => i.id === activeId) ??
    visibleGroups[0]?.items[0];
  const ActiveComponent = activeItem?.component;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-background" style={{ fontFamily: "'Manrope', sans-serif" }}>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 animate-fade-in">
          <h1
            className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary via-primary to-accent-foreground bg-clip-text text-transparent"
            style={headingFont}
          >
            Setup & Configuration
          </h1>
          <p className="text-base text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse"></span>
            Configure agents, products, and system settings
          </p>
        </div>

        <div className="flex flex-col md:flex-row w-full bg-card rounded-3xl shadow-[0_20px_50px_hsl(var(--primary)/0.06)] border border-border overflow-hidden animate-scale-in min-h-[720px]">
          {/* In-page sidebar */}
          <aside className="md:w-72 shrink-0 bg-muted/30 border-b md:border-b-0 md:border-r border-border flex flex-col">
            <div className="p-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6" style={headingFont}>
                Configuration
              </h2>
              <nav className="space-y-7">
                {visibleGroups.map((group) => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <div
                        className={cn(
                          "w-1 h-4 rounded-full",
                          group.items.some((i) => i.id === activeItem?.id) ? "bg-primary" : "bg-border"
                        )}
                      />
                      <span className="text-xs font-bold text-foreground uppercase tracking-wide" style={headingFont}>
                        {group.label}
                      </span>
                    </div>
                    <ul className="space-y-1 ml-3">
                      {group.items.map((item) => {
                        const isActive = item.id === activeItem?.id;
                        return (
                          <li key={item.id}>
                            <button
                              onClick={() => setActiveId(item.id)}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left",
                                isActive
                                  ? "text-primary bg-primary/10"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                              )}
                            >
                              <span className="flex items-center gap-2.5">
                                <item.icon className="h-4 w-4 shrink-0" />
                                {item.label}
                              </span>
                              {item.adminOnly && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 rounded-md font-bold uppercase tracking-tighter">
                                  Admin
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content area */}
          <main className="flex-1 flex flex-col min-w-0">
            <header className="px-6 md:px-10 py-7 border-b border-border">
              <div className="flex items-center gap-4">
                {activeItem && (
                  <div className="p-3 bg-primary/10 text-primary rounded-xl shrink-0">
                    <activeItem.icon className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-foreground tracking-tight" style={headingFont}>
                    {activeItem?.label}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">{activeItem?.description}</p>
                </div>
              </div>
            </header>

            <div className="flex-1 p-4 md:p-8 bg-muted/20 overflow-y-auto">
              {ActiveComponent && (
                <div key={activeItem?.id} className="animate-fade-in">
                  <ActiveComponent />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Setup;
