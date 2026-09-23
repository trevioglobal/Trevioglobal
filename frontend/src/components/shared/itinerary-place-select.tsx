"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageUrlListField } from "@/components/shared/image-url-list-field";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

export type ItineraryPlaceItem = {
  sightseeingPlaceId?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  bestTimeToVisit?: string;
  famousFor?: string;
  suggestedDuration?: string;
  sellingPrice?: number | null;
  costPrice?: number | null;
  currency?: string;
};

type CatalogPlace = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  bestTimeToVisit?: string | null;
  famousFor?: string | null;
  suggestedDuration?: string | null;
  sellingPrice?: number | null;
  costPrice?: number | null;
  currency?: string | null;
};

function buildPlaceDescription(place: CatalogPlace): string {
  const parts: string[] = [];
  if (place.description?.trim()) parts.push(place.description.trim());
  if (place.bestTimeToVisit?.trim()) parts.push(`Best time to visit: ${place.bestTimeToVisit.trim()}`);
  if (place.famousFor?.trim()) parts.push(`Famous for: ${place.famousFor.trim()}`);
  if (place.suggestedDuration?.trim()) parts.push(`Suggested duration: ${place.suggestedDuration.trim()}`);
  return parts.join("\n\n");
}

function toItineraryItem(place: CatalogPlace): ItineraryPlaceItem {
  return {
    sightseeingPlaceId: place.id,
    name: place.name.trim(),
    description: buildPlaceDescription(place),
    imageUrl: place.imageUrl || "",
    bestTimeToVisit: place.bestTimeToVisit || "",
    famousFor: place.famousFor || "",
    suggestedDuration: place.suggestedDuration || "",
    sellingPrice: place.sellingPrice ?? null,
    costPrice: place.costPrice ?? null,
    currency: place.currency || "INR",
  };
}

/**
 * Place picker scoped to one trip-city destination.
 * Options come from Products → Itinerary Places (SightseeingPlace) for that destination.
 */
export function ItineraryPlaceSelect({
  tripCityDestinationId,
  tripCityLabel,
  places,
  onChange,
  className,
}: {
  tripCityDestinationId?: string | null;
  tripCityLabel: string;
  places: ItineraryPlaceItem[];
  onChange: (places: ItineraryPlaceItem[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!tripCityDestinationId) {
      setCatalog([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<{ items: CatalogPlace[] }>(
      `/api/products/sightseeing-places?destinationId=${encodeURIComponent(tripCityDestinationId)}&liveOnly=true&pageSize=100`,
    )
      .then((res) => {
        if (!cancelled) setCatalog(res.items || []);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripCityDestinationId]);

  const selectedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of places) {
      if (p.sightseeingPlaceId) keys.add(`id:${p.sightseeingPlaceId}`);
      keys.add(`name:${p.name.trim().toLowerCase()}`);
    }
    return keys;
  }, [places]);

  function isSelected(place: CatalogPlace) {
    return (
      selectedKeys.has(`id:${place.id}`) ||
      selectedKeys.has(`name:${place.name.trim().toLowerCase()}`)
    );
  }

  function toggleCatalogPlace(place: CatalogPlace) {
    if (isSelected(place)) {
      onChange(
        places.filter(
          (p) =>
            p.sightseeingPlaceId !== place.id &&
            p.name.trim().toLowerCase() !== place.name.trim().toLowerCase(),
        ),
      );
      return;
    }
    onChange([...places, toItineraryItem(place)]);
  }

  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (selectedKeys.has(`name:${key}`)) {
      setCustom("");
      setOpen(false);
      return;
    }
    onChange([
      ...places,
      {
        name,
        description: "",
        imageUrl: "",
        bestTimeToVisit: "",
        famousFor: "",
      },
    ]);
    setCustom("");
    setOpen(false);
  }

  function updatePlace(index: number, patch: Partial<ItineraryPlaceItem>) {
    onChange(places.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePlace(index: number) {
    onChange(places.filter((_, i) => i !== index));
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-1.5">
        <Label className="text-xs">
          Sightseeing places in {tripCityLabel || "this city"}
        </Label>
        <p className="text-[11px] text-muted-foreground">
          From Products → Sightseeing Places for{" "}
          <span className="font-medium">{tripCityLabel || "city"}</span>
          {" "}— image, description, best time &amp; famous for fill automatically. Add multiple per day.
        </p>
        {!tripCityDestinationId ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Link this city to a destination in Travel step so places load from the catalog.
          </p>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-10 w-full justify-between font-normal">
                <span className="flex items-center gap-2 min-w-0 truncate text-sm">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-teal-600" />
                  {loading
                    ? "Loading places…"
                    : places.length
                      ? `${places.length} place${places.length === 1 ? "" : "s"} selected`
                      : `Add places in ${tripCityLabel}…`}
                </span>
                <Plus className="w-4 h-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(100vw-2rem,360px)] p-2" align="start">
              {catalog.length === 0 && !loading ? (
                <div className="px-2 py-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    No itinerary places for this destination yet. Add them under Products → Itinerary Places
                    (e.g. Calangute Beach under Goa).
                  </p>
                </div>
              ) : (
                <ul className="max-h-56 overflow-y-auto space-y-0.5">
                  {catalog.map((place) => {
                    const selected = isSelected(place);
                    return (
                      <li key={place.id}>
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/70",
                            selected && "bg-teal-50 text-teal-900",
                          )}
                          onClick={() => toggleCatalogPlace(place)}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 items-center justify-center rounded border shrink-0",
                              selected ? "bg-teal-600 border-teal-600 text-white" : "border-border",
                            )}
                          >
                            {selected ? <Check className="h-3 w-3" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{place.name}</span>
                            {place.sellingPrice != null && place.sellingPrice > 0 ? (
                              <span className="block text-[10px] text-muted-foreground tabular-nums">
                                from {place.currency || "INR"} {Number(place.sellingPrice).toLocaleString("en-IN")}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="border-t mt-2 pt-2 flex gap-2">
                <Input
                  className="h-8 text-sm"
                  placeholder="Custom place name…"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                />
                <Button type="button" size="sm" className="h-8 shrink-0" onClick={addCustom} disabled={!custom.trim()}>
                  Add
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {places.length > 0 && (
        <div className="space-y-3">
          {places.map((place, index) => (
            <div key={`${place.sightseeingPlaceId || place.name}-${index}`} className="rounded-xl border bg-slate-50/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="truncate">{place.name}</span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removePlace(index)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <ImageUrlListField
                label="Cover image"
                value={place.imageUrl || ""}
                onChange={(v) =>
                  updatePlace(index, {
                    imageUrl: v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "",
                  })
                }
                maxImages={1}
              />
              <Textarea
                className="min-h-[88px] bg-white text-sm"
                value={place.description || ""}
                onChange={(e) => updatePlace(index, { description: e.target.value })}
                placeholder={`Description, best time to visit, what ${place.name} is famous for…`}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  className="h-8 text-xs bg-white"
                  value={place.bestTimeToVisit || ""}
                  onChange={(e) => updatePlace(index, { bestTimeToVisit: e.target.value })}
                  placeholder="Best time to visit"
                />
                <Input
                  className="h-8 text-xs bg-white"
                  value={place.famousFor || ""}
                  onChange={(e) => updatePlace(index, { famousFor: e.target.value })}
                  placeholder="Famous for"
                />
              </div>
              {(place.sellingPrice != null && place.sellingPrice > 0) || place.sellingPrice === 0 ? (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Catalog price: {place.currency || "INR"}{" "}
                  {Number(place.sellingPrice || 0).toLocaleString("en-IN")}
                  {" "}(rolls into Sightseeing on Pricing)
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
