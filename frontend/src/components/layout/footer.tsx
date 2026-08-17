"use client";

import { useAppStore } from "@/store/app-store";

export function Footer() {
  const setView = useAppStore((s) => s.setView);

  return (
    <footer className="mt-auto hidden lg:block border-t border-border bg-muted/20 px-4 md:px-6 xl:px-8 py-4">
      <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-caption text-muted-foreground">
        <div className="flex items-center gap-2">
          <img src="/trevio-logo.png" alt="Trevio Global" className="h-5 w-auto" />
          <span>© 2026 Trevio Global · All rights reserved</span>
        </div>
        <div className="flex items-center gap-4">
          <button type="button" className="hover:text-foreground transition-colors" onClick={() => setView("settings")}>
            Privacy
          </button>
          <button type="button" className="hover:text-foreground transition-colors" onClick={() => setView("settings")}>
            Terms
          </button>
          <button type="button" className="hover:text-foreground transition-colors" onClick={() => setView("support")}>
            Support
          </button>
          <span>Powered by Trevio Global Platform</span>
        </div>
      </div>
    </footer>
  );
}
