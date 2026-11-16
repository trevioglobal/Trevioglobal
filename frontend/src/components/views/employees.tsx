"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Users, UserCheck, UserMinus, Calendar, Plus, Search, Mail, Phone,
  Eye, Pencil, Briefcase, Building2, Award, Target, TrendingUp, Wallet,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuthStore } from "@/store/app-store";
import { api } from "@/lib/api";
import { MODULES, MODULE_LABELS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { Module, Role } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useDemoDataStore } from "@/store/demo-data-store";
import type { Employee } from "@/types";
import {
  formatINR, PageShell, PageHeader, MetricCard, StatusBadge, initials, avatarGradient,
} from "@/components/shared/ui-helpers";
import { cn } from "@/lib/utils";

const DEPARTMENTS = ["All", "Sales", "Management", "Accounts", "Operations", "Support"];
const BRANCHES = ["All", "Mumbai - Andheri", "Delhi - CP", "Bangalore - Indiranagar", "Chennai - T. Nagar"];
const STATUSES = ["All", "Active", "On Leave", "Inactive"];
const ROLES = ["employee", "branch_manager", "accountant", "travel_agent", "sales_executive", "operations"];

export function EmployeesView() {
  const employees = useDemoDataStore((s) => s.employees);
  const { toast } = useToast();
  const [department, setDepartment] = useState("All");
  const [branch, setBranch] = useState("All");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (department !== "All" && e.department !== department) return false;
      if (branch !== "All" && e.branch !== branch) return false;
      if (status !== "All" && e.status !== status) return false;
      if (search && !`${e.name} ${e.email} ${e.designation}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [department, branch, status, search, employees]);

  const active = employees.filter((e) => e.status === "Active").length;
  const onLeave = employees.filter((e) => e.status === "On Leave").length;
  const avgAttendance = Math.round(employees.reduce((s, e) => s + e.attendance, 0) / (employees.length || 1));
  const [activityRows, setActivityRows] = useState<Array<{
    id: string; userId: string; date: string; loginAt?: string | null; logoutAt?: string | null;
    workingMinutes: number; customersAdded: number; quotationsCreated: number; productsUpdated: number;
    productsAdded?: number; revenueGenerated: number; lastActivity?: string | null; ipAddress?: string | null; deviceUsed?: string | null;
  }>>([]);

  useEffect(() => {
    api.getEmployeeActivity()
      .then((res) => setActivityRows(res.activity || []))
      .catch(() => setActivityRows([]));
  }, []);

  const activityTotals = useMemo(() => {
    return activityRows.reduce(
      (acc, row) => ({
        customers: acc.customers + (row.customersAdded || 0),
        quotations: acc.quotations + (row.quotationsCreated || 0),
        products: acc.products + (row.productsUpdated || 0) + (row.productsAdded || 0),
        revenue: acc.revenue + (row.revenueGenerated || 0),
      }),
      { customers: 0, quotations: 0, products: 0, revenue: 0 }
    );
  }, [activityRows]);

  return (
    <PageShell>
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} team members across ${new Set(employees.map((e) => e.branch)).size} branches`}
        action={
          <Button onClick={() => setAddOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1.5" /> Add Employee
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard icon={Users} label="Total Employees" value={employees.length.toString()} color="bg-primary/10 text-primary dark:bg-primary/15 dark:text-brand-teal" index={0} />
        <MetricCard icon={UserCheck} label="Active" value={active.toString()} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" index={1} />
        <MetricCard icon={UserMinus} label="On Leave" value={onLeave.toString()} color="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" index={2} />
        <MetricCard icon={Calendar} label="Avg Attendance" value={`${avgAttendance}%`} color="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" index={3} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard icon={Users} label="Customers Added" value={activityTotals.customers.toString()} color="bg-sky-100 text-sky-700" index={0} />
        <MetricCard icon={Target} label="Quotations Created" value={activityTotals.quotations.toString()} color="bg-violet-100 text-violet-700" index={1} />
        <MetricCard icon={Briefcase} label="Products Touched" value={activityTotals.products.toString()} color="bg-teal-100 text-teal-700" index={2} />
        <MetricCard icon={Wallet} label="Revenue Tracked" value={formatINR(activityTotals.revenue)} color="bg-emerald-100 text-emerald-700" index={3} />
      </div>

      {activityRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Employee Activity Tracking</h3>
            <p className="text-xs text-muted-foreground">Login, working hours, IP/device and daily productivity</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Logout</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Quotes</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityRows.slice(0, 15).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.loginAt ? new Date(row.loginAt).toLocaleTimeString() : "—"}</TableCell>
                    <TableCell>{row.logoutAt ? new Date(row.logoutAt).toLocaleTimeString() : "—"}</TableCell>
                    <TableCell>{(row.workingMinutes / 60).toFixed(1)}h</TableCell>
                    <TableCell>{row.customersAdded}</TableCell>
                    <TableCell>{row.quotationsCreated}</TableCell>
                    <TableCell>{(row.productsAdded || 0) + row.productsUpdated}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{row.lastActivity || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.ipAddress || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, designation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <Briefcase className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Building2 className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto scroll-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Salary</TableHead>
                  <TableHead className="min-w-[140px]">Target vs Achieved</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const pct = e.target > 0 ? Math.min(100, Math.round((e.achieved / e.target) * 100)) : 0;
                  return (
                    <TableRow key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(e)}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="w-9 h-9">
                            <AvatarFallback className={cn("bg-gradient-to-br text-white text-xs font-semibold", avatarGradient(e.name))}>
                              {initials(e.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{e.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{e.designation}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-medium">{e.department}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.branch}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground capitalize">{e.role.replace("_", " ")}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={e.status} /></TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatINR(e.salary)}</TableCell>
                      <TableCell>
                        {e.target > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground">{formatINR(e.achieved)}</span>
                              <span className={cn("font-semibold", pct >= 100 ? "text-emerald-600" : "text-amber-600")}>{pct}%</span>
                            </div>
                            <Progress value={pct} className={cn("h-1.5", pct >= 100 && "[&_[data-slot=progress-indicator]]:bg-emerald-500")} />
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-xs font-medium", e.attendance >= 95 ? "text-emerald-600" : e.attendance >= 90 ? "text-amber-600" : "text-rose-600")}>
                            {e.attendance}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelected(e)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(e)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                      No employees match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditEmployeeDialog employee={editing} onClose={() => setEditing(null)} />
      <EmployeeDetailDialog employee={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}

function AddEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const addEmployee = useDemoDataStore((s) => s.addEmployee);
  const currentUser = useAuthStore((s) => s.user);
  const isBranchManager = currentUser?.role === "branch_manager";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("Travel Consultant");
  const [department, setDepartment] = useState<Employee["department"]>("Sales");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState<string>(currentUser?.branchId || "");
  const [role, setRole] = useState<Role>("employee");
  const [salary, setSalary] = useState("40000");
  const [target, setTarget] = useState("500000");
  const [permissions, setPermissions] = useState<Module[]>(ROLE_DEFAULT_PERMISSIONS.employee);
  const [permissionsTouched, setPermissionsTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getBranches(currentUser?.agencyId)
      .then((res) => setBranches(res.branches.map((b) => ({ id: b.id, name: b.name }))))
      .catch(() => setBranches([]));
    if (isBranchManager && currentUser?.branchId) setBranchId(currentUser.branchId);
  }, [open, currentUser?.agencyId, currentUser?.branchId, isBranchManager]);

  useEffect(() => {
    if (!permissionsTouched) setPermissions(ROLE_DEFAULT_PERMISSIONS[role]);
  }, [role, permissionsTouched]);

  const resetForm = () => {
    setName(""); setEmail(""); setPhone(""); setDesignation("Travel Consultant");
    setDepartment("Sales"); setBranchId(currentUser?.branchId || ""); setRole("employee");
    setSalary("40000"); setTarget("500000");
    setPermissions(ROLE_DEFAULT_PERMISSIONS.employee); setPermissionsTouched(false);
  };

  const togglePermission = (module: Module) => {
    setPermissionsTouched(true);
    setPermissions((prev) => prev.includes(module) ? prev.filter((m) => m !== module) : [...prev, module]);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) {
      toast({ title: "Missing fields", description: "Name and email are required", variant: "destructive" });
      return;
    }
    const branchName = branches.find((b) => b.id === branchId)?.name || "";
    const result = await addEmployee({
      name,
      email,
      phone: phone || "+91 98000 00000",
      designation,
      department,
      branch: branchName,
      branchId: branchId || undefined,
      role,
      salary: Number(salary) || 40000,
      target: Number(target) || 500000,
      permissions: isBranchManager ? undefined : (permissionsTouched ? permissions : undefined),
    });
    toast({
      title: "Employee added",
      description: result?.tempPassword
        ? `${name} onboarded. Login: ${email} · Temp password: ${result.tempPassword} (share this once — it won't be shown again).`
        : "New employee onboarded successfully.",
    });
    onOpenChange(false);
    resetForm();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
          <DialogDescription>Onboard a new team member to your agency.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Full Name</Label>
            <Input placeholder="e.g. Anjali Sharma" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="anjali@agency.in" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+91 98xxx xxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Designation</Label>
            <Input placeholder="Travel Consultant" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={department} onValueChange={(v) => setDepartment(v as Employee["department"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.filter((d) => d !== "All").map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId} disabled={isBranchManager}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isBranchManager}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Salary (₹/month)</Label>
            <Input type="number" placeholder="40000" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Target (₹/month)</Label>
            <Input type="number" placeholder="500000" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>

        {!isBranchManager && (
          <div className="space-y-1.5">
            <Label>Module Access</Label>
            <p className="text-[11px] text-muted-foreground">Defaults to the role's standard access — uncheck anything this person shouldn't see.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded-lg border p-2.5 max-h-[180px] overflow-y-auto scroll-thin">
              {MODULES.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox checked={permissions.includes(m)} onCheckedChange={() => togglePermission(m)} />
                  {MODULE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90">Add Employee</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEmployeeDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { toast } = useToast();
  const updateEmployee = useDemoDataStore((s) => s.updateEmployee);
  const currentUser = useAuthStore((s) => s.user);
  const isBranchManager = currentUser?.role === "branch_manager";
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState<Employee["department"]>("Sales");
  const [branchId, setBranchId] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [status, setStatus] = useState<Employee["status"]>("Active");
  const [salary, setSalary] = useState("0");
  const [target, setTarget] = useState("0");
  const [permissions, setPermissions] = useState<Module[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setDesignation(employee.designation);
    setDepartment(employee.department);
    setBranchId(employee.branchId || "");
    setRole(employee.role);
    setStatus(employee.status);
    setSalary(String(employee.salary));
    setTarget(String(employee.target));
    setPermissions(employee.permissions ?? ROLE_DEFAULT_PERMISSIONS[employee.role]);
    api.getBranches(currentUser?.agencyId)
      .then((res) => setBranches(res.branches.map((b) => ({ id: b.id, name: b.name }))))
      .catch(() => setBranches([]));
  }, [employee, currentUser?.agencyId]);

  if (!employee) return null;

  const togglePermission = (module: Module) => {
    setPermissions((prev) => prev.includes(module) ? prev.filter((m) => m !== module) : [...prev, module]);
  };

  async function handleSave() {
    if (!employee) return;
    setSaving(true);
    const branchName = branches.find((b) => b.id === branchId)?.name;
    try {
      await updateEmployee(employee.id, {
        designation,
        department,
        branchId: branchId || null,
        branch: branchName,
        role,
        status,
        salary: Number(salary) || 0,
        target: Number(target) || 0,
        permissions: isBranchManager ? undefined : permissions,
      });
      toast({ title: "Employee updated", description: `${employee.name}'s profile has been saved.` });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!employee} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {employee.name}</DialogTitle>
          <DialogDescription>Update role, branch, and module access.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Designation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={department} onValueChange={(v) => setDepartment(v as Employee["department"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.filter((d) => d !== "All").map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId} disabled={isBranchManager}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isBranchManager}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Employee["status"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["Active", "On Leave", "Inactive"] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Salary (₹/month)</Label>
            <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Target (₹/month)</Label>
            <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>

        {!isBranchManager && (
          <div className="space-y-1.5">
            <Label>Module Access</Label>
            <p className="text-[11px] text-muted-foreground">Deactivating a module here takes effect immediately, even on their existing session.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded-lg border p-2.5 max-h-[180px] overflow-y-auto scroll-thin">
              {MODULES.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox checked={permissions.includes(m)} onCheckedChange={() => togglePermission(m)} />
                  {MODULE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDetailDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  if (!employee) return null;
  const pct = employee.target > 0 ? Math.min(100, Math.round((employee.achieved / employee.target) * 100)) : 0;

  return (
    <Dialog open={!!employee} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Employee Profile</DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16">
            <AvatarFallback className={cn("bg-gradient-to-br text-white text-lg font-bold", avatarGradient(employee.name))}>
              {initials(employee.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold">{employee.name}</h3>
            <p className="text-sm text-muted-foreground">{employee.designation}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="outline">{employee.department}</Badge>
              <StatusBadge status={employee.status} />
              <span className="text-[11px] text-muted-foreground capitalize">{employee.role.replace("_", " ")}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="truncate">{employee.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{employee.phone}</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{employee.branch}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Joined {employee.joinDate}</span>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Wallet, label: "Salary", value: formatINR(employee.salary), color: "text-teal-600" },
            { icon: Award, label: "Incentives", value: formatINR(employee.incentives), color: "text-amber-600" },
            { icon: Target, label: "Target", value: employee.target > 0 ? formatINR(employee.target) : "—", color: "text-rose-600" },
            { icon: TrendingUp, label: "Achieved", value: employee.target > 0 ? formatINR(employee.achieved) : "—", color: "text-emerald-600" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-lg border border-border p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[10px]">{s.label}</span>
                </div>
                <p className={cn("text-sm font-semibold", s.color)}>{s.value}</p>
              </div>
            );
          })}
        </div>

        {employee.target > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Target Achievement</span>
              <span className={cn("text-sm font-bold", pct >= 100 ? "text-emerald-600" : "text-amber-600")}>{pct}%</span>
            </div>
            <Progress value={pct} className={cn("h-2", pct >= 100 && "[&_[data-slot=progress-indicator]]:bg-emerald-500")} />
            <p className="text-[11px] text-muted-foreground">
              {pct >= 100
                ? `Exceeded target by ${formatINR(employee.achieved - employee.target)} 🎉`
                : `${formatINR(employee.target - employee.achieved)} to reach target`}
            </p>
          </div>
        )}

        <div className="rounded-lg border border-dashed border-border p-3 space-y-1">
          <p className="text-xs font-medium">Attendance</p>
          <p className="text-sm text-muted-foreground">
            Recorded rate: <span className="font-semibold text-foreground">{employee.attendance}%</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Day-by-day calendar and performance charts come from Attendance &amp; Leave once linked to this profile.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button className="bg-primary hover:bg-primary/90" onClick={onClose}>Edit Profile</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
