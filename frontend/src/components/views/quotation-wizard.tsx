"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { mapApiQuotation } from "@/lib/api-mappers";
import { useDemoDataStore } from "@/store/demo-data-store";
import { useAuthStore } from "@/store/app-store";
import type { Quotation, QuotationPackage } from "@/types";
import { formatFullINR } from "@/components/shared/ui-helpers";
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
    itinerary: [{ day: 1, title: "Day 1", items: [{ activityName: "Airport Arrival", description: "Meet & greet" }] }],
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
  });
  const [packages, setPackages] = useState<QuotationPackage[]>([emptyPackage("Standard", true)]);

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

  function patchPkg(idx: number, patch: Partial<QuotationPackage>) {
    setPackages((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function patchSelected(patch: Partial<QuotationPackage>) {
    const idx = packages.findIndex((p) => p.isSelected);
    patchPkg(idx >= 0 ? idx : 0, patch);
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

  const selIdx = Math.max(0, packages.findIndex((p) => p.isSelected));

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
            <Field label="Customer *" value={form.customerName} onChange={(v) => setForm({ ...form, customerName: v })} />
            <Field label="Contact Person" value={form.contactPerson} onChange={(v) => setForm({ ...form, contactPerson: v })} />
            <Field label="Email" value={form.contactEmail} onChange={(v) => setForm({ ...form, contactEmail: v })} />
            <Field label="Phone" value={form.contactPhone} onChange={(v) => setForm({ ...form, contactPhone: v })} />
            <Field label="Travel Agent" value={form.agentName} onChange={(v) => setForm({ ...form, agentName: v })} />
            <Field label="Sales Executive" value={form.salesExecutiveName} onChange={(v) => setForm({ ...form, salesExecutiveName: v })} />
            <Field label="Destination City *" value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} />
            <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
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
            fields={["hotelName", "starCategory", "roomType", "mealPlan", "checkIn", "checkOut", "rooms", "costPrice", "sellingPrice", "supplier", "remarks"]}
            onChange={(rows) => patchSelected({ hotels: rows })}
            template={{ hotelName: "", starCategory: "4", roomType: "Deluxe", mealPlan: "Breakfast", rooms: 1, costPrice: 8000, sellingPrice: 10000 }}
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
              <p className="text-sm font-semibold">Day-wise Itinerary</p>
              <Button size="sm" variant="outline" onClick={() => {
                const days = [...(selected?.itinerary || [])] as Array<Record<string, unknown>>;
                days.push({ day: days.length + 1, title: `Day ${days.length + 1}`, items: [{ activityName: "Leisure", description: "" }] });
                patchSelected({ itinerary: days });
              }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Day
              </Button>
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
            />
            <ServiceEditor
              title="Activities"
              rows={(selected?.activities || []) as Record<string, unknown>[]}
              fields={["activityName", "date", "ticketType", "adultRate", "childRate", "adults", "children", "costPrice", "sellingPrice"]}
              onChange={(rows) => patchSelected({ activities: rows })}
              template={{ activityName: "", ticketType: "Standard", adultRate: 2500, childRate: 1500, adults: form.adults, children: form.children, costPrice: 2000, sellingPrice: 2500 }}
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
              Costing recalculates on save from cost/sell on each service line. Role-based discount caps enforced server-side.
            </p>
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
            <div className="rounded-lg border p-3 bg-muted/30 text-xs space-y-1">
              <p className="font-semibold">Customer preview hides cost, profit, suppliers, and internal notes.</p>
              <p>Hotels: {(selected?.hotels || []).length} · Flights: {(selected?.flights || []).length} · Activities: {(selected?.activities || []).length}</p>
              <p>Insurance: {(selected?.insurance as { enabled?: boolean })?.enabled ? "Yes" : "No"} · Visa: {(selected?.visa as { enabled?: boolean })?.enabled ? "Yes" : "No"}</p>
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
        {/* silence unused */}
        <span className="hidden">{selIdx}{formatFullINR(0)}</span>
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

function ServiceEditor({
  title, rows, fields, onChange, template,
}: {
  title: string;
  rows: Record<string, unknown>[];
  fields: string[];
  onChange: (rows: Record<string, unknown>[]) => void;
  template: Record<string, unknown>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-sm font-semibold">{title}</p>
        <Button size="sm" variant="outline" onClick={() => onChange([...rows, { ...template }])}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No rows yet — add from catalog manually or enter self-booked details.</p>}
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
            <div key={f}>
              <Label className="text-[10px] capitalize text-muted-foreground">{f}</Label>
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
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
