"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { DestinationRecord } from "@/types";
import { ImageUrlListField } from "@/components/shared/image-url-list-field";

interface DestinationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: DestinationRecord | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

const EMPTY = {
  name: "", country: "India", region: "", city: "", slug: "",
  shortDescription: "", longDescription: "",
  currency: "INR", language: "English", timeZone: "Asia/Kolkata",
  visaRequired: "false", visaDetails: "", passportValidity: "6 months",
  bestTimeToVisit: "", climate: "", averageBudget: "",
  popularAttractions: "", localTransport: "", foodSpecialities: "",
  shopping: "", nightlife: "", adventureActivities: "",
  familyFriendly: "true", coupleFriendly: "true", seniorFriendly: "false",
  heroImage: "", galleryImages: "", bannerImage: "", thumbnail: "",
  videoUrl: "", imageAltText: "",
  seoTitle: "", seoDescription: "", keywords: "",
  status: "Draft",
};

type FormState = typeof EMPTY;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-primary border-b pb-2">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function splitList(value: string): string[] {
  return value.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
}

function joinList(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

function recordToForm(initial: DestinationRecord): FormState {
  return {
    name: String(initial.name ?? ""),
    country: String(initial.country ?? "India"),
    region: String(initial.region ?? ""),
    city: String(initial.city ?? ""),
    slug: String(initial.slug ?? ""),
    shortDescription: String(initial.shortDescription ?? ""),
    longDescription: String(initial.longDescription ?? ""),
    currency: String(initial.currency ?? "INR"),
    language: String(initial.language ?? ""),
    timeZone: String(initial.timeZone ?? ""),
    visaRequired: String(initial.visaRequired ?? false),
    visaDetails: String(initial.visaDetails ?? ""),
    passportValidity: String(initial.passportValidity ?? ""),
    bestTimeToVisit: String(initial.bestTimeToVisit ?? ""),
    climate: String(initial.climate ?? ""),
    averageBudget: String(initial.averageBudget ?? ""),
    popularAttractions: joinList(initial.popularAttractions),
    localTransport: String(initial.localTransport ?? ""),
    foodSpecialities: joinList(initial.foodSpecialities),
    shopping: String(initial.shopping ?? ""),
    nightlife: String(initial.nightlife ?? ""),
    adventureActivities: joinList(initial.adventureActivities),
    familyFriendly: String(initial.familyFriendly ?? true),
    coupleFriendly: String(initial.coupleFriendly ?? true),
    seniorFriendly: String(initial.seniorFriendly ?? false),
    heroImage: String(initial.heroImage ?? ""),
    galleryImages: Array.isArray(initial.galleryImages)
      ? (initial.galleryImages as string[]).join("\n")
      : String(initial.galleryImages ?? ""),
    bannerImage: String(initial.bannerImage ?? ""),
    thumbnail: String(initial.thumbnail ?? ""),
    videoUrl: String(initial.videoUrl ?? ""),
    imageAltText: String(initial.imageAltText ?? ""),
    seoTitle: String(initial.seoTitle ?? ""),
    seoDescription: String(initial.seoDescription ?? ""),
    keywords: joinList(initial.keywords),
    status: String(initial.status ?? "Draft"),
  };
}

function formToPayload(form: Record<string, string>): Record<string, unknown> {
  return {
    name: form.name,
    country: form.country,
    region: form.region || null,
    city: form.city || null,
    slug: form.slug || null,
    shortDescription: form.shortDescription || null,
    longDescription: form.longDescription || null,
    currency: form.currency || "INR",
    language: form.language || null,
    timeZone: form.timeZone || null,
    visaRequired: form.visaRequired === "true",
    visaDetails: form.visaDetails || null,
    passportValidity: form.passportValidity || null,
    bestTimeToVisit: form.bestTimeToVisit || null,
    climate: form.climate || null,
    averageBudget: form.averageBudget || null,
    popularAttractions: splitList(form.popularAttractions),
    localTransport: form.localTransport || null,
    foodSpecialities: splitList(form.foodSpecialities),
    shopping: form.shopping || null,
    nightlife: form.nightlife || null,
    adventureActivities: splitList(form.adventureActivities),
    familyFriendly: form.familyFriendly === "true",
    coupleFriendly: form.coupleFriendly === "true",
    seniorFriendly: form.seniorFriendly === "true",
    heroImage: form.heroImage.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null,
    galleryImages: form.galleryImages.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    bannerImage: form.bannerImage.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null,
    thumbnail: form.thumbnail.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null,
    videoUrl: form.videoUrl || null,
    imageAltText: form.imageAltText || null,
    seoTitle: form.seoTitle || null,
    seoDescription: form.seoDescription || null,
    keywords: splitList(form.keywords),
    status: form.status,
  };
}

export function DestinationFormDialog({ open, onOpenChange, initial, onSubmit }: DestinationFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? recordToForm(initial) : { ...EMPTY });
  }, [open, initial]);

  const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit(formToPayload(form));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{initial ? "Edit Destination" : "Create Destination"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-8rem)] px-6">
          <div className="space-y-8 pb-6">
            <Section title="Basic Information">
              <Field label="Destination Name *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bali" /></Field>
              <Field label="Country *"><Input value={form.country} onChange={(e) => set("country", e.target.value)} /></Field>
              <Field label="Region / State"><Input value={form.region} onChange={(e) => set("region", e.target.value)} /></Field>
              <Field label="City"><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="Slug"><Input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto-generated if empty" /></Field>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Short Description</Label>
                <Textarea value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} rows={2} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Long Description</Label>
                <Textarea value={form.longDescription} onChange={(e) => set("longDescription", e.target.value)} rows={4} />
              </div>
            </Section>

            <Section title="Travel Information">
              <Field label="Currency"><Input value={form.currency} onChange={(e) => set("currency", e.target.value)} /></Field>
              <Field label="Language"><Input value={form.language} onChange={(e) => set("language", e.target.value)} /></Field>
              <Field label="Time Zone"><Input value={form.timeZone} onChange={(e) => set("timeZone", e.target.value)} placeholder="Asia/Kolkata" /></Field>
              <Field label="Passport Validity"><Input value={form.passportValidity} onChange={(e) => set("passportValidity", e.target.value)} /></Field>
              <Field label="Best Time To Visit"><Input value={form.bestTimeToVisit} onChange={(e) => set("bestTimeToVisit", e.target.value)} placeholder="Oct – Mar" /></Field>
              <Field label="Climate"><Input value={form.climate} onChange={(e) => set("climate", e.target.value)} /></Field>
              <Field label="Average Budget"><Input value={form.averageBudget} onChange={(e) => set("averageBudget", e.target.value)} placeholder="₹50,000 – ₹1,50,000" /></Field>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm">Visa Required</Label>
                <Switch checked={form.visaRequired === "true"} onCheckedChange={(v) => set("visaRequired", String(v))} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Visa Details</Label>
                <Textarea value={form.visaDetails} onChange={(e) => set("visaDetails", e.target.value)} rows={2} />
              </div>
            </Section>

            <Section title="Travel Details">
              <Field label="Popular Attractions"><Input value={form.popularAttractions} onChange={(e) => set("popularAttractions", e.target.value)} placeholder="Comma-separated" /></Field>
              <Field label="Adventure Activities"><Input value={form.adventureActivities} onChange={(e) => set("adventureActivities", e.target.value)} placeholder="Comma-separated" /></Field>
              <Field label="Food Specialities"><Input value={form.foodSpecialities} onChange={(e) => set("foodSpecialities", e.target.value)} placeholder="Comma-separated" /></Field>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Local Transport</Label>
                <Textarea value={form.localTransport} onChange={(e) => set("localTransport", e.target.value)} rows={2} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Shopping</Label>
                <Textarea value={form.shopping} onChange={(e) => set("shopping", e.target.value)} rows={2} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Nightlife</Label>
                <Textarea value={form.nightlife} onChange={(e) => set("nightlife", e.target.value)} rows={2} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm">Family Friendly</Label>
                <Switch checked={form.familyFriendly === "true"} onCheckedChange={(v) => set("familyFriendly", String(v))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm">Couple Friendly</Label>
                <Switch checked={form.coupleFriendly === "true"} onCheckedChange={(v) => set("coupleFriendly", String(v))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm">Senior Citizen Friendly</Label>
                <Switch checked={form.seniorFriendly === "true"} onCheckedChange={(v) => set("seniorFriendly", String(v))} />
              </div>
            </Section>

            <Section title="Media">
              <div className="md:col-span-2">
                <ImageUrlListField
                  label="Hero image"
                  value={form.heroImage}
                  onChange={(v) => set("heroImage", v)}
                  maxImages={1}
                />
              </div>
              <div className="md:col-span-2">
                <ImageUrlListField
                  label="Thumbnail"
                  value={form.thumbnail}
                  onChange={(v) => set("thumbnail", v)}
                  maxImages={1}
                />
              </div>
              <div className="md:col-span-2">
                <ImageUrlListField
                  label="Banner image"
                  value={form.bannerImage}
                  onChange={(v) => set("bannerImage", v)}
                  maxImages={1}
                />
              </div>
              <Field label="Video URL"><Input value={form.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://..." /></Field>
              <div className="md:col-span-2">
                <ImageUrlListField
                  label="Gallery images"
                  value={form.galleryImages}
                  onChange={(v) => set("galleryImages", v)}
                  maxImages={12}
                />
              </div>
              <Field label="Image Alt Text"><Input value={form.imageAltText} onChange={(e) => set("imageAltText", e.target.value)} /></Field>
            </Section>

            <Section title="SEO">
              <Field label="SEO Title"><Input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></Field>
              <Field label="Keywords"><Input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="Comma-separated" /></Field>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">SEO Description</Label>
                <Textarea value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} rows={3} />
              </div>
            </Section>

            <Section title="Status">
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Section>
          </div>
        </ScrollArea>
        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name || !form.country}>
            {saving ? "Saving..." : initial ? "Update Destination" : "Create Destination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
