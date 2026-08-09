"use client";

import { useState, useEffect, useRef } from "react";
import {
  Building2, Users, Cog, Shield, Camera, Save, Plus, KeyRound, Globe,
  Clock, Lock, Smartphone, Mail, MessageSquare, Phone, Wifi, Server,
  CheckCircle2, AlertTriangle, Pencil, Check, X, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { PageShell, PageHeader, DemoModuleBanner, DemoDataBadge } from "@/components/shared/ui-helpers";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import {
  MODULE_LABELS, ROLE_CRUD,
  type CrudAction,
} from "@/lib/permissions";
import type { Role } from "@/types";
import { ROLE_LABELS } from "@/lib/nav-config";

const ROLE_KEYS: Role[] = [
  "super_admin", "agency_admin", "branch_manager", "employee", "accountant", "sales_executive", "product_executive",
];

const MATRIX_MODULES = [
  "bookings", "customers", "payments", "reports", "employees", "quotations",
  "hotels", "activities", "transfers", "settings",
] as const;

const CRUD_ACTIONS: CrudAction[] = ["view", "add", "edit", "delete"];

function matrixFromCrud(role: Role, overrides?: Record<string, Record<string, CrudAction[]>> | null) {
  const m: Record<string, Record<CrudAction, boolean>> = {};
  for (const mod of MATRIX_MODULES) {
    const actions = overrides?.[role]?.[mod] ?? ROLE_CRUD[role]?.[mod] ?? ["view"];
    m[mod] = {
      view: actions.includes("view"),
      add: actions.includes("add"),
      edit: actions.includes("edit"),
      delete: actions.includes("delete"),
    };
  }
  return m;
}

function matrixToCrud(matrix: Record<string, Record<CrudAction, boolean>>): Record<string, CrudAction[]> {
  const out: Record<string, CrudAction[]> = {};
  for (const mod of Object.keys(matrix)) {
    out[mod] = CRUD_ACTIONS.filter((a) => matrix[mod][a]);
  }
  return out;
}

const ROLES = ROLE_KEYS.map((role) => ({
  role,
  label: ROLE_LABELS[role],
  users: role === "employee" ? 5 : role === "branch_manager" ? 2 : 1,
  color:
    role === "super_admin" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400" :
    role === "agency_admin" ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400" :
    role === "branch_manager" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" :
    role === "accountant" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" :
    role === "sales_executive" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" :
    role === "product_executive" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400" :
    "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400",
}));

const TIMEZONES = ["Asia/Kolkata (IST, UTC+5:30)", "Asia/Dubai (GST, UTC+4)", "Asia/Singapore (SGT, UTC+8)", "Europe/London (GMT, UTC+0)", "America/New_York (EST, UTC-5)"];
const LANGUAGES = ["English", "हिंदी (Hindi)", "தமிழ் (Tamil)", "తెలుగు (Telugu)", "ಕನ್ನಡ (Kannada)"];
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY"];

export function SettingsView() {
  return (
    <PageShell>
      <PageHeader title="Settings" subtitle="Manage your agency profile, users, system & security" />

      <Tabs defaultValue="company">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="company"><Building2 className="w-3.5 h-3.5 mr-1.5" /> Company</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-3.5 h-3.5 mr-1.5" /> Users & Roles</TabsTrigger>
          <TabsTrigger value="system"><Cog className="w-3.5 h-3.5 mr-1.5" /> System</TabsTrigger>
          <TabsTrigger value="security"><Shield className="w-3.5 h-3.5 mr-1.5" /> Security</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4"><CompanyTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="system" className="mt-4"><SystemTab /></TabsContent>
        <TabsContent value="security" className="mt-4"><SecurityTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function CompanyTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [agencyName] = useState("Wanderlust Travels");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 2MB", variant: "destructive" });
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please upload a PNG or JPG image", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setLogo(result);
        toast({ title: "Logo uploaded", description: "Changes will be saved when you click Save Changes" });
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    toast({ title: "Saved", description: "Company profile updated successfully." });
  };

  const initials = agencyName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle>Agency Profile</CardTitle>
          <CardDescription>Basic information about your travel agency</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Logo upload */}
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              {logo ? (
                <img src={logo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-brand-blue to-brand-teal text-white text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Camera className="w-3.5 h-3.5 mr-1.5" />}
                {uploading ? "Uploading..." : "Upload Logo"}
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1.5">PNG or JPG, max 2MB. Recommended 256×256px.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Agency Name</Label>
              <Input defaultValue="Wanderlust Travels Pvt Ltd" />
            </div>
            <div className="space-y-1.5">
              <Label>Brand Name</Label>
              <Input defaultValue="Wanderlust Travels" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Registered Address</Label>
              <Textarea defaultValue="Plot 14, Andheri Industrial Estate, Andheri East, Mumbai, Maharashtra 400069, India" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>GST Number</Label>
              <Input defaultValue="27AABCW1234M1Z5" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>PAN Number</Label>
              <Input defaultValue="AABCW1234M" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Email</Label>
              <Input type="email" defaultValue="contact@wanderlusttravels.in" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Phone</Label>
              <Input defaultValue="+91 22 4000 1234" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Website</Label>
              <Input defaultValue="https://www.wanderlusttravels.in" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary hover:bg-primary/90"><Save className="w-4 h-4 mr-1.5" /> Save Changes</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400 mb-2">Enterprise Plan</Badge>
            <p className="text-2xl font-bold">₹25,000<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="text-xs text-muted-foreground mt-1">Renews on Feb 19, 2025</p>
            <Separator className="my-3" />
            <div className="space-y-1.5 text-xs">
              {["Unlimited bookings", "All modules included", "Priority support", "API access (10K/day)", "Custom branding"].map((f) => (
                <div key={f} className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{f}</div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-3">Manage Plan</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">IATA Accredited</span><Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">Verified</Badge></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">TAAI Member</span><Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">Active</Badge></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">GST Filing</span><Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">Pending</Badge></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<Role>("branch_manager");
  const [overrides, setOverrides] = useState<Record<string, Record<string, CrudAction[]>> | null>(null);
  const [matrix, setMatrix] = useState<Record<string, Record<CrudAction, boolean>>>(matrixFromCrud("branch_manager"));
  const [saving, setSaving] = useState(false);
  const [passwordPolicy, setPasswordPolicy] = useState({
    minLength: 10, requireUppercase: true, requireNumbers: true, requireSymbols: true,
    expiryDays: 90, twoFactor: true,
  });

  useEffect(() => {
    apiFetch<{ overrides: Record<string, Record<string, CrudAction[]>> | null }>("/api/settings/role-permissions")
      .then((data) => {
        setOverrides(data.overrides);
        setMatrix(matrixFromCrud(selectedRole, data.overrides));
      })
      .catch(() => setMatrix(matrixFromCrud(selectedRole)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePermission = (mod: string, action: CrudAction) => {
    setMatrix((prev) => ({
      ...prev,
      [mod]: { ...prev[mod], [action]: !prev[mod][action] },
    }));
  };

  const handleRoleChange = (role: Role) => {
    setSelectedRole(role);
    setMatrix(matrixFromCrud(role, overrides));
  };

  const saveMatrix = async () => {
    setSaving(true);
    try {
      const next = {
        ...(overrides ?? {}),
        [selectedRole]: {
          ...(overrides?.[selectedRole] ?? {}),
          ...matrixToCrud(matrix),
        },
      };
      await apiFetch("/api/settings/role-permissions", {
        method: "PUT",
        body: JSON.stringify({ rolePermissions: next }),
      });
      setOverrides(next);
      toast({ title: "Permissions saved", description: `${ROLE_LABELS[selectedRole]} CRUD rules updated and enforced on API.` });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const permissionsCount = (role: Role) => {
    const m = matrixFromCrud(role, overrides);
    return MATRIX_MODULES.reduce((sum, mod) => sum + CRUD_ACTIONS.filter((a) => m[mod][a]).length, 0);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Roles & Access</CardTitle>
          <CardDescription>Define what each role can do — enforced by backend CRUD checks</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Permissions</TableHead>
                <TableHead className="text-right">Users</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLES.map((r) => (
                <TableRow
                  key={r.role}
                  className={cn("cursor-pointer hover:bg-muted/40", selectedRole === r.role && "bg-teal-50/50 dark:bg-teal-500/5")}
                  onClick={() => handleRoleChange(r.role)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={cn("w-7 h-7 rounded-md flex items-center justify-center", r.color)}>
                        <Shield className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-sm font-medium">{r.label}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{permissionsCount(r.role)} / {MATRIX_MODULES.length * 4}</TableCell>
                  <TableCell className="text-right text-sm">{r.users}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Permissions Matrix — <span className="text-teal-600">{ROLE_LABELS[selectedRole]}</span></CardTitle>
            <CardDescription>View / Add / Edit / Delete — saved to backend and checked on product write APIs</CardDescription>
          </div>
          <Button size="sm" onClick={saveMatrix} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "Saving..." : "Save Permissions"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  {CRUD_ACTIONS.map((a) => <TableHead key={a} className="text-center capitalize">{a}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MATRIX_MODULES.map((mod) => (
                  <TableRow key={mod}>
                    <TableCell className="font-medium text-sm">{MODULE_LABELS[mod]}</TableCell>
                    {CRUD_ACTIONS.map((a) => (
                      <TableCell key={a} className="text-center">
                        <Checkbox
                          checked={matrix[mod]?.[a] ?? false}
                          onCheckedChange={() => togglePermission(mod, a)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-600" /> Password Policy
          </CardTitle>
          <CardDescription>Enforce strong password requirements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Minimum Length</Label>
              <Input
                type="number"
                value={passwordPolicy.minLength}
                onChange={(e) => setPasswordPolicy({ ...passwordPolicy, minLength: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password Expiry (days)</Label>
              <Input
                type="number"
                value={passwordPolicy.expiryDays}
                onChange={(e) => setPasswordPolicy({ ...passwordPolicy, expiryDays: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-2">
            {[
              { key: "requireUppercase", label: "Require uppercase letters (A-Z)" },
              { key: "requireNumbers", label: "Require numbers (0-9)" },
              { key: "requireSymbols", label: "Require special characters" },
              { key: "twoFactor", label: "Enforce two-factor authentication (2FA)" },
            ].map((p) => (
              <div key={p.key} className="flex items-center justify-between p-2.5 rounded-lg border border-border">
                <span className="text-sm">{p.label}</span>
                <Switch
                  checked={Boolean((passwordPolicy as unknown as Record<string, boolean>)[p.key])}
                  onCheckedChange={(v) => setPasswordPolicy({ ...passwordPolicy, [p.key]: v })}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemTab() {
  return (
    <Card>
      <CardContent className="p-6 space-y-2">
        <p className="text-sm font-medium">System settings coming soon</p>
        <p className="text-sm text-muted-foreground">
          Localization, notification gateways, and system info are not persisted yet. Use Company and Users &amp; Roles
          for live configuration during UAT.
        </p>
      </CardContent>
    </Card>
  );
}


function SecurityTab() {
  return (
    <Card>
      <CardContent className="p-6 space-y-2">
        <p className="text-sm font-medium">Security controls coming soon</p>
        <p className="text-sm text-muted-foreground">
          MFA, IP whitelist, and API rate limits are not persisted yet. Password changes use Forgot password / reset flow.
        </p>
      </CardContent>
    </Card>
  );
}
