"use client";

import { useState, useEffect } from "react";
import {
  Building2, Users, Wallet, TrendingUp, Plus, MoreHorizontal, Pencil,
  UserCog, MapPin, Search,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { api, type ApiEmployee } from "@/lib/api";
import { mapApiAgency, mapApiBranch } from "@/lib/api-mappers";
import type { Agency, Branch } from "@/types";
import { formatINR, formatFullINR, StatusBadge, PageShell, PageHeader, SectionHeader, MetricCard, initials, avatarGradient } from "@/components/shared/ui-helpers";
import { cn } from "@/lib/utils";

const BRANCH_COLORS = ["var(--brand-blue)", "var(--brand-teal)", "#f59e0b", "#06b6d4", "#10b981", "#ef4444", "#fb923c", "#14b8a6"];

export function BranchesView() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", agencyId: "ag-1", city: "", manager: "" });
  const [assignBranch, setAssignBranch] = useState<Branch | null>(null);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);

  useEffect(() => {
    api.getBranches()
      .then((res) => {
        setBranches((res.branches ?? []).map(mapApiBranch));
      })
      .catch(() => {
        setBranches([]);
        toast({ title: "Could not load branches", variant: "destructive" });
      });
    api.getAgencies()
      .then((res) => {
        const list = (res.agencies ?? []).map(mapApiAgency);
        setAgencies(list);
        if (list[0]?.id) setForm((f) => ({ ...f, agencyId: f.agencyId || list[0].id }));
      })
      .catch(() => setAgencies([]));
  }, [toast]);

  const totalEmployees = branches.reduce((s, b) => s + b.employees, 0);
  const totalRevenue = branches.reduce((s, b) => s + b.revenue, 0);
  const avgRevenue = branches.length ? totalRevenue / branches.length : 0;

  const stats = [
    { icon: Building2, label: "Total Branches", value: String(branches.length), color: "bg-sky-100 text-primary dark:bg-sky-500/15 dark:text-sky-400", subtitle: "All agencies" },
    { icon: Users, label: "Total Employees", value: totalEmployees.toLocaleString("en-IN"), color: "bg-teal-100 text-brand-teal dark:bg-teal-500/15 dark:text-teal-400" },
    { icon: Wallet, label: "Total Revenue", value: formatINR(totalRevenue), color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400", subtitle: "All branches" },
    { icon: TrendingUp, label: "Avg Revenue / Branch", value: formatINR(avgRevenue), color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
  ];

  const chartData = branches.map((b, i) => ({
    name: b.name.split(" - ")[0],
    city: b.city,
    revenue: b.revenue,
    employees: b.employees,
    color: BRANCH_COLORS[i % BRANCH_COLORS.length],
  }));

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.city.toLowerCase().includes(search.toLowerCase()) ||
    b.manager.toLowerCase().includes(search.toLowerCase())
  );

  function agencyName(id: string) { return agencies.find((a) => a.id === id)?.name || "—"; }

  function handleAdd() {
    if (!form.name || !form.city || !form.manager) {
      toast({ title: "Missing fields", description: "Fill branch name, city and manager.", variant: "destructive" });
      return;
    }
    api.createBranch(form)
      .then((res) => {
        setBranches([mapApiBranch(res.branch), ...branches]);
        setAddOpen(false);
        setForm({ name: "", agencyId: "ag-1", city: "", manager: "" });
        toast({ title: "Branch added", description: `${res.branch.name} created.` });
      })
      .catch(() => {
        const newBranch: Branch = {
          id: `br-${Date.now()}`, agencyId: form.agencyId, name: form.name,
          manager: form.manager, city: form.city, employees: 0, revenue: 0,
        };
        setBranches([newBranch, ...branches]);
        setAddOpen(false);
        setForm({ name: "", agencyId: "ag-1", city: "", manager: "" });
        toast({ title: "Branch added (offline)", description: `${newBranch.name} created locally.` });
      });
  }

  return (
    <PageShell>
      <PageHeader
        title="Branches"
        subtitle="Manage branch network and performance"
        action={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Branch
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-teal-600" /> Add New Branch</DialogTitle>
                <DialogDescription>Create a new branch under an agency.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="br-name">Branch Name</Label>
                  <Input id="br-name" placeholder="e.g. Pune - Hinjewadi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Agency</Label>
                    <Select value={form.agencyId} onValueChange={(v) => setForm({ ...form, agencyId: v })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {agencies.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="br-city">City</Label>
                    <Input id="br-city" placeholder="Mumbai" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="br-manager">Branch Manager</Label>
                  <Input id="br-manager" placeholder="Manager name" value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button className="bg-gradient-to-r from-teal-600 to-emerald-600" onClick={handleAdd}>
                  <Plus className="w-4 h-4 mr-1.5" /> Create Branch
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((s, i) => <MetricCard key={s.label} {...s} index={i} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <SectionHeader
              title="Branch Performance"
              description="Revenue contribution by branch"
              action={<Badge variant="outline" className="bg-sky-50 text-primary border-sky-200">₹{formatINR(totalRevenue).replace("₹", "")}</Badge>}
            />
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ left: -16, right: 8, top: 8 }}>
                <defs>
                  {chartData.map((d, i) => (
                    <linearGradient key={i} id={`bg-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={d.color} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={d.color} stopOpacity={0.55} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 100000}L`} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
                  formatter={(v: number) => formatFullINR(v)}
                  labelFormatter={(l, p) => `${p?.[0]?.payload.city ?? l}`}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={`url(#bg-${i})`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <SectionHeader title="Employee Distribution" description="Headcount per branch" />
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[260px] pr-3">
              <div className="space-y-3">
                {chartData.map((b) => {
                  const maxEmp = Math.max(...chartData.map((c) => c.employees));
                  const pct = Math.round((b.employees / maxEmp) * 100);
                  return (
                    <div key={b.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium truncate">{b.name}</span>
                        <span className="text-muted-foreground">{b.employees} staff</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by branch, city, or manager..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-auto scroll-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-teal flex items-center justify-center text-white">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-sm">{b.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{agencyName(b.agencyId)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7 border">
                          <AvatarFallback className={cn("bg-gradient-to-br text-white text-[10px] font-semibold", avatarGradient(b.manager))}>
                            {initials(b.manager)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{b.manager}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs"><span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-muted-foreground" />{b.city}</span></TableCell>
                    <TableCell className="text-center"><Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">{b.employees}</Badge></TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatINR(b.revenue)}</TableCell>
                    <TableCell><StatusBadge status={b.revenue > 500000 ? "Active" : "Pending"} /></TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setEditBranch(b)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAssignBranch(b)}><UserCog className="w-4 h-4 mr-2" /> Assign Manager</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AssignManagerDialog
        branch={assignBranch}
        onClose={() => setAssignBranch(null)}
        onAssigned={(updated) => setBranches((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))}
      />
      <EditBranchDialog
        branch={editBranch}
        onClose={() => setEditBranch(null)}
        onSaved={(updated) => setBranches((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))}
      />
    </PageShell>
  );
}

function EditBranchDialog({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: (b: Branch) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [manager, setManager] = useState("");
  const [revenue, setRevenue] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!branch) return;
    setName(branch.name);
    setCity(branch.city);
    setManager(branch.manager);
    setRevenue(String(branch.revenue));
  }, [branch]);

  if (!branch) return null;

  async function handleSave() {
    if (!branch) return;
    setSaving(true);
    try {
      const res = await api.updateBranch(branch.id, { name, city, manager, revenue: Number(revenue) || 0 });
      onSaved(mapApiBranch(res.branch));
      toast({ title: "Branch updated", description: `${name} has been saved.` });
      onClose();
    } catch {
      toast({ title: "Couldn't save branch", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!branch} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-teal-600" /> Edit Branch</DialogTitle>
          <DialogDescription>Update branch details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Branch Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Manager</Label>
              <Input value={manager} onChange={(e) => setManager(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Monthly Revenue (₹)</Label>
            <Input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gradient-to-r from-teal-600 to-emerald-600" disabled={saving} onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignManagerDialog({ branch, onClose, onAssigned }: { branch: Branch | null; onClose: () => void; onAssigned: (b: Branch) => void }) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<ApiEmployee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!branch) return;
    setSelectedId("");
    api.getEmployees(branch.agencyId)
      .then((res) => setCandidates(res.employees.filter((e) => e.role === "employee" || e.role === "branch_manager")))
      .catch(() => setCandidates([]));
  }, [branch]);

  if (!branch) return null;

  async function handleAssign() {
    const employee = candidates.find((e) => e.id === selectedId);
    if (!employee || !branch) return;
    setSaving(true);
    try {
      await api.updateEmployee(employee.id, { role: "branch_manager", branchId: branch.id, branch: branch.name });
      const res = await api.updateBranch(branch.id, { manager: employee.name });
      onAssigned(mapApiBranch(res.branch));
      toast({ title: "Manager assigned", description: `${employee.name} is now managing ${branch.name}.` });
      onClose();
    } catch {
      toast({ title: "Couldn't assign manager", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!branch} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserCog className="w-5 h-5 text-teal-600" /> Assign Manager</DialogTitle>
          <DialogDescription>Promote an employee to manage {branch.name}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Employee</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select an employee" /></SelectTrigger>
            <SelectContent>
              {candidates.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {e.designation}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gradient-to-r from-teal-600 to-emerald-600" disabled={!selectedId || saving} onClick={handleAssign}>
            <UserCog className="w-4 h-4 mr-1.5" /> Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
