"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Search,
  Bell,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  UserCircle,
  Settings,
  MessageSquare,
  Menu,
  PanelLeft,
} from "lucide-react";
import { useAppStore, useAuthStore } from "@/store/app-store";
import { ROLE_LABELS } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { avatarGradient, initials } from "@/components/shared/ui-helpers";
import { useDemoDataStore } from "@/store/demo-data-store";

export function Topbar() {
  const { toggleSidebar, toggleSidebarCollapsed, setView, activeView } = useAppStore();
  const { user, logout } = useAuthStore();
  const notifications = useDemoDataStore((s) => s.notifications);
  const markNotificationRead = useDemoDataStore((s) => s.markNotificationRead);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!user) return null;

  const unread = notifications.filter((n) => !n.read).length;
  const isDark = mounted && (resolvedTheme === "dark" || theme === "dark");
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  const viewLabel = activeView
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] bg-background/90 backdrop-blur-md border-b border-border">
        <div className="flex items-center h-14 px-3 sm:px-4 md:px-6 xl:px-8 gap-2 sm:gap-3 max-w-[1600px] w-full mx-auto">
          <button
            type="button"
            onClick={toggleSidebar}
            className="lg:hidden shrink-0 text-muted-foreground hover:text-foreground p-1.5 rounded-md transition-enterprise"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex h-9 w-9 text-muted-foreground"
                onClick={toggleSidebarCollapsed}
                aria-label="Toggle sidebar"
              >
                <PanelLeft className="w-[18px] h-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle sidebar</TooltipContent>
          </Tooltip>

          <div className="hidden md:flex items-center min-w-0 shrink">
            <p className="text-caption text-muted-foreground truncate">
              <span className="text-foreground/70">Workspace</span>
              <span className="mx-1.5 text-border">/</span>
              <span className="font-medium text-foreground">{viewLabel}</span>
            </p>
          </div>

          <div
            className="relative w-full max-w-sm min-w-0 hidden sm:block cursor-pointer"
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            role="button"
            tabIndex={0}
            aria-label="Open command palette"
            onKeyDown={(e) => e.key === "Enter" && window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden />
            <Input
              readOnly
              placeholder="Search or jump to…"
              className="pl-9 h-9 bg-muted/50 border-border/70 focus-visible:ring-1 focus-visible:ring-primary cursor-pointer"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-helper text-muted-foreground border border-border rounded px-1.5 py-0.5 hidden lg:block pointer-events-none">
              ⌘K
            </kbd>
          </div>

          <div className="flex-1 min-w-2" aria-hidden />

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex h-9 w-9 text-muted-foreground"
                  onClick={() => setView("support")}
                  aria-label="Messages"
                >
                  <MessageSquare className="w-[18px] h-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Messages</TooltipContent>
            </Tooltip>

            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 relative text-muted-foreground"
                      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                    >
                      <Bell className="w-[18px] h-[18px]" />
                      {unread > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive pulse-dot" aria-hidden />
                      )}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-[min(360px,calc(100vw-1.5rem))] p-0" align="end" sideOffset={8}>
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-card-title">Notifications</p>
                    <p className="text-caption text-muted-foreground mt-0.5">{unread} unread</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-caption h-8" onClick={() => setView("notifications")}>
                    View all
                  </Button>
                </div>
                <ScrollArea className="h-[360px] scroll-thin">
                  <div className="divide-y divide-border">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          "p-4 hover:bg-muted/40 cursor-pointer flex gap-3 transition-enterprise",
                          !n.read && "bg-primary/[0.04]"
                        )}
                        onClick={() => markNotificationRead(n.id)}
                      >
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full mt-1.5 shrink-0",
                            n.priority === "high" ? "bg-destructive" : n.priority === "medium" ? "bg-warning" : "bg-muted-foreground/40"
                          )}
                          aria-hidden
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{n.title}</p>
                          <p className="text-caption text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                          <p className="text-helper text-muted-foreground mt-1.5">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground"
                  onClick={toggleTheme}
                  aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {mounted && isDark ? (
                    <Sun className="w-[18px] h-[18px]" />
                  ) : (
                    <Moon className="w-[18px] h-[18px]" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isDark ? "Light mode" : "Dark mode"}</TooltipContent>
            </Tooltip>

            <div className="hidden sm:block w-px h-6 bg-border mx-1.5" aria-hidden />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg hover:bg-muted transition-enterprise focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label="User menu"
                >
                  <Avatar className="w-8 h-8 border border-border">
                    <AvatarFallback
                      className={cn("bg-gradient-to-br text-white text-xs font-semibold", avatarGradient(user.name))}
                    >
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-caption font-semibold leading-tight">{user.name}</p>
                    <p className="text-helper text-muted-foreground leading-tight">{ROLE_LABELS[user.role]}</p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden md:block" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{user.name}</span>
                    <span className="text-caption text-muted-foreground font-normal">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView("settings")}>
                  <UserCircle className="w-4 h-4 mr-2" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("settings")}>
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
