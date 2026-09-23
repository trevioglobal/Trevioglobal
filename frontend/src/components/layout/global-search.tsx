"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Plus } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { getNavForUser } from "@/lib/nav-config";
import { filterSearchItems, SEARCH_ITEMS } from "@/lib/search-config";
import { useAuthStore } from "@/store/app-store";
import { QUICK_CREATE_ACTIONS, applyQuickCreateParams } from "@/lib/command-palette-config";
import { getRecentViews, pushRecentView } from "@/lib/recent-views";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { ViewKey } from "@/types";

const ENTITY_GROUPS = [
  { heading: "Sales & CRM", keys: ["crm", "customers", "trip-planner", "travel-proposals", "quotations"] as ViewKey[] },
  { heading: "Products", keys: ["destinations", "itinerary-places", "hotel-products", "transfer-products", "activity-packages", "packages", "product-approvals"] as ViewKey[] },
  { heading: "Settings", keys: ["branding", "quote-templates"] as ViewKey[] },
  { heading: "Bookings", keys: ["flights", "hotels", "bookings"] as ViewKey[] },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<ReturnType<typeof getRecentViews>>([]);
  const setView = useAppStore((s) => s.setView);
  const user = useAuthStore((s) => s.user);

  const allowedViews = useMemo(() => {
    if (!user) return [] as ViewKey[];
    return getNavForUser(user).flatMap((s) => s.items.map((i) => i.key));
  }, [user]);

  const results = useMemo(() => filterSearchItems(query, allowedViews), [query, allowedViews]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof results>();
    results.forEach((item) => {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    });
    return map;
  }, [results]);

  const entityResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return ENTITY_GROUPS.flatMap((g) =>
      g.keys
        .filter((k) => allowedViews.includes(k))
        .map((k) => SEARCH_ITEMS.find((s) => s.key === k))
        .filter(Boolean)
        .filter((item) =>
          item!.label.toLowerCase().includes(q) ||
          item!.keywords.some((kw) => kw.includes(q))
        )
        .map((item) => ({ ...item!, groupHeading: g.heading }))
    );
  }, [query, allowedViews]);

  const navigate = useCallback(
    (key: ViewKey, label?: string, params?: Record<string, string>) => {
      if (label) pushRecentView(key, label);
      setView(key);
      applyQuickCreateParams(key, params);
      setOpen(false);
      setQuery("");
      setRecent(getRecentViews());
    },
    [setView]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) setRecent(getRecentViews());
          return !v;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const quickCreates = useMemo(
    () => QUICK_CREATE_ACTIONS.filter((a) => allowedViews.includes(a.view)),
    [allowedViews]
  );

  if (!user) return null;

  const showBrowse = !query.trim();

  return (
    <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setRecent(getRecentViews()); }} title="Command palette" description="Navigate, search, and quick-create">
      <CommandInput placeholder="Search modules, customers, packages, proposals…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {showBrowse && recent.length > 0 && (
          <>
            <CommandGroup heading="Recently viewed">
              {recent.map((r) => {
                const item = SEARCH_ITEMS.find((s) => s.key === r.key);
                if (!item || !allowedViews.includes(r.key)) return null;
                return (
                  <CommandItem key={r.key} value={`recent ${item.label}`} onSelect={() => navigate(r.key, item.label)}>
                    <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {showBrowse && quickCreates.length > 0 && (
          <>
            <CommandGroup heading="Quick create">
              {quickCreates.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`create ${action.label} ${action.description}`}
                  onSelect={() => navigate(action.view, action.label, action.params)}
                >
                  <Plus className="w-4 h-4 mr-2 text-primary" />
                  <span>{action.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground truncate">{action.description}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {Array.from(grouped.entries()).map(([section, items], idx) => (
          <div key={section}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={section}>
              {items.map((item) => (
                <CommandItem
                  key={item.key}
                  value={`${item.label} ${item.keywords.join(" ")}`}
                  onSelect={() => navigate(item.key, item.label)}
                >
                  <item.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                  {item.label}
                  <CommandShortcut className="hidden sm:inline-flex">{item.section}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}

        {query.trim() && entityResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Matching entities">
              {entityResults.map((item) => (
                <CommandItem key={`entity-${item.key}`} value={`entity ${item.label}`} onSelect={() => navigate(item.key, item.label)}>
                  <item.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function useGlobalSearch() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
