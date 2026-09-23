"use client";

import { useEffect, useState } from "react";
import {
  MapPin, Globe, Clock, DollarSign, Calendar, Pencil,
  Copy, Archive, Trash2, Hotel, Activity, Car, Package, FileText, History,
} from "lucide-react";
import { PageShell, StatusBadge } from "@/components/shared/ui-helpers";
import { DetailBackButton, EnterprisePageHeader } from "@/components/shared/enterprise";
import { DestinationFormDialog } from "@/components/shared/destination-form-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, ApiError } from "@/lib/api";
import { hasCrudPermission } from "@/lib/permissions";
import { useAppStore, useAuthStore } from "@/store/app-store";
import type { DestinationRecord, ProductRecord, TravelPackageRecord, ViewKey } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DestinationDetailProps {
  destinationId: string;
  onBack: () => void;
  onRefreshList: () => void;
}

function EmptyLinkedTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Package className="w-10 h-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">No linked {label}</p>
      <p className="text-xs mt-1">Records will appear here once integrated with this destination.</p>
    </div>
  );
}

function formatDateShort(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function hotelPrice(item: ProductRecord): string {
  const rooms = Array.isArray(item.roomCategories) ? (item.roomCategories as Record<string, unknown>[]) : [];
  const pricing = (rooms[0]?.pricing as Record<string, number>) ?? {};
  const price = pricing.double ?? pricing.single ?? 0;
  const currency = String(item.currency || "INR");
  return price ? `${currency} ${Number(price).toLocaleString("en-IN")}` : "—";
}

function activityPrice(item: ProductRecord): string {
  const currency = String(item.currency || "INR");
  return `${currency} ${Number(item.adultPrice ?? 0).toLocaleString("en-IN")}`;
}

function transferPrice(item: ProductRecord): string {
  const currency = String(item.currency || "INR");
  const p = Number(item.privatePrice ?? item.sharedPrice ?? 0);
  return p ? `${currency} ${p.toLocaleString("en-IN")}` : "—";
}

function productImage(item: ProductRecord): string | null {
  if (Array.isArray(item.images) && item.images.length) return String(item.images[0]);
  return null;
}

interface LinkedProductsTableProps {
  items: ProductRecord[];
  kind: "hotels" | "activities" | "transfers";
  onOpen: (view: ViewKey, productId: string, tab?: string) => void;
}

function LinkedProductsTable({ items, kind, onOpen }: LinkedProductsTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Package className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No linked {kind}</p>
      </div>
    );
  }

  const view: ViewKey = kind === "hotels" ? "hotel-products" : "activity-packages";
  const priceFn = kind === "hotels" ? hotelPrice : kind === "activities" ? activityPrice : transferPrice;

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const img = productImage(item);
            return (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onOpen(view, item.id, kind === "transfers" ? "transfers" : kind === "activities" ? "activities" : undefined)}
              >
                <TableCell>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="w-10 h-10 rounded-md object-cover border" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-muted border" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell><StatusBadge status={item.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.supplier?.name ?? "—"}</TableCell>
                <TableCell className="text-sm">{priceFn(item)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDateShort(item.updatedAt)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DestinationPackagesTab({ destinationId }: { destinationId: string }) {
  const setView = useAppStore((s) => s.setView);
  const [items, setItems] = useState<TravelPackageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: TravelPackageRecord[] }>(`/api/packages?destinationId=${destinationId}&pageSize=50`)
      .then((d) => setItems(d.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [destinationId]);

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!items.length) return <EmptyLinkedTab label="packages" />;

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Package</TableHead><TableHead>Duration</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.set("view", "packages");
                url.searchParams.set("packageId", p.id);
                url.searchParams.delete("destinationId");
                window.history.replaceState({}, "", url.toString());
              }
              setView("packages" as ViewKey);
            }}>
              <TableCell className="font-medium">{p.packageName}</TableCell>
              <TableCell>{p.durationDays}D / {p.durationNights}N</TableCell>
              <TableCell>₹{(p.finalPrice || p.startingPrice).toLocaleString("en-IN")}</TableCell>
              <TableCell><StatusBadge status={p.status === "Published" ? "Active" : p.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | boolean | null }) {
  if (value === undefined || value === null || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{display}</span>
    </div>
  );
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function DestinationDetail({ destinationId, onBack, onRefreshList }: DestinationDetailProps) {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const setView = useAppStore((s) => s.setView);
  const [item, setItem] = useState<DestinationRecord | null>(null);
  const [linked, setLinked] = useState<{
    hotels: ProductRecord[];
    activities: ProductRecord[];
    transfers: ProductRecord[];
    sightseeingPlaces: Array<{
      id: string;
      name: string;
      imageUrl?: string | null;
      bestTimeToVisit?: string | null;
      famousFor?: string | null;
      sellingPrice?: number | null;
      currency?: string | null;
      status?: string | null;
    }>;
  }>({
    hotels: [], activities: [], transfers: [], sightseeingPlaces: [],
  });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canEdit = user ? hasCrudPermission(user, "destinations", "edit") : false;
  const canAdd = user ? hasCrudPermission(user, "destinations", "add") : false;
  const canDelete = user ? hasCrudPermission(user, "destinations", "delete") : false;

  const load = async () => {
    setLoading(true);
    try {
      const [detail, products] = await Promise.all([
        apiFetch<{ item: DestinationRecord }>(`/api/destinations/${destinationId}`),
        apiFetch<{
          hotels: ProductRecord[];
          activities: ProductRecord[];
          transfers: ProductRecord[];
          sightseeingPlaces?: typeof linked.sightseeingPlaces;
        }>(`/api/destinations/${destinationId}/products`),
      ]);
      setItem(detail.item);
      setLinked({
        hotels: products.hotels || [],
        activities: products.activities || [],
        transfers: products.transfers || [],
        sightseeingPlaces: products.sightseeingPlaces || [],
      });
    } catch {
      toast({ title: "Failed to load destination", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openProduct = (view: ViewKey, productId: string, tab?: string) => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      url.searchParams.set("productId", productId);
      url.searchParams.delete("destinationId");
      if (tab) url.searchParams.set("tab", tab);
      else url.searchParams.delete("tab");
      window.history.replaceState({}, "", url.toString());
    }
    setView(view);
  };

  useEffect(() => { load(); }, [destinationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdate = async (payload: Record<string, unknown>) => {
    await apiFetch(`/api/destinations/${destinationId}`, { method: "PATCH", body: JSON.stringify(payload) });
    toast({ title: "Destination updated" });
    load();
    onRefreshList();
  };

  const handleDuplicate = async () => {
    try {
      await apiFetch(`/api/destinations/${destinationId}/duplicate`, { method: "POST" });
      toast({ title: "Destination duplicated" });
      onRefreshList();
    } catch {
      toast({ title: "Duplicate failed", variant: "destructive" });
    }
  };

  const handleArchive = async () => {
    try {
      await apiFetch(`/api/destinations/${destinationId}/archive`, { method: "PATCH" });
      toast({ title: "Destination archived" });
      load();
      onRefreshList();
    } catch {
      toast({ title: "Archive failed", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/api/destinations/${destinationId}`, { method: "DELETE" });
      toast({ title: "Destination deleted" });
      onRefreshList();
      onBack();
    } catch (e) {
      toast({
        title: e instanceof ApiError && e.status === 409 ? "Cannot delete destination" : "Delete failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-48 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </PageShell>
    );
  }

  if (!item) {
    return (
      <PageShell>
        <DetailBackButton onClick={onBack} label="Back to destinations" />
        <p className="text-muted-foreground mt-4">Destination not found.</p>
      </PageShell>
    );
  }

  const hero = item.heroImage || item.bannerImage || item.thumbnail;
  const gallery = Array.isArray(item.galleryImages) ? item.galleryImages : [];

  return (
    <PageShell>
      <DetailBackButton onClick={onBack} label="Back to destinations" />
      <EnterprisePageHeader
        title={item.name}
        subtitle={[item.city, item.region, item.country].filter(Boolean).join(", ")}
        breadcrumbs={[
          { label: "Destinations", onClick: onBack },
          { label: item.name },
        ]}
        actions={
          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                <Pencil className="w-4 h-4 mr-1" />Edit
              </Button>
            )}
            {canAdd && (
              <Button variant="outline" size="sm" onClick={handleDuplicate}>
                <Copy className="w-4 h-4 mr-1" />Duplicate
              </Button>
            )}
            {canEdit && item.status !== "Archived" && (
              <Button variant="outline" size="sm" onClick={handleArchive}>
                <Archive className="w-4 h-4 mr-1" />Archive
              </Button>
            )}
            {canDelete && (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-4 h-4 mr-1" />Delete
              </Button>
            )}
          </div>
        }
      />
      <div className="flex items-center gap-2 flex-wrap -mt-1 mb-2">
        <StatusBadge status={item.status} />
        <span className="text-xs text-muted-foreground">/{item.slug}</span>
      </div>

      {hero && (
        <div className="relative rounded-xl overflow-hidden h-48 md:h-64 bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero} alt={item.imageAltText || item.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-4 left-4 text-white">
            <p className="text-lg font-semibold flex items-center gap-2"><MapPin className="w-4 h-4" />{item.country}</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="overview" className="mt-2">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="gallery">Gallery</TabsTrigger>
          <TabsTrigger value="sightseeing"><MapPin className="w-3.5 h-3.5 mr-1" />Itinerary Places</TabsTrigger>
          <TabsTrigger value="hotels"><Hotel className="w-3.5 h-3.5 mr-1" />Hotels</TabsTrigger>
          <TabsTrigger value="activities"><Activity className="w-3.5 h-3.5 mr-1" />Activities</TabsTrigger>
          <TabsTrigger value="transfers"><Car className="w-3.5 h-3.5 mr-1" />Transfers</TabsTrigger>
          <TabsTrigger value="packages"><Package className="w-3.5 h-3.5 mr-1" />Packages</TabsTrigger>
          <TabsTrigger value="documents"><FileText className="w-3.5 h-3.5 mr-1" />Documents</TabsTrigger>
          <TabsTrigger value="audit"><History className="w-3.5 h-3.5 mr-1" />Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />Basic Information</h3>
                {item.shortDescription && <p className="text-sm text-muted-foreground mb-3">{item.shortDescription}</p>}
                {item.longDescription && <p className="text-sm whitespace-pre-wrap">{item.longDescription}</p>}
                <div className="mt-4">
                  <InfoRow label="City" value={item.city} />
                  <InfoRow label="Region" value={item.region} />
                  <InfoRow label="Country" value={item.country} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-brand-teal" />Travel Information</h3>
                <InfoRow label="Currency" value={item.currency} />
                <InfoRow label="Language" value={item.language} />
                <InfoRow label="Time Zone" value={item.timeZone} />
                <InfoRow label="Visa Required" value={item.visaRequired} />
                <InfoRow label="Visa Details" value={item.visaDetails} />
                <InfoRow label="Passport Validity" value={item.passportValidity} />
                <InfoRow label="Best Time To Visit" value={item.bestTimeToVisit} />
                <InfoRow label="Climate" value={item.climate} />
                <InfoRow label="Average Budget" value={item.averageBudget} />
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Travel Details</h3>
                <div className="grid sm:grid-cols-2 gap-x-8">
                  <InfoRow label="Popular Attractions" value={Array.isArray(item.popularAttractions) ? item.popularAttractions.join(", ") : undefined} />
                  <InfoRow label="Adventure Activities" value={Array.isArray(item.adventureActivities) ? item.adventureActivities.join(", ") : undefined} />
                  <InfoRow label="Food Specialities" value={Array.isArray(item.foodSpecialities) ? item.foodSpecialities.join(", ") : undefined} />
                  <InfoRow label="Local Transport" value={item.localTransport} />
                  <InfoRow label="Shopping" value={item.shopping} />
                  <InfoRow label="Nightlife" value={item.nightlife} />
                  <InfoRow label="Family Friendly" value={item.familyFriendly} />
                  <InfoRow label="Couple Friendly" value={item.coupleFriendly} />
                  <InfoRow label="Senior Friendly" value={item.seniorFriendly} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">SEO</h3>
                <InfoRow label="SEO Title" value={item.seoTitle} />
                <InfoRow label="SEO Description" value={item.seoDescription} />
                <InfoRow label="Keywords" value={Array.isArray(item.keywords) ? item.keywords.join(", ") : undefined} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" />Record Info</h3>
                <InfoRow label="Created By" value={item.createdByName} />
                <InfoRow label="Created At" value={formatDate(item.createdAt)} />
                <InfoRow label="Last Updated By" value={item.updatedByName} />
                <InfoRow label="Last Updated" value={formatDate(item.updatedAt)} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gallery" className="mt-4">
          {gallery.length === 0 && !hero ? (
            <EmptyLinkedTab label="images" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[hero, ...gallery.filter((u) => u !== hero)].filter(Boolean).map((url, i) => (
                <div key={i} className="aspect-video rounded-lg overflow-hidden bg-muted border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url as string} alt={`${item.name} ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
          {item.videoUrl && (
            <Card className="mt-4">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-2">Video</p>
                <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{item.videoUrl}</a>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sightseeing" className="mt-4">
          {linked.sightseeingPlaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <MapPin className="w-10 h-10 opacity-40" />
              <p className="text-sm font-medium">No itinerary places yet</p>
              <p className="text-xs">Add sightseeing places under Products → Itinerary Places for this destination.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openProduct("itinerary-places", destinationId)}
              >
                Open Itinerary Places
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => openProduct("itinerary-places", destinationId)}>
                  Manage places
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {linked.sightseeingPlaces.map((place) => (
                  <Card key={place.id}>
                    <CardContent className="p-3 space-y-2">
                      {place.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={place.imageUrl} alt="" className="h-28 w-full object-cover rounded-lg border" />
                      ) : null}
                      <p className="font-medium text-sm">{place.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {place.famousFor || place.bestTimeToVisit || "—"}
                      </p>
                      {place.sellingPrice != null && place.sellingPrice > 0 ? (
                        <p className="text-xs tabular-nums">
                          {place.currency || "INR"} {Number(place.sellingPrice).toLocaleString("en-IN")}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="hotels">
          <LinkedProductsTable items={linked.hotels} kind="hotels" onOpen={openProduct} />
        </TabsContent>
        <TabsContent value="activities">
          <LinkedProductsTable items={linked.activities} kind="activities" onOpen={openProduct} />
        </TabsContent>
        <TabsContent value="transfers">
          <LinkedProductsTable items={linked.transfers} kind="transfers" onOpen={openProduct} />
        </TabsContent>
        <TabsContent value="packages">
          <DestinationPackagesTab destinationId={destinationId} />
        </TabsContent>
        <TabsContent value="documents"><EmptyLinkedTab label="documents" /></TabsContent>
        <TabsContent value="audit">
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <History className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No audit entries</p>
            <p className="text-xs mt-1">Change history will be recorded as the module is integrated with audit logging.</p>
          </div>
        </TabsContent>
      </Tabs>

      <DestinationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={item}
        onSubmit={handleUpdate}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete destination?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete &quot;{item.name}&quot;. This action can be reversed by an administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
