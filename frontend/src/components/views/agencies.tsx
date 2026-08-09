"use client";

import { useState, useEffect } from "react";
import {
  Building2, Plus, Search, MoreHorizontal, Eye, Pencil, Ban, CheckCircle2,
  Settings2, Wallet, TrendingUp, Plane, Hotel, Crown, Sparkles, Rocket,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { mapApiAgency } from "@/lib/api-mappers";
import type { Agency } from "@/types";
import {
  formatINR, formatFullINR, StatusBadge, PageShell, PageHeader, SectionHeader, MetricCard, initials, avatarGradient,
} from "@/components/shared/ui-helpers";
import { cn } from "@/lib/utils";

const PLAN_META: Record<Agency["plan"], { icon: React.ElementType; color: string; price: string; features: string[] }> = {
  Starter: {
    icon: Rocket,
    color: "from-slate-400 to-slate-500",
    price: "₹4,999/mo",
    features: ["1 Branch", "Up to 5 Employees", "5K API calls / month", "Email Support", "Basic Analytics"],
  },
  Growth: {
    icon: Sparkles,
    color: "from-cyan-400 to-teal-500",
    price: "₹14,999/mo",
    features: ["3 Branches", "Up to 25 Employees", "50K API calls / month", "Priority Support", "Advanced Analytics", "White-label option"],
  },
  Enterprise: {
    icon: Crown,
    color: "from-violet-500 to-purple-600",
    price: "₹49,999/mo",
    features: ["Unlimited Branches", "Unlimited Employees", "500K API calls / month", "24/7 Dedicated Manager", "Custom Integrations", "SLA 99.99%", "White-label included"],
  },
};

function AllocationBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = Math.min(100, Math.round((value / total) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.toLocaleString("en-IN")} / {total.toLocaleString("en-IN")}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AgenciesView() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [detailAgency, setDetailAgency] = useState<Agency | null>(null);
  const [editAgency, setEditAgency] = useState<Agency | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);

  useEffect(() => {
    api.getAgencies()
      .then((res) => {
        setAgencies((res.agencies ?? []).map(mapApiAgency));
      })
      .catch(() => {
        setAgencies([]);
        toast({ title: "Could not load agencies", variant: "destructive" });
      });
  }, [toast]);

  // Add-agency dialog state
  const [form, setForm] = useState({
    name: "", owner: "", email: "", phone: "", plan: "Growth" as Agency["plan"],
    flights: 20000, hotels: 15000,
  });

  const stats = {
    total: agencies.length,
    active: agencies.filter((a) => a.status === "Active").length,
    suspended: agencies.filter((a) => a.status === "Suspended").length,
    trial: agencies.filter((a) => a.status === "Trial").length,
    revenue: agencies.reduce((s, a) => s + a.monthlyRevenue, 0),
  };

  const filtered = agencies.filter((a) => {
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase()) || a.owner.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status.toLowerCase() === statusFilter;
    return matchSearch && matchStatus;
  });

  function handleAdd() {
    if (!form.name || !form.owner || !form.email) {
      toast({ title: "Missing fields", description: "Please fill agency name, owner, and email.", variant: "destructive" });
      return;
    }
    const reqBody = {
      name: form.name,
      owner: form.owner,
      email: form.email,
      phone: form.phone || "+91 90000 00000",
      plan: form.plan,
      apiAllocation: { flights: form.flights, hotels: form.hotels },
    };
    api.createAgency(reqBody)
      .then((res) => {
        setAgencies([mapApiAgency(res.agency), ...agencies]);
        setAddOpen(false);
        setForm({ name: "", owner: "", email: "", phone: "", plan: "Growth", flights: 20000, hotels: 15000 });
        toast({
          title: "Agency created",
          description: res.tempPassword
            ? `${res.agency.name} onboarded. Login: ${res.agency.email} · Temp password: ${res.tempPassword} (share this once — it won't be shown again).`
            : `${res.agency.name} onboarded successfully.`,
        });
      })
      .catch(() => {
        const newAgency: Agency = {
          id: `ag-${Date.now()}`,
          name: form.name, owner: form.owner, email: form.email, phone: form.phone || "+91 90000 00000",
          plan: form.plan, status: "Trial", walletBalance: 0, commissionEarned: 0, totalBookings: 0,
          monthlyRevenue: 0,
          apiAllocation: { flights: form.flights, hotels: form.hotels },
          createdAt: new Date().toISOString().slice(0, 10),
          branches: 0, employees: 0,
        };
        setAgencies([newAgency, ...agencies]);
        setAddOpen(false);
        setForm({ name: "", owner: "", email: "", phone: "", plan: "Growth", flights: 20000, hotels: 15000 });
        toast({ title: "Agency created (offline)", description: `${newAgency.name} created locally.` });
      });
  }

  function toggleStatus(id: string) {
    const ag = agencies.find((a) => a.id === id);
    if (!ag) return;
    const newStatus = ag.status === "Suspended" ? "Active" : "Suspended";
    api.updateAgency(id, { status: newStatus })
      .then((res) => {
        setAgencies((prev) => prev.map((a) => a.id === id ? mapApiAgency(res.agency) : a));
        toast({ title: newStatus === "Active" ? "Agency activated" : "Agency suspended", description: `${res.agency.name} status updated.` });
      })
      .catch(() => {
        setAgencies((prev) => prev.map((a) => a.id === id ? { ...a, status: newStatus } : a));
        toast({ title: newStatus === "Active" ? "Agency activated (offline)" : "Agency suspended (offline)", description: `${ag.name} status updated locally.` });
      });
  }

  return (
    <PageShell>
      <PageHeader
        title="Agencies"
        subtitle="Manage all travel agencies on the platform"
        action={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700">
                <Plus className="w-4 h-4 mr-1.5" /> Add Agency
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scroll-thin">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-teal-600" /> Onboard New Agency</DialogTitle>
                <DialogDescription>Create a new agency account with API allocation limits.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="ag-name">Agency Name</Label>
                  <Input id="ag-name" placeholder="e.g. Wanderlust Travels" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ag-owner">Owner Name</Label>
                  <Input id="ag-owner" placeholder="Full name" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ag-phone">Phone</Label>
                  <Input id="ag-phone" placeholder="+91 ..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="ag-email">Email</Label>
                  <Input id="ag-email" type="email" placeholder="owner@agency.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Subscription Plan</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v as Agency["plan"] })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Starter">Starter — ₹4,999/mo</SelectItem>
                      <SelectItem value="Growth">Growth — ₹14,999/mo</SelectItem>
                      <SelectItem value="Enterprise">Enterprise — ₹49,999/mo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">API Allocation (monthly calls)</Label>
                <p className="text-xs text-muted-foreground">Drag to set per-category monthly API quota.</p>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                {([
                  { key: "flights", label: "Flights", icon: Plane, color: "text-teal-600", max: 100000 },
                  { key: "hotels", label: "Hotels", icon: Hotel, color: "text-amber-600", max: 80000 },
                ] as const).map((c) => (
                  <div key={c.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5 text-xs"><c.icon className={cn("w-3.5 h-3.5", c.color)} /> {c.label}</Label>
                      <span className="text-xs font-semibold">{form[c.key].toLocaleString("en-IN")}</span>
                    </div>
                    <Slider value={[form[c.key]]} min={0} max={c.max} step={500}
                      onValueChange={(v) => setForm({ ...form, [c.key]: v[0] })} />
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button className="bg-gradient-to-r from-teal-600 to-emerald-600" onClick={handleAdd}>
                  <Plus className="w-4 h-4 mr-1.5" /> Create Agency
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard icon={Building2} label="Total Agencies" value={String(stats.total)} color="bg-sky-100 text-primary dark:bg-sky-500/15 dark:text-sky-400" subtitle="On platform" index={0} />
        <MetricCard icon={CheckCircle2} label="Active" value={String(stats.active)} color="bg-teal-100 text-brand-teal dark:bg-teal-500/15 dark:text-teal-400" index={1} />
        <MetricCard icon={Ban} label="Suspended" value={String(stats.suspended)} color="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" index={2} />
        <MetricCard icon={Sparkles} label="Trial" value={String(stats.trial)} color="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" index={3} />
        <MetricCard icon={Wallet} label="Platform Revenue" value={formatINR(stats.revenue)} color="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" subtitle="This month" index={4} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search agency or owner..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Agencies Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[28rem] overflow-auto scroll-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Wallet</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Monthly Rev</TableHead>
                  <TableHead className="text-center">Branches</TableHead>
                  <TableHead className="text-center">Staff</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailAgency(a)}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="w-9 h-9 border">
                          <AvatarFallback className={cn("bg-gradient-to-br text-white text-xs font-semibold", avatarGradient(a.name))}>
                            {initials(a.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm leading-tight">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.owner}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={a.plan} /></TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      <span className={a.walletBalance < 0 ? "text-rose-600" : ""}>{formatINR(a.walletBalance)}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatINR(a.commissionEarned)}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.totalBookings.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatINR(a.monthlyRevenue)}</TableCell>
                    <TableCell className="text-center">{a.branches}</TableCell>
                    <TableCell className="text-center">{a.employees}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{a.createdAt}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setDetailAgency(a)}><Eye className="w-4 h-4 mr-2" /> View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditAgency(a)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast({ title: "Manage API", description: `API allocation for ${a.name}` })}><Settings2 className="w-4 h-4 mr-2" /> Manage API</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className={a.status === "Suspended" ? "text-emerald-600" : "text-rose-600"}
                            onClick={() => toggleStatus(a.id)}
                          >
                            {a.status === "Suspended" ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Activate</> : <><Ban className="w-4 h-4 mr-2" /> Suspend</>}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-12">No agencies match your filters.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div>
        <SectionHeader
          title="Subscription Plans"
          description="Compare plan tiers offered to agencies."
          action={<Badge variant="outline" className="bg-sky-50 text-primary border-sky-200">3 Tiers</Badge>}
        />
        <div className="mt-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(PLAN_META) as Agency["plan"][]).map((plan) => {
            const meta = PLAN_META[plan];
            const count = agencies.filter((a) => a.plan === plan).length;
            const isFeatured = plan === "Growth";
            return (
              <Card key={plan} className={cn("relative overflow-hidden", isFeatured && "ring-2 ring-teal-500")}>
                {isFeatured && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-[10px] font-semibold px-2.5 py-1 rounded-bl-lg">MOST POPULAR</div>
                )}
                <CardContent className="p-5">
                  <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white", meta.color)}>
                    <meta.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold mt-3">{plan}</h3>
                  <p className="text-2xl font-bold tracking-tight mt-1">{meta.price}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{count} agencies on this plan</p>
                  <Separator className="my-3" />
                  <ul className="space-y-1.5">
                    {meta.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className={cn("w-full mt-4", isFeatured ? "bg-gradient-to-r from-teal-600 to-emerald-600" : "bg-muted text-foreground hover:bg-muted/80")} variant={isFeatured ? "default" : "secondary"}>
                    {isFeatured ? "Upgrade to Growth" : `Choose ${plan}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailAgency} onOpenChange={(o) => !o && setDetailAgency(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scroll-thin">
          {detailAgency && <AgencyDetail agency={detailAgency} />}
        </DialogContent>
      </Dialog>

      <EditAgencyDialog
        agency={editAgency}
        onClose={() => setEditAgency(null)}
        onSaved={(updated) => setAgencies((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))}
      />
    </PageShell>
  );
}

function EditAgencyDialog({ agency, onClose, onSaved }: { agency: Agency | null; onClose: () => void; onSaved: (a: Agency) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<Agency["plan"]>("Starter");
  const [status, setStatus] = useState<Agency["status"]>("Active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agency) return;
    setName(agency.name);
    setOwner(agency.owner);
    setEmail(agency.email);
    setPhone(agency.phone);
    setPlan(agency.plan);
    setStatus(agency.status);
  }, [agency]);

  if (!agency) return null;

  async function handleSave() {
    if (!agency) return;
    setSaving(true);
    try {
      const res = await api.updateAgency(agency.id, { name, owner, email, phone, plan, status });
      onSaved(mapApiAgency(res.agency));
      toast({ title: "Agency updated", description: `${name} has been saved.` });
      onClose();
    } catch {
      toast({ title: "Couldn't save agency", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!agency} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Agency</DialogTitle>
          <DialogDescription>Update agency details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Agency Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={(v) => setPlan(v as Agency["plan"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Starter", "Growth", "Enterprise"] as const).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Agency["status"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Active", "Suspended", "Trial"] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgencyDetail({ agency }: { agency: Agency }) {
  const recentBookings: Array<{ id: string; bookingRef: string; customerName: string; service: string; amount: number; status: string }> = [];
  const maxAlloc = Math.max(agency.apiAllocation.flights, agency.apiAllocation.hotels, 100000);

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12 border">
            <AvatarFallback className={cn("bg-gradient-to-br text-white font-semibold", avatarGradient(agency.name))}>
              {initials(agency.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <DialogTitle className="text-lg">{agency.name}</DialogTitle>
            <DialogDescription>{agency.owner} · {agency.email}</DialogDescription>
          </div>
          <div className="ml-auto flex gap-1.5">
            <StatusBadge status={agency.plan} />
            <StatusBadge status={agency.status} />
          </div>
        </div>
      </DialogHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Wallet", value: formatFullINR(agency.walletBalance), icon: Wallet, color: "text-teal-600" },
          { label: "Commission", value: formatINR(agency.commissionEarned), icon: TrendingUp, color: "text-amber-600" },
          { label: "Bookings", value: agency.totalBookings.toLocaleString("en-IN"), icon: Plane, color: "text-cyan-600" },
          { label: "Monthly Rev", value: formatINR(agency.monthlyRevenue), icon: Wallet, color: "text-violet-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-muted/30 p-2.5">
            <s.icon className={cn("w-4 h-4 mb-1", s.color)} />
            <p className="text-sm font-bold tracking-tight">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">API Allocation</h4>
        <div className="space-y-2.5 rounded-lg border p-3">
          <AllocationBar label="Flights" value={agency.apiAllocation.flights} total={maxAlloc} color="bg-teal-500" />
          <AllocationBar label="Hotels" value={agency.apiAllocation.hotels} total={maxAlloc} color="bg-amber-500" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border p-2.5"><p className="text-muted-foreground">Branches</p><p className="font-bold text-base">{agency.branches}</p></div>
        <div className="rounded-lg border p-2.5"><p className="text-muted-foreground">Employees</p><p className="font-bold text-base">{agency.employees}</p></div>
        <div className="rounded-lg border p-2.5"><p className="text-muted-foreground">Member Since</p><p className="font-bold text-sm">{agency.createdAt}</p></div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Recent Bookings</h4>
        <div className="max-h-48 overflow-y-auto scroll-thin rounded-lg border divide-y">
          {recentBookings.length === 0 && <p className="text-xs text-muted-foreground p-3">No recent bookings.</p>}
          {recentBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-2.5 text-xs">
              <div>
                <p className="font-medium">{b.bookingRef} · {b.customerName}</p>
                <p className="text-muted-foreground">{b.service} · {b.route}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatINR(b.amount)}</p>
                <StatusBadge status={b.status} className="text-[10px] px-1.5 py-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
