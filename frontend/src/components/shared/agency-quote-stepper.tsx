"use client";

import { Button } from "@/components/ui/button";
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

/** Booking-detail style soft pill tabs (blue active). */
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
      <div className="flex flex-wrap gap-1 border-b pb-2 min-w-max">
        {AGENCY_QUOTE_STEPS.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          const clickable = Boolean(onSelect) && index <= activeIndex;
          return (
            <Button
              key={step.id}
              type="button"
              size="sm"
              variant={active ? "default" : "ghost"}
              disabled={!clickable}
              onClick={() => onSelect?.(index)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium",
                !active && done && "text-foreground",
                !clickable && !active && "opacity-60",
              )}
            >
              <span className="sm:hidden">{index + 1}. {step.label}</span>
              <span className="hidden sm:inline">{step.label}</span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
