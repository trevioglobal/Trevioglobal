"use client";

import { LayoutDashboard, Plane, Hotel, Ticket, Menu } from "lucide-react";
import { useAppStore, useAuthStore } from "@/store/app-store";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { ViewKey } from "@/types";

const TABS: { key: ViewKey | "menu"; label: string; icon: typeof Plane; module?: "flights" | "hotels" | "bookings" }[] = [
  { key: "dashboard", label: "Home", icon: LayoutDashboard },
  { key: "flights", label: "Flights", icon: Plane, module: "flights" },
  { key: "hotels", label: "Stays", icon: Hotel, module: "hotels" },
  { key: "bookings", label: "Trips", icon: Ticket, module: "bookings" },
  { key: "menu", label: "Menu", icon: Menu },
];

export function MobileTabBar() {
  const { activeView, setView, toggleSidebar } = useAppStore();
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const tabs = TABS.filter((tab) => !tab.module || hasPermission(user, tab.module));
  const cols = Math.min(Math.max(tabs.length, 2), 5);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label="App navigation"
    >
      <div
        className="h-[3.75rem]"
        style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const active = tab.key !== "menu" && activeView === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.key === "menu") toggleSidebar();
                else setView(tab.key);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium min-h-[44px] touch-manipulation",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5", active && "stroke-[2.4px]")} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
