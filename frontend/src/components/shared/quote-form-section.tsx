"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Soft booking-style section — matches BMS Overview cards.
 * No heavy accent strips; plain rounded-lg border + uppercase title.
 */

export type QuoteFormSectionAccent = "teal" | "sky" | "amber" | "slate";

export type QuoteFormSectionProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  accent?: QuoteFormSectionAccent;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  id?: string;
};

export function QuoteFormSection({
  title,
  description,
  children,
  className,
  actions,
  id,
}: QuoteFormSectionProps) {
  const titleId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("rounded-lg border bg-card p-3 sm:p-4 space-y-3", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={titleId}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Same visual as booking SummaryCell */
export function QuoteMetaChip({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2 min-w-0",
        emphasize ? "bg-teal-50/80 border-teal-100" : "bg-muted/20",
      )}
    >
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          "font-medium mt-0.5 break-words text-sm",
          emphasize && "tabular-nums text-teal-900",
        )}
      >
        {value || "—"}
      </p>
    </div>
  );
}
