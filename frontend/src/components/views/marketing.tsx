"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus, MoreHorizontal, Pencil, Trash2, Copy, Ticket, Tag, Calendar,
  MousePointerClick, Play, Pause, Loader2,
} from "lucide-react";
import { api, type CouponApi } from "@/lib/api";
import { useAuthStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { PageShell, PageHeader, MetricCard, StatusBadge } from "@/components/shared/ui-helpers";

type CouponRow = {
  id: string;
  code: string;
  type: "Flat" | "Percent";
  value: number;
  limit: number;
  used: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  validFrom: string;
  validTill: string;
  status: "Active" | "Expired" | "Paused";
  description: string | null;
  agencyId: string;
};

function mapCoupon(c: CouponApi): CouponRow {
  return {
    id: c.id,
    agencyId: c.agencyId,
    code: c.code,
    type: (c.type === "Percent" ? "Percent" : "Flat") as "Flat" | "Percent",
    value: c.value,
    limit: c.limit ?? c.usageLimit ?? 0,
    used: c.used ?? c.usedCount ?? 0,
    minOrderAmount: c.minOrderAmount ?? 0,
    maxDiscount: c.maxDiscount ?? null,
    validFrom: c.validFrom,
    validTill: c.validTill,
    status: (c.status === "Paused" || c.status === "Expired" ? c.status : "Active") as CouponRow["status"],
    description: c.description ?? null,
  };
}

const emptyCouponForm = {
  code: "",
  type: "Flat" as "Flat" | "Percent",
  value: "",
  limit: "",
  minOrder: "",
  maxDiscount: "",
  validFrom: "",
  validTill: "",
  description: "",
  status: "Active" as "Active" | "Paused" | "Expired",
};

export function MarketingView() {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<CouponRow | null>(null);
  const [couponForm, setCouponForm] = useState(emptyCouponForm);

  const loadCoupons = useCallback(async () => {
    setCouponsLoading(true);
    try {
      const res = await api.getCoupons();
      setCoupons((res.coupons ?? []).map(mapCoupon));
    } catch (e) {
      toast({
        title: "Could not load coupons",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setCouponsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadCoupons();
  }, [loadCoupons]);

  async function saveCoupon() {
    if (!couponForm.code || !couponForm.value || !couponForm.validTill) {
      toast({ title: "Missing fields", description: "Code, value, and valid-till date are required.", variant: "destructive" });
      return;
    }
    const value = parseInt(couponForm.value, 10) || 0;
    if (value <= 0) {
      toast({ title: "Invalid value", description: "Discount value must be greater than zero.", variant: "destructive" });
      return;
    }
    if (couponForm.type === "Percent" && value > 100) {
      toast({ title: "Invalid percent", description: "Percent cannot exceed 100.", variant: "destructive" });
      return;
    }
    setCouponSaving(true);
    try {
      const body = {
        code: couponForm.code.trim().toUpperCase(),
        type: couponForm.type,
        value,
        usageLimit: parseInt(couponForm.limit, 10) || 0,
        minOrderAmount: parseInt(couponForm.minOrder, 10) || 0,
        maxDiscount: couponForm.maxDiscount ? parseInt(couponForm.maxDiscount, 10) : null,
        validFrom: couponForm.validFrom || undefined,
        validTill: couponForm.validTill,
        status: couponForm.status,
        description: couponForm.description || null,
        agencyId: user?.agencyId || undefined,
      };
      if (editingCoupon) {
        await api.updateCoupon(editingCoupon.id, body);
        toast({ title: "Coupon updated", description: body.code });
      } else {
        await api.createCoupon(body);
        toast({ title: "Coupon created", description: body.code });
      }
      setCouponOpen(false);
      setEditingCoupon(null);
      setCouponForm(emptyCouponForm);
      await loadCoupons();
    } catch (e) {
      toast({
        title: editingCoupon ? "Update failed" : "Create failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setCouponSaving(false);
    }
  }

  async function deleteCoupon(c: CouponRow) {
    try {
      await api.deleteCoupon(c.id);
      toast({ title: "Coupon deleted", description: c.code });
      await loadCoupons();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  }

  async function toggleCouponStatus(c: CouponRow) {
    const next = c.status === "Active" ? "Paused" : "Active";
    try {
      await api.updateCoupon(c.id, { status: next });
      toast({ title: next === "Paused" ? "Coupon paused" : "Coupon activated", description: c.code });
      await loadCoupons();
    } catch (e) {
      toast({
        title: "Status update failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  }

  const activeCoupons = coupons.filter((c) => c.status === "Active").length;

  return (
    <PageShell>
      <PageHeader
        title="Coupons"
        subtitle="Create and manage discount codes. Expiry, min order, and usage limits are enforced on quotations."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard icon={Ticket} label="Active Coupons" value={String(activeCoupons)} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" index={0} />
        <MetricCard icon={Tag} label="Total Coupons" value={String(coupons.length)} color="bg-sky-100 text-primary dark:bg-sky-500/15 dark:text-sky-400" index={1} />
        <MetricCard icon={Calendar} label="Expired / Paused" value={String(coupons.filter((c) => c.status !== "Active").length)} color="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" index={2} />
        <MetricCard icon={MousePointerClick} label="Total Redemptions" value={String(coupons.reduce((s, c) => s + c.used, 0))} color="bg-teal-100 text-brand-teal dark:bg-teal-500/15 dark:text-teal-400" index={3} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {couponsLoading ? "Loading…" : `${coupons.length} coupons · ${activeCoupons} active`}
          {" · "}Apply codes from Quotations
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadCoupons()} disabled={couponsLoading}>Refresh</Button>
          <Button
            className="bg-gradient-to-r from-teal-600 to-emerald-600"
            onClick={() => { setEditingCoupon(null); setCouponForm(emptyCouponForm); setCouponOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Create Coupon
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[28rem] overflow-auto scroll-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Min order</TableHead>
                  <TableHead className="text-right">Usage</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Valid Till</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {couponsLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading coupons…
                    </TableCell>
                  </TableRow>
                )}
                {!couponsLoading && coupons.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No coupons yet. Create one to offer discounts on quotations.
                    </TableCell>
                  </TableRow>
                )}
                {coupons.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/40">
                    <TableCell>
                      <code className="text-xs font-mono font-semibold px-2 py-1 rounded bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400">{c.code}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={c.type === "Flat" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-violet-50 text-violet-700 border-violet-200"}>
                        {c.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {c.type === "Flat" ? `₹${c.value}` : `${c.value}%`}
                      {c.maxDiscount ? <span className="block text-[10px] text-muted-foreground font-normal">max ₹{c.maxDiscount}</span> : null}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {c.minOrderAmount ? `₹${c.minOrderAmount.toLocaleString("en-IN")}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.used.toLocaleString("en-IN")}
                      {c.limit > 0 ? ` / ${c.limit.toLocaleString("en-IN")}` : " / ∞"}
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex items-center gap-2">
                        <Progress value={c.limit ? Math.min(100, (c.used / c.limit) * 100) : 0} className="h-1.5 w-20" />
                        <span className="text-[10px] text-muted-foreground">{c.limit ? Math.round((c.used / c.limit) * 100) : 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.validTill}</TableCell>
                    <TableCell><StatusBadge status={c.status} className="text-[10px] px-1.5 py-0" /></TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(c.code); toast({ title: "Copied", description: c.code }); }}>
                            <Copy className="w-4 h-4 mr-2" /> Copy Code
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setEditingCoupon(c);
                            setCouponForm({
                              code: c.code,
                              type: c.type,
                              value: String(c.value),
                              limit: c.limit ? String(c.limit) : "",
                              minOrder: c.minOrderAmount ? String(c.minOrderAmount) : "",
                              maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "",
                              validFrom: c.validFrom || "",
                              validTill: c.validTill,
                              description: c.description || "",
                              status: c.status,
                            });
                            setCouponOpen(true);
                          }}>
                            <Pencil className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          {c.status !== "Expired" && (
                            <DropdownMenuItem onClick={() => void toggleCouponStatus(c)}>
                              {c.status === "Active" ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                              {c.status === "Active" ? "Pause" : "Activate"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-rose-600" onClick={() => void deleteCoupon(c)}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
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

      <Dialog open={couponOpen} onOpenChange={(v) => { setCouponOpen(v); if (!v) setEditingCoupon(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-teal-600" /> {editingCoupon ? "Edit Coupon" : "Create Coupon"}
            </DialogTitle>
            <DialogDescription>
              Saved to the database. Expired, paused, over-limit, and min-order rules apply on quotation redeem.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-code">Coupon Code</Label>
              <Input id="cp-code" placeholder="FLY500" className="uppercase" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount Type</Label>
                <Select value={couponForm.type} onValueChange={(v) => setCouponForm({ ...couponForm, type: v as "Flat" | "Percent" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Flat">Flat (₹)</SelectItem>
                    <SelectItem value="Percent">Percent (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-val">Value</Label>
                <Input id="cp-val" type="number" placeholder="500" value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-lim">Usage Limit (0 = unlimited)</Label>
                <Input id="cp-lim" type="number" placeholder="1000" value={couponForm.limit} onChange={(e) => setCouponForm({ ...couponForm, limit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-min">Min order (₹)</Label>
                <Input id="cp-min" type="number" placeholder="0" value={couponForm.minOrder} onChange={(e) => setCouponForm({ ...couponForm, minOrder: e.target.value })} />
              </div>
            </div>
            {couponForm.type === "Percent" && (
              <div className="space-y-1.5">
                <Label htmlFor="cp-max">Max discount ₹ (optional)</Label>
                <Input id="cp-max" type="number" placeholder="e.g. 5000" value={couponForm.maxDiscount} onChange={(e) => setCouponForm({ ...couponForm, maxDiscount: e.target.value })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-from">Valid From</Label>
                <Input id="cp-from" type="date" value={couponForm.validFrom} onChange={(e) => setCouponForm({ ...couponForm, validFrom: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-valid">Valid Till</Label>
                <Input id="cp-valid" type="date" value={couponForm.validTill} onChange={(e) => setCouponForm({ ...couponForm, validTill: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={couponForm.status} onValueChange={(v) => setCouponForm({ ...couponForm, status: v as typeof couponForm.status })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Paused">Paused</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-desc">Description</Label>
              <Input id="cp-desc" placeholder="Shown internally" value={couponForm.description} onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCouponOpen(false)} disabled={couponSaving}>Cancel</Button>
            <Button className="bg-gradient-to-r from-teal-600 to-emerald-600" onClick={() => void saveCoupon()} disabled={couponSaving}>
              {couponSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              {editingCoupon ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
