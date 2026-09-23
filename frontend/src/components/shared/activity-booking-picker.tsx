"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar, Car, ChevronDown, ChevronUp, Clock, Info, MapPin, Pencil, Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { todayYmd } from "@/lib/travel-dates";
import { formatProductPrice } from "@/lib/currency";
import type { ProductRecord } from "@/types";

const TICKET_ONLY = "__ticket_only__";

type TransferOption = { transferProductId: string; label: string };
type TransferProduct = ProductRecord & {
  privatePrice?: number;
  sharedAdultPrice?: number;
  sharedPrice?: number;
  name: string;
};

type ActivityWithTransfers = ProductRecord & {
  adultPrice?: number;
  childPrice?: number;
  duration?: string;
  location?: string;
  images?: string[];
  transferOptions?: TransferOption[];
};

type CartLine = {
  activityId: string;
  activityName: string;
  transferLabel: string;
  total: number;
};

function formatMoney(amount: number, currency?: string | null) {
  return formatProductPrice(amount, currency);
}

function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && images.length > 0) return String(images[0]);
  return null;
}

function transferPrice(t: TransferProduct): number {
  return Number(t.privatePrice ?? t.sharedAdultPrice ?? t.sharedPrice ?? 0);
}

export function ActivityBookingPicker() {
  const { toast } = useToast();
  const [activities, setActivities] = useState<ActivityWithTransfers[]>([]);
  const [transfers, setTransfers] = useState<TransferProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [adults, setAdults] = useState<Record<string, number>>({});
  const [children, setChildren] = useState<Record<string, number>>({});
  const [transferChoice, setTransferChoice] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: ActivityWithTransfers[] }>("/api/products/activities?liveOnly=true&pageSize=50"),
      apiFetch<{ items: TransferProduct[] }>("/api/products/transfers?liveOnly=true&pageSize=100"),
    ])
      .then(([a, t]) => {
        setActivities(a.items || []);
        setTransfers(t.items || []);
      })
      .catch(() => {
        setActivities([]);
        setTransfers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const transferMap = useMemo(() => new Map(transfers.map((t) => [t.id, t])), [transfers]);

  function optionsForActivity(activity: ActivityWithTransfers) {
    return (Array.isArray(activity.transferOptions) ? activity.transferOptions : [])
      .map((o) => {
        const tp = transferMap.get(o.transferProductId);
        if (!tp) return null;
        return {
          id: o.transferProductId,
          label: o.label || `+ ${tp.name}`,
          price: transferPrice(tp),
        };
      })
      .filter(Boolean) as { id: string; label: string; price: number }[];
  }

  function calcTotal(activity: ActivityWithTransfers): number {
    const a = adults[activity.id] ?? 2;
    const c = children[activity.id] ?? 0;
    const adultRate = Number(activity.adultPrice ?? 0);
    const childRate = Number(activity.childPrice ?? 0);
    let total = a * adultRate + c * childRate;
    const choice = transferChoice[activity.id] ?? TICKET_ONLY;
    if (choice !== TICKET_ONLY) {
      const opt = optionsForActivity(activity).find((o) => o.id === choice);
      if (opt) total += opt.price;
    }
    return total;
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    setSelected((s) => ({ ...s, [id]: true }));
    setDates((d) => ({ ...d, [id]: d[id] || new Date().toISOString().slice(0, 10) }));
    setAdults((a) => ({ ...a, [id]: a[id] ?? 2 }));
    setChildren((c) => ({ ...c, [id]: c[id] ?? 0 }));
    setTransferChoice((t) => ({ ...t, [id]: t[id] ?? TICKET_ONLY }));
  }

  function addToPackage(activity: ActivityWithTransfers) {
    const choice = transferChoice[activity.id] ?? TICKET_ONLY;
    const transferOpt = optionsForActivity(activity).find((o) => o.id === choice);
    const currency = String(activity.currency || "INR");
    const line: CartLine = {
      activityId: activity.id,
      activityName: activity.name,
      transferLabel: choice === TICKET_ONLY ? "Ticket Only" : (transferOpt?.label ?? "With Transfer"),
      total: calcTotal(activity),
    };
    setCart((prev) => [...prev, line]);
    toast({
      title: "Added to package",
      description: `${activity.name} · ${line.transferLabel} · ${formatMoney(line.total, currency)}`,
    });
  }

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Loading activities...</CardContent></Card>;
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No approved activities yet. Product team can publish activities and link optional transfers.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Book Activities</h3>
          <p className="text-sm text-muted-foreground">
            Agents pick ticket only or add a bundled transfer on the same activity — no separate transfer booking step.
          </p>
        </div>
        {cart.length > 0 && (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Ticket className="w-3.5 h-3.5 mr-1 inline" />
            {cart.length} in package · {formatMoney(cart.reduce((s, l) => s + l.total, 0))}
          </Badge>
        )}
      </div>

      <div className="space-y-4">
        {activities.map((activity) => {
          const expanded = expandedId === activity.id;
          const img = firstImage(activity.images) || activity.destination?.thumbnail || activity.destination?.heroImage;
          const linked = optionsForActivity(activity);
          const total = calcTotal(activity);
          const currency = String(activity.currency || "INR");

          return (
            <Card key={activity.id} className="overflow-hidden border-border/80 shadow-sm">
              <div className="flex flex-col sm:flex-row gap-4 p-4">
                <div className="w-full sm:w-36 h-28 rounded-lg bg-muted overflow-hidden shrink-0">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No image</div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-base">{activity.name}</h4>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Tour</Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{activity.location || activity.destination?.name || "—"}</span>
                    {activity.duration && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{activity.duration}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end justify-between gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wide">From</p>
                    <p className="text-lg font-bold text-primary">{formatMoney(Number(activity.adultPrice ?? 0), currency)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      <Info className="w-3.5 h-3.5 mr-1" />Details
                    </Button>
                    <Button size="sm" className="h-8 text-xs" onClick={() => toggleExpand(activity.id)}>
                      {expanded ? <><ChevronUp className="w-3.5 h-3.5 mr-1" />Hide Options</> : <><ChevronDown className="w-3.5 h-3.5 mr-1" />Select Options</>}
                    </Button>
                  </div>
                </div>
              </div>

              {expanded && (
                <div className="border-t bg-muted/30 px-4 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Checkbox checked={selected[activity.id] ?? true} onCheckedChange={(v) => setSelected((s) => ({ ...s, [activity.id]: !!v }))} />
                      {activity.name}
                    </label>
                    <p className="text-sm font-semibold">TOTAL {formatMoney(total, currency)}</p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900 p-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Pencil className="w-3 h-3" />Guests</Label>
                      <div className="flex gap-2">
                        <Input type="number" min={1} className="h-9 bg-white dark:bg-background" value={adults[activity.id] ?? 2} onChange={(e) => setAdults((a) => ({ ...a, [activity.id]: parseInt(e.target.value, 10) || 1 }))} aria-label="Adults" />
                        <Input type="number" min={0} className="h-9 bg-white dark:bg-background" placeholder="Children" value={children[activity.id] ?? 0} onChange={(e) => setChildren((c) => ({ ...c, [activity.id]: parseInt(e.target.value, 10) || 0 }))} aria-label="Children" />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{(adults[activity.id] ?? 2)}A{(children[activity.id] ?? 0) > 0 ? ` · ${children[activity.id]}C` : ""}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" />Date</Label>
                      <Input type="date" className="h-9 bg-white dark:bg-background" value={dates[activity.id] || ""} min={todayYmd()} onChange={(e) => setDates((d) => ({ ...d, [activity.id]: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Car className="w-3 h-3" />Transfer (optional)</Label>
                      <Select value={transferChoice[activity.id] ?? TICKET_ONLY} onValueChange={(v) => setTransferChoice((t) => ({ ...t, [activity.id]: v }))}>
                        <SelectTrigger className="h-9 bg-white dark:bg-background"><SelectValue placeholder="Ticket Only" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TICKET_ONLY}>Ticket Only</SelectItem>
                          {linked.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label} (+{formatMoney(opt.price, currency)})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                    <Button variant="outline" size="sm">Details</Button>
                    <div className="flex items-center gap-3 justify-end">
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground text-xs">Selected</p>
                        <p className="font-semibold">{formatMoney(total, currency)}</p>
                      </div>
                      <Button className="bg-primary hover:bg-primary/90 min-w-[160px]" disabled={!(selected[activity.id] ?? true)} onClick={() => addToPackage(activity)}>
                        Add to Package →
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
