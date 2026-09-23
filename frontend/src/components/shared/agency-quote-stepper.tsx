"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const AGENCY_QUOTE_STEPS = [
  { id: "personal", label: "Personal", hint: "Guest & docs" },
  { id: "travel", label: "Travel", hint: "Cities & dates" },
  { id: "services", label: "Hotels & services", hint: "Stay · cars · tours" },
  { id: "itinerary", label: "Itinerary", hint: "Sightseeing picks" },
  { id: "pricing", label: "Pricing", hint: "Totals & edit" },
  { id: "preview", label: "Preview & send", hint: "PDF · share" },
] as const;

export type AgencyQuoteStepId = (typeof AGENCY_QUOTE_STEPS)[number]["id"];

export function AgencyQuoteStepper({
  activeIndex,
  onSelect,
  className,
}: {
  activeIndex: number;
  onSelect?: (index: number) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Quotation steps"
      className={cn("w-full overflow-x-auto", className)}
    >
      <ol className="flex min-w-max items-center gap-1 sm:gap-0 sm:justify-between">
        {AGENCY_QUOTE_STEPS.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          const clickable = Boolean(onSelect) && index <= activeIndex;
          return (
            <li key={step.id} className="flex items-center gap-1 sm:flex-1 sm:min-w-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect?.(index)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  clickable && "hover:bg-muted/60 cursor-pointer",
                  !clickable && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold border",
                    done && "bg-teal-600 border-teal-600 text-white",
                    active && "bg-teal-50 border-teal-600 text-teal-800",
                    !done && !active && "bg-background border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="min-w-0 hidden sm:block">
                  <span
                    className={cn(
                      "block text-xs font-semibold truncate",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground truncate">{step.hint}</span>
                </span>
              </button>
              {index < AGENCY_QUOTE_STEPS.length - 1 && (
                <span
                  className={cn(
                    "hidden sm:block h-px flex-1 mx-1 min-w-[12px]",
                    index < activeIndex ? "bg-teal-500" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
