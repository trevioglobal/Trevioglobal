"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plane, Hotel, Zap, Palmtree, Shield, ArrowRight, Mail, Lock,
  Eye, EyeOff, Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/store/app-store";
import { useDemoDataStore } from "@/store/demo-data-store";
import { ROLE_LABELS } from "@/lib/nav-config";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { AgentRegistrationForm } from "@/components/auth/agent-registration-form";

type Mode = "login" | "forgot" | "reset" | "register";

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
  const allowPublicRegister = process.env.NEXT_PUBLIC_ALLOW_PUBLIC_REGISTER === "true";
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tpp-remember-email");
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      toast({ title: "Enter email and password", variant: "destructive" });
      return;
    }
    setLoading(true);
    const result = await loginWithApi(email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      const err = result.error || "Invalid email or password";
      const rateLimited = /too many/i.test(err);
      toast({
        title: rateLimited ? "Too many attempts" : "Sign in failed",
        description: rateLimited
          ? "Login is temporarily rate-limited. Wait a minute, then try again."
          : err,
        variant: "destructive",
      });
      return;
    }
    try {
      if (rememberMe) localStorage.setItem("tpp-remember-email", email.trim());
      else localStorage.removeItem("tpp-remember-email");
    } catch {
      /* ignore */
    }
    const user = useAuthStore.getState().user;
    await hydrateFromApi(user?.agencyId);
    toast({ title: "Welcome back", description: user ? ROLE_LABELS[user.role] : undefined });
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
          title: "Reset code ready",
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
      <div className="lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-brand-blue via-primary to-brand-teal text-white p-8 lg:p-12 flex flex-col justify-between min-h-[42vh] lg:min-h-screen">
        <div className="absolute inset-0 hero-pattern opacity-40" />
        <div className="absolute top-20 -right-20 w-72 h-72 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute bottom-10 -left-10 w-80 h-80 rounded-full bg-brand-teal/30 blur-3xl" />

        <motion.div
          className="absolute top-1/3 right-12 opacity-20"
          animate={{ x: [0, 30, 0], y: [0, -20, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Plane className="w-40 h-40" />
        </motion.div>

        <div className="relative z-10">
          <img
            src="/trevio-logo.png"
            alt="Trevio Global"
            className="h-10 w-auto drop-shadow-md"
          />
          <p className="text-xs text-white/70 mt-2">Enterprise Travel SaaS Platform</p>
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

      <div className="relative lg:w-1/2 flex items-center justify-center p-6 lg:p-16 overflow-y-auto bg-[#f4f8fd]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-sky-200/50 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 h-80 w-80 rounded-full bg-brand-teal/20 blur-3xl" />
          <div className="absolute top-1/3 -right-8 h-40 w-40 rounded-full bg-brand-blue/10 blur-2xl" />
          <svg className="absolute top-10 left-8 h-24 w-24 text-sky-300/70" viewBox="0 0 80 80" fill="none">
            {Array.from({ length: 5 }).map((_, row) =>
              Array.from({ length: 5 }).map((_, col) => (
                <circle key={`${row}-${col}`} cx={8 + col * 16} cy={8 + row * 16} r="1.6" fill="currentColor" />
              )),
            )}
          </svg>
          <svg className="absolute bottom-16 right-10 h-28 w-28 text-sky-300/60" viewBox="0 0 80 80" fill="none">
            {Array.from({ length: 4 }).map((_, row) =>
              Array.from({ length: 4 }).map((_, col) => (
                <circle key={`${row}-${col}`} cx={10 + col * 18} cy={10 + row * 18} r="1.6" fill="currentColor" />
              )),
            )}
          </svg>
          <svg className="absolute top-8 right-16 h-32 w-40 text-sky-400/40" viewBox="0 0 160 120" fill="none">
            <path d="M8 88 C 48 18, 112 18, 152 72" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 7" strokeLinecap="round" />
          </svg>
          <svg className="absolute bottom-10 left-12 h-24 w-36 text-sky-400/35" viewBox="0 0 160 90" fill="none">
            <path d="M6 18 C 50 78, 110 78, 154 28" stroke="currentColor" strokeDasharray="5 7" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <div className="relative z-10 w-full max-w-[420px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="rounded-[1.75rem] bg-white p-8 sm:p-10 shadow-[0_24px_60px_-20px_rgba(15,40,80,0.18)]"
            >
              {mode === "login" && (
                <div className="space-y-6">
                  <div className="lg:hidden mb-2 flex justify-center">
                    <img src="/trevio-logo.png" alt="Trevio Global" className="h-8 w-auto" />
                  </div>
                  <div className="text-center space-y-3">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue to-brand-teal shadow-lg shadow-brand-blue/25">
                      <Plane className="h-6 w-6 text-white -rotate-45 translate-x-px" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-[1.65rem] font-bold tracking-tight text-slate-900">Welcome back</h2>
                      <p className="text-sm text-slate-500">
                        Sign in with your Trevio Global account.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email" className="text-sm font-semibold text-slate-800">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <Input
                          id="login-email"
                          type="email"
                          autoComplete="email"
                          className="pl-10 h-12 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-brand-blue/30"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                          placeholder="you@agency.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password" className="text-sm font-semibold text-slate-800">Password</Label>
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-xs font-medium text-brand-blue hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          className="pl-10 pr-10 h-12 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-brand-blue/30"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                          placeholder="Enter your password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label htmlFor="remember-me" className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                      />
                      <span className="text-sm text-slate-600">Remember me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-sm font-medium text-brand-blue hover:underline"
                    >
                      Need help?
                    </button>
                  </div>

                  <Button
                    onClick={handleLogin}
                    disabled={loading}
                    className="relative w-full h-12 overflow-hidden text-sm font-semibold rounded-xl bg-gradient-to-r from-brand-blue to-[#3b82f6] text-white shadow-md shadow-brand-blue/25 hover:opacity-95"
                    size="lg"
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                    {loading ? (
                      <span className="relative flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Signing in…
                      </span>
                    ) : (
                      <span className="relative flex items-center gap-2">
                        Sign in
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    )}
                  </Button>

                  {allowPublicRegister && (
                    <p className="text-center text-sm text-slate-500">
                      New travel agent?{" "}
                      <button type="button" onClick={() => setMode("register")} className="text-brand-blue font-semibold hover:underline">
                        Register with Trevio Global
                      </button>
                    </p>
                  )}
                </div>
              )}

              {mode === "forgot" && (
                <div className="space-y-6">
                  <button type="button" onClick={() => setMode("login")} className="text-sm text-muted-foreground hover:text-foreground">
                    ← Back to sign in
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Reset password</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Enter your email. If an account exists, we&apos;ll send a one-time reset code (valid 1 hour).
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        className="pl-10 h-11 rounded-xl"
                        placeholder="you@agency.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                      />
                    </div>
                  </div>
                  <Button onClick={handleForgotPassword} disabled={forgotLoading} className="w-full h-11 rounded-xl">
                    {forgotLoading ? "Sending…" : "Send reset code"}
                  </Button>
                </div>
              )}

              {mode === "reset" && (
                <div className="space-y-6">
                  <button type="button" onClick={() => setMode("forgot")} className="text-sm text-muted-foreground hover:text-foreground">
                    ← Back
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Set new password</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Paste the reset code from your email and choose a new password.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reset code</Label>
                    <Input value={resetToken} onChange={(e) => setResetToken(e.target.value)} className="h-11 font-mono text-xs rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>New password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="password"
                        className="pl-10 h-11 rounded-xl"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={handleResetPassword} disabled={resetLoading} className="w-full h-11 rounded-xl">
                    {resetLoading ? "Updating…" : "Update password"}
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <p className="text-xs text-center text-slate-400 mt-7 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Secure sign-in • Authorized staff only
          </p>
        </div>
      </div>
    </div>
  );
}
