import type { Express, Response } from "express";
import { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAuth, requireCrudPermission, requirePermission, requireRole } from "../middleware/auth.js";
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

type ScopeFn = (req: AuthRequest) => Record<string, unknown>;

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
      if (query.q) {
        where.OR = [
          { name: { contains: query.q, mode: "insensitive" } },
          { city: { contains: query.q, mode: "insensitive" } },
          { country: { contains: query.q, mode: "insensitive" } },
          { destination: { name: { contains: query.q, mode: "insensitive" } } },
        ];
      }
      const [items, total] = await Promise.all([
        db.hotelProduct.findMany({ where, include: PRODUCT_RELATIONS, orderBy: { [query.sort]: query.order }, skip: query.skip, take: query.pageSize }),
        db.hotelProduct.count({ where }),
      ]);
      res.json({ items, total, page: query.page, pageSize: query.pageSize });
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
      res.json({ items, total, page: query.page, pageSize: query.pageSize });
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
      if (query.q) {
        where.OR = [
          { name: { contains: query.q, mode: "insensitive" } },
          { pickupLocation: { contains: query.q, mode: "insensitive" } },
          { dropLocation: { contains: query.q, mode: "insensitive" } },
          { destination: { name: { contains: query.q, mode: "insensitive" } } },
        ];
      }
      const [items, total] = await Promise.all([
        db.transferProduct.findMany({ where, include: PRODUCT_RELATIONS, orderBy: { [query.sort]: query.order }, skip: query.skip, take: query.pageSize }),
        db.transferProduct.count({ where }),
      ]);
      res.json({ items, total, page: query.page, pageSize: query.pageSize });
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

export function mountProductRoutes(app: Express, agencyScope: ScopeFn) {
  registerHotelRoutes(app, agencyScope);
  registerActivityRoutes(app, agencyScope);
  registerTransferRoutes(app, agencyScope);

  app.get("/api/suppliers", requireAuth, requirePermission("suppliers"), async (req: AuthRequest, res: Response) => {
    try {
      const suppliers = await db.supplier.findMany({ where: agencyScope(req), orderBy: { createdAt: "desc" } });
      res.json({ suppliers, total: suppliers.length });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/suppliers", requireAuth, requirePermission("suppliers"), async (req: AuthRequest, res: Response) => {
    try {
      const supplier = await db.supplier.create({ data: { ...req.body, agencyId: req.auth?.agencyId } });
      res.status(201).json({ supplier });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

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
