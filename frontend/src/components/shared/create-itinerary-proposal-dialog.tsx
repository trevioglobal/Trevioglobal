"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { todayYmd } from "@/lib/travel-dates";
import type { TravelProposalRecord } from "@/types";

type CityRow = { city: string; nights: number };

interface CreateItineraryProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function CreateItineraryProposalDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateItineraryProposalDialogProps) {
  const [title, setTitle] = useState("Custom Trip Proposal");
  const [startDate, setStartDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");
  const [cities, setCities] = useState<CityRow[]>([{ city: "", nights: 2 }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endDate = useMemo(() => {
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return "";
    const nights = cities.reduce((s, c) => s + Math.max(0, Number(c.nights) || 0), 0);
    const d = new Date(`${startDate}T12:00:00`);
    d.setDate(d.getDate() + nights);
    return d.toISOString().slice(0, 10);
  }, [startDate, cities]);

  const reset = () => {
    setTitle("Custom Trip Proposal");
    setStartDate("");
    setAdults(2);
    setChildren(0);
    setCurrency("INR");
    setNotes("");
    setCities([{ city: "", nights: 2 }]);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (!startDate) {
      setError("Start date is required");
      return;
    }
    const validCities = cities.filter((c) => c.city.trim() && c.nights > 0);
    if (!validCities.length) {
      setError("Add at least one city with nights");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ item: TravelProposalRecord }>("/api/travel-proposals/from-itinerary", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || "Travel Proposal",
          startDate,
          adults,
          children,
          currency,
          notes: notes || undefined,
          cities: validCities.map((c) => ({ city: c.city.trim(), nights: Number(c.nights) })),
        }),
      });
      onOpenChange(false);
      reset();
      onCreated(res.item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create proposal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New itinerary proposal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Trip title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} min={todayYmd()} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input type="date" value={endDate} disabled readOnly />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Adults</Label>
              <Input type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="space-y-1.5">
              <Label>Children</Label>
              <Input type="number" min={0} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cities & nights</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCities((prev) => [...prev, { city: "", nights: 2 }])}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> City
              </Button>
            </div>
            {cities.map((row, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <Input
                  className="flex-1"
                  placeholder="City"
                  value={row.city}
                  onChange={(e) => setCities((prev) => prev.map((c, i) => (i === idx ? { ...c, city: e.target.value } : c)))}
                />
                <Input
                  className="w-20"
                  type="number"
                  min={1}
                  value={row.nights}
                  onChange={(e) => setCities((prev) => prev.map((c, i) => (i === idx ? { ...c, nights: Math.max(1, Number(e.target.value) || 1) } : c)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={cities.length <= 1}
                  onClick={() => setCities((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Creating…" : "Create & build"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
