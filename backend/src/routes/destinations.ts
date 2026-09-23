import type { Express, Response } from "express";
import type { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAuth, requireCrudPermission } from "../middleware/auth.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import {
  validate,
  destinationSchema,
  destinationUpdateSchema,
  destinationBulkDeleteSchema,
  destinationBulkStatusSchema,
  destinationImportSchema,
} from "../lib/validation.js";
import { buildVisaCatalogueRecommendation } from "../lib/visa-recommendation.js";

type ScopeFn = (req: AuthRequest) => Record<string, unknown>;

function parseListQuery(req: AuthRequest) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const q = (req.query.q as string)?.trim();
  const status = req.query.status as string | undefined;
  const country = req.query.country as string | undefined;
  const region = req.query.region as string | undefined;
  const sort = (req.query.sort as string) || "createdAt";
  const order = (req.query.order as string) === "asc" ? "asc" : "desc";
  return { page, pageSize, q, status, country, region, sort, order, skip: (page - 1) * pageSize };
}

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(agencyId: string | null | undefined, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (true) {
    const existing = await db.destination.findFirst({
      where: {
        agencyId: agencyId ?? null,
        slug,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (!existing) return slug;
    counter += 1;
    slug = `${base}-${counter}`;
  }
}

function authMeta(req: AuthRequest) {
  return {
    createdById: req.auth?.userId,
    updatedById: req.auth?.userId,
    createdByName: req.auth?.email,
    updatedByName: req.auth?.email,
    agencyId: req.auth?.agencyId,
    branchId: req.auth?.branchId ?? req.body?.branchId ?? undefined,
  };
}

const SORTABLE = new Set(["createdAt", "updatedAt", "name", "country", "region", "status"]);

const LINKED_PRODUCT_INCLUDE = {
  supplier: { select: { id: true, name: true } },
};

async function countLinkedProducts(destinationId: string) {
  const [hotels, activities, transfers] = await Promise.all([
    db.hotelProduct.count({ where: { destinationId } }),
    db.activityProduct.count({ where: { destinationId } }),
    db.transferProduct.count({ where: { destinationId } }),
  ]);
  return { hotels, activities, transfers, total: hotels + activities + transfers };
}

export function mountDestinationRoutes(app: Express, agencyScope: ScopeFn) {
  const base = "/api/destinations";

  app.get(base, requireAuth, requireCrudPermission("destinations", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const { page, pageSize, q, status, country, region, sort, order, skip } = parseListQuery(req);
      const where: Prisma.DestinationWhereInput = {
        ...agencyScope(req),
        deletedAt: null,
      };
      if (status && status !== "All") where.status = status;
      if (country && country !== "All") where.country = country;
      if (region && region !== "All") where.region = region;
      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { country: { contains: q, mode: "insensitive" } },
          { region: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ];
      }
      const orderBy = SORTABLE.has(sort) ? { [sort]: order } : { createdAt: "desc" as const };
      const [items, total] = await Promise.all([
        db.destination.findMany({ where, orderBy, skip, take: pageSize }),
        db.destination.count({ where }),
      ]);
      res.setHeader("Cache-Control", "no-store");
      res.json({ items, total, page, pageSize });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/filters`, requireAuth, requireCrudPermission("destinations", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const where: Prisma.DestinationWhereInput = { ...agencyScope(req), deletedAt: null };
      const rows = await db.destination.findMany({
        where,
        select: { country: true, region: true },
      });
      const countries = [...new Set(rows.map((r: { country: string }) => r.country).filter(Boolean))].sort();
      const regions = [...new Set(rows.map((r: { region: string | null }) => r.region).filter(Boolean))].sort() as string[];
      res.json({ countries, regions });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  /** Catalogue visa recommendation — not immigration advice. */
  app.get(`${base}/visa-recommendation`, requireAuth, requireCrudPermission("destinations", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const q = String(req.query.q || req.query.destination || "").trim();
      const country = String(req.query.country || "").trim();
      if (!q && !country) {
        res.status(400).json({ error: "destination or country required" });
        return;
      }
      const where: Prisma.DestinationWhereInput = {
        ...agencyScope(req),
        deletedAt: null,
        status: "Active",
      };
      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { country: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
        ];
      } else if (country) {
        where.country = { contains: country, mode: "insensitive" };
      }
      const hit = await db.destination.findFirst({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true, country: true, visaRequired: true, visaDetails: true },
      });
      if (!hit) {
        res.json({
          recommendation: buildVisaCatalogueRecommendation({
            name: q || country || "Destination",
            country: country || null,
            visaRequired: false,
            visaDetails: "No destination catalogue match. Confirm visa requirements independently.",
          }),
          matched: false,
        });
        return;
      }
      res.json({
        recommendation: buildVisaCatalogueRecommendation(hit),
        matched: true,
        destinationId: hit.id,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id/products`, requireAuth, requireCrudPermission("destinations", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.destination.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const [hotels, activities, transfers, sightseeingPlaces] = await Promise.all([
        db.hotelProduct.findMany({
          where: { destinationId: id, ...agencyScope(req) },
          include: LINKED_PRODUCT_INCLUDE,
          orderBy: { updatedAt: "desc" },
        }),
        db.activityProduct.findMany({
          where: { destinationId: id, ...agencyScope(req) },
          include: LINKED_PRODUCT_INCLUDE,
          orderBy: { updatedAt: "desc" },
        }),
        db.transferProduct.findMany({
          where: { destinationId: id, ...agencyScope(req) },
          include: LINKED_PRODUCT_INCLUDE,
          orderBy: { updatedAt: "desc" },
        }),
        db.sightseeingPlace.findMany({
          where: { destinationId: id, ...(agencyScope(req) as object) },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
      ]);
      res.json({ hotels, activities, transfers, sightseeingPlaces });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get(`${base}/:id`, requireAuth, requireCrudPermission("destinations", "view"), async (req: AuthRequest, res: Response) => {
    try {
      const item = await db.destination.findFirst({
        where: { id: paramId(req), ...agencyScope(req), deletedAt: null },
        include: {
          _count: {
            select: {
              hotelProducts: true,
              activityProducts: true,
              transferProducts: true,
              sightseeingPlaces: true,
            },
          },
        },
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

  app.post(base, requireAuth, requireCrudPermission("destinations", "add"), validate(destinationSchema), async (req: AuthRequest, res: Response) => {
    try {
      const meta = authMeta(req);
      const baseSlug = slugify(req.body.slug || req.body.name);
      const slug = await uniqueSlug(meta.agencyId, baseSlug);
      const item = await db.destination.create({
        data: {
          ...req.body,
          slug,
          agencyId: meta.agencyId,
          branchId: req.body.branchId ?? meta.branchId,
          createdById: meta.createdById,
          updatedById: meta.updatedById,
          createdByName: meta.createdByName,
          updatedByName: meta.updatedByName,
        },
      });
      res.status(201).json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id`, requireAuth, requireCrudPermission("destinations", "edit"), validate(destinationUpdateSchema), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.destination.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      let slug = existing.slug;
      if (req.body.slug && req.body.slug !== existing.slug) {
        slug = await uniqueSlug(existing.agencyId, slugify(req.body.slug), id);
      } else if (req.body.name && req.body.name !== existing.name && !req.body.slug) {
        slug = await uniqueSlug(existing.agencyId, slugify(req.body.name), id);
      }
      const item = await db.destination.update({
        where: { id },
        data: {
          ...req.body,
          slug,
          updatedById: req.auth?.userId,
          updatedByName: req.auth?.email,
        },
      });
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/:id/archive`, requireAuth, requireCrudPermission("destinations", "edit"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.destination.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const item = await db.destination.update({
        where: { id },
        data: { status: "Archived", updatedById: req.auth?.userId, updatedByName: req.auth?.email },
      });
      res.json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/:id/duplicate`, requireAuth, requireCrudPermission("destinations", "add"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.destination.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        slug: _slug,
        ...rest
      } = existing;
      const slug = await uniqueSlug(existing.agencyId, slugify(`${existing.name}-copy`));
      const item = await db.destination.create({
        data: {
          ...rest,
          popularAttractions: existing.popularAttractions as Prisma.InputJsonValue,
          foodSpecialities: existing.foodSpecialities as Prisma.InputJsonValue,
          adventureActivities: existing.adventureActivities as Prisma.InputJsonValue,
          galleryImages: existing.galleryImages as Prisma.InputJsonValue,
          keywords: existing.keywords as Prisma.InputJsonValue,
          metadata: existing.metadata as Prisma.InputJsonValue,
          name: `${existing.name} (Copy)`,
          slug,
          status: "Draft",
          createdById: req.auth?.userId,
          updatedById: req.auth?.userId,
          createdByName: req.auth?.email,
          updatedByName: req.auth?.email,
        },
      });
      res.status(201).json({ item });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete(`${base}/:id`, requireAuth, requireCrudPermission("destinations", "delete"), async (req: AuthRequest, res: Response) => {
    try {
      const id = paramId(req);
      const existing = await db.destination.findFirst({ where: { id, ...agencyScope(req), deletedAt: null } });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const linked = await countLinkedProducts(id);
      if (linked.total > 0) {
        res.status(409).json({
          error: "This destination contains linked products.",
          linkedProducts: linked,
        });
        return;
      }
      await db.destination.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: req.auth?.userId, updatedByName: req.auth?.email },
      });
      res.json({ ok: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/bulk-delete`, requireAuth, requireCrudPermission("destinations", "delete"), validate(destinationBulkDeleteSchema), async (req: AuthRequest, res: Response) => {
    try {
      const ids: string[] = req.body.ids;
      const blocked: string[] = [];
      for (const id of ids) {
        const linked = await countLinkedProducts(id);
        if (linked.total > 0) blocked.push(id);
      }
      if (blocked.length > 0) {
        res.status(409).json({
          error: "This destination contains linked products.",
          blockedIds: blocked,
        });
        return;
      }
      const result = await db.destination.updateMany({
        where: { id: { in: ids }, ...agencyScope(req), deletedAt: null },
        data: { deletedAt: new Date(), updatedById: req.auth?.userId, updatedByName: req.auth?.email },
      });
      res.json({ deleted: result.count });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch(`${base}/bulk-status`, requireAuth, requireCrudPermission("destinations", "edit"), validate(destinationBulkStatusSchema), async (req: AuthRequest, res: Response) => {
    try {
      const { ids, status } = req.body as { ids: string[]; status: string };
      const result = await db.destination.updateMany({
        where: { id: { in: ids }, ...agencyScope(req), deletedAt: null },
        data: { status, updatedById: req.auth?.userId, updatedByName: req.auth?.email },
      });
      res.json({ updated: result.count });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post(`${base}/import`, requireAuth, requireCrudPermission("destinations", "add"), validate(destinationImportSchema), async (req: AuthRequest, res: Response) => {
    try {
      const rows = req.body.rows as Record<string, unknown>[];
      let imported = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          if (!row?.name || !row?.country) {
            failed += 1;
            continue;
          }
          const slug = await uniqueSlug(req.auth?.agencyId, slugify(String(row.slug || row.name)));
          await db.destination.create({
            data: {
              ...(row as Prisma.DestinationCreateInput),
              slug,
              agencyId: req.auth?.agencyId,
              branchId: (row.branchId as string) ?? req.auth?.branchId ?? undefined,
              createdById: req.auth?.userId,
              updatedById: req.auth?.userId,
              createdByName: req.auth?.email,
              updatedByName: req.auth?.email,
            },
          });
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      res.json({ imported, failed });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}
