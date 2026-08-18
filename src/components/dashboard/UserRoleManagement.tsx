import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RippleButton } from "@/components/ui/ripple-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UserPlus, Trash2, Shield, Users, Pencil, KeyRound, Crown, Eye } from "lucide-react";
import { fireSuccessConfetti } from "@/utils/confetti";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { z } from "zod";

const emailSchema = z.string().email().max(255);

interface ManagedUser {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email: string;
  display_name: string;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  super_admin: { label: "Super Admin", color: "destructive", icon: Crown },
  admin: { label: "Admin", color: "default", icon: Shield },
  supervisor: { label: "Supervisor", color: "secondary", icon: Eye },
  agent: { label: "Agent", color: "outline", icon: Shield },
  user: { label: "User", color: "secondary", icon: Users },
};

const ASSIGNABLE_ROLES = ["agent", "supervisor", "admin", "super_admin"];

export const UserRoleManagement = () => {
  const { toast } = useToast();
  const { isSuperAdmin } = useUserRole();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("agent");
  const [newPassword, setNewPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [pwUser, setPwUser] = useState<ManagedUser | null>(null);
  const [pwValue, setPwValue] = useState("");

  useEffect(() => { fetchUsers(); }, [filterRole]);

  const fetchUsers = async () => {
    try {
      const body: Record<string, string> = { action: 'list_users' };
      if (filterRole !== 'all') body.filter_role = filterRole;
      const { data, error } = await supabase.functions.invoke('manage-agents', { body });
      if (error) throw error;
      setUsers(data.users || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const addUser = async () => {
    const trimmed = newEmail.trim();
    try { emailSchema.parse(trimmed); } catch { setEmailError("Invalid email"); return; }
    if (newPassword && newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    try {
      const payload: Record<string, unknown> = { action: 'add_user', email: trimmed, role: newRole };
      if (newPassword) payload.password = newPassword;
      const { data, error } = await supabase.functions.invoke('manage-agents', { body: payload });
      if (error) throw error;
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Success", description: data.message });
      fireSuccessConfetti();
      setNewEmail("");
      setNewPassword("");
      setEmailError("");
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const setUserPassword = async () => {
    if (!pwUser || pwValue.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { action: 'set_password', email: pwUser.email, password: pwValue }
      });
      if (error) throw error;
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Success", description: data.message });
      setPwUser(null);
      setPwValue("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const removeUser = async (email: string, role: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { action: 'remove_user', email, role }
      });
      if (error) throw error;
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Success", description: data.message });
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const saveEdit = async () => {
    if (!editUser) return;
    try {
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { action: 'edit_user', user_id: editUser.user_id, display_name: editDisplayName, role: editRole }
      });
      if (error) throw error;
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Success", description: "User updated successfully" });
      setEditUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-agents', {
        body: { action: 'reset_password', email }
      });
      if (error) throw error;
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Success", description: data.message });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const availableRoles = isSuperAdmin ? ASSIGNABLE_ROLES : ASSIGNABLE_ROLES.filter(r => !['admin', 'super_admin'].includes(r));

  if (loading) return <div>Loading users...</div>;

  return (
    <div className="space-y-6">
      {/* Add User Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Add New User</CardTitle>
          <CardDescription>Invite a new user or set a password to create them instantly. Leave password blank to send an email invite.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input type="email" placeholder="Email address" value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setEmailError(""); }}
              />
              {emailError && <p className="text-sm text-destructive mt-1">{emailError}</p>}
            </div>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableRoles.map(r => (
                  <SelectItem key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Optional password (min 6 chars) — leave blank to send invite email"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="flex-1"
            />
            <RippleButton onClick={addUser} disabled={!newEmail.trim()} className="gradient-primary">
              <UserPlus className="h-4 w-4 mr-2" />Add User
            </RippleButton>
          </div>
        </CardContent>
      </Card>

      {/* Users List Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Users ({users.length})</CardTitle>
              <CardDescription>Manage user roles and permissions</CardDescription>
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ASSIGNABLE_ROLES.map(r => (
                  <SelectItem key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No users found</div>
          ) : (
            <div className="space-y-3">
              {users.map((u) => {
                const config = ROLE_CONFIG[u.role] || ROLE_CONFIG.user;
                return (
                  <div key={u.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <config.icon className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">{u.display_name || u.email}</div>
                        <div className="text-xs text-muted-foreground">{u.email} · Added {new Date(u.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={config.color as any}>{config.label}</Badge>
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditUser(u);
                        setEditDisplayName(u.display_name || '');
                        setEditRole(u.role);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setPwUser(u); setPwValue(""); }} title="Set password">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => resetPassword(u.email)} title="Send password reset email">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {config.label} Role</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove the {config.label.toLowerCase()} role from {u.email}?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeUser(u.email, u.role)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details for {editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={saveEdit} className="gradient-primary">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Password Dialog */}
      <Dialog open={!!pwUser} onOpenChange={(open) => { if (!open) { setPwUser(null); setPwValue(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Password</DialogTitle>
            <DialogDescription>Set a new password for {pwUser?.email}. They will be able to log in immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>New Password</Label>
            <Input type="password" placeholder="Min 6 characters" value={pwValue} onChange={(e) => setPwValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwUser(null); setPwValue(""); }}>Cancel</Button>
            <Button onClick={setUserPassword} className="gradient-primary" disabled={pwValue.length < 6}>Set Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
