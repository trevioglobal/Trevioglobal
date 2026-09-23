"use client";

import { useEffect, useState } from "react";
import { PageHeader, PageShell } from "@/components/shared/ui-helpers";
import { CatalogToolbar } from "@/components/shared/enterprise";
import { ContractedRatesDialog, type ProductRateType } from "@/components/shared/contracted-rates-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/app-store";

const PATHS: Record<ProductRateType, string> = {
  HOTEL: "/api/products/hotels",
  TRANSFER: "/api/products/transfers",
  ACTIVITY: "/api/products/activities",
  MEAL: "/api/products/meals",
  FLIGHT: "/api/products/flights",
};

type Item = { id: string; name: string; status?: string; city?: string; airline?: string; origin?: string };

export function ContractedRatesView() {
  const { toast } = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const [type, setType] = useState<ProductRateType>("HOTEL");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("All");
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [flight, setFlight] = useState({ name: "", airline: "", flightNumber: "", origin: "", destinationAirport: "", cabinClass: "Economy" });

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: "30", ...(q ? { q } : {}), ...(city ? { city } : {}), ...(status !== "All" ? { status } : {}) });
    apiFetch<{ items: Item[] }>(`${PATHS[type]}?${params}`)
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]));
  }, [type, q, city, status]);

  if (role === "travel_agent") {
    return <PageShell><p className="text-sm text-muted-foreground">Rate management is internal only.</p></PageShell>;
  }

  async function createFlight() {
    try {
      await apiFetch("/api/products/flights", { method: "POST", body: JSON.stringify(flight) });
      setFlight({ name: "", airline: "", flightNumber: "", origin: "", destinationAirport: "", cabinClass: "Economy" });
      setQ(flight.name);
      toast({ title: "Internal flight product created. Add a contracted rate next." });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not create flight", variant: "destructive" });
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Contracted rates"
        subtitle="Product details stay in the catalogue. Contracted cost is a separate rate with a validity period."
      />

      <CatalogToolbar
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Search name"
        filters={
          <>
            <Select value={type} onValueChange={(v) => setType(v as ProductRateType)}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HOTEL">Hotels</SelectItem>
                <SelectItem value="TRANSFER">Transfers</SelectItem>
                <SelectItem value="ACTIVITY">Activities</SelectItem>
                <SelectItem value="MEAL">Meals</SelectItem>
                <SelectItem value="FLIGHT">Internal flights</SelectItem>
              </SelectContent>
            </Select>
            <Input className="h-9 w-[160px]" placeholder="City / origin" value={city} onChange={(e) => setCity(e.target.value)} />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Archived">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <Card>
        <CardContent className="p-0 divide-y">
          {items.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">No products match these filters.</p>
          )}
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-caption text-muted-foreground mt-0.5">
                  {item.city || item.origin || "—"} · {item.status || "Active"}
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setSelected(item)}>
                Rates
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {type === "FLIGHT" && (
        <Card>
          <CardContent className="p-4 md:p-5 space-y-3">
            <div>
              <p className="text-section-title text-foreground">Add internal contracted flight</p>
              <p className="text-caption text-muted-foreground mt-1">
                Amadeus search and manual employee flight entry stay on quotations. This is only the internal catalogue product.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <Input placeholder="Name" value={flight.name} onChange={(e) => setFlight({ ...flight, name: e.target.value })} />
              <Input placeholder="Airline" value={flight.airline} onChange={(e) => setFlight({ ...flight, airline: e.target.value })} />
              <Input placeholder="Flight number" value={flight.flightNumber} onChange={(e) => setFlight({ ...flight, flightNumber: e.target.value })} />
              <Input placeholder="Origin" value={flight.origin} onChange={(e) => setFlight({ ...flight, origin: e.target.value })} />
              <Input placeholder="Destination" value={flight.destinationAirport} onChange={(e) => setFlight({ ...flight, destinationAirport: e.target.value })} />
              <Input placeholder="Cabin" value={flight.cabinClass} onChange={(e) => setFlight({ ...flight, cabinClass: e.target.value })} />
            </div>
            <Button size="sm" className="h-9" onClick={createFlight}>Create flight product</Button>
          </CardContent>
        </Card>
      )}

      {selected && (
        <ContractedRatesDialog
          open={Boolean(selected)}
          onOpenChange={(open) => { if (!open) setSelected(null); }}
          productType={type}
          productId={selected.id}
          productName={selected.name}
        />
      )}
    </PageShell>
  );
}
