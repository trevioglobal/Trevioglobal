"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ImageIcon, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { api, apiFetch, ApiError } from "@/lib/api";
import { mapApiQuotation } from "@/lib/api-mappers";
import { useDemoDataStore } from "@/store/demo-data-store";
import { useAuthStore } from "@/store/app-store";
import type { ProductRecord, Quotation, QuotationPackage } from "@/types";
import { formatFullINR } from "@/components/shared/ui-helpers";
import { calcPackageCosting } from "@/lib/quote-costing";
import { DESTINATION_QUOTE_PLANS, getDestinationQuotePlan } from "@/lib/destination-quote-plans";
import { downloadClientQuotationBrochure } from "@/lib/client-quotation-brochure";
import { DestinationSelect } from "@/components/shared/destination-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STEPS = [
  "Basic Details",
  "Hotels",
  "Flights",
  "Itinerary",
  "Transfers & Activities",
  "Meals",
  "Insurance & Visa",
  "Add-ons",
  "Packages & Costing",
  "Terms",
  "Review",
];

function emptyPackage(name: string, selected = false): QuotationPackage {
  return {
    name,
    isSelected: selected,
    sortOrder: 0,
    hotels: [],
    flights: [],
    transfers: [],
    activities: [],
    meals: [],
    itinerary: [{ day: 1, title: "Day 1", city: "", mealPlan: "", coverImage: "", gallery: [], items: [{ activityName: "Airport Arrival", description: "Meet & greet" }] }],
    visa: { enabled: false, visaType: "Tourist", entryType: "Single Entry", sellingPrice: 0, costPrice: 0 },
    insurance: { enabled: false, provider: "", planName: "", sellingPrice: 0, costPrice: 0 },
    addOns: [],
    inclusions: ["Accommodation", "Breakfast", "Airport transfers"],
    exclusions: ["Flights", "Personal expenses", "Tips"],
  };
}

export function QuotationWizardDialog({
  open,
  onOpenChange,
  quotationId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quotationId?: string | null;
  onSaved?: (q: Quotation) => void;
}) {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const upsertQuotation = useDemoDataStore((s) => s.upsertQuotation);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState<string | null>(quotationId || null);
  const [quoteNo, setQuoteNo] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    agentName: "",
    salesExecutiveName: user?.name || user?.email || "",
    destination: "",
    country: "",
    travelStartDate: "",
    travelEndDate: "",
    adults: 2,
    children: 0,
    infants: 0,
    currency: "INR",
    validTill: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    specialRequests: "",
    internalNotes: "",
    enquiryRef: "",
    isInternational: false,
    discountType: "" as "" | "Fixed" | "Percentage",
    discountValue: 0,
    taxRate: 18,
    termsAndConditions: "Rates subject to availability. Passport must be valid 6 months.",
    paymentTerms: "50% advance to confirm. Balance 15 days before travel.",
    cancellationPolicy: "Cancellation charges as per supplier policy.",
    refundPolicy: "Refunds processed within 15 working days after supplier confirmation.",
    coverImage: "",
  });
  const [packages, setPackages] = useState<QuotationPackage[]>([emptyPackage("Standard", true)]);
  const [destinationId, setDestinationId] = useState("");
  const [visaHint, setVisaHint] = useState("");

  useEffect(() => {
    if (!open) return;
    if (quotationId) {
      setBusy(true);
      api.getQuotationFull(quotationId)
        .then((res) => {
          const q = res.quotation as unknown as Quotation & Record<string, unknown>;
          setId(q.id);
          setQuoteNo(q.quoteNo);
          setStep(Math.max(0, Number(q.wizardStep || 1) - 1));
          setForm((f) => ({
            ...f,
            customerName: q.customerName || "",
            contactPerson: q.contactPerson || "",
            contactEmail: q.contactEmail || "",
            contactPhone: q.contactPhone || "",
            agentName: q.agentName || "",
            salesExecutiveName: q.salesExecutiveName || f.salesExecutiveName,
            destination: q.destination || "",
            country: q.country || "",
            travelStartDate: q.travelStartDate || "",
            travelEndDate: q.travelEndDate || q.returnDate || "",
            adults: q.adults ?? 2,
            children: q.children ?? 0,
            infants: q.infants ?? 0,
            currency: q.currency || "INR",
            validTill: q.validTill,
            specialRequests: q.specialRequests || "",
            internalNotes: q.internalNotes || "",
            enquiryRef: q.enquiryRef || "",
            isInternational: Boolean(q.isInternational),
            discountType: (q.discountType as "" | "Fixed" | "Percentage") || "",
            discountValue: Number(q.discountValue || 0),
            taxRate: Number(q.taxRate ?? 18),
            termsAndConditions: q.termsAndConditions || f.termsAndConditions,
            paymentTerms: q.paymentTerms || f.paymentTerms,
            cancellationPolicy: q.cancellationPolicy || f.cancellationPolicy,
            coverImage: q.coverImage || "",
          }));
          if (q.packages?.length) setPackages(q.packages as QuotationPackage[]);
        })
        .catch(() => toast({ title: "Failed to load quote", variant: "destructive" }))
        .finally(() => setBusy(false));
    } else {
      setId(null);
      setQuoteNo("");
      setStep(0);
      setPackages([emptyPackage("Standard", true)]);
      setDestinationId("");
      setVisaHint("");
      setForm((f) => ({ ...f, coverImage: "" }));
    }
  }, [open, quotationId, toast]);

  const nights = useMemo(() => {
    if (!form.travelStartDate || !form.travelEndDate) return null;
    const a = new Date(form.travelStartDate);
    const b = new Date(form.travelEndDate);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }, [form.travelStartDate, form.travelEndDate]);

  const selected = packages.find((p) => p.isSelected) || packages[0];

  const liveCosting = useMemo(
    () =>
      calcPackageCosting({
        hotels: selected?.hotels,
        flights: selected?.flights,
        transfers: selected?.transfers,
        activities: selected?.activities,
        meals: selected?.meals,
        addOns: selected?.addOns,
        visa: selected?.visa as { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null,
        insurance: selected?.insurance as { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null,
        taxRate: form.taxRate,
        discountType: form.discountType || null,
        discountValue: form.discountValue,
        adults: form.adults,
        children: form.children,
        infants: form.infants,
      }),
    [selected, form.taxRate, form.discountType, form.discountValue, form.adults, form.children, form.infants],
  );

  useEffect(() => {
    if (!form.destination.trim()) {
      setVisaHint("");
      return;
    }
    const t = setTimeout(() => {
      apiFetch<{ items: Array<{ name: string; country?: string; visaRequired?: boolean; visaDetails?: string | null }> }>(
        `/api/destinations?q=${encodeURIComponent(form.destination)}&pageSize=5&status=Active`,
      )
        .then((r) => {
          const hit =
            r.items.find((i) => i.name.toLowerCase() === form.destination.toLowerCase()) ||
            r.items.find((i) => (i.country || "").toLowerCase() === form.country.toLowerCase()) ||
            r.items[0];
          if (!hit) {
            setVisaHint("");
            return;
          }
          setVisaHint(
            hit.visaDetails ||
              (hit.visaRequired
                ? `Visa is typically required for ${hit.name}.`
                : `Visa is often not required for ${hit.name}. Confirm before travel.`),
          );
        })
        .catch(() => setVisaHint(""));
    }, 250);
    return () => clearTimeout(t);
  }, [form.destination, form.country]);

  function patchPkg(idx: number, patch: Partial<QuotationPackage>) {
    setPackages((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function patchSelected(patch: Partial<QuotationPackage>) {
    const idx = packages.findIndex((p) => p.isSelected);
    patchPkg(idx >= 0 ? idx : 0, patch);
  }

  function applyDestinationPlan(planId: string) {
    const plan = getDestinationQuotePlan(planId);
    if (!plan) return;
    setForm((f) => ({
      ...f,
      ...plan.form,
    }));
    setPackages(plan.packages.map((p) => ({ ...p })));
    toast({
      title: `${plan.label} loaded`,
      description: "Hotels, flights, itinerary, highlights and terms are filled. Change dates, customer and prices, then preview the client PDF before sending.",
    });
  }

  async function persist(nextStep = step, submitApproval = false) {
    if (!form.customerName.trim() || !form.destination.trim()) {
      toast({ title: "Customer and destination are required", variant: "destructive" });
      return null;
    }
    if (form.travelEndDate && form.travelStartDate && nights == null) {
      toast({ title: "End date cannot be before start date", variant: "destructive" });
      return null;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        nights: nights ?? undefined,
        travelDates: form.travelStartDate,
        wizardStep: nextStep + 1,
        packages: packages.map((p, i) => ({ ...p, sortOrder: i })),
        service: form.isInternational ? "International" : "Holiday",
      };
      let quotation: Quotation;
      if (!id) {
        const created = await api.createQuotationWizard(payload);
        quotation = mapApiQuotation(created.quotation);
        setId(quotation.id);
        setQuoteNo(quotation.quoteNo);
      } else {
        const saved = await api.saveQuotationWizard(id, payload);
        quotation = mapApiQuotation(saved.quotation);
      }
      if (submitApproval && quotation.id) {
        const approved = await api.submitQuotationApproval(quotation.id);
        quotation = mapApiQuotation(approved.quotation);
      }
      upsertQuotation(quotation);
      if (quotation.packages?.length) setPackages(quotation.packages);
      onSaved?.(quotation);
      toast({ title: submitApproval ? "Submitted for approval" : "Draft saved", description: quotation.quoteNo });
      return quotation;
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof ApiError ? e.message : "Error",
        variant: "destructive",
      });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    const q = await persist(Math.min(step + 1, STEPS.length - 1));
    if (q) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function back() {
    await persist(Math.max(step - 1, 0));
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {quoteNo || "New Quotation"} — Wizard
          </DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
            {nights != null ? ` · ${nights} nights` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 overflow-x-auto pb-2 mb-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              className={cn(
                "text-[10px] px-2 py-1 rounded whitespace-nowrap",
                i === step ? "bg-teal-600 text-white" : i < step ? "bg-teal-100 text-teal-800" : "bg-muted text-muted-foreground",
              )}
              onClick={() => setStep(i)}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-lg border bg-muted/30 p-3 space-y-2">
              <Label className="text-xs">Load a destination plan (optional)</Label>
              <p className="text-[11px] text-muted-foreground">
                Super Admin / Admin / Branch / Employee: pick a ready client brochure plan, then change customer, dates and prices. The PDF sent to the customer looks like the Trevio trip quotation (overview, highlights, itinerary, hotels, flights, inclusions) — without cost or profit.
              </p>
              <Select onValueChange={applyDestinationPlan}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose a plan…" /></SelectTrigger>
                <SelectContent>
                  {DESTINATION_QUOTE_PLANS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Customer *" value={form.customerName} onChange={(v) => setForm({ ...form, customerName: v })} />
            <Field label="Contact Person" value={form.contactPerson} onChange={(v) => setForm({ ...form, contactPerson: v })} />
            <Field label="Email" value={form.contactEmail} onChange={(v) => setForm({ ...form, contactEmail: v })} />
            <Field label="Phone" value={form.contactPhone} onChange={(v) => setForm({ ...form, contactPhone: v })} />
            <Field label="Travel Agent" value={form.agentName} onChange={(v) => setForm({ ...form, agentName: v })} />
            <Field label="Sales Executive" value={form.salesExecutiveName} onChange={(v) => setForm({ ...form, salesExecutiveName: v })} />
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Destination master (optional — fills city/country)</Label>
              <DestinationSelect
                value={destinationId}
                onChange={(id) => {
                  setDestinationId(id);
                  apiFetch<{ item: { name: string; country?: string; heroImage?: string | null; bannerImage?: string | null; thumbnail?: string | null; galleryImages?: string[] } }>(`/api/destinations/${id}`)
                    .then((data) => {
                      const hero = data.item.heroImage || data.item.bannerImage || data.item.thumbnail || data.item.galleryImages?.[0] || "";
                      setForm((f) => ({
                        ...f,
                        destination: data.item.name || f.destination,
                        country: data.item.country || f.country,
                        coverImage: f.coverImage || hero,
                      }));
                    })
                    .catch(() => undefined);
                }}
                placeholder="Search destinations…"
              />
            </div>
            <Field label="Destination City *" value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} />
            <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cover / destination image (customer PDF)</Label>
              <p className="text-[11px] text-muted-foreground">
                Paste an image URL — same as entering a flight number. Used on the brochure cover and destination page. Destination master or a loaded plan can fill this automatically.
              </p>
              <ImageUrlField
                value={form.coverImage}
                onChange={(v) => setForm({ ...form, coverImage: v })}
                placeholder="https://… destination photo"
              />
            </div>
            <Field label="Start Date" type="date" value={form.travelStartDate} onChange={(v) => setForm({ ...form, travelStartDate: v })} />
            <Field label="End Date" type="date" value={form.travelEndDate} onChange={(v) => setForm({ ...form, travelEndDate: v })} />
            <Field label="Adults" type="number" value={String(form.adults)} onChange={(v) => setForm({ ...form, adults: Math.max(0, Number(v) || 0) })} />
            <Field label="Children" type="number" value={String(form.children)} onChange={(v) => setForm({ ...form, children: Math.max(0, Number(v) || 0) })} />
            <Field label="Infants" type="number" value={String(form.infants)} onChange={(v) => setForm({ ...form, infants: Math.max(0, Number(v) || 0) })} />
            <Field label="Valid Until" type="date" value={form.validTill} onChange={(v) => setForm({ ...form, validTill: v })} />
            <Field label="Enquiry Ref" value={form.enquiryRef} onChange={(v) => setForm({ ...form, enquiryRef: v })} />
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={form.isInternational} onCheckedChange={(v) => setForm({ ...form, isInternational: Boolean(v) })} id="intl" />
              <Label htmlFor="intl">International booking</Label>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Special Requests (customer-facing)</Label>
              <Textarea value={form.specialRequests} onChange={(e) => setForm({ ...form, specialRequests: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-amber-700">Internal Notes (never on PDF / agent portal)</Label>
              <Textarea value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
            </div>
          </div>
        )}

        {step === 1 && (
          <ServiceEditor
            title="Hotels"
            rows={(selected?.hotels || []) as Record<string, unknown>[]}
            fields={["hotelName", "starCategory", "roomType", "mealPlan", "checkIn", "checkOut", "rooms", "city", "imageUrl", "costPrice", "sellingPrice", "supplier", "remarks"]}
            onChange={(rows) => patchSelected({ hotels: rows })}
            template={{ hotelName: "", starCategory: "4", roomType: "Deluxe", mealPlan: "Breakfast", rooms: 1, city: "", imageUrl: "", costPrice: 8000, sellingPrice: 10000 }}
            catalogKind="hotels"
            catalogToRow={(item) => hotelFromCatalog(item)}
          />
        )}

        {step === 2 && (
          <ServiceEditor
            title="Flights"
            rows={(selected?.flights || []) as Record<string, unknown>[]}
            fields={["airline", "flightNumber", "from", "to", "date", "depTime", "arrTime", "cabinClass", "pnr", "costPrice", "sellingPrice", "fare"]}
            onChange={(rows) => patchSelected({ flights: rows })}
            template={{ airline: "", flightNumber: "", from: "", to: "", cabinClass: "Economy", costPrice: 12000, sellingPrice: 15000, fare: 15000 }}
          />
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold">Day-wise Itinerary</p>
                <p className="text-[11px] text-muted-foreground">Add a cover photo and extra place images per day so the customer PDF showcases the trip.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!selected?.itinerary?.length} onClick={() => {
                  const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                  if (!days.length) return;
                  const prev = JSON.parse(JSON.stringify(days[days.length - 1])) as Record<string, unknown>;
                  days.push({ ...prev, day: days.length + 1, title: `Day ${days.length + 1}` });
                  patchSelected({ itinerary: days });
                }}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy previous day
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                  days.push({ day: days.length + 1, title: `Day ${days.length + 1}`, city: "", mealPlan: "", coverImage: "", gallery: [], items: [{ activityName: "Leisure", description: "" }] });
                  patchSelected({ itinerary: days });
                }}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Day
                </Button>
              </div>
            </div>
            {((selected?.itinerary || []) as Array<Record<string, unknown>>).map((day, di) => (
              <div key={di} className="border rounded-lg p-3 space-y-2">
                <div className="flex gap-2 items-center">
                  <Input
                    className="h-8"
                    value={String(day.title || `Day ${di + 1}`)}
                    onChange={(e) => {
                      const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                      days[di] = { ...days[di], title: e.target.value, day: di + 1 };
                      patchSelected({ itinerary: days });
                    }}
                  />
                  <Button size="sm" variant="ghost" onClick={() => {
                    const days = ((selected?.itinerary || []) as Array<Record<string, unknown>>).filter((_, i) => i !== di);
                    patchSelected({ itinerary: days });
                  }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="City / place"
                    value={String(day.city || "")}
                    onChange={(v) => {
                      const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                      days[di] = { ...days[di], city: v };
                      patchSelected({ itinerary: days });
                    }}
                  />
                  <Field
                    label="Meal plan"
                    value={String(day.mealPlan || "")}
                    onChange={(v) => {
                      const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                      days[di] = { ...days[di], mealPlan: v };
                      patchSelected({ itinerary: days });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> Day cover image URL
                  </Label>
                  <ImageUrlField
                    value={String(day.coverImage || "")}
                    onChange={(v) => {
                      const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                      days[di] = { ...days[di], coverImage: v };
                      patchSelected({ itinerary: days });
                    }}
                    placeholder="https://… place photo for this day"
                  />
                </div>
                <GalleryUrlsField
                  urls={Array.isArray(day.gallery) ? (day.gallery as unknown[]).map(String).filter(Boolean) : []}
                  onChange={(gallery) => {
                    const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                    days[di] = { ...days[di], gallery };
                    patchSelected({ itinerary: days });
                  }}
                />
                <Textarea
                  className="text-xs"
                  placeholder="Activities (one per line)"
                  value={Array.isArray(day.items) ? (day.items as Array<{ activityName?: string }>).map((i) => i.activityName || "").join("\n") : ""}
                  onChange={(e) => {
                    const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                    days[di] = {
                      ...days[di],
                      items: e.target.value.split("\n").filter(Boolean).map((line) => ({ activityName: line, description: line })),
                    };
                    patchSelected({ itinerary: days });
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <ServiceEditor
              title="Transfers"
              rows={(selected?.transfers || []) as Record<string, unknown>[]}
              fields={["transferType", "date", "pickup", "drop", "vehicleType", "costPrice", "sellingPrice", "supplier"]}
              onChange={(rows) => patchSelected({ transfers: rows })}
              template={{ transferType: "Airport Pickup", vehicleType: "Sedan", costPrice: 1500, sellingPrice: 2200 }}
              catalogKind="transfers"
              catalogToRow={(item) => ({
                productId: item.id,
                transferType: String(item.transferType || item.name || "Transfer"),
                vehicleType: String(item.vehicleType || "Sedan"),
                pickup: String(item.pickupLocation || ""),
                drop: String(item.dropLocation || ""),
                costPrice: Math.round(Number(item.privatePrice ?? item.sharedPrice ?? 0) * 0.75),
                sellingPrice: Number(item.privatePrice ?? item.sharedPrice ?? 0),
                supplier: item.supplier?.name,
              })}
            />
            <ServiceEditor
              title="Activities"
              rows={(selected?.activities || []) as Record<string, unknown>[]}
              fields={["activityName", "description", "date", "ticketType", "adultRate", "childRate", "adults", "children", "imageUrl", "costPrice", "sellingPrice"]}
              onChange={(rows) => patchSelected({ activities: rows })}
              template={{ activityName: "", description: "", ticketType: "Standard", adultRate: 2500, childRate: 1500, adults: form.adults, children: form.children, imageUrl: "", costPrice: 2000, sellingPrice: 2500 }}
              catalogKind="activities"
              catalogToRow={(item) => ({
                productId: item.id,
                activityName: item.name,
                description: String(item.shortDescription || item.description || ""),
                ticketType: "Standard",
                adultRate: Number(item.adultPrice || 0),
                childRate: Number(item.childPrice || 0),
                adults: form.adults,
                children: form.children,
                imageUrl: firstProductImage(item),
                costPrice: Math.round(Number(item.adultPrice || 0) * 0.75),
                sellingPrice: Number(item.adultPrice || 0),
                supplier: item.supplier?.name,
              })}
            />
          </div>
        )}

        {step === 5 && (
          <ServiceEditor
            title="Meals"
            rows={(selected?.meals || []) as Record<string, unknown>[]}
            fields={["restaurant", "cuisine", "mealType", "date", "adults", "children", "adultRate", "childRate", "costPrice", "sellingPrice"]}
            onChange={(rows) => patchSelected({ meals: rows })}
            template={{ mealType: "Dinner", cuisine: "Local", adults: form.adults, children: form.children, adultRate: 1200, childRate: 800, costPrice: 900, sellingPrice: 1200 }}
          />
        )}

        {step === 6 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(selected?.insurance && (selected.insurance as { enabled?: boolean }).enabled)}
                  onCheckedChange={(v) => patchSelected({
                    insurance: { ...(selected?.insurance || {}), enabled: Boolean(v), provider: "TATA AIG", planName: "Travel Guard", costPrice: 800, sellingPrice: 1200 },
                  })}
                />
                <Label>Enable Travel Insurance</Label>
              </div>
              {Boolean((selected?.insurance as { enabled?: boolean })?.enabled) && (
                <>
                  <Field label="Provider" value={String((selected?.insurance as { provider?: string })?.provider || "")} onChange={(v) => patchSelected({ insurance: { ...selected?.insurance, provider: v } })} />
                  <Field label="Plan" value={String((selected?.insurance as { planName?: string })?.planName || "")} onChange={(v) => patchSelected({ insurance: { ...selected?.insurance, planName: v } })} />
                  <Field label="Selling" type="number" value={String((selected?.insurance as { sellingPrice?: number })?.sellingPrice || 0)} onChange={(v) => patchSelected({ insurance: { ...selected?.insurance, sellingPrice: Number(v) || 0 } })} />
                  <Field label="Cost" type="number" value={String((selected?.insurance as { costPrice?: number })?.costPrice || 0)} onChange={(v) => patchSelected({ insurance: { ...selected?.insurance, costPrice: Number(v) || 0 } })} />
                </>
              )}
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(selected?.visa && (selected.visa as { enabled?: boolean }).enabled)}
                  onCheckedChange={(v) => patchSelected({
                    visa: { ...(selected?.visa || {}), enabled: Boolean(v), visaType: "Tourist", entryType: "Single Entry", costPrice: 3000, sellingPrice: 4500, required: form.isInternational },
                  })}
                />
                <Label>Visa Required / Include Visa Service</Label>
              </div>
              {Boolean((selected?.visa as { enabled?: boolean })?.enabled) && (
                <>
                  <Field label="Visa Type" value={String((selected?.visa as { visaType?: string })?.visaType || "")} onChange={(v) => patchSelected({ visa: { ...selected?.visa, visaType: v } })} />
                  <Field label="Entry" value={String((selected?.visa as { entryType?: string })?.entryType || "")} onChange={(v) => patchSelected({ visa: { ...selected?.visa, entryType: v } })} />
                  <Field label="Selling" type="number" value={String((selected?.visa as { sellingPrice?: number })?.sellingPrice || 0)} onChange={(v) => patchSelected({ visa: { ...selected?.visa, sellingPrice: Number(v) || 0 } })} />
                </>
              )}
              <p className="text-[11px] text-muted-foreground">
                {form.isInternational ? "International trip — visa often required." : "Domestic — visa typically not required."}
              </p>
              {visaHint && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-2 text-[11px] text-amber-900 dark:text-amber-200">
                  {visaHint}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 7 && (
          <ServiceEditor
            title="Optional Add-ons"
            rows={(selected?.addOns || []) as Record<string, unknown>[]}
            fields={["name", "description", "quantity", "costPrice", "sellingPrice", "remarks"]}
            onChange={(rows) => patchSelected({ addOns: rows.map((r) => ({ ...r, enabled: true })) })}
            template={{ name: "eSIM", description: "", quantity: 1, costPrice: 500, sellingPrice: 899 }}
          />
        )}

        {step === 8 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {packages.map((p, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={p.isSelected ? "default" : "outline"}
                  onClick={() => setPackages((prev) => prev.map((x, j) => ({ ...x, isSelected: j === i })))}
                >
                  {p.name}
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => setPackages((prev) => [...prev, emptyPackage(["Economy", "Deluxe", "Premium", "Luxury"][prev.length] || `Option ${prev.length + 1}`)])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Package Option
              </Button>
            </div>
            <Field
              label="Selected package name"
              value={selected?.name || ""}
              onChange={(v) => patchSelected({ name: v })}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Discount Type</Label>
                <Select value={form.discountType || "none"} onValueChange={(v) => setForm({ ...form, discountType: v === "none" ? "" : v as "Fixed" | "Percentage" })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="Fixed">Fixed</SelectItem>
                    <SelectItem value="Percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field label="Discount Value" type="number" value={String(form.discountValue)} onChange={(v) => setForm({ ...form, discountValue: Number(v) || 0 })} />
              <Field label="Tax Rate %" type="number" value={String(form.taxRate)} onChange={(v) => setForm({ ...form, taxRate: Number(v) || 0 })} />
            </div>
            <p className="text-xs text-muted-foreground">
              Figures below are a live preview. Final totals are recalculated on the server when you save.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Info label="Net cost" value={formatFullINR(liveCosting.totalNetCost)} />
              <Info label="Selling" value={formatFullINR(liveCosting.totalSelling + liveCosting.discountAmount)} />
              <Info label="Discount" value={formatFullINR(liveCosting.discountAmount)} />
              <Info label="GST (incl.)" value={formatFullINR(liveCosting.gst)} />
              <Info label="Final package" value={formatFullINR(liveCosting.total)} />
              <Info label="Per person" value={formatFullINR(liveCosting.perPersonCost)} />
              <Info label="Gross profit" value={formatFullINR(liveCosting.grossProfit)} />
              <Info label="Margin" value={`${liveCosting.profitMargin}%`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Inclusions (one per line)</Label>
                <Textarea
                  value={(selected?.inclusions || []).join("\n")}
                  onChange={(e) => patchSelected({ inclusions: e.target.value.split("\n").filter(Boolean) })}
                />
              </div>
              <div>
                <Label className="text-xs">Exclusions (one per line)</Label>
                <Textarea
                  value={(selected?.exclusions || []).join("\n")}
                  onChange={(e) => patchSelected({ exclusions: e.target.value.split("\n").filter(Boolean) })}
                />
              </div>
            </div>
          </div>
        )}

        {step === 9 && (
          <div className="space-y-2">
            <Label className="text-xs">Terms & Conditions</Label>
            <Textarea value={form.termsAndConditions} onChange={(e) => setForm({ ...form, termsAndConditions: e.target.value })} rows={3} />
            <Label className="text-xs">Payment Policy</Label>
            <Textarea value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} rows={2} />
            <Label className="text-xs">Cancellation Policy</Label>
            <Textarea value={form.cancellationPolicy} onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })} rows={2} />
            <Label className="text-xs">Refund Policy</Label>
            <Textarea value={form.refundPolicy} onChange={(e) => setForm({ ...form, refundPolicy: e.target.value })} rows={2} />
          </div>
        )}

        {step === 10 && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="Customer" value={form.customerName} />
              <Info label="Destination" value={`${form.destination}${form.country ? `, ${form.country}` : ""}`} />
              <Info label="Travel" value={`${form.travelStartDate || "—"} → ${form.travelEndDate || "—"}`} />
              <Info label="Pax" value={`${form.adults}A ${form.children}C ${form.infants}I`} />
              <Info label="Packages" value={packages.map((p) => p.name).join(", ")} />
              <Info label="Selected" value={selected?.name || "—"} />
            </div>
            <div className="rounded-lg border p-3 bg-muted/30 text-xs space-y-2">
              <p className="font-semibold">Customer preview hides cost, profit, suppliers, and internal notes.</p>
              <p>Hotels: {(selected?.hotels || []).length} · Flights: {(selected?.flights || []).length} · Activities: {(selected?.activities || []).length}</p>
              <p>
                Photos: {form.coverImage ? "cover · " : ""}
                {(selected?.hotels || []).filter((h) => Boolean((h as Record<string, unknown>).imageUrl)).length} hotels ·
                {" "}{(selected?.itinerary || []).filter((d) => Boolean((d as Record<string, unknown>).coverImage)).length} itinerary days ·
                {" "}{(selected?.activities || []).filter((a) => Boolean((a as Record<string, unknown>).imageUrl)).length} experiences
              </p>
              <p>Insurance: {(selected?.insurance as { enabled?: boolean })?.enabled ? "Yes" : "No"} · Visa: {(selected?.visa as { enabled?: boolean })?.enabled ? "Yes" : "No"}</p>
              <p>Final (preview): {formatFullINR(liveCosting.total)} · Per person: {formatFullINR(liveCosting.perPersonCost)}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!form.customerName.trim() || !form.destination.trim()) {
                    toast({ title: "Customer and destination are required for the client PDF", variant: "destructive" });
                    return;
                  }
                  const preview: Quotation = {
                    id: id || "preview",
                    quoteNo: quoteNo || "DRAFT",
                    customerName: form.customerName,
                    service: form.isInternational ? "International" : "Holiday",
                    items: packages.length,
                    amount: liveCosting.totalSelling,
                    gst: liveCosting.gst,
                    total: liveCosting.total,
                    status: "Draft",
                    validTill: form.validTill,
                    createdBy: form.salesExecutiveName,
                    createdAt: new Date().toISOString(),
                    contactPerson: form.contactPerson,
                    contactEmail: form.contactEmail,
                    contactPhone: form.contactPhone,
                    destination: form.destination,
                    country: form.country,
                    coverImage: form.coverImage || undefined,
                    travelDates: form.travelStartDate,
                    travelStartDate: form.travelStartDate,
                    travelEndDate: form.travelEndDate,
                    nights: nights ?? undefined,
                    days: nights != null ? nights + 1 : undefined,
                    adults: form.adults,
                    children: form.children,
                    infants: form.infants,
                    currency: form.currency,
                    packageIncludes: selected?.inclusions,
                    packageExcludes: selected?.exclusions,
                    termsAndConditions: form.termsAndConditions,
                    paymentTerms: form.paymentTerms,
                    cancellationPolicy: form.cancellationPolicy,
                    refundPolicy: form.refundPolicy,
                    salesExecutiveName: form.salesExecutiveName,
                    specialRequests: form.specialRequests,
                    taxRate: form.taxRate,
                    perPersonCost: liveCosting.perPersonCost,
                    packages,
                  };
                  const ok = await downloadClientQuotationBrochure(preview);
                  toast({
                    title: ok ? "Client brochure opened" : "Popup blocked",
                    description: ok
                      ? "This is what the customer sees. Print → Save as PDF, then Email / WhatsApp from the quote list."
                      : "Allow popups.",
                    variant: ok ? "default" : "destructive",
                  });
                }}
              >
                Preview client PDF (what customer receives)
              </Button>
            </div>
            {packages.length > 1 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="p-2 text-left">Feature</th>
                      {packages.map((p) => <th key={p.name} className="p-2 text-left">{p.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2 border-t">Hotels</td>
                      {packages.map((p) => <td key={p.name} className="p-2 border-t">{(p.hotels || []).length}</td>)}
                    </tr>
                    <tr>
                      <td className="p-2 border-t">Flights</td>
                      {packages.map((p) => <td key={p.name} className="p-2 border-t">{(p.flights || []).length}</td>)}
                    </tr>
                    <tr>
                      <td className="p-2 border-t">Insurance</td>
                      {packages.map((p) => <td key={p.name} className="p-2 border-t">{(p.insurance as { enabled?: boolean })?.enabled ? "Yes" : "No"}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border bg-muted/20 p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          <Info label="Customer" value={form.customerName || "—"} />
          <Info label="Destination" value={form.destination || "—"} />
          <Info label="Travel" value={`${form.travelStartDate || "—"} → ${form.travelEndDate || "—"}`} />
          <Info label="Pax" value={`${form.adults}A ${form.children}C ${form.infants}I`} />
          <Info label="Net cost" value={formatFullINR(liveCosting.totalNetCost)} />
          <Info label="Final" value={formatFullINR(liveCosting.total)} />
          <Info label="Profit" value={formatFullINR(liveCosting.grossProfit)} />
          <Info label="Margin" value={`${liveCosting.profitMargin}%`} />
        </div>

        <div className="flex flex-wrap gap-2 justify-between pt-3 border-t">
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy || step === 0} onClick={back}>Back</Button>
            <Button variant="outline" disabled={busy} onClick={() => persist(step)}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Draft"}
            </Button>
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button disabled={busy} onClick={next}>Save & Continue</Button>
            ) : (
              <>
                <Button variant="outline" disabled={busy} onClick={async () => { await persist(step); onOpenChange(false); }}>
                  Finish Later
                </Button>
                <Button
                  disabled={busy}
                  className="bg-teal-600 hover:bg-teal-700"
                  onClick={async () => {
                    const q = await persist(step, true);
                    if (q) onOpenChange(false);
                  }}
                >
                  Submit for Approval
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, value, onChange, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input className="h-8 text-xs" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

function firstProductImage(item: ProductRecord): string {
  if (Array.isArray(item.images) && item.images.length) return String(item.images[0] || "");
  if (typeof item.heroImage === "string" && item.heroImage) return item.heroImage;
  if (typeof item.thumbnail === "string" && item.thumbnail) return item.thumbnail;
  if (item.destination?.heroImage) return String(item.destination.heroImage);
  if (item.destination?.thumbnail) return String(item.destination.thumbnail);
  return "";
}

function isImageField(name: string) {
  return name === "imageUrl" || name === "coverImage";
}

function ImageUrlField({
  value,
  onChange,
  placeholder = "https://…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex gap-2 items-start">
      {/^https?:\/\/|^data:image\/|^\//i.test(value.trim()) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value.trim()} alt="" className="h-12 w-16 rounded object-cover border shrink-0 bg-muted" />
      )}
      <Input
        className="h-8 text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function GalleryUrlsField({
  urls,
  onChange,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const url = draft.trim();
    if (!url) return;
    onChange([...urls, url]);
    setDraft("");
  }
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">Place gallery URLs (Enter to add)</Label>
      <div className="flex gap-1">
        <Input
          className="h-8 text-xs"
          placeholder="https://… extra place photo"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>Add</Button>
      </div>
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {urls.map((url, i) => (
            <div key={`${url}-${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-12 w-16 rounded object-cover border bg-muted" />
              <button
                type="button"
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-background border text-[9px] leading-none"
                onClick={() => onChange(urls.filter((_, j) => j !== i))}
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function hotelFromCatalog(item: ProductRecord): Record<string, unknown> {
  const rooms = Array.isArray(item.roomCategories) ? (item.roomCategories as Array<Record<string, unknown>>) : [];
  const first = rooms[0];
  const pricing = (first?.pricing as Record<string, number>) || {};
  const selling = Number(pricing.double ?? pricing.single ?? 0);
  return {
    productId: item.id,
    hotelName: item.name,
    starCategory: String(item.starCategory || ""),
    roomType: String(first?.name || "Deluxe"),
    mealPlan: String(first?.mealPlan || "Breakfast"),
    city: String(item.city || item.destination?.name || ""),
    imageUrl: firstProductImage(item),
    costPrice: Math.round(selling * 0.75),
    sellingPrice: selling,
    supplier: item.supplier?.name,
  };
}

function ServiceEditor({
  title, rows, fields, onChange, template, catalogKind, catalogToRow,
}: {
  title: string;
  rows: Record<string, unknown>[];
  fields: string[];
  onChange: (rows: Record<string, unknown>[]) => void;
  template: Record<string, unknown>;
  catalogKind?: "hotels" | "activities" | "transfers";
  catalogToRow?: (item: ProductRecord) => Record<string, unknown>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold">{title}</p>
        <div className="flex gap-2">
          {catalogKind && catalogToRow && (
            <CatalogPicker kind={catalogKind} onPick={(item) => onChange([...rows, catalogToRow(item)])} />
          )}
          <Button size="sm" variant="outline" onClick={() => onChange([...rows, { ...template }])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add self-booked
          </Button>
        </div>
      </div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No rows yet — pick from catalog or enter self-booked details.</p>}
      {rows.map((row, i) => (
        <div key={i} className="border rounded-lg p-2 grid grid-cols-2 md:grid-cols-3 gap-2 relative">
          <Button
            size="sm"
            variant="ghost"
            className="absolute right-1 top-1 h-7 w-7 p-0"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          {fields.map((f) => (
            <div key={f} className={isImageField(f) ? "col-span-2 md:col-span-3 pr-8" : ""}>
              <Label className="text-[10px] capitalize text-muted-foreground">{f === "imageUrl" ? "Image URL" : f}</Label>
              {isImageField(f) ? (
                <ImageUrlField
                  value={String(row[f] ?? "")}
                  onChange={(v) => {
                    const next = [...rows];
                    next[i] = { ...next[i], [f]: v };
                    onChange(next);
                  }}
                  placeholder="https://… photo for customer PDF"
                />
              ) : (
                <Input
                  className="h-7 text-xs"
                  value={String(row[f] ?? "")}
                  onChange={(e) => {
                    const next = [...rows];
                    const num = ["costPrice", "sellingPrice", "fare", "rooms", "quantity", "adultRate", "childRate", "adults", "children"].includes(f);
                    next[i] = { ...next[i], [f]: num ? Number(e.target.value) || 0 : e.target.value };
                    onChange(next);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CatalogPicker({
  kind,
  onPick,
}: {
  kind: "hotels" | "activities" | "transfers";
  onPick: (item: ProductRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch<{ items: ProductRecord[] }>(
        `/api/products/${kind}?liveOnly=true&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      )
        .then((r) => setItems(r.items || []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [open, q, kind]);

  return (
    <div className="relative">
      <Button size="sm" variant="outline" type="button" onClick={() => setOpen((v) => !v)}>
        <Search className="w-3.5 h-3.5 mr-1" /> Catalog
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border bg-popover p-2 shadow-md">
          <Input
            className="h-8 text-xs mb-2"
            placeholder={`Search ${kind}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {loading && <p className="text-[11px] text-muted-foreground px-1">Loading…</p>}
            {!loading && items.length === 0 && <p className="text-[11px] text-muted-foreground px-1">No live products.</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full text-left text-xs rounded px-2 py-1.5 hover:bg-muted"
                onClick={() => {
                  onPick(item);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{item.name}</span>
                {item.destination?.name && (
                  <span className="text-muted-foreground"> · {item.destination.name}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
