import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, User, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { ThemeToggle } from '@/components/ThemeToggle';
import robotImage from '@/assets/robot-calling.png';
import dckLogo from '@/assets/enterprise-life-logo.png';

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();
  
  // State for password setup flow (invite/recovery)
  const [isPasswordSetup, setIsPasswordSetup] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);
  
  // State for forgot password dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Check for invite/recovery tokens in URL hash
  useEffect(() => {
    const handleTokenFromUrl = async () => {
      const hash = window.location.hash;
      
      if (hash && hash.includes('access_token')) {
        // Parse the hash parameters
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');
        
        if (accessToken && refreshToken) {
          try {
            // Set the session from the tokens
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (error) {
              console.error('Error setting session:', error);
              toast.error('Invalid or expired link. Please request a new one.');
              setCheckingToken(false);
              // Clear the hash
              window.history.replaceState(null, '', window.location.pathname);
              return;
            }
            
            if (data.user) {
              // Check if this is an invite or recovery - user needs to set password
              if (type === 'invite' || type === 'recovery' || type === 'signup') {
                setEmail(data.user.email || '');
                setIsPasswordSetup(true);
                setIsRecovery(type === 'recovery');
                setCheckingToken(false);
                // Clear the hash
                window.history.replaceState(null, '', window.location.pathname);
                return;
              }
              
              // Regular sign in - redirect to dashboard
              navigate('/dashboard');
              return;
            }
          } catch (err) {
            console.error('Error processing token:', err);
            toast.error('Failed to process authentication link.');
          }
        }
      }
      
      // No token in URL, check for existing session
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !isPasswordSetup) {
        navigate('/dashboard');
      }
      
      setCheckingToken(false);
    };
    
    handleTokenFromUrl();
  }, [navigate, isPasswordSetup]);

  // Handle password setup for invited users
  const handlePasswordSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      // Update password
      const { error: passwordError } = await supabase.auth.updateUser({
        password: password,
      });

      if (passwordError) {
        toast.error(passwordError.message);
        setIsLoading(false);
        return;
      }

      // If this is not a recovery (i.e., it's an invite), also update the display name
      if (!isRecovery && displayName.trim()) {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ display_name: displayName.trim() })
            .eq('id', user.id);

          if (profileError) {
            console.error('Error updating profile:', profileError);
            // Don't fail the whole process for profile update
          }
        }
      }

      toast.success('Password set successfully! Redirecting to dashboard...');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Failed to set password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      toast.error('Please enter your email');
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password reset email sent! Check your inbox.');
        setResetDialogOpen(false);
        setResetEmail('');
      }
    } catch (error) {
      toast.error('Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Successfully signed in!');
        // Route by role so supervisors/agents land on the right page
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id;
        let target = '/dashboard';
        if (uid) {
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', uid);
          const roleSet = new Set((roles || []).map((r) => r.role));
          if (roleSet.has('supervisor') && !roleSet.has('admin') && !roleSet.has('super_admin')) {
            target = '/supervisor';
          }
        }
        navigate(target);
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!displayName.trim()) {
      toast.error('Please enter your display name');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            display_name: displayName.trim()
          }
        }
      });

      if (error) {
        if (error.message.includes('User already registered')) {
          toast.error('Account already exists. Please sign in instead.');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Account created! Please check your email to confirm your account.');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setDisplayName('');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();

  // Password strength calculation
  const getPasswordStrength = (pwd: string): { level: number; label: string; color: string } => {
    if (!pwd) return { level: 0, label: '', color: '' };
    
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) return { level: 1, label: 'Weak', color: 'bg-destructive' };
    if (score <= 3) return { level: 2, label: 'Medium', color: 'bg-yellow-500' };
    return { level: 3, label: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(password);

  // Show loading state while checking for tokens
  if (checkingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying your account...</p>
        </div>
      </div>
    );
  }

  // Password setup form for invited users or password recovery
  if (isPasswordSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
        {/* Theme toggle button */}
        <motion.div 
          className="absolute top-4 right-4 z-20"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <ThemeToggle />
        </motion.div>

        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-muted via-background to-muted" />
        
        {/* Subtle radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />

        <div className="flex items-center justify-center w-full max-w-6xl mx-4 gap-16 relative z-10">
          {/* Left side - Robot */}
          <motion.div
            className="hidden lg:flex items-center justify-center flex-1"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="relative"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="absolute inset-0 bg-primary/20 blur-3xl scale-125 rounded-full" />
              <img 
                src={robotImage} 
                alt="AI Assistant" 
                className="relative w-full max-w-md h-auto object-contain drop-shadow-2xl"
              />
            </motion.div>
          </motion.div>

          {/* Password Setup Card */}
          <motion.div 
            className="relative w-full max-w-md"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Card glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 via-purple-500/50 to-cyan-500/50 rounded-3xl blur-xl opacity-30" />
            
            {/* Glass card */}
            <div className="relative backdrop-blur-xl bg-card/90 border border-border rounded-3xl p-8 shadow-2xl">
              {/* Logo */}
              <motion.div 
                className="flex items-center justify-center mb-6"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <div className="rounded-xl sm:rounded-2xl bg-white px-3 py-2 sm:px-5 sm:py-3 shadow-md ring-1 ring-black/5 dark:ring-white/10">
                  <img src={dckLogo} alt="Enterprise Life" className="h-8 sm:h-10 md:h-12 w-auto object-contain" />
                </div>
              </motion.div>

              {/* Header */}
              <motion.div
                className="text-center mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h1 className="text-xl font-bold text-foreground">
                    {isRecovery ? 'Reset Your Password' : 'Welcome to the Team!'}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isRecovery 
                    ? 'Enter your new password below' 
                    : 'Set up your password to complete your account'}
                </p>
              </motion.div>

              {/* Form */}
              <motion.form 
                onSubmit={handlePasswordSetup} 
                className="space-y-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
              >
                <div className="space-y-2">
                  <Label htmlFor="setup-email" className="text-sm font-medium text-muted-foreground">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="setup-email"
                      type="email"
                      value={email}
                      disabled
                      className="h-11 pl-10 text-sm bg-muted border-border text-foreground"
                    />
                  </div>
                </div>

                {/* Display name field - only show for new invites, not password recovery */}
                {!isRecovery && (
                  <div className="space-y-2">
                    <Label htmlFor="setup-display-name" className="text-sm font-medium text-muted-foreground">Display Name</Label>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="setup-display-name"
                        type="text"
                        placeholder="Your full name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-11 pl-10 text-sm bg-muted border-border text-foreground placeholder:text-muted-foreground focus:bg-background focus:border-primary/50 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="setup-password" className="text-sm font-medium text-muted-foreground">New Password</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="setup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      minLength={6}
                      className="h-11 pl-10 pr-10 text-sm bg-muted border-border text-foreground placeholder:text-muted-foreground focus:bg-background focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {/* Password strength indicator */}
                  {password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3].map((level) => (
                          <div
                            key={level}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                              passwordStrength.level >= level ? passwordStrength.color : 'bg-muted'
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-xs ${
                        passwordStrength.level === 1 ? 'text-destructive' : 
                        passwordStrength.level === 2 ? 'text-yellow-500' : 
                        'text-green-500'
                      }`}>
                        {passwordStrength.label}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="setup-confirm-password" className="text-sm font-medium text-muted-foreground">Confirm Password</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="setup-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 pl-10 pr-10 text-sm bg-muted border-border text-foreground placeholder:text-muted-foreground focus:bg-background focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {/* Password match indicator */}
                  {confirmPassword && (
                    <p className={`text-xs ${password === confirmPassword ? 'text-green-500' : 'text-destructive'}`}>
                      {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    isRecovery ? 'Reset Password' : 'Complete Setup'
                  )}
                </Button>
              </motion.form>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.div 
          className="absolute bottom-4 left-0 right-0 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <p className="text-xs text-muted-foreground">
            © {currentYear} Enterprise Life. All rights reserved.
          </p>
        </motion.div>
      </div>
    );
  }

  // Regular login/signup form
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Theme toggle button */}
      <motion.div 
        className="absolute top-4 right-4 z-20"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <ThemeToggle />
      </motion.div>

      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-muted via-background to-muted" />
      
      {/* Subtle radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />

      <div className="flex items-center justify-center w-full max-w-6xl mx-4 gap-16 relative z-10">
        {/* Left side - Robot */}
        <motion.div
          className="hidden lg:flex items-center justify-center flex-1"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="relative"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute inset-0 bg-primary/20 blur-3xl scale-125 rounded-full" />
            <img 
              src={robotImage} 
              alt="AI Assistant" 
              className="relative w-full max-w-md h-auto object-contain drop-shadow-2xl"
            />
          </motion.div>
        </motion.div>

        {/* Glassmorphism Login Card */}
        <motion.div 
          className="relative w-full max-w-md"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Card glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 via-purple-500/50 to-cyan-500/50 rounded-3xl blur-xl opacity-30" />
          
          {/* Glass card */}
          <div className="relative backdrop-blur-xl bg-card/90 border border-border rounded-3xl p-8 shadow-2xl">
            {/* Shimmer effect */}
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent -translate-x-full"
                animate={{ translateX: ['100%', '-100%'] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
              />
            </div>

            {/* Logo */}
            <motion.div 
              className="flex items-center justify-center mb-6"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <div className="rounded-xl sm:rounded-2xl bg-white px-3 py-2 sm:px-5 sm:py-3 shadow-md ring-1 ring-black/5 dark:ring-white/10">
                <img
                  src={dckLogo}
                  alt="Enterprise Life"
                  className="h-8 sm:h-10 md:h-12 w-auto object-contain"
                />
              </div>
            </motion.div>

            {/* Header */}
            <motion.div
              className="text-center mb-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              {isSignUp && (
                <h1 className="text-xl font-bold text-foreground">Create account</h1>
              )}
            </motion.div>

            {/* Form */}
            <motion.form 
              onSubmit={isSignUp ? handleSignUp : handleSignIn} 
              className="space-y-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="display-name" className="text-sm font-medium text-muted-foreground">Full Name</Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="display-name"
                      type="text"
                      placeholder="John Doe"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 pl-10 text-sm bg-muted border-border text-foreground placeholder:text-muted-foreground focus:bg-background focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-muted-foreground">Email</Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 pl-10 text-sm bg-muted border-border text-foreground placeholder:text-muted-foreground focus:bg-background focus:border-primary/50 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">Password</Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={isSignUp ? "Min. 6 characters" : "Enter password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    minLength={isSignUp ? 6 : undefined}
                    className="h-11 pl-10 pr-10 text-sm bg-muted border-border text-foreground placeholder:text-muted-foreground focus:bg-background focus:border-primary/50 focus:ring-primary/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Password strength indicator - only show during sign up */}
                {isSignUp && password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3].map((level) => (
                        <div
                          key={level}
                          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                            passwordStrength.level >= level ? passwordStrength.color : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs ${
                      passwordStrength.level === 1 ? 'text-destructive' : 
                      passwordStrength.level === 2 ? 'text-yellow-500' : 
                      'text-green-500'
                    }`}>
                      {passwordStrength.label}
                    </p>
                  </div>
                )}
              </div>

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium text-muted-foreground">Confirm Password</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 pl-10 text-sm bg-muted border-border text-foreground placeholder:text-muted-foreground focus:bg-background focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>
              )}

              {!isSignUp && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="remember" 
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                      className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                      Remember me
                    </label>
                  </div>
                  <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                    <DialogTrigger asChild>
                      <button type="button" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                        Forgot password?
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Reset Password</DialogTitle>
                        <DialogDescription>
                          Enter your email and we'll send you a reset link.
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleForgotPassword} className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Email</Label>
                          <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <Input
                              id="reset-email"
                              type="email"
                              placeholder="name@company.com"
                              value={resetEmail}
                              onChange={(e) => setResetEmail(e.target.value)}
                              required
                              disabled={resetLoading}
                              className="pl-10"
                            />
                          </div>
                        </div>
                        <Button type="submit" className="w-full h-11" disabled={resetLoading}>
                          {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  isSignUp ? 'Create Account' : 'Sign In'
                )}
              </Button>
            </motion.form>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div 
        className="absolute bottom-4 left-0 right-0 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <p className="text-xs text-muted-foreground">
          © {currentYear} Enterprise Life. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
