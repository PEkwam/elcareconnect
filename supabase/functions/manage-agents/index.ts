import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check if user is admin or super_admin
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin']);

    const isAdmin = userRoles && userRoles.length > 0;
    const isSuperAdmin = userRoles?.some(r => r.role === 'super_admin');

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { action, email, role: targetRole, user_id: targetUserId, display_name, password } = body;

    const jsonResponse = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // LIST ALL USERS WITH ROLES
    if (action === 'list_users') {
      const filterRole = body.filter_role;
      
      let query = supabaseAdmin.from('user_roles').select('id, user_id, role, created_at');
      if (filterRole) {
        query = query.eq('role', filterRole);
      }
      const { data: roles, error: rolesError } = await query.order('created_at', { ascending: false });

      if (rolesError) throw rolesError;

      const usersWithEmails = await Promise.all(
        (roles || []).map(async (r) => {
          const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
          return { ...r, email: u?.email || 'Unknown', display_name: u?.user_metadata?.display_name || '' };
        })
      );

      return jsonResponse({ users: usersWithEmails });
    }

    // Legacy: list_agents
    if (action === 'list_agents') {
      const { data: agents, error: agentsError } = await supabaseAdmin
        .from('user_roles').select('id, user_id, role, created_at')
        .eq('role', 'agent').order('created_at', { ascending: false });
      if (agentsError) throw agentsError;
      const agentsWithEmails = await Promise.all(
        (agents || []).map(async (agent) => {
          const { data: { user: agentUser } } = await supabaseAdmin.auth.admin.getUserById(agent.user_id);
          return { ...agent, email: agentUser?.email || 'Unknown' };
        })
      );
      return jsonResponse({ agents: agentsWithEmails });
    }

    // ADD USER WITH ROLE
    if (action === 'add_user' || action === 'add_agent') {
      if (!email) return jsonResponse({ error: 'Email is required' }, 400);
      
      const assignRole = targetRole || 'agent';
      
      // Only super_admin can create admin/super_admin roles
      if (['admin', 'super_admin'].includes(assignRole) && !isSuperAdmin) {
        return jsonResponse({ error: 'Only super admins can assign admin or super_admin roles' }, 403);
      }

      const { data: { users }, error: searchError } = await supabaseAdmin.auth.admin.listUsers();
      if (searchError) throw searchError;

      let targetUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      let isNewUser = false;
      let createdWithPassword = false;

      if (!targetUser) {
        if (password && typeof password === 'string' && password.length >= 6) {
          // Admin sets the password directly — create confirmed user
          const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (createError) return jsonResponse({ error: `Failed to create user: ${createError.message}` }, 500);
          targetUser = created.user;
          isNewUser = true;
          createdWithPassword = true;
        } else {
          const appUrl = 'https://dckcalls.lovable.app';
          const { data: invitedUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email, { redirectTo: `${appUrl}/auth` }
          );
          if (inviteError) return jsonResponse({ error: `Failed to invite user: ${inviteError.message}` }, 500);
          targetUser = invitedUser.user;
          isNewUser = true;
        }
      }

      // Check existing role
      const { data: existingRole } = await supabaseAdmin.from('user_roles')
        .select('id').eq('user_id', targetUser.id).eq('role', assignRole).maybeSingle();
      if (existingRole) return jsonResponse({ error: `User already has the ${assignRole} role` }, 400);

      const { error: insertError } = await supabaseAdmin.from('user_roles')
        .insert({ user_id: targetUser.id, role: assignRole });
      if (insertError) throw insertError;

      // Initialize agent status for agent role
      if (assignRole === 'agent') {
        await supabaseAdmin.from('agent_status').upsert({
          user_id: targetUser.id, agent_email: targetUser.email, status: 'offline',
        }, { onConflict: 'agent_email' });
      }

      // Send invitation email for existing users
      if (!isNewUser) {
        try {
          const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-agent-invitation`;
          const inviteRes = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: targetUser.email, invitedBy: user.email || 'Administrator' })
          });
          if (!inviteRes.ok) {
            console.error(`send-agent-invitation failed [${inviteRes.status}]: ${await inviteRes.text()}`);
          }
        } catch (e) { console.error('Error sending invitation email:', e); }
      }

      const message = createdWithPassword
        ? `${targetUser.email} created with the ${assignRole} role. They can log in immediately with the password you set.`
        : isNewUser
        ? `Invitation sent to ${targetUser.email}. They will have the ${assignRole} role once they sign up.`
        : `${targetUser.email} has been assigned the ${assignRole} role`;

      return jsonResponse({ success: true, message });
    }

    // EDIT USER (update role, display name)
    if (action === 'edit_user') {
      if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400);

      // Update display name if provided
      if (display_name !== undefined) {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          user_metadata: { display_name }
        });
        if (updateError) return jsonResponse({ error: `Failed to update display name: ${updateError.message}` }, 500);
      }

      // Update role if provided
      if (targetRole) {
        if (['admin', 'super_admin'].includes(targetRole) && !isSuperAdmin) {
          return jsonResponse({ error: 'Only super admins can assign admin or super_admin roles' }, 403);
        }

        // Remove all existing roles
        await supabaseAdmin.from('user_roles').delete().eq('user_id', targetUserId);
        
        // Add new role
        const { error: insertError } = await supabaseAdmin.from('user_roles')
          .insert({ user_id: targetUserId, role: targetRole });
        if (insertError) throw insertError;

        // Manage agent_status based on role change
        const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
        if (targetRole === 'agent') {
          await supabaseAdmin.from('agent_status').upsert({
            user_id: targetUserId, agent_email: targetUser?.email, status: 'offline',
          }, { onConflict: 'agent_email' });
        } else {
          await supabaseAdmin.from('agent_status').delete().eq('user_id', targetUserId);
        }
      }

      return jsonResponse({ success: true, message: 'User updated successfully' });
    }

    // RESET PASSWORD
    if (action === 'reset_password') {
      if (!email) return jsonResponse({ error: 'Email is required' }, 400);
      
      const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: 'https://dckcalls.lovable.app/auth' }
      });

      if (resetError) return jsonResponse({ error: `Failed to send reset: ${resetError.message}` }, 500);
      return jsonResponse({ success: true, message: `Password reset link sent to ${email}` });
    }

    // SET PASSWORD (admin sets password directly for existing user)
    if (action === 'set_password') {
      if (!email || !password) return jsonResponse({ error: 'Email and password are required' }, 400);
      if (password.length < 6) return jsonResponse({ error: 'Password must be at least 6 characters' }, 400);

      const { data: { users: u2 }, error: searchError } = await supabaseAdmin.auth.admin.listUsers();
      if (searchError) throw searchError;
      const targetUser = u2?.find(x => x.email?.toLowerCase() === email.toLowerCase());
      if (!targetUser) return jsonResponse({ error: 'User not found' }, 404);

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
        password,
        email_confirm: true,
      });
      if (updateError) return jsonResponse({ error: `Failed to set password: ${updateError.message}` }, 500);
      return jsonResponse({ success: true, message: `Password updated for ${email}. They can now log in.` });
    }

    // REMOVE USER ROLE
    if (action === 'remove_agent' || action === 'remove_user') {
      if (!email) return jsonResponse({ error: 'Email is required' }, 400);

      const { data: { users }, error: searchError } = await supabaseAdmin.auth.admin.listUsers();
      if (searchError) throw searchError;

      const targetUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!targetUser) return jsonResponse({ error: 'User not found' }, 404);

      // Prevent removing super_admin unless you are super_admin
      const { data: targetRoles } = await supabaseAdmin.from('user_roles')
        .select('role').eq('user_id', targetUser.id);
      if (targetRoles?.some(r => r.role === 'super_admin') && !isSuperAdmin) {
        return jsonResponse({ error: 'Only super admins can remove super_admin roles' }, 403);
      }

      const roleToRemove = targetRole || 'agent';
      await supabaseAdmin.from('user_roles').delete()
        .eq('user_id', targetUser.id).eq('role', roleToRemove);

      if (roleToRemove === 'agent') {
        await supabaseAdmin.from('agent_status').delete().eq('user_id', targetUser.id);
      }

      return jsonResponse({ success: true, message: `${roleToRemove} role removed from ${email}` });
    }

    return jsonResponse({ error: 'Invalid action' }, 400);

  } catch (error: any) {
    console.error('Error in manage-agents function:', error);
    return new Response(JSON.stringify({ error: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

});
