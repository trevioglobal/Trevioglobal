"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plane, Hotel, Zap, Palmtree, Shield, ArrowRight, Mail, Lock,
  Building2, UserCog, User, Eye, EyeOff, CheckCircle2, Sparkles,
  Globe, TrendingUp,
} from "lucide-react";
import { useAuthStore } from "@/store/app-store";
import { useDemoDataStore } from "@/store/demo-data-store";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/nav-config";
import { ROLE_USERS, DEMO_LOGIN_PASSWORD, DEMO_LOGIN_ROWS } from "@/lib/mock-data";
import { api } from "@/lib/api";
import type { Role } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AgentRegistrationForm } from "@/components/auth/agent-registration-form";
import { isDemoLoginEnabled, isDemoMode } from "@/lib/runtime-mode";

type Mode = "login" | "forgot" | "reset" | "register";

const ROLE_CARDS: { role: Role; icon: React.ElementType; gradient: string }[] = [
  { role: "super_admin", icon: Shield, gradient: "from-blue-600 to-indigo-700" },
  { role: "agency_admin", icon: Building2, gradient: "from-blue-500 to-teal-500" },
  { role: "branch_manager", icon: UserCog, gradient: "from-teal-500 to-cyan-600" },
  { role: "employee", icon: User, gradient: "from-sky-500 to-blue-600" },
  { role: "accountant", icon: TrendingUp, gradient: "from-teal-600 to-emerald-600" },
  { role: "sales_executive", icon: Sparkles, gradient: "from-violet-500 to-fuchsia-600" },
  { role: "product_executive", icon: Globe, gradient: "from-cyan-500 to-blue-600" },
];

const HIGHLIGHTS = [
  { icon: Plane, label: "1M+ Flights Booked" },
  { icon: Hotel, label: "50K+ Hotels" },
  { icon: Zap, label: "Real-time Inventory" },
  { icon: Palmtree, label: "Custom Holiday Packages" },
];

export function LoginScreen() {
  const loginWithApi = useAuthStore((s) => s.loginWithApi);
  const hydrateFromApi = useDemoDataStore((s) => s.hydrateFromApi);
  const { toast } = useToast();
  const showDemoLogin = isDemoLoginEnabled();
  const allowPublicRegister =
    process.env.NEXT_PUBLIC_ALLOW_PUBLIC_REGISTER === "true" || isDemoMode();
  const [selectedRole, setSelectedRole] = useState<Role>("agency_admin");
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(showDemoLogin ? ROLE_USERS.agency_admin.email : "");
  const [password, setPassword] = useState(showDemoLogin ? DEMO_LOGIN_PASSWORD : "");
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showCreds, setShowCreds] = useState(false);

  const selectRole = (role: Role) => {
    setSelectedRole(role);
    if (!showDemoLogin) return;
    setEmail(ROLE_USERS[role].email);
    setPassword(DEMO_LOGIN_PASSWORD);
  };

  const handleLogin = async () => {
    setLoading(true);
    const result = await loginWithApi(email, password);
    setLoading(false);
    if (!result.ok) {
      const err = result.error || "Invalid email or password";
      const rateLimited = /too many/i.test(err);
      toast({
        title: rateLimited ? "Too many attempts" : "Sign in failed",
        description: rateLimited
          ? "Login is temporarily rate-limited. Wait a minute, or restart the API to clear the counter."
          : err,
        variant: "destructive",
      });
      return;
    }
    const user = useAuthStore.getState().user;
    await hydrateFromApi(user?.agencyId);
    toast({ title: "Welcome back!", description: `Signed in as ${user ? ROLE_LABELS[user.role] : ""}` });
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setForgotLoading(true);
    try {
      const res = await api.forgotPassword(forgotEmail.trim());
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setMode("reset");
        toast({
          title: "Reset code ready (dev)",
          description: "Enter a new password below. The code was also returned for local testing.",
        });
        return;
      }
      if (res.emailed) {
        toast({
          title: "Check your email",
          description: "If an account exists, a reset code was sent. It expires in 1 hour.",
        });
        setMode("reset");
      } else {
        toast({
          title: "Request received",
          description: res.message || "If an account exists, follow the reset instructions when they arrive.",
        });
        setMode("login");
        setForgotEmail("");
      }
    } catch {
      toast({ title: "Couldn't start reset", description: "Please try again.", variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!forgotEmail.trim() || !resetToken.trim() || newPassword.length < 8) {
      toast({
        title: "Missing fields",
        description: "Email, reset code, and a new password (8+ chars) are required.",
        variant: "destructive",
      });
      return;
    }
    setResetLoading(true);
    try {
      await api.resetPassword(forgotEmail.trim(), resetToken.trim(), newPassword);
      toast({ title: "Password updated", description: "You can sign in with your new password." });
      setMode("login");
      setForgotEmail("");
      setResetToken("");
      setNewPassword("");
    } catch (e) {
      toast({
        title: "Reset failed",
        description: e instanceof Error ? e.message : "Invalid or expired reset code.",
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  if (mode === "register" && allowPublicRegister) {
    return <AgentRegistrationForm onLogin={() => setMode("login")} />;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left hero panel */}
      <div className="lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-brand-blue via-primary to-brand-teal text-white p-8 lg:p-12 flex flex-col justify-between">
        <div className="absolute inset-0 hero-pattern opacity-40" />
        <div className="absolute top-20 -right-20 w-72 h-72 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute bottom-10 -left-10 w-80 h-80 rounded-full bg-brand-teal/30 blur-3xl" />

        {/* Floating plane animation */}
        <motion.div
          className="absolute top-1/3 right-12 opacity-20"
          animate={{ x: [0, 30, 0], y: [0, -20, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Plane className="w-40 h-40" />
        </motion.div>

        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-2">
            <img
              src="/trevio-logo.png"
              alt="Trevio Global"
              className="h-10 w-auto drop-shadow-md"
            />
          </div>
          <p className="text-xs text-white/70 mt-1">Enterprise Travel SaaS Platform</p>
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              All-in-one travel booking solution
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold leading-tight mb-4">
              Book the world,<br />run your agency.
            </h2>
            <p className="text-teal-100 text-base leading-relaxed">
              Flights, hotels, and holidays — with multi-agency RBAC,
              CRM, payments, and commission engine. Everything in one powerful dashboard.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 gap-3">
            {HIGHLIGHTS.map((h, i) => (
              <motion.div
                key={h.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15"
              >
                <h.icon className="w-4 h-4 text-white shrink-0" />
                <span className="text-sm font-medium">{h.label}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-sm text-white/80">
          <div>
            <div className="text-2xl font-bold text-white">6</div>
            <div className="text-xs">Role Types</div>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div>
            <div className="text-2xl font-bold text-white">28+</div>
            <div className="text-xs">Modules</div>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div>
            <div className="text-2xl font-bold text-white">99.9%</div>
            <div className="text-xs">Uptime</div>
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {mode === "login" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold">Sign in to your account</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {showDemoLogin
                        ? "Select a demo role to autofill credentials, or enter your own email and password."
                        : "Enter your agency email and password to continue."}
                    </p>
                  </div>

                  {showDemoLogin && (
                  <>
                  <div className="grid grid-cols-4 gap-2">
                    {ROLE_CARDS.map((rc) => {
                      const active = selectedRole === rc.role;
                      return (
                        <button
                          key={rc.role}
                          onClick={() => selectRole(rc.role)}
                          className={cn(
                            "relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                            active
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border hover:border-primary/40 hover:bg-muted/50"
                          )}
                        >
                          <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center text-white", rc.gradient)}>
                            <rc.icon className="w-4.5 h-4.5" />
                          </div>
                          <span className="text-[11px] font-medium text-center leading-tight">
                            {ROLE_LABELS[rc.role].split(" ")[0]}
                          </span>
                          {active && (
                            <CheckCircle2 className="absolute -top-1.5 -right-1.5 w-4 h-4 text-primary bg-background rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-lg bg-muted/60 border border-border">
                    <p className="text-xs font-medium">{ROLE_LABELS[selectedRole]}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ROLE_DESCRIPTIONS[selectedRole]}</p>
                  </div>
                  </>
                  )}

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          className="pl-9 h-11"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@agency.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Password</Label>
                        <button onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline">
                          Forgot?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          className="pl-9 pr-9 h-11"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full h-11 text-sm font-semibold"
                    size="lg"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {showDemoLogin ? `Sign in as ${ROLE_LABELS[selectedRole]}` : "Sign in"}
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    )}
                  </Button>

                  {showDemoLogin && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowCreds((v) => !v)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {showCreds ? "Hide demo logins" : "Show all demo logins"}
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        Shared password: <span className="font-mono text-foreground">{DEMO_LOGIN_PASSWORD}</span>
                      </p>
                      {showCreds && (
                        <div className="max-h-40 overflow-y-auto space-y-1.5 scroll-thin">
                          {DEMO_LOGIN_ROWS.map((row) => (
                            <button
                              key={row.email}
                              type="button"
                              className="w-full text-left rounded-md border border-border/60 bg-background/80 px-2 py-1.5 hover:border-primary/40"
                              onClick={() => {
                                setEmail(row.email);
                                setPassword(row.password);
                              }}
                            >
                              <p className="text-[11px] font-medium">{row.role}</p>
                              <p className="text-[10px] font-mono text-muted-foreground">{row.email}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {allowPublicRegister && (
                  <p className="text-center text-sm text-muted-foreground">
                    New travel agent?{" "}
                    <button type="button" onClick={() => setMode("register")} className="text-primary font-semibold hover:underline">
                      Register with Trevio Global
                    </button>
                  </p>
                  )}
                </div>
              )}

              {mode === "forgot" && (
                <div className="space-y-6">
                  <button onClick={() => setMode("login")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                    ← Back to login
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold">Reset Password</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Enter your email. We&apos;ll send a one-time reset code (valid 1 hour). Your password stays unchanged until you complete the next step.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        className="pl-9 h-11"
                        placeholder="you@agency.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                      />
                    </div>
                  </div>
                  <Button onClick={handleForgotPassword} disabled={forgotLoading} className="w-full h-11">
                    {forgotLoading ? "Sending..." : "Send reset code"}
                  </Button>
                </div>
              )}

              {mode === "reset" && (
                <div className="space-y-6">
                  <button onClick={() => setMode("forgot")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                    ← Back
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold">Set new password</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Paste the reset code from your email (or the code shown in development) and choose a new password.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reset code</Label>
                    <Input value={resetToken} onChange={(e) => setResetToken(e.target.value)} className="h-11 font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>New password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="password"
                        className="pl-9 h-11"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={handleResetPassword} disabled={resetLoading} className="w-full h-11">
                    {resetLoading ? "Updating..." : "Update password"}
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <p className="text-xs text-center text-muted-foreground mt-8">
            {showDemoLogin
              ? "Demo platform · Select any role to explore · No real credentials needed"
              : "Secure sign-in · Authorized agency staff only"}
          </p>
        </div>
      </div>
    </div>
  );
}
