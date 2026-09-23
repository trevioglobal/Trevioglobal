"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Car,
  ChevronDown,
  ClipboardList,
  Clock,
  Eye,
  FileDown,
  MoreHorizontal,
  Pencil,
  Plane,
  Send,
  Star,
  Trash2,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatFullINR } from "@/components/shared/ui-helpers";
import { ImageUrlListField } from "@/components/shared/image-url-list-field";
import { ActivityDetailsDialog, type ActivityDetailsSource } from "@/components/shared/activity-details-dialog";
import { QuotePriceBreakdown } from "@/components/shared/quote-price-breakdown";
import { AgencyQuoteStepper, AGENCY_QUOTE_STEPS } from "@/components/shared/agency-quote-stepper";
import { ItineraryPlaceSelect, type ItineraryPlaceItem } from "@/components/shared/itinerary-place-select";
import { formatActivityTimingBar } from "@/lib/activity-catalog";
import { placeholderHotelImage } from "@/lib/hotel-placeholder-images";
import { buildTripNightDates, formatItineraryDate, itemTypeLabel } from "@/lib/quote-itinerary-sync";
import type { TripCityStayWindow } from "@/lib/quote-trip-stays";
import type { ResolvedQuoteCosting } from "@/lib/quote-costing";
import { cn } from "@/lib/utils";

export type TripBuilderStage = "services" | "itinerary" | "pricing" | "preview";

const STAGE_TO_FLOW: Record<TripBuilderStage, number> = {
  services: 2,
  itinerary: 3,
  pricing: 4,
  preview: 5,
};

const FLOW_TO_STAGE: Record<number, TripBuilderStage> = {
  2: "services",
  3: "itinerary",
  4: "pricing",
  5: "preview",
};

export type TripBuilderService = "Hotel" | "Transfers" | "Activities" | "Meals" | "Miscellaneous";

type TripFormSlice = {
  customerName: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  salesExecutiveName?: string;
  salesExecutiveEmail?: string;
  salesExecutivePhone?: string;
  destination: string;
  departureCity?: string;
  travelStartDate: string;
  travelEndDate: string;
  adults: number;
  children: number;
  infants?: number;
  rooms: number;
  landOnly?: boolean;
  currency?: string;
};

type ServiceTarget = {
  service: TripBuilderService;
  dayNumber: number;
  date: string;
  city: string;
};

const DAY_SERVICES: Array<{
  key: TripBuilderService;
  icon: typeof Building2;
}> = [
  { key: "Hotel", icon: Building2 },
  { key: "Transfers", icon: Car },
  { key: "Activities", icon: ClipboardList },
  { key: "Meals", icon: UtensilsCrossed },
  { key: "Miscellaneous", icon: MoreHorizontal },
];

function weekdayShort(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const dt = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-GB", { weekday: "short" });
}

/** Display pickup time above the card, e.g. "10:33 AM". */
function formatPickupTimeDisplay(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2}):(\d{2})\b/);
  if (!m) return raw;
  let h = Number(m[1]);
  const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${ap}`;
}

type EditableKind = "hotel" | "transfer" | "activity";

type ViewTarget = {
  kind: EditableKind | "meal" | "misc";
  title: string;
  rows: Array<{ label: string; value: string }>;
  imageUrl?: string;
};

type EditTarget = {
  kind: EditableKind;
  lineId: string;
  title: string;
  roomType?: string;
  mealPlan?: string;
  pickupTime?: string;
  remarks?: string;
};

function ItemActionButtons({
  onEdit,
  onDelete,
  onView,
  editLabel = "Edit",
  deleteLabel = "Delete",
  viewLabel = "View details",
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  onView?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  viewLabel?: string;
}) {
  const btn =
    "h-8 w-8 inline-flex items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 focus-visible:ring-offset-1 disabled:opacity-40 disabled:pointer-events-none";
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        className={cn(
          btn,
          "border-emerald-200/80 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300",
        )}
        aria-label={editLabel}
        title={editLabel}
        disabled={!onEdit}
        onClick={onEdit}
      >
        <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
      {onDelete ? (
        <button
          type="button"
          className={cn(
            btn,
            "border-rose-200/80 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300",
          )}
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
      <button
        type="button"
        className={cn(
          btn,
          "border-sky-200/80 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300",
        )}
        aria-label={viewLabel}
        title={viewLabel}
        disabled={!onView}
        onClick={onView}
      >
        <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

function formatDayHeaderDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const dt = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return ymd;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatStayDisplay(checkIn?: string, checkOut?: string): string {
  const a = formatStayShort(checkIn);
  const b = formatStayShort(checkOut);
  if (a && b) return `${a} - ${b}`;
  return a || b || "—";
}

function formatStayShort(ymd?: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const dt = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function hotelStars(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(5, Math.round(n)) : 0;
}

export function QuoteTripBuilder({
  form,
  stayWindows,
  quoteNo,
  quoteId,
  total,
  itinerary,
  hotels = [],
  busy,
  stage = "services",
  flowStep = 2,
  costing,
  serviceRows = [],
  discountType = "",
  discountValue = 0,
  trevioMarkupValue = 0,
  lineItems = [],
  onPricingChange,
  onUpdateLineSelling,
  onFlowStepChange,
  onBack,
  onUpdateTripDetails,
  onEditPersonalDetails,
  onCreatePdf,
  onSendQuotation,
  onSaveDraft,
  onOpenService,
  onRemoveHotel,
  onRemoveTransfer,
  onRemoveActivity,
  onRemoveMeal,
  onRemoveMisc,
  onUpdateHotel,
  onUpdateTransfer,
  onUpdateActivity,
  onUpdateItineraryDay,
}: {
  form: TripFormSlice;
  stayWindows: TripCityStayWindow[];
  quoteNo: string;
  quoteId?: string | null;
  total: number;
  itinerary: unknown;
  hotels?: Record<string, unknown>[];
  busy?: boolean;
  stage?: TripBuilderStage;
  flowStep?: number;
  costing?: ResolvedQuoteCosting | null;
  serviceRows?: Array<{ key: string; label: string; netCost: number; sellingPrice: number }>;
  discountType?: "" | "Fixed" | "Percentage";
  discountValue?: number;
  trevioMarkupValue?: number;
  lineItems?: Array<{
    kind: "hotel" | "flight" | "transfer" | "activity" | "meal" | "misc";
    lineId: string;
    label: string;
    sellingPrice: number;
    costPrice?: number;
  }>;
  onPricingChange?: (patch: {
    discountType?: "" | "Fixed" | "Percentage";
    discountValue?: number;
    trevioMarkupValue?: number;
  }) => void;
  onUpdateLineSelling?: (kind: string, lineId: string, sellingPrice: number) => void;
  onFlowStepChange?: (step: number) => void;
  onBack: () => void;
  onUpdateTripDetails: () => void;
  onEditPersonalDetails?: () => void;
  onCreatePdf: () => void | Promise<void>;
  onSendQuotation: () => void | Promise<void>;
  /** Explicit save — creates Draft if new, keeps work without auto-save on Continue. */
  onSaveDraft?: () => void | Promise<void>;
  /** Opens live catalogue for Hotel / Transfers / Activities / Meals. */
  onOpenService?: (target: {
    service: TripBuilderService;
    dayNumber: number;
    date: string;
    city: string;
    transferKind?: "transfer" | "airport_pickup";
  }) => void;
  onRemoveHotel?: (lineId: string) => void;
  onRemoveTransfer?: (transferLineId: string) => void;
  onRemoveActivity?: (activityLineId: string) => void;
  onRemoveMeal?: (mealLineId: string) => void;
  onRemoveMisc?: (miscLineId: string) => void;
  onUpdateHotel?: (lineId: string, patch: { roomType?: string; mealPlan?: string; remarks?: string }) => void;
  onUpdateTransfer?: (lineId: string, patch: { pickupTime?: string; remarks?: string }) => void;
  onUpdateActivity?: (lineId: string, patch: { timeSlot?: string; remarks?: string }) => void;
  onUpdateItineraryDay?: (date: string, patch: {
    title?: string;
    description?: string;
    coverImage?: string;
    city?: string;
    destinationId?: string;
    places?: ItineraryPlaceItem[];
  }) => void;
}) {
  const [serviceTarget, setServiceTarget] = useState<ServiceTarget | null>(null);
  const [activityDetails, setActivityDetails] = useState<ActivityDetailsSource | null>(null);
  const [viewTarget, setViewTarget] = useState<ViewTarget | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editRoomType, setEditRoomType] = useState("");
  const [editMealPlan, setEditMealPlan] = useState("");
  const [editPickupTime, setEditPickupTime] = useState("");
  const [editRemarks, setEditRemarks] = useState("");

  function openEdit(target: EditTarget) {
    setEditTarget(target);
    setEditRoomType(target.roomType || "");
    setEditMealPlan(target.mealPlan || "");
    setEditPickupTime(String(target.pickupTime || "").slice(0, 5));
    setEditRemarks(target.remarks || "");
  }

  function saveEdit() {
    if (!editTarget) return;
    if (editTarget.kind === "hotel" && onUpdateHotel) {
      onUpdateHotel(editTarget.lineId, {
        roomType: editRoomType.trim(),
        mealPlan: editMealPlan.trim(),
        remarks: editRemarks.trim(),
      });
    } else if (editTarget.kind === "transfer" && onUpdateTransfer) {
      onUpdateTransfer(editTarget.lineId, {
        pickupTime: editPickupTime.trim(),
        remarks: editRemarks.trim(),
      });
    } else if (editTarget.kind === "activity" && onUpdateActivity) {
      onUpdateActivity(editTarget.lineId, {
        timeSlot: editPickupTime.trim(),
        remarks: editRemarks.trim(),
      });
    }
    setEditTarget(null);
  }

  const nights = useMemo(
    () => buildTripNightDates(stayWindows, [], form.travelStartDate),
    [stayWindows, form.travelStartDate],
  );

  const itineraryByDate = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    const days = Array.isArray(itinerary) ? itinerary : [];
    for (const raw of days) {
      if (!raw || typeof raw !== "object") continue;
      const day = raw as Record<string, unknown>;
      const date = String(day.date || "");
      if (!date) continue;
      const items = Array.isArray(day.items) ? (day.items as Record<string, unknown>[]) : [];
      map.set(date, items);
    }
    return map;
  }, [itinerary]);

  const destinationLabel = useMemo(() => {
    if (stayWindows.length) return stayWindows.map((w) => w.city).join(" · ");
    return form.destination || "Destination";
  }, [stayWindows, form.destination]);

  const routeTitle = useMemo(() => {
    const from = String(form.departureCity || "").trim() || "Origin";
    const to = stayWindows[0]?.city || form.destination || "Destination";
    return `${from} to ${to}`;
  }, [form.departureCity, form.destination, stayWindows]);

  const dateRangeLabel = useMemo(() => {
    const start = form.travelStartDate ? formatItineraryDate(form.travelStartDate) : "—";
    const end = form.travelEndDate ? formatItineraryDate(form.travelEndDate) : "—";
    return `${start} - ${end}`;
  }, [form.travelStartDate, form.travelEndDate]);

  const paxLabel = useMemo(() => {
    const parts = [
      `${form.adults} Adult${form.adults === 1 ? "" : "s"}`,
      form.children > 0 ? `${form.children} Child${form.children === 1 ? "" : "ren"}` : "",
      `${form.rooms} Room${form.rooms === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return parts.join(", ");
  }, [form.adults, form.children, form.rooms]);

  const activeStage: TripBuilderStage = stage || FLOW_TO_STAGE[flowStep] || "services";
  const activeFlow = flowStep ?? STAGE_TO_FLOW[activeStage];

  const dayMetaByDate = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    const days = Array.isArray(itinerary) ? itinerary : [];
    for (const raw of days) {
      if (!raw || typeof raw !== "object") continue;
      const day = raw as Record<string, unknown>;
      const date = String(day.date || "");
      if (date) map.set(date, day);
    }
    return map;
  }, [itinerary]);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <AgencyQuoteStepper
        activeIndex={activeFlow}
        onSelect={(index) => {
          if (index === 0) {
            (onEditPersonalDetails || onUpdateTripDetails)();
            return;
          }
          if (index === 1) {
            onUpdateTripDetails();
            return;
          }
          onFlowStepChange?.(index);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {onSaveDraft && (
            <Button
              type="button"
              variant="outline"
              className="rounded-full px-4"
              disabled={busy}
              onClick={() => void onSaveDraft()}
            >
              {busy ? "Saving…" : quoteId ? "Save draft" : "Save draft"}
            </Button>
          )}
          {(activeStage === "preview" || activeStage === "pricing") && (
            <>
              <ActionPill icon={FileDown} label="Create PDF" disabled={busy} onClick={() => void onCreatePdf()} />
              <ActionPill icon={Send} label="Send Quotation" disabled={busy} onClick={() => void onSendQuotation()} />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-full px-4" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          {activeStage !== "preview" && onFlowStepChange && (
            <Button
              type="button"
              className="bg-teal-600 hover:bg-teal-700 text-white rounded-full px-5"
              onClick={() => onFlowStepChange(Math.min(activeFlow + 1, 5))}
            >
              Next · {AGENCY_QUOTE_STEPS[Math.min(activeFlow + 1, 5)]?.label}
            </Button>
          )}
        </div>
      </div>

      {activeStage === "services" && (
        <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-teal-900">Hotels, cars & activities</p>
            <p className="text-xs text-teal-800/80 mt-0.5">
              Per day: Hotel · Airport pickup / Transfers · Activities · Meals · Misc.
              Lists follow the city from Travel (Products inventory). Skip any day if not needed.
            </p>
          </div>
          {onFlowStepChange ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full border-teal-300 text-teal-800 hover:bg-teal-100"
              onClick={() => onFlowStepChange(3)}
            >
              Skip to itinerary
            </Button>
          ) : null}
        </div>
      )}
      {activeStage === "itinerary" && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
          <p className="text-sm font-semibold text-amber-950">Day-wise itinerary</p>
          <p className="text-xs text-amber-900/80 mt-0.5">
            Each day is locked to its Travel city. Pick sightseeing places (with images) from Products → Sightseeing Places for that city — select only, details auto-fill.
          </p>
        </div>
      )}
      {activeStage === "pricing" && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
          <p className="text-sm font-semibold text-violet-950">Pricing summary</p>
          <p className="text-xs text-violet-900/80 mt-0.5">
            Hotels / flights / cars fill automatically from catalogue selling prices when you add them. Edit line sell prices, add discount, then send.
          </p>
        </div>
      )}
      {activeStage === "preview" && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-sky-950">Preview & send to customer</p>
          <p className="text-xs text-sky-900/80">
            Send the branded PDF. When the customer accepts, open Quotations → Proceed to Booking.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <ActionPill icon={FileDown} label="Preview PDF" disabled={busy} onClick={() => void onCreatePdf()} />
            <ActionPill icon={Send} label="Send to customer" disabled={busy} onClick={() => void onSendQuotation()} />
          </div>
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">{routeTitle}</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-full text-xs"
                onClick={onUpdateTripDetails}
              >
                Edit travel
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {dateRangeLabel}
              <span className="mx-2 text-border">·</span>
              {paxLabel}
            </p>
            {form.landOnly && (
              <p className="text-xs font-medium text-brand-teal">Land only package</p>
            )}
            <p className="text-xs text-muted-foreground">{destinationLabel}</p>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              Quote <span className="font-semibold text-foreground">{quoteNo || quoteId || "DRAFT"}</span>
            </p>
            <p className="text-xl font-semibold tabular-nums text-foreground">{formatFullINR(total)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-border pt-3">
          <ContactCard
            title="Sales / expert"
            name={form.salesExecutiveName || "—"}
            phone={form.salesExecutivePhone || "—"}
            email={form.salesExecutiveEmail || "—"}
          />
          <ContactCard
            title="Guest"
            name={form.customerName || form.contactPerson || "—"}
            phone={form.contactPhone || "—"}
            email={form.contactEmail || "—"}
          />
        </div>
      </section>

      {(activeStage === "pricing" || activeStage === "preview") && costing ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Quotation pricing summary</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Totals come from hotels, flights, transfers/cars, activities and meals you added. Edit selling prices or add a discount before sending.
            </p>
          </div>

          {activeStage === "pricing" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Discount type</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={discountType || "none"}
                  onChange={(e) => {
                    const v = e.target.value;
                    onPricingChange?.({
                      discountType: v === "none" ? "" : (v as "Fixed" | "Percentage"),
                    });
                  }}
                >
                  <option value="none">None</option>
                  <option value="Fixed">Fixed (₹)</option>
                  <option value="Percentage">Percentage (%)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Discount value</Label>
                <Input
                  className="h-9"
                  type="number"
                  min={0}
                  value={discountValue || 0}
                  onChange={(e) => onPricingChange?.({ discountValue: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Trevio markup %</Label>
                <Input
                  className="h-9"
                  type="number"
                  min={0}
                  value={trevioMarkupValue || 0}
                  onChange={(e) => onPricingChange?.({ trevioMarkupValue: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}

          {serviceRows.some((r) => r.sellingPrice > 0 || r.netCost > 0) ? (
            <div className="rounded-xl border overflow-hidden">
              <div className="px-3 py-2 border-b bg-slate-50">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">By service</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Service</th>
                    <th className="px-3 py-2 font-medium text-right">Net cost</th>
                    <th className="px-3 py-2 font-medium text-right">Selling</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceRows.filter((r) => r.sellingPrice > 0 || r.netCost > 0).map((row) => (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="px-3 py-2">{row.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatFullINR(row.netCost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatFullINR(row.sellingPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No priced services yet. Go back to Hotels &amp; services and add hotels, flights or transfers — selling prices from the catalogue fill here automatically.
            </div>
          )}

          {activeStage === "pricing" && lineItems.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="px-3 py-2 border-b bg-slate-50">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Line items — edit selling price</p>
              </div>
              <div className="divide-y">
                {lineItems.map((line) => (
                  <div key={`${line.kind}-${line.lineId}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{line.label}</p>
                      <p className="text-[11px] text-slate-500 capitalize">{line.kind}{line.costPrice != null ? ` · cost ${formatFullINR(line.costPrice)}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-slate-500 shrink-0">Sell ₹</Label>
                      <Input
                        className="h-8 w-28 tabular-nums"
                        type="number"
                        min={0}
                        value={line.sellingPrice || 0}
                        onChange={(e) => onUpdateLineSelling?.(line.kind, line.lineId, Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <QuotePriceBreakdown costing={costing} showInternal audience="internal" />
        </section>
      ) : null}

      {activeStage !== "pricing" ? (
      <div className="space-y-4">
        {nights.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-10 text-center text-sm text-slate-500">
            Add trip cities and nights in Travel details to build the day-wise plan.
          </div>
        ) : (
          nights.map((night, index) => {
            const dayNumber = index + 1;
            const items = itineraryByDate.get(night.date) || [];
            const weekday = weekdayShort(night.date);
            const dayMeta = dayMetaByDate.get(night.date);
            const dayTitle = String(dayMeta?.title || `Day ${dayNumber} · ${night.city || "City"}`);
            const dayCover = String(dayMeta?.coverImage || dayMeta?.imageUrl || "");
            return (
              <section
                key={`${night.date}-${night.city}-${dayNumber}`}
                className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/70">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Day {dayNumber} | {formatDayHeaderDate(night.date)}
                    {weekday ? ` - ${weekday}` : ""} | {night.city || "City"}
                  </h3>
                  {activeStage === "services" ? (
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const dayHasHotel = hotels.some((h) => {
                        const cin = String(h.checkIn || "");
                        const cout = String(h.checkOut || "");
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(cin)) return false;
                        if (/^\d{4}-\d{2}-\d{2}$/.test(cout)) return night.date >= cin && night.date < cout;
                        return night.date === cin;
                      });
                      return DAY_SERVICES.filter(({ key }) => !(key === "Hotel" && dayHasHotel)).map(({ key, icon: Icon }) => {
                        if (key === "Transfers") {
                          return (
                            <DropdownMenu key={key}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-full border-slate-200 bg-white text-slate-700 hover:border-brand-blue/40 hover:text-brand-blue data-[state=open]:bg-brand-blue data-[state=open]:text-white data-[state=open]:border-brand-blue"
                                >
                                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                                  Transfers
                                  <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[180px] rounded-xl p-1">
                                <DropdownMenuItem
                                  className="rounded-lg cursor-pointer gap-2"
                                  onSelect={() => {
                                    if (onOpenService) {
                                      onOpenService({
                                        service: "Transfers",
                                        dayNumber,
                                        date: night.date,
                                        city: night.city,
                                        transferKind: "transfer",
                                      });
                                      return;
                                    }
                                    setServiceTarget({
                                      service: "Transfers",
                                      dayNumber,
                                      date: night.date,
                                      city: night.city,
                                    });
                                  }}
                                >
                                  <Car className="w-3.5 h-3.5 text-brand-blue" />
                                  Transfer
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="rounded-lg cursor-pointer gap-2"
                                  onSelect={() => {
                                    if (onOpenService) {
                                      onOpenService({
                                        service: "Transfers",
                                        dayNumber,
                                        date: night.date,
                                        city: night.city,
                                        transferKind: "airport_pickup",
                                      });
                                      return;
                                    }
                                    setServiceTarget({
                                      service: "Transfers",
                                      dayNumber,
                                      date: night.date,
                                      city: night.city,
                                    });
                                  }}
                                >
                                  <Plane className="w-3.5 h-3.5 text-brand-blue" />
                                  Airport Pickup
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        }
                        return (
                          <Button
                            key={key}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full border-slate-200 bg-white text-slate-700 hover:border-brand-blue/40 hover:text-brand-blue"
                            onClick={() => {
                              if (
                                onOpenService
                                && (
                                  key === "Hotel"
                                  || key === "Activities"
                                  || key === "Meals"
                                  || key === "Miscellaneous"
                                )
                              ) {
                                onOpenService({
                                  service: key,
                                  dayNumber,
                                  date: night.date,
                                  city: night.city,
                                });
                                return;
                              }
                              setServiceTarget({
                                service: key,
                                dayNumber,
                                date: night.date,
                                city: night.city,
                              });
                            }}
                          >
                            <Icon className="w-3.5 h-3.5 mr-1.5" />
                            {key}
                          </Button>
                        );
                      });
                    })()}
                  </div>
                  ) : null}
                </div>

                {activeStage === "itinerary" ? (
                  <div className="px-4 sm:px-5 py-4 border-b border-slate-100 space-y-3 bg-white">
                    {(() => {
                      const stay = stayWindows.find((w) => {
                        if (!w.checkIn || !w.checkOut) return false;
                        return night.date >= w.checkIn && night.date < w.checkOut;
                      }) || stayWindows.find((w) => w.city.trim().toLowerCase() === night.city.trim().toLowerCase());
                      const cityDestId = stay?.destinationId || String(dayMeta?.destinationId || "") || null;
                      const dayPlaces: ItineraryPlaceItem[] = Array.isArray(dayMeta?.places)
                        ? (dayMeta!.places as ItineraryPlaceItem[])
                        : dayMeta?.placeName
                          ? [{ name: String(dayMeta.placeName), description: String(dayMeta.description || ""), imageUrl: String(dayMeta.coverImage || "") }]
                          : [];
                      return (
                        <>
                          <div className="rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2 text-xs text-teal-900">
                            Day city from Travel plan: <span className="font-semibold">{night.city || "—"}</span>
                            {cityDestId
                              ? " · pick sightseeing places (Itinerary Places). Book paid experiences via Add → Activities."
                              : " · set destination on Travel step to load places"}
                          </div>

                          <ItineraryPlaceSelect
                            tripCityDestinationId={cityDestId}
                            tripCityLabel={night.city || "city"}
                            places={dayPlaces}
                            onChange={(nextPlaces) => {
                              const primary = nextPlaces[0];
                              onUpdateItineraryDay?.(night.date, {
                                destinationId: cityDestId || undefined,
                                city: night.city,
                                places: nextPlaces,
                                title: primary
                                  ? `Day ${dayNumber} · ${primary.name}`
                                  : `Day ${dayNumber} · ${night.city || "City"}`,
                                description: nextPlaces.map((p) => {
                                  const bits = [
                                    p.description?.trim(),
                                    p.bestTimeToVisit?.trim()
                                      ? `Best time to visit: ${p.bestTimeToVisit.trim()}`
                                      : "",
                                    p.famousFor?.trim()
                                      ? `Famous for: ${p.famousFor.trim()}`
                                      : "",
                                  ].filter(Boolean);
                                  // description already includes best time / famous for when auto-filled
                                  if (p.description?.trim()) return `${p.name}\n${p.description.trim()}`;
                                  return bits.length ? `${p.name}\n${bits.join("\n")}` : p.name;
                                }).join("\n\n"),
                                coverImage: primary?.imageUrl || dayCover || "",
                              });
                            }}
                          />

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Day title</Label>
                              <Input
                                className="h-9"
                                value={dayTitle}
                                onChange={(e) => onUpdateItineraryDay?.(night.date, { title: e.target.value })}
                                placeholder={`Day ${dayNumber} · ${night.city || "City"}`}
                              />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <ImageUrlListField
                                label="Day cover image"
                                value={dayCover}
                                onChange={(v) =>
                                  onUpdateItineraryDay?.(night.date, {
                                    coverImage: v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "",
                                  })
                                }
                                maxImages={1}
                              />
                            </div>
                          </div>

                          {onOpenService ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => onOpenService({
                                service: "Activities",
                                dayNumber,
                                date: night.date,
                                city: night.city,
                              })}
                            >
                              <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                              Add activity from Products (this city)
                            </Button>
                          ) : null}

                          {dayCover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={dayCover} alt="" className="h-36 w-full object-cover rounded-xl border" />
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ) : null}

                <div className="p-4 sm:p-5 space-y-3">
                  {(() => {
                    const dayHotels = hotels.filter((h) => {
                      const cin = String(h.checkIn || "");
                      const cout = String(h.checkOut || "");
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(cin)) return false;
                      if (/^\d{4}-\d{2}-\d{2}$/.test(cout)) return night.date >= cin && night.date < cout;
                      return night.date === cin;
                    });
                    const nonHotelItems = items.filter((item) => String(item.itemType || "").toUpperCase() !== "HOTEL");
                    const empty = dayHotels.length === 0 && nonHotelItems.length === 0 && items.length === 0;
                    if (empty) {
                      return (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <UserRound className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-semibold text-slate-800">Day at Leisure</p>
                          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                            No activities planned. Free day to explore on your own.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <>
                        {dayHotels.map((hotel, hi) => {
                          const name = String(hotel.hotelName || hotel.name || "Hotel");
                          const stars = hotelStars(hotel.starCategory);
                          const roomType = String(hotel.roomType || "").trim();
                          const meal = String(hotel.mealPlan || "").trim();
                          const refundable = hotel.refundable === true
                            || /refundable|free\s*cancel/i.test(String(hotel.cancellationPolicy || ""));
                          const img = String(hotel.imageUrl || "").trim()
                            || placeholderHotelImage({
                              name,
                              city: String(hotel.city || hotel.tripCity || night.city || ""),
                              country: "Malaysia",
                            });
                          const lineId = String(hotel.lineId || hotel.productId || hi);
                          return (
                            <div
                              key={`hotel-${lineId}-${night.date}`}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-3 flex gap-3"
                            >
                              <div className="relative h-16 w-20 shrink-0 rounded-lg overflow-hidden bg-slate-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Building2 className="w-4 h-4 text-brand-teal shrink-0" />
                                      <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
                                      {stars > 0 && (
                                        <span className="inline-flex items-center gap-0.5">
                                          {Array.from({ length: stars }).map((_, i) => (
                                            <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                                          ))}
                                        </span>
                                      )}
                                    </div>
                                    {roomType ? (
                                      <p className="text-xs text-slate-600 mt-0.5">Room Type: {roomType}</p>
                                    ) : null}
                                    <p className="text-xs text-slate-500">
                                      Check In/Out: {formatStayDisplay(String(hotel.checkIn || ""), String(hotel.checkOut || ""))}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      {meal ? (
                                        <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 text-[10px] font-medium">
                                          {meal}
                                        </span>
                                      ) : null}
                                      {refundable ? (
                                        <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 text-[10px] font-medium">
                                          Refundable
                                        </span>
                                      ) : (
                                        <span className="rounded-md bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 text-[10px] font-medium">
                                          Non-Refundable
                                        </span>
                                      )}
                                      <span className="rounded-md bg-amber-50 text-amber-800 border border-amber-100 px-1.5 py-0.5 text-[10px] font-medium">
                                        On Request
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <ItemActionButtons
                                      onEdit={
                                        onUpdateHotel
                                          ? () => openEdit({
                                            kind: "hotel",
                                            lineId,
                                            title: name,
                                            roomType,
                                            mealPlan: meal,
                                            remarks: String(hotel.remarks || ""),
                                          })
                                          : undefined
                                      }
                                      onDelete={onRemoveHotel ? () => onRemoveHotel(lineId) : undefined}
                                      onView={() => setViewTarget({
                                        kind: "hotel",
                                        title: name,
                                        imageUrl: img,
                                        rows: [
                                          { label: "Room type", value: roomType || "—" },
                                          { label: "Meal plan", value: meal || "—" },
                                          { label: "Check in / out", value: formatStayDisplay(String(hotel.checkIn || ""), String(hotel.checkOut || "")) },
                                          { label: "City", value: String(hotel.city || hotel.tripCity || night.city || "—") },
                                          { label: "Cancellation", value: refundable ? "Refundable" : "Non-refundable" },
                                          { label: "Remarks", value: String(hotel.remarks || "—") },
                                        ],
                                      })}
                                      deleteLabel="Remove hotel"
                                      editLabel="Edit hotel"
                                      viewLabel="View hotel"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {nonHotelItems.length > 0 ? (
                          <ul className="space-y-3">
                            {nonHotelItems.map((item, i) => {
                              const isTransfer = String(item.itemType || "").toUpperCase() === "TRANSFER";
                              const isActivity = String(item.itemType || "").toUpperCase() === "ACTIVITY";
                              const isMeal = String(item.itemType || "").toUpperCase() === "MEAL";
                              const isMisc = String(item.itemType || "").toUpperCase() === "MISC";
                              const transferLineId = String(
                                item.transferLineId || item.lineId || item.sourceKey || "",
                              ).replace(/^transfer:/, "");
                              const activityLineId = String(
                                item.activityLineId || item.lineId || item.sourceKey || "",
                              ).replace(/^activity:/, "");
                              const mealLineId = String(
                                item.mealLineId || item.lineId || item.sourceKey || "",
                              ).replace(/^meal:/, "");
                              const miscLineId = String(
                                item.miscLineId || item.lineId || item.sourceKey || "",
                              ).replace(/^misc:/, "");
                              const pickupDisplay = formatPickupTimeDisplay(item.pickupTime || item.timeSlot);
                              const title = String(item.activityName || `Item ${i + 1}`);
                              const description = String(item.description || "").trim();
                              const isAirportPickup = /airport\s*pickup/i.test(title);
                              const mealTransfer = String(item.transferBadge || "").trim();
                              const miscCategory = String(item.category || "").trim();
                              const activityHours = isActivity
                                ? formatActivityTimingBar({
                                  startTime: String(item.pickupTime || item.timeSlot || ""),
                                  duration: String(item.duration || ""),
                                })
                                : "";
                              return (
                                <li key={`${night.date}-item-${i}`} className="space-y-1">
                                  {(isTransfer || isActivity) && pickupDisplay ? (
                                    <p className="text-xs text-slate-500 tabular-nums pl-0.5">{pickupDisplay}</p>
                                  ) : null}
                                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 flex items-start gap-3">
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold text-slate-900">{title}</p>
                                        {isMeal && mealTransfer ? (
                                          <span
                                            className={cn(
                                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                              /private/i.test(mealTransfer)
                                                ? "bg-sky-100 text-sky-800"
                                                : "bg-slate-100 text-slate-700",
                                            )}
                                          >
                                            {mealTransfer}
                                          </span>
                                        ) : null}
                                        {isMisc && miscCategory ? (
                                          <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-800 px-2 py-0.5 text-[10px] font-semibold">
                                            {miscCategory}
                                          </span>
                                        ) : null}
                                      </div>
                                      {description ? (
                                        <p className="text-xs text-slate-500 line-clamp-2">{description}</p>
                                      ) : null}
                                      {isActivity && activityHours ? (
                                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                          <Clock className="w-3 h-3 text-amber-500" />
                                          {activityHours}
                                        </p>
                                      ) : null}
                                      {isTransfer ? (
                                        <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 text-[10px] font-medium">
                                          <Car className="w-3 h-3" />
                                          {isAirportPickup ? "Pvt. Transfer" : itemTypeLabel(item.itemType)}
                                        </span>
                                      ) : isMeal ? (
                                        <span className="inline-flex items-center rounded-md bg-amber-50 text-amber-800 border border-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                          Meal
                                        </span>
                                      ) : isMisc ? (
                                        <span className="inline-flex items-center rounded-md bg-violet-50 text-violet-800 border border-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                          Misc
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center rounded-md bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                          {itemTypeLabel(item.itemType)}
                                        </span>
                                      )}
                                    </div>
                                    {isTransfer || isActivity || isMeal || isMisc ? (
                                      <ItemActionButtons
                                        onEdit={
                                          isTransfer && onUpdateTransfer && transferLineId
                                            ? () => openEdit({
                                              kind: "transfer",
                                              lineId: transferLineId,
                                              title,
                                              pickupTime: String(item.pickupTime || ""),
                                              remarks: String(item.remarks || ""),
                                            })
                                            : isActivity && onUpdateActivity && activityLineId
                                              ? () => openEdit({
                                                kind: "activity",
                                                lineId: activityLineId,
                                                title,
                                                pickupTime: String(item.pickupTime || item.timeSlot || ""),
                                                remarks: String(item.remarks || ""),
                                              })
                                              : undefined
                                        }
                                        onDelete={
                                          isTransfer && onRemoveTransfer && transferLineId
                                            ? () => onRemoveTransfer(transferLineId)
                                            : isActivity && onRemoveActivity && activityLineId
                                              ? () => onRemoveActivity(activityLineId)
                                              : isMeal && onRemoveMeal && mealLineId
                                                ? () => onRemoveMeal(mealLineId)
                                                : isMisc && onRemoveMisc && miscLineId
                                                  ? () => onRemoveMisc(miscLineId)
                                                  : undefined
                                        }
                                        deleteLabel={
                                          isTransfer ? "Remove transfer"
                                            : isActivity ? "Remove activity"
                                              : isMeal ? "Remove meal"
                                                : "Remove add-on"
                                        }
                                        editLabel={isTransfer ? "Edit transfer" : "Edit activity"}
                                        viewLabel={
                                          isActivity ? "View activity details"
                                            : isMeal ? "View meal"
                                              : isMisc ? "View add-on"
                                                : "View transfer"
                                        }
                                        onView={
                                          isActivity
                                            ? () => setActivityDetails({
                                              name: title,
                                              description,
                                              duration: String(item.duration || ""),
                                              startTime: String(item.startTime || item.pickupTime || item.timeSlot || ""),
                                              closingTime: String(item.closingTime || ""),
                                              timeSlot: String(item.timeSlot || ""),
                                              location: String(item.city || night.city || ""),
                                              city: String(item.city || night.city || ""),
                                              ticketType: String(item.ticketType || item.activityCategory || ""),
                                              activityCategory: String(item.activityCategory || ""),
                                              images: item.imageUrl ? [String(item.imageUrl)] : undefined,
                                              inclusions: item.inclusions,
                                              exclusions: item.exclusions,
                                              passengerInfo: String(item.passengerInfo || item.guestInstructions || item.remarks || ""),
                                              meetingPoint: String(item.meetingPoint || ""),
                                            })
                                            : () => setViewTarget({
                                              kind: isMeal ? "meal" : isMisc ? "misc" : "transfer",
                                              title,
                                              rows: isMeal
                                                ? [
                                                  ...(mealTransfer ? [{ label: "Transfer", value: mealTransfer }] : []),
                                                  { label: "Details", value: description || "—" },
                                                  { label: "Duration", value: String(item.duration || "—") },
                                                  { label: "City", value: String(item.city || night.city || "—") },
                                                  { label: "Remarks", value: String(item.remarks || "—") },
                                                ]
                                                : isMisc
                                                  ? [
                                                    ...(miscCategory ? [{ label: "Category", value: miscCategory }] : []),
                                                    { label: "Details", value: description || "—" },
                                                    { label: "City", value: String(item.city || night.city || "—") },
                                                    { label: "Remarks", value: String(item.remarks || "—") },
                                                  ]
                                                  : [
                                                    { label: "Route / details", value: description || "—" },
                                                    { label: "Pickup time", value: pickupDisplay || String(item.pickupTime || "—") },
                                                    { label: "Vehicle", value: String(item.vehicle || "—") },
                                                    { label: "Duration", value: String(item.duration || "—") },
                                                    { label: "Remarks", value: String(item.remarks || "—") },
                                                  ],
                                            })
                                        }
                                      />
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </section>
            );
          })
        )}
      </div>
      ) : null}

      <ServicePlaceholderDialog
        target={serviceTarget}
        onClose={() => setServiceTarget(null)}
      />
      <ActivityDetailsDialog
        open={Boolean(activityDetails)}
        onOpenChange={(open) => {
          if (!open) setActivityDetails(null);
        }}
        activity={activityDetails}
      />

      <Dialog open={Boolean(viewTarget)} onOpenChange={(open) => { if (!open) setViewTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{viewTarget?.title || "Details"}</DialogTitle>
            <DialogDescription>
              {viewTarget?.kind === "hotel"
                ? "Hotel details"
                : viewTarget?.kind === "transfer"
                  ? "Transfer details"
                  : viewTarget?.kind === "meal"
                    ? "Meal details"
                    : viewTarget?.kind === "misc"
                      ? "Add-on details"
                      : "Item details"}
            </DialogDescription>
          </DialogHeader>
          {viewTarget?.imageUrl ? (
            <div className="relative h-36 rounded-lg overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={viewTarget.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            </div>
          ) : null}
          <dl className="space-y-2.5">
            {(viewTarget?.rows || []).map((row) => (
              <div key={row.label} className="grid grid-cols-[110px_1fr] gap-2 text-sm">
                <dt className="text-slate-500">{row.label}</dt>
                <dd className="text-slate-900 font-medium break-words">{row.value || "—"}</dd>
              </div>
            ))}
          </dl>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.kind || "item"}</DialogTitle>
            <DialogDescription className="truncate">{editTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {editTarget?.kind === "hotel" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-room">Room type</Label>
                  <Input id="edit-room" value={editRoomType} onChange={(e) => setEditRoomType(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-meal">Meal plan</Label>
                  <Input id="edit-meal" value={editMealPlan} onChange={(e) => setEditMealPlan(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="edit-time">
                  {editTarget?.kind === "activity" ? "Start time" : "Pickup time"}
                </Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editPickupTime}
                  onChange={(e) => setEditPickupTime(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="edit-remarks">Remarks</Label>
              <Textarea
                id="edit-remarks"
                rows={3}
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="button" className="bg-slate-900 hover:bg-slate-800 text-white" onClick={saveEdit}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionPill({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof FileDown;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      className="h-9 rounded-full border-slate-200 bg-white text-slate-800 shadow-sm hover:border-brand-blue/40 hover:text-brand-blue"
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5 mr-1.5" />
      {label}
    </Button>
  );
}

function ContactCard({
  title,
  name,
  phone,
  email,
}: {
  title: string;
  name: string;
  phone: string;
  email: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex gap-2.5 items-start">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
        <UserRound className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{phone} · {email}</p>
      </div>
    </div>
  );
}

function ServicePlaceholderDialog({
  target,
  onClose,
}: {
  target: ServiceTarget | null;
  onClose: () => void;
}) {
  const title = !target
    ? ""
    : `${target.service} · Day ${target.dayNumber} · ${target.city} · ${formatItineraryDate(target.date)}`;

  const description = !target
    ? ""
    : `Add ${target.service.toLowerCase()} details for ${target.city} on ${formatItineraryDate(target.date)}. The full form will open here in the next step.`;

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={cn("sm:max-w-md rounded-2xl")}>
        <DialogHeader>
          <DialogTitle className="text-slate-900">{title}</DialogTitle>
          <DialogDescription className="text-slate-500">{description}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          Form fields coming next — popup shell is ready.
        </div>
        <DialogFooter>
          <Button type="button" className="bg-brand-blue hover:bg-brand-blue/90 text-white rounded-xl" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
