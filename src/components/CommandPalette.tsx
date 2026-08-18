import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { 
  Home, 
  LayoutDashboard, 
  Settings, 
  User, 
  Users, 
  Phone,
  Calendar,
  FileText,
  Search,
  Moon,
  Sun,
  LogOut
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";

interface Client {
  id: string;
  name: string;
  policy_number: string | null;
  phone: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open && searchQuery.length > 0) {
      fetchClients();
    }
  }, [open, searchQuery]);

  const fetchClients = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, policy_number, phone")
        .ilike("name", `%${searchQuery}%`)
        .limit(5);
      
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  }, [searchQuery]);

  const handleSelect = (callback: () => void) => {
    setOpen(false);
    callback();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput 
        placeholder="Type a command or search..." 
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => handleSelect(() => navigate("/"))}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            <span>Home</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect(() => navigate("/dashboard"))}
            className="gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect(() => navigate("/miscellaneous"))}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            <span>Miscellaneous</span>
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect(() => navigate("/profile"))}
            className="gap-2"
          >
            <User className="h-4 w-4" />
            <span>Profile</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => handleSelect(() => setTheme(theme === "dark" ? "light" : "dark"))}
            className="gap-2"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-4 w-4" />
                <span>Switch to Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4" />
                <span>Switch to Dark Mode</span>
              </>
            )}
          </CommandItem>
          <CommandItem
            onSelect={() => handleSelect(() => signOut())}
            className="gap-2 text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </CommandItem>
        </CommandGroup>

        {clients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients">
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  onSelect={() => handleSelect(() => {
                    navigate("/dashboard");
                    // Focus on clients tab
                    setTimeout(() => {
                      const clientsTab = document.querySelector('[value="clients"]') as HTMLElement;
                      clientsTab?.click();
                    }, 100);
                  })}
                  className="gap-2"
                >
                  <Users className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{client.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {client.policy_number || client.phone}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
