import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RippleButton } from "@/components/ui/ripple-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Shield, Users } from "lucide-react";
import { fireSuccessConfetti } from "@/utils/confetti";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { z } from "zod";

const emailSchema = z.string().email({ message: "Invalid email address" }).max(255);

interface Agent {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email: string;
}

export const AgentManagement = () => {
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newAgentEmail, setNewAgentEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { action: 'list_agents' }
      });

      if (error) throw error;

      setAgents(data.agents || []);
    } catch (error: any) {
      console.error("Error fetching agents:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load agents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string) => {
    try {
      emailSchema.parse(email.trim());
      setEmailError("");
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        setEmailError(err.errors[0]?.message || "Invalid email");
      }
      return false;
    }
  };

  const addAgent = async () => {
    const trimmedEmail = newAgentEmail.trim();
    
    if (!validateEmail(trimmedEmail)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { 
          action: 'add_agent',
          email: trimmedEmail 
        }
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: data.message,
      });

      fireSuccessConfetti();
      setNewAgentEmail("");
      setEmailError("");
      fetchAgents();
    } catch (error: any) {
      console.error("Error adding agent:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add agent",
        variant: "destructive",
      });
    }
  };

  const removeAgent = async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { 
          action: 'remove_agent',
          email 
        }
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: data.message,
      });

      fetchAgents();
    } catch (error: any) {
      console.error("Error removing agent:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove agent",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div>Loading agents...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add New Agent
          </CardTitle>
          <CardDescription>
            Enter an email to invite new agents or assign role to existing users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="Enter user email address"
                value={newAgentEmail}
                onChange={(e) => {
                  setNewAgentEmail(e.target.value);
                  if (emailError) validateEmail(e.target.value);
                }}
                onBlur={() => newAgentEmail && validateEmail(newAgentEmail)}
              />
              {emailError && (
                <p className="text-sm text-destructive mt-1">{emailError}</p>
              )}
            </div>
            <RippleButton 
              onClick={addAgent} 
              disabled={!newAgentEmail.trim() || !!emailError}
              className="gradient-primary"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Agent
            </RippleButton>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Current Agents ({agents.length})
          </CardTitle>
          <CardDescription>Manage agent role assignments</CardDescription>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No agents assigned yet
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-medium">{agent.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Added {new Date(agent.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Agent</Badge>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Agent Role</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove agent role from {agent.email}? 
                            They will no longer be able to handle calls or transfers.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeAgent(agent.email)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
