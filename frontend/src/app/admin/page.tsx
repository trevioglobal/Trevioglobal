"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LoginScreen } from "@/components/auth/login-screen";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { useAuthStore } from "@/store/app-store";

const ADMIN_ROLES = new Set(["super_admin", "agency_admin"]);

export default function AdminPage() {
  const [hydrated, setHydrated] = useState(false);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = Boolean(token && user);
  const isAdmin = Boolean(user && ADMIN_ROLES.has(user.role));

  useEffect(() => {
    const finishHydration = () => setHydrated(true);
    const unsubscribe = useAuthStore.persist.onFinishHydration(finishHydration);
    if (useAuthStore.persist.hasHydrated()) finishHydration();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (hydrated && isAuthenticated && !isAdmin) logout();
  }, [hydrated, isAuthenticated, isAdmin, logout]);

  return (
    <ThemeProvider>
      {!hydrated ? (
        <div className="min-h-screen bg-background" aria-busy="true" />
      ) : isAuthenticated && isAdmin ? (
        <AppShell />
      ) : (
        <div className="relative">
          <LoginScreen onBackToHome={() => { window.location.href = "/"; }} />
          {isAuthenticated && !isAdmin ? (
            <div className="fixed inset-x-0 bottom-5 z-20 mx-auto flex w-fit items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg" role="alert">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              Admin access is restricted to authorized administrator accounts.
            </div>
          ) : null}
        </div>
      )}
    </ThemeProvider>
  );
}
