"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function formatINR(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatFullINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatPrettyDate(iso: string, empty = "Select date"): string {
  if (!iso) return empty;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return empty;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}


const STATUS_STYLES: Record<string, string> = {
  Confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Ticketed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Completed: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Partial: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  Cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  Refunded: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  Failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Trial: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  Suspended: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  "On Leave": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Inactive: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  New: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  Qualified: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
  "Follow-up": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  "Quotation Sent": "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  Negotiation: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  Won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Lost: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  Draft: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  Published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Archived: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  Quoted: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  "Internal Review": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Viewed: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
  Booked: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  Sent: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  Accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Rejected: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  Expired: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  Valid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Expired_visa: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  None: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  "To Do": "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  "In Progress": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  Review: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Platinum: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  Gold: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Silver: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  Starter: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  Growth: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  Enterprise: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  Low: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  Medium: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  High: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Urgent: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] || "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-medium border-0 text-helper h-5 px-2 rounded-md tracking-wide",
        style,
        className
      )}
    >
      {status}
    </Badge>
  );
}

export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("page-shell animate-slide-up", className)}>{children}</div>;
}

/** Amber badge for UI shells / partial mock data (not live APIs). */
export function DemoDataBadge({
  label = "Demo data",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-amber-300 text-amber-800 dark:border-amber-500/40 dark:text-amber-300",
        className
      )}
    >
      {label}
    </Badge>
  );
}

export function DemoModuleBanner({
  children = "Demo module — sample UI only. Not connected to live APIs.",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6">
      <div className="min-w-0 space-y-1.5">
        {eyebrow && (
          <p className="text-helper font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl sm:text-[length:var(--text-page-title)] font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && (
          <p className="hidden sm:block text-body text-muted-foreground leading-relaxed max-w-2xl">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-section-title text-foreground">{title}</h2>
        {description && <p className="text-caption text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  change,
  trend,
  color,
  subtitle,
  index = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  change?: number;
  trend?: "up" | "down";
  color: string;
  subtitle?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="h-full"
    >
      <Card className="group relative h-full overflow-hidden border-border shadow-[var(--shadow-card)] hover:border-primary/20 hover:shadow-sm transition-enterprise">
        <div className="absolute inset-y-0 left-0 w-[3px] bg-brand-gradient opacity-0 group-hover:opacity-100 transition-enterprise" aria-hidden />
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", color)}>
              <Icon className="w-4 h-4" aria-hidden />
            </div>
            {change !== undefined && trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-helper font-semibold tabular-nums",
                  trend === "up"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                )}
              >
                {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(change)}%
              </span>
            )}
          </div>
          <p className="text-[1.375rem] font-semibold mt-4 tracking-tight tabular-nums leading-none text-foreground">{value}</p>
          <p className="text-label text-foreground/80 mt-2.5">{label}</p>
          {subtitle && <p className="text-helper text-muted-foreground mt-1">{subtitle}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function BrandHero({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-brand-gradient text-white",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.16),transparent_55%)]" aria-hidden />
      <div className="absolute -bottom-16 -left-10 w-48 h-48 rounded-full bg-brand-teal/25 blur-3xl" aria-hidden />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6 p-6 lg:p-8">
        <div className="max-w-xl space-y-2">
          {eyebrow && (
            <p className="text-white/75 text-helper font-semibold uppercase tracking-[0.12em]">{eyebrow}</p>
          )}
          <h2 className="text-page-title text-white">{title}</h2>
          {subtitle && <p className="text-white/85 text-body leading-relaxed">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

export function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_GRADIENTS = [
  "from-brand-blue to-brand-teal",
  "from-teal-400 to-emerald-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500",
  "from-cyan-400 to-sky-500",
];

export function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
