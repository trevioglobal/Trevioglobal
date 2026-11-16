"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/app-store";
import { LoginScreen, type AuthScreenMode } from "@/components/auth/login-screen";
import { AppShell } from "@/components/layout/app-shell";
import { PublicHomePage } from "@/components/public/public-home-page";
import { ThemeProvider } from "@/components/shared/theme-provider";

const AUTH_MODES = new Set<AuthScreenMode>(["login", "forgot", "reset", "register"]);

function parseAuthMode(value: string | null): AuthScreenMode | null {
  if (!value) return null;
  return AUTH_MODES.has(value as AuthScreenMode) ? (value as AuthScreenMode) : null;
}

function HomeContent() {
  const [hydrated, setHydrated] = useState(false);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = Boolean(token && user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authMode = parseAuthMode(searchParams.get("mode"));
  const allowPublicRegister = process.env.NEXT_PUBLIC_ALLOW_PUBLIC_REGISTER === "true";

  useEffect(() => {
    const finish = () => setHydrated(true);
    const unsub = useAuthStore.persist.onFinishHydration(finish);
    if (useAuthStore.persist.hasHydrated()) finish();
    return unsub;
  }, []);

  const goHome = () => {
    router.replace(pathname || "/");
  };

  const goAuth = (mode: AuthScreenMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", mode);
    router.push(`${pathname || "/"}?${params.toString()}`);
  };

  return (
    <ThemeProvider>
      {!hydrated ? (
        <div className="min-h-screen bg-background" aria-busy="true" />
      ) : isAuthenticated ? (
        <AppShell />
      ) : authMode ? (
        <LoginScreen
          initialMode={authMode}
          onBackToHome={goHome}
          onModeChange={(mode) => goAuth(mode)}
        />
      ) : (
        <PublicHomePage
          allowPublicRegister={allowPublicRegister}
          onLogin={() => goAuth("login")}
          onBecomePartner={() => goAuth("register")}
        />
      )}
    </ThemeProvider>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <HomeContent />
    </Suspense>
  );
}
