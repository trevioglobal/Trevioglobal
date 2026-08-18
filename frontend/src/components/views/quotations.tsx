"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileText, Send, FileDown, Plus, Trash2, CheckCircle2, Clock,
  Mail, MessageCircle, Eye, TrendingUp, Wallet, Percent, Ticket, Loader2, Copy, Archive,
} from "lucide-react";
import { useDemoDataStore } from "@/store/demo-data-store";
import { useAuthStore } from "@/store/app-store";
import { api, ApiError } from "@/lib/api";
import type { Quotation } from "@/types";
import { mapApiQuotation } from "@/lib/api-mappers";
import {
  formatINR, formatFullINR, StatusBadge, PageHeader, PageShell, MetricCard,
} from "@/components/shared/ui-helpers";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { InternationalQuotationDialog } from "@/components/views/international-quotation";
import { ProductQuoteBuilderDialog } from "@/components/shared/product-quote-builder";
import { QuotationWizardDialog } from "@/components/views/quotation-wizard";
import {
  downloadQuotationPdf,
  getQuotationLineItems,
  shareQuotationViaEmail,
  shareQuotationViaWhatsApp,
} from "@/lib/quotation-actions";

const SERVICE_COLORS: Record<string, string> = {
  Flight: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  Hotel: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Holiday: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  International: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  Activity: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
  Transfer: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
};

interface QuoteItem { id: string; description: string; qty: number; price: number; }

function useProceedToBooking() {
  const { toast } = useToast();
  const upsertBooking = useDemoDataStore((s) => s.upsertBooking);
  const hydrateFromApi = useDemoDataStore((s) => s.hydrateFromApi);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function proceed(quote: Quotation) {
    if (quote.status !== "Accepted") {
      toast({
        title: "Quote must be Accepted",
        description: "Accept the quotation before converting it to a booking.",
        variant: "destructive",
      });
      return;
    }
    setBusyId(quote.id);
    try {
      const res = await api.proceedToBooking(quote.id);
      const booking = (await import("@/lib/api-mappers")).mapApiBooking(res.booking);
      upsertBooking(booking);
      await hydrateFromApi().catch(() => undefined);
      toast({
        title: "Booking created",
        description: `${booking.bookingRef} — open Bookings to continue passenger details`,
      });
    } catch (e) {
      toast({
        title: "Proceed to Booking failed",
        description: e instanceof ApiError ? e.message : "Could not create booking",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return { proceed, busyId };
}

function useQuoteActions() {
  const { toast } = useToast();
  const updateQuotationStatus = useDemoDataStore((s) => s.updateQuotationStatus);
  const upsertQuotation = useDemoDataStore((s) => s.upsertQuotation);

  async function loadFull(quote: Quotation): Promise<Quotation> {
    try {
      const res = await api.getQuotationFull(quote.id);
      const mapped = mapApiQuotation(res.quotation);
      upsertQuotation(mapped);
      return mapped;
    } catch {
      return quote;
    }
  }

  async function pdf(quote: Quotation) {
    const full = await loadFull(quote);
    const ok = await downloadQuotationPdf(full);
    toast({
      title: ok ? "Client PDF ready" : "Popup blocked",
      description: ok
        ? "Print dialog → Save as PDF. This is the customer brochure (no cost/profit). Attach it in email/WhatsApp."
        : "Allow popups to open the quotation PDF.",
      variant: ok ? "default" : "destructive",
    });
    return ok;
  }

  function email(quote: Quotation) {
    pdf(quote);
    shareQuotationViaEmail(quote);
    if (quote.status === "Draft") updateQuotationStatus(quote.id, "Sent");
    toast({
      title: "Email draft opened",
      description: "Attach the PDF from the print dialog, then send to the client.",
    });
  }

  function whatsapp(quote: Quotation) {
    pdf(quote);
    shareQuotationViaWhatsApp(quote);
    if (quote.status === "Draft") updateQuotationStatus(quote.id, "Sent");
    toast({
      title: "WhatsApp opened",
      description: "Message pre-filled. Attach the PDF quotation if the client needs the full document.",
    });
  }

  function markSent(quote: Quotation) {
    updateQuotationStatus(quote.id, "Sent");
    toast({ title: "Marked as sent", description: `${quote.quoteNo} → ${quote.customerName}` });
  }

  return { pdf, email, whatsapp, markSent };
}

function CreateQuotationDialog() {
  const { toast } = useToast();
  const { pdf, email, whatsapp } = useQuoteActions();
  const customers = useDemoDataStore((s) => s.customers);
  const addQuotation = useDemoDataStore((s) => s.addQuotation);
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [service, setService] = useState("Flight");
  const [items, setItems] = useState<QuoteItem[]>([
    { id: "1", description: "Flight - DEL → DXB (Return)", qty: 1, price: 28000 },
  ]);
  const [discount, setDiscount] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [shareQuote, setShareQuote] = useState<Quotation | null>(null);

  const selectedCustomer = customers.find((c) => c.name === customer);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const couponDiscountAmount = Math.min(subtotal, appliedCoupon?.discountAmount ?? 0);
  const afterCoupon = Math.max(0, subtotal - couponDiscountAmount);
  const manualDiscountAmount = Math.round((afterCoupon * discount) / 100);
  const taxableAmount = Math.max(0, afterCoupon - manualDiscountAmount);
  const gst = Math.round(taxableAmount * 0.18);
  const total = taxableAmount + gst;

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      toast({ title: "Enter a coupon code", variant: "destructive" });
      return;
    }
    if (subtotal <= 0) {
      toast({ title: "Add line items first", description: "Coupon needs an order amount.", variant: "destructive" });
      return;
    }
    setCouponBusy(true);
    try {
      const res = await api.validateCoupon({
        code,
        orderAmount: subtotal,
        agencyId: user?.agencyId || undefined,
      });
      setAppliedCoupon({ code: res.coupon.code, discountAmount: res.discountAmount });
      setCouponCode(res.coupon.code);
      toast({ title: "Coupon applied", description: `${res.coupon.code} · −₹${res.discountAmount.toLocaleString("en-IN")}` });
    } catch (e) {
      setAppliedCoupon(null);
      toast({
        title: "Coupon not valid",
        description: e instanceof ApiError || e instanceof Error ? e.message : "Try another code",
        variant: "destructive",
      });
    } finally {
      setCouponBusy(false);
    }
  }

  function addRow() {
    setItems([...items, { id: Date.now().toString(), description: "", qty: 1, price: 0 }]);
  }
  function removeRow(id: string) {
    setItems(items.filter((i) => i.id !== id));
  }
  function updateRow(id: string, field: keyof QuoteItem, value: string | number) {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  }

  function save(asDraft: boolean) {
    if (!customer) {
      toast({ title: "Select customer", description: "Please choose a customer first", variant: "destructive" });
      return;
    }
    if (items.length === 0 || subtotal === 0) {
      toast({ title: "Add line items", description: "Add at least one item with a price", variant: "destructive" });
      return;
    }
    const quote = addQuotation({
      customerName: customer,
      service: service as Quotation["service"],
      items: items.length,
      amount: taxableAmount,
      gst,
      total,
      validTill: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      createdBy: user?.name || "Team",
      contactEmail: selectedCustomer?.email,
      contactPhone: selectedCustomer?.phone,
      status: asDraft ? "Draft" : "Sent",
      couponCode: appliedCoupon?.code,
      couponDiscount: appliedCoupon?.discountAmount ?? 0,
      lineItems: items.map((i) => ({
        description: i.description || `${service} item`,
        qty: i.qty,
        price: i.price,
      })),
    });
    toast({
      title: asDraft ? "Quotation saved as draft" : "Quotation created",
      description: `${customer} · Total ${formatINR(total)}${appliedCoupon ? ` · ${appliedCoupon.code}` : ""}`,
    });
    setOpen(false);
    setCustomer("");
    setService("Flight");
    setItems([{ id: "1", description: "", qty: 1, price: 0 }]);
    setDiscount(0);
    setCouponCode("");
    setAppliedCoupon(null);
    if (!asDraft) setShareQuote(quote);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1" /> Create Quotation
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Quotation</DialogTitle>
            <DialogDescription>
              Build a client quote from their requirements, then download PDF or share via email / WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Customer</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Type</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Flight", "Hotel", "Holiday"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Line Items</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
                <Plus className="w-3 h-3 mr-1" /> Add Row
              </Button>
            </div>
            <div className="rounded-lg border max-h-48 overflow-y-auto scroll-thin">
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 p-2 border-b last:border-0 items-center">
                  <Input
                    className="col-span-6 h-8 text-xs"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateRow(item.id, "description", e.target.value)}
                  />
                  <Input
                    className="col-span-2 h-8 text-xs"
                    type="number"
                    placeholder="Qty"
                    value={item.qty}
                    onChange={(e) => updateRow(item.id, "qty", Number(e.target.value))}
                  />
                  <Input
                    className="col-span-3 h-8 text-xs"
                    type="number"
                    placeholder="Price ₹"
                    value={item.price}
                    onChange={(e) => updateRow(item.id, "price", Number(e.target.value))}
                  />
                  <Button variant="ghost" size="sm" className="col-span-1 h-8 text-rose-500" onClick={() => removeRow(item.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Coupon code</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Ticket className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 uppercase"
                  placeholder="e.g. FLY500"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    if (appliedCoupon) setAppliedCoupon(null);
                  }}
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void applyCoupon()} disabled={couponBusy}>
                {couponBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </Button>
              {appliedCoupon && (
                <Button type="button" variant="ghost" onClick={() => { setAppliedCoupon(null); setCouponCode(""); }}>
                  Clear
                </Button>
              )}
            </div>
            {appliedCoupon && (
              <p className="text-xs text-emerald-600">
                {appliedCoupon.code} applied (−{formatFullINR(appliedCoupon.discountAmount)})
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Extra discount (%)</Label>
              <div className="relative">
                <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="pl-8" />
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatFullINR(subtotal)}</span></div>
              {couponDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Coupon ({appliedCoupon?.code})</span>
                  <span>-{formatFullINR(couponDiscountAmount)}</span>
                </div>
              )}
              {manualDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Extra ({discount}%)</span>
                  <span>-{formatFullINR(manualDiscountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">GST @ 18%</span><span>{formatFullINR(gst)}</span></div>
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold text-sm"><span>Total</span><span className="text-teal-600">{formatFullINR(total)}</span></div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => save(true)}>Save as Draft</Button>
            <Button onClick={() => save(false)} className="bg-primary hover:bg-primary/90">
              <Send className="w-4 h-4 mr-1" /> Save & Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!shareQuote} onOpenChange={(v) => { if (!v) setShareQuote(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share with client</DialogTitle>
            <DialogDescription>
              {shareQuote?.quoteNo} · {shareQuote?.customerName} · {shareQuote ? formatFullINR(shareQuote.total) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              variant="outline"
              onClick={() => shareQuote && pdf(shareQuote)}
            >
              <FileDown className="w-4 h-4 mr-2" /> Download PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => shareQuote && email(shareQuote)}
            >
              <Mail className="w-4 h-4 mr-2" /> Email client
            </Button>
            <Button
              variant="outline"
              onClick={() => shareQuote && whatsapp(shareQuote)}
            >
              <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp client
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShareQuote(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const APPROVAL_STEPS = [
  { key: "Draft", icon: FileText, color: "text-slate-500 bg-slate-100 dark:bg-slate-500/15" },
  { key: "Pending Approval", icon: Clock, color: "text-amber-500 bg-amber-100 dark:bg-amber-500/15" },
  { key: "Approved", icon: CheckCircle2, color: "text-emerald-500 bg-emerald-100 dark:bg-emerald-500/15" },
];

function approvalIndex(q: Quotation) {
  if (
    ["Sent to Agent", "Sent", "Customer Reviewing", "Accepted", "Converted to Booking"].includes(q.status) ||
    q.approvalStatus === "Approved"
  ) return 2;
  if (q.status === "Pending Approval" || q.approvalStatus === "Pending") return 1;
  return 0;
}

function QuoteDetailDialog({ quote, open, onOpenChange }: { quote: Quotation | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const isAgent = user?.role === "travel_agent";
  const { pdf, email, whatsapp } = useQuoteActions();
  const { proceed, busyId } = useProceedToBooking();
  const upsertQuotation = useDemoDataStore((s) => s.upsertQuotation);
  const [full, setFull] = useState<Quotation | null>(null);
  const [extendDate, setExtendDate] = useState("");
  const [versions, setVersions] = useState<NonNullable<Quotation["versions"]>>([]);

  useEffect(() => {
    if (!open || !quote) return;
    setFull(quote);
    setExtendDate(quote.validTill?.slice(0, 10) || "");
    api.getQuotationFull(quote.id)
      .then((res) => {
        const mapped = mapApiQuotation(res.quotation);
        setFull(mapped);
        upsertQuotation(mapped);
        setVersions(mapped.versions || []);
        setExtendDate(mapped.validTill?.slice(0, 10) || "");
      })
      .catch(() => undefined);
    if (!isAgent) {
      api.getQuotationVersions(quote.id)
        .then((res) => setVersions(res.versions || []))
        .catch(() => undefined);
    }
  }, [open, quote, isAgent, upsertQuotation]);

  if (!quote) return null;
  const display = full || quote;
  const items = getQuotationLineItems(display);
  const step = approvalIndex(display);

  async function refresh() {
    const res = await api.getQuotationFull(display.id);
    const mapped = mapApiQuotation(res.quotation);
    setFull(mapped);
    upsertQuotation(mapped);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                {display.quoteNo}
                <StatusBadge status={display.status} />
              </DialogTitle>
              <DialogDescription>
                {display.customerName} · {display.service}
                {display.destination ? ` · ${display.destination}` : ""}
                {" · "}Created {new Date(display.createdAt).toLocaleDateString("en-IN")}
                {display.currentVersion ? ` · v${display.currentVersion}` : ""}
              </DialogDescription>
            </div>
            <Badge variant="secondary" className={SERVICE_COLORS[display.service]}>{display.service}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 bg-muted/20">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Approval Workflow</p>
            <div className="flex items-center justify-between">
              {APPROVAL_STEPS.map((s, i) => (
                <div key={s.key} className="flex-1 flex flex-col items-center relative">
                  {i < APPROVAL_STEPS.length - 1 && (
                    <div className={cn("absolute top-4 left-1/2 w-full h-0.5", i < step ? "bg-emerald-400" : "bg-border")} />
                  )}
                  <div className={cn("relative z-10 w-8 h-8 rounded-full flex items-center justify-center", i <= step ? s.color : "bg-muted text-muted-foreground")}>
                    <s.icon className="w-4 h-4" />
                  </div>
                  <p className={cn("text-[10px] mt-1 text-center", i <= step ? "font-medium" : "text-muted-foreground")}>{s.key}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">#</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs text-center">Qty</TableHead>
                  <TableHead className="text-xs text-right">Price</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{i + 1}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-2">
                        {it.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.imageUrl} alt="" className="w-10 h-8 rounded object-cover border" />
                        ) : null}
                        <span>{it.description}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-center">{it.qty}</TableCell>
                    <TableCell className="text-xs text-right">{formatFullINR(it.price)}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{formatFullINR(it.qty * it.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Valid Till</span><span>{new Date(display.validTill).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created By</span><span>{display.createdBy}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{display.items}</span></div>
              {display.contactEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{display.contactEmail}</span></div>}
              {display.contactPhone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{display.contactPhone}</span></div>}
              {!isAgent && display.internalNotes && (
                <div className="rounded border border-amber-200 bg-amber-50 dark:bg-amber-500/10 p-2 mt-2">
                  <p className="text-[10px] uppercase text-amber-800">Internal notes</p>
                  <p>{display.internalNotes}</p>
                </div>
              )}
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Package</span><span>{formatFullINR(display.amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>{formatFullINR(display.gst)}</span></div>
              {display.discountAmount ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>{formatFullINR(display.discountAmount)}</span></div> : null}
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold text-sm"><span>Total</span><span className="text-teal-600">{formatFullINR(display.total)}</span></div>
              {display.perPersonCost != null && <div className="flex justify-between text-muted-foreground"><span>Per person</span><span>{formatFullINR(display.perPersonCost)}</span></div>}
              {!isAgent && display.totalNetCost != null && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between text-amber-800 dark:text-amber-300"><span>Net cost</span><span>{formatFullINR(display.totalNetCost)}</span></div>
                  <div className="flex justify-between text-amber-800 dark:text-amber-300"><span>Profit</span><span>{formatFullINR(display.grossProfit || 0)}</span></div>
                  <div className="flex justify-between text-amber-800 dark:text-amber-300"><span>Margin</span><span>{display.profitMargin ?? 0}%</span></div>
                </>
              )}
            </div>
          </div>

          {!isAgent && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">Validity & versions</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <Label className="text-[10px]">Extend valid until</Label>
                  <Input className="h-8 w-40 text-xs" type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    const res = await api.extendQuotation(display.id, extendDate);
                    upsertQuotation(mapApiQuotation(res.quotation));
                    setFull(mapApiQuotation(res.quotation));
                    toast({ title: "Validity updated" });
                  } catch (e) {
                    toast({ title: "Extend failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                  }
                }}>Extend / renew</Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    await api.createQuotationVersion(display.id, { changeSummary: "Manual snapshot" });
                    const res = await api.getQuotationVersions(display.id);
                    setVersions(res.versions || []);
                    toast({ title: "Version saved" });
                  } catch (e) {
                    toast({ title: "Version failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                  }
                }}>Save version</Button>
              </div>
              {versions.length > 0 && (
                <div className="max-h-28 overflow-y-auto text-xs space-y-1">
                  {versions.map((v) => (
                    <div key={v.id} className="flex justify-between items-center gap-2">
                      <span>v{v.versionNumber} · {v.changeSummary || "Snapshot"} · {new Date(v.createdAt).toLocaleString("en-IN")}</span>
                      <Button size="sm" variant="ghost" className="h-7" onClick={async () => {
                        try {
                          const res = await api.restoreQuotationVersion(display.id, v.id);
                          const mapped = mapApiQuotation(res.quotation);
                          setFull(mapped);
                          upsertQuotation(mapped);
                          toast({ title: `Restored v${v.versionNumber}` });
                        } catch (e) {
                          toast({ title: "Restore failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                        }
                      }}>Restore</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => pdf(display)}><FileDown className="w-3.5 h-3.5 mr-1" /> Download PDF</Button>
            <Button variant="outline" size="sm" onClick={() => email(display)}><Mail className="w-3.5 h-3.5 mr-1" /> Email</Button>
            <Button variant="outline" size="sm" onClick={() => whatsapp(display)}><MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp</Button>
            {["Sent", "Sent to Agent", "Customer Reviewing", "Draft", "In Progress"].includes(display.status) && (
              <Button variant="outline" size="sm" onClick={async () => {
                try {
                  await api.acceptQuotation(display.id, { personName: display.customerName });
                  await refresh();
                  toast({ title: "Quotation accepted", description: "Convert to Booking is now available for employees" });
                } catch (e) {
                  toast({ title: "Accept failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                }
              }}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accept Quote
              </Button>
            )}
            {["Sent to Agent", "Customer Reviewing", "Sent"].includes(display.status) && (
              <Button variant="outline" size="sm" onClick={async () => {
                try {
                  await api.requestQuotationRevision(display.id, { comments: "Please revise pricing / hotels" });
                  await refresh();
                  toast({ title: "Revision requested" });
                } catch (e) {
                  toast({ title: "Revision failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                }
              }}>
                Request Revision
              </Button>
            )}
            {!isAgent && (display.status === "Accepted" || display.status === "Converted to Booking") && (
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={busyId === display.id || display.status === "Converted to Booking"}
                onClick={() => proceed(display)}
              >
                {busyId === display.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Ticket className="w-3.5 h-3.5 mr-1" />}
                {display.status === "Converted to Booking" ? "Booking Created" : "Convert to Booking"}
              </Button>
            )}
            {!isAgent && ["Draft", "In Progress"].includes(display.status) && (
              <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={async () => {
                try {
                  await api.submitQuotationApproval(display.id);
                  await refresh();
                  toast({ title: "Submitted for approval" });
                } catch (e) {
                  toast({ title: "Submit failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                }
              }}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Submit Approval
              </Button>
            )}
            {!isAgent && display.status === "Pending Approval" && (
              <Button size="sm" className="ml-auto" onClick={async () => {
                try {
                  await api.approveQuotation(display.id, { readyToSend: true, stage: "Team Lead" });
                  await refresh();
                  toast({ title: "Approved & ready to send" });
                } catch (e) {
                  toast({ title: "Approve failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                }
              }}>
                Approve & Send
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QuotationsView() {
  const { toast } = useToast();
  const { pdf, markSent } = useQuoteActions();
  const user = useAuthStore((s) => s.user);
  const quotations = useDemoDataStore((s) => s.quotations);
  const upsertQuotation = useDemoDataStore((s) => s.upsertQuotation);
  const hydrateFromApi = useDemoDataStore((s) => s.hydrateFromApi);
  const [selected, setSelected] = useState<Quotation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editWizardId, setEditWizardId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sort, setSort] = useState("latest");
  const [travelFrom, setTravelFrom] = useState("");
  const [travelTo, setTravelTo] = useState("");
  const [analytics, setAnalytics] = useState<Record<string, number | undefined>>({});
  const isAgent = user?.role === "travel_agent";

  useEffect(() => {
    api.getQuotationAnalytics()
      .then((a) => setAnalytics(a as Record<string, number | undefined>))
      .catch(() => undefined);
    const params: Record<string, string> = { pageSize: "100", sort };
    if (statusFilter !== "All") params.status = statusFilter;
    if (search.trim()) params.q = search.trim();
    if (travelFrom) params.travelFrom = travelFrom;
    if (travelTo) params.travelTo = travelTo;
    api.getQuotationsManage(params)
      .then((res) => {
        res.quotations.forEach((q) => upsertQuotation(mapApiQuotation(q)));
      })
      .catch(() => undefined);
  }, [sort, statusFilter, search, travelFrom, travelTo, upsertQuotation]);

  const filtered = useMemo(() => {
    let list = quotations;
    if (statusFilter !== "All") list = list.filter((q) => q.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((qt) =>
        qt.quoteNo.toLowerCase().includes(q) ||
        qt.customerName.toLowerCase().includes(q) ||
        (qt.destination || "").toLowerCase().includes(q) ||
        (qt.agentName || "").toLowerCase().includes(q) ||
        (qt.salesExecutiveName || "").toLowerCase().includes(q) ||
        (qt.enquiryRef || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [search, quotations, statusFilter]);

  const stats = [
    { icon: FileText, label: "Total Quotes", value: String(analytics.total ?? quotations.length), color: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400" },
    { icon: Clock, label: "In Progress", value: String(analytics.inProgress ?? 0), color: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400" },
    { icon: Send, label: "Sent", value: String(analytics.sent ?? 0), color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400" },
    { icon: CheckCircle2, label: "Accepted", value: String(analytics.accepted ?? 0), color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
    { icon: Ticket, label: "Converted", value: String(analytics.converted ?? 0), color: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" },
    { icon: TrendingUp, label: "Conversion", value: `${analytics.conversionRate ?? 0}%`, color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
    { icon: Wallet, label: "Quoted Value", value: formatINR(Number(analytics.totalQuotedValue ?? 0)), color: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" },
    ...(!isAgent && analytics.expectedProfit != null
      ? [{ icon: Percent, label: "Expected Profit", value: formatINR(Number(analytics.expectedProfit)), color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" }]
      : []),
  ];

  function openDetail(q: Quotation) {
    setSelected(q);
    setDetailOpen(true);
  }

  async function runAction(label: string, fn: () => Promise<void>) {
    try {
      await fn();
      toast({ title: label });
      await hydrateFromApi();
      const a = await api.getQuotationAnalytics();
      setAnalytics(a as Record<string, number | undefined>);
    } catch (e) {
      toast({ title: `${label} failed`, description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Quotation Management"
        subtitle="Enquiry → draft → approval → send → revise → accept → convert to booking"
        action={
          <div className="flex flex-wrap gap-2">
            {!isAgent && (
              <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => { setEditWizardId(null); setWizardOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Create New Quote
              </Button>
            )}
            {!isAgent && <ProductQuoteBuilderDialog />}
            {!isAgent && <InternationalQuotationDialog />}
            {!isAgent && <CreateQuotationDialog />}
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {stats.map((s, i) => <MetricCard key={s.label} {...s} index={i} />)}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            <Input
              placeholder="Search quote no, customer, agent, destination, enquiry…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm h-9"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["All", "Draft", "In Progress", "Pending Approval", "Sent to Agent", "Customer Reviewing", "Revision Requested", "Accepted", "Rejected", "Expired", "Converted to Booking", "Archived"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="value">Quote Value</SelectItem>
                {!isAgent && <SelectItem value="profit">Profit</SelectItem>}
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="travel">Travel date</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Travel from</Label>
              <Input type="date" className="h-9 w-36" value={travelFrom} onChange={(e) => setTravelFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground whitespace-nowrap">to</Label>
              <Input type="date" className="h-9 w-36" value={travelTo} onChange={(e) => setTravelTo(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border border-border max-h-[60vh] overflow-y-auto scroll-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Quote No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valid Till</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q) => (
                  <TableRow key={q.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium text-xs">{q.quoteNo}</TableCell>
                    <TableCell className="text-xs">
                      <div>{q.customerName}</div>
                      {q.destination && <div className="text-[10px] text-muted-foreground">{q.destination}</div>}
                    </TableCell>
                    <TableCell><Badge variant="secondary" className={cn("text-[10px]", SERVICE_COLORS[q.service])}>{q.service}</Badge></TableCell>
                    <TableCell className="text-center text-xs">{q.items}</TableCell>
                    <TableCell className="text-right text-xs">{formatFullINR(q.amount)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatFullINR(q.gst)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{formatFullINR(q.total)}</TableCell>
                    <TableCell><StatusBadge status={q.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(q.validTill).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                    <TableCell className="text-xs">{q.createdBy}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View" onClick={() => openDetail(q)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {!isAgent && ["Draft", "In Progress", "Revision Requested"].includes(q.status) && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit wizard" onClick={() => { setEditWizardId(q.id); setWizardOpen(true); }}>
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {!isAgent && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Duplicate" onClick={() => runAction("Duplicated", async () => {
                            const res = await api.duplicateQuotation(q.id);
                            upsertQuotation(mapApiQuotation(res.quotation));
                          })}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-cyan-600" title="Share / send" onClick={() => runAction("Shared", async () => {
                          const res = await api.shareQuotation(q.id, {
                            channel: "Email",
                            recipient: q.contactEmail,
                            appOrigin: window.location.origin,
                          });
                          if (res.mailto) window.location.href = res.mailto;
                          else markSent(q);
                        })}>
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600" title="Download PDF" onClick={() => pdf(q)}>
                          <FileDown className="w-3.5 h-3.5" />
                        </Button>
                        {!isAgent && q.status === "Draft" && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title="Delete draft" onClick={() => runAction("Draft deleted", () => api.deleteQuotationDraft(q.id).then(() => undefined))}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {!isAgent && q.status !== "Archived" && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Archive" onClick={() => runAction("Archived", () => api.archiveQuotation(q.id).then(() => undefined))}>
                            <Archive className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">No quotations found. Create a quote with the wizard to start.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <QuoteDetailDialog quote={selected} open={detailOpen} onOpenChange={setDetailOpen} />
      <QuotationWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        quotationId={editWizardId}
        onSaved={(q) => upsertQuotation(q)}
      />
    </PageShell>
  );
}
