import type { Express, Response } from "express";
import { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAuth, requireCrudPermission, requirePermission, requireRole } from "../middleware/auth.js";
import { stripCatalogForRole } from "../lib/quote-access.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { sendEmail } from "../lib/email.js";
import {
  buildApproveData,
  buildRateAwareUpdate,
  buildRejectData,
  sanitizeCreateBody,
  type ProductKind,
} from "../lib/product-rate-approval.js";
import { checkCatalogueHotelInventory } from "../lib/hotel-inventory.js";
import {
  findApplicableContractedRate,
  isIsoDate,
  toWindow,
  type RateWindow,
} from "../lib/contracted-rates.js";

type ScopeFn = (req: AuthRequest) => Record<string, unknown>;

/** Parse city=checkIn pairs: "Phuket:2026-10-18,Krabi:2026-10-21" */
function parseCityStayCheckIns(raw: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return map;
  for (const part of text.split(",")) {
    const [cityRaw, dateRaw] = part.split(":");
    const city = String(cityRaw || "").trim().toLowerCase();
    const date = String(dateRaw || "").trim();
    if (city && isIsoDate(date)) map.set(city, date);
  }
  return map;
}

function hotelCityNeedle(item: { city?: string | null; address?: string | null; destination?: { name?: string | null } | null }): string {
  return String(item.city || item.destination?.name || "").trim().toLowerCase();
}

/**
 * Annotate catalogue hotels with server-side contracted-rate eligibility for Recommended.
 * Does not expose contractedCost. Stars / isFeatured are irrelevant.
 */
async function annotateHotelsContractedApplicable<T extends {
  id: string;
  city?: string | null;
  address?: string | null;
  destination?: { name?: string | null } | null;
}>(
  items: T[],
  opts: {
    travelDate?: string;
    cityStayCheckIns: Map<string, string>;
    scope: Record<string, unknown>;
  },
): Promise<Array<T & { hasApplicableContractedRate: boolean }>> {
  if (!items.length) return [];
  const fallbackDate = opts.travelDate && isIsoDate(opts.travelDate) ? opts.travelDate : null;
  if (!fallbackDate && opts.cityStayCheckIns.size === 0) {
    return items.map((item) => ({ ...item, hasApplicableContractedRate: false }));
  }

  const ids = items.map((i) => i.id);
  const rateRows = await db.contractedRate.findMany({
    where: {
      productType: "HOTEL",
      productId: { in: ids },
      active: true,
      ...opts.scope,
    },
  });
  const byProduct = new Map<string, RateWindow[]>();
  for (const row of rateRows) {
    const list = byProduct.get(row.productId) || [];
    list.push(toWindow(row));
    byProduct.set(row.productId, list);
  }

  return items.map((item) => {
    const city = hotelCityNeedle(item);
    const stayDate = (city && opts.cityStayCheckIns.get(city)) || fallbackDate;
    if (!stayDate) return { ...item, hasApplicableContractedRate: false };
    const rates = byProduct.get(item.id) || [];
    const result = findApplicableContractedRate(rates, stayDate);
    return { ...item, hasApplicableContractedRate: result.status === "OK" };
  });
}

function parseListQuery(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const q = (req.query.q as string)?.trim();
  const status = req.query.status as string | undefined;
  const approvalStatus = req.query.approvalStatus as string | undefined;
  const liveOnly = req.query.liveOnly === "true";
  const destinationId = req.query.destinationId as string | undefined;
  const sort = (req.query.sort as string) || "createdAt";
  const order = (req.query.order as string) === "asc" ? "asc" : "desc";
  return { page, pageSize, q, status, approvalStatus, liveOnly, destinationId, sort, order, skip: (page - 1) * pageSize };
}

function applyProductListFilters(where: Record<string, unknown>, query: ReturnType<typeof parseListQuery>) {
  if (query.status && query.status !== "All") where.status = query.status;
  if (query.approvalStatus && query.approvalStatus !== "All") where.approvalStatus = query.approvalStatus;
  if (query.liveOnly) {
    where.approvalStatus = "Approved";
    where.status = "Active";
  }
  applyDestinationFilter(where, query.destinationId);
}

const PRODUCT_RELATIONS = {
  destination: { select: { id: true, name: true, country: true, region: true, slug: true, thumbnail: true, heroImage: true } },
  supplier: { select: { id: true, name: true } },
};

async function assertValidDestination(req: AuthRequest, destinationId: unknown, agencyScope: ScopeFn): Promise<string | null> {
  if (!destinationId || typeof destinationId !== "string") return "destinationId is required";
  const dest = await db.destination.findFirst({
    where: { id: destinationId, ...agencyScope(req), deletedAt: null },
  });
  if (!dest) return "Invalid destination";
  return null;
}

function applyDestinationFilter(where: Record<string, unknown>, destinationId?: string) {
  if (destinationId && destinationId !== "All") where.destinationId = destinationId;
}

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

async function trackProductActivity(userId: string, agencyId?: string | null) {
  const date = new Date().toISOString().slice(0, 10);
  await db.employeeActivitySnapshot.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, agencyId: agencyId ?? undefined, date, productsUpdated: 1, lastActivity: "Product updated" },
    update: { productsUpdated: { increment: 1 }, lastActivity: "Product updated" },
  });
}

const APPROVER_ROLES = ["super_admin", "agency_admin"] as const;

type ProductDelegate = {
  findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
  update: (args: { where: { id: string }; data: Record<string, unknown>; include?: typeof PRODUCT_RELATIONS }) => Promise<Record<string, unknown> & { name: string }>;
};

async function approveProduct(
  req: AuthRequest,
  res: Response,
  model: ProductDelegate,
  productType: ProductKind,
  label: string,
) {
  const id = paramId(req);
  const existing = await model.findFirst({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const creator = existing.createdById ? await db.user.findUnique({ where: { id: String(existing.createdById) } }) : null;
  const item = await model.update({
    where: { id },
    data: {
      ...buildApproveData(existing),
      approvedBy: req.auth?.email,
      approvedAt: new Date(),
      updatedById: req.auth?.userId,
    },
    include: PRODUCT_RELATIONS,
  });
  if (creator?.email) {
    await sendEmail({
      to: creator.email,
      subject: `✅ ${label} Approved: ${item.name}`,
      template: "approval",
      data: {
        agentName: creator.name,
        productName: item.name,
        productType,
        approverName: req.auth?.email,
      },
      agencyId: (existing as { agencyId?: string | null }).agencyId ?? creator.agencyId,
    });
  }
  res.json({ item });
}

async function rejectProduct(
  req: AuthRequest,
  res: Response,
  model: ProductDelegate,
  productType: ProductKind,
  label: string,
) {
  const id = paramId(req);
  const existing = await model.findFirst({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const creator = existing.createdById ? await db.user.findUnique({ where: { id: String(existing.createdById) } }) : null;
  const item = await model.update({
    where: { id },
    data: {
      ...buildRejectData(existing, req.body.reason || ""),
      updatedById: req.auth?.userId,
    },
    include: PRODUCT_RELATIONS,
  });
  if (creator?.email) {
    await sendEmail({
      to: creator.email,
      subject: `❌ ${label} Rejected: ${item.name}`,
      template: "rejection",
      data: {
        agentName: creator.name,
        productName: item.name,
        productType,
        reason: req.body.reason || "No reason provided",
        approverName: req.auth?.email,
      },
      agencyId: (existing as { agencyId?: string | null }).agencyId ?? creator.agencyId,
    });
  }
  res.json({ item });
}

function registerHotelRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/products/hotels";

  app.get(base, requireAuth, requireCrudPermission("hotels", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const query = parseListQuery(req);
      const where: Record<string, unknown> = { ...agencyScope(req) };
      applyProductListFilters(where, query);
      const city = (req.query.city as string)?.trim();
      const citiesRaw = (req.query.cities as string)?.trim();
      const country = (req.query.country as string)?.trim();
      const cityList = [
        ...new Set(
          (citiesRaw ? citiesRaw.split(",") : city ? [city] : [])
            .map((c) => c.trim())
            .filter(Boolean),
        ),
      ];
      if (cityList.length) {
        where.AND = [
          ...((where.AND as unknown[]) || []),
          {
            OR: cityList.flatMap((c) => [
              { city: { contains: c, mode: "insensitive" } },
              { address: { contains: c, mode: "insensitive" } },
              { destination: { name: { contains: c, mode: "insensitive" } } },
            ]),
          },
        ];
      } else if (country) {
        where.AND = [
          ...((where.AND as unknown[]) || []),
          {
            OR: [
              { country: { contains: country, mode: "insensitive" } },
              { destination: { country: { contains: country, mode: "insensitive" } } },
            ],
          },
        ];
      }
      const starCategory = parseInt(String(req.query.starCategory || ""), 10);
      if (Number.isFinite(starCategory) && starCategory > 0) {
        where.starCategory = starCategory;
      }
      const supplierId = String(req.query.supplierId || "").trim();
      if (supplierId) where.supplierId = supplierId;
      if (query.q) {
        where.AND = [
          ...((where.AND as unknown[]) || []),
          {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { city: { contains: query.q, mode: "insensitive" } },
              { country: { contains: query.q, mode: "insensitive" } },
              { destination: { name: { contains: query.q, mode: "insensitive" } } },
            ],
          },
        ];
      }
      const [items, total] = await Promise.all([
        db.hotelProduct.findMany({ where, include: PRODUCT_RELATIONS, orderBy: { [query.sort]: query.order }, skip: query.skip, take: query.pageSize }),
        db.hotelProduct.count({ where }),
      ]);
      const travelDate = String(req.query.travelDate || "").trim();
      const cityStayCheckIns = parseCityStayCheckIns(req.query.cityStayDates);
      const annotated = await annotateHotelsContractedApplicable(items, {
        travelDate,
        cityStayCheckIns,
        scope: agencyScope(req),
      });
      const recommendedOnly = req.query.recommendedOnly === "true";
      const filtered = recommendedOnly
        ? annotated.filter((item) => item.hasApplicableContractedRate)
        : annotated;
      res.json({
        items: filtered.map((item) => stripCatalogForRole(item, req.auth?.role)),
        total: recommendedOnly ? filtered.length : total,
        page: query.page,
        pageSize: query.pageSize,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  /** Catalogue inventory check (not live supplier availability). */
  app.get(`${base}/:id/catalogue-availability`, requireAuth, requireCrudPermission("hotels", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const hotel = await db.hotelProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!hotel) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const result = checkCatalogueHotelInventory({
        inventory: hotel.inventory,
        blackoutDates: hotel.blackoutDates,
        checkIn: String(req.query.checkIn || ""),
        checkOut: String(req.query.checkOut || ""),
        roomType: req.query.roomType ? String(req.query.roomType) : null,
        rooms: req.query.rooms != null && String(req.query.rooms).trim() !== ""
          ? Math.max(1, Math.round(Number(req.query.rooms)) || 1)
          : 1,
      });
      res.json({
        source: result.source,
        liveSupplier: false,
        ok: result.ok,
        message: result.message || null,
        nights: result.nights,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(base, requireAuth, requireCrudPermission("hotels", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
      if (destError) { res.status(400).json({ error: destError }); return; }
      const item = await db.hotelProduct.create({
        data: {
          ...sanitizeCreateBody(req.body),
          agencyId: req.auth?.agencyId,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
        } as Prisma.HotelProductCreateInput,
        include: PRODUCT_RELATIONS,
      });
      await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.status(201).json({ item, message: "Product saved as draft. Submit rates for admin approval before they go live." });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/duplicate`, requireAuth, requireCrudPermission("hotels", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.hotelProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = existing;
      const item = await db.hotelProduct.create({
        data: {
          ...rest,
          name: `${existing.name} (Copy)`,
          status: "Draft",
          approvalStatus: "Draft",
          pendingRateChanges: Prisma.JsonNull,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
        } as Prisma.HotelProductCreateInput,
      });
      res.status(201).json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id/archive`, requireAuth, requireCrudPermission("hotels", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const item = await db.hotelProduct.update({ where: { id: paramId(req) }, data: { status: "Archived", updatedById: req.auth?.userId } });
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("hotels", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.hotelProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      if (req.body.destinationId !== undefined) {
        const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
        if (destError) { res.status(400).json({ error: destError }); return; }
      }
      const { data, rateChangePending } = buildRateAwareUpdate(existing as Record<string, unknown>, req.body, "hotel");
      const item = await db.hotelProduct.update({
        where: { id },
        data: { ...data, updatedById: req.auth?.userId },
        include: PRODUCT_RELATIONS,
      });
      await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.json({
        item,
        rateChangePending,
        message: rateChangePending
          ? "Rate changes submitted for admin approval. Current live rates remain until approved."
          : "Product updated",
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/import`, requireAuth, requireCrudPermission("hotels", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      let imported = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          if (!row?.name) { failed += 1; continue; }
          await db.hotelProduct.create({
            data: {
              ...sanitizeCreateBody(row),
              agencyId: req.auth?.agencyId,
              createdById: req.auth?.userId,
              updatedById: req.auth?.userId,
            } as Prisma.HotelProductCreateInput,
          });
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      if (imported > 0) await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.json({ imported, failed });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete(`${base}/:id`, requireAuth, requireCrudPermission("hotels", "delete"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.hotelProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      await db.hotelProduct.delete({ where: { id } });
      res.json({ success: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/submit-for-approval`, requireAuth, requireCrudPermission("hotels", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.hotelProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      const item = await db.hotelProduct.update({
        where: { id },
        data: { approvalStatus: "Pending", updatedById: req.auth?.userId },
        include: PRODUCT_RELATIONS,
      });
      res.json({ item, message: "Rates submitted for admin approval." });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/approve`, requireAuth, requireRole(...APPROVER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      await approveProduct(req, res, db.hotelProduct, "hotel", "Hotel");
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/reject`, requireAuth, requireRole(...APPROVER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      await rejectProduct(req, res, db.hotelProduct, "hotel", "Hotel");
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

function registerActivityRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/products/activities";

  app.get(base, requireAuth, requireCrudPermission("activities", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const query = parseListQuery(req);
      const where: Record<string, unknown> = { ...agencyScope(req) };
      applyProductListFilters(where, query);
      const city = (req.query.city as string)?.trim();
      if (city) where.location = { contains: city, mode: "insensitive" };
      if (query.q) {
        where.OR = [
          { name: { contains: query.q, mode: "insensitive" } },
          { location: { contains: query.q, mode: "insensitive" } },
          { destination: { name: { contains: query.q, mode: "insensitive" } } },
        ];
      }
      const [items, total] = await Promise.all([
        db.activityProduct.findMany({ where, include: PRODUCT_RELATIONS, orderBy: { [query.sort]: query.order }, skip: query.skip, take: query.pageSize }),
        db.activityProduct.count({ where }),
      ]);
      res.json({
        items: items.map((item) => stripCatalogForRole(item, req.auth?.role)),
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(base, requireAuth, requireCrudPermission("activities", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
      if (destError) { res.status(400).json({ error: destError }); return; }
      const item = await db.activityProduct.create({
        data: {
          ...sanitizeCreateBody(req.body),
          agencyId: req.auth?.agencyId,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
        } as Prisma.ActivityProductCreateInput,
        include: PRODUCT_RELATIONS,
      });
      await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.status(201).json({ item, message: "Product saved as draft. Submit rates for admin approval before they go live." });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/duplicate`, requireAuth, requireCrudPermission("activities", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.activityProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = existing;
      const item = await db.activityProduct.create({
        data: {
          ...rest,
          name: `${existing.name} (Copy)`,
          status: "Draft",
          approvalStatus: "Draft",
          pendingRateChanges: Prisma.JsonNull,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
        } as Prisma.ActivityProductCreateInput,
      });
      res.status(201).json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id/archive`, requireAuth, requireCrudPermission("activities", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const item = await db.activityProduct.update({ where: { id: paramId(req) }, data: { status: "Archived", updatedById: req.auth?.userId } });
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("activities", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.activityProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      if (req.body.destinationId !== undefined) {
        const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
        if (destError) { res.status(400).json({ error: destError }); return; }
      }
      const { data, rateChangePending } = buildRateAwareUpdate(existing as Record<string, unknown>, req.body, "activity");
      const item = await db.activityProduct.update({
        where: { id },
        data: { ...data, updatedById: req.auth?.userId },
        include: PRODUCT_RELATIONS,
      });
      await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.json({
        item,
        rateChangePending,
        message: rateChangePending
          ? "Rate changes submitted for admin approval. Current live rates remain until approved."
          : "Product updated",
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/import`, requireAuth, requireCrudPermission("activities", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      let imported = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          if (!row?.name) { failed += 1; continue; }
          await db.activityProduct.create({
            data: {
              ...sanitizeCreateBody(row),
              agencyId: req.auth?.agencyId,
              createdById: req.auth?.userId,
              updatedById: req.auth?.userId,
            } as Prisma.ActivityProductCreateInput,
          });
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      if (imported > 0) await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.json({ imported, failed });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete(`${base}/:id`, requireAuth, requireCrudPermission("activities", "delete"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.activityProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      await db.activityProduct.delete({ where: { id } });
      res.json({ success: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/submit-for-approval`, requireAuth, requireCrudPermission("activities", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.activityProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      const item = await db.activityProduct.update({
        where: { id },
        data: { approvalStatus: "Pending", updatedById: req.auth?.userId },
        include: PRODUCT_RELATIONS,
      });
      res.json({ item, message: "Rates submitted for admin approval." });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/approve`, requireAuth, requireRole(...APPROVER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      await approveProduct(req, res, db.activityProduct, "activity", "Activity");
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/reject`, requireAuth, requireRole(...APPROVER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      await rejectProduct(req, res, db.activityProduct, "activity", "Activity");
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

function registerTransferRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/products/transfers";

  app.get(base, requireAuth, requireCrudPermission("transfers", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const query = parseListQuery(req);
      const where: Record<string, unknown> = { ...agencyScope(req) };
      applyProductListFilters(where, query);
      const city = (req.query.city as string)?.trim();
      const country = (req.query.country as string)?.trim();
      const transferType = (req.query.transferType as string)?.trim();
      if (city) {
        where.AND = [
          ...((where.AND as unknown[]) || []),
          {
            OR: [
              { city: { contains: city, mode: "insensitive" } },
              { pickupLocation: { contains: city, mode: "insensitive" } },
              { dropLocation: { contains: city, mode: "insensitive" } },
            ],
          },
        ];
      } else if (country) {
        where.AND = [
          ...((where.AND as unknown[]) || []),
          {
            OR: [
              { city: { in: ["Kuala Lumpur", "Langkawi", "Penang", "Genting Highlands"] } },
              { destination: { country: { contains: country, mode: "insensitive" } } },
            ],
          },
        ];
      }
      if (transferType && transferType !== "All") where.transferType = transferType;
      if (query.q) {
        where.AND = [
          ...((where.AND as unknown[]) || []),
          {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { transferType: { contains: query.q, mode: "insensitive" } },
              { city: { contains: query.q, mode: "insensitive" } },
              { pickupLocation: { contains: query.q, mode: "insensitive" } },
              { dropLocation: { contains: query.q, mode: "insensitive" } },
              { destination: { name: { contains: query.q, mode: "insensitive" } } },
            ],
          },
        ];
      }
      const [items, total] = await Promise.all([
        db.transferProduct.findMany({ where, include: PRODUCT_RELATIONS, orderBy: { [query.sort]: query.order }, skip: query.skip, take: query.pageSize }),
        db.transferProduct.count({ where }),
      ]);
      res.json({
        items: items.map((item) => stripCatalogForRole(item, req.auth?.role)),
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(base, requireAuth, requireCrudPermission("transfers", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
      if (destError) { res.status(400).json({ error: destError }); return; }
      const item = await db.transferProduct.create({
        data: {
          ...sanitizeCreateBody(req.body),
          agencyId: req.auth?.agencyId,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
        } as Prisma.TransferProductCreateInput,
        include: PRODUCT_RELATIONS,
      });
      await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.status(201).json({ item, message: "Product saved as draft. Submit rates for admin approval before they go live." });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/duplicate`, requireAuth, requireCrudPermission("transfers", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.transferProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = existing;
      const item = await db.transferProduct.create({
        data: {
          ...rest,
          name: `${existing.name} (Copy)`,
          status: "Draft",
          approvalStatus: "Draft",
          pendingRateChanges: Prisma.JsonNull,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
        } as Prisma.TransferProductCreateInput,
      });
      res.status(201).json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id/archive`, requireAuth, requireCrudPermission("transfers", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const item = await db.transferProduct.update({ where: { id: paramId(req) }, data: { status: "Archived", updatedById: req.auth?.userId } });
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("transfers", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.transferProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      if (req.body.destinationId !== undefined) {
        const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
        if (destError) { res.status(400).json({ error: destError }); return; }
      }
      const { data, rateChangePending } = buildRateAwareUpdate(existing as Record<string, unknown>, req.body, "transfer");
      const item = await db.transferProduct.update({
        where: { id },
        data: { ...data, updatedById: req.auth?.userId },
        include: PRODUCT_RELATIONS,
      });
      await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.json({
        item,
        rateChangePending,
        message: rateChangePending
          ? "Rate changes submitted for admin approval. Current live rates remain until approved."
          : "Product updated",
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/import`, requireAuth, requireCrudPermission("transfers", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      let imported = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          if (!row?.name || !row?.pickupLocation || !row?.dropLocation) { failed += 1; continue; }
          await db.transferProduct.create({
            data: {
              ...sanitizeCreateBody(row),
              agencyId: req.auth?.agencyId,
              createdById: req.auth?.userId,
              updatedById: req.auth?.userId,
            } as Prisma.TransferProductCreateInput,
          });
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      if (imported > 0) await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.json({ imported, failed });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete(`${base}/:id`, requireAuth, requireCrudPermission("transfers", "delete"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.transferProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      await db.transferProduct.delete({ where: { id } });
      res.json({ success: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/submit-for-approval`, requireAuth, requireCrudPermission("transfers", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.transferProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      const item = await db.transferProduct.update({
        where: { id },
        data: { approvalStatus: "Pending", updatedById: req.auth?.userId },
        include: PRODUCT_RELATIONS,
      });
      res.json({ item, message: "Rates submitted for admin approval." });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/approve`, requireAuth, requireRole(...APPROVER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      await approveProduct(req, res, db.transferProduct, "transfer", "Transfer");
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/reject`, requireAuth, requireRole(...APPROVER_ROLES), async (req: AuthRequest, res: Response) => {
    try {
      await rejectProduct(req, res, db.transferProduct, "transfer", "Transfer");
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

function registerMealRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/products/meals";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mealDelegate = (db as any).mealProduct;

  app.get(base, requireAuth, requireCrudPermission("activities", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const query = parseListQuery(req);
      const mealType = req.query.mealType as string | undefined;
      const city = (req.query.city as string)?.trim();
      const scope = agencyScope(req) as { agencyId?: string };
      if (mealDelegate) {
        const where: Record<string, unknown> = { ...agencyScope(req) };
        applyProductListFilters(where, query);
        if (mealType && mealType !== "All") where.mealType = mealType;
        if (city) where.city = { contains: city, mode: "insensitive" };
        if (query.q) {
          where.OR = [
            { name: { contains: query.q, mode: "insensitive" } },
            { city: { contains: query.q, mode: "insensitive" } },
            { description: { contains: query.q, mode: "insensitive" } },
          ];
        }
        const [items, total] = await Promise.all([
          mealDelegate.findMany({
            where,
            include: PRODUCT_RELATIONS,
            orderBy: { [query.sort]: query.order },
            skip: query.skip,
            take: query.pageSize,
          }),
          mealDelegate.count({ where }),
        ]);
        res.json({
          items: items.map((item: { supplier?: unknown; supplierId?: string | null }) => stripCatalogForRole(item, req.auth?.role)),
          total,
          page: query.page,
          pageSize: query.pageSize,
        });
        return;
      }
      const agencyId = scope.agencyId ?? null;
      const items = await db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "MealProduct"
         WHERE ($1::text IS NULL OR "agencyId" = $1)
         AND ($2::text IS NULL OR "mealType" = $2)
         AND ($3::text IS NULL OR "city" ILIKE '%' || $3 || '%' OR "name" ILIKE '%' || $3 || '%')
         AND "status" = 'Active'
         ORDER BY "createdAt" DESC
         LIMIT $4 OFFSET $5`,
        agencyId,
        mealType && mealType !== "All" ? mealType : null,
        city || query.q || null,
        query.pageSize,
        query.skip
      );
      res.json({
        items: items.map((item: Record<string, unknown>) => stripCatalogForRole(item, req.auth?.role)),
        total: items.length,
        page: query.page,
        pageSize: query.pageSize,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(base, requireAuth, requireCrudPermission("activities", "add"), async (req: AuthRequest, res: Response) => {
    try {
      if (req.body.destinationId) {
        const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
        if (destError) { res.status(400).json({ error: destError }); return; }
      }
      const name = String(req.body.name || "").trim();
      if (!name) { res.status(400).json({ error: "name is required" }); return; }
      if (mealDelegate) {
        const item = await mealDelegate.create({
          data: {
            agencyId: req.auth?.agencyId,
            supplierId: req.body.supplierId || null,
            destinationId: req.body.destinationId || null,
            name,
            description: req.body.description || null,
            mealType: req.body.mealType || "Other",
            city: req.body.city || null,
            restaurant: req.body.restaurant || null,
            transferInclusion: req.body.transferInclusion === "PRIVATE" ? "PRIVATE" : "NONE",
            adultPrice: Number(req.body.adultPrice) || 0,
            childPrice: Number(req.body.childPrice) || 0,
            currency: req.body.currency || "INR",
            status: "Active",
            approvalStatus: "Approved",
            createdById: req.auth?.userId,
            updatedById: req.auth?.userId,
          },
          include: PRODUCT_RELATIONS,
        });
        await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
        res.status(201).json({ item });
        return;
      }
      const id = `meal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "MealProduct" ("id","agencyId","supplierId","destinationId","name","description","mealType","city","adultPrice","childPrice","currency","status","approvalStatus","createdById","updatedById","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Active','Approved',$12,$12,NOW(),NOW())`,
        id,
        req.auth?.agencyId ?? null,
        req.body.supplierId || null,
        req.body.destinationId || null,
        name,
        req.body.description || null,
        req.body.mealType || "Other",
        req.body.city || null,
        Number(req.body.adultPrice) || 0,
        Number(req.body.childPrice) || 0,
        req.body.currency || "INR",
        req.auth?.userId ?? null
      );
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "MealProduct" WHERE id = $1`, id);
      await trackProductActivity(req.auth!.userId, req.auth?.agencyId);
      res.status(201).json({ item: rows[0] });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("activities", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      if (mealDelegate) {
        const existing = await mealDelegate.findFirst({ where: { id, ...agencyScope(req) } });
        if (!existing) { res.status(404).json({ error: "Not found" }); return; }
        if (req.body.destinationId) {
          const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
          if (destError) { res.status(400).json({ error: destError }); return; }
        }
        const item = await mealDelegate.update({
          where: { id },
          data: {
            ...(req.body.name !== undefined ? { name: String(req.body.name) } : {}),
            ...(req.body.description !== undefined ? { description: req.body.description } : {}),
            ...(req.body.mealType !== undefined ? { mealType: req.body.mealType } : {}),
            ...(req.body.city !== undefined ? { city: req.body.city } : {}),
            ...(req.body.restaurant !== undefined ? { restaurant: req.body.restaurant || null } : {}),
            ...(req.body.transferInclusion !== undefined ? { transferInclusion: req.body.transferInclusion === "PRIVATE" ? "PRIVATE" : "NONE" } : {}),
            ...(req.body.destinationId !== undefined ? { destinationId: req.body.destinationId || null } : {}),
            ...(req.body.supplierId !== undefined ? { supplierId: req.body.supplierId || null } : {}),
            ...(req.body.adultPrice !== undefined ? { adultPrice: Number(req.body.adultPrice) || 0 } : {}),
            ...(req.body.childPrice !== undefined ? { childPrice: Number(req.body.childPrice) || 0 } : {}),
            ...(req.body.currency !== undefined ? { currency: req.body.currency } : {}),
            ...(req.body.status !== undefined ? { status: req.body.status } : {}),
            updatedById: req.auth?.userId,
          },
          include: PRODUCT_RELATIONS,
        });
        res.json({ item });
        return;
      }
      await db.$executeRawUnsafe(
        `UPDATE "MealProduct" SET
          "name" = COALESCE($2, "name"),
          "description" = COALESCE($3, "description"),
          "mealType" = COALESCE($4, "mealType"),
          "city" = COALESCE($5, "city"),
          "adultPrice" = COALESCE($6, "adultPrice"),
          "childPrice" = COALESCE($7, "childPrice"),
          "currency" = COALESCE($8, "currency"),
          "status" = COALESCE($9, "status"),
          "updatedById" = $10,
          "updatedAt" = NOW()
         WHERE id = $1`,
        id,
        req.body.name !== undefined ? String(req.body.name) : null,
        req.body.description !== undefined ? req.body.description : null,
        req.body.mealType !== undefined ? req.body.mealType : null,
        req.body.city !== undefined ? req.body.city : null,
        req.body.adultPrice !== undefined ? Number(req.body.adultPrice) || 0 : null,
        req.body.childPrice !== undefined ? Number(req.body.childPrice) || 0 : null,
        req.body.currency !== undefined ? req.body.currency : null,
        req.body.status !== undefined ? req.body.status : null,
        req.auth?.userId ?? null
      );
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "MealProduct" WHERE id = $1`, id);
      if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
      res.json({ item: rows[0] });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete(`${base}/:id`, requireAuth, requireCrudPermission("activities", "delete"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      if (mealDelegate) {
        const existing = await mealDelegate.findFirst({ where: { id, ...agencyScope(req) } });
        if (!existing) { res.status(404).json({ error: "Not found" }); return; }
        await mealDelegate.delete({ where: { id } });
        res.json({ success: true });
        return;
      }
      await db.$executeRawUnsafe(`DELETE FROM "MealProduct" WHERE id = $1`, id);
      res.json({ success: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

function registerFlightRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/products/flights";

  app.get(base, requireAuth, requireCrudPermission("flights", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const query = parseListQuery(req);
      const where: Record<string, unknown> = { ...agencyScope(req) };
      applyProductListFilters(where, query);
      const city = (req.query.city as string)?.trim();
      if (city) {
        where.OR = [
          { origin: { contains: city, mode: "insensitive" } },
          { destinationAirport: { contains: city, mode: "insensitive" } },
          { name: { contains: city, mode: "insensitive" } },
        ];
      }
      if (query.q) {
        where.OR = [
          { name: { contains: query.q, mode: "insensitive" } },
          { airline: { contains: query.q, mode: "insensitive" } },
          { flightNumber: { contains: query.q, mode: "insensitive" } },
          { origin: { contains: query.q, mode: "insensitive" } },
          { destinationAirport: { contains: query.q, mode: "insensitive" } },
        ];
      }
      const [items, total] = await Promise.all([
        db.flightProduct.findMany({ where, include: PRODUCT_RELATIONS, orderBy: { [query.sort]: query.order }, skip: query.skip, take: query.pageSize }),
        db.flightProduct.count({ where }),
      ]);
      res.json({
        items: items.map((item) => stripCatalogForRole(item, req.auth?.role)),
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(base, requireAuth, requireCrudPermission("flights", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body.name || req.body.airline || "").trim();
      const airline = String(req.body.airline || "").trim();
      const origin = String(req.body.origin || "").trim();
      const destinationAirport = String(req.body.destinationAirport || req.body.to || "").trim();
      if (!name || !airline || !origin || !destinationAirport) {
        res.status(400).json({ error: "name, airline, origin, and destinationAirport are required" });
        return;
      }
      if (req.body.destinationId) {
        const destError = await assertValidDestination(req, req.body.destinationId, agencyScope);
        if (destError) { res.status(400).json({ error: destError }); return; }
      }
      const item = await db.flightProduct.create({
        data: {
          agencyId: req.auth?.agencyId,
          supplierId: req.body.supplierId || null,
          destinationId: req.body.destinationId || null,
          name,
          airline,
          flightNumber: req.body.flightNumber || null,
          origin,
          destinationAirport,
          departureTime: req.body.departureTime || null,
          arrivalTime: req.body.arrivalTime || null,
          duration: req.body.duration || null,
          cabinClass: req.body.cabinClass || null,
          baggage: req.body.baggage || null,
          currency: req.body.currency || "INR",
          status: req.body.status || "Active",
          approvalStatus: "Approved",
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
        },
        include: PRODUCT_RELATIONS,
      });
      res.status(201).json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("flights", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.flightProduct.findFirst({ where: { id, ...agencyScope(req) } });
      if (!existing) { res.status(404).json({ error: "Not found" }); return; }
      const item = await db.flightProduct.update({
        where: { id },
        data: {
          ...(req.body.name !== undefined ? { name: String(req.body.name) } : {}),
          ...(req.body.airline !== undefined ? { airline: String(req.body.airline) } : {}),
          ...(req.body.flightNumber !== undefined ? { flightNumber: req.body.flightNumber || null } : {}),
          ...(req.body.origin !== undefined ? { origin: String(req.body.origin) } : {}),
          ...(req.body.destinationAirport !== undefined ? { destinationAirport: String(req.body.destinationAirport) } : {}),
          ...(req.body.departureTime !== undefined ? { departureTime: req.body.departureTime || null } : {}),
          ...(req.body.arrivalTime !== undefined ? { arrivalTime: req.body.arrivalTime || null } : {}),
          ...(req.body.duration !== undefined ? { duration: req.body.duration || null } : {}),
          ...(req.body.cabinClass !== undefined ? { cabinClass: req.body.cabinClass || null } : {}),
          ...(req.body.baggage !== undefined ? { baggage: req.body.baggage || null } : {}),
          ...(req.body.supplierId !== undefined ? { supplierId: req.body.supplierId || null } : {}),
          ...(req.body.destinationId !== undefined ? { destinationId: req.body.destinationId || null } : {}),
          ...(req.body.status !== undefined ? { status: req.body.status } : {}),
          ...(req.body.currency !== undefined ? { currency: req.body.currency } : {}),
          updatedById: req.auth?.userId,
        },
        include: PRODUCT_RELATIONS,
      });
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

function registerSightseeingRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/products/sightseeing-places";
  const include = { destination: { select: { id: true, name: true, city: true, country: true, heroImage: true } } };

  app.get(base, requireAuth, requireCrudPermission("destinations", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const destinationId = typeof req.query.destinationId === "string" ? req.query.destinationId.trim() : "";
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const liveOnly = req.query.liveOnly === "true";
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
      const where: Prisma.SightseeingPlaceWhereInput = {
        AND: [
          agencyScope(req) as Prisma.SightseeingPlaceWhereInput,
          destinationId ? { destinationId } : {},
          liveOnly || status === "Active" ? { status: "Active" } : status ? { status } : {},
          q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
                  { famousFor: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      };
      const [items, total] = await Promise.all([
        db.sightseeingPlace.findMany({
          where,
          include,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.sightseeingPlace.count({ where }),
      ]);
      res.json({ items, total, page, pageSize });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id`, requireAuth, requireCrudPermission("destinations", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const item = await db.sightseeingPlace.findFirst({
        where: { id: paramId(req), ...(agencyScope(req) as object) },
        include,
      });
      if (!item) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(base, requireAuth, requireCrudPermission("destinations", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body || {};
      const destinationId = String(body.destinationId || "").trim();
      const name = String(body.name || "").trim();
      if (!destinationId || !name) {
        res.status(400).json({ error: "destinationId and name are required" });
        return;
      }
      const dest = await db.destination.findFirst({
        where: { id: destinationId, deletedAt: null },
        select: { id: true },
      });
      if (!dest) {
        res.status(400).json({ error: "Destination not found" });
        return;
      }
      const item = await db.sightseeingPlace.create({
        data: {
          agencyId: (req.auth as { agencyId?: string } | undefined)?.agencyId ?? null,
          destinationId,
          name,
          description: body.description != null ? String(body.description) : null,
          imageUrl: body.imageUrl != null ? String(body.imageUrl) : null,
          bestTimeToVisit: body.bestTimeToVisit != null ? String(body.bestTimeToVisit) : null,
          famousFor: body.famousFor != null ? String(body.famousFor) : null,
          suggestedDuration: body.suggestedDuration != null ? String(body.suggestedDuration) : null,
          sellingPrice: body.sellingPrice != null && body.sellingPrice !== "" ? Number(body.sellingPrice) : null,
          costPrice: body.costPrice != null && body.costPrice !== "" ? Number(body.costPrice) : null,
          currency: String(body.currency || "INR"),
          status: String(body.status || "Active"),
          sortOrder: Number(body.sortOrder || 0) || 0,
        },
        include,
      });
      res.status(201).json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("destinations", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await db.sightseeingPlace.findFirst({
        where: { id: paramId(req), ...(agencyScope(req) as object) },
      });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const body = req.body || {};
      const data: Prisma.SightseeingPlaceUpdateInput = {};
      if (body.name != null) data.name = String(body.name).trim();
      if (body.description !== undefined) data.description = body.description == null ? null : String(body.description);
      if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl == null ? null : String(body.imageUrl);
      if (body.bestTimeToVisit !== undefined) data.bestTimeToVisit = body.bestTimeToVisit == null ? null : String(body.bestTimeToVisit);
      if (body.famousFor !== undefined) data.famousFor = body.famousFor == null ? null : String(body.famousFor);
      if (body.suggestedDuration !== undefined) data.suggestedDuration = body.suggestedDuration == null ? null : String(body.suggestedDuration);
      if (body.sellingPrice !== undefined) data.sellingPrice = body.sellingPrice === "" || body.sellingPrice == null ? null : Number(body.sellingPrice);
      if (body.costPrice !== undefined) data.costPrice = body.costPrice === "" || body.costPrice == null ? null : Number(body.costPrice);
      if (body.currency != null) data.currency = String(body.currency);
      if (body.status != null) data.status = String(body.status);
      if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder) || 0;
      if (body.destinationId != null) {
        data.destination = { connect: { id: String(body.destinationId) } };
      }
      const item = await db.sightseeingPlace.update({
        where: { id: existing.id },
        data,
        include,
      });
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete(`${base}/:id`, requireAuth, requireCrudPermission("destinations", "delete"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await db.sightseeingPlace.findFirst({
        where: { id: paramId(req), ...(agencyScope(req) as object) },
      });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      await db.sightseeingPlace.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

export function mountProductRoutes(app: Express, agencyScope: ScopeFn) {
  registerHotelRoutes(app, agencyScope);
  registerActivityRoutes(app, agencyScope);
  registerTransferRoutes(app, agencyScope);
  registerMealRoutes(app, agencyScope);
  registerFlightRoutes(app, agencyScope);
  registerSightseeingRoutes(app, agencyScope);

  app.get("/api/employees/activity", requireAuth, requirePermission("employees"), async (req: AuthRequest, res: Response) => {
    try {
      const snapshots = await db.employeeActivitySnapshot.findMany({
        where: agencyScope(req),
        orderBy: { date: "desc" },
        take: 100,
      });
      res.json({ activity: snapshots, total: snapshots.length });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const now = new Date();
      const snap = await db.employeeActivitySnapshot.findUnique({
        where: { userId_date: { userId: req.auth!.userId, date } },
      });
      const workingMinutes = snap?.loginAt ? Math.round((now.getTime() - snap.loginAt.getTime()) / 60000) : 0;
      await db.employeeActivitySnapshot.upsert({
        where: { userId_date: { userId: req.auth!.userId, date } },
        create: { userId: req.auth!.userId, agencyId: req.auth?.agencyId, date, logoutAt: now, workingMinutes, lastActivity: "Logout" },
        update: { logoutAt: now, workingMinutes, lastActivity: "Logout" },
      });
      await db.auditLog.create({
        data: { userId: req.auth!.userId, agencyId: req.auth?.agencyId, userName: req.auth!.email, action: "Logout", module: "Auth", ip: req.ip || "0.0.0.0" },
      });
      res.json({ ok: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/customers/:id/documents", requireAuth, requirePermission("customers"), async (req: AuthRequest, res: Response) => {
    try {
      const customerId = paramId(req);
      const documents = await db.customerDocument.findMany({
        where: { customerId, ...agencyScope(req) },
        orderBy: { createdAt: "desc" },
      });
      res.json({ documents });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/customers/:id/documents", requireAuth, requirePermission("customers"), async (req: AuthRequest, res: Response) => {
    try {
      const document = await db.customerDocument.create({
        data: {
          customerId: paramId(req),
          agencyId: req.auth?.agencyId,
          name: req.body.name,
          type: req.body.type,
          url: req.body.url,
          uploadedBy: req.auth?.email,
        },
      });
      res.status(201).json({ document });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}
