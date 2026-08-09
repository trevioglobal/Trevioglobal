"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Cpu, MemoryStick, Server, Activity, RefreshCw, Database, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { PageShell, PageHeader, BrandHero, SectionHeader, MetricCard } from "@/components/shared/ui-helpers";

type Metrics = {
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  db: { healthy: boolean; latencyMs: number };
  requestsPerMin: number;
  totalRequests: number;
  errorRate: string;
  windowStart: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

export function MonitoringView() {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getMonitoringMetrics();
      setMetrics(res as Metrics);
    } catch (e) {
      toast({
        title: "Could not load metrics",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const heapPct = metrics?.memory?.heapTotal
    ? Math.round((metrics.memory.heapUsed / metrics.memory.heapTotal) * 100)
    : 0;

  return (
    <PageShell>
      <PageHeader
        title="System Monitoring"
        subtitle="Live API process health — memory, database latency, and request volume from this server."
        action={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Refresh
          </Button>
        }
      />

      <BrandHero
        eyebrow="API process"
        title={metrics?.db?.healthy ? "Database reachable" : loading ? "Loading…" : "Database issue"}
        subtitle={
          metrics
            ? `Uptime ${formatUptime(metrics.uptime)} · ${metrics.totalRequests.toLocaleString("en-IN")} requests since process start`
            : "Fetching /api/monitoring/metrics"
        }
        actions={
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <p className="text-2xl font-bold">{metrics ? `${metrics.db.latencyMs}ms` : "—"}</p>
              <p className="text-[11px] text-white/75">DB latency</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics?.errorRate ?? "—"}</p>
              <p className="text-[11px] text-white/75">Error rate</p>
            </div>
          </div>
        }
      />

      <section className="space-y-4">
        <SectionHeader title="Live metrics" description="From the running Node/Express process — not third-party GDS status" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <MetricCard
            icon={Activity}
            label="Requests / min"
            value={metrics ? String(metrics.requestsPerMin) : "—"}
            color="bg-sky-100 text-primary dark:bg-sky-500/15 dark:text-sky-400"
            index={0}
          />
          <MetricCard
            icon={MemoryStick}
            label="Heap used"
            value={metrics ? formatBytes(metrics.memory.heapUsed) : "—"}
            color="bg-teal-100 text-brand-teal dark:bg-teal-500/15 dark:text-teal-400"
            subtitle={metrics ? `${heapPct}% of heap` : undefined}
            index={1}
          />
          <MetricCard
            icon={Cpu}
            label="RSS memory"
            value={metrics ? formatBytes(metrics.memory.rss) : "—"}
            color="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
            index={2}
          />
          <MetricCard
            icon={Database}
            label="DB health"
            value={metrics ? (metrics.db.healthy ? "OK" : "Down") : "—"}
            color="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
            subtitle={metrics ? `${metrics.db.latencyMs} ms` : undefined}
            index={3}
          />
        </div>
      </section>

      <Card>
        <CardHeader className="pb-2">
          <SectionHeader title="Process details" description="Useful for UAT / ops checks on this environment" />
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border p-3 flex items-center gap-3">
            <Server className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Window started</p>
              <p className="font-medium">{metrics?.windowStart ? new Date(metrics.windowStart).toLocaleString("en-IN") : "—"}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 flex items-center gap-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Total requests (process lifetime)</p>
              <p className="font-medium">{metrics ? metrics.totalRequests.toLocaleString("en-IN") : "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
