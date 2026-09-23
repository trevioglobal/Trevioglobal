import type { Express, Response } from "express";
import type { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAuth, requireCrudPermission } from "../middleware/auth.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import {
  validate,
  travelRequirementSchema,
  travelRequirementUpdateSchema,
  travelRequirementMatchSchema,
  travelRequirementPriceSchema,
  travelRequirementSelectionSchema,
} from "../lib/validation.js";
import {
  matchPackages,
  calcPriceFromGroups,
  defaultGroupsFromOptions,
} from "../lib/package-matching.js";
import { travelDatesBlockReason } from "../lib/travel-dates.js";

type ScopeFn = (req: AuthRequest) => Record<string, unknown>;

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

async function nextRequirementCode(agencyId: string | null | undefined): Promise<string> {
  const count = await db.travelRequirement.count({ where: { agencyId: agencyId ?? null } });
  return `REQ-${String(count + 1).padStart(4, "0")}`;
}

const REQUIREMENT_INCLUDE = {
  destination: { select: { id: true, name: true, country: true, thumbnail: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  lead: { select: { id: true, customerName: true, email: true, phone: true, stage: true } },
  selections: { orderBy: { matchScore: "desc" as const } },
  history: { orderBy: { createdAt: "desc" as const }, take: 50 },
};

async function addHistory(requirementId: string, action: string, summary: string | undefined, req: AuthRequest) {
  await db.travelRequirementHistory.create({
    data: {
      requirementId,
      action,
      summary,
      createdByName: req.auth?.email,
    },
  });
}

function computeDaysNights(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const days = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
  const nights = Math.max(0, days - 1);
  return { days, nights };
}

export function mountTripPlannerRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/trip-requirements";

  app.get(base, requireAuth, requireCrudPermission("trip-planner", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      const status = req.query.status as string | undefined;
      const q = (req.query.q as string)?.trim();
      const where: Prisma.TravelRequirementWhereInput = { ...agencyScope(req), deletedAt: null };
      if (status && status !== "All") where.status = status;
      if (q) {
        where.OR = [
          { requirementCode: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
          { destination: { name: { contains: q, mode: "insensitive" } } },
        ];
      }
      const skip = (page - 1) * pageSize;
      const [items, total] = await Promise.all([
        db.travelRequirement.findMany({
          where,
          include: REQUIREMENT_INCLUDE,
          orderBy: { updatedAt: "desc" },
          skip,
          take: pageSize,
        }),
        db.travelRequirement.count({ where }),
      ]);
      res.json({ items, total, page, pageSize });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/recommendations`, requireAuth, requireCrudPermission("trip-planner", "view"), validate(travelRequirementMatchSchema), async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as {
        destinationId: string;
        days: number;
        nights?: number;
        budgetMin?: number;
        budgetMax?: number;
        hotelCategory?: string | null;
        packageType?: string | null;
        adults?: number;
      };
      const matches = await matchPackages(
        { ...body, nights: body.nights ?? Math.max(0, body.days - 1), budgetMin: body.budgetMin ?? 0, budgetMax: body.budgetMax ?? 0 },
        agencyScope(req)
      );
      res.json({ matches });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id`, requireAuth, requireCrudPermission("trip-planner", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const item = await db.travelRequirement.findFirst({
        where: { id: paramId(req), ...agencyScope(req), deletedAt: null },
        include: REQUIREMENT_INCLUDE,
      });
      if (!item) { res.status(404).json({ error: "Not found" }); return; }
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(base, requireAuth, requireCrudPermission("trip-planner", "add"), validate(travelRequirementSchema), async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const start = new Date(body.travelStartDate as string);
      const end = new Date(body.travelEndDate as string);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        res.status(400).json({ error: "Invalid travel dates" });
        return;
      }
      const dateBlock = travelDatesBlockReason({
        travelStartDate: body.travelStartDate,
        travelEndDate: body.travelEndDate,
        requireStart: true,
      });
      if (dateBlock) {
        res.status(400).json({ error: dateBlock });
        return;
      }
      const computed = computeDaysNights(start, end);
      const requirementCode = await nextRequirementCode(req.auth?.agencyId);

      const item = await db.travelRequirement.create({
        data: {
          requirementCode,
          agencyId: req.auth?.agencyId,
          branchId: req.auth?.branchId,
          customerId: (body.customerId as string) || null,
          leadId: (body.leadId as string) || null,
          destinationId: body.destinationId as string,
          travelStartDate: start,
          travelEndDate: end,
          days: (body.days as number) ?? computed.days,
          nights: (body.nights as number) ?? computed.nights,
          adults: (body.adults as number) ?? 1,
          children: (body.children as number) ?? 0,
          infants: (body.infants as number) ?? 0,
          budgetMin: (body.budgetMin as number) ?? 0,
          budgetMax: (body.budgetMax as number) ?? 0,
          hotelCategory: (body.hotelCategory as string) || null,
          packageType: (body.packageType as string) || null,
          preferredMealPlan: (body.preferredMealPlan ?? {}) as Prisma.InputJsonValue,
          preferredTransfer: (body.preferredTransfer as string) || null,
          flightRequired: Boolean(body.flightRequired),
          visaRequired: Boolean(body.visaRequired),
          insuranceRequired: Boolean(body.insuranceRequired),
          specialRequests: (body.specialRequests as string) || null,
          status: (body.status as string) ?? "Draft",
          markup: (body.markup as number) ?? 0,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
          createdByName: req.auth?.email,
          updatedByName: req.auth?.email,
        },
        include: REQUIREMENT_INCLUDE,
      });

      await addHistory(item.id, "created", "Trip requirement created", req);
      res.status(201).json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("trip-planner", "edit"), validate(travelRequirementUpdateSchema), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.travelRequirement.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }

      const body = req.body as Record<string, unknown>;
      const data: Prisma.TravelRequirementUpdateInput = {
        updatedById: req.auth?.userId,
        updatedByName: req.auth?.email,
      };

      if (body.customerId !== undefined) data.customer = body.customerId ? { connect: { id: body.customerId as string } } : { disconnect: true };
      if (body.leadId !== undefined) data.lead = body.leadId ? { connect: { id: body.leadId as string } } : { disconnect: true };
      if (body.destinationId) data.destination = { connect: { id: body.destinationId as string } };
      if (body.travelStartDate || body.travelEndDate) {
        const dateBlock = travelDatesBlockReason({
          travelStartDate: body.travelStartDate ?? existing.travelStartDate?.toISOString().slice(0, 10),
          travelEndDate: body.travelEndDate ?? existing.travelEndDate?.toISOString().slice(0, 10),
          requireStart: true,
        });
        if (dateBlock) {
          res.status(400).json({ error: dateBlock });
          return;
        }
      }
      if (body.travelStartDate) data.travelStartDate = new Date(body.travelStartDate as string);
      if (body.travelEndDate) data.travelEndDate = new Date(body.travelEndDate as string);
      if (body.days !== undefined) data.days = body.days as number;
      if (body.nights !== undefined) data.nights = body.nights as number;
      if (body.adults !== undefined) data.adults = body.adults as number;
      if (body.children !== undefined) data.children = body.children as number;
      if (body.infants !== undefined) data.infants = body.infants as number;
      if (body.budgetMin !== undefined) data.budgetMin = body.budgetMin as number;
      if (body.budgetMax !== undefined) data.budgetMax = body.budgetMax as number;
      if (body.hotelCategory !== undefined) data.hotelCategory = body.hotelCategory as string | null;
      if (body.packageType !== undefined) data.packageType = body.packageType as string | null;
      if (body.preferredMealPlan !== undefined) data.preferredMealPlan = body.preferredMealPlan as Prisma.InputJsonValue;
      if (body.preferredTransfer !== undefined) data.preferredTransfer = body.preferredTransfer as string | null;
      if (body.flightRequired !== undefined) data.flightRequired = Boolean(body.flightRequired);
      if (body.visaRequired !== undefined) data.visaRequired = Boolean(body.visaRequired);
      if (body.insuranceRequired !== undefined) data.insuranceRequired = Boolean(body.insuranceRequired);
      if (body.specialRequests !== undefined) data.specialRequests = body.specialRequests as string | null;
      if (body.status !== undefined) data.status = body.status as string;
      if (body.markup !== undefined) data.markup = body.markup as number;

      const item = await db.travelRequirement.update({
        where: { id },
        data,
        include: REQUIREMENT_INCLUDE,
      });

      await addHistory(id, "updated", "Requirement details updated", req);
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete(`${base}/:id`, requireAuth, requireCrudPermission("trip-planner", "delete"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      await db.travelRequirement.update({
        where: { id },
        data: { deletedAt: new Date(), status: "Cancelled", updatedByName: req.auth?.email },
      });
      await addHistory(id, "cancelled", "Requirement cancelled", req);
      res.json({ ok: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/recommendations`, requireAuth, requireCrudPermission("trip-planner", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const reqItem = await db.travelRequirement.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!reqItem) { res.status(404).json({ error: "Not found" }); return; }
      const matches = await matchPackages({
        destinationId: reqItem.destinationId,
        days: reqItem.days,
        nights: reqItem.nights,
        budgetMin: reqItem.budgetMin,
        budgetMax: reqItem.budgetMax,
        hotelCategory: reqItem.hotelCategory,
        packageType: reqItem.packageType,
        adults: reqItem.adults,
      }, agencyScope(req));
      res.json({ matches });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/calculate-price`, requireAuth, requireCrudPermission("trip-planner", "view"), validate(travelRequirementPriceSchema), async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as {
        packageId: string;
        hotelOptionGroup?: string | null;
        activityOptionGroup?: string | null;
        transferOptionGroup?: string | null;
        markup?: number;
      };
      const options = await db.packageProductOption.findMany({ where: { packageId: body.packageId, status: "Active" } });
      const defaults = defaultGroupsFromOptions(options);
      const pricing = await calcPriceFromGroups(body.packageId, {
        hotelOptionGroup: body.hotelOptionGroup ?? defaults.hotelOptionGroup,
        activityOptionGroup: body.activityOptionGroup ?? defaults.activityOptionGroup,
        transferOptionGroup: body.transferOptionGroup ?? defaults.transferOptionGroup,
      }, body.markup ?? 0);
      res.json({ pricing });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/calculate-price`, requireAuth, requireCrudPermission("trip-planner", "view"), validate(travelRequirementPriceSchema), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const reqItem = await db.travelRequirement.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!reqItem) { res.status(404).json({ error: "Not found" }); return; }
      const body = req.body as {
        packageId: string;
        hotelOptionGroup?: string | null;
        activityOptionGroup?: string | null;
        transferOptionGroup?: string | null;
        markup?: number;
      };
      const options = await db.packageProductOption.findMany({ where: { packageId: body.packageId, status: "Active" } });
      const defaults = defaultGroupsFromOptions(options);
      const markup = body.markup ?? reqItem.markup;
      const pricing = await calcPriceFromGroups(body.packageId, {
        hotelOptionGroup: body.hotelOptionGroup ?? defaults.hotelOptionGroup,
        activityOptionGroup: body.activityOptionGroup ?? defaults.activityOptionGroup,
        transferOptionGroup: body.transferOptionGroup ?? defaults.transferOptionGroup,
      }, markup);
      res.json({ pricing });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/select-package`, requireAuth, requireCrudPermission("trip-planner", "edit"), validate(travelRequirementSelectionSchema), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const reqItem = await db.travelRequirement.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!reqItem) { res.status(404).json({ error: "Not found" }); return; }

      const body = req.body as {
        packageId: string;
        hotelOptionGroup?: string | null;
        activityOptionGroup?: string | null;
        transferOptionGroup?: string | null;
        markup?: number;
        matchScore?: number | null;
        matchReasons?: string[];
      };

      const options = await db.packageProductOption.findMany({ where: { packageId: body.packageId, status: "Active" } });
      const defaults = defaultGroupsFromOptions(options);
      const markup = body.markup ?? reqItem.markup;
      const pricing = await calcPriceFromGroups(body.packageId, {
        hotelOptionGroup: body.hotelOptionGroup ?? defaults.hotelOptionGroup,
        activityOptionGroup: body.activityOptionGroup ?? defaults.activityOptionGroup,
        transferOptionGroup: body.transferOptionGroup ?? defaults.transferOptionGroup,
      }, markup);

      await db.travelRequirementSelection.updateMany({ where: { requirementId: id }, data: { isSelected: false } });

      const selection = await db.travelRequirementSelection.upsert({
        where: { requirementId_packageId: { requirementId: id, packageId: body.packageId } },
        create: {
          requirementId: id,
          packageId: body.packageId,
          hotelOptionGroup: pricing.groups.hotelOptionGroup,
          activityOptionGroup: pricing.groups.activityOptionGroup,
          transferOptionGroup: pricing.groups.transferOptionGroup,
          markup,
          hotelCost: pricing.hotelCost,
          activityCost: pricing.activityCost,
          transferCost: pricing.transferCost,
          sellingPrice: pricing.sellingPrice,
          matchScore: body.matchScore ?? null,
          matchReasons: (body.matchReasons ?? []) as Prisma.InputJsonValue,
          isSelected: true,
        },
        update: {
          hotelOptionGroup: pricing.groups.hotelOptionGroup,
          activityOptionGroup: pricing.groups.activityOptionGroup,
          transferOptionGroup: pricing.groups.transferOptionGroup,
          markup,
          hotelCost: pricing.hotelCost,
          activityCost: pricing.activityCost,
          transferCost: pricing.transferCost,
          sellingPrice: pricing.sellingPrice,
          matchScore: body.matchScore ?? null,
          matchReasons: (body.matchReasons ?? []) as Prisma.InputJsonValue,
          isSelected: true,
        },
      });

      await db.travelRequirement.update({
        where: { id },
        data: {
          selectedPackageId: body.packageId,
          markup,
          status: reqItem.status === "Draft" ? "Qualified" : reqItem.status,
          updatedByName: req.auth?.email,
        },
      });

      const pkg = await db.travelPackage.findUnique({
        where: { id: body.packageId },
        select: { packageName: true, packageCode: true },
      });

      await addHistory(id, "package_selected", `Selected ${pkg?.packageName ?? body.packageId}`, req);
      res.json({ selection, pricing });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id/history`, requireAuth, requireCrudPermission("trip-planner", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const history = await db.travelRequirementHistory.findMany({
        where: { requirementId: id },
        orderBy: { createdAt: "desc" },
      });
      res.json({ history });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}
