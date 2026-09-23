"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plane, Building2, Palmtree, Search, Eye, Loader2,
} from "lucide-react";
import { useDemoDataStore } from "@/store/demo-data-store";
import { useAuthStore } from "@/store/app-store";
import { api, ApiError, apiFetchBlob } from "@/lib/api";
import { mapApiBooking } from "@/lib/api-mappers";
import type { Booking, BookingPassenger, CostDeviationApproval, TravelDetailsRecord } from "@/types";
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
import { supplierTypesForService } from "@/lib/supplier-taxonomy";
import { downloadBookingInvoice, downloadBookingItinerary } from "@/lib/booking-documents";
import { payWithRazorpay } from "@/lib/razorpay";
import type { SupplierRecord } from "@/types";

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

type TabKey = "overview" | "passengers" | "payments" | "travel" | "itinerary" | "ops" | "requests" | "finance";

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
  const [leadDocType, setLeadDocType] = useState("PASSPORT_FRONT");
  const [payAmount, setPayAmount] = useState("");
  const [payLabel, setPayLabel] = useState("Advance");
  const [crType, setCrType] = useState(CHANGE_TYPES[0]);
  const [crDesc, setCrDesc] = useState("");
  const [addonType, setAddonType] = useState(ADDON_TYPES[0]);
  const [addonAmount, setAddonAmount] = useState("2500");
  const [busy, setBusy] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [opsForm, setOpsForm] = useState<Record<string, { supplierId: string; costPrice: string; confirmationNo: string }>>({});
  const [voucherFiles, setVoucherFiles] = useState<Record<string, File | null>>({});
  const [proposedSelling, setProposedSelling] = useState("");
  const [sellingReason, setSellingReason] = useState("");
  const [travelForm, setTravelForm] = useState<TravelDetailsRecord>({ flights: [{}], hotel: {} });
  const [payoutDueDate, setPayoutDueDate] = useState("");
  const [payoutReminderDays, setPayoutReminderDays] = useState("2");
  const [payoutInvoiceUrl, setPayoutInvoiceUrl] = useState("");
  const [payoutServiceId, setPayoutServiceId] = useState("");
  const [itineraryDays, setItineraryDays] = useState<Array<Record<string, unknown>>>([]);
  const [driverForms, setDriverForms] = useState<Record<string, { driverName: string; vehicleNumber: string; driverPhone: string }>>({});
  const [adjustPrice, setAdjustPrice] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [opsAssigneeName, setOpsAssigneeName] = useState("");
  const [assignAgentId, setAssignAgentId] = useState("none");
  const [agents, setAgents] = useState<Array<{
    id: string;
    name: string;
    agentCode?: string | null;
    agency?: { name?: string | null; code?: string | null } | null;
  }>>([]);
  const [payMethod, setPayMethod] = useState("Bank Transfer");
  const [teamEmployees, setTeamEmployees] = useState<{ id: string; name: string; role: string }[]>([]);
  const [completeness, setCompleteness] = useState<{
    servicesByType: Record<string, number>;
    documents: number;
    hasItinerary: boolean;
    hasTerms: boolean;
    pricingLocked: boolean;
  } | null>(null);

  const isAgent = user?.role === "travel_agent";
  const canFinance = user && !isAgent && (hasPermission(user, "finance") || ["super_admin", "agency_admin", "accountant"].includes(user.role));
  const canOps = user && !isAgent && (user.role === "operations" || ["super_admin", "agency_admin", "branch_manager"].includes(user.role) || hasPermission(user, "suppliers"));
  const canAssign = Boolean(user && !isAgent && (canOps || ["sales_executive", "agency_admin", "branch_manager", "super_admin"].includes(user.role)));
  const canAssignAgent = Boolean(user && !isAgent && ["super_admin", "agency_admin", "branch_manager", "sales_executive"].includes(user.role));
  const canApproveDeviation = user && ["super_admin", "agency_admin"].includes(user.role);
  const canAdjustPrice = user && ["super_admin", "agency_admin"].includes(user.role);
  const canDownloadVouchers = !isAgent || booking?.paymentStatus !== "Pending" || ["Confirmed", "Partially Confirmed", "Travel Documents Ready", "Completed"].includes(booking?.status || "");
  const pendingDeviations = useMemo(
    () => (booking?.costDeviationApprovals || []).filter((d) => d.status === "Pending"),
    [booking?.costDeviationApprovals],
  );

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
      setCompleteness(res.completeness
        ? {
            servicesByType: res.completeness.servicesByType || {},
            documents: res.completeness.documents,
            hasItinerary: res.completeness.hasItinerary,
            hasTerms: res.completeness.hasTerms,
            pricingLocked: res.completeness.pricingLocked,
          }
        : null);
      const td = (mapped.travelDetails || { flights: [{}], hotel: {} }) as TravelDetailsRecord;
      setTravelForm({
        flights: td.flights?.length ? td.flights : [{}],
        hotel: td.hotel || {},
      });
      setItineraryDays(Array.isArray(mapped.itinerary) ? [...mapped.itinerary] : []);
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

  useEffect(() => {
    if (!open || !canAssign) return;
    api.getEmployees(user?.agencyId || undefined)
      .then((res) => setTeamEmployees(res.employees.map((e) => ({ id: e.id, name: e.name, role: e.role }))))
      .catch(() => undefined);
  }, [open, canAssign, user?.agencyId]);

  useEffect(() => {
    if (!open || !canAssignAgent) return;
    api.getAgents()
      .then((res) => setAgents(res.agents || []))
      .catch(() => setAgents([]));
  }, [open, canAssignAgent]);

  useEffect(() => {
    if (booking?.operationsExecutiveName) setOpsAssigneeName(booking.operationsExecutiveName);
  }, [booking?.operationsExecutiveName]);

  useEffect(() => {
    if (booking) setAssignAgentId(booking.agentId || "none");
  }, [booking?.id, booking?.agentId]);

  useEffect(() => {
    if (!open || tab !== "ops") return;
    api.getSuppliers({ status: "Active" })
      .then((res) => setSuppliers(res.suppliers || []))
      .catch(() => setSuppliers([]));
  }, [open, tab]);

  if (!bookingId) return null;

  async function run(label: string, fn: () => Promise<void>, opts?: { approvalOk?: boolean }) {
    setBusy(true);
    try {
      await fn();
      toast({ title: label });
      await reload();
    } catch (e) {
      if (opts?.approvalOk && e instanceof ApiError && e.code === "APPROVAL_REQUIRED") {
        toast({
          title: "Sent for super admin approval",
          description: e.message,
        });
        await reload();
        return;
      }
      toast({
        title: label + " failed",
        description: e instanceof ApiError ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function decideDeviation(dev: CostDeviationApproval, approve: boolean) {
    setBusy(true);
    try {
      if (approve) await api.approveCostDeviation(dev.id);
      else await api.rejectCostDeviation(dev.id);
      toast({ title: approve ? "Deviation approved" : "Deviation rejected" });
      await reload();
    } catch (e) {
      toast({
        title: "Action failed",
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
                ["travel", "Travel"],
                ...(canOps ? [["itinerary", "Itinerary"] as const] : []),
                ...(canOps ? [["ops", "Operations"] as const] : []),
                ["requests", "Requests"],
                ...(canFinance || !isAgent ? [["finance", "Finance"] as const] : []),
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
                  <SummaryCell
                    label="Quote version"
                    value={booking.quotationVersionNumber != null ? `v${booking.quotationVersionNumber}` : "—"}
                  />
                  <SummaryCell label="Destination" value={booking.destination || booking.route} />
                  <SummaryCell label="Travel Date" value={booking.travelDate} />
                  <SummaryCell label="Nights" value={String(booking.nights ?? "—")} />
                  <SummaryCell label="Rooms" value={String(booking.totalRooms ?? "—")} />
                  <SummaryCell label="Adults / Child / Inf" value={`${booking.adults ?? 0} / ${booking.children ?? 0} / ${booking.infants ?? 0}`} />
                  <SummaryCell label="Package Value" value={formatFullINR(booking.packageValue ?? booking.amount)} />
                  <SummaryCell label="Amount Paid" value={formatFullINR(booking.amountPaid ?? 0)} />
                  <SummaryCell label="Balance" value={formatFullINR(booking.balanceAmount ?? booking.amount)} />
                  <SummaryCell label="Sales" value={booking.salesExecutiveName || booking.agent} />
                  <SummaryCell label="Travel agent" value={booking.agentName || booking.agent || "—"} />
                  <SummaryCell label="Operations" value={booking.operationsExecutiveName || "—"} />
                </div>
                {completeness && (
                  <div className="rounded-lg border p-3 text-xs space-y-1">
                    <p className="font-semibold text-muted-foreground uppercase text-[10px]">Transferred components</p>
                    <p>
                      Services:{" "}
                      {Object.keys(completeness.servicesByType).length
                        ? Object.entries(completeness.servicesByType).map(([k, v]) => `${k}×${v}`).join(", ")
                        : "—"}
                    </p>
                    <p>
                      Documents: {completeness.documents}
                      {" · "}Itinerary: {completeness.hasItinerary ? "Yes" : "No"}
                      {" · "}Terms: {completeness.hasTerms ? "Yes" : "No"}
                      {" · "}Pricing locked: {completeness.pricingLocked ? "Yes" : "No"}
                    </p>
                  </div>
                )}

                {(canAssign || canAssignAgent) && (
                  <div className="flex flex-wrap items-end gap-2 border rounded-lg p-3">
                    {canAssignAgent && (
                      <div className="min-w-[220px] flex-1">
                        <Label className="text-xs">Assign travel agent</Label>
                        <Select value={assignAgentId || "none"} onValueChange={setAssignAgentId}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select registered agent" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No travel agent</SelectItem>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                                {a.agentCode ? ` · ${a.agentCode}` : ""}
                                {a.agency?.name ? ` · ${a.agency.name}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {canAssign && (
                      <div className="min-w-[200px]">
                        <Label className="text-xs">Assign operations</Label>
                        <Select
                          value={opsAssigneeName || "__none"}
                          onValueChange={(v) => setOpsAssigneeName(v === "__none" ? "" : v)}
                        >
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select ops" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Unassigned</SelectItem>
                            {teamEmployees.map((e) => (
                              <SelectItem key={e.id} value={e.name}>{e.name} ({e.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => run("Assignment saved", async () => {
                        const emp = teamEmployees.find((e) => e.name === opsAssigneeName);
                        await api.assignBookingExecutives(booking.id, {
                          ...(canAssign
                            ? {
                                operationsExecutiveName: opsAssigneeName || null,
                                operationsExecutiveId: emp?.id || null,
                              }
                            : {}),
                          ...(canAssignAgent
                            ? {
                                agentId: assignAgentId === "none" ? null : assignAgentId,
                              }
                            : {}),
                        });
                      })}
                    >
                      Save assignment
                    </Button>
                  </div>
                )}

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
                          onClick={() => run("Policies accepted — Book Now enabled", async () => {
                            await api.acceptBookingPolicies(booking.id);
                          })}
                        >
                          Book Now
                        </Button>
                      )}
                      {booking.policiesAcceptedAt && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Book Now unlocked</Badge>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {(booking.services || []).some((s) => s.voucherUrl || s.ticketUrl) && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-semibold">Vouchers & tickets</p>
                    {!canDownloadVouchers && (
                      <p className="text-[10px] text-amber-600">Available after booking is fully paid</p>
                    )}
                    {(booking.services || []).filter((s) => s.voucherUrl || s.ticketUrl).map((svc) => (
                      <div key={svc.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span>{svc.serviceType}: {svc.title}</span>
                        {canDownloadVouchers ? (
                          <div className="flex gap-2">
                            {svc.voucherUrl && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={svc.voucherUrl} target="_blank" rel="noreferrer">Voucher</a>
                              </Button>
                            )}
                            {svc.ticketUrl && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={svc.ticketUrl} target="_blank" rel="noreferrer">Ticket</a>
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary">Locked</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}

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
                        {(booking.isInternational || /hotel/i.test(String(booking.service || ""))) && (
                          <>
                            <Field label="Passport No *" value={p.passportNumber || ""} onChange={(v) => updatePax(idx, { passportNumber: v })} />
                            {booking.isInternational && (
                              <>
                                <Field label="Passport Expiry *" value={p.passportExpiry || ""} onChange={(v) => updatePax(idx, { passportExpiry: v })} placeholder="YYYY-MM-DD" />
                                <Field label="Passport Issue" value={p.passportIssueDate || ""} onChange={(v) => updatePax(idx, { passportIssueDate: v })} />
                              </>
                            )}
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
                  <Select value={leadDocType} onValueChange={setLeadDocType}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Document type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PASSPORT_FRONT">Passport Front</SelectItem>
                      <SelectItem value="PASSPORT_BACK">Passport Back</SelectItem>
                      <SelectItem value="AADHAAR">Aadhaar</SelectItem>
                      <SelectItem value="PAN">PAN Card</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                    className="hidden"
                    id={`lead-doc-${booking.id}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const lead = passengers.find((p) => p.isLead) || passengers[0];
                      void run("Document uploaded", async () => {
                        await api.uploadBookingDocument(booking.id, file, {
                          docType: leadDocType || "OTHER",
                          visibility: isAgent ? "AGENT" : "INTERNAL",
                          ...(lead?.id ? { passengerId: lead.id } : {}),
                        });
                      });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !passengers[0]?.id || !booking.policiesAcceptedAt}
                    onClick={() => document.getElementById(`lead-doc-${booking.id}`)?.click()}
                  >
                    Upload passenger document
                  </Button>
                </div>
                {!booking.policiesAcceptedAt && (
                  <p className="text-xs text-amber-600">Accept policies on Overview before saving passengers to advance status.</p>
                )}
                {(booking.documents || []).length > 0 && (
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">Documents</p>
                    {booking.documents!.map((d) => (
                      <div key={d.id} className="flex justify-between items-center gap-2 border-b py-1">
                        <span className="min-w-0 truncate">{d.docType}: {d.fileName}</span>
                        {(d.downloadPath || d.fileUrl) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 shrink-0"
                            onClick={async () => {
                              try {
                                if (d.downloadPath) {
                                  const blob = await apiFetchBlob(d.downloadPath);
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = d.fileName || "document";
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } else if (d.fileUrl) {
                                  window.open(d.fileUrl, "_blank", "noopener,noreferrer");
                                }
                              } catch (e) {
                                toast({ title: "Download failed", description: e instanceof ApiError ? e.message : "Error", variant: "destructive" });
                              }
                            }}
                          >
                            Download
                          </Button>
                        )}
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
                      <Input
                        className="h-8 w-32"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="Amount"
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        const amount = Number(payAmount);
                        if (!Number.isFinite(amount) || amount <= 0) {
                          toast({
                            title: "Enter a valid amount",
                            description: "Payment request amount must be greater than 0.",
                            variant: "destructive",
                          });
                          return;
                        }
                        void run("Payment request created", async () => {
                          await api.createPaymentRequest(booking.id, { label: payLabel, amount });
                          setPayAmount("");
                        });
                      }}
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
                            <div className="flex items-center gap-1">
                              <Select value={payMethod} onValueChange={setPayMethod}>
                                <SelectTrigger className="h-7 w-32 text-[10px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["Bank Transfer", "Cash", "Cheque", "Wallet", "Card"].map((m) => (
                                    <SelectItem key={m} value={m}>{m === "Card" ? "Card (online)" : m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => run("Payment recorded", async () => {
                                  const amount = pr.amount - pr.amountPaid;
                                  const online = payMethod === "Card";
                                  if (online) {
                                    const result = await payWithRazorpay({
                                      amount,
                                      name: "Trevio Global",
                                      description: `${booking.bookingRef} · ${pr.label}`,
                                    });
                                    if (!result.success) {
                                      throw new Error(result.error || "Online payment failed");
                                    }
                                    await api.payPaymentRequest(pr.id, {
                                      amount,
                                      method: payMethod,
                                      gateway: "Razorpay",
                                      orderId: result.orderId,
                                      paymentId: result.paymentId,
                                      signature: result.signature,
                                    });
                                    return;
                                  }
                                  await api.payPaymentRequest(pr.id, {
                                    amount,
                                    method: payMethod,
                                  });
                                })}
                              >
                                Pay
                              </Button>
                            </div>
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

            {tab === "travel" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Flight and hotel details are required before the booking can be marked fully confirmed (for airport transfers).
                </p>
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold">Flight details</p>
                  {(travelForm.flights || [{}]).map((f, idx) => (
                    <div key={idx} className="grid gap-2 sm:grid-cols-3">
                      <Field label="From" value={f.from || ""} onChange={(v) => {
                        const flights = [...(travelForm.flights || [])];
                        flights[idx] = { ...flights[idx], from: v };
                        setTravelForm((prev) => ({ ...prev, flights }));
                      }} />
                      <Field label="To" value={f.to || ""} onChange={(v) => {
                        const flights = [...(travelForm.flights || [])];
                        flights[idx] = { ...flights[idx], to: v };
                        setTravelForm((prev) => ({ ...prev, flights }));
                      }} />
                      <Field label="Date" value={f.date || ""} onChange={(v) => {
                        const flights = [...(travelForm.flights || [])];
                        flights[idx] = { ...flights[idx], date: v };
                        setTravelForm((prev) => ({ ...prev, flights }));
                      }} placeholder="YYYY-MM-DD" />
                      <Field label="Airline" value={f.airline || ""} onChange={(v) => {
                        const flights = [...(travelForm.flights || [])];
                        flights[idx] = { ...flights[idx], airline: v };
                        setTravelForm((prev) => ({ ...prev, flights }));
                      }} />
                      <Field label="Flight no." value={f.flightNumber || ""} onChange={(v) => {
                        const flights = [...(travelForm.flights || [])];
                        flights[idx] = { ...flights[idx], flightNumber: v };
                        setTravelForm((prev) => ({ ...prev, flights }));
                      }} />
                      <Field label="PNR" value={f.pnr || ""} onChange={(v) => {
                        const flights = [...(travelForm.flights || [])];
                        flights[idx] = { ...flights[idx], pnr: v };
                        setTravelForm((prev) => ({ ...prev, flights }));
                      }} />
                    </div>
                  ))}
                </div>
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold">Hotel details</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Hotel name *" value={travelForm.hotel?.name || ""} onChange={(v) => setTravelForm((prev) => ({
                      ...prev,
                      hotel: { ...prev.hotel, name: v },
                    }))} />
                    <Field label="Confirmation no." value={travelForm.hotel?.confirmationNo || ""} onChange={(v) => setTravelForm((prev) => ({
                      ...prev,
                      hotel: { ...prev.hotel, confirmationNo: v },
                    }))} />
                    <Field label="Check-in" value={travelForm.hotel?.checkIn || ""} onChange={(v) => setTravelForm((prev) => ({
                      ...prev,
                      hotel: { ...prev.hotel, checkIn: v },
                    }))} placeholder="YYYY-MM-DD" />
                    <Field label="Check-out" value={travelForm.hotel?.checkOut || ""} onChange={(v) => setTravelForm((prev) => ({
                      ...prev,
                      hotel: { ...prev.hotel, checkOut: v },
                    }))} placeholder="YYYY-MM-DD" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="self-hotel"
                      checked={Boolean(travelForm.hotel?.selfBooked)}
                      onCheckedChange={(v) => setTravelForm((prev) => ({
                        ...prev,
                        hotel: { ...prev.hotel, selfBooked: Boolean(v) },
                      }))}
                    />
                    <Label htmlFor="self-hotel" className="text-xs">Self-booked hotel (guest arranged separately)</Label>
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => run("Travel details saved", async () => {
                    const res = await api.saveBookingTravelDetails(booking.id, travelForm as Record<string, unknown>);
                    if (!res.travelComplete) {
                      toast({
                        title: "Saved — still incomplete",
                        description: `Missing: ${res.missing.join(", ")}`,
                      });
                    }
                  })}
                >
                  Save travel details
                </Button>
              </div>
            )}

            {tab === "itinerary" && canOps && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Ops can shuffle days, update pickup/drop locations and timings. Changes are saved to the customer itinerary.
                </p>
                {itineraryDays.length === 0 && (
                  <p className="text-xs text-muted-foreground border rounded p-3">No itinerary on this booking yet.</p>
                )}
                {itineraryDays.map((day, di) => {
                  const items = Array.isArray(day.items) ? (day.items as Array<Record<string, unknown>>) : [];
                  return (
                    <div key={di} className="border rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap gap-2 items-center justify-between">
                        <Input
                          className="h-8 text-xs font-semibold flex-1 min-w-[140px]"
                          value={String(day.title || `Day ${di + 1}`)}
                          onChange={(e) => {
                            const days = [...itineraryDays];
                            days[di] = { ...days[di], title: e.target.value, day: di + 1 };
                            setItineraryDays(days);
                          }}
                        />
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" disabled={di === 0 || busy} onClick={() => {
                            const days = [...itineraryDays];
                            [days[di - 1], days[di]] = [days[di], days[di - 1]];
                            setItineraryDays(days.map((d, i) => ({ ...d, day: i + 1 })));
                          }}>↑</Button>
                          <Button size="sm" variant="outline" disabled={di === itineraryDays.length - 1 || busy} onClick={() => {
                            const days = [...itineraryDays];
                            [days[di], days[di + 1]] = [days[di + 1], days[di]];
                            setItineraryDays(days.map((d, i) => ({ ...d, day: i + 1 })));
                          }}>↓</Button>
                        </div>
                      </div>
                      {items.map((item, ii) => (
                        <div key={ii} className="grid gap-2 sm:grid-cols-3 text-xs">
                          <Field label="Activity" value={String(item.activityName || item.title || "")} onChange={(v) => {
                            const days = [...itineraryDays];
                            const rowItems = [...items];
                            rowItems[ii] = { ...rowItems[ii], activityName: v, title: v };
                            days[di] = { ...days[di], items: rowItems };
                            setItineraryDays(days);
                          }} />
                          <Field label="Pickup / location" value={String(item.pickupLocation || item.location || "")} onChange={(v) => {
                            const days = [...itineraryDays];
                            const rowItems = [...items];
                            rowItems[ii] = { ...rowItems[ii], pickupLocation: v, location: v };
                            days[di] = { ...days[di], items: rowItems };
                            setItineraryDays(days);
                          }} />
                          <Field label="Time" value={String(item.time || item.startTime || "")} onChange={(v) => {
                            const days = [...itineraryDays];
                            const rowItems = [...items];
                            rowItems[ii] = { ...rowItems[ii], time: v, startTime: v };
                            days[di] = { ...days[di], items: rowItems };
                            setItineraryDays(days);
                          }} />
                        </div>
                      ))}
                    </div>
                  );
                })}
                {itineraryDays.length > 0 && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => run("Itinerary saved", async () => {
                      await api.saveBookingItinerary(booking.id, itineraryDays);
                    })}>
                      Save itinerary
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => {
                      const ok = downloadBookingItinerary(booking);
                      if (!ok) toast({ title: "Popup blocked", description: "Allow popups to print itinerary", variant: "destructive" });
                    }}>
                      Download PDF
                    </Button>
                  </div>
                )}
              </div>
            )}

            {tab === "ops" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Confirm each component with the supplier and actual cost (total invoice amount).
                </p>
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Complete the Travel tab (flight from/to/date + hotel name) before the booking can reach Confirmed status.
                </p>
                {(booking.services || []).map((svc) => {
                  const allowedTypes = supplierTypesForService(svc.serviceType);
                  const filtered = suppliers.filter((s) => allowedTypes.includes(s.type as typeof allowedTypes[number]));
                  const form = opsForm[svc.id] || {
                    supplierId: "",
                    costPrice: String(svc.costPrice || ""),
                    confirmationNo: svc.confirmationNo || "",
                  };
                  const selectedSupplier = suppliers.find((s) => s.id === form.supplierId);
                  const quotedCost = svc.quotedCostPrice ?? svc.costPrice ?? 0;
                  const enteredCost = Number(form.costPrice) || 0;
                  const overQuoted = enteredCost > quotedCost;
                  const pendingSvc = pendingDeviations.find((d) => d.bookingServiceId === svc.id);
                  return (
                    <div key={svc.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div className="text-xs">
                          <p className="font-semibold">{svc.serviceType}: {svc.title}</p>
                          <p className="text-muted-foreground">Status: {svc.status}</p>
                          <p className="text-muted-foreground">Quoted cost: {formatFullINR(quotedCost)}</p>
                          {svc.supplierName && <p className="text-muted-foreground">Supplier: {svc.supplierName}</p>}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {svc.status === "Confirmed" && <Badge variant="secondary">Confirmed</Badge>}
                          {pendingSvc && <Badge variant="outline">Awaiting approval</Badge>}
                        </div>
                      </div>
                      {canOps && svc.status !== "Confirmed" && !pendingSvc && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-[10px]">Confirm with supplier *</Label>
                            <Select
                              value={form.supplierId || "none"}
                              onValueChange={(v) => {
                                setOpsForm((prev) => ({
                                  ...prev,
                                  [svc.id]: {
                                    ...form,
                                    supplierId: v === "none" ? "" : v,
                                  },
                                }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Search supplier…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Select supplier…</SelectItem>
                                {filtered.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name} · {s.type} · {s.city}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Total cost (invoice)</Label>
                            <Input
                              className="h-8 text-xs"
                              type="number"
                              min={0}
                              value={form.costPrice}
                              onChange={(e) => setOpsForm((prev) => ({
                                ...prev,
                                [svc.id]: { ...form, costPrice: e.target.value },
                              }))}
                              placeholder="e.g. 600"
                            />
                            {overQuoted && (
                              <p className="text-[10px] text-amber-600">
                                Exceeds quoted cost by {formatFullINR(enteredCost - quotedCost)} — super admin approval required
                              </p>
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Confirmation no.</Label>
                            <Input
                              className="h-8 text-xs"
                              value={form.confirmationNo}
                              onChange={(e) => setOpsForm((prev) => ({
                                ...prev,
                                [svc.id]: { ...form, confirmationNo: e.target.value },
                              }))}
                              placeholder="Hotel / DMC ref"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px]">Supplier voucher / confirmation PDF (optional)</Label>
                            <Input
                              type="file"
                              accept=".pdf,image/jpeg,image/png"
                              className="h-8 text-xs"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setVoucherFiles((prev) => ({ ...prev, [svc.id]: file }));
                              }}
                            />
                          </div>
                          {svc.serviceType === "Transfer" && (
                            <div className="sm:col-span-2 grid gap-2 sm:grid-cols-3 border-t pt-2">
                              <p className="sm:col-span-3 text-[10px] font-semibold text-muted-foreground">Driver details (optional — shown on itinerary)</p>
                              {(() => {
                                const d = driverForms[svc.id] || {
                                  driverName: svc.driverDetails?.driverName || "",
                                  vehicleNumber: svc.driverDetails?.vehicleNumber || "",
                                  driverPhone: svc.driverDetails?.driverPhone || "",
                                };
                                return (
                                  <>
                                    <Field label="Driver name" value={d.driverName} onChange={(v) => setDriverForms((p) => ({ ...p, [svc.id]: { ...d, driverName: v } }))} />
                                    <Field label="Vehicle no." value={d.vehicleNumber} onChange={(v) => setDriverForms((p) => ({ ...p, [svc.id]: { ...d, vehicleNumber: v } }))} />
                                    <Field label="Driver phone" value={d.driverPhone} onChange={(v) => setDriverForms((p) => ({ ...p, [svc.id]: { ...d, driverPhone: v } }))} />
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          <div className="sm:col-span-2">
                            <Button
                              size="sm"
                              disabled={busy || !form.supplierId || !form.costPrice}
                              onClick={() => run(`${svc.serviceType} confirmed`, async () => {
                                const sup = selectedSupplier || suppliers.find((s) => s.id === form.supplierId);
                                if (!sup) throw new Error("Select a supplier");
                                const d = driverForms[svc.id];
                                let voucherUrl: string | undefined;
                                const voucherFile = voucherFiles[svc.id];
                                if (voucherFile) {
                                  const uploaded = await api.uploadBookingDocument(booking.id, voucherFile, {
                                    docType: `${svc.serviceType.toUpperCase()}_VOUCHER`,
                                    visibility: "INTERNAL",
                                    relatedEntity: svc.serviceType,
                                    description: `${svc.serviceType} supplier voucher`,
                                  });
                                  voucherUrl = uploaded.document.downloadPath || undefined;
                                  setVoucherFiles((prev) => ({ ...prev, [svc.id]: null }));
                                }
                                await api.updateBookingService(booking.id, svc.id, {
                                  status: "Confirmed",
                                  supplierName: sup.name,
                                  supplierRef: sup.id,
                                  costPrice: Number(form.costPrice),
                                  confirmationNo: form.confirmationNo || `CNF-${Date.now().toString().slice(-6)}`,
                                  ...(voucherUrl ? { voucherUrl } : {}),
                                  ...(svc.serviceType === "Transfer" && d ? { driverDetails: d } : {}),
                                });
                              }, { approvalOk: true })}
                            >
                              Confirm with {selectedSupplier?.name || "supplier"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  {canFinance && (
                    <>
                      <SummaryCell label="Cost" value={formatFullINR(booking.costPrice ?? 0)} />
                      <SummaryCell label="Gross Profit" value={formatFullINR(booking.grossProfit ?? 0)} />
                      <SummaryCell label="Net Profit" value={formatFullINR(booking.netProfit ?? 0)} />
                    </>
                  )}
                </div>
                {(pendingDeviations.length > 0 || canApproveDeviation) && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold">Cost deviation approvals</p>
                    {pendingDeviations.length === 0 && (
                      <p className="text-xs text-muted-foreground">No pending approvals for this booking</p>
                    )}
                    {pendingDeviations.map((dev) => (
                      <div key={dev.id} className="text-xs border rounded p-2 space-y-1">
                        <p className="font-medium">
                          {dev.deviationType === "service_cost" ? "Supplier cost overrun" : "Selling price increase"}
                        </p>
                        <p className="text-muted-foreground">
                          {dev.deviationType === "service_cost"
                            ? `Quoted ${formatFullINR(dev.quotedCost)} → proposed ${formatFullINR(dev.proposedCost)} (+${formatFullINR(dev.deltaAmount)})`
                            : `${formatFullINR(dev.currentPackageValue)} → ${formatFullINR(dev.proposedPackageValue ?? dev.proposedCost)}`}
                        </p>
                        {dev.reason && <p className="text-muted-foreground">{dev.reason}</p>}
                        {dev.requestedByName && <p className="text-muted-foreground">Requested by {dev.requestedByName}</p>}
                        {canApproveDeviation && (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" disabled={busy} onClick={() => decideDeviation(dev, true)}>Approve</Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => decideDeviation(dev, false)}>Reject</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canAdjustPrice && (
                  <div className="border rounded-lg p-3 space-y-2 border-violet-200 bg-violet-50/40">
                    <p className="text-xs font-semibold">Adjust selling price (admin)</p>
                    <p className="text-[10px] text-muted-foreground">Change customer package value without altering supplier costs. A reason is required for discounts.</p>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-[10px]">New package value</Label>
                        <Input className="h-8 w-36 text-xs" type="number" value={adjustPrice} onChange={(e) => setAdjustPrice(e.target.value)} placeholder={String(booking.packageValue ?? booking.amount)} />
                      </div>
                      <Input className="h-8 flex-1 min-w-[140px] text-xs" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Reason (required for discount)" />
                      <Button size="sm" disabled={busy || !adjustPrice || (Number(adjustPrice) < (booking.packageValue ?? booking.amount) && !adjustReason.trim())} onClick={() => run("Selling price adjusted", async () => {
                        await api.adjustBookingSellingPrice(booking.id, {
                          packageValue: Number(adjustPrice),
                          reason: adjustReason || undefined,
                        });
                        setAdjustPrice("");
                        setAdjustReason("");
                      })}>
                        Apply
                      </Button>
                    </div>
                    {adjustPrice && !Number.isNaN(Number(adjustPrice)) && (
                      <p className={`text-[10px] ${Number(adjustPrice) - (booking.packageValue ?? booking.amount) < 0 ? "text-emerald-700" : Number(adjustPrice) - (booking.packageValue ?? booking.amount) > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                        {formatFullINR(booking.packageValue ?? booking.amount)} → {formatFullINR(Number(adjustPrice))}
                        {" "}({Number(adjustPrice) - (booking.packageValue ?? booking.amount) >= 0 ? "+" : ""}{formatFullINR(Number(adjustPrice) - (booking.packageValue ?? booking.amount))})
                      </p>
                    )}
                  </div>
                )}
                {(booking.grossProfit ?? 0) < 0 && canFinance && (
                  <div className="border rounded-lg p-3 space-y-2 border-amber-200 bg-amber-50/50">
                    <p className="text-xs font-semibold text-amber-800">Margin eaten — request selling price increase</p>
                    <p className="text-[10px] text-amber-700">
                      Supplier costs exceed selling price. Customer price stays locked until super admin approves an increase.
                    </p>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-[10px]">New package value</Label>
                        <Input
                          className="h-8 w-36 text-xs"
                          type="number"
                          min={(booking.packageValue ?? booking.amount) + 1}
                          value={proposedSelling}
                          onChange={(e) => setProposedSelling(e.target.value)}
                          placeholder={String((booking.packageValue ?? booking.amount) + 5000)}
                        />
                      </div>
                      <Input
                        className="h-8 flex-1 min-w-[140px] text-xs"
                        value={sellingReason}
                        onChange={(e) => setSellingReason(e.target.value)}
                        placeholder="Reason for increase"
                      />
                      <Button
                        size="sm"
                        disabled={busy || !proposedSelling}
                        onClick={() => run("Selling price increase requested", async () => {
                          await api.requestSellingPriceIncrease(booking.id, {
                            proposedPackageValue: Number(proposedSelling),
                            reason: sellingReason || undefined,
                          });
                          setProposedSelling("");
                          setSellingReason("");
                        })}
                      >
                        Request approval
                      </Button>
                    </div>
                  </div>
                )}
                {canFinance && (
                  <div className="flex flex-wrap gap-2">
                    {["Proforma", "Tax Invoice", "Credit Note", "Debit Note"].map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant="outline"
                        disabled={busy || (t === "Tax Invoice" && booking.paymentStatus !== "Paid")}
                        title={t === "Tax Invoice" && booking.paymentStatus !== "Paid" ? "Requires full payment" : undefined}
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
                    <div key={inv.id} className="text-xs flex flex-wrap justify-between gap-2 border-b py-1 items-center">
                      <span>{inv.invoiceNo} · {inv.invoiceType}</span>
                      <div className="flex items-center gap-2">
                        <span>{formatFullINR(inv.total)}</span>
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => {
                          const ok = downloadBookingInvoice(booking, inv);
                          if (!ok) toast({ title: "Popup blocked", variant: "destructive" });
                        }}>
                          PDF
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(booking.invoices || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No invoices yet</p>
                  )}
                </div>
                {canFinance && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold">Create supplier payout</p>
                    <p className="text-[10px] text-muted-foreground">Set due date and reminder — finance gets notified before payment is due.</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Confirmed service</Label>
                        <Select value={payoutServiceId || "none"} onValueChange={setPayoutServiceId}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select service…</SelectItem>
                            {(booking.services || []).filter((s) => s.status === "Confirmed").map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.serviceType}: {s.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Due date</Label>
                        <Input className="h-8 text-xs" type="date" value={payoutDueDate} onChange={(e) => setPayoutDueDate(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Remind (days before)</Label>
                        <Select value={payoutReminderDays} onValueChange={setPayoutReminderDays}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["1", "2", "3", "5"].map((d) => <SelectItem key={d} value={d}>{d} day(s)</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Invoice URL (optional)</Label>
                        <Input className="h-8 text-xs" value={payoutInvoiceUrl} onChange={(e) => setPayoutInvoiceUrl(e.target.value)} placeholder="https://…" />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy || !payoutServiceId || payoutServiceId === "none" || !payoutDueDate}
                      onClick={() => run("Supplier payout created", async () => {
                        const svc = (booking.services || []).find((s) => s.id === payoutServiceId);
                        if (!svc) throw new Error("Select a confirmed service");
                        await api.createSupplierPayout({
                          bookingId: booking.id,
                          bookingServiceId: svc.id,
                          serviceType: svc.serviceType,
                          supplierName: svc.supplierName || "Supplier",
                          supplierId: svc.supplierRef || undefined,
                          amount: svc.costPrice,
                          currency: "INR",
                          dueDate: payoutDueDate,
                          reminderDaysBefore: Number(payoutReminderDays) || 2,
                          invoiceUrl: payoutInvoiceUrl || undefined,
                          status: "Pending",
                        });
                        setPayoutServiceId("");
                        setPayoutDueDate("");
                        setPayoutInvoiceUrl("");
                      })}
                    >
                      Create payout
                    </Button>
                  </div>
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
  const user = useAuthStore((s) => s.user);
  const bookings = useDemoDataStore((s) => s.bookings);
  const upsertBooking = useDemoDataStore((s) => s.upsertBooking);
  const [statusTab, setStatusTab] = useState("All");
  const [service, setService] = useState("All");
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (queueFilter === "all") return;
    api.getOpsQueue({ mine: queueFilter === "mine", unassigned: queueFilter === "unassigned" })
      .then((res) => res.bookings.forEach((b) => upsertBooking(mapApiBooking(b))))
      .catch(() => undefined);
  }, [queueFilter, upsertBooking]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusTab !== "All" && b.status !== statusTab) return false;
      if (service !== "All" && b.service !== service) return false;
      if (queueFilter === "mine") {
        const mine =
          b.operationsExecutiveId === user?.id ||
          b.operationsExecutiveName === user?.name ||
          b.operationsExecutiveName === user?.email;
        if (!mine) return false;
      }
      if (queueFilter === "unassigned") {
        const name = (b.operationsExecutiveName || "").trim();
        if (b.operationsExecutiveId || (name && name !== "Operations")) return false;
      }
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
  }, [bookings, statusTab, service, search, queueFilter, user]);

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
        <Select value={queueFilter} onValueChange={(v) => setQueueFilter(v as typeof queueFilter)}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bookings</SelectItem>
            <SelectItem value="mine">My ops queue</SelectItem>
            <SelectItem value="unassigned">Unassigned ops</SelectItem>
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
          <div className="overflow-x-auto">
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
                <TableHead className="text-right sticky right-0 bg-card z-20 shadow-[-8px_0_8px_rgba(0,0,0,0.06)]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => {
                const Icon = SERVICE_ICON[b.service] || Plane;
                return (
                  <TableRow
                    key={b.id}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() => {
                      setSelectedId(b.id);
                      setDetailOpen(true);
                    }}
                  >
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
                    <TableCell className="text-right sticky right-0 bg-card" onClick={(e) => e.stopPropagation()}>
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
          </div>
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
