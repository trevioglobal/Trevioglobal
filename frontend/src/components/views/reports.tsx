"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Download, TrendingUp, TrendingDown, DollarSign, Calendar, Users,
  Target, Award, Activity, Plane, Hotel, Palmtree,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  formatINR, formatFullINR, PageShell, PageHeader, MetricCard, StatusBadge, initials, avatarGradient,
} from "@/components/shared/ui-helpers";
import { cn } from "@/lib/utils";

const SALES_SUMMARY: Array<{ period: string; revenue: number; bookings: number; commission: number; refund: number }> = [];
const BOOKINGS_BY_SERVICE: Array<{ service: string; bookings: number; revenue: number }> = [];
const BOOKINGS_TREND: Array<{ week: string; flight: number; hotel: number; holiday: number }> = [];
const PAYMENT_METHOD_DATA: Array<{ name: string; value: number; color: string }> = [];
const REFUND_TREND: Array<{ month: string; refunds: number; amount: number }> = [];
const REVENUE_DATA: Array<{ month: string; revenue: number; bookings: number; commission: number }> = [];
const BOOKING_TYPE_DATA: Array<{ name: string; value: number; color?: string }> = [];
const TOP_DESTINATIONS: Array<{ destination: string; bookings: number; revenue: number; growth: number }> = [];
const ENQUIRY_SOURCE_DATA: Array<{ source: string; count: number }> = [];
const EMPLOYEES: Array<{ id: string; name: string; target: number; achieved: number; attendance: number; department?: string; status?: string }> = [];

const SERVICE_ICONS: Record<string, React.ElementType> = {
  Flights: Plane, Hotels: Hotel, Holidays: Palmtree,
};

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs">
      {label && <p className="font-medium mb-1.5">{label}</p>}
      <div className="space-y-1">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm" style={{ background: p.color || p.fill }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium">{formatter ? formatter(p.value) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportsView() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState("this_month");
  const [summaryView, setSummaryView] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [liveSummary, setLiveSummary] = useState<{
    totalRevenue: number;
    totalCommission: number;
    totalBookings: number;
  } | null>(null);
  const [bookingsByService, setBookingsByService] = useState(BOOKINGS_BY_SERVICE);
  const [paymentMethodData, setPaymentMethodData] = useState(PAYMENT_METHOD_DATA);
  const [bms, setBms] = useState<{
    sales?: { quotationsCreated: number; quotationsConverted: number; conversionRate: number; bookingValue: number };
    operations?: { pendingConfirmations: number; taskCompletion: { pending: number; completed: number; total: number }; openChangeRequests: number };
    finance?: { collections: number; outstandingPayments: number; supplierPayables: number; profitability: { grossProfit: number; netProfit: number } };
    management?: { activeBookings: number; completedTrips: number; cancelledBookings: number; destinationWiseSales: { destination: string; value: number }[] };
  } | null>(null);

  useEffect(() => {
    api.getBmsReports().then((res) => setBms(res as typeof bms)).catch(() => undefined);
    api.getReports()
      .then((res) => {
        setLiveSummary({
          totalRevenue: res.summary.totalRevenue,
          totalCommission: res.summary.totalCommission,
          totalBookings: res.summary.totalBookings,
        });
        if (res.byService?.length) {
          setBookingsByService(
            res.byService.map((s) => ({
              service: s.service,
              bookings: s.bookings,
              revenue: s.revenue,
            }))
          );
        }
        if (res.byPaymentMethod?.length) {
          const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
          setPaymentMethodData(
            res.byPaymentMethod.map((p, i) => ({
              name: p.method,
              value: p.count,
              color: colors[i % colors.length],
            }))
          );
        }
      })
      .catch(() => undefined);
  }, []);

  const summaryRows = useMemo(() => {
    if (summaryView === "daily") return [SALES_SUMMARY[0], SALES_SUMMARY[1]];
    if (summaryView === "weekly") return [SALES_SUMMARY[2], SALES_SUMMARY[3]];
    if (summaryView === "monthly") return [SALES_SUMMARY[4], SALES_SUMMARY[5]];
    return [SALES_SUMMARY[6]];
  }, [summaryView]);

  const totalRevenue = liveSummary?.totalRevenue ?? 0;
  const totalBookings = liveSummary?.totalBookings ?? 0;
  const totalCommission = liveSummary?.totalCommission ?? 0;

  const handleExport = () => {
    toast({
      title: "Export started",
      description: "Your report is being generated. You'll receive an email shortly.",
    });
  };

  return (
    <PageShell>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Track performance across sales, bookings, finance & employees"
        action={
          <>
            <Badge variant="outline" className="border-amber-300 text-amber-800 dark:text-amber-300">
              Live KPIs · empty charts until more data
            </Badge>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4 mr-1.5" /> Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: DollarSign, label: "Total Revenue", value: formatINR(totalRevenue), change: 18.7, trend: "up" as const, color: "bg-sky-100 text-primary dark:bg-sky-500/15 dark:text-sky-400" },
          { icon: Calendar, label: "Total Bookings", value: totalBookings.toLocaleString("en-IN"), change: 12.5, trend: "up" as const, color: "bg-teal-100 text-brand-teal dark:bg-teal-500/15 dark:text-teal-400" },
          { icon: TrendingUp, label: "Commission Earned", value: formatINR(totalCommission), change: 22.4, trend: "up" as const, color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
          { icon: Users, label: "Avg Order Value", value: formatINR(Math.round(totalRevenue / totalBookings)), change: -3.1, trend: "down" as const, color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
        ].map((s, i) => (
          <MetricCard key={s.label} icon={s.icon} label={s.label} value={s.value} change={s.change} trend={s.trend} color={s.color} index={i} />
        ))}
      </div>

      <Tabs defaultValue="bms">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="bms">BMS</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="employee">Employee</TabsTrigger>
        </TabsList>

        <TabsContent value="bms" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard icon={Target} label="Quote → Booking" value={`${bms?.sales?.conversionRate ?? 0}%`} color="bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400" index={0} />
            <MetricCard icon={DollarSign} label="Booking Value" value={formatINR(bms?.sales?.bookingValue ?? 0)} color="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" index={1} />
            <MetricCard icon={Activity} label="Pending Confirmations" value={String(bms?.operations?.pendingConfirmations ?? 0)} color="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" index={2} />
            <MetricCard icon={TrendingUp} label="Gross Profit" value={formatINR(bms?.finance?.profitability?.grossProfit ?? 0)} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" index={3} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Sales</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>Quotations created: {bms?.sales?.quotationsCreated ?? 0}</p>
                <p>Converted: {bms?.sales?.quotationsConverted ?? 0}</p>
                <p>Outstanding collection: {formatFullINR(bms?.finance?.outstandingPayments ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Operations</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>Tasks pending: {bms?.operations?.taskCompletion?.pending ?? 0}</p>
                <p>Tasks completed: {bms?.operations?.taskCompletion?.completed ?? 0}</p>
                <p>Open change requests: {bms?.operations?.openChangeRequests ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Management</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>Active bookings: {bms?.management?.activeBookings ?? 0}</p>
                <p>Completed trips: {bms?.management?.completedTrips ?? 0}</p>
                <p>Cancelled: {bms?.management?.cancelledBookings ?? 0}</p>
                <p>Supplier payables: {formatFullINR(bms?.finance?.supplierPayables ?? 0)}</p>
              </CardContent>
            </Card>
          </div>
          {(bms?.management?.destinationWiseSales?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Destination-wise Sales</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destination</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bms!.management!.destinationWiseSales.map((d) => (
                      <TableRow key={d.destination}>
                        <TableCell>{d.destination}</TableCell>
                        <TableCell className="text-right">{formatFullINR(d.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ============ SALES ============ */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription className="text-xs">Monthly revenue performance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={REVENUE_DATA} margin={{ left: -12, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="revAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--brand-blue)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 100000}L`} />
                    <Tooltip content={<ChartTooltip formatter={(v: number) => formatFullINR(v)} />} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--brand-blue)" strokeWidth={2.5} fill="url(#revAreaGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Bookings Volume</CardTitle>
                <CardDescription className="text-xs">Monthly bookings count</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={REVENUE_DATA} margin={{ left: -12, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Bar dataKey="bookings" name="Bookings" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Sales Summary</CardTitle>
                <CardDescription className="text-xs">Comparative performance across periods</CardDescription>
              </div>
              <Select value={summaryView} onValueChange={(v) => setSummaryView(v as any)}>
                <SelectTrigger size="sm" className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryRows.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell className="font-medium">{row.period}</TableCell>
                      <TableCell className="text-right">{formatFullINR(row.revenue)}</TableCell>
                      <TableCell className="text-right">{row.bookings}</TableCell>
                      <TableCell className="text-right text-emerald-600">{formatFullINR(row.commission)}</TableCell>
                      <TableCell className="text-right text-rose-600">{formatFullINR(row.refund)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatFullINR(row.revenue - row.refund)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Enquiry Sources</CardTitle>
              <CardDescription className="text-xs">Where your leads are coming from</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={ENQUIRY_SOURCE_DATA} layout="vertical" margin={{ left: 24, right: 12 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Bar dataKey="count" name="Enquiries" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ BOOKINGS ============ */}
        <TabsContent value="bookings" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Booking Type Distribution</CardTitle>
                <CardDescription className="text-xs">Share of bookings by service</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={BOOKING_TYPE_DATA} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {BOOKING_TYPE_DATA.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {BOOKING_TYPE_DATA.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-medium ml-auto">{d.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Bookings by Service</CardTitle>
                <CardDescription className="text-xs">Volume comparison across services</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={bookingsByService} margin={{ left: -12, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="service" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Bar dataKey="bookings" name="Bookings" radius={[6, 6, 0, 0]}>
                      {bookingsByService.map((_, i) => (
                        <Cell key={i} fill={["var(--brand-blue)", "var(--brand-teal)", "#f59e0b", "#06b6d4", "#8b5cf6", "#10b981"][i % 6]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Top Destinations</CardTitle>
              <CardDescription className="text-xs">Best performing routes by booking volume</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {TOP_DESTINATIONS.map((d, i) => {
                const max = Math.max(...TOP_DESTINATIONS.map((x) => x.bookings));
                const pct = Math.round((d.bookings / max) * 100);
                return (
                  <div key={d.destination} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-blue to-brand-teal text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div className="w-28 sm:w-36 shrink-0">
                      <p className="text-sm font-medium truncate">{d.destination}</p>
                      <p className="text-[10px] text-muted-foreground">{formatINR(d.revenue)}</p>
                    </div>
                    <div className="flex-1 h-6 rounded-md bg-muted overflow-hidden relative">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: i * 0.08, duration: 0.6 }}
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 flex items-center justify-end pr-2"
                      >
                        <span className="text-[10px] font-semibold text-white">{d.bookings}</span>
                      </motion.div>
                    </div>
                    <span className="text-xs font-medium text-emerald-600 flex items-center gap-0.5 w-12 justify-end">
                      <TrendingUp className="w-3 h-3" />{d.growth}%
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Bookings Trend (6 weeks)</CardTitle>
              <CardDescription className="text-xs">Weekly bookings by service category</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={BOOKINGS_TREND} margin={{ left: -12, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Line type="monotone" dataKey="flight" name="Flights" stroke="var(--brand-blue)" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="hotel" name="Hotels" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="holiday" name="Holidays" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ FINANCIAL ============ */}
        <TabsContent value="financial" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: "Gross Revenue", value: formatINR(30250000), color: "text-teal-600" },
              { label: "Net Commission", value: formatINR(1515000), color: "text-emerald-600" },
              { label: "Refunds Issued", value: formatINR(385000), color: "text-rose-600" },
              { label: "Avg Margin", value: "5.01%", color: "text-amber-600" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <p className={cn("text-lg font-bold tracking-tight", s.color)}>{s.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Revenue vs Commission</CardTitle>
                <CardDescription className="text-xs">Monthly comparison (grouped)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={REVENUE_DATA} margin={{ left: -12, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 100000}L`} />
                    <Tooltip content={<ChartTooltip formatter={(v: number) => formatFullINR(v)} />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    <Bar dataKey="revenue" name="Revenue" fill="var(--brand-blue)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="commission" name="Commission" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Payment Method Distribution</CardTitle>
                <CardDescription className="text-xs">By transaction volume</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={paymentMethodData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={(e: any) => `${e.name}`} labelLine={false} style={{ fontSize: 10 }}>
                      {paymentMethodData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {paymentMethodData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-medium ml-auto">{d.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Refund Trend</CardTitle>
              <CardDescription className="text-xs">Refund count & amount over last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={REFUND_TREND} margin={{ left: -12, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}K`} />
                  <Tooltip content={<ChartTooltip formatter={(v: number, n: string) => n === "amount" ? formatFullINR(v) : v} />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar yAxisId="left" dataKey="refunds" name="Refund Count" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="amount" name="Refund Amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ EMPLOYEE ============ */}
        <TabsContent value="employee" className="space-y-4 mt-4">
          <EmployeeReports />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function EmployeeReports() {
  const salesEmployees = EMPLOYEES.filter((e) => e.target > 0).sort((a, b) => b.achieved - a.achieved);
  const topPerformers = salesEmployees.slice(0, 6);
  const targetVsAchieved = topPerformers.map((e) => ({
    name: e.name.split(" ")[0],
    target: e.target,
    achieved: e.achieved,
  }));
  const avgAttendance = Math.round(EMPLOYEES.reduce((s, e) => s + e.attendance, 0) / EMPLOYEES.length);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: Users, label: "Total Employees", value: EMPLOYEES.length.toString(), color: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400" },
          { icon: Award, label: "Top Performer", value: topPerformers[0]?.name.split(" ")[0] || "—", color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
          { icon: Target, label: "Targets Met", value: `${salesEmployees.filter((e) => e.achieved >= e.target).length}/${salesEmployees.length}`, color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
          { icon: Activity, label: "Avg Attendance", value: `${avgAttendance}%`, color: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card>
                <CardContent className="p-4">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-2.5", s.color)}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <p className="text-xl font-bold tracking-tight">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Top Performers</CardTitle>
            <CardDescription className="text-xs">By revenue achieved (INR)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topPerformers.map((e) => ({ name: e.name.split(" ")[0], achieved: e.achieved }))} layout="vertical" margin={{ left: 24, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 100000}L`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => formatFullINR(v)} />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Bar dataKey="achieved" name="Achieved" fill="var(--brand-teal)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Target vs Achieved</CardTitle>
            <CardDescription className="text-xs">Sales team performance against targets</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={targetVsAchieved} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 100000}L`} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => formatFullINR(v)} />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="target" name="Target" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="achieved" name="Achieved" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Attendance Overview</CardTitle>
          <CardDescription className="text-xs">Last 30 days attendance percentage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-1">
          {EMPLOYEES.map((e, i) => {
            const color = e.attendance >= 95 ? "from-emerald-400 to-emerald-500" : e.attendance >= 90 ? "from-amber-400 to-orange-500" : "from-rose-400 to-rose-500";
            return (
              <div key={e.id} className="flex items-center gap-3">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className={cn("bg-gradient-to-br text-white text-[10px] font-semibold", avatarGradient(e.name))}>
                    {initials(e.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="w-32 sm:w-40 shrink-0">
                  <p className="text-sm font-medium truncate">{e.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{e.designation}</p>
                </div>
                <div className="flex-1 h-5 rounded-md bg-muted overflow-hidden relative">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${e.attendance}%` }}
                    transition={{ delay: i * 0.05, duration: 0.6 }}
                    className={cn("h-full bg-gradient-to-r flex items-center justify-end pr-2", color)}
                  >
                    <span className="text-[10px] font-semibold text-white">{e.attendance}%</span>
                  </motion.div>
                </div>
                <StatusBadge status={e.status} className="text-[10px] h-5 w-20 justify-center" />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
