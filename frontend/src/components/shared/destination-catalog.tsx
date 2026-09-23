"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus, Copy, Archive, Trash2, Pencil, Download, Upload,
  MapPin, CheckCircle, Globe,
} from "lucide-react";
import { PageShell, MetricCard, CatalogStatGrid, StatusBadge } from "@/components/shared/ui-helpers";
import {
  CatalogToolbar, EnterprisePageHeader,
} from "@/components/shared/enterprise";
import { DestinationFormDialog } from "@/components/shared/destination-form-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, ApiError } from "@/lib/api";
import { hasCrudPermission } from "@/lib/permissions";
import { useAuthStore } from "@/store/app-store";
import type { DestinationRecord } from "@/types";

interface DestinationCatalogProps {
  onSelect: (id: string) => void;
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

function rowToPayload(row: Record<string, string>): Record<string, unknown> {
  const split = (v: string) => v.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  return {
    name: row.name || row["Destination Name"] || "",
    country: row.country || row.Country || "India",
    region: row.region || row.Region || null,
    city: row.city || row.City || null,
    slug: row.slug || null,
    currency: row.currency || row.Currency || "INR",
    language: row.language || row.Language || null,
    bestTimeToVisit: row.bestTimeToVisit || row["Best Season"] || row["Best Time To Visit"] || null,
    shortDescription: row.shortDescription || null,
    status: row.status || row.Status || "Draft",
    popularAttractions: split(row.popularAttractions || ""),
    keywords: split(row.keywords || ""),
  };
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function DestinationThumb({ item }: { item: DestinationRecord }) {
  const src = item.thumbnail || item.heroImage;
  if (!src) {
    return (
      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
        <Globe className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="w-10 h-10 rounded-md object-cover border" />
  );
}

export function DestinationCatalog({ onSelect }: DestinationCatalogProps) {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<DestinationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [country, setCountry] = useState("All");
  const [region, setRegion] = useState("All");
  const [sort, setSort] = useState("createdAt");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DestinationRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [countries, setCountries] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const canAdd = user ? hasCrudPermission(user, "destinations", "add") : false;
  const canEdit = user ? hasCrudPermission(user, "destinations", "edit") : false;
  const canDelete = user ? hasCrudPermission(user, "destinations", "delete") : false;
  const canExport = user ? hasCrudPermission(user, "destinations", "view") : false;

  const loadFilters = useCallback(async () => {
    try {
      const data = await apiFetch<{ countries: string[]; regions: string[] }>("/api/destinations/filters");
      setCountries(data.countries);
      setRegions(data.regions);
    } catch {
      toast({ title: "Could not load destination filters", variant: "destructive" });
    }
  }, [toast]);

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
        ...(country !== "All" ? { country } : {}),
        ...(region !== "All" ? { region } : {}),
      });
      const data = await apiFetch<{ items: DestinationRecord[]; total: number }>(`/api/destinations?${params}`);
      setItems(data.items);
      setTotal(data.total);
      setSelected(new Set());
    } catch {
      toast({ title: "Failed to load destinations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, q, sort, status, country, region, toast]);

  useEffect(() => { loadFilters(); }, [loadFilters]);
  useEffect(() => { load(); }, [load]);

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(items.map((i) => i.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleDuplicate = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await apiFetch(`/api/destinations/${id}/duplicate`, { method: "POST" });
      toast({ title: "Destination duplicated" });
      load();
    } catch {
      toast({ title: "Duplicate failed", variant: "destructive" });
    }
  };

  const handleArchive = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await apiFetch(`/api/destinations/${id}/archive`, { method: "PATCH" });
      toast({ title: "Destination archived" });
      load();
    } catch {
      toast({ title: "Archive failed", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/destinations/${id}`, { method: "DELETE" });
      toast({ title: "Destination deleted" });
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast({
        title: e instanceof ApiError && e.status === 409 ? "Cannot delete destination" : "Delete failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    try {
      await apiFetch<{ deleted: number }>("/api/destinations/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: [...selected] }),
      });
      toast({ title: `Deleted ${selected.size} destinations` });
      setBulkDeleteOpen(false);
      load();
    } catch (e) {
      toast({
        title: e instanceof ApiError && e.status === 409 ? "Cannot delete destination" : "Bulk delete failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleBulkStatus = async (newStatus: string) => {
    try {
      const data = await apiFetch<{ updated: number }>("/api/destinations/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ ids: [...selected], status: newStatus }),
      });
      toast({ title: `Updated ${data.updated} destinations to ${newStatus}` });
      load();
    } catch {
      toast({ title: "Bulk status update failed", variant: "destructive" });
    }
  };

  const handleSubmit = async (payload: Record<string, unknown>) => {
    try {
      if (editing) {
        await apiFetch(`/api/destinations/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Destination updated" });
      } else {
        await apiFetch("/api/destinations", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Destination created" });
      }
      setEditing(null);
      loadFilters();
      load();
    } catch (e) {
      toast({ title: editing ? "Update failed" : "Create failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      throw e;
    }
  };

  const exportCsv = () => {
    const header = "Destination Name,Country,Region,Currency,Language,Best Season,Status,Created By,Last Updated";
    const rows = items.map((item) => [
      item.name,
      item.country ?? "",
      item.region ?? "",
      item.currency ?? "",
      item.language ?? "",
      item.bestTimeToVisit ?? "",
      item.status ?? "",
      item.createdByName ?? "",
      formatDate(item.updatedAt),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "destinations.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const template = "name,country,region,city,currency,language,bestTimeToVisit,status,shortDescription\nGoa,India,Goa,Goa City,INR,English,Oct-Mar,Active,Beach paradise destination";
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "destinations-import-template.csv";
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
      const data = await apiFetch<{ imported: number; failed: number }>("/api/destinations/import", {
        method: "POST",
        body: JSON.stringify({ rows: rows.map(rowToPayload) }),
      });
      toast({ title: `Imported ${data.imported} destinations`, description: data.failed ? `${data.failed} rows failed` : undefined });
      loadFilters();
      load();
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <PageShell>
      <EnterprisePageHeader
        title="Destinations"
        subtitle="Master list for hotels, tours, transfers and packages."
        breadcrumbs={[{ label: "Products" }, { label: "Destinations" }]}
        actions={
          canAdd ? (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" />Add Destination
            </Button>
          ) : undefined
        }
      />

      <CatalogStatGrid>
        <MetricCard
          variant="inline"
          icon={MapPin}
          label="Total Destinations"
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
            onSearchChange={(v) => { setQ(v); setPage(1); }}
            searchPlaceholder="Search destinations..."
            filters={
              <>
                <Select value={country} onValueChange={(v) => { setCountry(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[140px]" aria-label="Filter by country"><SelectValue placeholder="Country" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Countries</SelectItem>
                    {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={region} onValueChange={(v) => { setRegion(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[140px]" aria-label="Filter by region"><SelectValue placeholder="Region" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Regions</SelectItem>
                    {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[140px]" aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="h-9 w-[150px]" aria-label="Sort destinations"><SelectValue placeholder="Sort" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Newest</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="country">Country</SelectItem>
                    <SelectItem value="updatedAt">Last Updated</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <div className="flex gap-2 flex-wrap">
                {canExport && <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export</Button>}
                {canAdd && (
                  <>
                    <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="w-4 h-4 mr-1" />Template</Button>
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" />Import</Button>
                    <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }} />
                  </>
                )}
              </div>
            }
            bordered={false}
          />

          {selected.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-muted/50 border">
              <span className="text-sm font-medium">{selected.size} selected</span>
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" onClick={() => handleBulkStatus("Active")}>Set Active</Button>
                  <Button variant="outline" size="sm" onClick={() => handleBulkStatus("Archived")}>Archive</Button>
                </>
              )}
              {canDelete && (
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="w-4 h-4 mr-1" />Delete
                </Button>
              )}
            </div>
          )}

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>Destination Name</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Best Season</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 12 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium">No destinations found</p>
                      <p className="text-xs mt-1">Create your first destination or adjust filters.</p>
                    </TableCell>
                  </TableRow>
                ) : items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelect(item.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={(v) => toggleOne(item.id, v === true)}
                        aria-label={`Select ${item.name}`}
                      />
                    </TableCell>
                    <TableCell><DestinationThumb item={item} /></TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.country ?? "—"}</TableCell>
                    <TableCell>{item.region ?? "—"}</TableCell>
                    <TableCell>{item.currency ?? "—"}</TableCell>
                    <TableCell>{item.language ?? "—"}</TableCell>
                    <TableCell>{item.bestTimeToVisit ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={item.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.createdByName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(item.updatedAt)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(item); setFormOpen(true); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {canAdd && (
                          <Button variant="ghost" size="icon" onClick={(e) => handleDuplicate(item.id, e)}>
                            <Copy className="w-4 h-4" />
                          </Button>
                        )}
                        {canEdit && item.status !== "Archived" && (
                          <Button variant="ghost" size="icon" onClick={(e) => handleArchive(item.id, e)}>
                            <Archive className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(item.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} total destinations</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span>Page {page}</span>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DestinationFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}
        initial={editing}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete destination?</AlertDialogTitle>
            <AlertDialogDescription>This will soft-delete the selected destination.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleDelete(deleteTarget)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} destinations?</AlertDialogTitle>
            <AlertDialogDescription>This will soft-delete all selected destinations.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
