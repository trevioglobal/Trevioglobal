import type { Express, Response } from "express";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import {
  QUOTE_INCLUDE,
  buildTermsSnapshot,
  calcPackageCosting,
  canTransition,
  isAgentLike,
  maxDiscountPercent,
  nextQuoteNo,
  nightsBetween,
  normalizeStatus,
  notifyQuote,
  expireDueQuotations,
  restorePackagesFromSnapshot,
  sanitizeQuotationForRole,
  snapshotVersion,
  writeQuoteAudit,
} from "../lib/quotations.js";
import { sendHtmlEmail } from "../lib/email.js";
import { escapeHtml } from "../lib/html.js";

type ScopeFn = (req: AuthRequest) => Record<string, unknown>;
type OwnAgencyFn = (req: AuthRequest, fallback?: string) => string | undefined;
type OwnBranchFn = (req: AuthRequest) => string | undefined;
type BranchScopeFn = (req: AuthRequest, ownField?: string) => Record<string, unknown>;

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : String(id ?? "");
}

function parsePagination(req: AuthRequest) {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function packageWriteData(
  pkg: Record<string, unknown>,
  costing: ReturnType<typeof calcPackageCosting>,
) {
  return {
    name: String(pkg.name || "Package"),
    sortOrder: Number(pkg.sortOrder || 0),
    isSelected: Boolean(pkg.isSelected),
    description: pkg.description != null ? String(pkg.description) : undefined,
    hotels: pkg.hotels || [],
    flights: pkg.flights || [],
    transfers: pkg.transfers || [],
    activities: pkg.activities || [],
    meals: pkg.meals || [],
    itinerary: pkg.itinerary || [],
    visa: pkg.visa ?? undefined,
    insurance: pkg.insurance ?? undefined,
    addOns: pkg.addOns || [],
    inclusions: pkg.inclusions || [],
    exclusions: pkg.exclusions || [],
    totalNetCost: costing.totalNetCost,
    totalSelling: costing.totalSelling,
    grossProfit: costing.grossProfit,
    gst: costing.gst,
    total: costing.total,
    perPersonCost: costing.perPersonCost,
  };
}

async function loadQuote(req: AuthRequest, agencyScope: ScopeFn, branchScope: BranchScopeFn) {
  return db.quotation.findFirst({
    where: {
      id: paramId(req),
      deletedAt: null,
      ...agencyScope(req),
      ...branchScope(req, "createdById"),
    },
    include: QUOTE_INCLUDE,
  });
}

function applyCostingToQuote(
  quote: {
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
    taxRate?: number | null;
    discountType?: string | null;
    discountValue?: number | null;
  },
  packages: Array<Record<string, unknown>>,
) {
  const selected =
    packages.find((p) => p.isSelected) ||
    packages[0] ||
    null;
  if (!selected) {
    return {
      totalNetCost: 0,
      totalSelling: 0,
      grossProfit: 0,
      profitMargin: 0,
      discountAmount: 0,
      taxableAmount: 0,
      gst: 0,
      total: 0,
      amount: 0,
      perPersonCost: 0,
      items: 0,
    };
  }
  const costing = calcPackageCosting({
    hotels: selected.hotels,
    flights: selected.flights,
    transfers: selected.transfers,
    activities: selected.activities,
    meals: selected.meals,
    addOns: selected.addOns,
    visa: selected.visa as { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null,
    insurance: selected.insurance as { enabled?: boolean; costPrice?: number; sellingPrice?: number } | null,
    taxRate: Number(quote.taxRate ?? 18),
    discountType: quote.discountType,
    discountValue: Number(quote.discountValue || 0),
    adults: quote.adults ?? 2,
    children: quote.children ?? 0,
    infants: quote.infants ?? 0,
  });
  return {
    ...costing,
    amount: costing.totalSelling,
    items: packages.length,
  };
}

export function mountQuotationRoutes(
  app: Express,
  agencyScope: ScopeFn,
  ownAgencyId: OwnAgencyFn,
  ownBranchId: OwnBranchFn,
  branchScope: BranchScopeFn,
) {
  // ── List with filters / sort / pagination ────────────────────────────────
  app.get("/api/quotations/manage", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      await expireDueQuotations({ ...agencyScope(req) });
      const { skip, take, page, pageSize } = parsePagination(req);
      const where: Record<string, unknown> = {
        deletedAt: null,
        ...agencyScope(req),
        ...branchScope(req, "createdById"),
      };
      if (req.query.includeArchived !== "true") {
        where.archivedAt = null;
        where.status = { not: "Archived" };
      }
      if (req.query.status && req.query.status !== "All") where.status = String(req.query.status);
      if (req.query.destination) where.destination = { contains: String(req.query.destination), mode: "insensitive" };
      if (req.query.currency) where.currency = String(req.query.currency);
      if (req.query.createdBy) where.createdBy = { contains: String(req.query.createdBy), mode: "insensitive" };
      if (req.query.salesExecutive) {
        where.salesExecutiveName = { contains: String(req.query.salesExecutive), mode: "insensitive" };
      }
      if (req.query.agent) where.agentName = { contains: String(req.query.agent), mode: "insensitive" };
      if (req.query.travelFrom) {
        where.travelStartDate = { gte: String(req.query.travelFrom) };
      }
      if (req.query.travelTo) {
        where.travelEndDate = { lte: String(req.query.travelTo) };
      }
      if (req.query.createdFrom || req.query.createdTo) {
        const createdAt: Record<string, Date> = {};
        if (req.query.createdFrom) createdAt.gte = new Date(String(req.query.createdFrom));
        if (req.query.createdTo) {
          const end = new Date(String(req.query.createdTo));
          end.setHours(23, 59, 59, 999);
          createdAt.lte = end;
        }
        where.createdAt = createdAt;
      }
      if (req.query.q) {
        const q = String(req.query.q);
        where.OR = [
          { quoteNo: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
          { destination: { contains: q, mode: "insensitive" } },
          { agentName: { contains: q, mode: "insensitive" } },
          { salesExecutiveName: { contains: q, mode: "insensitive" } },
          { enquiryRef: { contains: q, mode: "insensitive" } },
        ];
      }

      const sort = String(req.query.sort || "latest");
      const orderBy =
        sort === "oldest" ? { createdAt: "asc" as const } :
        sort === "value" ? { total: "desc" as const } :
        sort === "profit" ? { grossProfit: "desc" as const } :
        sort === "status" ? { status: "asc" as const } :
        sort === "travel" ? { travelStartDate: "asc" as const } :
        { createdAt: "desc" as const };

      const [rows, total] = await Promise.all([
        db.quotation.findMany({ where, orderBy, skip, take, include: { packages: true } }),
        db.quotation.count({ where }),
      ]);

      const role = req.auth?.role;
      const quotations = rows.map((q) => sanitizeQuotationForRole(q as unknown as Record<string, unknown>, role));
      res.json({ quotations, total, page, pageSize });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Dashboard KPIs ───────────────────────────────────────────────────────
  app.get("/api/quotations/analytics", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const where = { deletedAt: null, ...agencyScope(req), ...branchScope(req, "createdById") };
      const rows = await db.quotation.findMany({ where, take: 5000 });
      const byStatus: Record<string, number> = {};
      let totalValue = 0;
      let expectedProfit = 0;
      let acceptedValue = 0;
      let rejectedValue = 0;
      let expiredValue = 0;
      let convertedValue = 0;
      for (const q of rows) {
        const st = normalizeStatus(q.status);
        byStatus[st] = (byStatus[st] || 0) + 1;
        totalValue += q.total || 0;
        if (!isAgentLike(req.auth?.role)) expectedProfit += q.grossProfit || 0;
        if (st === "Accepted" || st === "Converted to Booking") acceptedValue += q.total || 0;
        if (st === "Rejected") rejectedValue += q.total || 0;
        if (st === "Expired") expiredValue += q.total || 0;
        if (st === "Converted to Booking") convertedValue += q.total || 0;
      }
      const sentLike = (byStatus["Sent to Agent"] || 0) + (byStatus["Customer Reviewing"] || 0) + (byStatus.Accepted || 0) + (byStatus["Converted to Booking"] || 0) + (byStatus.Rejected || 0);
      const converted = byStatus["Converted to Booking"] || 0;
      const accepted = (byStatus.Accepted || 0) + converted;
      res.json({
        total: rows.length,
        byStatus,
        draft: byStatus.Draft || 0,
        inProgress: byStatus["In Progress"] || 0,
        pendingApproval: byStatus["Pending Approval"] || 0,
        sent: byStatus["Sent to Agent"] || 0,
        customerReviewing: byStatus["Customer Reviewing"] || 0,
        revisionRequested: byStatus["Revision Requested"] || 0,
        accepted: byStatus.Accepted || 0,
        rejected: byStatus.Rejected || 0,
        expired: byStatus.Expired || 0,
        converted,
        archived: byStatus.Archived || 0,
        totalQuotedValue: totalValue,
        expectedProfit: isAgentLike(req.auth?.role) ? undefined : expectedProfit,
        acceptedValue,
        rejectedValue,
        expiredValue,
        convertedValue,
        conversionRate: sentLike ? Math.round((accepted / sentLike) * 100) : 0,
        averageQuoteValue: rows.length ? Math.round(totalValue / rows.length) : 0,
        averageProfit: !isAgentLike(req.auth?.role) && rows.length ? Math.round(expectedProfit / rows.length) : undefined,
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Get one ──────────────────────────────────────────────────────────────
  app.get("/api/quotations/:id/full", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const quote = await loadQuote(req, agencyScope, branchScope);
      if (!quote) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      let docs = quote.documents;
      if (isAgentLike(req.auth?.role)) {
        docs = docs.filter((d) => d.visibility === "Agent" || d.visibility === "Customer");
      }
      const payload = sanitizeQuotationForRole(
        { ...quote, documents: docs } as unknown as Record<string, unknown>,
        req.auth?.role,
      );
      res.json({ quotation: payload });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Create (wizard / draft) ──────────────────────────────────────────────
  app.post("/api/quotations/wizard", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Agents cannot create internal quotations" });
        return;
      }
      const body = req.body || {};
      const quoteNo = await nextQuoteNo();
      const nights = nightsBetween(body.travelStartDate, body.travelEndDate) ?? body.nights ?? null;
      const quote = await db.quotation.create({
        data: {
          quoteNo,
          agencyId: ownAgencyId(req, body.agencyId),
          branchId: ownBranchId(req),
          customerName: body.customerName || "Customer",
          service: body.service || "Holiday",
          items: 1,
          amount: 0,
          gst: 0,
          total: 0,
          status: "Draft",
          validTill: body.validTill || body.quoteExpiryDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          quoteDate: body.quoteDate || new Date().toISOString().slice(0, 10),
          createdById: req.auth?.userId,
          createdBy: body.createdBy || req.auth?.email || "System",
          contactPerson: body.contactPerson,
          contactEmail: body.contactEmail,
          contactPhone: body.contactPhone,
          destination: body.destination,
          country: body.country,
          coverImage: body.coverImage || null,
          departureCity: body.departureCity,
          travelDates: body.travelStartDate || body.travelDates,
          travelStartDate: body.travelStartDate,
          travelEndDate: body.travelEndDate,
          returnDate: body.travelEndDate || body.returnDate,
          nights,
          days: nights != null ? nights + 1 : body.days,
          adults: body.adults ?? 2,
          children: body.children ?? 0,
          infants: body.infants ?? 0,
          currency: body.currency || "INR",
          baseCurrency: body.baseCurrency || body.currency || "INR",
          exchangeRate: Number(body.exchangeRate || 1),
          agentName: body.agentName,
          agentId: body.agentId,
          salesExecutiveName: body.salesExecutiveName || req.auth?.email,
          salesExecutivePhone: body.salesExecutivePhone,
          salesExecutiveEmail: body.salesExecutiveEmail,
          specialRequests: body.specialRequests,
          internalNotes: body.internalNotes,
          enquiryRef: body.enquiryRef,
          packageIncludes: body.packageIncludes || [],
          packageExcludes: body.packageExcludes || [],
          termsAndConditions: body.termsAndConditions,
          paymentTerms: body.paymentTerms,
          cancellationPolicy: body.cancellationPolicy,
          refundPolicy: body.refundPolicy,
          taxRate: Number(body.taxRate ?? 18),
          wizardStep: Number(body.wizardStep || 1),
          isInternational: Boolean(body.isInternational),
        },
      });

      if (Array.isArray(body.packages) && body.packages.length) {
        for (const pkg of body.packages) {
          const costing = calcPackageCosting({
            ...pkg,
            taxRate: Number(body.taxRate ?? 18),
            discountType: body.discountType,
            discountValue: Number(body.discountValue || 0),
            adults: Number(body.adults ?? 2),
            children: Number(body.children ?? 0),
          });
          await db.quotationPackage.create({
            data: { quotationId: quote.id, ...packageWriteData(pkg, costing) },
          });
        }
      } else {
        await db.quotationPackage.create({
          data: {
            quotationId: quote.id,
            name: body.packageName || "Standard",
            sortOrder: 0,
            isSelected: true,
            inclusions: body.packageIncludes || ["Accommodation", "Breakfast"],
            exclusions: body.packageExcludes || ["Flights", "Personal expenses"],
          },
        });
      }

      await writeQuoteAudit({
        req,
        agencyId: quote.agencyId,
        quotationId: quote.id,
        action: "Quote Created",
        updatedValue: { quoteNo },
      });
      await notifyQuote({
        agencyId: quote.agencyId,
        title: "New quote created",
        message: `${quoteNo} created for ${quote.customerName}`,
      });

      const full = await db.quotation.findUnique({ where: { id: quote.id }, include: QUOTE_INCLUDE });
      res.status(201).json({ quotation: sanitizeQuotationForRole(full as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Update wizard / full quote ───────────────────────────────────────────
  app.put("/api/quotations/:id/wizard", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (["Converted to Booking", "Archived"].includes(existing.status)) {
        res.status(400).json({ error: "Cannot edit this quotation" });
        return;
      }

      const body = req.body || {};
      const nights = nightsBetween(body.travelStartDate ?? existing.travelStartDate, body.travelEndDate ?? existing.travelEndDate);

      if (body.discountType || body.discountValue != null) {
        const maxPct = maxDiscountPercent(req.auth?.role);
        if (body.discountType === "Percentage" && Number(body.discountValue) > maxPct) {
          res.status(400).json({ error: `Discount limited to ${maxPct}% for your role` });
          return;
        }
      }

      const data: Record<string, unknown> = {};
      const scalarKeys = [
        "customerName", "service", "contactPerson", "contactEmail", "contactPhone",
        "destination", "country", "coverImage", "departureCity", "travelDates", "travelStartDate", "travelEndDate",
        "returnDate", "adults", "children", "infants", "currency", "baseCurrency",
        "agentName", "agentId", "salesExecutiveName", "salesExecutivePhone", "salesExecutiveEmail",
        "specialRequests", "internalNotes", "enquiryRef", "validTill", "quoteDate",
        "termsAndConditions", "paymentTerms", "cancellationPolicy", "refundPolicy",
        "hotelTerms", "flightTerms", "visaTerms", "insuranceTerms", "forceMajeure", "travelDisclaimer",
        "discountType", "hotelStarPreference", "roomTypePreference", "mealPlanPreference",
      ] as const;
      for (const k of scalarKeys) {
        if (body[k] !== undefined) data[k] = body[k];
      }
      if (body.exchangeRate != null) data.exchangeRate = Number(body.exchangeRate);
      if (body.taxRate != null) data.taxRate = Number(body.taxRate);
      if (body.discountValue != null) data.discountValue = Number(body.discountValue);
      if (body.wizardStep != null) data.wizardStep = Number(body.wizardStep);
      if (body.isInternational != null) data.isInternational = Boolean(body.isInternational);
      if (body.packageIncludes) data.packageIncludes = body.packageIncludes;
      if (body.packageExcludes) data.packageExcludes = body.packageExcludes;
      if (nights != null) {
        data.nights = nights;
        data.days = nights + 1;
      }
      if (existing.status === "Draft" && body.advanceStatus !== false) {
        data.status = "In Progress";
      }

      await db.quotation.update({ where: { id: existing.id }, data });

      if (Array.isArray(body.packages)) {
        const keepIds = body.packages.map((p: { id?: string }) => p.id).filter((id: string | undefined): id is string => Boolean(id));
        await db.quotationPackage.deleteMany({
          where: {
            quotationId: existing.id,
            ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
          },
        });
        for (const pkg of body.packages) {
          const costing = calcPackageCosting({
            ...pkg,
            taxRate: Number(body.taxRate ?? existing.taxRate ?? 18),
            discountType: body.discountType ?? existing.discountType,
            discountValue: Number(body.discountValue ?? existing.discountValue ?? 0),
            adults: Number(body.adults ?? existing.adults ?? 2),
            children: Number(body.children ?? existing.children ?? 0),
          });
          const pkgData = packageWriteData(pkg, costing);
          if (pkg.id) {
            await db.quotationPackage.updateMany({
              where: { id: pkg.id, quotationId: existing.id },
              data: pkgData,
            });
          } else {
            await db.quotationPackage.create({
              data: { quotationId: existing.id, ...pkgData },
            });
          }
        }
      }

      const packages = await db.quotationPackage.findMany({ where: { quotationId: existing.id } });
      const rolled = applyCostingToQuote(
        {
          adults: (data.adults as number) ?? existing.adults,
          children: (data.children as number) ?? existing.children,
          infants: (data.infants as number) ?? existing.infants,
          taxRate: (data.taxRate as number) ?? existing.taxRate,
          discountType: (data.discountType as string) ?? existing.discountType,
          discountValue: (data.discountValue as number) ?? existing.discountValue,
        },
        packages as unknown as Record<string, unknown>[],
      );

      const updated = await db.quotation.update({
        where: { id: existing.id },
        data: {
          totalNetCost: rolled.totalNetCost,
          totalSelling: rolled.totalSelling,
          grossProfit: rolled.grossProfit,
          profitMargin: rolled.profitMargin,
          discountAmount: rolled.discountAmount,
          taxableAmount: rolled.taxableAmount,
          gst: rolled.gst,
          total: rolled.total,
          amount: rolled.amount,
          perPersonCost: rolled.perPersonCost,
          items: Math.max(1, packages.length),
          lineItems: buildLineItemsFromPackages(packages),
        },
        include: QUOTE_INCLUDE,
      });

      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Quote Edited",
        previousValue: { total: existing.total, status: existing.status },
        updatedValue: { total: updated.total, status: updated.status, wizardStep: updated.wizardStep },
      });

      res.json({ quotation: sanitizeQuotationForRole(updated as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Status transition ────────────────────────────────────────────────────
  app.post("/api/quotations/:id/status", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const to = String(req.body?.status || "");
      const override = ["super_admin", "agency_admin"].includes(req.auth?.role || "") && Boolean(req.body?.override);
      if (!canTransition(existing.status, to, override) && !canTransition(normalizeStatus(existing.status), to, override)) {
        res.status(400).json({ error: `Invalid transition ${existing.status} → ${to}` });
        return;
      }
      if (isAgentLike(req.auth?.role) && !["Accepted", "Rejected", "Revision Requested", "Customer Reviewing"].includes(to)) {
        res.status(403).json({ error: "Agents can only accept, reject, or request revision" });
        return;
      }

      const data: Record<string, unknown> = { status: to };
      if (to === "Archived") data.archivedAt = new Date();
      if (to === "Sent to Agent" || to === "Sent") {
        data.status = "Sent to Agent";
        data.termsSnapshot = buildTermsSnapshot(existing);
        data.approvalStatus = "Approved";
      }
      if (to === "Pending Approval") data.approvalStatus = "Pending";

      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data,
        include: QUOTE_INCLUDE,
      });

      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Status Changed",
        previousValue: { status: existing.status },
        updatedValue: { status: quotation.status },
        details: req.body?.comments,
      });
      await notifyQuote({
        agencyId: existing.agencyId,
        title: `Quote ${quotation.status}`,
        message: `${quotation.quoteNo} is now ${quotation.status}`,
        priority: "high",
      });

      res.json({ quotation: sanitizeQuotationForRole(quotation as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Submit / approve / reject (internal) ─────────────────────────────────
  app.post("/api/quotations/:id/submit-approval", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      await db.quotationApproval.create({
        data: {
          quotationId: existing.id,
          stage: "Team Lead",
          status: "Pending",
        },
      });
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "Pending Approval", approvalStatus: "Pending" },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Approval Submitted" });
      await notifyQuote({ agencyId: existing.agencyId, title: "Approval required", message: `${existing.quoteNo} awaiting approval`, priority: "high" });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/approve", requireAuth, requireRole("super_admin", "agency_admin", "branch_manager", "management", "accountant"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const stage = String(req.body?.stage || "Team Lead");
      await db.quotationApproval.create({
        data: {
          quotationId: existing.id,
          stage,
          status: "Approved",
          approverName: req.auth?.email,
          approverRole: req.auth?.role,
          comments: req.body?.comments,
          decidedAt: new Date(),
        },
      });
      const ready = stage === "Finance" || stage === "Ready to Send" || req.body?.readyToSend;
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: {
          approvalStatus: "Approved",
          status: ready ? "Sent to Agent" : existing.status === "Pending Approval" ? "Pending Approval" : existing.status,
          ...(ready ? { termsSnapshot: buildTermsSnapshot(existing) } : {}),
        },
        include: QUOTE_INCLUDE,
      });
      if (ready) {
        await db.quotation.update({ where: { id: existing.id }, data: { status: "Sent to Agent" } });
      }
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Approved", details: stage });
      await notifyQuote({ agencyId: existing.agencyId, title: "Approval approved", message: `${existing.quoteNo} approved (${stage})` });
      const full = await db.quotation.findUnique({ where: { id: existing.id }, include: QUOTE_INCLUDE });
      res.json({ quotation: full || quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/reject-approval", requireAuth, requireRole("super_admin", "agency_admin", "branch_manager", "management", "accountant"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      await db.quotationApproval.create({
        data: {
          quotationId: existing.id,
          stage: String(req.body?.stage || "Team Lead"),
          status: "Rejected",
          approverName: req.auth?.email,
          approverRole: req.auth?.role,
          comments: req.body?.comments,
          decidedAt: new Date(),
        },
      });
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "In Progress", approvalStatus: "Rejected" },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Rejected", details: req.body?.comments });
      await notifyQuote({ agencyId: existing.agencyId, title: "Approval rejected", message: `${existing.quoteNo} returned for edits`, priority: "high" });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Customer/agent accept / reject / revision ────────────────────────────
  app.post("/api/quotations/:id/accept", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (existing.status === "Expired") {
        res.status(400).json({ error: "Quotation expired — renew before accepting" });
        return;
      }
      const packageId = req.body?.selectedPackageId as string | undefined;
      if (packageId) {
        await db.quotationPackage.updateMany({ where: { quotationId: existing.id }, data: { isSelected: false } });
        await db.quotationPackage.updateMany({ where: { id: packageId, quotationId: existing.id }, data: { isSelected: true } });
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: {
          status: "Accepted",
          selectedPackageId: packageId || existing.selectedPackageId,
          acceptedByName: req.body?.personName || req.auth?.email,
          acceptedByEmail: req.body?.email || req.auth?.email,
          acceptedAt: new Date(),
        },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Quote Accepted",
        updatedValue: { acceptedByName: quotation.acceptedByName, selectedPackageId: quotation.selectedPackageId },
      });
      await notifyQuote({ agencyId: existing.agencyId, title: "Quote accepted", message: `${existing.quoteNo} accepted`, priority: "high" });
      res.json({ quotation: sanitizeQuotationForRole(quotation as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/reject", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "Rejected", rejectedReason: req.body?.reason || req.body?.comments },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Quote Rejected", details: req.body?.reason });
      await notifyQuote({ agencyId: existing.agencyId, title: "Quote rejected", message: `${existing.quoteNo} rejected` });
      res.json({ quotation: sanitizeQuotationForRole(quotation as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/request-revision", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      await db.quotationRevision.create({
        data: {
          quotationId: existing.id,
          requestedBy: req.body?.requestedBy || req.auth?.email || "Agent",
          requestedByRole: req.auth?.role,
          comments: req.body?.comments,
          requestedChanges: req.body?.requestedChanges,
        },
      });
      await snapshotVersion(existing.id, req.auth?.email || "System", req.auth?.userId, "Before revision", req.body?.comments);
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "Revision Requested" },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Revision Requested", details: req.body?.comments });
      await notifyQuote({ agencyId: existing.agencyId, title: "Revision requested", message: `${existing.quoteNo}: ${req.body?.comments || "Changes requested"}`, priority: "high" });
      res.json({ quotation: sanitizeQuotationForRole(quotation as unknown as Record<string, unknown>, req.auth?.role) });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Duplicate / archive / delete draft ───────────────────────────────────
  app.post("/api/quotations/:id/duplicate", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const quoteNo = await nextQuoteNo();
      const created = await db.quotation.create({
        data: {
          quoteNo,
          agencyId: existing.agencyId,
          branchId: ownBranchId(req) ?? existing.branchId,
          customerName: existing.customerName,
          service: existing.service,
          items: existing.items,
          amount: existing.amount,
          gst: existing.gst,
          total: existing.total,
          status: "Draft",
          validTill: existing.validTill,
          quoteDate: new Date().toISOString().slice(0, 10),
          createdById: req.auth?.userId,
          createdBy: req.auth?.email || existing.createdBy,
          isInternational: existing.isInternational,
          contactPerson: existing.contactPerson,
          contactEmail: existing.contactEmail,
          contactPhone: existing.contactPhone,
          destination: existing.destination,
          country: existing.country,
          coverImage: existing.coverImage,
          departureCity: existing.departureCity,
          travelDates: existing.travelDates,
          travelStartDate: existing.travelStartDate,
          travelEndDate: existing.travelEndDate,
          returnDate: existing.returnDate,
          nights: existing.nights,
          days: existing.days,
          adults: existing.adults,
          children: existing.children,
          infants: existing.infants,
          currency: existing.currency,
          baseCurrency: existing.baseCurrency,
          exchangeRate: existing.exchangeRate,
          packageIncludes: existing.packageIncludes ?? [],
          packageExcludes: existing.packageExcludes ?? [],
          termsAndConditions: existing.termsAndConditions,
          paymentTerms: existing.paymentTerms,
          cancellationPolicy: existing.cancellationPolicy,
          refundPolicy: existing.refundPolicy,
          hotelTerms: existing.hotelTerms,
          flightTerms: existing.flightTerms,
          visaTerms: existing.visaTerms,
          insuranceTerms: existing.insuranceTerms,
          forceMajeure: existing.forceMajeure,
          travelDisclaimer: existing.travelDisclaimer,
          salesExecutiveName: existing.salesExecutiveName,
          agentName: existing.agentName,
          lineItems: existing.lineItems ?? [],
          totalNetCost: existing.totalNetCost,
          totalSelling: existing.totalSelling,
          grossProfit: existing.grossProfit,
          profitMargin: existing.profitMargin,
          discountType: existing.discountType,
          discountValue: existing.discountValue,
          discountAmount: existing.discountAmount,
          taxRate: existing.taxRate,
          taxableAmount: existing.taxableAmount,
          perPersonCost: existing.perPersonCost,
          specialRequests: existing.specialRequests,
          approvalStatus: "Draft",
          currentVersion: 1,
          wizardStep: 1,
        },
      });
      for (const pkg of existing.packages) {
        await db.quotationPackage.create({
          data: {
            quotationId: created.id,
            name: pkg.name,
            sortOrder: pkg.sortOrder,
            isSelected: pkg.isSelected,
            description: pkg.description,
            hotels: pkg.hotels ?? [],
            flights: pkg.flights ?? [],
            transfers: pkg.transfers ?? [],
            activities: pkg.activities ?? [],
            meals: pkg.meals ?? [],
            itinerary: pkg.itinerary ?? [],
            visa: pkg.visa ?? undefined,
            insurance: pkg.insurance ?? undefined,
            addOns: pkg.addOns ?? [],
            inclusions: pkg.inclusions ?? [],
            exclusions: pkg.exclusions ?? [],
            totalNetCost: pkg.totalNetCost,
            totalSelling: pkg.totalSelling,
            grossProfit: pkg.grossProfit,
            gst: pkg.gst,
            total: pkg.total,
            perPersonCost: pkg.perPersonCost,
          },
        });
      }
      await writeQuoteAudit({ req, agencyId: created.agencyId, quotationId: created.id, action: "Quote Duplicated", details: `From ${existing.quoteNo}` });
      const full = await db.quotation.findUnique({ where: { id: created.id }, include: QUOTE_INCLUDE });
      res.status(201).json({ quotation: full });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/archive", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: { status: "Archived", archivedAt: new Date() },
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Quote Archived" });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/quotations/:id/draft", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (existing.status !== "Draft") {
        res.status(400).json({ error: "Only draft quotations can be deleted" });
        return;
      }
      await db.quotation.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), status: "Archived", archivedAt: new Date() },
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Quote Deleted" });
      res.json({ success: true });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Extend validity / expire ─────────────────────────────────────────────
  app.post("/api/quotations/:id/extend", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const validTill = String(req.body?.validTill || "");
      if (!validTill) {
        res.status(400).json({ error: "validTill required" });
        return;
      }
      const data: Record<string, unknown> = { validTill };
      if (existing.status === "Expired") data.status = "Sent to Agent";
      const quotation = await db.quotation.update({ where: { id: existing.id }, data, include: QUOTE_INCLUDE });
      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Quote Renewed",
        previousValue: { validTill: existing.validTill, status: existing.status },
        updatedValue: { validTill, status: quotation.status },
      });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/expire-due", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res: Response) => {
    try {
      const expired = await expireDueQuotations({ ...agencyScope(req) });
      res.json({ expired });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Versions ─────────────────────────────────────────────────────────────
  app.post("/api/quotations/:id/versions", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const version = await snapshotVersion(
        existing.id,
        req.auth?.email || "System",
        req.auth?.userId,
        req.body?.changeSummary,
        req.body?.reason,
      );
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Version Created", details: `v${version?.versionNumber}` });
      res.status(201).json({ version });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/quotations/:id/versions", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ versions: existing.versions, currentVersion: existing.currentVersion });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotations/:id/versions/:vid/restore", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const vid = Array.isArray(req.params.vid) ? req.params.vid[0] : req.params.vid;
      const version = await db.quotationVersion.findFirst({ where: { id: vid, quotationId: existing.id } });
      if (!version) {
        res.status(404).json({ error: "Version not found" });
        return;
      }
      await snapshotVersion(existing.id, req.auth?.email || "System", req.auth?.userId, `Restore before v${version.versionNumber}`);
      const snap = version.snapshot as Record<string, unknown>;
      await restorePackagesFromSnapshot(existing.id, snap);
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: {
          status: "In Progress",
          amount: Number(snap.amount || existing.amount),
          gst: Number(snap.gst || existing.gst),
          total: Number(snap.total || existing.total),
          totalNetCost: Number(snap.totalNetCost || 0),
          totalSelling: Number(snap.totalSelling || 0),
          grossProfit: Number(snap.grossProfit || 0),
          lineItems: (snap.lineItems as object) ?? existing.lineItems,
          packageIncludes: (snap.packageIncludes as object) ?? existing.packageIncludes,
          packageExcludes: (snap.packageExcludes as object) ?? existing.packageExcludes,
          termsAndConditions: (snap.termsAndConditions as string) ?? existing.termsAndConditions,
        },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({ req, agencyId: existing.agencyId, quotationId: existing.id, action: "Version Restored", details: `v${version.versionNumber}` });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Share tracking (email / WhatsApp — no fake delivery) ─────────────────
  app.post("/api/quotations/:id/share", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const channel = String(req.body?.channel || "Link");
      const recipient = String(req.body?.recipient || existing.contactEmail || "");
      const share = await db.quotationShare.create({
        data: {
          quotationId: existing.id,
          channel,
          recipient: recipient || req.body?.recipient,
          senderName: req.auth?.email,
          message: req.body?.message,
          status: "Attempted",
        },
      });
      const link = `${req.body?.appOrigin || ""}/?view=quotations&quoteId=${existing.id}`;
      let emailed = false;
      if (channel === "Email" && recipient) {
        const html = `
          <p>Dear ${escapeHtml(existing.customerName)},</p>
          <p>Please find your travel quotation <strong>${escapeHtml(existing.quoteNo)}</strong>
          for ${escapeHtml(existing.destination || "your trip")}
          (${escapeHtml(existing.travelStartDate || existing.travelDates || "")}).</p>
          ${req.body?.message ? `<p>${escapeHtml(String(req.body.message))}</p>` : ""}
          <p>View: <a href="${escapeHtml(link)}">${escapeHtml(link || existing.quoteNo)}</a></p>
          <p>Regards,<br/>Trevio Global</p>
        `;
        emailed = await sendHtmlEmail(
          recipient,
          `Quotation ${existing.quoteNo} — ${existing.destination || "Travel"}`,
          html,
          { agencyId: existing.agencyId },
        );
        await db.quotationShare.update({
          where: { id: share.id },
          data: { status: emailed ? "Sent" : "Failed" },
        });
      }
      if (["Draft", "In Progress", "Pending Approval"].includes(existing.status) && !isAgentLike(req.auth?.role)) {
        await db.quotation.update({
          where: { id: existing.id },
          data: { status: "Sent to Agent", termsSnapshot: buildTermsSnapshot(existing) },
        });
      } else if (existing.status === "Sent to Agent") {
        await db.quotation.update({ where: { id: existing.id }, data: { status: "Customer Reviewing" } });
      }
      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: channel === "Email" ? "Email Sent" : channel === "WhatsApp" ? "WhatsApp Shared" : "Quote Shared",
        details: recipient,
      });
      res.status(201).json({
        share: { ...share, status: emailed ? "Sent" : share.status },
        link,
        emailed,
        mailto: channel === "Email" && !emailed ? buildMailto(existing, link) : undefined,
        whatsappUrl: channel === "WhatsApp" ? buildWhatsApp(existing, link, req.body?.recipient || existing.contactPhone || undefined) : undefined,
        note: emailed
          ? "Email sent via SMTP/SendGrid"
          : "Delivery uses client mailto / wa.me unless SMTP/SendGrid is configured",
      });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Documents ────────────────────────────────────────────────────────────
  app.post("/api/quotations/:id/documents", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      if (isAgentLike(req.auth?.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const { docType, fileName, fileUrl, mimeType, sizeBytes, visibility, relatedEntity } = req.body || {};
      if (!docType || !fileName || !fileUrl) {
        res.status(400).json({ error: "docType, fileName, fileUrl required" });
        return;
      }
      if (sizeBytes && Number(sizeBytes) > 10 * 1024 * 1024) {
        res.status(400).json({ error: "Max 10 MB" });
        return;
      }
      const document = await db.quotationDocument.create({
        data: {
          quotationId: existing.id,
          docType,
          fileName,
          fileUrl,
          mimeType,
          sizeBytes: Number(sizeBytes) || 0,
          visibility: visibility || "Internal",
          relatedEntity,
          uploadedBy: req.auth?.email,
        },
      });
      res.status(201).json({ document });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Mark converted (called after BMS proceed, or wrap) ───────────────────
  app.post("/api/quotations/:id/mark-converted", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res: Response) => {
    try {
      const existing = await loadQuote(req, agencyScope, branchScope);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (existing.status === "Converted to Booking" && existing.convertedBookingId) {
        res.status(409).json({ error: "Already converted", bookingId: existing.convertedBookingId });
        return;
      }
      if (existing.status === "Expired") {
        res.status(400).json({ error: "Renew expired quotation before conversion" });
        return;
      }
      const quotation = await db.quotation.update({
        where: { id: existing.id },
        data: {
          status: "Converted to Booking",
          convertedBookingId: req.body?.bookingId,
          convertedAt: new Date(),
          convertedBy: req.auth?.email,
        },
        include: QUOTE_INCLUDE,
      });
      await writeQuoteAudit({
        req,
        agencyId: existing.agencyId,
        quotationId: existing.id,
        action: "Booking Conversion",
        updatedValue: { bookingId: req.body?.bookingId },
      });
      res.json({ quotation });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });
}

function buildLineItemsFromPackages(packages: Array<{ name: string; total: number; hotels: unknown; flights: unknown }>) {
  const items: Array<{ description: string; qty: number; price: number; type?: string }> = [];
  for (const pkg of packages) {
    items.push({ description: `Package: ${pkg.name}`, qty: 1, price: pkg.total, type: "package" });
  }
  return items;
}

function buildMailto(q: { quoteNo: string; customerName: string; destination: string | null; travelStartDate: string | null; travelDates: string | null; contactEmail: string | null }, link: string) {
  const subject = encodeURIComponent(`Quotation ${q.quoteNo} — ${q.destination || "Travel"}`);
  const body = encodeURIComponent(
    `Dear ${q.customerName},\n\nPlease find your travel quotation ${q.quoteNo} for ${q.destination || "your trip"} (${q.travelStartDate || q.travelDates || ""}).\n\nView: ${link}\n\nRegards,\nTrevio Global`,
  );
  const to = q.contactEmail || "";
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function buildWhatsApp(q: { quoteNo: string; customerName: string; destination: string | null; travelStartDate: string | null; travelDates: string | null }, link: string, phone?: string) {
  const text = encodeURIComponent(
    `Hi ${q.customerName}, your quotation ${q.quoteNo} for ${q.destination || "your trip"} (${q.travelStartDate || q.travelDates || ""}) is ready. ${link}`,
  );
  const digits = (phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}
