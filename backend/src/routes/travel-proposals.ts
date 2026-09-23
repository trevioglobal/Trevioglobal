import type { Express, Response } from "express";
import type { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAuth, requireCrudPermission } from "../middleware/auth.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import {
  validate,
  travelProposalSchema,
  travelProposalUpdateSchema,
  travelProposalStatusSchema,
  travelProposalFromRequirementSchema,
} from "../lib/validation.js";
import {
  applySnapshotEdits,
  buildProposalSnapshot,
  type ProposalSnapshotData,
} from "../lib/proposal-snapshot.js";
import { compareSnapshots, snapshotToPreviewData } from "../lib/proposal-preview.js";
import { defaultGroupsFromOptions } from "../lib/package-matching.js";
import { travelDatesBlockReason } from "../lib/travel-dates.js";
import {
  buildEmptyItinerarySnapshot,
  computeEndDate,
  normalizeDays,
  recomputeItineraryPricing,
  type ItineraryCity,
  type ItineraryDay,
  type ItineraryTripMeta,
} from "../lib/proposal-itinerary.js";
import { sendHtmlEmail } from "../lib/email.js";

type ScopeFn = (req: AuthRequest) => Record<string, unknown>;

const PROPOSAL_STATUSES = [
  "Draft", "Internal Review", "Approved", "Sent", "Viewed", "Accepted", "Booked",
  "Rejected", "Expired", "Cancelled",
] as const;

const STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ["Internal Review", "Cancelled"],
  "Internal Review": ["Approved", "Draft", "Cancelled"],
  Approved: ["Sent", "Internal Review", "Cancelled"],
  Sent: ["Viewed", "Expired", "Cancelled"],
  Viewed: ["Accepted", "Rejected", "Expired", "Cancelled"],
  Accepted: ["Booked", "Cancelled"],
  Booked: [],
  Rejected: ["Draft"],
  Expired: ["Draft"],
  Cancelled: ["Draft"],
};

const PROPOSAL_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  lead: { select: { id: true, customerName: true, email: true, phone: true } },
  travelRequirement: {
    select: {
      id: true, requirementCode: true, destinationId: true,
      travelStartDate: true, travelEndDate: true, adults: true, children: true,
    },
  },
  snapshots: { orderBy: { versionNumber: "desc" as const }, take: 1 },
  history: { orderBy: { createdAt: "desc" as const }, take: 50 },
};

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

async function nextProposalNumber(agencyId: string | null | undefined): Promise<string> {
  const count = await db.travelProposal.count({ where: { agencyId: agencyId ?? null } });
  return `PROP-${String(count + 1).padStart(4, "0")}`;
}

async function addHistory(
  proposalId: string,
  action: string,
  req: AuthRequest,
  opts?: { summary?: string; fromStatus?: string; toStatus?: string; versionNumber?: number }
) {
  await db.proposalHistory.create({
    data: {
      proposalId,
      action,
      summary: opts?.summary,
      fromStatus: opts?.fromStatus,
      toStatus: opts?.toStatus,
      versionNumber: opts?.versionNumber,
      createdByName: req.auth?.email,
    },
  });
}

async function getCurrentSnapshot(proposalId: string): Promise<ProposalSnapshotData | null> {
  const row = await db.proposalSnapshot.findFirst({
    where: { proposalId },
    orderBy: { versionNumber: "desc" },
  });
  return row ? (row.snapshot as ProposalSnapshotData) : null;
}

async function saveSnapshotVersion(
  proposalId: string,
  versionNumber: number,
  snapshot: ProposalSnapshotData,
  req: AuthRequest,
  changeSummary?: string
) {
  await db.proposalSnapshot.create({
    data: {
      proposalId,
      versionNumber,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      changeSummary: changeSummary ?? `Version ${versionNumber}`,
      createdByName: req.auth?.email,
    },
  });
}

function validateSend(snapshot: ProposalSnapshotData | null, proposal: {
  customerId: string | null;
  leadId: string | null;
  selectedPackageId: string | null;
  selectedTemplateId: string | null;
  builderMode?: string | null;
}): string | null {
  if (!proposal.customerId && !proposal.leadId && !snapshot?.customer && !snapshot?.lead) {
    return "Customer is required before sending";
  }
  const isDay = proposal.builderMode === "day_itinerary" || snapshot?.builderMode === "day_itinerary";
  if (!isDay) {
    if (!proposal.selectedPackageId && !snapshot?.package) return "Package is required before sending";
    if (!proposal.selectedTemplateId && !snapshot?.template) return "Template is required before sending";
  } else if (!(snapshot?.days && Array.isArray(snapshot.days) && snapshot.days.length > 0)) {
    return "Itinerary days are required before sending";
  }
  if (!snapshot?.pricing?.total || snapshot.pricing.total <= 0) return "Valid pricing is required before sending";
  return null;
}

export function mountTravelProposalRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/travel-proposals";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proposalShare = (db as any).proposalShare;

  app.get(base, requireAuth, requireCrudPermission("travel-proposals", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      const status = req.query.status as string | undefined;
      const q = (req.query.q as string)?.trim();
      const requirementId = req.query.requirementId as string | undefined;
      const builderMode = req.query.builderMode as string | undefined;
      const where: Prisma.TravelProposalWhereInput = { ...agencyScope(req), deletedAt: null };
      if (status && status !== "All") where.proposalStatus = status;
      if (requirementId) where.travelRequirementId = requirementId;
      if (builderMode && builderMode !== "All") {
        /* filtered after enrich — do not put unknown field on Prisma where */
      }
      if (q) {
        where.OR = [
          { proposalNumber: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
          { lead: { customerName: { contains: q, mode: "insensitive" } } },
        ];
      }
      const skip = (page - 1) * pageSize;
      const [itemsRaw, total] = await Promise.all([
        db.travelProposal.findMany({
          where,
          include: {
            customer: { select: { id: true, name: true } },
            lead: { select: { id: true, customerName: true } },
            travelRequirement: { select: { id: true, requirementCode: true } },
          },
          orderBy: { updatedAt: "desc" },
          skip,
          take: pageSize,
        }),
        db.travelProposal.count({ where }),
      ]);
      let items = itemsRaw as Array<Record<string, unknown>>;
      if (items.length) {
        try {
          const ids = items.map((i) => String(i.id));
          const metaRows = await db.$queryRawUnsafe<Array<{ id: string; builderMode: string; tripMeta: unknown }>>(
            `SELECT id, "builderMode", "tripMeta" FROM "TravelProposal" WHERE id = ANY($1::text[])`,
            ids
          );
          const byId = new Map(metaRows.map((r) => [r.id, r]));
          items = items.map((i) => {
            const m = byId.get(String(i.id));
            return m ? { ...i, builderMode: m.builderMode, tripMeta: m.tripMeta } : { ...i, builderMode: "package" };
          });
          if (builderMode && builderMode !== "All") {
            items = items.filter((i) => i.builderMode === builderMode);
          }
        } catch {
          /* columns may not be visible until migrate */
        }
      }
      res.json({ items, total, page, pageSize });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id`, requireAuth, requireCrudPermission("travel-proposals", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const item = await db.travelProposal.findFirst({
        where: { id: paramId(req), ...agencyScope(req), deletedAt: null },
        include: PROPOSAL_INCLUDE,
      });
      if (!item) { res.status(404).json({ error: "Not found" }); return; }
      const snapshot = await getCurrentSnapshot(item.id);
      try {
        const metaRows = await db.$queryRawUnsafe<Array<{ builderMode: string; tripMeta: unknown }>>(
          `SELECT "builderMode", "tripMeta" FROM "TravelProposal" WHERE id = $1`,
          item.id
        );
        if (metaRows[0]) {
          Object.assign(item, { builderMode: metaRows[0].builderMode, tripMeta: metaRows[0].tripMeta });
        }
      } catch {
        Object.assign(item, { builderMode: snapshot?.builderMode === "day_itinerary" ? "day_itinerary" : "package" });
      }
      res.json({ item, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/from-requirement/:requirementId`, requireAuth, requireCrudPermission("travel-proposals", "add"), validate(travelProposalFromRequirementSchema), async (req: AuthRequest, res: Response) => {
    try {
      const requirementId = paramId(req);
      const body = req.body as Record<string, unknown>;
      const requirement = await db.travelRequirement.findFirst({
        where: { id: requirementId, ...agencyScope(req), deletedAt: null },
        include: {
          destination: { select: { id: true, name: true, country: true, thumbnail: true, heroImage: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          lead: { select: { id: true, customerName: true, email: true, phone: true } },
          selections: { where: { isSelected: true } },
        },
      });
      if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

      const packageId = (body.selectedPackageId as string) || requirement.selectedPackageId;
      if (!packageId) { res.status(400).json({ error: "No package selected on requirement" }); return; }

      const selection = requirement.selections[0];
      const options = await db.packageProductOption.findMany({ where: { packageId, status: "Active" } });
      const defaultGroups = defaultGroupsFromOptions(options);

      const snapshot = await buildProposalSnapshot({
        packageId,
        requirement: requirement as unknown as Record<string, unknown>,
        customer: requirement.customer as unknown as Record<string, unknown> | null,
        lead: requirement.lead as unknown as Record<string, unknown> | null,
        destination: requirement.destination as unknown as Record<string, unknown> | null,
        selections: {
          hotelOptionGroup: selection?.hotelOptionGroup ?? defaultGroups.hotelOptionGroup,
          activityOptionGroup: selection?.activityOptionGroup ?? defaultGroups.activityOptionGroup,
          transferOptionGroup: selection?.transferOptionGroup ?? defaultGroups.transferOptionGroup,
        },
        markup: selection?.markup ?? requirement.markup ?? 0,
        discount: (body.discount as number) ?? 0,
        tax: (body.tax as number) ?? 0,
        currency: (body.currency as string) ?? "INR",
        templateId: (body.selectedTemplateId as string) ?? null,
        agencyId: req.auth?.agencyId ?? null,
      });

      const templateId = (body.selectedTemplateId as string) ?? (snapshot.template as { id?: string } | null)?.id ?? null;
      const validDays = typeof body.validDays === "number" ? body.validDays : 7;
      const validUntil = new Date(Date.now() + validDays * 86400000);

      const proposal = await db.travelProposal.create({
        data: {
          agencyId: req.auth?.agencyId,
          proposalNumber: await nextProposalNumber(req.auth?.agencyId),
          travelRequirementId: requirement.id,
          customerId: requirement.customerId,
          leadId: requirement.leadId,
          selectedPackageId: packageId,
          selectedTemplateId: templateId,
          currency: snapshot.pricing.currency,
          validUntil,
          notes: (body.notes as string) || null,
          internalNotes: (body.internalNotes as string) || null,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
          createdByName: req.auth?.email,
          updatedByName: req.auth?.email,
        },
      });

      await saveSnapshotVersion(proposal.id, 1, snapshot, req, "Initial snapshot from trip requirement");
      await addHistory(proposal.id, "created", req, { summary: `Created from ${requirement.requirementCode}`, versionNumber: 1 });

      if (requirement.status === "Draft" || requirement.status === "Qualified") {
        await db.travelRequirement.update({
          where: { id: requirement.id },
          data: { status: "Quoted", updatedByName: req.auth?.email },
        });
      }

      const full = await db.travelProposal.findUnique({
        where: { id: proposal.id },
        include: PROPOSAL_INCLUDE,
      });
      res.status(201).json({ item: full, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Server error" });
    }
  });

  app.post(`${base}/from-itinerary`, requireAuth, requireCrudPermission("travel-proposals", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const title = String(body.title || "").trim() || "Travel Proposal";
      const startDate = String(body.startDate || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        res.status(400).json({ error: "startDate is required (YYYY-MM-DD)" });
        return;
      }
      const startBlock = travelDatesBlockReason({ travelStartDate: startDate, requireStart: true });
      if (startBlock) {
        res.status(400).json({ error: startBlock });
        return;
      }
      const rawCities = Array.isArray(body.cities) ? body.cities : [];
      const cities: ItineraryCity[] = rawCities
        .map((c) => {
          const row = c as Record<string, unknown>;
          return {
            city: String(row.city || "").trim(),
            nights: Math.max(0, Number(row.nights) || 0),
            destinationId: (row.destinationId as string) || null,
          };
        })
        .filter((c) => c.city && c.nights > 0);
      if (!cities.length) {
        res.status(400).json({ error: "At least one city with nights is required" });
        return;
      }

      const adults = Math.max(1, Number(body.adults) || 1);
      const children = Math.max(0, Number(body.children) || 0);
      const currency = String(body.currency || "INR");
      const endDate = computeEndDate(startDate, cities);
      const trip: ItineraryTripMeta = {
        title,
        startDate,
        endDate,
        adults,
        children,
        currency,
        cities,
        notes: (body.notes as string) || null,
      };

      let customer: Record<string, unknown> | null = null;
      let lead: Record<string, unknown> | null = null;
      const customerId = (body.customerId as string) || null;
      const leadId = (body.leadId as string) || null;
      if (customerId) {
        customer = await db.customer.findFirst({
          where: { id: customerId, ...agencyScope(req) },
          select: { id: true, name: true, email: true, phone: true },
        }) as Record<string, unknown> | null;
      }
      if (leadId) {
        lead = await db.lead.findFirst({
          where: { id: leadId, ...agencyScope(req) },
          select: { id: true, customerName: true, email: true, phone: true },
        }) as Record<string, unknown> | null;
      }

      let branding: Record<string, unknown> | null = null;
      let template: Record<string, unknown> | null = null;
      if (req.auth?.agencyId) {
        const b = await db.agencyBranding.findUnique({ where: { agencyId: req.auth.agencyId } });
        if (b) branding = JSON.parse(JSON.stringify(b));
        const t = await db.quoteTemplate.findFirst({
          where: { agencyId: req.auth.agencyId, isDefault: true, status: "Active", deletedAt: null },
          include: { sections: { orderBy: { sortOrder: "asc" } } },
        });
        if (t) template = JSON.parse(JSON.stringify(t));
      }

      const snapshot = buildEmptyItinerarySnapshot({ trip, customer, lead, branding, template });
      const tripMeta = {
        title,
        startDate,
        endDate,
        adults,
        children,
        currency,
        cities: cities.map((c) => ({ city: c.city, nights: c.nights })),
      };

      const proposal = await db.travelProposal.create({
        data: {
          agencyId: req.auth?.agencyId,
          proposalNumber: await nextProposalNumber(req.auth?.agencyId),
          customerId,
          leadId,
          selectedPackageId: null,
          selectedTemplateId: (template as { id?: string } | null)?.id ?? null,
          currency,
          validUntil: body.validUntil ? new Date(body.validUntil as string) : new Date(Date.now() + 7 * 86400000),
          notes: (body.notes as string) || null,
          internalNotes: (body.internalNotes as string) || null,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
          createdByName: req.auth?.email,
          updatedByName: req.auth?.email,
        },
      });

      try {
        await db.$executeRawUnsafe(
          `UPDATE "TravelProposal" SET "builderMode" = $1, "tripMeta" = $2::jsonb WHERE id = $3`,
          "day_itinerary",
          JSON.stringify(tripMeta),
          proposal.id
        );
      } catch (e) {
        logger.warn(`Could not set builderMode/tripMeta (run prisma generate): ${e instanceof Error ? e.message : e}`);
      }

      await saveSnapshotVersion(proposal.id, 1, snapshot as unknown as ProposalSnapshotData, req, "Initial day itinerary");
      await addHistory(proposal.id, "created", req, { summary: "Created day itinerary proposal", versionNumber: 1 });

      const full = await db.travelProposal.findUnique({ where: { id: proposal.id }, include: PROPOSAL_INCLUDE });
      res.status(201).json({ item: full, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Server error" });
    }
  });

  app.post(base, requireAuth, requireCrudPermission("travel-proposals", "add"), validate(travelProposalSchema), async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const packageId = body.selectedPackageId as string;
      if (!packageId) { res.status(400).json({ error: "Package is required" }); return; }

      const snapshot = await buildProposalSnapshot({
        packageId,
        customer: body.customer as Record<string, unknown> | null,
        lead: body.lead as Record<string, unknown> | null,
        selections: {
          hotelOptionGroup: (body.hotelOptionGroup as string) ?? null,
          activityOptionGroup: (body.activityOptionGroup as string) ?? null,
          transferOptionGroup: (body.transferOptionGroup as string) ?? null,
        },
        markup: (body.markup as number) ?? 0,
        discount: (body.discount as number) ?? 0,
        tax: (body.tax as number) ?? 0,
        currency: (body.currency as string) ?? "INR",
        templateId: (body.selectedTemplateId as string) ?? null,
        agencyId: req.auth?.agencyId ?? null,
      });

      const templateId = (body.selectedTemplateId as string) ?? (snapshot.template as { id?: string } | null)?.id ?? null;
      const proposal = await db.travelProposal.create({
        data: {
          agencyId: req.auth?.agencyId,
          proposalNumber: await nextProposalNumber(req.auth?.agencyId),
          travelRequirementId: (body.travelRequirementId as string) || null,
          customerId: (body.customerId as string) || null,
          leadId: (body.leadId as string) || null,
          selectedPackageId: packageId,
          selectedTemplateId: templateId,
          currency: snapshot.pricing.currency,
          validUntil: body.validUntil ? new Date(body.validUntil as string) : new Date(Date.now() + 7 * 86400000),
          notes: (body.notes as string) || null,
          internalNotes: (body.internalNotes as string) || null,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
          createdByName: req.auth?.email,
          updatedByName: req.auth?.email,
        },
      });

      await saveSnapshotVersion(proposal.id, 1, snapshot, req, "Initial snapshot");
      await addHistory(proposal.id, "created", req, { versionNumber: 1 });

      const full = await db.travelProposal.findUnique({ where: { id: proposal.id }, include: PROPOSAL_INCLUDE });
      res.status(201).json({ item: full, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("travel-proposals", "edit"), validate(travelProposalUpdateSchema), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.travelProposal.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      if (["Booked", "Cancelled"].includes(existing.proposalStatus)) {
        res.status(400).json({ error: "Proposal cannot be edited in current status" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const { snapshotEdits, changeSummary, ...meta } = body;

      await db.travelProposal.update({
        where: { id },
        data: {
          ...(meta as Prisma.TravelProposalUpdateInput),
          validUntil: meta.validUntil ? new Date(meta.validUntil as string) : undefined,
          updatedById: req.auth?.userId,
          updatedByName: req.auth?.email,
        },
      });

      let snapshot = await getCurrentSnapshot(id);
      if (snapshotEdits && snapshot) {
        snapshot = applySnapshotEdits(snapshot, snapshotEdits as Parameters<typeof applySnapshotEdits>[1]);
        const nextVersion = existing.currentVersion + 1;
        await saveSnapshotVersion(id, nextVersion, snapshot, req, (changeSummary as string) || `Version ${nextVersion}`);
        await db.travelProposal.update({ where: { id }, data: { currentVersion: nextVersion } });
        await addHistory(id, "version_saved", req, { summary: changeSummary as string, versionNumber: nextVersion });
      } else {
        await addHistory(id, "updated", req, { summary: "Metadata updated" });
      }

      const full = await db.travelProposal.findUnique({ where: { id }, include: PROPOSAL_INCLUDE });
      res.json({ item: full, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete(`${base}/:id`, requireAuth, requireCrudPermission("travel-proposals", "delete"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      await db.travelProposal.update({
        where: { id },
        data: { deletedAt: new Date(), proposalStatus: "Cancelled", updatedByName: req.auth?.email },
      });
      await addHistory(id, "cancelled", req, { toStatus: "Cancelled" });
      res.json({ ok: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/duplicate`, requireAuth, requireCrudPermission("travel-proposals", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const source = await db.travelProposal.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!source) { res.status(404).json({ error: "Not found" }); return; }
      const snapshot = await getCurrentSnapshot(id);
      if (!snapshot) { res.status(400).json({ error: "No snapshot to duplicate" }); return; }

      const proposal = await db.travelProposal.create({
        data: {
          agencyId: source.agencyId,
          proposalNumber: await nextProposalNumber(source.agencyId),
          travelRequirementId: source.travelRequirementId,
          customerId: source.customerId,
          leadId: source.leadId,
          selectedPackageId: source.selectedPackageId,
          selectedTemplateId: source.selectedTemplateId,
          builderMode: (source as { builderMode?: string }).builderMode ?? "package",
          tripMeta: (source as { tripMeta?: Prisma.InputJsonValue }).tripMeta ?? undefined,
          currency: source.currency,
          validUntil: source.validUntil,
          notes: source.notes,
          internalNotes: source.internalNotes,
          proposalStatus: "Draft",
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
          createdByName: req.auth?.email,
          updatedByName: req.auth?.email,
        } as Prisma.TravelProposalCreateInput,
      });

      await saveSnapshotVersion(proposal.id, 1, snapshot, req, `Duplicated from ${source.proposalNumber}`);
      await addHistory(proposal.id, "duplicated", req, { summary: `Cloned from ${source.proposalNumber}`, versionNumber: 1 });

      const full = await db.travelProposal.findUnique({ where: { id: proposal.id }, include: PROPOSAL_INCLUDE });
      res.status(201).json({ item: full, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/clone`, requireAuth, requireCrudPermission("travel-proposals", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const source = await db.travelProposal.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!source) { res.status(404).json({ error: "Not found" }); return; }
      const snapshot = await getCurrentSnapshot(id);
      if (!snapshot) { res.status(400).json({ error: "No snapshot to clone" }); return; }

      const proposal = await db.travelProposal.create({
        data: {
          agencyId: source.agencyId,
          proposalNumber: await nextProposalNumber(source.agencyId),
          travelRequirementId: source.travelRequirementId,
          customerId: source.customerId,
          leadId: source.leadId,
          selectedPackageId: source.selectedPackageId,
          selectedTemplateId: source.selectedTemplateId,
          builderMode: (source as { builderMode?: string }).builderMode ?? "package",
          tripMeta: (source as { tripMeta?: Prisma.InputJsonValue }).tripMeta ?? undefined,
          currency: source.currency,
          validUntil: source.validUntil,
          notes: source.notes,
          internalNotes: source.internalNotes,
          proposalStatus: "Draft",
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
          createdByName: req.auth?.email,
          updatedByName: req.auth?.email,
        } as Prisma.TravelProposalCreateInput,
      });

      await saveSnapshotVersion(proposal.id, 1, snapshot, req, `Cloned from ${source.proposalNumber}`);
      await addHistory(proposal.id, "cloned", req, { summary: `Cloned from ${source.proposalNumber}`, versionNumber: 1 });

      const full = await db.travelProposal.findUnique({ where: { id: proposal.id }, include: PROPOSAL_INCLUDE });
      res.status(201).json({ item: full, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id/status`, requireAuth, requireCrudPermission("travel-proposals", "edit"), validate(travelProposalStatusSchema), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const { status: newStatus } = req.body as { status: string };
      if (!PROPOSAL_STATUSES.includes(newStatus as typeof PROPOSAL_STATUSES[number])) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }

      const existing = await db.travelProposal.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }

      const allowed = STATUS_TRANSITIONS[existing.proposalStatus] ?? [];
      if (!allowed.includes(newStatus) && existing.proposalStatus !== newStatus) {
        res.status(400).json({ error: `Cannot transition from ${existing.proposalStatus} to ${newStatus}` });
        return;
      }

      const snapshot = await getCurrentSnapshot(id);
      if (newStatus === "Sent") {
        const err = validateSend(snapshot, {
          ...existing,
          builderMode: (existing as { builderMode?: string }).builderMode,
        });
        if (err) { res.status(400).json({ error: err }); return; }
      }

      const item = await db.travelProposal.update({
        where: { id },
        data: { proposalStatus: newStatus, updatedByName: req.auth?.email },
        include: PROPOSAL_INCLUDE,
      });

      await addHistory(id, "status_changed", req, {
        fromStatus: existing.proposalStatus,
        toStatus: newStatus,
        summary: `${existing.proposalStatus} → ${newStatus}`,
      });

      res.json({ item, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id/snapshot`, requireAuth, requireCrudPermission("travel-proposals", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const version = parseInt(req.query.version as string) || undefined;
      const row = version
        ? await db.proposalSnapshot.findFirst({ where: { proposalId: id, versionNumber: version } })
        : await db.proposalSnapshot.findFirst({ where: { proposalId: id }, orderBy: { versionNumber: "desc" } });
      if (!row) { res.status(404).json({ error: "Snapshot not found" }); return; }
      res.json({ snapshot: row.snapshot, versionNumber: row.versionNumber, createdAt: row.createdAt });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id/versions`, requireAuth, requireCrudPermission("travel-proposals", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const versions = await db.proposalSnapshot.findMany({
        where: { proposalId: paramId(req) },
        orderBy: { versionNumber: "desc" },
        select: { id: true, versionNumber: true, changeSummary: true, createdByName: true, createdAt: true },
      });
      res.json({ versions });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id/versions/compare`, requireAuth, requireCrudPermission("travel-proposals", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const v1 = parseInt(req.query.v1 as string);
      const v2 = parseInt(req.query.v2 as string);
      if (!v1 || !v2) { res.status(400).json({ error: "v1 and v2 query params required" }); return; }
      const [a, b] = await Promise.all([
        db.proposalSnapshot.findFirst({ where: { proposalId: paramId(req), versionNumber: v1 } }),
        db.proposalSnapshot.findFirst({ where: { proposalId: paramId(req), versionNumber: v2 } }),
      ]);
      if (!a || !b) { res.status(404).json({ error: "Version not found" }); return; }
      const diff = compareSnapshots(a.snapshot as ProposalSnapshotData, b.snapshot as ProposalSnapshotData);
      res.json({ v1, v2, diff });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id/preview`, requireAuth, requireCrudPermission("travel-proposals", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const proposal = await db.travelProposal.findFirst({
        where: { id: paramId(req), ...agencyScope(req), deletedAt: null },
      });
      if (!proposal) { res.status(404).json({ error: "Not found" }); return; }
      const snapshot = await getCurrentSnapshot(proposal.id);
      if (!snapshot) { res.status(404).json({ error: "No snapshot" }); return; }
      const previewData = snapshotToPreviewData(snapshot, proposal.proposalNumber, proposal.validUntil);
      const template = snapshot.template as Record<string, unknown> | null;
      const sections = ((template?.sections as Record<string, unknown>[]) ?? []).map((s) => ({
        sectionType: s.sectionType,
        customTitle: s.customTitle,
        isVisible: s.isVisible,
      }));
      res.json({ proposal, snapshot, previewData, template, sections });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id/history`, requireAuth, requireCrudPermission("travel-proposals", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const history = await db.proposalHistory.findMany({
        where: { proposalId: paramId(req) },
        orderBy: { createdAt: "desc" },
      });
      res.json({ history });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id/itinerary`, requireAuth, requireCrudPermission("travel-proposals", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.travelProposal.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      if (["Booked", "Cancelled"].includes(existing.proposalStatus)) {
        res.status(400).json({ error: "Proposal cannot be edited in current status" });
        return;
      }

      const current = await getCurrentSnapshot(id);
      if (!current) { res.status(400).json({ error: "No snapshot" }); return; }

      let rowMode = (existing as { builderMode?: string }).builderMode;
      try {
        const metaRows = await db.$queryRawUnsafe<Array<{ builderMode: string }>>(
          `SELECT "builderMode" FROM "TravelProposal" WHERE id = $1`,
          id
        );
        rowMode = metaRows[0]?.builderMode ?? rowMode;
      } catch {
        /* ignore */
      }
      if (rowMode !== "day_itinerary" && current.builderMode !== "day_itinerary") {
        res.status(400).json({ error: "Proposal is not a day itinerary builder" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const days = normalizeDays((body.days as ItineraryDay[]) || (current.days as unknown as ItineraryDay[]) || []);
      const markup = body.markup !== undefined ? Number(body.markup) : (current.pricing?.markup ?? 0);
      const discount = body.discount !== undefined ? Number(body.discount) : (current.pricing?.discount ?? 0);
      const tax = body.tax !== undefined ? Number(body.tax) : (current.pricing?.tax ?? 0);
      const currency = String(body.currency || current.pricing?.currency || existing.currency || "INR");
      const pricing = recomputeItineraryPricing(days, markup, discount, tax, currency);

      let trip = (current.trip || {}) as Record<string, unknown>;
      if (body.trip && typeof body.trip === "object") {
        trip = { ...trip, ...(body.trip as Record<string, unknown>) };
      }

      const terms = body.terms && typeof body.terms === "object"
        ? { ...current.terms, ...(body.terms as Record<string, unknown>) }
        : current.terms;

      const snapshot: ProposalSnapshotData = {
        ...current,
        builderMode: "day_itinerary",
        capturedAt: new Date().toISOString(),
        trip,
        days: days as unknown as Record<string, unknown>[],
        pricing: {
          hotelCost: pricing.hotelCost,
          activityCost: pricing.activityCost,
          transferCost: pricing.transferCost,
          mealCost: pricing.mealCost,
          miscCost: pricing.miscCost,
          packageBase: pricing.packageBase,
          markup: pricing.markup,
          discount: pricing.discount,
          tax: pricing.tax,
          total: pricing.total,
          currency: pricing.currency,
        },
        terms: terms as ProposalSnapshotData["terms"],
        package: {
          ...(current.package || {}),
          packageName: String(trip.title || (current.package as { packageName?: string })?.packageName || "Travel Proposal"),
          durationNights: Array.isArray(trip.cities)
            ? (trip.cities as ItineraryCity[]).reduce((s, c) => s + Math.max(0, Number(c.nights) || 0), 0)
            : (current.package as { durationNights?: number })?.durationNights,
          durationDays: days.length,
        },
      };

      const bumpVersion = body.bumpVersion !== false;
      const nextVersion = bumpVersion ? existing.currentVersion + 1 : existing.currentVersion;
      if (bumpVersion) {
        await saveSnapshotVersion(id, nextVersion, snapshot, req, (body.changeSummary as string) || "Itinerary updated");
        await addHistory(id, "itinerary_saved", req, { summary: "Day itinerary saved", versionNumber: nextVersion });
      } else {
        const row = await db.proposalSnapshot.findFirst({
          where: { proposalId: id },
          orderBy: { versionNumber: "desc" },
        });
        if (row) {
          await db.proposalSnapshot.update({
            where: { id: row.id },
            data: { snapshot: snapshot as unknown as Prisma.InputJsonValue, changeSummary: "Itinerary autosave" },
          });
        } else {
          await saveSnapshotVersion(id, 1, snapshot, req, "Itinerary autosave");
        }
      }

      const tripMeta = {
        title: trip.title,
        startDate: trip.startDate,
        endDate: trip.endDate,
        adults: trip.adults,
        children: trip.children,
        currency,
        cities: trip.cities,
        total: pricing.total,
      };

      const item = await db.travelProposal.update({
        where: { id },
        data: {
          currentVersion: nextVersion,
          currency,
          notes: body.notes !== undefined ? String(body.notes) : undefined,
          validUntil: body.validUntil ? new Date(body.validUntil as string) : undefined,
          updatedById: req.auth?.userId,
          updatedByName: req.auth?.email,
        },
        include: PROPOSAL_INCLUDE,
      });

      try {
        await db.$executeRawUnsafe(
          `UPDATE "TravelProposal" SET "tripMeta" = $1::jsonb WHERE id = $2`,
          JSON.stringify(tripMeta),
          id
        );
      } catch {
        /* tripMeta column may need prisma generate */
      }

      res.json({ item: { ...item, builderMode: "day_itinerary", tripMeta }, snapshot });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : "Server error" });
    }
  });

  app.post(`${base}/:id/share`, requireAuth, requireCrudPermission("travel-proposals", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.travelProposal.findFirst({
        where: { id, ...agencyScope(req), deletedAt: null },
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          lead: { select: { id: true, customerName: true, email: true, phone: true } },
        },
      });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }

      const channel = String(req.body?.channel || "Link");
      const customerName = existing.customer?.name || existing.lead?.customerName || "Guest";
      const defaultEmail = existing.customer?.email || existing.lead?.email || "";
      const defaultPhone = existing.customer?.phone || existing.lead?.phone || "";
      const recipient = String(req.body?.recipient || defaultEmail || "");
      const shareId = `psh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      let share: Record<string, unknown> = {
        id: shareId,
        proposalId: existing.id,
        channel,
        recipient: recipient || undefined,
        senderName: req.auth?.email,
        message: req.body?.message ? String(req.body.message) : undefined,
        status: "Attempted",
      };
      if (proposalShare) {
        share = await proposalShare.create({
          data: {
            proposalId: existing.id,
            channel,
            recipient: recipient || undefined,
            senderName: req.auth?.email,
            message: req.body?.message ? String(req.body.message) : undefined,
            status: "Attempted",
          },
        });
      } else {
        await db.$executeRawUnsafe(
          `INSERT INTO "ProposalShare" ("id","proposalId","channel","recipient","senderName","message","status","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,'Attempted',NOW())`,
          shareId,
          existing.id,
          channel,
          recipient || null,
          req.auth?.email ?? null,
          req.body?.message ? String(req.body.message) : null
        );
      }

      const link = `${req.body?.appOrigin || ""}/?view=travel-proposals&proposalId=${existing.id}`;
      let emailed = false;
      if (channel === "Email" && recipient) {
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const html = `
          <p>Dear ${esc(customerName)},</p>
          <p>Please find your travel proposal <strong>${esc(existing.proposalNumber)}</strong>.</p>
          ${req.body?.message ? `<p>${esc(String(req.body.message))}</p>` : ""}
          <p>View: <a href="${esc(link)}">${esc(link || existing.proposalNumber)}</a></p>
          <p>Regards,<br/>Trevio Global</p>
        `;
        emailed = await sendHtmlEmail(
          recipient,
          `Travel Proposal ${existing.proposalNumber}`,
          html,
          { agencyId: existing.agencyId },
        );
        if (proposalShare) {
          await proposalShare.update({
            where: { id: share.id },
            data: { status: emailed ? "Sent" : "Failed" },
          });
        } else {
          await db.$executeRawUnsafe(
            `UPDATE "ProposalShare" SET status = $1 WHERE id = $2`,
            emailed ? "Sent" : "Failed",
            share.id
          );
        }
        share = { ...share, status: emailed ? "Sent" : "Failed" };
      }

      if (["Draft", "Internal Review", "Approved"].includes(existing.proposalStatus) && (emailed || channel === "WhatsApp" || channel === "Link")) {
        await db.travelProposal.update({
          where: { id },
          data: { proposalStatus: "Sent", updatedByName: req.auth?.email },
        });
        await addHistory(id, "status_changed", req, {
          fromStatus: existing.proposalStatus,
          toStatus: "Sent",
          summary: `Shared via ${channel}`,
        });
      } else {
        await addHistory(id, "shared", req, { summary: `Shared via ${channel}` });
      }

      const phone = String(req.body?.recipient || defaultPhone || "").replace(/\D/g, "");
      const waText = encodeURIComponent(
        `Travel Proposal ${existing.proposalNumber} for ${customerName}. View: ${link}`
      );

      res.status(201).json({
        share: { ...share, status: emailed ? "Sent" : share.status },
        link,
        emailed,
        mailto: channel === "Email" && !emailed
          ? `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`Travel Proposal ${existing.proposalNumber}`)}&body=${encodeURIComponent(`Please review proposal ${existing.proposalNumber}: ${link}`)}`
          : undefined,
        whatsappUrl: channel === "WhatsApp" ? `https://wa.me/${phone}?text=${waText}` : undefined,
        note: emailed
          ? "Email sent via SMTP/SendGrid"
          : "Delivery uses client mailto / wa.me unless SMTP/SendGrid is configured",
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}
