import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Route, User, Award, TrendingUp, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface RoutingResult {
  recommended_agent: string;
  score: number;
  reasoning: {
    has_matching_skill: boolean;
    proficiency_level: number;
    success_rate: number;
    total_calls_handled: number;
  };
  alternative_agents: Array<{
    agent_email: string;
    score: number;
  }>;
}

const CALL_TYPES = [
  { value: "payment_collection", label: "Payment Collection" },
  { value: "appointment_scheduling", label: "Appointment Scheduling" },
  { value: "policy_inquiry", label: "Policy Inquiry" },
  { value: "technical_support", label: "Technical Support" },
  { value: "billing_question", label: "Billing Question" },
  { value: "emergency_claim", label: "Emergency Claim" }
];

const PRIORITY_LEVELS = [
  { value: "low", label: "Low", color: "bg-blue-500" },
  { value: "normal", label: "Normal", color: "bg-green-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "urgent", label: "Urgent", color: "bg-red-500" }
];

export const RouteCallButton = () => {
  const [open, setOpen] = useState(false);
  const [callType, setCallType] = useState("");
  const [priority, setPriority] = useState("normal");
  const [isLoading, setIsLoading] = useState(false);
  const [routingResult, setRoutingResult] = useState<RoutingResult | null>(null);
  const { toast } = useToast();

  const handleRoute = async () => {
    if (!callType) {
      toast({
        title: "Missing Information",
        description: "Please select a call type",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smart-call-routing', {
        body: { 
          callType, 
          priority 
        }
      });

      if (error) throw error;

      if (data.success) {
        setRoutingResult(data);
        toast({
          title: "Routing Complete",
          description: `Recommended agent: ${data.recommended_agent}`,
        });
      } else {
        toast({
          title: "No Agents Available",
          description: data.message || "No available agents found for this call type",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error routing call:', error);
      toast({
        title: "Routing Failed",
        description: "Failed to find best agent. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setCallType("");
    setPriority("normal");
    setRoutingResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
          <Route className="h-4 w-4" />
          Smart Route Call
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Route className="h-5 w-5 text-primary" />
            Smart Call Routing
          </DialogTitle>
          <DialogDescription>
            AI-powered agent selection based on skills, performance, and availability
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Input Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="call-type">Call Type</Label>
              <Select value={callType} onValueChange={setCallType}>
                <SelectTrigger id="call-type">
                  <SelectValue placeholder="Select call type" />
                </SelectTrigger>
                <SelectContent>
                  {CALL_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority Level</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_LEVELS.map(level => (
                    <SelectItem key={level.value} value={level.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${level.color}`} />
                        {level.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleRoute} 
              disabled={isLoading || !callType}
              className="w-full"
            >
              {isLoading ? "Finding Best Agent..." : "Route Call"}
            </Button>
          </div>

          {/* Routing Result */}
          {routingResult && (
            <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/20">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Recommended Agent
                </h3>
                <Badge className="text-base px-3 py-1">
                  Score: {routingResult.score.toFixed(0)}
                </Badge>
              </div>

              {/* Primary Recommendation */}
              <div className="p-4 bg-primary/10 border-2 border-primary/30 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Phone className="h-6 w-6 text-primary" />
                    <div>
                      <div className="font-bold text-lg">{routingResult.recommended_agent}</div>
                      <div className="text-sm text-muted-foreground">Best Match</div>
                    </div>
                  </div>
                  <Badge className="bg-green-500">Available</Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="p-3 bg-background/50 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Award className="h-4 w-4" />
                      Skill Match
                    </div>
                    <div className="font-semibold">
                      {routingResult.reasoning.has_matching_skill ? (
                        <span className="text-green-600">
                          Level {routingResult.reasoning.proficiency_level}/5
                        </span>
                      ) : (
                        <span className="text-orange-600">No specific skill</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-background/50 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <TrendingUp className="h-4 w-4" />
                      Success Rate
                    </div>
                    <div className="font-semibold">
                      {routingResult.reasoning.success_rate 
                        ? `${(routingResult.reasoning.success_rate * 100).toFixed(0)}%`
                        : 'New Agent'}
                    </div>
                  </div>

                  <div className="p-3 bg-background/50 rounded-md col-span-2">
                    <div className="text-sm text-muted-foreground mb-1">
                      Total Calls Handled
                    </div>
                    <div className="font-semibold">
                      {routingResult.reasoning.total_calls_handled || 0} calls
                    </div>
                  </div>
                </div>
              </div>

              {/* Alternative Agents */}
              {routingResult.alternative_agents && routingResult.alternative_agents.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Alternative Agents</h4>
                  <div className="space-y-2">
                    {routingResult.alternative_agents.map((agent, index) => (
                      <div 
                        key={agent.agent_email} 
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">#{index + 2}</Badge>
                          <span className="font-medium">{agent.agent_email}</span>
                        </div>
                        <Badge variant="secondary">
                          Score: {agent.score.toFixed(0)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
