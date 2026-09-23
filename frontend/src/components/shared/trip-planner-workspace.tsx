"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { DestinationSelect } from "@/components/shared/destination-select";
import { PageShell, PageHeader } from "@/components/shared/ui-helpers";
import { TripPricePanel } from "@/components/shared/trip-price-panel";
import { PackageMatchCard } from "@/components/shared/package-match-card";
import { TripCustomizePanel } from "@/components/shared/trip-customize-panel";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { todayYmd } from "@/lib/travel-dates";
import type { Customer, Lead, PackageMatchRecord, TravelRequirementRecord } from "@/types";

const HOTEL_CATEGORIES = ["Standard", "Premium", "Luxury", "3-star", "4-star", "5-star", "Budget"];
const PACKAGE_TYPES = ["Standard", "Premium", "Luxury", "Budget", "Honeymoon", "Family", "Adventure"];

export interface RequirementFormState {
  customerId: string;
  leadId: string;
  destinationId: string;
  travelStartDate: string;
  travelEndDate: string;
  adults: string;
  children: string;
  infants: string;
  budgetMin: string;
  budgetMax: string;
  hotelCategory: string;
  packageType: string;
  preferredTransfer: string;
  flightRequired: boolean;
  visaRequired: boolean;
  insuranceRequired: boolean;
  specialRequests: string;
  markup: string;
}

const EMPTY_FORM: RequirementFormState = {
  customerId: "", leadId: "", destinationId: "",
  travelStartDate: "", travelEndDate: "",
  adults: "2", children: "0", infants: "0",
  budgetMin: "0", budgetMax: "0",
  hotelCategory: "Standard", packageType: "Standard", preferredTransfer: "",
  flightRequired: false, visaRequired: false, insuranceRequired: false,
  specialRequests: "", markup: "0",
};

function canRecommend(form: RequirementFormState) {
  return form.destinationId && form.travelStartDate && form.travelEndDate && parseInt(form.adults, 10) >= 1;
}

interface TripPlannerWorkspaceProps {
  requirementId?: string | null;
  onBack: () => void;
  onSaved: (id: string) => void;
}

export function TripPlannerWorkspace({ requirementId, onBack, onSaved }: TripPlannerWorkspaceProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<RequirementFormState>(EMPTY_FORM);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [matches, setMatches] = useState<PackageMatchRecord[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(requirementId ?? null);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const set = <K extends keyof RequirementFormState>(key: K, value: RequirementFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    Promise.all([
      apiFetch<{ customers: Customer[] }>("/api/customers?pageSize=100").then((d) => setCustomers(d.customers)).catch(() => {}),
      apiFetch<{ leads: Lead[] }>("/api/leads?pageSize=100").then((d) => setLeads(d.leads)).catch(() => {}),
    ]);
  }, []);

  useEffect(() => {
    if (!requirementId) return;
    apiFetch<{ item: TravelRequirementRecord }>(`/api/trip-requirements/${requirementId}`)
      .then(({ item }) => {
        setSavedId(item.id);
        setForm({
          customerId: item.customerId ?? "",
          leadId: item.leadId ?? "",
          destinationId: item.destinationId,
          travelStartDate: item.travelStartDate.slice(0, 10),
          travelEndDate: item.travelEndDate.slice(0, 10),
          adults: String(item.adults),
          children: String(item.children),
          infants: String(item.infants),
          budgetMin: String(item.budgetMin),
          budgetMax: String(item.budgetMax),
          hotelCategory: item.hotelCategory ?? "Standard",
          packageType: item.packageType ?? "Standard",
          preferredTransfer: item.preferredTransfer ?? "",
          flightRequired: item.flightRequired,
          visaRequired: item.visaRequired,
          insuranceRequired: item.insuranceRequired,
          specialRequests: item.specialRequests ?? "",
          markup: String(item.markup),
        });
        const sel = item.selections?.find((s) => s.isSelected);
        if (sel) setActivePackageId(sel.packageId);
      })
      .catch(() => toast({ title: "Failed to load requirement", variant: "destructive" }));
  }, [requirementId, toast]);

  const activeMatch = useMemo(() => matches.find((m) => m.packageId === activePackageId), [matches, activePackageId]);

  const fetchMatches = async () => {
    if (!canRecommend(form)) {
      toast({ title: "Enter destination, dates, and passengers first", variant: "destructive" });
      return;
    }
    setLoadingMatches(true);
    setHasSearched(true);
    try {
      const start = new Date(form.travelStartDate);
      const end = new Date(form.travelEndDate);
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (86400000)) + 1);
      const payload = {
        destinationId: form.destinationId,
        days,
        nights: Math.max(0, days - 1),
        budgetMin: parseInt(form.budgetMin, 10) || 0,
        budgetMax: parseInt(form.budgetMax, 10) || 0,
        hotelCategory: form.hotelCategory || null,
        packageType: form.packageType || null,
        adults: parseInt(form.adults, 10) || 1,
      };
      const data = savedId
        ? await apiFetch<{ matches: PackageMatchRecord[] }>(`/api/trip-requirements/${savedId}/recommendations`, { method: "POST" })
        : await apiFetch<{ matches: PackageMatchRecord[] }>("/api/trip-requirements/recommendations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      setMatches(data.matches);
    } catch (e) {
      toast({ title: "Failed to load recommendations", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setLoadingMatches(false);
    }
  };

  const buildPayload = () => {
    const start = new Date(form.travelStartDate);
    const end = new Date(form.travelEndDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (86400000)) + 1);
    return {
      customerId: form.customerId || null,
      leadId: form.leadId || null,
      destinationId: form.destinationId,
      travelStartDate: form.travelStartDate,
      travelEndDate: form.travelEndDate,
      days,
      nights: Math.max(0, days - 1),
      adults: parseInt(form.adults, 10) || 1,
      children: parseInt(form.children, 10) || 0,
      infants: parseInt(form.infants, 10) || 0,
      budgetMin: parseInt(form.budgetMin, 10) || 0,
      budgetMax: parseInt(form.budgetMax, 10) || 0,
      hotelCategory: form.hotelCategory || null,
      packageType: form.packageType || null,
      preferredTransfer: form.preferredTransfer || null,
      flightRequired: form.flightRequired,
      visaRequired: form.visaRequired,
      insuranceRequired: form.insuranceRequired,
      specialRequests: form.specialRequests || null,
      markup: parseInt(form.markup, 10) || 0,
      status: "Draft" as const,
    };
  };

  const handleSave = async () => {
    if (!canRecommend(form)) {
      toast({ title: "Destination, dates, and adults are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (savedId) {
        await apiFetch(`/api/trip-requirements/${savedId}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Requirement saved" });
        onSaved(savedId);
      } else {
        const { item } = await apiFetch<{ item: TravelRequirementRecord }>("/api/trip-requirements", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSavedId(item.id);
        toast({ title: "Trip requirement created" });
        onSaved(item.id);
      }
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Trip Requirement Builder"
        subtitle="Capture requirements and match packages. Pick a destination from the list, then Find Packages or Save."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-1" />Back
            </Button>
            <Button type="button" variant="outline" disabled={loadingMatches} onClick={() => void fetchMatches()}>
              <Sparkles className="w-4 h-4 mr-1" />{loadingMatches ? "Matching..." : "Find Packages"}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              <Save className="w-4 h-4 mr-1" />{saving ? "Saving..." : "Save Requirement"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Requirement Form */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm text-primary">Travel Requirement</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Customer</Label>
                <Select value={form.customerId || "none"} onValueChange={(v) => set("customerId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lead (optional)</Label>
                <Select value={form.leadId || "none"} onValueChange={(v) => set("leadId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.customerName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Destination *</Label>
                <DestinationSelect value={form.destinationId} onChange={(v) => set("destinationId", v)} required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Date *</Label>
                <Input type="date" value={form.travelStartDate} min={todayYmd()} onChange={(e) => set("travelStartDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date *</Label>
                <Input type="date" value={form.travelEndDate} min={form.travelStartDate || todayYmd()} onChange={(e) => set("travelEndDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Adults *</Label>
                <Input type="number" min={1} value={form.adults} onChange={(e) => set("adults", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Children</Label>
                <Input type="number" min={0} value={form.children} onChange={(e) => set("children", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Infants</Label>
                <Input type="number" min={0} value={form.infants} onChange={(e) => set("infants", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Budget Min (₹)</Label>
                <Input type="number" min={0} value={form.budgetMin} onChange={(e) => set("budgetMin", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Budget Max (₹)</Label>
                <Input type="number" min={0} value={form.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hotel Category</Label>
                <Select value={form.hotelCategory} onValueChange={(v) => set("hotelCategory", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{HOTEL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Package Type</Label>
                <Select value={form.packageType} onValueChange={(v) => set("packageType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PACKAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Preferred Transfer</Label>
                <Input value={form.preferredTransfer} onChange={(e) => set("preferredTransfer", e.target.value)} placeholder="Shared / Private / Luxury" />
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={form.flightRequired} onCheckedChange={(v) => set("flightRequired", v === true)} />Flight required</label>
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={form.visaRequired} onCheckedChange={(v) => set("visaRequired", v === true)} />Visa required</label>
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={form.insuranceRequired} onCheckedChange={(v) => set("insuranceRequired", v === true)} />Insurance required</label>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Special Requests</Label>
                <Textarea rows={2} value={form.specialRequests} onChange={(e) => set("specialRequests", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Markup (₹)</Label>
                <Input type="number" min={0} value={form.markup} onChange={(e) => set("markup", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Recommendations */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Recommended Packages</h3>
          {!canRecommend(form) && (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
              Complete destination, travel dates, and passenger count to see package recommendations.
            </p>
          )}
          {canRecommend(form) && matches.length === 0 && !loadingMatches && (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
              {hasSearched
                ? "No packages matched this destination and dates. Save the requirement or try another destination from the master list."
                : "Click \"Find Packages\" to run the matching engine."}
            </p>
          )}
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {matches.map((m) => (
              <PackageMatchCard
                key={m.packageId}
                match={m}
                selected={activePackageId === m.packageId}
                onView={() => setActivePackageId(m.packageId)}
                onCustomize={() => { setActivePackageId(m.packageId); setCustomizing(true); }}
              />
            ))}
          </div>
        </div>
      </div>

      {customizing && activeMatch && savedId && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <TripCustomizePanel
            requirementId={savedId}
            match={activeMatch}
            markup={parseInt(form.markup, 10) || 0}
            onClose={() => setCustomizing(false)}
            onSelected={() => { setCustomizing(false); toast({ title: "Package selection saved" }); }}
          />
          <TripPricePanel requirementId={savedId} packageId={activeMatch.packageId} markup={parseInt(form.markup, 10) || 0} />
        </div>
      )}
    </PageShell>
  );
}
