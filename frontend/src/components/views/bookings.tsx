"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plane, Building2, Palmtree, Search, Eye, Loader2,
} from "lucide-react";
import { useDemoDataStore } from "@/store/demo-data-store";
import { useAuthStore } from "@/store/app-store";
import { api, ApiError } from "@/lib/api";
import { mapApiBooking } from "@/lib/api-mappers";
import type { Booking, BookingPassenger } from "@/types";
import {
  formatINR, formatFullINR, StatusBadge, PageHeader, PageShell,
} from "@/components/shared/ui-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";

const SERVICE_ICON: Record<string, React.ElementType> = {
  Flight: Plane, Hotel: Building2, Holiday: Palmtree,
};

const STATUS_TABS = [
  { key: "All", label: "All" },
  { key: "Awaiting Passenger Details", label: "Awaiting Pax" },
  { key: "Pending Initial Payment", label: "Pending Pay" },
  { key: "Partially Paid", label: "Partial" },
  { key: "Payment Received", label: "Paid" },
  { key: "In Progress", label: "In Progress" },
  { key: "Partially Confirmed", label: "Partial Conf" },
  { key: "Confirmed", label: "Confirmed" },
  { key: "Travel Documents Ready", label: "Docs Ready" },
  { key: "Completed", label: "Completed" },
  { key: "Cancelled", label: "Cancelled" },
];

const TIMELINE = [
  "Draft",
  "Awaiting Passenger Details",
  "Pending Initial Payment",
  "Partially Paid",
  "Payment Received",
  "In Progress",
  "Partially Confirmed",
  "Confirmed",
  "Travel Documents Ready",
  "Completed",
];

const CHANGE_TYPES = [
  "Name Correction", "Hotel Upgrade", "Flight Date Change", "Extend Stay",
  "Add Insurance", "Request Partial Refund", "Request Booking Cancellation", "Other Request",
];

const ADDON_TYPES = [
  "Insurance", "SIM Card", "eSIM", "Lounge Access", "Cruise", "Extra Tours",
  "Private Transfer", "Meal Upgrade", "Airport Assistance", "Visa",
];

type TabKey = "overview" | "passengers" | "payments" | "ops" | "requests" | "finance";

function BookingDetailDialog({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const upsertBooking = useDemoDataStore((s) => s.upsertBooking);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [tasks, setTasks] = useState<{ id: string; title: string; status: string; priority: string; department?: string }[]>([]);
  const [audits, setAudits] = useState<{ id: string; action: string; userName: string; createdAt: string; details?: string }[]>([]);
  const [tab, setTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(false);
  const [passengers, setPassengers] = useState<BookingPassenger[]>([]);
  const [policiesOk, setPoliciesOk] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payLabel, setPayLabel] = useState("Advance");
  const [crType, setCrType] = useState(CHANGE_TYPES[0]);
  const [crDesc, setCrDesc] = useState("");
  const [addonType, setAddonType] = useState(ADDON_TYPES[0]);
  const [addonAmount, setAddonAmount] = useState("2500");
  const [busy, setBusy] = useState(false);

  const canFinance = user && (hasPermission(user, "finance") || ["super_admin", "agency_admin", "accountant"].includes(user.role));
  const canOps = user && (hasPermission(user, "bookings") || user.role === "operations");

  async function reload() {
    if (!bookingId) return;
    setLoading(true);
    try {
      const res = await api.getBookingFull(bookingId);
      const mapped = mapApiBooking(res.booking);
      setBooking(mapped);
      setPassengers((mapped.passengers || []).map((p) => ({ ...p })));
      setPoliciesOk(Boolean(mapped.policiesAcceptedAt));
      setTasks((res.tasks || []) as typeof tasks);
      setAudits((res.audits || []) as typeof audits);
      upsertBooking(mapped);
    } catch (e) {
      toast({
        title: "Failed to load booking",
        description: e instanceof ApiError ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && bookingId) {
      setTab("overview");
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookingId]);

  if (!bookingId) return null;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      toast({ title: label });
      await reload();
    } catch (e) {
      toast({
        title: label + " failed",
        description: e instanceof ApiError ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const stepIdx = booking ? Math.max(0, TIMELINE.indexOf(booking.status)) : 0;

  function updatePax(idx: number, patch: Partial<BookingPassenger>) {
    setPassengers((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {booking?.bookingRef || "Booking"}
            {booking && <StatusBadge status={booking.status} />}
            {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </DialogTitle>
          <DialogDescription>
            {booking
              ? `${booking.customerName} · ${booking.destination || booking.route} · ${booking.quoteNo || "No quote"}`
              : "Loading BMS booking…"}
          </DialogDescription>
        </DialogHeader>

        {!booking ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1 border-b pb-2">
              {([
                ["overview", "Overview"],
                ["passengers", "Passengers"],
                ["payments", "Payments"],
                ["ops", "Operations"],
                ["requests", "Requests"],
                ["finance", "Finance"],
              ] as [TabKey, string][]).map(([k, label]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={tab === k ? "default" : "ghost"}
                  onClick={() => setTab(k)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <SummaryCell label="Booking ID" value={booking.bookingRef} />
                  <SummaryCell label="Quotation" value={booking.quoteNo || "—"} />
                  <SummaryCell label="Destination" value={booking.destination || booking.route} />
                  <SummaryCell label="Travel Date" value={booking.travelDate} />
                  <SummaryCell label="Nights" value={String(booking.nights ?? "—")} />
                  <SummaryCell label="Rooms" value={String(booking.totalRooms ?? "—")} />
                  <SummaryCell label="Adults / Child / Inf" value={`${booking.adults ?? 0} / ${booking.children ?? 0} / ${booking.infants ?? 0}`} />
                  <SummaryCell label="Package Value" value={formatFullINR(booking.packageValue ?? booking.amount)} />
                  <SummaryCell label="Amount Paid" value={formatFullINR(booking.amountPaid ?? 0)} />
                  <SummaryCell label="Balance" value={formatFullINR(booking.balanceAmount ?? booking.amount)} />
                  <SummaryCell label="Sales" value={booking.salesExecutiveName || booking.agent} />
                  <SummaryCell label="Operations" value={booking.operationsExecutiveName || "—"} />
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Booking Timeline</p>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {TIMELINE.map((s, i) => (
                      <div
                        key={s}
                        className={cn(
                          "text-[10px] px-2 py-1 rounded whitespace-nowrap",
                          i <= stepIdx ? "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-3 space-y-2 text-xs">
                      <p className="font-semibold">Package Inclusions</p>
                      <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                        {(Array.isArray(booking.packageIncludes) ? booking.packageIncludes : []).slice(0, 8).map((x, i) => (
                          <li key={i}>{String(x)}</li>
                        ))}
                        {!Array.isArray(booking.packageIncludes) || booking.packageIncludes.length === 0 ? (
                          <li>As per quotation</li>
                        ) : null}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 space-y-2 text-xs">
                      <p className="font-semibold">Policies</p>
                      <p className="text-muted-foreground line-clamp-3">{booking.termsAndConditions || "See quotation T&Cs"}</p>
                      <p className="text-muted-foreground line-clamp-2">{booking.paymentTerms || "Payment policy on file"}</p>
                      <p className="text-muted-foreground line-clamp-2">{booking.cancellationPolicy || "Cancellation policy on file"}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <Checkbox
                          id="pol"
                          checked={policiesOk}
                          disabled={Boolean(booking.policiesAcceptedAt) || busy}
                          onCheckedChange={(v) => setPoliciesOk(Boolean(v))}
                        />
                        <Label htmlFor="pol" className="text-xs">I accept booking, payment & cancellation policies</Label>
                      </div>
                      {!booking.policiesAcceptedAt && (
                        <Button
                          size="sm"
                          disabled={!policiesOk || busy}
                          onClick={() => run("Policies accepted", async () => {
                            await api.acceptBookingPolicies(booking.id);
                          })}
                        >
                          Accept & Enable Booking
                        </Button>
                      )}
                      {booking.policiesAcceptedAt && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Policies accepted</Badge>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Documents marked ready", () => api.markBookingDocumentsReady(booking.id).then(() => undefined))}>
                    Mark Docs Ready
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Trip completed", () => api.completeBooking(booking.id).then(() => undefined))}>
                    Complete Trip
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => run("Cancelled", async () => {
                    await api.updateBooking(booking.id, { status: "Cancelled", paymentStatus: "Refunded" });
                  })}>
                    Cancel Booking
                  </Button>
                </div>

                {audits.length > 0 && (
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Audit Trail</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                      {audits.slice(0, 20).map((a) => (
                        <div key={a.id} className="flex justify-between gap-2 border-b border-border/50 py-1">
                          <span><span className="font-medium">{a.action}</span> · {a.userName}{a.details ? ` — ${a.details}` : ""}</span>
                          <span className="text-muted-foreground shrink-0">{new Date(a.createdAt).toLocaleString("en-IN")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "passengers" && (
              <div className="space-y-3">
                {passengers.map((p, idx) => (
                  <Card key={p.id || idx}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          Passenger {idx + 1} {p.isLead && <Badge className="ml-1">Lead</Badge>}
                          <span className="text-muted-foreground font-normal ml-2">Room {p.roomIndex + 1}</span>
                        </p>
                        {p.isLead && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !p.panNumber}
                            onClick={() => run("PAN verified", async () => {
                              const res = await api.verifyPassengerPan(booking.id, p.id, { panNumber: p.panNumber });
                              if (!res.verification.ok) throw new Error(res.verification.message);
                            })}
                          >
                            Verify PAN
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <Field label="Title" value={p.title || ""} onChange={(v) => updatePax(idx, { title: v })} />
                        <Field label="First Name *" value={p.firstName} onChange={(v) => updatePax(idx, { firstName: v })} />
                        <Field label="Last Name *" value={p.lastName} onChange={(v) => updatePax(idx, { lastName: v })} />
                        <Field label="Gender" value={p.gender || ""} onChange={(v) => updatePax(idx, { gender: v })} />
                        <Field label="DOB *" value={p.dateOfBirth || ""} onChange={(v) => updatePax(idx, { dateOfBirth: v })} placeholder="YYYY-MM-DD" />
                        <Field label="Nationality" value={p.nationality || ""} onChange={(v) => updatePax(idx, { nationality: v })} />
                        <Field label="Mobile" value={p.mobile || ""} onChange={(v) => updatePax(idx, { mobile: v })} />
                        <Field label="Email" value={p.email || ""} onChange={(v) => updatePax(idx, { email: v })} />
                        {p.isLead && !booking.isInternational && (
                          <Field label="PAN *" value={p.panNumber || ""} onChange={(v) => updatePax(idx, { panNumber: v.toUpperCase() })} />
                        )}
                        {booking.isInternational && (
                          <>
                            <Field label="Passport No *" value={p.passportNumber || ""} onChange={(v) => updatePax(idx, { passportNumber: v })} />
                            <Field label="Passport Expiry *" value={p.passportExpiry || ""} onChange={(v) => updatePax(idx, { passportExpiry: v })} placeholder="YYYY-MM-DD" />
                            <Field label="Passport Issue" value={p.passportIssueDate || ""} onChange={(v) => updatePax(idx, { passportIssueDate: v })} />
                          </>
                        )}
                      </div>
                      {p.isLead && (
                        <p className="text-[11px] text-muted-foreground">
                          PAN status: {p.panStatus || "Pending"}
                          {p.panRegisteredName ? ` · ${p.panRegisteredName}` : ""}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    disabled={busy || !booking.policiesAcceptedAt}
                    onClick={() => run("Passengers saved", async () => {
                      await api.saveBookingPassengers(booking.id, passengers);
                    })}
                  >
                    Save Passengers
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !passengers[0]?.id}
                    onClick={() => run("Document recorded", async () => {
                      const lead = passengers.find((p) => p.isLead) || passengers[0];
                      await api.uploadBookingDocument(booking.id, {
                        docType: booking.isInternational ? "Passport Front" : "PAN Card",
                        fileName: `${lead.firstName}-id.pdf`,
                        fileUrl: `data:application/pdf;base64,demo`,
                        mimeType: "application/pdf",
                        sizeBytes: 1024,
                        passengerId: lead.id,
                      });
                    })}
                  >
                    Upload Lead ID (demo)
                  </Button>
                </div>
                {!booking.policiesAcceptedAt && (
                  <p className="text-xs text-amber-600">Accept policies on Overview before saving passengers to advance status.</p>
                )}
                {(booking.documents || []).length > 0 && (
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">Documents</p>
                    {booking.documents!.map((d) => (
                      <div key={d.id} className="flex justify-between border-b py-1">
                        <span>{d.docType}: {d.fileName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "payments" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <SummaryCell label="Package" value={formatFullINR(booking.packageValue ?? booking.amount)} />
                  <SummaryCell label="Paid" value={formatFullINR(booking.amountPaid ?? 0)} />
                  <SummaryCell label="Outstanding" value={formatFullINR(booking.balanceAmount ?? 0)} />
                </div>
                {canFinance && (
                  <div className="flex flex-wrap gap-2 items-end border rounded-lg p-3">
                    <div>
                      <Label className="text-xs">Label</Label>
                      <Select value={payLabel} onValueChange={setPayLabel}>
                        <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Advance", "Installment", "Partial", "Final", "Additional"].map((l) => (
                            <SelectItem key={l} value={l}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Amount</Label>
                      <Input className="h-8 w-32" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Amount" />
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => run("Payment request created", async () => {
                        await api.createPaymentRequest(booking.id, { label: payLabel, amount: Number(payAmount) });
                        setPayAmount("");
                      })}
                    >
                      Create Payment Request
                    </Button>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(booking.paymentRequests || []).map((pr) => (
                      <TableRow key={pr.id}>
                        <TableCell className="text-xs">{pr.requestRef}</TableCell>
                        <TableCell className="text-xs">{pr.label}</TableCell>
                        <TableCell className="text-xs">{formatFullINR(pr.amount)}</TableCell>
                        <TableCell className="text-xs">{formatFullINR(pr.amountPaid)}</TableCell>
                        <TableCell><StatusBadge status={pr.status} /></TableCell>
                        <TableCell>
                          {pr.status !== "Paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => run("Payment recorded", async () => {
                                await api.payPaymentRequest(pr.id, { amount: pr.amount - pr.amountPaid, method: "Razorpay" });
                              })}
                            >
                              Pay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(booking.paymentRequests || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-6">
                          No payment requests yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {tab === "ops" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Confirm services and upload vouchers / tickets.</p>
                {(booking.services || []).map((svc) => (
                  <div key={svc.id} className="border rounded-lg p-3 flex flex-wrap items-center gap-2 justify-between">
                    <div className="text-xs">
                      <p className="font-semibold">{svc.serviceType}: {svc.title}</p>
                      <p className="text-muted-foreground">Status: {svc.status}</p>
                    </div>
                    {canOps && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => run(`${svc.serviceType} confirmed`, async () => {
                            await api.updateBookingService(booking.id, svc.id, {
                              status: "Confirmed",
                              confirmationNo: `CNF-${Date.now().toString().slice(-6)}`,
                              voucherUrl: `/vouchers/${booking.bookingRef}-${svc.serviceType}.pdf`,
                            });
                          })}
                        >
                          Confirm + Voucher
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                <Separator />
                <p className="text-xs font-semibold">Operational Tasks</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {tasks.map((t) => (
                    <div key={t.id} className="text-xs flex justify-between border-b py-1">
                      <span>{t.title} <Badge variant="secondary" className="ml-1">{t.priority}</Badge></span>
                      <span className="text-muted-foreground">{t.status}</span>
                    </div>
                  ))}
                  {tasks.length === 0 && <p className="text-xs text-muted-foreground">No tasks linked</p>}
                </div>
              </div>
            )}

            {tab === "requests" && (
              <div className="space-y-3">
                <div className="border rounded-lg p-3 space-y-2">
                  <Label className="text-xs">Request type</Label>
                  <Select value={crType} onValueChange={setCrType}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Textarea value={crDesc} onChange={(e) => setCrDesc(e.target.value)} placeholder="Describe the change…" className="text-xs" />
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => run("Change request submitted", async () => {
                      await api.createChangeRequest(booking.id, { requestType: crType, description: crDesc });
                      setCrDesc("");
                    })}
                  >
                    Submit Request
                  </Button>
                </div>
                {(booking.changeRequests || []).map((cr) => (
                  <div key={cr.id} className="border rounded-lg p-3 text-xs flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-semibold">{cr.requestRef} · {cr.requestType}</p>
                      <p className="text-muted-foreground">{cr.description || cr.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={cr.status} />
                      {cr.status === "Submitted" && canOps && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Under review", async () => {
                          await api.updateChangeRequest(cr.id, { status: "Under Review" });
                        })}>
                          Review
                        </Button>
                      )}
                      {cr.status === "Under Review" && canOps && (
                        <Button size="sm" disabled={busy} onClick={() => run("Completed", async () => {
                          await api.updateChangeRequest(cr.id, { status: "Completed", resolutionNotes: "Processed" });
                        })}>
                          Complete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "finance" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <SummaryCell label="Selling" value={formatFullINR(booking.amount)} />
                  <SummaryCell label="Cost" value={formatFullINR(booking.costPrice ?? 0)} />
                  <SummaryCell label="Gross Profit" value={formatFullINR(booking.grossProfit ?? 0)} />
                  <SummaryCell label="Net Profit" value={formatFullINR(booking.netProfit ?? 0)} />
                </div>
                {canFinance && (
                  <div className="flex flex-wrap gap-2">
                    {["Proforma", "Tax Invoice", "Credit Note", "Debit Note"].map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => run(`${t} generated`, async () => {
                          await api.createBookingInvoice(booking.id, { invoiceType: t });
                        })}
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold">Additional Inclusion</p>
                  <div className="flex flex-wrap gap-2 items-end">
                    <Select value={addonType} onValueChange={setAddonType}>
                      <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADDON_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="h-8 w-28" value={addonAmount} onChange={(e) => setAddonAmount(e.target.value)} />
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => run("Add-on added", async () => {
                        await api.createBookingAddOn(booking.id, {
                          addOnType: addonType,
                          title: addonType,
                          amount: Number(addonAmount) || 0,
                        });
                      })}
                    >
                      Add Inclusion
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {(booking.addOns || []).map((a) => (
                      <div key={a.id} className="text-xs flex justify-between">
                        <span>{a.title}</span>
                        <span>{formatFullINR(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-1">Invoices</p>
                  {(booking.invoices || []).map((inv) => (
                    <div key={inv.id} className="text-xs flex justify-between border-b py-1">
                      <span>{inv.invoiceNo} · {inv.invoiceType}</span>
                      <span>{formatFullINR(inv.total)}</span>
                    </div>
                  ))}
                  {(booking.invoices || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No invoices yet</p>
                  )}
                </div>
                {canFinance && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run("Supplier payout created", async () => {
                      await api.createSupplierPayout({
                        bookingId: booking.id,
                        supplierName: "Primary Supplier",
                        amount: booking.costPrice || Math.round(booking.amount * 0.7),
                        currency: "INR",
                        paymentMode: "NEFT",
                        utr: `UTR${Date.now().toString().slice(-10)}`,
                        paymentDate: new Date().toISOString().slice(0, 10),
                        status: "Paid",
                      });
                    })}
                  >
                    Record Supplier Payout
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium mt-0.5 break-words">{value}</p>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input className="h-8 text-xs" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function BookingsView() {
  const bookings = useDemoDataStore((s) => s.bookings);
  const [statusTab, setStatusTab] = useState("All");
  const [service, setService] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusTab !== "All" && b.status !== statusTab) return false;
      if (service !== "All" && b.service !== service) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !b.bookingRef.toLowerCase().includes(q) &&
          !b.customerName.toLowerCase().includes(q) &&
          !(b.destination || b.route).toLowerCase().includes(q) &&
          !(b.quoteNo || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [bookings, statusTab, service, search]);

  return (
    <PageShell>
      <PageHeader
        title="Booking Management"
        subtitle="Full BMS lifecycle — quotation conversion, passengers, payments, ops & finance"
      />

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Search ref, customer, destination…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["All", "Flight", "Hotel", "Holiday"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {STATUS_TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={statusTab === t.key ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setStatusTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Travel</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Paid / Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => {
                const Icon = SERVICE_ICON[b.service] || Plane;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{b.bookingRef}</p>
                          <p className="text-[11px] text-muted-foreground">{b.quoteNo || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{b.customerName}</TableCell>
                    <TableCell className="text-sm">{b.destination || b.route}</TableCell>
                    <TableCell className="text-sm">{b.travelDate}</TableCell>
                    <TableCell className="text-sm">{formatINR(b.packageValue ?? b.amount)}</TableCell>
                    <TableCell className="text-xs">
                      {formatINR(b.amountPaid ?? 0)}
                      <span className="text-muted-foreground"> / {formatINR(b.balanceAmount ?? b.amount)}</span>
                    </TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedId(b.id);
                          setDetailOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                    No bookings yet. Accept a quotation and click Proceed to Booking.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BookingDetailDialog
        bookingId={selectedId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </PageShell>
  );
}
