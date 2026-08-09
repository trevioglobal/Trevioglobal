"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Plus, Target, TrendingUp, Users, Wallet, Phone, Mail, Calendar,
  GripVertical, MessageCircle, Globe, Facebook, Instagram,
  UserPlus, Footprints,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useDemoDataStore } from "@/store/demo-data-store";
import type { Lead } from "@/types";
import {
  formatINR, formatFullINR, StatusBadge, PageHeader, PageShell, MetricCard, initials, avatarGradient,
} from "@/components/shared/ui-helpers";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STAGES: Lead["stage"][] = [
  "New", "Qualified", "Follow-up", "Quotation Sent", "Negotiation", "Won", "Lost",
];

const STAGE_ACCENTS: Record<string, string> = {
  New: "from-sky-500/15 to-sky-500/5 border-sky-500/30",
  Qualified: "from-cyan-500/15 to-cyan-500/5 border-cyan-500/30",
  "Follow-up": "from-amber-500/15 to-amber-500/5 border-amber-500/30",
  "Quotation Sent": "from-violet-500/15 to-violet-500/5 border-violet-500/30",
  Negotiation: "from-orange-500/15 to-orange-500/5 border-orange-500/30",
  Won: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/30",
  Lost: "from-rose-500/15 to-rose-500/5 border-rose-500/30",
};

const SOURCE_ICON: Record<string, React.ElementType> = {
  Website: Globe, WhatsApp: MessageCircle, Phone: Phone, "Walk-in": Footprints,
  Facebook: Facebook, Instagram: Instagram, "Google Ads": Target, Referral: UserPlus,
};

const SERVICE_COLORS: Record<string, string> = {
  Flight: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  Hotel: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Holiday: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

function LeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  const SourceIcon = SOURCE_ICON[lead.source] || Globe;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group bg-card border border-border rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-all select-none",
        isDragging && "opacity-30"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="w-7 h-7">
            <AvatarFallback className={cn("text-[10px] font-semibold text-white bg-gradient-to-br", avatarGradient(lead.customerName))}>
              {initials(lead.customerName)}
            </AvatarFallback>
          </Avatar>
          <p className="font-medium text-sm truncate">{lead.customerName}</p>
        </div>
        <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5", SERVICE_COLORS[lead.service])}>
          {lead.service}
        </Badge>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <SourceIcon className="w-3 h-3" /> {lead.source}
        </span>
      </div>
      <p className="text-base font-bold text-foreground">{formatINR(lead.value)}</p>
      <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" /> {lead.assignedTo.split(" ")[0]}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {new Date(lead.expectedClose).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({ stage, leads }: { stage: Lead["stage"]; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const totalValue = leads.reduce((s, l) => s + l.value, 0);
  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className={cn("rounded-t-xl border-b-2 bg-gradient-to-br px-3 py-2.5", STAGE_ACCENTS[stage])}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusBadge status={stage} />
            <span className="text-xs font-medium text-muted-foreground">{leads.length}</span>
          </div>
          <span className="text-[11px] font-semibold text-foreground/70">{formatINR(totalValue)}</span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-b-xl bg-muted/30 border border-border/60 border-t-0 p-2 space-y-2 min-h-[200px] transition-colors",
          isOver && "bg-primary/5 border-primary/40"
        )}
      >
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
        {leads.length === 0 && (
          <div className="text-[11px] text-muted-foreground/60 text-center py-8 border-2 border-dashed border-border/50 rounded-lg">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}

function NewLeadDialog() {
  const { toast } = useToast();
  const addLead = useDemoDataStore((s) => s.addLead);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerName: "", email: "", phone: "", source: "Website",
    service: "Holiday", value: "", assignedTo: "Sneha Reddy", expectedClose: "",
  });

  function handleSubmit() {
    if (!form.customerName || !form.value) {
      toast({ title: "Missing fields", description: "Please enter customer name and value", variant: "destructive" });
      return;
    }
    addLead({
      customerName: form.customerName,
      email: form.email,
      phone: form.phone,
      source: form.source as Lead["source"],
      service: form.service as Lead["service"],
      value: Number(form.value),
      assignedTo: form.assignedTo,
      expectedClose: form.expectedClose || new Date().toISOString().slice(0, 10),
      notes: "",
    });
    toast({
      title: "Lead created",
      description: `${form.customerName} added to New stage (₹${Number(form.value).toLocaleString("en-IN")})`,
    });
    setOpen(false);
    setForm({ customerName: "", email: "", phone: "", source: "Website", service: "Holiday", value: "", assignedTo: "Sneha Reddy", expectedClose: "" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-1" /> New Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Lead</DialogTitle>
          <DialogDescription>Add a new enquiry to your sales pipeline.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 max-h-[60vh] overflow-y-auto scroll-thin pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="nl-name">Customer Name</Label>
              <Input id="nl-name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="e.g. Ramesh Kumar" />
            </div>
            <div>
              <Label htmlFor="nl-email">Email</Label>
              <Input id="nl-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ramesh@email.com" />
            </div>
            <div>
              <Label htmlFor="nl-phone">Phone</Label>
              <Input id="nl-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98000 00000" />
            </div>
            <div>
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Website", "WhatsApp", "Phone", "Walk-in", "Facebook", "Instagram", "Google Ads", "Referral"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service</Label>
              <Select value={form.service} onValueChange={(v) => setForm({ ...form, service: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Flight", "Hotel", "Holiday"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="nl-value">Value (₹)</Label>
              <Input id="nl-value" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="50000" />
            </div>
            <div>
              <Label>Assign To</Label>
              <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Sneha Reddy", "Rahul Khanna", "Deepa Rao", "Aisha Khan", "Priya Nair"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="nl-close">Expected Close Date</Label>
              <Input id="nl-close" type="date" value={form.expectedClose} onChange={(e) => setForm({ ...form, expectedClose: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90">Create Lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadsPipeline() {
  const { toast } = useToast();
  const leads = useDemoDataStore((s) => s.leads);
  const updateLeadStage = useDemoDataStore((s) => s.updateLeadStage);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const columns = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    STAGES.forEach((s) => (map[s] = []));
    leads.forEach((l) => map[l.stage]?.push(l));
    return map;
  }, [leads]);

  const totalLeads = leads.length;
  const totalValue = leads.reduce((s, l) => s + l.value, 0);
  const wonLeads = leads.filter((l) => l.stage === "Won").length;
  const closedLeads = leads.filter((l) => l.stage === "Won" || l.stage === "Lost").length;
  const conversionRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : 0;

  function handleDragStart(e: DragStartEvent) {
    const lead = leads.find((l) => l.id === e.active.id);
    setActiveLead(lead || null);
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = e;
    if (!over) return;
    const targetStage = over.id as Lead["stage"];
    if (!STAGES.includes(targetStage)) return;
    const lead = leads.find((l) => l.id === active.id);
    if (!lead || lead.stage === targetStage) return;
    updateLeadStage(lead.id, targetStage);
    toast({
      title: "Lead moved",
      description: `${lead.customerName} → ${targetStage}`,
    });
  }

  const stats = [
    { icon: Users, label: "Total Leads", value: String(totalLeads), color: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400" },
    { icon: Wallet, label: "Pipeline Value", value: formatINR(totalValue), color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
    { icon: Target, label: "Won This Month", value: String(wonLeads), color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
    { icon: TrendingUp, label: "Conversion Rate", value: `${conversionRate}%`, color: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, i) => <MetricCard key={s.label} {...s} index={i} />)}
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto scroll-thin pb-2">
          <div className="flex gap-3 min-w-max">
            {STAGES.map((stage) => (
              <KanbanColumn key={stage} stage={stage} leads={columns[stage]} />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeLead ? (
            <div className="w-72 rotate-3 opacity-90">
              <LeadCard lead={activeLead} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <GripVertical className="w-3 h-3" /> Drag lead cards between columns to update stages.
      </p>
    </div>
  );
}

function EnquiriesTab() {
  const leads = useDemoDataStore((s) => s.leads);
  const sourceMap = new Map<string, number>();
  for (const lead of leads) {
    const src = lead.source || "Other";
    sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
  }
  const ENQUIRY_SOURCE_DATA = Array.from(sourceMap.entries()).map(([source, count]) => ({ source, count }));
  const total = ENQUIRY_SOURCE_DATA.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...ENQUIRY_SOURCE_DATA.map((d) => d.count), 1);
  const colors = ["#0d9488", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4", "#10b981", "#f97316", "#ec4899"];

  if (!ENQUIRY_SOURCE_DATA.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No leads yet — enquiry source chart fills from live CRM leads.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Enquiries by Source</CardTitle>
          <CardDescription>Total {total} enquiries from live leads</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              {ENQUIRY_SOURCE_DATA.map((d, i) => {
                const pct = (d.count / total) * 100;
                const Icon = SOURCE_ICON[d.source] || Globe;
                return (
                  <div key={d.source}>
                    <div className="flex items-center justify-between mb-1 text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {d.source}
                      </span>
                      <span className="text-muted-foreground">{d.count} <span className="text-muted-foreground/60">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(d.count / maxCount) * 100}%`, background: colors[i % colors.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ENQUIRY_SOURCE_DATA} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted/40" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {ENQUIRY_SOURCE_DATA.map((_, i) => (
                      <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Enquiries</CardTitle>
          <CardDescription>{leads.length} enquiries from all sources</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto scroll-thin">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l) => {
                  const Icon = SOURCE_ICON[l.source] || Globe;
                  return (
                    <TableRow key={l.id} className="hover:bg-muted/40">
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-xs font-medium">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {l.source}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn("text-[10px]", SERVICE_COLORS[l.service])}>{l.service}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className={cn("text-[9px] font-semibold text-white bg-gradient-to-br", avatarGradient(l.customerName))}>
                              {initials(l.customerName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{l.customerName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{l.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">{formatFullINR(l.value)}</TableCell>
                      <TableCell><StatusBadge status={l.stage} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(l.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function CrmView() {
  return (
    <PageShell>
      <PageHeader
        title="CRM & Sales"
        subtitle="Manage leads, track your pipeline, and convert enquiries into bookings."
        action={<NewLeadDialog />}
      />
      <Tabs defaultValue="pipeline">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="pipeline">Leads Pipeline</TabsTrigger>
          <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline" className="mt-4">
          <LeadsPipeline />
        </TabsContent>
        <TabsContent value="enquiries" className="mt-4">
          <EnquiriesTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
