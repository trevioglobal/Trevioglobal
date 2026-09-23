"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Copy, Archive, Trash2, Pencil, Download, Upload, CheckCircle, Package, IndianRupee } from "lucide-react";
import { PageHeader, MetricCard, CatalogStatGrid, StatusBadge } from "@/components/shared/ui-helpers";
import { ProductFormDialog, type ProductKind } from "@/components/shared/product-form-dialog";
import { CatalogToolbar } from "@/components/shared/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/app-store";
import { ContractedRatesDialog, type ProductRateType } from "@/components/shared/contracted-rates-dialog";
import type { ProductRecord } from "@/types";
import type { DestinationOption } from "@/components/shared/destination-select";

export function DestinationNameCell({ item }: { item: ProductRecord }) {
  return <span>{item.destination?.name ?? "—"}</span>;
}

interface ProductCatalogProps {
  title: string;
  subtitle: string;
  kind: ProductKind;
  apiPath: "/api/products/hotels" | "/api/products/activities" | "/api/products/transfers";
  columns: { key: string; label: string; render?: (item: ProductRecord) => React.ReactNode }[];
  /** When true, skip page title (parent already shows one — e.g. tabs). */
  hideHeader?: boolean;
  /** When true, render without PageShell wrapper (nested in another page). */
  embedded?: boolean;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else current += ch;
  }
  result.push(current);
  return result;
}

function rowToPayload(kind: ProductKind, row: Record<string, string>): Record<string, unknown> {
  const destinationId = row.destinationId || row["Destination ID"] || null;
  const base = destinationId ? { destinationId } : {};
  if (kind === "hotels") {
    return {
      ...base,
      name: row.name || row["Hotel Name"],
      city: row.city || row.City || "",
      country: row.country || row.Country || "India",
      starCategory: parseInt(row.starCategory || row.Stars || "3", 10) || 3,
      currency: row.currency || row.Currency || "INR",
      description: row.description || row.Description || null,
      address: row.address || row.Address || null,
      contactPerson: row.contactPerson || row["Contact Person"] || null,
      contactPhone: row.contactPhone || row["Contact Phone"] || null,
      contactEmail: row.contactEmail || row["Contact Email"] || null,
      website: row.website || row.Website || null,
      checkInTime: row.checkInTime || row["Check-in"] || "14:00",
      checkOutTime: row.checkOutTime || row["Check-out"] || "11:00",
      status: row.status || "Draft",
      amenities: (row.amenities || row.Amenities || "").split("|").map((s) => s.trim()).filter(Boolean),
      roomCategories: [{
        name: row.roomName || row["Room Name"] || "Standard",
        description: row.roomDescription || "",
        maxOccupancy: parseInt(row.maxOccupancy || "2", 10) || 2,
        maxAdults: parseInt(row.maxAdults || "2", 10) || 2,
        maxChildren: parseInt(row.maxChildren || "0", 10) || 0,
        mealPlan: row.mealPlan || "CP",
        pricing: {
          single: parseInt(row.priceSingle || "0", 10) || 0,
          double: parseInt(row.priceDouble || "0", 10) || 0,
          extraAdult: parseInt(row.priceExtraAdult || "0", 10) || 0,
          extraChild: parseInt(row.priceExtraChild || "0", 10) || 0,
        },
      }],
    };
  }
  if (kind === "activities") {
    return {
      ...base,
      name: row.name || row.Activity,
      location: row.location || row.Location || null,
      duration: row.duration || row.Duration || null,
      adultPrice: parseInt(row.adultPrice || "0", 10) || 0,
      childPrice: parseInt(row.childPrice || "0", 10) || 0,
      currency: row.currency || "INR",
      description: row.description || null,
      status: row.status || "Draft",
      inclusions: (row.inclusions || "").split("|").map((s) => s.trim()).filter(Boolean),
      exclusions: (row.exclusions || "").split("|").map((s) => s.trim()).filter(Boolean),
    };
  }
  return {
    ...base,
    name: row.name || row.Transfer,
    transferType: row.transferType || row.Type || "Private",
    vehicleType: row.vehicleType || row.Vehicle || null,
    pickupLocation: row.pickupLocation || row.Pickup || "",
    dropLocation: row.dropLocation || row.Drop || "",
    privatePrice: row.privatePrice ? parseInt(row.privatePrice, 10) : null,
    sharedPrice: row.sharedPrice ? parseInt(row.sharedPrice, 10) : null,
    currency: row.currency || "INR",
    status: row.status || "Active",
  };
}

function ApprovalStatusBadge({ item }: { item: ProductRecord }) {
  const status = String(item.approvalStatus || "Draft");
  const mapped =
    status === "Approved" ? "Active" :
    status === "Pending" ? "Pending" :
    status === "Rejected" ? "Cancelled" :
    "Draft";
  return <StatusBadge status={mapped} />;
}

function mergePendingRates(item: ProductRecord): ProductRecord {
  const pending = item.pendingRateChanges;
  if (!pending || typeof pending !== "object") return item;
  return { ...item, ...(pending as Record<string, unknown>) };
}

export function ProductCatalog({ title, subtitle, kind, apiPath, columns, hideHeader = false, embedded = false }: ProductCatalogProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ProductRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [destinationId, setDestinationId] = useState("All");
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [sort, setSort] = useState("createdAt");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [ratesFor, setRatesFor] = useState<ProductRecord | null>(null);
  const [city, setCity] = useState("");
  const role = useAuthStore((s) => s.user?.role);
  const rateType: ProductRateType = kind === "hotels" ? "HOTEL" : kind === "transfers" ? "TRANSFER" : "ACTIVITY";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        sort,
        order: "desc",
        ...(q ? { q } : {}),
        ...(status !== "All" ? { status } : {}),
        ...(destinationId !== "All" ? { destinationId } : {}),
        ...(city ? { city } : {}),
      });
      const data = await apiFetch<{ items: ProductRecord[]; total: number }>(`${apiPath}?${params}`);
      setItems(data.items);
      setTotal(data.total);
    } catch {
      toast({ title: "Failed to load products", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiPath, page, q, sort, status, destinationId, city, toast]);

  useEffect(() => {
    apiFetch<{ items: DestinationOption[] }>("/api/destinations?pageSize=100&status=Active")
      .then((data) => setDestinations(data.items))
      .catch(() => {
        toast({ title: "Could not load destinations for filter", variant: "destructive" });
      });
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (typeof window === "undefined" || loading) return;
    const productId = new URLSearchParams(window.location.search).get("productId");
    if (!productId) return;
    const found = items.find((i) => i.id === productId);
    if (found) {
      setEditing(found);
      setFormOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("productId");
      window.history.replaceState({}, "", url.toString());
    }
  }, [items, loading]);

  const handleDuplicate = async (id: string) => {
    try {
      await apiFetch(`${apiPath}/${id}/duplicate`, { method: "POST" });
      toast({ title: "Product duplicated" });
      load();
    } catch {
      toast({ title: "Duplicate failed", variant: "destructive" });
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await apiFetch(`${apiPath}/${id}/archive`, { method: "PATCH" });
      toast({ title: "Product archived" });
      load();
    } catch {
      toast({ title: "Archive failed", variant: "destructive" });
    }
  };

  const handleSubmitForApproval = async (id: string) => {
    try {
      await apiFetch(`${apiPath}/${id}/submit-for-approval`, { method: "POST" });
      toast({ title: "Submitted for approval", description: "Admin will review and approve/reject the rates" });
      load();
    } catch {
      toast({ title: "Submission failed", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`${apiPath}/${id}`, { method: "DELETE" });
      toast({ title: "Product deleted" });
      load();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const handleSubmit = async (payload: Record<string, unknown>) => {
    try {
      if (editing) {
        const res = await apiFetch<{ item: ProductRecord; message?: string; rateChangePending?: boolean }>(
          `${apiPath}/${editing.id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        toast({
          title: res.rateChangePending ? "Rates pending approval" : "Product updated",
          description: res.message || (res.rateChangePending
            ? "Admin must approve before new rates go live. Current live rates stay active."
            : undefined),
        });
      } else {
        const res = await apiFetch<{ item: ProductRecord; message?: string }>(apiPath, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({
          title: "Product created",
          description: res.message || "Saved as draft. Submit for admin approval before rates go live.",
        });
      }
      setEditing(null);
      load();
    } catch (e) {
      toast({ title: editing ? "Update failed" : "Create failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      throw e;
    }
  };

  const exportCsv = () => {
    const header = columns.map((c) => c.label).join(",");
    const rows = items.map((item) => columns.map((c) => `"${String(item[c.key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const templates: Record<ProductKind, string> = {
      hotels: [
        "destinationId,name,address,city,country,starCategory,currency,description,contactPerson,contactPhone,contactEmail,amenities,checkInTime,checkOutTime,roomName,priceSingle,priceDouble,priceExtraAdult,status",
        ",Ramada Encore,Bukit Bintang,Kuala Lumpur,Malaysia,3,USD,City hotel near shopping,,+60…,,WiFi|Pool,15:00,12:00,Deluxe Double / Twin,39,39,21,Draft",
      ].join("\n"),
      activities: [
        "destinationId,name,location,duration,startTime,closingTime,adultPrice,childPrice,currency,passengerInfo,inclusions,status",
        ",iFly Singapore,Singapore,1.5 hours,10:00,18:00,8500,6500,INR,Wear closed shoes · arrive 30 mins early,Gear|Instructor,Draft",
      ].join("\n"),
      transfers: "name,transferType,vehicleType,pickupLocation,dropLocation,privatePrice,sharedPrice,currency,status\nAirport Transfer,Private,Sedan,Airport,Hotel,2500,800,INR,Active",
    };
    const blob = new Blob([templates[kind]], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) {
        toast({ title: "CSV empty or invalid", variant: "destructive" });
        return;
      }
      const data = await apiFetch<{ imported: number; failed: number }>(`${apiPath}/import`, {
        method: "POST",
        body: JSON.stringify({ rows: rows.map((r) => rowToPayload(kind, r)) }),
      });
      toast({ title: `Imported ${data.imported} products`, description: data.failed ? `${data.failed} rows failed` : undefined });
      load();
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={embedded ? "flex flex-col gap-4 lg:gap-8" : "page-shell animate-slide-up"}>
      {!hideHeader && <PageHeader title={title} subtitle={subtitle} />}

      <CatalogStatGrid>
        <MetricCard
          variant="inline"
          icon={Package}
          label="Total Products"
          value={total.toLocaleString("en-IN")}
          color="bg-sky-100 text-primary dark:bg-sky-500/15 dark:text-sky-400"
          index={0}
        />
        <MetricCard
          variant="inline"
          icon={CheckCircle}
          label="Active"
          value={items.filter((i) => i.status === "Active").length.toLocaleString("en-IN")}
          color="bg-teal-100 text-brand-teal dark:bg-teal-500/15 dark:text-teal-400"
          subtitle="On this page"
          index={1}
        />
      </CatalogStatGrid>

      <Card>
        <CardContent className="p-4 md:p-5 space-y-4">
          <CatalogToolbar
            bordered={false}
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder="Search products..."
            filters={
              <>
                <Input className="h-9 w-[140px]" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={destinationId} onValueChange={(v) => { setDestinationId(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Destinations</SelectItem>
                    {destinations.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Sort" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Newest</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="updatedAt">Last Updated</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <>
                <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export</Button>
                <Button variant="outline" size="sm" className="h-9" onClick={downloadTemplate}><Download className="w-4 h-4 mr-1" />Template</Button>
                <Button variant="outline" size="sm" className="h-9" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" />Import</Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport(file);
                  }}
                />
                <Button size="sm" className="h-9" onClick={() => { setEditing(null); setFormOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />Add
                </Button>
              </>
            }
          />

          <div className="rounded-lg border overflow-x-auto max-h-[70vh]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                  <TableHead>Status</TableHead>
                  <TableHead>Rate Approval</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={columns.length + 3} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={columns.length + 3} className="text-center py-8 text-muted-foreground">No products found</TableCell></TableRow>
                ) : items.map((item) => (
                  <TableRow key={item.id}>
                    {columns.map((c) => (
                      <TableCell key={c.key}>{c.render ? c.render(item) : String(item[c.key] ?? "—")}</TableCell>
                    ))}
                    <TableCell><StatusBadge status={item.status} /></TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <ApprovalStatusBadge item={item} />
                        {!!item.pendingRateChanges && (
                          <p className="text-[10px] text-amber-600">New rates awaiting approval</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(item.approvalStatus === "Draft" || item.approvalStatus === "Rejected") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-blue-600"
                            onClick={() => handleSubmitForApproval(item.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Submit Rates
                          </Button>
                        )}
                        {role !== "travel_agent" && (
                          <Button variant="ghost" size="icon" onClick={() => setRatesFor(item)} title="Contracted rates"><IndianRupee className="w-4 h-4" /></Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(mergePendingRates(item)); setFormOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDuplicate(item.id)}><Copy className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleArchive(item.id)}><Archive className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} total products</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span>Page {page}</span>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {ratesFor && role !== "travel_agent" && (
        <ContractedRatesDialog
          open={Boolean(ratesFor)}
          onOpenChange={(open) => { if (!open) setRatesFor(null); }}
          productType={rateType}
          productId={ratesFor.id}
          productName={ratesFor.name}
        />
      )}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}
        kind={kind}
        initial={editing}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
