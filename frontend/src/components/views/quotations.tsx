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
import { mapApiQuotation } from "@/lib/api-mappers";

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
  const updateQuotationStatus = useDemoDataStore((s) => s.updateQuotationStatus);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function proceed(quote: Quotation) {
    setBusyId(quote.id);
    try {
      if (quote.status !== "Accepted") {
        updateQuotationStatus(quote.id, "Accepted");
        await api.updateQuotation(quote.id, { status: "Accepted" }).catch(() => undefined);
      }
      const res = await api.proceedToBooking(quote.id);
      const booking = (await import("@/lib/api-mappers")).mapApiBooking(res.booking);
      upsertBooking(booking);
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

  function pdf(quote: Quotation) {
    const ok = downloadQuotationPdf(quote);
    toast({
      title: ok ? "PDF ready" : "Popup blocked",
      description: ok
        ? "Use the print dialog → Save as PDF. Then share the file with your client."
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

function QuoteDetailDialog({ quote, open, onOpenChange }: { quote: Quotation | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const { pdf, email, whatsapp, markSent } = useQuoteActions();
  const { proceed, busyId } = useProceedToBooking();
  const updateQuotationStatus = useDemoDataStore((s) => s.updateQuotationStatus);
  const [approvalStep, setApprovalStep] = useState(0);
  if (!quote) return null;
  const items = getQuotationLineItems(quote);

  function requestApproval() {
    if (approvalStep < 2) {
      setApprovalStep(approvalStep + 1);
      toast({ title: "Approval workflow updated", description: `Status: ${APPROVAL_STEPS[approvalStep + 1].key}` });
    }
  }

  function acceptQuote() {
    if (!quote) return;
    updateQuotationStatus(quote.id, "Accepted");
    api.updateQuotation(quote.id, { status: "Accepted" }).catch(() => undefined);
    toast({ title: "Quotation accepted", description: "Proceed to Booking is now available" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                {quote.quoteNo}
                <StatusBadge status={quote.status} />
              </DialogTitle>
              <DialogDescription>
                {quote.customerName} · {quote.service}
                {quote.destination ? ` · ${quote.destination}` : ""}
                {" · "}Created {new Date(quote.createdAt).toLocaleDateString("en-IN")}
              </DialogDescription>
            </div>
            <Badge variant="secondary" className={SERVICE_COLORS[quote.service]}>{quote.service}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 bg-muted/20">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Approval Workflow</p>
            <div className="flex items-center justify-between">
              {APPROVAL_STEPS.map((step, i) => (
                <div key={step.key} className="flex-1 flex flex-col items-center relative">
                  {i < APPROVAL_STEPS.length - 1 && (
                    <div className={cn("absolute top-4 left-1/2 w-full h-0.5", i < approvalStep ? "bg-emerald-400" : "bg-border")} />
                  )}
                  <div className={cn("relative z-10 w-8 h-8 rounded-full flex items-center justify-center", i <= approvalStep ? step.color : "bg-muted text-muted-foreground")}>
                    <step.icon className="w-4 h-4" />
                  </div>
                  <p className={cn("text-[10px] mt-1 text-center", i <= approvalStep ? "font-medium" : "text-muted-foreground")}>{step.key}</p>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Valid Till</span><span>{new Date(quote.validTill).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created By</span><span>{quote.createdBy}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{quote.items}</span></div>
              {quote.contactEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{quote.contactEmail}</span></div>}
              {quote.contactPhone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{quote.contactPhone}</span></div>}
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatFullINR(quote.amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST @ 18%</span><span>{formatFullINR(quote.gst)}</span></div>
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold text-sm"><span>Total</span><span className="text-teal-600">{formatFullINR(quote.total)}</span></div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => pdf(quote)}><FileDown className="w-3.5 h-3.5 mr-1" /> Download PDF</Button>
            <Button variant="outline" size="sm" onClick={() => email(quote)}><Mail className="w-3.5 h-3.5 mr-1" /> Email</Button>
            <Button variant="outline" size="sm" onClick={() => whatsapp(quote)}><MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp</Button>
            {quote.status === "Draft" && (
              <Button variant="outline" size="sm" onClick={() => markSent(quote)}><Send className="w-3.5 h-3.5 mr-1" /> Mark Sent</Button>
            )}
            {["Sent", "Sent to Agent", "Customer Reviewing", "Draft", "In Progress"].includes(quote.status) && (
              <Button variant="outline" size="sm" onClick={async () => {
                try {
                  await api.acceptQuotation(quote.id, { personName: quote.customerName });
                  acceptQuote();
                } catch { acceptQuote(); }
              }}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accept Quote
              </Button>
            )}
            {["Sent to Agent", "Customer Reviewing", "Sent"].includes(quote.status) && (
              <Button variant="outline" size="sm" onClick={async () => {
                try {
                  await api.requestQuotationRevision(quote.id, { comments: "Please revise pricing / hotels" });
                  toast({ title: "Revision requested" });
                } catch (e) {
                  toast({ title: "Revision failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                }
              }}>
                Request Revision
              </Button>
            )}
            {(quote.status === "Accepted" || quote.status === "Converted to Booking" || approvalStep >= 2) && (
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={busyId === quote.id || quote.status === "Converted to Booking"}
                onClick={() => proceed(quote)}
              >
                {busyId === quote.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Ticket className="w-3.5 h-3.5 mr-1" />}
                {quote.status === "Converted to Booking" ? "Booking Created" : "Convert to Booking"}
              </Button>
            )}
            {["Draft", "In Progress"].includes(quote.status) && (
              <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={async () => {
                try {
                  await api.submitQuotationApproval(quote.id);
                  toast({ title: "Submitted for approval" });
                } catch {
                  requestApproval();
                }
              }}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Submit Approval
              </Button>
            )}
            {quote.status === "Pending Approval" && (
              <Button size="sm" className="ml-auto" onClick={async () => {
                try {
                  await api.approveQuotation(quote.id, { readyToSend: true, stage: "Team Lead" });
                  toast({ title: "Approved & ready to send" });
                } catch {
                  requestApproval();
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
  const [analytics, setAnalytics] = useState<Record<string, number | undefined>>({});
  const isAgent = user?.role === "travel_agent";

  useEffect(() => {
    api.getQuotationAnalytics()
      .then((a) => setAnalytics(a as Record<string, number | undefined>))
      .catch(() => undefined);
    api.getQuotationsManage({ pageSize: "100", sort })
      .then((res) => {
        res.quotations.forEach((q) => upsertQuotation(mapApiQuotation(q)));
      })
      .catch(() => undefined);
  }, [sort, upsertQuotation]);

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
                <SelectItem value="profit">Profit</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
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
                          const res = await api.shareQuotation(q.id, { channel: "Email", recipient: q.contactEmail });
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
