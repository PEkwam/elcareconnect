import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { 
  Home, 
  LayoutDashboard, 
  Wrench,
  MoreHorizontal,
  LogOut,
  User,
  Settings,
  Shield,
  ChevronDown,
  Phone,
  BarChart3,
  BookOpen
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import elLogo from "@/assets/enterprise-life-logo.png";

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { role, isAdmin } = useUserRole();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const collapsed = state === "collapsed";

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      
      if (data?.display_name) {
        setDisplayName(data.display_name);
      }
    };
    
    fetchProfile();
  }, [user?.id]);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out",
        description: "You have been successfully signed out",
      });
      navigate("/");
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    const names = name.split(" ");
    if (names.length >= 2) {
      return (names[0].charAt(0) + names[1].charAt(0)).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  const isActive = (path: string) => location.pathname === path;

  const { isSupervisor } = useUserRole();

  const navigationItems = isAdmin 
    ? [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, protected: true },
        { href: "/call", label: "Voice Call", icon: Phone, protected: true },
        { href: "/campaign-analytics", label: "Campaign Analytics", icon: BarChart3, protected: true, adminOnly: true },
        { href: "/supervisor", label: "Supervisor", icon: Shield, protected: true },
        { href: "/setup", label: "Setup", icon: Wrench, protected: true, adminOnly: true },
        { href: "/miscellaneous", label: "Miscellaneous", icon: MoreHorizontal, protected: true, adminOnly: true },
        { href: "/documentation", label: "Documentation", icon: BookOpen, protected: true },
      ]
    : isSupervisor
    ? [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, protected: true },
        { href: "/call", label: "Voice Call", icon: Phone, protected: true },
        { href: "/supervisor", label: "Supervisor", icon: Shield, protected: true },
        { href: "/documentation", label: "Documentation", icon: BookOpen, protected: true },
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, protected: true },
        { href: "/call", label: "Voice Call", icon: Phone, protected: true },
        { href: "/documentation", label: "Documentation", icon: BookOpen, protected: true },
      ];

  const getNavCls = (active: boolean) =>
    active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/50";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <img src={elLogo} alt="Care Connect" className="h-8 w-8 shrink-0 object-contain" />
          {!collapsed && (
            <span className="font-bold text-sidebar-foreground">Care Connect</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                if (item.protected && !user) return null;
                
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.href}
                        className={getNavCls(isActive(item.href))}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-sidebar-accent/50 rounded-md cursor-pointer">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src="" alt={displayName || user?.email || ""} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {getInitials(displayName || user?.email || "User")}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-medium text-sidebar-foreground truncate">
                        {displayName || user?.email}
                      </span>
                      {role && (
                        <Badge variant={isAdmin ? "default" : "secondary"} className="w-fit text-xs">
                          {isAdmin && <Shield className="h-3 w-3 mr-1" />}
                          {role}
                        </Badge>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{displayName || "Account"}</p>
                  <p className="text-xs leading-none text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <NavLink to="/profile" className="flex items-center gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  Profile Settings
                </NavLink>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <NavLink to="/profile?tab=preferences" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  Preferences
                </NavLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleSignOut}
                className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
