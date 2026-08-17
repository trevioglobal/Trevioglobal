"use client";

import { useMemo, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CityOption {
  value: string;
  label: string;
  sublabel?: string;
}

function searchOptions(options: CityOption[], query: string, excludeValue?: string): CityOption[] {
  const pool = options.filter((o) => o.value !== excludeValue);
  const q = query.trim().toLowerCase();
  if (!q) return pool.slice(0, 8);
  return pool
    .filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel ? o.sublabel.toLowerCase().includes(q) : false)
    )
    .sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(q);
      const bStarts = b.label.toLowerCase().startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 8);
}

export function CitySearchField({
  icon: Icon, label, placeholder, value, options, onSelect, excludeValue,
  triggerClassName, valueClassName,
}: {
  icon: React.ElementType;
  label: string;
  placeholder?: string;
  value: string;
  options: CityOption[];
  onSelect: (value: string) => void;
  excludeValue?: string;
  triggerClassName?: string;
  valueClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((o) => o.value === value);
  const results = useMemo(() => searchOptions(options, query, excludeValue), [options, query, excludeValue]);

  function pick(v: string) {
    onSelect(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActiveIndex(0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full h-full text-left rounded-xl border border-border bg-background p-3 min-h-[76px] hover:border-primary/40 transition-colors touch-manipulation",
            triggerClassName
          )}
        >
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 pointer-events-none mb-1">
            <Icon className="w-3.5 h-3.5" /> {label}
          </Label>
          <p className={cn(
            "text-sm font-semibold leading-tight truncate",
            !selected && !value && "text-muted-foreground font-normal",
            valueClassName
          )}>
            {selected?.label ?? (value || placeholder?.replace("Search ", "Select ").replace("...", "") || "Select")}
          </p>
          {selected?.sublabel && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{selected.sublabel}</p>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[activeIndex]) pick(results[activeIndex].value);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder={placeholder ?? "Search city..."}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto scroll-thin py-1">
          {!query && (
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Popular
            </p>
          )}
          {results.length === 0 && (
            <p className="px-3 py-6 text-sm text-center text-muted-foreground">No matches for &quot;{query}&quot;</p>
          )}
          {results.map((o, idx) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                idx === activeIndex ? "bg-primary/10" : "hover:bg-muted/60"
              )}
            >
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{o.label}</p>
                {o.sublabel && <p className="text-[11px] text-muted-foreground truncate">{o.sublabel}</p>}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
