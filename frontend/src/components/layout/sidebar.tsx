"use client";

import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { useAppStore, useAuthStore } from "@/store/app-store";
import { getNavForUser } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function Sidebar() {
  const { activeView, setView, sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapsed } = useAppStore();
  const { user } = useAuthStore();

  if (!user) return null;
  const sections = getNavForUser(user);
  const collapsed = sidebarCollapsed;

  return (
    <TooltipProvider delayDuration={200}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-[2px] z-40 lg:hidden transition-enterprise"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 h-dvh shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-[width,transform] duration-200 ease-[var(--ease-standard)]",
          collapsed ? "lg:w-[var(--sidebar-width-collapsed)]" : "lg:w-[var(--sidebar-width)]",
          "w-[var(--sidebar-width)]",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        aria-label="Main navigation"
      >
        <div className={cn(
          "h-14 flex items-center border-b border-sidebar-border shrink-0",
          collapsed ? "px-3 justify-center" : "px-4 justify-between"
        )}>
          {!collapsed && (
            <img src="/trevio-logo.png" alt="Trevio Global" className="h-8 w-auto" />
          )}
          {collapsed && (
            <img src="/trevio-logo.png" alt="Trevio Global" className="h-7 w-7 object-contain" />
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-muted-foreground hover:text-foreground p-1 rounded-md transition-enterprise"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-4 scroll-thin">
          <div className="space-y-6 pb-4">
            {sections.map((section) => (
              <div key={section.title}>
                {!collapsed && (
                  <p className="px-3 mb-2 text-helper font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = activeView === item.key;
                    const btn = (
                      <button
                        type="button"
                        onClick={() => {
                          setView(item.key);
                          setSidebarOpen(false);
                        }}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-lg text-sm transition-enterprise relative group",
                          collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2",
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent"
                        )}
                      >
                        {active && (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
                            aria-hidden
                          />
                        )}
                        <item.icon
                          className={cn(
                            "w-[18px] h-[18px] shrink-0 transition-enterprise",
                            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                          )}
                          aria-hidden
                        />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left truncate">{item.label}</span>
                            {item.badge && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] h-4 px-1.5 bg-destructive text-white border-0"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </>
                        )}
                      </button>
                    );

                    if (collapsed) {
                      return (
                        <Tooltip key={item.key}>
                          <TooltipTrigger asChild>{btn}</TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8}>{item.label}</TooltipContent>
                        </Tooltip>
                      );
                    }
                    return <div key={item.key}>{btn}</div>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className={cn("border-t border-sidebar-border shrink-0 p-2", !collapsed && "p-3")}>
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full h-9 text-muted-foreground hidden lg:flex", collapsed && "px-0")}
            onClick={toggleSidebarCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : (
              <>
                <ChevronsLeft className="w-4 h-4 mr-2" />
                <span className="text-caption hidden sm:inline">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
