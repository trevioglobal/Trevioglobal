"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, PageShell, StatusBadge } from "@/components/shared/ui-helpers";
import { CatalogToolbar } from "@/components/shared/enterprise";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImageUrlListField } from "@/components/shared/image-url-list-field";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { hasCrudPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/app-store";

type DestinationOption = {
  id: string;
  name: string;
  city?: string | null;
  country?: string;
};

export type SightseeingPlaceRecord = {
  id: string;
  destinationId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  bestTimeToVisit?: string | null;
  famousFor?: string | null;
  suggestedDuration?: string | null;
  sellingPrice?: number | null;
  costPrice?: number | null;
  currency?: string;
  status?: string;
  sortOrder?: number;
  destination?: DestinationOption | null;
};

type PlaceForm = {
  destinationId: string;
  name: string;
  description: string;
  imageUrl: string;
  bestTimeToVisit: string;
  famousFor: string;
  suggestedDuration: string;
  sellingPrice: string;
  costPrice: string;
  currency: string;
  status: string;
};

const EMPTY_FORM: PlaceForm = {
  destinationId: "",
  name: "",
  description: "",
  imageUrl: "",
  bestTimeToVisit: "",
  famousFor: "",
  suggestedDuration: "",
  sellingPrice: "",
  costPrice: "",
  currency: "INR",
  status: "Active",
};

function formatMoney(value?: number | null, currency = "INR") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${currency} ${Number(value).toLocaleString("en-IN")}`;
}

export function ItineraryPlacesView() {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const canAdd = user ? hasCrudPermission(user, "destinations", "add") : false;
  const canEdit = user ? hasCrudPermission(user, "destinations", "edit") : false;
  const canDelete = user ? hasCrudPermission(user, "destinations", "delete") : false;

  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [items, setItems] = useState<SightseeingPlaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [destinationFilter, setDestinationFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SightseeingPlaceRecord | null>(null);
  const [form, setForm] = useState<PlaceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadDestinations = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: DestinationOption[] }>("/api/destinations?pageSize=200&status=Active");
      setDestinations(res.items || []);
    } catch {
      setDestinations([]);
    }
  }, []);

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (destinationFilter !== "all") params.set("destinationId", destinationFilter);
      if (q.trim()) params.set("q", q.trim());
      const res = await apiFetch<{ items: SightseeingPlaceRecord[] }>(
        `/api/products/sightseeing-places?${params.toString()}`,
      );
      setItems(res.items || []);
    } catch {
      toast({ title: "Failed to load itinerary places", variant: "destructive" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [destinationFilter, q, toast]);

  useEffect(() => {
    void loadDestinations();
  }, [loadDestinations]);

  useEffect(() => {
    void loadPlaces();
  }, [loadPlaces]);

  const destinationLabel = useMemo(() => {
    const map = new Map(destinations.map((d) => [d.id, d.name]));
    return (id: string, fallback?: DestinationOption | null) =>
      map.get(id) || fallback?.name || "—";
  }, [destinations]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      destinationId: destinationFilter !== "all" ? destinationFilter : "",
    });
    setDialogOpen(true);
  }

  function openEdit(item: SightseeingPlaceRecord) {
    setEditing(item);
    setForm({
      destinationId: item.destinationId,
      name: item.name || "",
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      bestTimeToVisit: item.bestTimeToVisit || "",
      famousFor: item.famousFor || "",
      suggestedDuration: item.suggestedDuration || "",
      sellingPrice: item.sellingPrice != null ? String(item.sellingPrice) : "",
      costPrice: item.costPrice != null ? String(item.costPrice) : "",
      currency: item.currency || "INR",
      status: item.status || "Active",
    });
    setDialogOpen(true);
  }

  async function savePlace() {
    if (!form.destinationId || !form.name.trim()) {
      toast({ title: "Destination and place name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      destinationId: form.destinationId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      bestTimeToVisit: form.bestTimeToVisit.trim() || null,
      famousFor: form.famousFor.trim() || null,
      suggestedDuration: form.suggestedDuration.trim() || null,
      sellingPrice: form.sellingPrice === "" ? null : Number(form.sellingPrice),
      costPrice: form.costPrice === "" ? null : Number(form.costPrice),
      currency: form.currency || "INR",
      status: form.status || "Active",
    };
    try {
      if (editing) {
        await apiFetch(`/api/products/sightseeing-places/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast({ title: "Place updated" });
      } else {
        await apiFetch("/api/products/sightseeing-places", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({ title: "Place created" });
      }
      setDialogOpen(false);
      await loadPlaces();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deletePlace(item: SightseeingPlaceRecord) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await apiFetch(`/api/products/sightseeing-places/${item.id}`, { method: "DELETE" });
      toast({ title: "Place deleted" });
      await loadPlaces();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Sightseeing Places"
        subtitle="Landmarks for itinerary day plans — beach, temple, viewpoint"
        action={
          canAdd ? (
            <Button size="sm" className="h-9" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add place
            </Button>
          ) : null
        }
      />

      <CatalogToolbar
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Search by name, description, famous for…"
        filters={
          <Select value={destinationFilter} onValueChange={setDestinationFilter}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="All destinations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All destinations</SelectItem>
              {destinations.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                  {d.country ? ` · ${d.country}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Place</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Best time</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Loading places…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    No itinerary places yet. Add places for Goa, Singapore, Bali, Dubai, Mumbai, etc.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-start gap-3 min-w-0">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-12 w-16 rounded object-cover border shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-16 rounded border bg-muted flex items-center justify-center shrink-0">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {item.famousFor || item.description || "—"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {destinationLabel(item.destinationId, item.destination)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.bestTimeToVisit || "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatMoney(item.sellingPrice, item.currency)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status === "Active" ? "Active" : "Draft"} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => void deletePlace(item)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit itinerary place" : "Add itinerary place"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Destination *</Label>
              <Select
                value={form.destinationId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, destinationId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.country ? ` · ${d.country}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Place name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Calangute Beach"
              />
            </div>
            <div className="space-y-1.5">
              <ImageUrlListField
                label="Cover image"
                value={form.imageUrl}
                onChange={(v) => setForm((f) => ({ ...f, imageUrl: v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "" }))}
                maxImages={1}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (itinerary copy)</Label>
              <Textarea
                className="min-h-[80px]"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What guests will see / do here…"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Best time to visit</Label>
                <Input
                  value={form.bestTimeToVisit}
                  onChange={(e) => setForm((f) => ({ ...f, bestTimeToVisit: e.target.value }))}
                  placeholder="e.g. Nov–Feb mornings"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Suggested duration</Label>
                <Input
                  value={form.suggestedDuration}
                  onChange={(e) => setForm((f) => ({ ...f, suggestedDuration: e.target.value }))}
                  placeholder="e.g. 2–3 hours"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Famous for</Label>
              <Textarea
                className="min-h-[64px]"
                value={form.famousFor}
                onChange={(e) => setForm((f) => ({ ...f, famousFor: e.target.value }))}
                placeholder="What this place is known for…"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Selling price</Label>
                <Input
                  type="number"
                  value={form.sellingPrice}
                  onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cost price</Label>
                <Input
                  type="number"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void savePlace()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create place"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
