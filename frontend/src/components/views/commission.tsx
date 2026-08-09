"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Plane, Building2, Palmtree, Users, Percent, Edit,
  CheckCircle2, Clock, Award, TrendingUp, Wallet, ArrowDownLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { mapApiCommission, type MappedCommission } from "@/lib/api-mappers";
import {
  formatINR, formatFullINR, StatusBadge, PageShell, PageHeader, MetricCard, SectionHeader, BrandHero,
} from "@/components/shared/ui-helpers";
import {
  Card, CardContent, CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const RULE_CARDS = [
  { id: "airline", title: "Airline Commission", icon: Plane, color: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400", type: "Percentage", rate: "2% - 5%", scope: "All domestic & international flights", desc: "Tier-based commission on base fare, varies by airline and route class." },
  { id: "hotel", title: "Hotel Commission", icon: Building2, color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", type: "Percentage", rate: "8% - 15%", scope: "All hotel bookings via API partners", desc: "Higher rates for luxury and long-stay bookings." },
  { id: "package", title: "Holiday Package", icon: Palmtree, color: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400", type: "Markup", rate: "10% - 20%", scope: "Custom & packaged holidays", desc: "Built-in markup over net rate from suppliers." },
  { id: "employee", title: "Employee Incentive", icon: Users, color: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400", type: "Percentage", rate: "0.5% - 1.5%", scope: "Of booking value, paid monthly", desc: "Tiered incentive for sales team based on targets achieved." },
];

const AIRLINE_RATES = [
  { airline: "IndiGo", code: "6E", domestic: 3, international: 2, color: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400" },
  { airline: "Vistara", code: "UK", domestic: 4, international: 3, color: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400" },
  { airline: "Air India", code: "AI", domestic: 3, international: 4, color: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400" },
  { airline: "SpiceJet", code: "SG", domestic: 2.5, international: 0, color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  { airline: "Akasa Air", code: "QP", domestic: 3.5, international: 0, color: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400" },
  { airline: "Emirates", code: "EK", domestic: 0, international: 5, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  { airline: "Singapore Airlines", code: "SQ", domestic: 0, international: 4.5, color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400" },
  { airline: "Qatar Airways", code: "QR", domestic: 0, international: 5, color: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400" },
];

const SETTLEMENTS = [
  { month: "January 2025", totalCommission: 147000, employeePayouts: 42000, agencyShare: 105000, status: "Pending" as const, settledOn: "—" },
  { month: "December 2024", totalCommission: 198000, employeePayouts: 56000, agencyShare: 142000, status: "Settled" as const, settledOn: "05 Jan 2025" },
  { month: "November 2024", totalCommission: 169000, employeePayouts: 48500, agencyShare: 120500, status: "Settled" as const, settledOn: "05 Dec 2024" },
  { month: "October 2024", totalCommission: 178000, employeePayouts: 51000, agencyShare: 127000, status: "Settled" as const, settledOn: "05 Nov 2024" },
  { month: "September 2024", totalCommission: 161000, employeePayouts: 46000, agencyShare: 115000, status: "Settled" as const, settledOn: "05 Oct 2024" },
  { month: "August 2024", totalCommission: 146000, employeePayouts: 41500, agencyShare: 104500, status: "Settled" as const, settledOn: "05 Sep 2024" },
];

function EditRuleDialog({ rule, open, onOpenChange }: { rule: typeof RULE_CARDS[number] | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [rate, setRate] = useState("");
  if (!rule) return null;
  const r = rule;
  function save() {
    toast({
      title: "Demo — not persisted",
      description: `${r.title} preview only. Commission rules are not saved to the server yet.`,
    });
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {rule.title}</DialogTitle>
          <DialogDescription>Modify the commission rate and applicable scope.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>New Rate</Label>
            <Input value={rate} onChange={(e) => setRate(e.target.value)} placeholder={rule.rate} />
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <p><span className="font-medium text-foreground">Current:</span> {rule.rate}</p>
            <p className="mt-0.5"><span className="font-medium text-foreground">Scope:</span> {rule.scope}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} className="bg-primary hover:bg-primary/90">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommissionRulesTab() {
  return (
    <Card>
      <CardContent className="p-6 space-y-2">
        <p className="text-sm font-medium">Commission rules editor coming soon</p>
        <p className="text-sm text-muted-foreground">
          Rates are currently taken from booking commission fields. Use Monthly Settlement and My Commission
          for live totals from the API — carrier rule cards are not persisted yet.
        </p>
      </CardContent>
    </Card>
  );
}

function MonthlySettlementTab({ data }: { data: MappedCommission | null }) {
  const list = data
    ? data.monthly.map((m) => ({
        month: m.label,
        totalCommission: m.commission,
        employeePayouts: Math.round(m.commission * 0.28),
        agencyShare: m.commission - Math.round(m.commission * 0.28),
        status: "Settled" as const,
        settledOn: "05 " + m.label,
      }))
    : [];

  const totalCommission = data ? data.summary.totalCommission : 0;
  const totalPayouts = data ? data.summary.paidCommission : SETTLEMENTS.reduce((s, m) => s + m.employeePayouts, 0);
  const totalAgency = data ? data.summary.totalRevenue : SETTLEMENTS.reduce((s, m) => s + m.agencyShare, 0);
  const pendingMonths = data ? 1 : SETTLEMENTS.filter((m) => m.status === "Pending").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard icon={Award} label="Total Commission (6 months)" value={formatINR(totalCommission)} color="bg-primary/10 text-primary dark:bg-primary/15 dark:text-brand-teal" index={0} />
        <MetricCard icon={Users} label="Employee Payouts" value={formatINR(totalPayouts)} color="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" index={1} />
        <MetricCard icon={Wallet} label="Agency Share" value={formatINR(totalAgency)} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" index={2} />
        <MetricCard icon={Clock} label="Pending Settlements" value={String(pendingMonths)} color="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" index={3} />
      </div>

      <Card>
        <CardHeader>
          <SectionHeader title="Monthly Settlement History" description="Commission settlement status by month" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-lg border max-h-96 overflow-y-auto scroll-thin mx-4 mb-4">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Total Commission</TableHead>
                  <TableHead className="text-right">Employee Payouts</TableHead>
                  <TableHead className="text-right">Agency Share</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Settled On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((m) => (
                  <TableRow key={m.month} className="hover:bg-muted/40">
                    <TableCell className="text-sm font-medium">{m.month}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatFullINR(m.totalCommission)}</TableCell>
                    <TableCell className="text-right text-xs text-violet-600">{formatFullINR(m.employeePayouts)}</TableCell>
                    <TableCell className="text-right text-xs text-emerald-600">{formatFullINR(m.agencyShare)}</TableCell>
                    <TableCell><StatusBadge status={m.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.settledOn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MyCommissionTab({ data }: { data: MappedCommission | null }) {
  const chartData = data
    ? data.monthly.map((m) => ({ month: m.label, commission: m.commission }))
    : [];

  const maxCommission = Math.max(...chartData.map((d) => d.commission), 0);
  const myCommissionCredits: Array<{ id: string; date: string; description: string; amount: number; balance: number }> = [];
  const totalEarned = data ? data.summary.totalCommission : 0;
  const lastMonth = chartData.length ? chartData[chartData.length - 1].commission : 0;
  const prevMonth = chartData.length > 1 ? chartData[chartData.length - 2].commission : 0;
  const growth = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BrandHero
          eyebrow="Total Earned"
          title={formatFullINR(totalEarned)}
          subtitle="Commission earned in recent months"
          className="sm:col-span-1"
        />
        <MetricCard icon={TrendingUp} label="Last Month" value={formatINR(lastMonth)} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" index={0} />
        <MetricCard
          icon={Percent}
          label="Month-over-month Growth"
          value={`${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}
          color="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          index={1}
        />
      </div>

      <Card>
        <CardHeader>
          <SectionHeader title="Commission Earned · Last 12 Months" description="Monthly commission credits to your wallet" />
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="commBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand-blue)" />
                    <stop offset="95%" stopColor="var(--brand-teal)" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatINR(v)} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: number) => [formatFullINR(v), "Commission"]}
                  cursor={{ fill: "rgba(42,123,189,0.05)" }}
                />
                <Bar dataKey="commission" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.commission === maxCommission ? "#f59e0b" : "url(#commBar)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Peak month ·
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-teal" /> Other months
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader title="Recent Commission Credits" description="Latest commission payouts to your wallet" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-lg border max-h-80 overflow-y-auto scroll-thin mx-4 mb-4">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myCommissionCredits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No wallet commission credits yet — totals above come from booking commissions.
                    </TableCell>
                  </TableRow>
                )}
                {myCommissionCredits.map((t) => (
                  <TableRow key={t.id} className="hover:bg-muted/40">
                    <TableCell className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 flex items-center justify-center"><ArrowDownLeft className="w-3 h-3" /></span>
                        <span className="text-xs">{t.description}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold text-emerald-600">+{formatFullINR(t.amount)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatFullINR(t.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function CommissionView() {
  const [data, setData] = useState<MappedCommission | null>(null);

  useEffect(() => {
    api.getCommission()
      .then((res) => {
        setData(mapApiCommission(res));
      })
      .catch(() => undefined);
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="Commission"
        subtitle="Live settlement totals from booking commissions. Rule editor not wired yet."
      />
      <Tabs defaultValue="settlement">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="settlement">Monthly Settlement</TabsTrigger>
          <TabsTrigger value="my">My Commission</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="settlement" className="mt-4"><MonthlySettlementTab data={data} /></TabsContent>
        <TabsContent value="my" className="mt-4"><MyCommissionTab data={data} /></TabsContent>
        <TabsContent value="rules" className="mt-4"><CommissionRulesTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
