"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Download, Search, LogIn, Plane, CreditCard, UserCog,
  Server, FileEdit, KeyRound, AlertTriangle, CheckCircle2, Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { ApiAuditLog } from "@/lib/api";
import { PageShell, PageHeader, SectionHeader, MetricCard, initials, avatarGradient } from "@/components/shared/ui-helpers";
import { cn } from "@/lib/utils";

type LogType = "login" | "booking" | "payment" | "api" | "employee" | "system";

type LogEntry = {
  id: string;
  timestamp: string;
  date: string;
  user: string;
  action: string;
  module: string;
  type: LogType;
  ip: string;
  details: string;
  status: "success" | "warning" | "error";
};

function mapAuditLog(l: ApiAuditLog): LogEntry {
  const created = new Date(l.createdAt);
  const date = l.createdAt.slice(0, 10);
  const moduleLower = l.module.toLowerCase();
  let type: LogType = "system";
  if (moduleLower.includes("auth")) type = "login";
  else if (moduleLower.includes("book")) type = "booking";
  else if (moduleLower.includes("pay")) type = "payment";
  else if (moduleLower.includes("api")) type = "api";
  else if (moduleLower.includes("employ")) type = "employee";

  const actionLower = l.action.toLowerCase();
  let status: LogEntry["status"] = "success";
  if (actionLower.includes("fail") || actionLower.includes("error")) status = "error";
  else if (actionLower.includes("warn") || actionLower.includes("modif")) status = "warning";

  return {
    id: l.id,
    timestamp: created.toLocaleString("en-IN", { hour12: false }).replace(",", ""),
    date,
    user: l.userName,
    action: l.action,
    module: l.module,
    type,
    ip: l.ip || "—",
    details: l.details || "",
    status,
  };
}

const TYPE_META: Record<LogType, { label: string; icon: React.ElementType; color: string; dot: string }> = {
  login: { label: "Login History", icon: LogIn, color: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400", dot: "bg-teal-500" },
  booking: { label: "Booking Changes", icon: Plane, color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", dot: "bg-amber-500" },
  payment: { label: "Payment Logs", icon: CreditCard, color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400", dot: "bg-emerald-500" },
  api: { label: "API Logs", icon: Server, color: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400", dot: "bg-violet-500" },
  employee: { label: "Employee Activity", icon: UserCog, color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400", dot: "bg-cyan-500" },
  system: { label: "System Events", icon: Settings, color: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400", dot: "bg-rose-500" },
};

const STATUS_META: Record<string, { color: string; icon: React.ElementType }> = {
  success: { color: "text-emerald-600", icon: CheckCircle2 },
  warning: { color: "text-amber-600", icon: AlertTriangle },
  error: { color: "text-rose-600", icon: AlertTriangle },
};

const FILTERS = ["all", "login", "booking", "payment", "api", "employee", "system"] as const;

export function AuditLogsView() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("all");

  useEffect(() => {
    api.getAuditLogs()
      .then((res) => {
        setLogs((res.logs ?? []).map(mapAuditLog));
      })
      .catch(() => setLogs([]));
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filter !== "all" && l.type !== filter) return false;
      if (dateRange === "today" && l.date !== new Date().toISOString().slice(0, 10)) return false;
      if (dateRange === "yesterday") {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        if (l.date !== y.toISOString().slice(0, 10)) return false;
      }
      if (search && !`${l.user} ${l.action} ${l.module} ${l.details} ${l.ip}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, filter, search, dateRange]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: logs.length };
    FILTERS.slice(1).forEach((f) => { c[f] = logs.filter((l) => l.type === f).length; });
    return c;
  }, [logs]);

  const handleExport = () => {
    toast({
      title: "Export started",
      description: `${filtered.length} log entries are being exported to CSV.`,
    });
  };

  const successCount = logs.filter((l) => l.status === "success").length;
  const warningCount = logs.filter((l) => l.status === "warning").length;
  const errorCount = logs.filter((l) => l.status === "error").length;

  return (
    <PageShell>
      <PageHeader
        title="Audit Logs"
        subtitle="Track every action across your travel platform"
        action={
          <Button onClick={handleExport} className="bg-gradient-to-r from-brand-blue to-brand-teal hover:opacity-90">
            <Download className="w-4 h-4 mr-1.5" /> Export Logs
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard icon={FileEdit} label="Total Events" value={String(logs.length)} color="bg-sky-100 text-primary dark:bg-sky-500/15 dark:text-sky-400" index={0} />
        <MetricCard icon={CheckCircle2} label="Successful" value={String(successCount)} color="bg-teal-100 text-brand-teal dark:bg-teal-500/15 dark:text-teal-400" index={1} />
        <MetricCard icon={AlertTriangle} label="Warnings" value={String(warningCount)} color="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" index={2} />
        <MetricCard icon={AlertTriangle} label="Errors" value={String(errorCount)} color="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" index={3} />
      </div>

      {/* Filter tabs */}
      <Card>
        <CardContent className="p-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {FILTERS.map((f) => {
              const meta = f === "all" ? null : TYPE_META[f as LogType];
              const Icon = meta?.icon || FileEdit;
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                    isActive ? "bg-gradient-to-r from-brand-blue to-brand-teal text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {f === "all" ? "All" : meta?.label || f}
                  <span className={cn(
                    "ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                    isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                  )}>{counts[f] || 0}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Search & date range */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by user, action, module, IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Activity Timeline</CardTitle>
          <CardDescription>{filtered.length} events · Newest first</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[640px] overflow-y-auto scroll-thin pr-2">
            <div className="relative">
              {/* vertical line */}
              <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-3">
                {filtered.map((log, i) => {
                  const meta = TYPE_META[log.type];
                  const Icon = meta.icon;
                  const status = STATUS_META[log.status];
                  const StatusIcon = status.icon;
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="relative pl-12"
                    >
                      {/* Node */}
                      <div className={cn(
                        "absolute left-0 top-1 w-9 h-9 rounded-full flex items-center justify-center ring-4 ring-background z-10",
                        meta.color,
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="rounded-lg border border-border p-3 hover:border-primary/40 hover:shadow-sm transition-all bg-card">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="w-6 h-6">
                              <AvatarFallback className={cn("bg-gradient-to-br text-white text-[9px] font-semibold", avatarGradient(log.user))}>
                                {log.user === "System" ? "SY" : initials(log.user)}
                              </AvatarFallback>
                            </Avatar>
                            <p className="text-sm font-medium truncate">{log.user}</p>
                            <StatusIcon className={cn("w-3.5 h-3.5 shrink-0", status.color)} />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">{log.timestamp}</span>
                        </div>
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{log.action}</span>
                          <span className="text-muted-foreground"> · </span>
                          <Badge variant="outline" className="text-[10px] mx-0.5">{log.module}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{log.details}</p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                            <Server className="w-2.5 h-2.5" />
                            <span>IP: {log.ip}</span>
                          </div>
                          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", meta.color)}>{meta.label}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="text-center py-16 pl-12">
                    <FileEdit className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No logs match your filters.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: LogIn, label: "Login Events", value: logs.filter((l) => l.type === "login").length, color: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400" },
          { icon: AlertTriangle, label: "Warnings", value: logs.filter((l) => l.status === "warning").length, color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
          { icon: AlertTriangle, label: "Errors", value: logs.filter((l) => l.status === "error").length, color: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" },
          { icon: KeyRound, label: "Unique Users", value: new Set(logs.map((l) => l.user)).size, color: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", s.color)}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-tight">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </PageShell>
  );
}
