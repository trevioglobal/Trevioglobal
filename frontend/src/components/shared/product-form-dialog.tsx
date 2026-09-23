"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DestinationSelect } from "@/components/shared/destination-select";
import { ImageUrlListField } from "@/components/shared/image-url-list-field";
import { apiFetch } from "@/lib/api";
import { normalizeCurrency } from "@/lib/currency";
import { CurrencySelect } from "@/components/shared/currency-select";
import { ROOM_CATEGORY_PRESETS } from "@/lib/currency-options";
import type { ProductRecord } from "@/types";

export type ProductKind = "hotels" | "activities" | "transfers";

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ProductKind;
  initial?: ProductRecord | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

type RoomForm = {
  name: string;
  description: string;
  images: string;
  maxOccupancy: string;
  maxAdults: string;
  maxChildren: string;
  maxChildrenAtMaxAdults: string;
  extraBedAllowed: string;
  roomSize: string;
  bedType: string;
  mealPlan: string;
  smoking: string;
  priceSingle: string;
  priceDouble: string;
  priceTriple: string;
  priceQuad: string;
  priceExtraAdult: string;
  priceExtraChild: string;
  weekdaySingle: string;
  weekdayDouble: string;
  weekendSingle: string;
  weekendDouble: string;
  weekdayExtraAdult: string;
  weekendExtraAdult: string;
};

type VehiclePrice = { vehicleType: string; seats: string; price: string };
type BlackoutRow = { label: string; dateFrom: string; dateTo: string };
type InventoryRow = { roomName: string; date: string; available: string; soldOut: string; closed: string };
type TransferLinkRow = { transferProductId: string; label: string };

const VEHICLE_OPTIONS = [
  { label: "4 Seater", value: "4 Seater", seats: "4" },
  { label: "8 Seater", value: "8 Seater", seats: "8" },
  { label: "12 Seater", value: "12 Seater", seats: "12" },
  { label: "40 Seater", value: "40 Seater", seats: "40" },
  { label: "Sedan", value: "Sedan", seats: "4" },
  { label: "SUV", value: "SUV", seats: "6" },
];

const EMPTY_ROOM = (): RoomForm => ({
  name: "Deluxe Room",
  description: "",
  images: "",
  maxOccupancy: "2",
  maxAdults: "2",
  maxChildren: "0",
  maxChildrenAtMaxAdults: "1",
  extraBedAllowed: "No",
  roomSize: "",
  bedType: "King",
  mealPlan: "CP",
  smoking: "Non-Smoking",
  priceSingle: "",
  priceDouble: "",
  priceTriple: "",
  priceQuad: "",
  priceExtraAdult: "",
  priceExtraChild: "",
  weekdaySingle: "",
  weekdayDouble: "",
  weekendSingle: "",
  weekendDouble: "",
  weekdayExtraAdult: "",
  weekendExtraAdult: "",
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </div>
  );
}

function listFromText(value: string): string[] {
  return value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

function textFromList(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join("\n");
  return "";
}

function num(value: string): number {
  return parseInt(value, 10) || 0;
}

function roomFromRecord(room: Record<string, unknown>): RoomForm {
  const pricing = (room.pricing as Record<string, number>) ?? {};
  const weekday = (room.weekdayPricing as Record<string, number>) ?? {};
  const weekend = (room.weekendPricing as Record<string, number>) ?? {};
  return {
    name: String(room.name ?? "Deluxe Room"),
    description: String(room.description ?? ""),
    images: textFromList(room.images),
    maxOccupancy: String(room.maxOccupancy ?? 2),
    maxAdults: String(room.maxAdults ?? 2),
    maxChildren: String(room.maxChildren ?? 0),
    maxChildrenAtMaxAdults: String(room.maxChildrenAtMaxAdults ?? 1),
    extraBedAllowed: room.extraBedAllowed === true || room.extraBedAllowed === "Yes" ? "Yes" : "No",
    roomSize: String(room.roomSize ?? ""),
    bedType: String(room.bedType ?? "King"),
    mealPlan: String(room.mealPlan ?? "CP"),
    smoking: String(room.smoking ?? "Non-Smoking"),
    priceSingle: String(pricing.single ?? ""),
    priceDouble: String(pricing.double ?? ""),
    priceTriple: String(pricing.triple ?? ""),
    priceQuad: String(pricing.quad ?? ""),
    priceExtraAdult: String(pricing.extraAdult ?? ""),
    priceExtraChild: String(pricing.extraChild ?? ""),
    weekdaySingle: String(weekday.single ?? ""),
    weekdayDouble: String(weekday.double ?? ""),
    weekendSingle: String(weekend.single ?? ""),
    weekendDouble: String(weekend.double ?? ""),
    weekdayExtraAdult: String(weekday.extraAdult ?? ""),
    weekendExtraAdult: String(weekend.extraAdult ?? ""),
  };
}

function serializeRoom(room: RoomForm) {
  return {
    name: room.name,
    description: room.description,
    images: listFromText(room.images),
    maxOccupancy: num(room.maxOccupancy),
    maxAdults: num(room.maxAdults),
    maxChildren: num(room.maxChildren),
    maxChildrenAtMaxAdults: num(room.maxChildrenAtMaxAdults),
    extraBedAllowed: room.extraBedAllowed === "Yes",
    roomSize: room.roomSize || null,
    bedType: room.bedType,
    mealPlan: room.mealPlan,
    smoking: room.smoking,
    pricing: {
      single: num(room.priceSingle),
      double: num(room.priceDouble),
      triple: num(room.priceTriple),
      quad: num(room.priceQuad),
      extraAdult: num(room.priceExtraAdult),
      extraChild: num(room.priceExtraChild),
    },
    weekdayPricing: {
      single: num(room.weekdaySingle || room.priceSingle),
      double: num(room.weekdayDouble || room.priceDouble),
      extraAdult: num(room.weekdayExtraAdult || room.priceExtraAdult),
    },
    weekendPricing: {
      single: num(room.weekendSingle || room.priceSingle),
      double: num(room.weekendDouble || room.priceDouble),
      extraAdult: num(room.weekendExtraAdult || room.priceExtraAdult),
    },
  };
}

export function ProductFormDialog({ open, onOpenChange, kind, initial, onSubmit }: ProductFormDialogProps) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [rooms, setRooms] = useState<RoomForm[]>([EMPTY_ROOM()]);
  const [blackouts, setBlackouts] = useState<BlackoutRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [vehiclePricing, setVehiclePricing] = useState<VehiclePrice[]>([
    { vehicleType: "Sedan", seats: "4", price: "" },
  ]);
  const [transferLinks, setTransferLinks] = useState<TransferLinkRow[]>([]);
  const [availableTransfers, setAvailableTransfers] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || kind !== "activities" || !form.destinationId) {
      setAvailableTransfers([]);
      return;
    }
    apiFetch<{ items: Array<{ id: string; name: string }> }>(`/api/products/transfers?destinationId=${form.destinationId}&status=Active&pageSize=100`)
      .then((data) => setAvailableTransfers(data.items || []))
      .catch(() => setAvailableTransfers([]));
  }, [open, kind, form.destinationId]);

  useEffect(() => {
    if (!open) return;
    if (!initial) {
      if (kind === "hotels") {
        setForm({
          destinationId: "", name: "", description: "", starCategory: "3", address: "", city: "", country: "India",
          mapsUrl: "", amenities: "", policies: "", checkInTime: "14:00", checkOutTime: "11:00",
          contactPerson: "", contactPhone: "", contactEmail: "", website: "", images: "",
          contractStart: "", contractEnd: "", childWithBedAge: "12", childWithoutBedAge: "5",
          childWithBed: "12 Years & Above (considered adult with extra bed)", childWithoutBed: "Below 5 Years Complimentary",
          currency: "INR", cancellationPolicy: "Free cancellation up to 15 days; else non-refundable", status: "Draft",
        });
        setRooms([EMPTY_ROOM()]);
      } else if (kind === "activities") {
        setForm({
          destinationId: "", name: "", description: "", images: "", duration: "", location: "", meetingPoint: "",
          inclusions: "", exclusions: "", operatingHours: "", startTime: "", closingTime: "", ticketType: "", passengerInfo: "", minChildAge: "3",
          adultPrice: "", childPrice: "", infantPrice: "", currency: "INR", cancellationPolicy: "",
          rateValidFrom: "", rateValidTo: "", status: "Draft",
        });
        setTransferLinks([]);
      } else {
        setForm({
          destinationId: "", name: "", city: "", description: "", images: "", capacity: "", transferType: "Private", vehicleType: "Sedan",
          pickupLocation: "", dropLocation: "", pickupTime: "", waitingCharges: "",
          privatePrice: "", sharedAdultPrice: "", sharedChildPrice: "", currency: "INR",
          rateValidFrom: "", rateValidTo: "", cancellationPolicy: "", status: "Draft",
        });
        setVehiclePricing([{ vehicleType: "Sedan", seats: "4", price: "" }]);
      }
      setBlackouts([]);
      setInventory([]);
      return;
    }

    const blackoutSrc = Array.isArray(initial.blackoutDates)
      ? (initial.blackoutDates as Record<string, unknown>[]).map((b) => ({
          label: String(b.label ?? b.name ?? ""),
          dateFrom: String(b.dateFrom ?? b.date ?? ""),
          dateTo: String(b.dateTo ?? b.date ?? ""),
        }))
      : [];
    setBlackouts(blackoutSrc);

    if (kind === "hotels") {
      const roomsSrc = Array.isArray(initial.roomCategories)
        ? (initial.roomCategories as Record<string, unknown>[]).map(roomFromRecord)
        : [EMPTY_ROOM()];
      const childPolicy = (initial.childPolicy as Record<string, string>) ?? {};
      const policies = initial.policies;
      setForm({
        destinationId: String(initial.destinationId ?? ""),
        name: String(initial.name ?? ""),
        description: String(initial.description ?? ""),
        starCategory: String(initial.starCategory ?? 3),
        address: String(initial.address ?? ""),
        city: String(initial.city ?? ""),
        country: String(initial.country ?? "India"),
        mapsUrl: String(initial.mapsUrl ?? ""),
        amenities: Array.isArray(initial.amenities) ? (initial.amenities as string[]).join(", ") : "",
        policies: typeof policies === "string" ? policies : policies ? JSON.stringify(policies, null, 2) : "",
        checkInTime: String(initial.checkInTime ?? "14:00"),
        checkOutTime: String(initial.checkOutTime ?? "11:00"),
        contactPerson: String(initial.contactPerson ?? ""),
        contactPhone: String(initial.contactPhone ?? ""),
        contactEmail: String(initial.contactEmail ?? ""),
        website: String(initial.website ?? ""),
        images: textFromList(initial.images),
        contractStart: String(initial.contractStart ?? ""),
        contractEnd: String(initial.contractEnd ?? ""),
        childWithBed: String(childPolicy.withBed ?? "12 Years & Above"),
        childWithoutBed: String(childPolicy.withoutBed ?? "Below 5 Years Complimentary"),
        childWithBedAge: String(childPolicy.withBedMinAge ?? childPolicy.withBedAge ?? "12"),
        childWithoutBedAge: String(childPolicy.withoutBedMinAge ?? childPolicy.withoutBedAge ?? "5"),
        currency: String(initial.currency ?? "INR"),
        cancellationPolicy: String(initial.cancellationPolicy ?? ""),
        status: String(initial.status ?? "Active"),
      });
      setRooms(roomsSrc.length ? roomsSrc : [EMPTY_ROOM()]);
      setInventory(
        Array.isArray(initial.inventory)
          ? (initial.inventory as Record<string, unknown>[]).map((row) => ({
              roomName: String(row.roomName ?? ""),
              date: String(row.date ?? ""),
              available: String(row.available ?? "0"),
              soldOut: row.soldOut ? "Yes" : "No",
              closed: row.closed ? "Yes" : "No",
            }))
          : []
      );
    } else if (kind === "activities") {
      setForm({
        destinationId: String(initial.destinationId ?? ""),
        name: String(initial.name ?? ""),
        description: String(initial.description ?? ""),
        images: textFromList(initial.images),
        duration: String(initial.duration ?? ""),
        location: String(initial.location ?? ""),
        meetingPoint: String(initial.meetingPoint ?? ""),
        inclusions: Array.isArray(initial.inclusions) ? (initial.inclusions as string[]).join(", ") : "",
        exclusions: Array.isArray(initial.exclusions) ? (initial.exclusions as string[]).join(", ") : "",
        operatingHours: String(initial.operatingHours ?? ""),
        startTime: String(initial.startTime ?? ""),
        closingTime: String(initial.closingTime ?? ""),
        ticketType: String(initial.ticketType ?? ""),
        passengerInfo: String(initial.passengerInfo ?? ""),
        minChildAge: String(initial.minChildAge ?? 3),
        adultPrice: String(initial.adultPrice ?? ""),
        childPrice: String(initial.childPrice ?? ""),
        infantPrice: String(initial.infantPrice ?? ""),
        currency: String(initial.currency ?? "INR"),
        cancellationPolicy: String(initial.cancellationPolicy ?? ""),
        rateValidFrom: String(initial.rateValidFrom ?? ""),
        rateValidTo: String(initial.rateValidTo ?? ""),
        status: String(initial.status ?? "Active"),
      });
      setTransferLinks(
        Array.isArray(initial.transferOptions)
          ? (initial.transferOptions as TransferLinkRow[]).map((o) => ({
              transferProductId: String(o.transferProductId ?? ""),
              label: String(o.label ?? ""),
            }))
          : []
      );
    } else {
      const vp = Array.isArray(initial.vehiclePricing)
        ? (initial.vehiclePricing as Record<string, unknown>[]).map((v) => ({
            vehicleType: String(v.vehicleType ?? "Sedan"),
            seats: String(v.seats ?? "4"),
            price: String(v.price ?? ""),
          }))
        : [{ vehicleType: String(initial.vehicleType ?? "Sedan"), seats: "4", price: String(initial.privatePrice ?? "") }];
      setForm({
        destinationId: String(initial.destinationId ?? ""),
        name: String(initial.name ?? ""),
        city: String(initial.city ?? ""),
        description: String(initial.description ?? ""),
        images: Array.isArray(initial.images) ? (initial.images as string[]).join("\n") : String(initial.images ?? ""),
        capacity: String(initial.capacity ?? ""),
        transferType: String(initial.transferType ?? "Private"),
        vehicleType: String(initial.vehicleType ?? "Sedan"),
        pickupLocation: String(initial.pickupLocation ?? ""),
        dropLocation: String(initial.dropLocation ?? ""),
        pickupTime: String(initial.pickupTime ?? ""),
        waitingCharges: String(initial.waitingCharges ?? ""),
        privatePrice: String(initial.privatePrice ?? ""),
        sharedAdultPrice: String(initial.sharedAdultPrice ?? initial.sharedPrice ?? ""),
        sharedChildPrice: String(initial.sharedChildPrice ?? ""),
        currency: String(initial.currency ?? "INR"),
        rateValidFrom: String(initial.rateValidFrom ?? ""),
        rateValidTo: String(initial.rateValidTo ?? ""),
        cancellationPolicy: String(initial.cancellationPolicy ?? ""),
        status: String(initial.status ?? "Active"),
      });
      setVehiclePricing(vp.length ? vp : [{ vehicleType: "Sedan", seats: "4", price: "" }]);
    }
  }, [open, initial, kind]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function updateRoom(index: number, key: keyof RoomForm, value: string) {
    setRooms((prev) => prev.map((room, i) => (i === index ? { ...room, [key]: value } : room)));
  }

  async function handleSave() {
    if (!form.name?.trim() || !form.destinationId) return;
    setSaving(true);
    try {
      const blackoutPayload = blackouts
        .filter((b) => b.dateFrom)
        .map((b) => ({ label: b.label || "Blackout", dateFrom: b.dateFrom, dateTo: b.dateTo || b.dateFrom }));

      let payload: Record<string, unknown> = {
        status: form.status,
        currency: normalizeCurrency(form.currency),
        destinationId: form.destinationId || null,
        blackoutDates: blackoutPayload,
      };

      if (kind === "hotels") {
        let policies: unknown = form.policies || {};
        try {
          if (form.policies.trim().startsWith("{")) policies = JSON.parse(form.policies);
          else if (form.policies.trim()) policies = { text: form.policies };
        } catch {
          policies = { text: form.policies };
        }
        payload = {
          ...payload,
          name: form.name,
          description: form.description || null,
          starCategory: num(form.starCategory) || 3,
          address: form.address || null,
          city: form.city,
          country: form.country,
          mapsUrl: form.mapsUrl || null,
          amenities: listFromText(form.amenities.replace(/\n/g, ",")),
          policies,
          checkInTime: form.checkInTime,
          checkOutTime: form.checkOutTime,
          contactPerson: form.contactPerson || null,
          contactPhone: form.contactPhone || null,
          contactEmail: form.contactEmail || null,
          website: form.website || null,
          images: listFromText(form.images),
          contractStart: form.contractStart || null,
          contractEnd: form.contractEnd || null,
          childPolicy: {
            withBed: form.childWithBed,
            withoutBed: form.childWithoutBed,
            withBedMinAge: num(form.childWithBedAge),
            withoutBedMinAge: num(form.childWithoutBedAge),
          },
          cancellationPolicy: form.cancellationPolicy || null,
          roomCategories: rooms.filter((r) => r.name.trim()).map(serializeRoom),
          inventory: inventory
            .filter((row) => row.roomName && row.date)
            .map((row) => ({
              roomName: row.roomName,
              date: row.date,
              available: num(row.available),
              soldOut: row.soldOut === "Yes",
              closed: row.closed === "Yes",
            })),
        };
      } else if (kind === "activities") {
        payload = {
          ...payload,
          name: form.name,
          description: form.description || null,
          images: listFromText(form.images),
          duration: form.duration || null,
          location: form.location || null,
          meetingPoint: form.meetingPoint || null,
          inclusions: listFromText(form.inclusions.replace(/\n/g, ",")),
          exclusions: listFromText(form.exclusions.replace(/\n/g, ",")),
          operatingHours: form.operatingHours || null,
          startTime: form.startTime || null,
          closingTime: form.closingTime || null,
          ticketType: form.ticketType || null,
          passengerInfo: form.passengerInfo || null,
          minChildAge: form.minChildAge ? num(form.minChildAge) : null,
          adultPrice: num(form.adultPrice),
          childPrice: num(form.childPrice),
          infantPrice: form.infantPrice ? num(form.infantPrice) : null,
          cancellationPolicy: form.cancellationPolicy || null,
          rateValidFrom: form.rateValidFrom || null,
          rateValidTo: form.rateValidTo || null,
          transferOptions: transferLinks.filter((t) => t.transferProductId),
        };
      } else {
        const vehicles = vehiclePricing
          .filter((v) => v.vehicleType)
          .map((v) => ({ vehicleType: v.vehicleType, seats: num(v.seats), price: num(v.price) }));
        const primaryPrivate = vehicles[0]?.price ?? (form.privatePrice ? num(form.privatePrice) : null);
        payload = {
          ...payload,
          name: form.name,
          city: form.city || null,
          description: form.description || null,
          images: listFromText(form.images),
          capacity: form.capacity ? num(form.capacity) : null,
          transferType: form.transferType,
          vehicleType: vehicles[0]?.vehicleType || form.vehicleType || null,
          pickupLocation: form.pickupLocation,
          dropLocation: form.dropLocation,
          pickupTime: form.pickupTime || null,
          waitingCharges: form.waitingCharges ? num(form.waitingCharges) : null,
          privatePrice: form.transferType === "Shared" ? null : primaryPrivate,
          sharedAdultPrice: form.transferType === "Private" ? null : (form.sharedAdultPrice ? num(form.sharedAdultPrice) : null),
          sharedChildPrice: form.transferType === "Private" ? null : (form.sharedChildPrice ? num(form.sharedChildPrice) : null),
          sharedPrice: form.transferType === "Private" ? null : (form.sharedAdultPrice ? num(form.sharedAdultPrice) : null),
          vehiclePricing: form.transferType === "Shared" ? [] : vehicles,
          cancellationPolicy: form.cancellationPolicy || null,
          rateValidFrom: form.rateValidFrom || null,
          rateValidTo: form.rateValidTo || null,
        };
      }

      await onSubmit(payload);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const title = initial ? `Edit ${kind.slice(0, -1)}` : `Add ${kind.slice(0, -1)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize">{title}</DialogTitle>
        </DialogHeader>

        {!!initial?.pendingRateChanges && (
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <AlertDescription className="text-sm">
              You have rate changes awaiting admin approval. The values shown are your proposed rates — agents still see the last approved rates until an admin approves.
            </AlertDescription>
          </Alert>
        )}

        {!initial && (
          <Alert>
            <AlertDescription className="text-sm">
              New products and rate updates require admin approval before they go live for agents to book.
            </AlertDescription>
          </Alert>
        )}

        {kind === "hotels" && (
          <div className="space-y-4">
            <Section title="Basic Hotel Information">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Field label="Destination *">
                    <DestinationSelect
                      value={form.destinationId || ""}
                      onChange={(v, dest) => {
                        set("destinationId", v);
                        if (dest) {
                          setForm((f) => ({
                            ...f,
                            destinationId: v,
                            city: f.city?.trim() ? f.city : String(dest.city || dest.name || ""),
                            country: f.country?.trim() && f.country !== "India"
                              ? f.country
                              : String(dest.country || f.country || "India"),
                          }));
                        }
                      }}
                      required
                    />
                  </Field>
                </div>
                <Field label="Hotel Name *">
                  <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ramada Encore" />
                </Field>
                <Field label="Star rating *">
                  <Select value={form.starCategory || "3"} onValueChange={(v) => set("starCategory", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4, 5].map((s) => <SelectItem key={s} value={String(s)}>{s}★</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address">
                    <Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="Street / area" />
                  </Field>
                </div>
                <Field label="City *"><Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} /></Field>
                <Field label="Country"><Input value={form.country || ""} onChange={(e) => set("country", e.target.value)} /></Field>
                <Field label="Currency *">
                  <CurrencySelect value={form.currency || "INR"} onChange={(v) => set("currency", v)} />
                </Field>
                <Field label="Google Map URL (optional)">
                  <Input value={form.mapsUrl || ""} onChange={(e) => set("mapsUrl", e.target.value)} placeholder="https://maps.google.com/…" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Description">
                    <Textarea rows={3} value={form.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="Short hotel description for agents / quotes" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <ImageUrlListField
                    label="Hotel images"
                    value={form.images || ""}
                    onChange={(v) => set("images", v)}
                  />
                </div>
              </div>
            </Section>

            <Section title="Hotel contact (optional)">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Contact person"><Input value={form.contactPerson || ""} onChange={(e) => set("contactPerson", e.target.value)} /></Field>
                <Field label="Contact phone"><Input value={form.contactPhone || ""} onChange={(e) => set("contactPhone", e.target.value)} /></Field>
                <Field label="Email"><Input value={form.contactEmail || ""} onChange={(e) => set("contactEmail", e.target.value)} /></Field>
                <Field label="Website"><Input value={form.website || ""} onChange={(e) => set("website", e.target.value)} /></Field>
              </div>
            </Section>

            <Section title="Stay details">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><Field label="Amenities (comma-separated)"><Input value={form.amenities || ""} onChange={(e) => set("amenities", e.target.value)} placeholder="Wi-Fi, Pool, Breakfast" /></Field></div>
                <div className="sm:col-span-2"><Field label="Hotel Policies"><Textarea rows={2} value={form.policies || ""} onChange={(e) => set("policies", e.target.value)} /></Field></div>
                <Field label="Check-in Time"><Input value={form.checkInTime || ""} onChange={(e) => set("checkInTime", e.target.value)} /></Field>
                <Field label="Check-out Time"><Input value={form.checkOutTime || ""} onChange={(e) => set("checkOutTime", e.target.value)} /></Field>
              </div>
            </Section>

            <Section title="Contract & Child Policy">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Contract Start Date"><Input type="date" value={form.contractStart || ""} onChange={(e) => set("contractStart", e.target.value)} /></Field>
                <Field label="Contract End Date"><Input type="date" value={form.contractEnd || ""} onChange={(e) => set("contractEnd", e.target.value)} /></Field>
                <Field label="Status">
                  <Select value={form.status || "Active"} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2" />
                <Field label="Min child age with bed (yrs)"><Input type="number" value={form.childWithBedAge || ""} onChange={(e) => set("childWithBedAge", e.target.value)} placeholder="12" /></Field>
                <Field label="Min child age without bed (yrs)"><Input type="number" value={form.childWithoutBedAge || ""} onChange={(e) => set("childWithoutBedAge", e.target.value)} placeholder="5 — below is complimentary" /></Field>
                <Field label="Child with bed note"><Input value={form.childWithBed || ""} onChange={(e) => set("childWithBed", e.target.value)} /></Field>
                <Field label="Child without bed note"><Input value={form.childWithoutBed || ""} onChange={(e) => set("childWithoutBed", e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label="Cancellation Policy / Terms"><Textarea rows={2} value={form.cancellationPolicy || ""} onChange={(e) => set("cancellationPolicy", e.target.value)} /></Field></div>
              </div>
            </Section>

            <Section title="Room Categories">
              <div className="space-y-4">
                {rooms.map((room, index) => (
                  <div key={index} className="rounded-md border border-border bg-background p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Room {index + 1}</p>
                      {rooms.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setRooms((r) => r.filter((_, i) => i !== index))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label="Room category">
                        <Select value={room.name} onValueChange={(v) => updateRoom(index, "name", v)}>
                          <SelectTrigger><SelectValue placeholder="Room type" /></SelectTrigger>
                          <SelectContent>
                            {ROOM_CATEGORY_PRESETS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            {!ROOM_CATEGORY_PRESETS.includes(room.name as typeof ROOM_CATEGORY_PRESETS[number]) && room.name && (
                              <SelectItem value={room.name}>{room.name}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Meal Plan"><Input value={room.mealPlan} onChange={(e) => updateRoom(index, "mealPlan", e.target.value)} /></Field>
                      <div className="sm:col-span-2"><Field label="Room Description"><Textarea rows={2} value={room.description} onChange={(e) => updateRoom(index, "description", e.target.value)} /></Field></div>
                      <div className="sm:col-span-2">
                        <ImageUrlListField
                          label="Room images"
                          value={room.images}
                          onChange={(v) => updateRoom(index, "images", v)}
                          maxImages={6}
                        />
                      </div>
                      <Field label="Max Occupancy"><Input type="number" value={room.maxOccupancy} onChange={(e) => updateRoom(index, "maxOccupancy", e.target.value)} /></Field>
                      <Field label="Max Adults"><Input type="number" value={room.maxAdults} onChange={(e) => updateRoom(index, "maxAdults", e.target.value)} /></Field>
                      <Field label="Max Children"><Input type="number" value={room.maxChildren} onChange={(e) => updateRoom(index, "maxChildren", e.target.value)} /></Field>
                      <Field label="Max kids when adults = max"><Input type="number" value={room.maxChildrenAtMaxAdults} onChange={(e) => updateRoom(index, "maxChildrenAtMaxAdults", e.target.value)} placeholder="e.g. 1" /></Field>
                      <Field label="Extra Bed Allowed">
                        <Select value={room.extraBedAllowed} onValueChange={(v) => updateRoom(index, "extraBedAllowed", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Yes">Yes</SelectItem>
                            <SelectItem value="No">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Room Size"><Input value={room.roomSize} onChange={(e) => updateRoom(index, "roomSize", e.target.value)} placeholder="28 sqm" /></Field>
                      <Field label="Bed Type"><Input value={room.bedType} onChange={(e) => updateRoom(index, "bedType", e.target.value)} /></Field>
                      <Field label="Smoking">
                        <Select value={room.smoking} onValueChange={(v) => updateRoom(index, "smoking", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Non-Smoking">Non-Smoking</SelectItem>
                            <SelectItem value="Smoking">Smoking</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Single Sharing"><Input type="number" value={room.priceSingle} onChange={(e) => updateRoom(index, "priceSingle", e.target.value)} /></Field>
                      <Field label="Double Sharing"><Input type="number" value={room.priceDouble} onChange={(e) => updateRoom(index, "priceDouble", e.target.value)} /></Field>
                      <Field label="Triple Sharing"><Input type="number" value={room.priceTriple} onChange={(e) => updateRoom(index, "priceTriple", e.target.value)} /></Field>
                      <Field label="Quad Sharing"><Input type="number" value={room.priceQuad} onChange={(e) => updateRoom(index, "priceQuad", e.target.value)} /></Field>
                      <Field label="Extra Adult"><Input type="number" value={room.priceExtraAdult} onChange={(e) => updateRoom(index, "priceExtraAdult", e.target.value)} /></Field>
                      <Field label="Extra Child"><Input type="number" value={room.priceExtraChild} onChange={(e) => updateRoom(index, "priceExtraChild", e.target.value)} /></Field>
                      <Field label="Weekday Single (Mon–Thu)"><Input type="number" value={room.weekdaySingle} onChange={(e) => updateRoom(index, "weekdaySingle", e.target.value)} /></Field>
                      <Field label="Weekday Double (Mon–Thu)"><Input type="number" value={room.weekdayDouble} onChange={(e) => updateRoom(index, "weekdayDouble", e.target.value)} /></Field>
                      <Field label="Weekend Single (Fri–Sun)"><Input type="number" value={room.weekendSingle} onChange={(e) => updateRoom(index, "weekendSingle", e.target.value)} /></Field>
                      <Field label="Weekend Double (Fri–Sun)"><Input type="number" value={room.weekendDouble} onChange={(e) => updateRoom(index, "weekendDouble", e.target.value)} /></Field>
                      <Field label="Weekday Extra Adult (Mon–Thu)"><Input type="number" value={room.weekdayExtraAdult} onChange={(e) => updateRoom(index, "weekdayExtraAdult", e.target.value)} /></Field>
                      <Field label="Weekend Extra Adult (Fri–Sun)"><Input type="number" value={room.weekendExtraAdult} onChange={(e) => updateRoom(index, "weekendExtraAdult", e.target.value)} /></Field>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setRooms((r) => [...r, EMPTY_ROOM()])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Room Category
                </Button>
              </div>
            </Section>

            <Section title="Blackout Dates">
              <div className="space-y-2">
                {blackouts.map((row, index) => (
                  <div key={index} className="grid sm:grid-cols-4 gap-2 items-end">
                    <Field label="Label"><Input value={row.label} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, label: e.target.value } : x))} placeholder="Christmas" /></Field>
                    <Field label="From"><Input type="date" value={row.dateFrom} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, dateFrom: e.target.value } : x))} /></Field>
                    <Field label="To"><Input type="date" value={row.dateTo} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, dateTo: e.target.value } : x))} /></Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBlackouts((b) => b.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setBlackouts((b) => [...b, { label: "", dateFrom: "", dateTo: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Blackout
                </Button>
              </div>
            </Section>

            <Section title="Daily Inventory (sold out / availability)">
              <p className="text-xs text-muted-foreground mb-2">
                Once rates are live, mark specific room categories sold out or closed on any date. Add one row per room per date.
              </p>
              <div className="space-y-2">
                {inventory.map((row, index) => (
                  <div key={index} className="grid sm:grid-cols-6 gap-2 items-end">
                    <Field label="Room"><Input value={row.roomName} onChange={(e) => setInventory((inv) => inv.map((x, i) => i === index ? { ...x, roomName: e.target.value } : x))} /></Field>
                    <Field label="Date"><Input type="date" value={row.date} onChange={(e) => setInventory((inv) => inv.map((x, i) => i === index ? { ...x, date: e.target.value } : x))} /></Field>
                    <Field label="Available"><Input type="number" value={row.available} onChange={(e) => setInventory((inv) => inv.map((x, i) => i === index ? { ...x, available: e.target.value } : x))} /></Field>
                    <Field label="Sold Out">
                      <Select value={row.soldOut} onValueChange={(v) => setInventory((inv) => inv.map((x, i) => i === index ? { ...x, soldOut: v } : x))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="No">No</SelectItem><SelectItem value="Yes">Yes</SelectItem></SelectContent>
                      </Select>
                    </Field>
                    <Field label="Closed">
                      <Select value={row.closed} onValueChange={(v) => setInventory((inv) => inv.map((x, i) => i === index ? { ...x, closed: v } : x))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="No">No</SelectItem><SelectItem value="Yes">Yes</SelectItem></SelectContent>
                      </Select>
                    </Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setInventory((inv) => inv.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setInventory((inv) => [...inv, { roomName: rooms[0]?.name || "", date: "", available: "0", soldOut: "No", closed: "No" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Inventory Row
                </Button>
              </div>
            </Section>
          </div>
        )}

        {kind === "activities" && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Tours &amp; Activities</strong> = bookable experiences with price &amp; timing (e.g. Singapore rope course).
                Sightseeing landmarks go under <strong>Products → Sightseeing Places</strong> (no ticket price) and appear on the day itinerary.
              </AlertDescription>
            </Alert>
            <Section title="Activity Details">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Field label="Destination *">
                    <DestinationSelect
                      value={form.destinationId || ""}
                      onChange={(v, dest) => {
                        set("destinationId", v);
                        if (dest && !form.location?.trim()) {
                          set("location", String(dest.city || dest.name || ""));
                        }
                      }}
                      required
                    />
                  </Field>
                </div>
                <Field label="Activity Name *"><Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. iFly Singapore / Rope course" /></Field>
                <Field label="Duration"><Input value={form.duration || ""} onChange={(e) => set("duration", e.target.value)} placeholder="2 hours" /></Field>
                <div className="sm:col-span-2"><Field label="Description"><Textarea rows={2} value={form.description || ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
                <div className="sm:col-span-2">
                  <ImageUrlListField label="Activity images" value={form.images || ""} onChange={(v) => set("images", v)} />
                </div>
                <Field label="Location / city"><Input value={form.location || ""} onChange={(e) => set("location", e.target.value)} /></Field>
                <Field label="Meeting Point"><Input value={form.meetingPoint || ""} onChange={(e) => set("meetingPoint", e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label="Inclusions"><Input value={form.inclusions || ""} onChange={(e) => set("inclusions", e.target.value)} /></Field></div>
                <div className="sm:col-span-2"><Field label="Exclusions"><Input value={form.exclusions || ""} onChange={(e) => set("exclusions", e.target.value)} /></Field></div>
                <Field label="Start time"><Input value={form.startTime || ""} onChange={(e) => set("startTime", e.target.value)} placeholder="09:00" /></Field>
                <Field label="Closing time"><Input value={form.closingTime || ""} onChange={(e) => set("closingTime", e.target.value)} placeholder="18:00" /></Field>
                <Field label="Ticket type"><Input value={form.ticketType || ""} onChange={(e) => set("ticketType", e.target.value)} /></Field>
                <Field label="Operating Hours"><Input value={form.operatingHours || ""} onChange={(e) => set("operatingHours", e.target.value)} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Guest instructions (what to carry / dress code / pickup note)">
                    <Textarea
                      rows={2}
                      value={form.passengerInfo || ""}
                      onChange={(e) => set("passengerInfo", e.target.value)}
                      placeholder="e.g. Wear closed shoes, carry ID, arrive 30 mins early"
                    />
                  </Field>
                </div>
                <Field label="Min Child Age"><Input type="number" value={form.minChildAge || ""} onChange={(e) => set("minChildAge", e.target.value)} /></Field>
                <p className="sm:col-span-2 text-xs text-muted-foreground -mt-1">Below this age the activity cannot be booked (e.g. Sky Diving 18 yrs).</p>
                <p className="sm:col-span-2 text-xs text-muted-foreground">Display price is what agents see. Contracted cost is set under Rates and resolved by travel date.</p>
                <Field label="Adult display price"><Input type="number" value={form.adultPrice || ""} onChange={(e) => set("adultPrice", e.target.value)} /></Field>
                <Field label="Child Price"><Input type="number" value={form.childPrice || ""} onChange={(e) => set("childPrice", e.target.value)} /></Field>
                <Field label="Infant Price (Optional)"><Input type="number" value={form.infantPrice || ""} onChange={(e) => set("infantPrice", e.target.value)} /></Field>
                <Field label="Currency *"><CurrencySelect value={form.currency || "INR"} onChange={(v) => set("currency", v)} /></Field>
                <Field label="Rate Valid From"><Input type="date" value={form.rateValidFrom || ""} onChange={(e) => set("rateValidFrom", e.target.value)} /></Field>
                <Field label="Rate Valid To"><Input type="date" value={form.rateValidTo || ""} onChange={(e) => set("rateValidTo", e.target.value)} /></Field>
                <Field label="Status">
                  <Select value={form.status || "Active"} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2"><Field label="Cancellation Policy"><Textarea rows={2} value={form.cancellationPolicy || ""} onChange={(e) => set("cancellationPolicy", e.target.value)} /></Field></div>
              </div>
            </Section>
            <Section title="Bundled Transfer Options (optional)">
              <p className="text-xs text-muted-foreground mb-2">
                Link transfer products so agents can choose Ticket Only or add a transfer on the same activity card.
              </p>
              <div className="space-y-2">
                {transferLinks.map((row, index) => (
                  <div key={index} className="grid sm:grid-cols-3 gap-2 items-end">
                    <Field label="Transfer product">
                      <Select
                        value={row.transferProductId}
                        onValueChange={(v) => setTransferLinks((rows) => rows.map((x, i) => i === index ? { ...x, transferProductId: v } : x))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select transfer" /></SelectTrigger>
                        <SelectContent>
                          {availableTransfers.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Agent label">
                      <Input
                        value={row.label}
                        onChange={(e) => setTransferLinks((rows) => rows.map((x, i) => i === index ? { ...x, label: e.target.value } : x))}
                        placeholder="Private Car (2-Way Round Trip)"
                      />
                    </Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setTransferLinks((rows) => rows.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.destinationId}
                  onClick={() => setTransferLinks((rows) => [...rows, { transferProductId: "", label: "" }])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Link Transfer
                </Button>
              </div>
            </Section>
            <Section title="Blackout Dates">
              <div className="space-y-2">
                {blackouts.map((row, index) => (
                  <div key={index} className="grid sm:grid-cols-4 gap-2 items-end">
                    <Field label="Label"><Input value={row.label} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, label: e.target.value } : x))} /></Field>
                    <Field label="From"><Input type="date" value={row.dateFrom} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, dateFrom: e.target.value } : x))} /></Field>
                    <Field label="To"><Input type="date" value={row.dateTo} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, dateTo: e.target.value } : x))} /></Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBlackouts((b) => b.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setBlackouts((b) => [...b, { label: "", dateFrom: "", dateTo: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Blackout
                </Button>
              </div>
            </Section>
          </div>
        )}

        {kind === "transfers" && (
          <div className="space-y-4">
            <Section title="Transfer Details">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Field label="Destination *">
                    <DestinationSelect value={form.destinationId || ""} onChange={(v) => set("destinationId", v)} required />
                  </Field>
                </div>
                <Field label="Transfer Name *"><Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
                <Field label="City"><Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} /></Field>
                <Field label="Capacity (pax)"><Input type="number" value={form.capacity || ""} onChange={(e) => set("capacity", e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label="Description"><Textarea rows={2} value={form.description || ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
                <div className="sm:col-span-2">
                  <ImageUrlListField label="Transfer images" value={form.images || ""} onChange={(v) => set("images", v)} maxImages={4} />
                </div>
                <Field label="Transfer Type">
                  <Select value={form.transferType || "Private"} onValueChange={(v) => set("transferType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Private">Private</SelectItem>
                      <SelectItem value="Shared">Shared</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Pickup Location *"><Input value={form.pickupLocation || ""} onChange={(e) => set("pickupLocation", e.target.value)} /></Field>
                <Field label="Drop Location *"><Input value={form.dropLocation || ""} onChange={(e) => set("dropLocation", e.target.value)} /></Field>
                <Field label="Pickup Time"><Input value={form.pickupTime || ""} onChange={(e) => set("pickupTime", e.target.value)} /></Field>
                <Field label="Waiting Charges"><Input type="number" value={form.waitingCharges || ""} onChange={(e) => set("waitingCharges", e.target.value)} /></Field>
                <Field label="Currency"><CurrencySelect value={form.currency || "INR"} onChange={(v) => set("currency", v)} /></Field>
                <Field label="Status">
                  <Select value={form.status || "Active"} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Rate Valid From"><Input type="date" value={form.rateValidFrom || ""} onChange={(e) => set("rateValidFrom", e.target.value)} /></Field>
                <Field label="Rate Valid To"><Input type="date" value={form.rateValidTo || ""} onChange={(e) => set("rateValidTo", e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label="Cancellation Policy"><Textarea rows={2} value={form.cancellationPolicy || ""} onChange={(e) => set("cancellationPolicy", e.target.value)} /></Field></div>
              </div>
            </Section>

            {form.transferType === "Private" ? (
              <Section title="Private Pricing (by Vehicle Type)">
                <div className="space-y-2">
                  {vehiclePricing.map((row, index) => (
                    <div key={index} className="grid sm:grid-cols-4 gap-2 items-end">
                      <Field label="Vehicle">
                        <Select
                          value={row.vehicleType}
                          onValueChange={(v) => {
                            const opt = VEHICLE_OPTIONS.find((o) => o.value === v);
                            setVehiclePricing((vp) => vp.map((x, i) => i === index ? { ...x, vehicleType: v, seats: opt?.seats || x.seats } : x));
                          }}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {VEHICLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Seats"><Input value={row.seats} onChange={(e) => setVehiclePricing((vp) => vp.map((x, i) => i === index ? { ...x, seats: e.target.value } : x))} /></Field>
                      <Field label="Price"><Input type="number" value={row.price} onChange={(e) => setVehiclePricing((vp) => vp.map((x, i) => i === index ? { ...x, price: e.target.value } : x))} /></Field>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setVehiclePricing((vp) => vp.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setVehiclePricing((vp) => [...vp, { vehicleType: "SUV", seats: "6", price: "" }])}>
                    <Plus className="h-4 w-4 mr-1" /> Add Vehicle Price
                  </Button>
                </div>
              </Section>
            ) : (
              <Section title="Shared Pricing (Per Person)">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Adult Price"><Input type="number" value={form.sharedAdultPrice || ""} onChange={(e) => set("sharedAdultPrice", e.target.value)} /></Field>
                  <Field label="Child Price"><Input type="number" value={form.sharedChildPrice || ""} onChange={(e) => set("sharedChildPrice", e.target.value)} /></Field>
                </div>
              </Section>
            )}

            <Section title="Blackout Dates">
              <div className="space-y-2">
                {blackouts.map((row, index) => (
                  <div key={index} className="grid sm:grid-cols-4 gap-2 items-end">
                    <Field label="Label"><Input value={row.label} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, label: e.target.value } : x))} /></Field>
                    <Field label="From"><Input type="date" value={row.dateFrom} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, dateFrom: e.target.value } : x))} /></Field>
                    <Field label="To"><Input type="date" value={row.dateTo} onChange={(e) => setBlackouts((b) => b.map((x, i) => i === index ? { ...x, dateTo: e.target.value } : x))} /></Field>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBlackouts((b) => b.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setBlackouts((b) => [...b, { label: "", dateFrom: "", dateTo: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Blackout
                </Button>
              </div>
            </Section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || !form.name?.trim() || !form.destinationId} onClick={handleSave}>
            {saving ? "Saving..." : initial ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
