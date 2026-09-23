import type { Express, Response } from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import {
  REGISTRATION_STATUS,
  canReviewAgentRegistrations,
} from "../lib/agent-registration.js";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { validate } from "../lib/validation.js";

const reviewBodySchema = z.object({
  comment: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(2000).optional(),
});

function param(req: AuthRequest, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? String(v[0] || "") : String(v || "");
}

function publicRegistrationRow(agency: {
  id: string;
  name: string;
  owner: string;
  email: string;
  phone: string;
  address: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  panNumber: string | null;
  gstNumber: string | null;
  vatNumber: string | null;
  gstProofDocumentId: string | null;
  registrationStatus: string;
  registrationReviewComment: string | null;
  registrationRejectionReason: string | null;
  registrationReviewedAt: Date | null;
  registrationReviewedByName: string | null;
  termsAcceptedAt: Date | null;
  status: string;
  createdAt: Date;
  users?: Array<{ id: string; name: string; email: string; role: string; status: string }>;
}) {
  return {
    id: agency.id,
    companyName: agency.name,
    fullName: agency.owner,
    email: agency.email,
    phone: agency.phone,
    address: agency.address,
    country: agency.country,
    state: agency.state,
    city: agency.city,
    panNumber: agency.panNumber,
    gstNumber: agency.gstNumber,
    vatNumber: agency.vatNumber,
    hasGstProof: Boolean(agency.gstProofDocumentId),
    gstProofDocumentId: agency.gstProofDocumentId,
    registrationStatus: agency.registrationStatus,
    registrationReviewComment: agency.registrationReviewComment,
    registrationRejectionReason: agency.registrationRejectionReason,
    registrationReviewedAt: agency.registrationReviewedAt,
    registrationReviewedByName: agency.registrationReviewedByName,
    termsAcceptedAt: agency.termsAcceptedAt,
    agencyStatus: agency.status,
    createdAt: agency.createdAt,
    applicants: (agency.users || []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
    })),
  };
}

export function mountAgentRegistrationRoutes(app: Express) {
  app.get(
    "/api/agent-registrations",
    requireAuth,
    requireRole("super_admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        if (!canReviewAgentRegistrations(req.auth?.role)) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        const status = String(req.query.status || "Submitted").trim();
        const where =
          status.toLowerCase() === "all"
            ? { registrationStatus: { in: [REGISTRATION_STATUS.SUBMITTED, REGISTRATION_STATUS.APPROVED, REGISTRATION_STATUS.REJECTED] } }
            : { registrationStatus: status };

        const agencies = await db.agency.findMany({
          where,
          include: {
            users: {
              where: { role: "agency_admin" },
              select: { id: true, name: true, email: true, role: true, status: true },
              take: 5,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        });
        res.json({
          registrations: agencies.map(publicRegistrationRow),
          total: agencies.length,
        });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.get(
    "/api/agent-registrations/:id",
    requireAuth,
    requireRole("super_admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const agency = await db.agency.findFirst({
          where: { id: param(req, "id") },
          include: {
            users: {
              select: { id: true, name: true, email: true, role: true, status: true },
            },
          },
        });
        if (!agency) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        res.json({ registration: publicRegistrationRow(agency) });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/agent-registrations/:id/approve",
    requireAuth,
    requireRole("super_admin"),
    validate(reviewBodySchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const id = param(req, "id");
        const agency = await db.agency.findFirst({ where: { id } });
        if (!agency) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        if (agency.registrationStatus === REGISTRATION_STATUS.APPROVED) {
          res.json({ registration: publicRegistrationRow({ ...agency, users: [] }), alreadyApproved: true });
          return;
        }
        if (agency.registrationStatus === REGISTRATION_STATUS.REJECTED) {
          res.status(400).json({ error: "A rejected registration cannot be approved. Contact support to reopen manually." });
          return;
        }

        const comment = String(req.body?.comment || "").trim() || null;
        const reviewerId = req.auth!.userId;
        const reviewer = await db.user.findUnique({ where: { id: reviewerId }, select: { name: true, email: true } });

        const updated = await db.$transaction(async (tx) => {
          const next = await tx.agency.update({
            where: { id },
            data: {
              registrationStatus: REGISTRATION_STATUS.APPROVED,
              registrationReviewComment: comment,
              registrationRejectionReason: null,
              registrationReviewedAt: new Date(),
              registrationReviewedById: reviewerId,
              registrationReviewedByName: reviewer?.name || reviewer?.email || "Admin",
              status: agency.status === "Suspended" ? "Active" : agency.status,
            },
            include: {
              users: { select: { id: true, name: true, email: true, role: true, status: true } },
            },
          });
          await tx.user.updateMany({
            where: { agencyId: id, status: { in: ["Submitted", "Rejected"] } },
            data: { status: "Active" },
          });
          await tx.auditLog.create({
            data: {
              userId: reviewerId,
              agencyId: id,
              userName: reviewer?.name || "Admin",
              action: "Approve Agent Registration",
              module: "Auth",
              ip: req.ip || "0.0.0.0",
              details: `Approved registration for ${agency.name}${comment ? `; comment=${comment}` : ""}`,
            },
          });
          return next;
        }, { maxWait: 15_000, timeout: 30_000 });

        try {
          const { ensureAgencyRegistrationCodes } = await import("../lib/agent-codes.js");
          await ensureAgencyRegistrationCodes(id, agency.name);
        } catch (e) {
          logger.warn({ err: e, agencyId: id }, "Agency/agent code assignment on approve failed");
        }

        const withCode = await db.agency.findUnique({
          where: { id },
          include: {
            users: { select: { id: true, name: true, email: true, role: true, status: true, agentCode: true } },
          },
        });

        res.json({ registration: publicRegistrationRow(withCode || updated) });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/agent-registrations/:id/reject",
    requireAuth,
    requireRole("super_admin"),
    validate(reviewBodySchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const id = param(req, "id");
        const agency = await db.agency.findFirst({ where: { id } });
        if (!agency) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        if (agency.registrationStatus === REGISTRATION_STATUS.APPROVED) {
          res.status(400).json({ error: "An approved registration cannot be rejected from this queue. Suspend the agency instead." });
          return;
        }

        const reason = String(req.body?.reason || req.body?.comment || "").trim();
        if (!reason) {
          res.status(400).json({ error: "A rejection reason is required." });
          return;
        }
        const reviewerId = req.auth!.userId;
        const reviewer = await db.user.findUnique({ where: { id: reviewerId }, select: { name: true, email: true } });

        const updated = await db.$transaction(async (tx) => {
          const next = await tx.agency.update({
            where: { id },
            data: {
              registrationStatus: REGISTRATION_STATUS.REJECTED,
              registrationRejectionReason: reason,
              registrationReviewComment: String(req.body?.comment || "").trim() || reason,
              registrationReviewedAt: new Date(),
              registrationReviewedById: reviewerId,
              registrationReviewedByName: reviewer?.name || reviewer?.email || "Admin",
            },
            include: {
              users: { select: { id: true, name: true, email: true, role: true, status: true } },
            },
          });
          await tx.user.updateMany({
            where: { agencyId: id },
            data: { status: "Rejected" },
          });
          await tx.auditLog.create({
            data: {
              userId: reviewerId,
              agencyId: id,
              userName: reviewer?.name || "Admin",
              action: "Reject Agent Registration",
              module: "Auth",
              ip: req.ip || "0.0.0.0",
              details: `Rejected registration for ${agency.name}; reason=${reason}`,
            },
          });
          return next;
        }, { maxWait: 15_000, timeout: 30_000 });

        res.json({ registration: publicRegistrationRow(updated) });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );
}
