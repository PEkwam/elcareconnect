import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, Award, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface AgentSkill {
  id: string;
  agent_email: string;
  skill_type: string;
  proficiency_level: number;
  created_at: string;
}

const SKILL_TYPES = [
  { value: "payment_collection", label: "Payment Collection" },
  { value: "appointment_scheduling", label: "Appointment Scheduling" },
  { value: "policy_inquiry", label: "Policy Inquiry" },
  { value: "technical_support", label: "Technical Support" },
  { value: "billing_question", label: "Billing Question" },
  { value: "emergency_claim", label: "Emergency Claim" },
  { value: "customer_retention", label: "Customer Retention" },
  { value: "sales", label: "Sales" }
];

const PROFICIENCY_LEVELS = [
  { value: 1, label: "Beginner", color: "bg-red-500" },
  { value: 2, label: "Basic", color: "bg-orange-500" },
  { value: 3, label: "Intermediate", color: "bg-yellow-500" },
  { value: 4, label: "Advanced", color: "bg-blue-500" },
  { value: 5, label: "Expert", color: "bg-green-500" }
];

export const AgentSkillsManager = () => {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<AgentSkill | null>(null);
  
  const [formData, setFormData] = useState({
    agent_email: "",
    skill_type: "",
    proficiency_level: 3
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchSkills();
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_status')
        .select('agent_email')
        .order('agent_email');

      if (error) throw error;
      
      const uniqueEmails = [...new Set(data.map(a => a.agent_email))];
      setAgents(uniqueEmails);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('*')
        .order('agent_email');

      if (error) throw error;
      setSkills(data || []);
    } catch (error) {
      console.error('Error fetching skills:', error);
      toast({
        title: "Error",
        description: "Failed to load agent skills",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, keepOpen = false) => {
    e.preventDefault();
    
    if (!formData.agent_email || !formData.skill_type) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      if (editingSkill) {
        const { error } = await supabase
          .from('agent_skills')
          .update({
            skill_type: formData.skill_type,
            proficiency_level: formData.proficiency_level
          })
          .eq('id', editingSkill.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Skill updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('agent_skills')
          .insert([formData]);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Skill added successfully"
        });
      }

      await fetchSkills();
      if (keepOpen && !editingSkill) {
        // keep dialog open, clear only skill/proficiency so user can keep adding to same agent
        setFormData({ ...formData, skill_type: "", proficiency_level: 3 });
      } else {
        setIsDialogOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error('Error saving skill:', error);
      toast({
        title: "Error",
        description: "Failed to save skill",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (skillId: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('agent_skills')
        .delete()
        .eq('id', skillId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Skill deleted successfully"
      });
      fetchSkills();
    } catch (error) {
      console.error('Error deleting skill:', error);
      toast({
        title: "Error",
        description: "Failed to delete skill",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = (skill: AgentSkill) => {
    setEditingSkill(skill);
    setFormData({
      agent_email: skill.agent_email,
      skill_type: skill.skill_type,
      proficiency_level: skill.proficiency_level || 3
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      agent_email: "",
      skill_type: "",
      proficiency_level: 3
    });
    setEditingSkill(null);
  };

  const getProficiencyBadge = (level: number) => {
    const proficiency = PROFICIENCY_LEVELS.find(p => p.value === level) || PROFICIENCY_LEVELS[2];
    return (
      <Badge className={`${proficiency.color} text-white`}>
        {proficiency.label}
      </Badge>
    );
  };

  const getSkillLabel = (skillType: string) => {
    return SKILL_TYPES.find(s => s.value === skillType)?.label || skillType;
  };

  const groupedSkills = skills.reduce((acc, skill) => {
    if (!acc[skill.agent_email]) {
      acc[skill.agent_email] = [];
    }
    acc[skill.agent_email].push(skill);
    return acc;
  }, {} as Record<string, AgentSkill[]>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Agent Skills Management
            </CardTitle>
            <CardDescription>
              Assign and manage skills for smart call routing
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Skill
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingSkill ? 'Edit Agent Skill' : 'Add Agent Skill'}
                </DialogTitle>
                <DialogDescription>
                  Assign a skill and proficiency level to an agent
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent">Agent Email</Label>
                  <Select
                    value={formData.agent_email}
                    onValueChange={(value) => setFormData({ ...formData, agent_email: value })}
                    disabled={!!editingSkill}
                  >
                    <SelectTrigger id="agent">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map(email => (
                        <SelectItem key={email} value={email}>
                          {email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skill">Skill Type</Label>
                  <Select
                    value={formData.skill_type}
                    onValueChange={(value) => setFormData({ ...formData, skill_type: value })}
                  >
                    <SelectTrigger id="skill">
                      <SelectValue placeholder="Select skill" />
                    </SelectTrigger>
                    <SelectContent>
                      {SKILL_TYPES.map(skill => (
                        <SelectItem key={skill.value} value={skill.value}>
                          {skill.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proficiency">Proficiency Level</Label>
                  <Select
                    value={formData.proficiency_level.toString()}
                    onValueChange={(value) => setFormData({ ...formData, proficiency_level: parseInt(value) })}
                  >
                    <SelectTrigger id="proficiency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROFICIENCY_LEVELS.map(level => (
                        <SelectItem key={level.value} value={level.value.toString()}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${level.color}`} />
                            {level.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  {!editingSkill && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isLoading}
                      onClick={(e) => handleSubmit(e as any, true)}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Save & add another
                    </Button>
                  )}
                  <Button type="submit" disabled={isLoading}>
                    {editingSkill ? 'Update' : 'Add'} Skill
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading skills...</div>
        ) : Object.keys(groupedSkills).length === 0 ? (
          <div className="text-center py-12">
            <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Skills Added</h3>
            <p className="text-muted-foreground mb-4">
              Start by adding skills to your agents for smart routing
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSkills).map(([email, agentSkills]) => (
              <div key={email} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">{email}</h3>
                  </div>
                  <Badge variant="secondary">
                    {agentSkills.length} {agentSkills.length === 1 ? 'skill' : 'skills'}
                  </Badge>
                </div>
                
                <div className="grid gap-2">
                  {agentSkills.map((skill) => (
                    <div 
                      key={skill.id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{getSkillLabel(skill.skill_type)}</div>
                        {getProficiencyBadge(skill.proficiency_level || 3)}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(skill)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(skill.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
