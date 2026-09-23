"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CatalogToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** When false, renders without bordered surface */
  bordered?: boolean;
}

export function CatalogToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  actions,
  className,
  bordered = true,
}: CatalogToolbarProps) {
  const inner = (
    <div className={cn("flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between", className)}>
      <div className="flex flex-1 flex-col sm:flex-row sm:items-center gap-2 min-w-0">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden />
          <Input
            className="pl-9 h-9 bg-background"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={searchPlaceholder}
          />
        </div>
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );

  if (!bordered) return inner;

  return (
    <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)] p-4 md:p-5">
      {inner}
    </div>
  );
}
