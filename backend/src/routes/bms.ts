import type { Express, Response } from "express";
import type { AuthRequest } from "../middleware/auth.js";
import { requireAuth, requireAnyPermission, requirePermission, requireRole } from "../middleware/auth.js";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import {
  BOOKING_INCLUDE,
  categoryForRequestType,
  deriveBookingStatusFromPayments,
  derivePaymentStatus,
  nextChangeRequestRef,
  nextInvoiceNo,
  nextPaymentRequestRef,
  notify,
  recalculateFinancials,
  validatePassenger,
  verifyPanStub,
  writeAudit,
} from "../lib/bms.js";
import { isAgentLike } from "../lib/quotations.js";
import { filterDocumentsForRole } from "../lib/documents.js";
import { adjustAgencyWallet } from "../lib/wallet.js";
import {
  assertRazorpayPayment,
  razorpayKeysForAgency,
} from "../lib/razorpay.js";
import { isOfflinePaymentMethod } from "../lib/payments.js";
import { convertQuotationToBooking, ConversionError } from "../lib/quotation-to-booking.js";
import { agentBookingScope, agentCanAccessBooking } from "../lib/booking-access.js";
import { canTransitionBooking } from "../lib/booking-status.js";

/** Hide net cost / supplier / profit fields from travel agents. */
function sanitizeBookingForRole<T>(booking: T, role?: string): T {
  if (!isAgentLike(role) || !booking || typeof booking !== "object") return booking;
  const clone = JSON.parse(JSON.stringify(booking)) as Record<string, unknown>;
  delete clone.costPrice;
  delete clone.grossProfit;
  delete clone.netProfit;
  delete clone.costDeviationApprovals;
  if (clone.pricingSnapshot && typeof clone.pricingSnapshot === "object") {
    const snap = { ...(clone.pricingSnapshot as Record<string, unknown>) };
    delete snap.totalNetCost;
    delete snap.grossProfit;
    delete snap.agentMarkup;
    if (snap.packagePricing && typeof snap.packagePricing === "object") {
      const pp = { ...(snap.packagePricing as Record<string, unknown>) };
      delete pp.contractedCost;
      delete pp.trevioMarkupAmount;
      snap.packagePricing = pp;
    }
    clone.pricingSnapshot = snap;
  }
  if (Array.isArray(clone.services)) {
    clone.services = (clone.services as Record<string, unknown>[]).map((svc) => {
      const next = { ...svc };
      delete next.costPrice;
      delete next.quotedCostPrice;
      delete next.supplierId;
      delete next.supplierName;
      return next;
    });
  }
  if (Array.isArray(clone.supplierPayouts)) {
    clone.supplierPayouts = [];
  }
  if (Array.isArray(clone.documents)) {
    const bookingId = typeof clone.id === "string" ? clone.id : "";
    clone.documents = filterDocumentsForRole(clone.documents as Array<{ id?: string; visibility?: unknown }>, role).map((doc) => ({
      ...doc,
      ...(bookingId && doc.id ? { downloadPath: `/api/bookings/${bookingId}/documents/${doc.id}/content` } : {}),
    }));
  }
  return clone as T;
}
import {
  applyServiceUpdate,
  approveCostDeviation,
  baselineServiceCost,
  canApproveCostDeviation,
  createSellingPriceIncreaseRequest,
  createServiceCostDeviation,
  extractServiceUpdatePayload,
  findPendingServiceDeviation,
  isCostOverBaseline,
  rejectCostDeviation,
} from "../lib/cost-deviation.js";
import { derivePayoutStatus, processPayoutReminders } from "../lib/supplier-payouts.js";
import { seedTravelDetailsFromServices, travelDetailsComplete } from "../lib/travel-details.js";
import { buildInvoiceLineItems, computeTravelGst } from "../lib/booking-invoice.js";

type ScopeFn = (req: AuthRequest) => Record<string, unknown>;
type OwnAgencyFn = (req: AuthRequest, fallback?: string) => string | undefined;
type OwnBranchFn = (req: AuthRequest) => string | undefined;
type BranchScopeFn = (req: AuthRequest, ownField?: string) => Record<string, unknown>;

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : String(id ?? "");
}

function paramPid(req: AuthRequest): string {
  const id = req.params.pid;
  return Array.isArray(id) ? id[0] : String(id ?? "");
}

async function findBooking(req: AuthRequest, agencyScope: ScopeFn, branchScope: BranchScopeFn) {
  const booking = await db.booking.findFirst({
    where: {
      id: paramId(req),
      ...agencyScope(req),
      ...branchScope(req, "agentId"),
      ...agentBookingScope(req.auth?.role, req.auth?.userId),
    },
    include: BOOKING_INCLUDE,
  });
  if (!booking) return null;
  if (!agentCanAccessBooking(req.auth?.role, req.auth?.userId, booking)) return null;
  return booking;
}

async function refreshBookingTotals(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { addOns: true, paymentRequests: true, payments: true },
  });
  if (!booking) return null;
  const addOnTotal = booking.addOns.reduce((s, a) => s + a.amount, 0);
  const paidFromPayments = booking.payments
    .filter((p) => p.status === "Success" && p.type === "Payment")
    .reduce((s, p) => s + p.amount, 0);
  const paidFromRequests = booking.paymentRequests.reduce((s, r) => s + r.amountPaid, 0);
  const amountPaid = Math.max(paidFromPayments, paidFromRequests, booking.amountPaid);
  const packageValue = booking.packageValue ?? booking.amount;
  const fin = recalculateFinancials({
    packageValue,
    addOnTotal,
    amountPaid,
    costPrice: booking.costPrice,
  });
  const paymentStatus = derivePaymentStatus(amountPaid, fin.amount);
  const status = deriveBookingStatusFromPayments(booking.status, amountPaid, fin.amount);
  return db.booking.update({
    where: { id: bookingId },
    data: {
      amount: fin.amount,
      packageValue: fin.packageValue,
      amountPaid,
      balanceAmount: fin.balanceAmount,
      grossProfit: fin.grossProfit,
      netProfit: fin.netProfit,
      paymentStatus,
      status,
    },
    include: BOOKING_INCLUDE,
  });
}

export function mountBmsRoutes(
  app: Express,
  agencyScope: ScopeFn,
  ownAgencyId: OwnAgencyFn,
  ownBranchId: OwnBranchFn,
  branchScope: BranchScopeFn,
) {
  // ── Proceed to Booking from Quotation (authoritative Phase 10 path) ──────
  app.post(
    "/api/quotations/:id/proceed-to-booking",
    requireAuth,
    requireAnyPermission("quotations", "bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        if (isAgentLike(req.auth?.role)) {
          res.status(403).json({ error: "Agents cannot convert quotations to bookings" });
          return;
        }
        // Ignore client-supplied totals/status/version — server validates from DB.
        const result = await convertQuotationToBooking({
          quotationId: paramId(req),
          agencyScope: agencyScope(req),
          ownAgencyId: ownAgencyId(req),
          ownBranchId: ownBranchId(req),
          role: req.auth?.role,
          userId: req.auth?.userId,
          email: req.auth?.email,
          travelStartDate: typeof req.body?.travelStartDate === "string" ? req.body.travelStartDate : undefined,
          travelEndDate: typeof req.body?.travelEndDate === "string" ? req.body.travelEndDate : undefined,
          operationsExecutiveName: typeof req.body?.operationsExecutiveName === "string" ? req.body.operationsExecutiveName : undefined,
          operationsExecutiveId: typeof req.body?.operationsExecutiveId === "string" ? req.body.operationsExecutiveId : undefined,
          req,
        });

        if (result.booking && result.booking.commission > 0 && result.booking.agencyId && !result.idempotent) {
          try {
            await adjustAgencyWallet({
              agencyId: result.booking.agencyId,
              type: "Credit",
              amount: result.booking.commission,
              source: "Commission",
              description: `Commission: ${result.booking.bookingRef} (${result.booking.service})`,
              paymentRef: `comm_${result.booking.id}`,
            });
          } catch (walletErr) {
            logger.warn({ err: walletErr, bookingRef: result.booking.bookingRef }, "Commission wallet credit skipped");
          }
        }

        res.status(result.idempotent ? 200 : 201).json({
          booking: sanitizeBookingForRole(result.booking, req.auth?.role),
          idempotent: result.idempotent,
        });
      } catch (e) {
        if (e instanceof ConversionError) {
          res.status(e.statusCode).json({
            error: e.message,
            code: e.code,
            booking: e.booking ? sanitizeBookingForRole(e.booking, req.auth?.role) : undefined,
          });
          return;
        }
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Full booking detail ──────────────────────────────────────────────────
  app.get(
    "/api/bookings/:id/full",
    requireAuth,
    requireAnyPermission("flights", "hotels", "holiday", "bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await findBooking(req, agencyScope, branchScope);
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const tasks = await db.task.findMany({
          where: { bookingId: booking.id },
          orderBy: { createdAt: "desc" },
        });
        const audits = await db.auditLog.findMany({
          where: { bookingId: booking.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        const sourceQuotation = booking.quotationId
          ? await db.quotation.findFirst({
              where: { id: booking.quotationId },
              select: {
                id: true,
                quoteNo: true,
                status: true,
                currentVersion: true,
                acceptedVersionNumber: true,
                validTill: true,
                customerName: true,
                destination: true,
              },
            })
          : null;
        const servicesByType = (booking.services || []).reduce<Record<string, number>>((acc, s) => {
          acc[s.serviceType] = (acc[s.serviceType] || 0) + 1;
          return acc;
        }, {});
        res.json({
          booking: sanitizeBookingForRole(booking, req.auth?.role),
          tasks: isAgentLike(req.auth?.role) ? [] : tasks,
          audits: isAgentLike(req.auth?.role) ? [] : audits,
          source: {
            quotationId: booking.quotationId,
            quoteNo: booking.quoteNo,
            quotationVersionNumber: booking.quotationVersionNumber,
            quotation: sourceQuotation
              ? {
                  quoteNo: sourceQuotation.quoteNo,
                  status: sourceQuotation.status,
                  currentVersion: sourceQuotation.currentVersion,
                  acceptedVersionNumber: sourceQuotation.acceptedVersionNumber,
                  validTill: sourceQuotation.validTill,
                  destination: sourceQuotation.destination,
                }
              : null,
          },
          completeness: {
            passengers: booking.passengers?.length || 0,
            adults: booking.adults ?? 0,
            children: booking.children ?? 0,
            infants: booking.infants ?? 0,
            servicesByType,
            documents: booking.documents?.length || 0,
            hasItinerary: Array.isArray(booking.itinerary) && (booking.itinerary as unknown[]).length > 0,
            hasTerms: Boolean(booking.termsAndConditions || booking.paymentTerms || booking.cancellationPolicy),
            pricingLocked: booking.pricingLocked,
          },
        });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Accept policies ──────────────────────────────────────────────────────
  app.post(
    "/api/bookings/:id/accept-policies",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await findBooking(req, agencyScope, branchScope);
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const booking = await db.booking.update({
          where: { id: existing.id },
          data: { policiesAcceptedAt: new Date() },
          include: BOOKING_INCLUDE,
        });
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Policies Accepted",
          previousValue: { policiesAcceptedAt: existing.policiesAcceptedAt },
          updatedValue: { policiesAcceptedAt: booking.policiesAcceptedAt },
        });
        res.json({ booking: sanitizeBookingForRole(booking, req.auth?.role) });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Passengers ───────────────────────────────────────────────────────────
  app.put(
    "/api/bookings/:id/passengers",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await db.booking.findFirst({
          where: {
            id: paramId(req),
            ...agencyScope(req),
            ...branchScope(req, "agentId"),
            ...agentBookingScope(req.auth?.role, req.auth?.userId),
          },
          include: { passengers: true },
        });
        if (!existing || !agentCanAccessBooking(req.auth?.role, req.auth?.userId, existing)) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const list = Array.isArray(req.body?.passengers) ? req.body.passengers : [];
        if (!list.length) {
          res.status(400).json({ error: "passengers array required" });
          return;
        }
        const requirePassport = existing.isInternational || /hotel/i.test(String(existing.service || ""));
        for (const p of list) {
          const err = validatePassenger(p, existing.isInternational, { requirePassport });
          if (err) {
            res.status(400).json({ error: err });
            return;
          }
        }
        const lead = list.find((p: { isLead?: boolean }) => p.isLead) || list[0];
        const leadPanOk =
          existing.isInternational ||
          lead?.panStatus === "Verified" ||
          lead?.panVerified === true;

        await db.$transaction(async (tx) => {
          for (const p of list) {
            if (p.id) {
              await tx.bookingPassenger.update({
                where: { id: p.id },
                data: {
                  title: p.title,
                  firstName: p.firstName,
                  lastName: p.lastName,
                  gender: p.gender,
                  dateOfBirth: p.dateOfBirth,
                  nationality: p.nationality,
                  passportNumber: requirePassport ? (p.passportNumber || null) : null,
                  passportIssueDate: existing.isInternational ? p.passportIssueDate : null,
                  passportExpiry: existing.isInternational ? p.passportExpiry : null,
                  mobile: p.mobile,
                  email: p.email,
                  panNumber: p.isLead ? p.panNumber : null,
                  panVerified: Boolean(p.panVerified),
                  panRegisteredName: p.panRegisteredName,
                  panStatus: p.panStatus || (p.panVerified ? "Verified" : "Pending"),
                  isLead: Boolean(p.isLead),
                  roomIndex: p.roomIndex ?? 0,
                },
              });
            }
          }
        });

        const nextStatus =
          existing.status === "Draft" || existing.status === "Awaiting Passenger Details"
            ? existing.policiesAcceptedAt && leadPanOk
              ? "Pending Initial Payment"
              : "Awaiting Passenger Details"
            : existing.status;

        await db.booking.update({
          where: { id: existing.id },
          data: { status: nextStatus },
        });

        await writeAudit({
          req,
          agencyId: existing.agencyId,
          bookingId: existing.id,
          action: "Passengers Updated",
          previousValue: existing.passengers,
          updatedValue: list,
        });

        const booking = await db.booking.findUnique({ where: { id: existing.id }, include: BOOKING_INCLUDE });
        res.json({ booking });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/bookings/:id/passengers/:pid/verify-pan",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const passenger = await db.bookingPassenger.findFirst({
          where: { id: paramPid(req), bookingId: booking.id },
        });
        if (!passenger || !passenger.isLead) {
          res.status(400).json({ error: "PAN verification is only for lead passenger" });
          return;
        }
        const pan = (req.body?.panNumber as string) || passenger.panNumber || "";
        const name = `${passenger.firstName} ${passenger.lastName}`.trim();
        const result = verifyPanStub(pan, name, req.body?.registeredName as string | undefined);
        const updated = await db.bookingPassenger.update({
          where: { id: passenger.id },
          data: {
            panNumber: pan.trim().toUpperCase(),
            panVerified: result.ok,
            panStatus: result.status,
            panRegisteredName: result.registeredName,
          },
        });
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "PAN Verification",
          details: result.message,
          updatedValue: { panStatus: result.status, panRegisteredName: result.registeredName },
        });
        res.json({ passenger: updated, verification: result });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // Booking documents are uploaded through routes/documents.ts (multipart, private storage).

  // ── Payment requests (Finance / Admin) ───────────────────────────────────
  app.post(
    "/api/bookings/:id/payment-requests",
    requireAuth,
    requireAnyPermission("finance", "payments", "bookings"),
    requireRole("super_admin", "agency_admin", "accountant", "branch_manager"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const amount = Number(req.body?.amount);
        if (!amount || amount <= 0) {
          res.status(400).json({ error: "Valid amount required" });
          return;
        }
        const pr = await db.paymentRequest.create({
          data: {
            bookingId: booking.id,
            agencyId: booking.agencyId,
            requestRef: await nextPaymentRequestRef(),
            label: req.body?.label || "Installment",
            amount,
            dueDate: req.body?.dueDate || null,
            notes: req.body?.notes || null,
            createdById: req.auth?.userId,
            createdByName: req.auth?.email,
            status: "Pending",
          },
        });
        if (booking.status === "Awaiting Passenger Details" || booking.status === "Draft") {
          await db.booking.update({
            where: { id: booking.id },
            data: { status: "Pending Initial Payment" },
          });
        }
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Payment Request Created",
          updatedValue: pr,
        });
        await notify({
          agencyId: booking.agencyId,
          type: "payment",
          title: "Payment Request",
          message: `${pr.requestRef} for ${booking.bookingRef}: ₹${amount}`,
          priority: "high",
        });
        res.status(201).json({ paymentRequest: pr });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/payment-requests/:id/pay",
    requireAuth,
    requireAnyPermission("payments", "bookings", "finance"),
    async (req: AuthRequest, res: Response) => {
      try {
        const pr = await db.paymentRequest.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
          include: { booking: true },
        });
        if (!pr) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const remaining = Math.max(0, Number(pr.amount) - Number(pr.amountPaid));
        if (remaining <= 0) {
          res.status(400).json({ error: "Payment request is already fully paid" });
          return;
        }
        let payAmount = Number(req.body?.amount);
        if (!Number.isFinite(payAmount) || payAmount <= 0) payAmount = remaining;
        payAmount = Math.min(payAmount, remaining);
        if (payAmount <= 0) {
          res.status(400).json({ error: "Invalid payment amount" });
          return;
        }
        const method = String(req.body?.method || "Bank Transfer");
        let gateway = String(req.body?.gateway || "Manual");
        let txnId = `TXN-BMS-${Date.now()}`;
        if (!isOfflinePaymentMethod(method)) {
          const keys = await razorpayKeysForAgency(pr.agencyId);
          const { orderId, paymentId, signature } = req.body ?? {};
          if (!keys || !orderId || !paymentId || !signature) {
            res.status(400).json({
              error: "Online payments require a verified Razorpay payment. Use Cash, Bank Transfer, Cheque, or Wallet for manual/wallet settlement.",
            });
            return;
          }
          const check = await assertRazorpayPayment({
            orderId: String(orderId),
            paymentId: String(paymentId),
            signature: String(signature),
            amountRupees: payAmount,
            keyId: keys.keyId,
            keySecret: keys.keySecret,
          });
          if (!check.ok) {
            res.status(400).json({ error: check.error });
            return;
          }
          gateway = "Razorpay";
          txnId = `RZP-${String(paymentId)}`;
          const reused = await db.payment.findFirst({ where: { txnId } });
          if (reused) {
            res.status(409).json({ error: "This Razorpay payment was already recorded" });
            return;
          }
        }
        const newPaid = Math.min(pr.amount, pr.amountPaid + payAmount);
        const status = newPaid >= pr.amount ? "Paid" : "Partially Paid";

        if (method === "Wallet") {
          if (!pr.agencyId) {
            res.status(400).json({ error: "No agency wallet for this payment" });
            return;
          }
          try {
            await adjustAgencyWallet({
              agencyId: pr.agencyId,
              type: "Debit",
              amount: payAmount,
              source: "Booking",
              description: `Booking payment: ${pr.booking.bookingRef} (${pr.requestRef})`,
              paymentRef: `bms_pay_${pr.id}_${Date.now()}`,
            });
          } catch (walletErr) {
            const msg = walletErr instanceof Error ? walletErr.message : "Wallet debit failed";
            res.status(400).json({ error: msg });
            return;
          }
        }

        const updated = await db.paymentRequest.update({
          where: { id: pr.id },
          data: { amountPaid: newPaid, status },
        });
        await db.payment.create({
          data: {
            txnId,
            customerName: pr.booking.customerName,
            bookingRef: pr.booking.bookingRef,
            bookingId: pr.bookingId,
            agencyId: pr.agencyId,
            branchId: pr.booking.branchId,
            collectedById: req.auth?.userId,
            amount: payAmount,
            method,
            status: "Success",
            type: "Payment",
            gateway: method === "Wallet" ? "Wallet" : gateway,
          },
        });
        const booking = await refreshBookingTotals(pr.bookingId);
        await writeAudit({
          req,
          agencyId: pr.agencyId,
          bookingId: pr.bookingId,
          action: "Payment Received",
          details: `${payAmount} against ${pr.requestRef}`,
        });
        await notify({
          agencyId: pr.agencyId,
          type: "payment",
          title: "Payment Received",
          message: `₹${payAmount} received for ${pr.booking.bookingRef}`,
          priority: "high",
        });
        res.json({ paymentRequest: updated, booking });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Ops service confirmations ────────────────────────────────────────────
  app.patch(
    "/api/bookings/:id/services/:sid",
    requireAuth,
    requireAnyPermission("bookings", "holiday"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const sid = Array.isArray(req.params.sid) ? req.params.sid[0] : req.params.sid;
        const svc = await db.bookingService.findFirst({ where: { id: sid, bookingId: booking.id } });
        if (!svc) {
          res.status(404).json({ error: "Service not found" });
          return;
        }

        const proposedCost = req.body?.costPrice !== undefined ? Number(req.body.costPrice) : svc.costPrice;
        const baseline = baselineServiceCost(svc);
        const payload = extractServiceUpdatePayload(req.body || {}, proposedCost);
        const approvedDeviationId = req.body?.approvedDeviationId as string | undefined;

        if (isCostOverBaseline(proposedCost, baseline)) {
          if (approvedDeviationId) {
            const approval = await db.costDeviationApproval.findFirst({
              where: {
                id: approvedDeviationId,
                bookingId: booking.id,
                bookingServiceId: svc.id,
                status: "Approved",
                deviationType: "service_cost",
              },
            });
            if (!approval || approval.proposedCost !== proposedCost) {
              res.status(400).json({ error: "Invalid or mismatched approved deviation" });
              return;
            }
          } else if (!canApproveCostDeviation(req.auth?.role)) {
            const existing = await findPendingServiceDeviation(booking.id, svc.id);
            if (existing) {
              res.status(409).json({
                code: "APPROVAL_REQUIRED",
                error: "Cost exceeds quoted amount — super admin approval required",
                approval: existing,
              });
              return;
            }
            const approval = await createServiceCostDeviation({
              bookingId: booking.id,
              agencyId: booking.agencyId,
              bookingServiceId: svc.id,
              serviceType: svc.serviceType,
              bookingRef: booking.bookingRef,
              baseline,
              proposedCost,
              payload,
              requestedById: req.auth?.userId,
              requestedByName: req.auth?.email,
            });
            res.status(409).json({
              code: "APPROVAL_REQUIRED",
              error: "Cost exceeds quoted amount — sent for super admin approval",
              approval,
            });
            return;
          }
        }

        if (req.body?.sellingPrice !== undefined && booking.pricingLocked) {
          res.status(400).json({ error: "Selling price is locked on this booking" });
          return;
        }

        let updated = await applyServiceUpdate(svc.id, booking.id, payload);
        if (req.body?.driverDetails !== undefined) {
          updated = await db.bookingService.update({
            where: { id: svc.id },
            data: { driverDetails: req.body.driverDetails },
          });
        }

        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Service Updated",
          previousValue: svc,
          updatedValue: updated,
        });
        if (updated.voucherUrl || updated.ticketUrl) {
          await notify({
            agencyId: booking.agencyId,
            title: "Voucher Uploaded",
            message: `${updated.serviceType} document ready for ${booking.bookingRef}`,
          });
        }
        res.json({ service: updated });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/bookings/:id/services",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const service = await db.bookingService.create({
          data: {
            bookingId: booking.id,
            serviceType: req.body?.serviceType || "Other",
            title: req.body?.title || "Service",
            status: "Pending",
            costPrice: Number(req.body?.costPrice) || 0,
            sellingPrice: Number(req.body?.sellingPrice) || 0,
          },
        });
        res.status(201).json({ service });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Supplier lines ───────────────────────────────────────────────────────
  app.post(
    "/api/bookings/:id/supplier-lines",
    requireAuth,
    requireAnyPermission("bookings", "suppliers", "finance"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const line = await db.bookingSupplierLine.create({
          data: {
            bookingId: booking.id,
            agencyId: booking.agencyId,
            supplierId: req.body?.supplierId,
            supplierName: req.body?.supplierName || "Supplier",
            contactPerson: req.body?.contactPerson,
            supplierRef: req.body?.supplierRef,
            confirmationNo: req.body?.confirmationNo,
            costPrice: Number(req.body?.costPrice) || 0,
            sellingPrice: Number(req.body?.sellingPrice) || 0,
            voucherUrl: req.body?.voucherUrl,
            paymentStatus: req.body?.paymentStatus || "Pending",
          },
        });
        res.status(201).json({ supplierLine: line });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Invoices ─────────────────────────────────────────────────────────────
  app.post(
    "/api/bookings/:id/invoices",
    requireAuth,
    requireAnyPermission("finance", "bookings"),
    requireRole("super_admin", "agency_admin", "accountant"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
          include: {
            addOns: true,
            agency: { select: { state: true, gstNumber: true, name: true } },
            agent: { include: { agency: { select: { state: true, gstNumber: true, name: true } } } },
          },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const invoiceType = req.body?.invoiceType || "Tax Invoice";
        if (invoiceType === "Tax Invoice" && booking.paymentStatus !== "Paid") {
          res.status(400).json({
            error: "Tax invoice can only be generated after the booking is fully paid",
          });
          return;
        }
        const lineItems = buildInvoiceLineItems(booking);
        const recipientState = booking.agent?.agency?.state;
        const recipientGst = booking.agent?.agency?.gstNumber;
        const supplierState = booking.agency?.state;
        const supplierGst = booking.agency?.gstNumber;
        const gstBreakdown = computeTravelGst(
          booking.packageValue ?? booking.amount,
          supplierState,
          recipientState,
          5,
          recipientGst,
          supplierGst,
        );
        const amount = gstBreakdown.taxableAmount;
        const gst = gstBreakdown.totalGst;
        const total = gstBreakdown.total;
        const invoice = await db.bookingInvoice.create({
          data: {
            bookingId: booking.id,
            agencyId: booking.agencyId,
            invoiceNo: await nextInvoiceNo(invoiceType),
            invoiceType,
            amount,
            gst,
            taxableAmount: gstBreakdown.taxableAmount,
            cgst: gstBreakdown.cgst,
            sgst: gstBreakdown.sgst,
            igst: gstBreakdown.igst,
            gstRate: gstBreakdown.gstRate,
            gstNumber: recipientGst || booking.agency?.gstNumber || undefined,
            amountPaid: booking.amountPaid ?? 0,
            balanceAmount: booking.balanceAmount ?? 0,
            lineItems: lineItems as object[],
            total,
            notes: [
              req.body?.notes,
              gstBreakdown.gstType === "intra" ? "CGST + SGST (same state)" : "IGST (inter-state)",
              recipientGst ? `Bill to GSTIN: ${recipientGst}` : "",
            ].filter(Boolean).join(" · ") || undefined,
            createdByName: req.auth?.email,
          },
        });
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Invoice Generated",
          updatedValue: invoice,
        });
        await notify({
          agencyId: booking.agencyId,
          type: "payment",
          title: "Invoice Generated",
          message: `${invoice.invoiceNo} (${invoiceType}) for ${booking.bookingRef}`,
        });
        res.status(201).json({ invoice });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Supplier payouts ─────────────────────────────────────────────────────
  app.post(
    "/api/supplier-payouts",
    requireAuth,
    requireAnyPermission("finance", "suppliers", "bookings"),
    requireRole("super_admin", "agency_admin", "accountant", "operations"),
    async (req: AuthRequest, res: Response) => {
      try {
        const amount = Number(req.body?.amount) || 0;
        const amountPaid = Number(req.body?.amountPaid) || 0;
        const dueDate = req.body?.dueDate ? String(req.body.dueDate) : null;
        const scheduledPayDate = req.body?.scheduledPayDate ? String(req.body.scheduledPayDate) : null;
        const status = derivePayoutStatus(amount, amountPaid, dueDate, scheduledPayDate);
        const payout = await db.supplierPayout.create({
          data: {
            bookingId: req.body?.bookingId || null,
            agencyId: ownAgencyId(req, req.body?.agencyId),
            supplierId: req.body?.supplierId || null,
            bookingServiceId: req.body?.bookingServiceId || null,
            serviceType: req.body?.serviceType || null,
            supplierName: req.body?.supplierName || "Supplier",
            amount,
            amountPaid,
            currency: req.body?.currency || "INR",
            paymentMode: req.body?.paymentMode,
            utr: req.body?.utr,
            paymentDate: req.body?.paymentDate,
            paymentTime: req.body?.paymentTime,
            dueDate,
            reminderDaysBefore: Number(req.body?.reminderDaysBefore) || 2,
            scheduledPayDate,
            invoiceUrl: req.body?.invoiceUrl || null,
            status: req.body?.status || status,
            notes: req.body?.notes,
            createdById: req.auth?.userId,
            createdByName: req.auth?.email,
          },
        });
        await writeAudit({
          req,
          agencyId: payout.agencyId,
          bookingId: payout.bookingId,
          action: "Supplier Payout Created",
          module: "finance",
          updatedValue: payout,
        });
        res.status(201).json({ payout });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.patch(
    "/api/supplier-payouts/:id",
    requireAuth,
    requireAnyPermission("finance", "suppliers"),
    requireRole("super_admin", "agency_admin", "accountant"),
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await db.supplierPayout.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const amount = req.body?.amount !== undefined ? Number(req.body.amount) : existing.amount;
        const amountPaid = req.body?.amountPaid !== undefined ? Number(req.body.amountPaid) : existing.amountPaid;
        const dueDate = req.body?.dueDate !== undefined ? req.body.dueDate : existing.dueDate;
        const scheduledPayDate =
          req.body?.scheduledPayDate !== undefined ? req.body.scheduledPayDate : existing.scheduledPayDate;
        const data: Record<string, unknown> = {
          amount,
          amountPaid,
          status: derivePayoutStatus(amount, amountPaid, dueDate, scheduledPayDate),
        };
        for (const k of [
          "paymentMode", "utr", "paymentDate", "paymentTime", "dueDate",
          "reminderDaysBefore", "scheduledPayDate", "invoiceUrl", "notes",
        ] as const) {
          if (req.body?.[k] !== undefined) data[k] = req.body[k];
        }
        const payout = await db.supplierPayout.update({ where: { id: existing.id }, data });
        await writeAudit({
          req,
          agencyId: payout.agencyId,
          bookingId: payout.bookingId,
          action: "Supplier Payout Updated",
          module: "finance",
          previousValue: existing,
          updatedValue: payout,
        });
        res.json({ payout });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/supplier-payouts/process-reminders",
    requireAuth,
    requireAnyPermission("finance", "bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const reminded = await processPayoutReminders(agencyScope(req));
        res.json({ reminded });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.get(
    "/api/supplier-payouts",
    requireAuth,
    requireAnyPermission("finance", "suppliers", "bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        await processPayoutReminders(agencyScope(req));
        const status = req.query.status as string | undefined;
        const payouts = await db.supplierPayout.findMany({
          where: {
            ...agencyScope(req),
            ...(status ? { status } : {}),
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          take: 200,
          include: {
            booking: { select: { bookingRef: true, customerName: true, destination: true } },
          },
        });
        res.json({ payouts });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Itinerary (ops edit) ─────────────────────────────────────────────────
  app.put(
    "/api/bookings/:id/itinerary",
    requireAuth,
    requireAnyPermission("bookings", "holiday"),
    requireRole("super_admin", "agency_admin", "operations"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const itinerary = Array.isArray(req.body?.itinerary) ? req.body.itinerary : req.body?.days;
        if (!Array.isArray(itinerary)) {
          res.status(400).json({ error: "itinerary array is required" });
          return;
        }
        const bookingUpdated = await db.booking.update({
          where: { id: booking.id },
          data: { itinerary },
          include: BOOKING_INCLUDE,
        });
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Itinerary Updated",
          updatedValue: { days: itinerary.length },
        });
        res.json({ booking: bookingUpdated });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Travel details ───────────────────────────────────────────────────────
  app.put(
    "/api/bookings/:id/travel-details",
    requireAuth,
    requireAnyPermission("bookings", "holiday"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
          include: { services: true },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const travelDetails = req.body?.travelDetails ?? req.body;
        const bookingUpdated = await db.booking.update({
          where: { id: booking.id },
          data: { travelDetails },
          include: BOOKING_INCLUDE,
        });
        const check = travelDetailsComplete(travelDetails, bookingUpdated.services);
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Travel Details Updated",
          updatedValue: { travelDetails, complete: check.ok },
        });
        res.json({ booking: bookingUpdated, travelComplete: check.ok, missing: check.missing });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Add-ons ──────────────────────────────────────────────────────────────
  app.post(
    "/api/bookings/:id/add-ons",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const addOn = await db.bookingAddOn.create({
          data: {
            bookingId: booking.id,
            addOnType: req.body?.addOnType || "Other",
            title: req.body?.title || req.body?.addOnType || "Add-on",
            amount: Number(req.body?.amount) || 0,
            costPrice: Number(req.body?.costPrice) || 0,
          },
        });
        const refreshed = await refreshBookingTotals(booking.id);
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Add-on Added",
          updatedValue: addOn,
        });
        res.status(201).json({ addOn, booking: refreshed });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Modifications ────────────────────────────────────────────────────────
  app.post(
    "/api/bookings/:id/modifications",
    requireAuth,
    requireRole("super_admin", "agency_admin", "branch_manager"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const priceDelta = Number(req.body?.priceDelta) || 0;
        if (booking.pricingLocked && priceDelta > 0) {
          const current = booking.packageValue ?? booking.amount;
          const proposed = current + priceDelta;
          const approval = await createSellingPriceIncreaseRequest({
            bookingId: booking.id,
            agencyId: booking.agencyId,
            bookingRef: booking.bookingRef,
            currentPackageValue: current,
            proposedPackageValue: proposed,
            reason: req.body?.description ? String(req.body.description) : undefined,
            requestedById: req.auth?.userId,
            requestedByName: req.auth?.email,
          });
          res.status(409).json({
            code: "APPROVAL_REQUIRED",
            error: "Selling price increase requires super admin approval",
            approval,
          });
          return;
        }
        const mod = await db.bookingModification.create({
          data: {
            bookingId: booking.id,
            modType: req.body?.modType || "Other",
            description: req.body?.description,
            previousValue: req.body?.previousValue,
            updatedValue: req.body?.updatedValue,
            priceDelta,
            performedBy: req.auth?.email,
          },
        });
        if (priceDelta !== 0) {
          const packageValue = (booking.packageValue ?? booking.amount) + priceDelta;
          await db.booking.update({
            where: { id: booking.id },
            data: {
              packageValue,
              nights: req.body?.nights !== undefined ? Number(req.body.nights) : booking.nights,
              route: req.body?.route || booking.route,
              destination: req.body?.destination || booking.destination,
            },
          });
          await refreshBookingTotals(booking.id);
        }
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Booking Modified",
          previousValue: req.body?.previousValue,
          updatedValue: req.body?.updatedValue,
          details: req.body?.modType,
        });
        await notify({
          agencyId: booking.agencyId,
          title: "Booking Modified",
          message: `${booking.bookingRef}: ${req.body?.modType || "Modification"}`,
        });
        const full = await db.booking.findUnique({ where: { id: booking.id }, include: BOOKING_INCLUDE });
        res.status(201).json({ modification: mod, booking: full });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Change requests ──────────────────────────────────────────────────────
  app.post(
    "/api/bookings/:id/change-requests",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const requestType = req.body?.requestType || "Other Request";
        const cr = await db.changeRequest.create({
          data: {
            requestRef: await nextChangeRequestRef(),
            bookingId: booking.id,
            agencyId: booking.agencyId,
            requestType,
            category: req.body?.category || categoryForRequestType(requestType),
            requestedBy: req.auth?.email || "Agent",
            requestedByRole: req.auth?.role,
            description: req.body?.description,
            priority: req.body?.priority || "Medium",
            estimatedAdditionalCost: Number(req.body?.estimatedAdditionalCost) || 0,
            cancellationCharges: Number(req.body?.cancellationCharges) || 0,
            supportingDocs: req.body?.supportingDocs || [],
            status: "Submitted",
          },
        });
        const due = new Date();
        due.setDate(due.getDate() + 2);
        await db.task.create({
          data: {
            agencyId: booking.agencyId,
            branchId: booking.branchId,
            bookingId: booking.id,
            title: `Change request: ${requestType}`,
            description: req.body?.description || `${requestType} on ${booking.bookingRef}`,
            assignedTo: "Operations",
            assignedBy: req.auth?.email || "System",
            department: "Operations",
            priority: cr.priority === "High" ? "High" : "Medium",
            status: "To Do",
            dueDate: due.toISOString().slice(0, 10),
            relatedTo: cr.requestRef,
          },
        });
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Change Request Created",
          updatedValue: cr,
        });
        await notify({
          agencyId: booking.agencyId,
          title: "New Request Created",
          message: `${cr.requestRef}: ${requestType} on ${booking.bookingRef}`,
          priority: "high",
        });
        res.status(201).json({ changeRequest: cr });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.patch(
    "/api/change-requests/:id",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await db.changeRequest.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const data: Record<string, unknown> = {};
        for (const k of ["status", "resolutionNotes", "assignedToName", "priority", "description"] as const) {
          if (req.body?.[k] !== undefined) data[k] = req.body[k];
        }
        if (req.body?.estimatedAdditionalCost !== undefined) {
          data.estimatedAdditionalCost = Number(req.body.estimatedAdditionalCost);
        }
        if (req.body?.assignedToId) data.assignedToId = req.body.assignedToId;
        if (data.status === "Completed" || data.status === "Rejected") {
          data.completedAt = new Date();
        }
        const updated = await db.changeRequest.update({ where: { id: existing.id }, data });
        await writeAudit({
          req,
          agencyId: existing.agencyId,
          bookingId: existing.bookingId,
          action: "Change Request Updated",
          previousValue: { status: existing.status },
          updatedValue: { status: updated.status },
        });
        if (updated.status === "Completed" || updated.status === "Rejected" || updated.status === "Additional Payment") {
          await notify({
            agencyId: existing.agencyId,
            title: `Request ${updated.status}`,
            message: `${updated.requestRef} is now ${updated.status}`,
            priority: "medium",
          });
        }
        res.json({ changeRequest: updated });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Travel documents ready / complete ────────────────────────────────────
  app.post(
    "/api/bookings/:id/mark-documents-ready",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await db.booking.findFirst({
          where: {
            id: paramId(req),
            ...agencyScope(req),
            ...branchScope(req, "agentId"),
            ...agentBookingScope(req.auth?.role, req.auth?.userId),
          },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        if (!canTransitionBooking(existing.status, "Travel Documents Ready")) {
          res.status(400).json({ error: `Invalid booking transition ${existing.status} → Travel Documents Ready` });
          return;
        }
        const booking = await db.booking.update({
          where: { id: existing.id },
          data: { status: "Travel Documents Ready" },
          include: BOOKING_INCLUDE,
        });
        await notify({
          agencyId: booking.agencyId,
          title: "Travel Documents Ready",
          message: `${booking.bookingRef} documents issued`,
          priority: "high",
        });
        res.json({ booking: sanitizeBookingForRole(booking, req.auth?.role) });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/bookings/:id/complete",
    requireAuth,
    requirePermission("bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await db.booking.findFirst({
          where: {
            id: paramId(req),
            ...agencyScope(req),
            ...branchScope(req, "agentId"),
            ...agentBookingScope(req.auth?.role, req.auth?.userId),
          },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        if (!canTransitionBooking(existing.status, "Completed")) {
          res.status(400).json({ error: `Invalid booking transition ${existing.status} → Completed` });
          return;
        }
        const booking = await db.booking.update({
          where: { id: existing.id },
          data: { status: "Completed" },
          include: BOOKING_INCLUDE,
        });
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Trip Completed",
          previousValue: { status: existing.status },
          updatedValue: { status: "Completed" },
        });
        res.json({ booking: sanitizeBookingForRole(booking, req.auth?.role) });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Assign executives ────────────────────────────────────────────────────
  app.patch(
    "/api/bookings/:id/assignees",
    requireAuth,
    requireAnyPermission("bookings", "tasks"),
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await db.booking.findFirst({
          where: {
            id: paramId(req),
            ...agencyScope(req),
            ...branchScope(req, "agentId"),
            ...agentBookingScope(req.auth?.role, req.auth?.userId),
          },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const role = req.auth?.role || "";
        // Real role slug is `operations` (not operations_executive).
        const canAssign =
          ["super_admin", "agency_admin", "branch_manager", "operations", "sales_executive"].includes(role) ||
          role === "employee";
        if (!canAssign) {
          res.status(403).json({ error: "Not allowed to assign executives" });
          return;
        }

        const data: Record<string, unknown> = {
          salesExecutiveId: req.body?.salesExecutiveId ?? existing.salesExecutiveId,
          salesExecutiveName: req.body?.salesExecutiveName ?? existing.salesExecutiveName,
          operationsExecutiveId: req.body?.operationsExecutiveId ?? existing.operationsExecutiveId,
          operationsExecutiveName: req.body?.operationsExecutiveName ?? existing.operationsExecutiveName,
        };

        if (req.body?.agentId !== undefined || req.body?.agentName !== undefined) {
          const clearAgent = req.body.agentId === null || req.body.agentId === "";
          if (clearAgent) {
            data.agentId = null;
            data.agentName = req.body.agentName != null ? String(req.body.agentName) : existing.agentName;
          } else if (req.body.agentId) {
            const agent = await db.user.findFirst({
              where: {
                id: String(req.body.agentId),
                role: "travel_agent",
                status: { in: ["Active", "Approved"] },
                ...agencyScope(req),
              },
              select: { id: true, name: true, agencyId: true, agency: { select: { name: true, code: true } } },
            });
            if (!agent) {
              res.status(400).json({ error: "Registered travel agent not found" });
              return;
            }
            data.agentId = agent.id;
            data.agentName = agent.name;
            if (req.auth?.role === "super_admin" && agent.agencyId) {
              data.agencyId = agent.agencyId;
              data.agencyName = agent.agency?.name || existing.agencyName;
            }
          } else if (req.body.agentName != null) {
            data.agentName = String(req.body.agentName);
          }
        }

        const booking = await db.booking.update({
          where: { id: existing.id },
          data,
          include: BOOKING_INCLUDE,
        });
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Assignees Updated",
          details: `Ops: ${booking.operationsExecutiveName || "—"} · Sales: ${booking.salesExecutiveName || "—"} · Agent: ${booking.agentName || "—"}`,
        });
        res.json({ booking });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Ops fulfillment queue ────────────────────────────────────────────────
  app.get(
    "/api/bookings/ops-queue",
    requireAuth,
    requireAnyPermission("bookings", "tasks"),
    async (req: AuthRequest, res: Response) => {
      try {
        if (isAgentLike(req.auth?.role)) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        const mine = String(req.query.mine || "") === "1";
        const unassigned = String(req.query.unassigned || "") === "1";
        const where: Record<string, unknown> = {
          ...agencyScope(req),
          ...branchScope(req, "agentId"),
          status: {
            notIn: ["Completed", "Cancelled", "Refunded", "Failed"],
          },
        };
        if (mine && req.auth?.userId) {
          where.OR = [
            { operationsExecutiveId: req.auth.userId },
            { operationsExecutiveName: req.auth.email },
          ];
        } else if (unassigned) {
          where.AND = [
            { OR: [{ operationsExecutiveId: null }, { operationsExecutiveId: "" }] },
            { OR: [{ operationsExecutiveName: null }, { operationsExecutiveName: "" }, { operationsExecutiveName: "Operations" }] },
          ];
        }
        const bookings = await db.booking.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: 100,
          include: BOOKING_INCLUDE,
        });
        res.json({ bookings, total: bookings.length });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── BMS reports ──────────────────────────────────────────────────────────
  app.get(
    "/api/bms/reports",
    requireAuth,
    requireAnyPermission("reports", "finance", "bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        if (isAgentLike(req.auth?.role)) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        const where = agencyScope(req);
        const bookings = await db.booking.findMany({ where, take: 2000 });
        const quotations = await db.quotation.findMany({ where, take: 2000 });
        const tasks = await db.task.findMany({
          where: { ...where, bookingId: { not: null } },
          take: 2000,
        });
        const payouts = await db.supplierPayout.findMany({ where, take: 500 });
        const changeRequests = await db.changeRequest.findMany({ where, take: 500 });

        const byStatus: Record<string, number> = {};
        const byDestination: Record<string, number> = {};
        let revenue = 0;
        let grossProfit = 0;
        let netProfit = 0;
        let outstanding = 0;
        let completed = 0;
        let cancelled = 0;

        for (const b of bookings) {
          byStatus[b.status] = (byStatus[b.status] || 0) + 1;
          const dest = b.destination || b.route || "Unknown";
          byDestination[dest] = (byDestination[dest] || 0) + (b.amount || 0);
          revenue += b.amount || 0;
          grossProfit += b.grossProfit || 0;
          netProfit += b.netProfit || 0;
          outstanding += b.balanceAmount || 0;
          if (b.status === "Completed") completed += 1;
          if (b.status === "Cancelled") cancelled += 1;
        }

        const acceptedQuotes = quotations.filter((q) => q.status === "Accepted").length;
        const converted = bookings.filter((b) => b.quotationId).length;
        const pendingConfirmations = await db.bookingService.count({
          where: { status: "Pending", booking: where },
        });
        const pendingTasks = tasks.filter((t) => !["Completed", "Cancelled"].includes(t.status)).length;
        const supplierPayables = payouts
          .filter((p) => p.status !== "Paid")
          .reduce((s, p) => s + p.amount, 0);

        res.json({
          sales: {
            quotationsCreated: quotations.length,
            quotationsConverted: converted,
            conversionRate: quotations.length ? Math.round((converted / quotations.length) * 100) : 0,
            acceptedQuotes,
            bookingValue: revenue,
          },
          operations: {
            pendingConfirmations,
            bookingStatus: byStatus,
            taskCompletion: {
              total: tasks.length,
              pending: pendingTasks,
              completed: tasks.filter((t) => t.status === "Completed").length,
            },
            openChangeRequests: changeRequests.filter((c) => !["Completed", "Rejected"].includes(c.status)).length,
          },
          finance: {
            collections: revenue - outstanding,
            outstandingPayments: outstanding,
            supplierPayables,
            profitability: { grossProfit, netProfit },
            refunds: bookings.filter((b) => b.paymentStatus === "Refunded").length,
          },
          management: {
            totalBookings: bookings.length,
            revenue,
            grossProfit,
            netProfit,
            pendingTasks,
            activeBookings: bookings.filter((b) => !["Completed", "Cancelled"].includes(b.status)).length,
            completedTrips: completed,
            cancelledBookings: cancelled,
            destinationWiseSales: Object.entries(byDestination)
              .map(([destination, value]) => ({ destination, value }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 20),
          },
        });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Super admin selling price adjustment ─────────────────────────────────
  app.post(
    "/api/bookings/:id/adjust-selling-price",
    requireAuth,
    requireRole("super_admin", "agency_admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const newPackageValue = Number(req.body?.packageValue);
        if (!newPackageValue || newPackageValue < 0) {
          res.status(400).json({ error: "Valid package value is required" });
          return;
        }
        const previous = booking.packageValue ?? booking.amount;
        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
        if (newPackageValue < previous && !reason) {
          res.status(400).json({ error: "Reason is required when applying a discount (price decrease)" });
          return;
        }
        await db.bookingModification.create({
          data: {
            bookingId: booking.id,
            modType: "Selling Price Adjustment",
            description: reason || (newPackageValue < previous ? "Admin discount" : "Super admin price adjustment"),
            previousValue: { packageValue: previous },
            updatedValue: { packageValue: newPackageValue },
            priceDelta: newPackageValue - previous,
            performedBy: req.auth?.email,
          },
        });
        await db.booking.update({
          where: { id: booking.id },
          data: { packageValue: newPackageValue },
        });
        const refreshed = await refreshBookingTotals(booking.id);
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Selling Price Adjusted",
          previousValue: { packageValue: previous },
          updatedValue: { packageValue: newPackageValue },
          details: req.body?.reason,
        });
        res.json({ booking: refreshed });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  // ── Cost deviation approvals ─────────────────────────────────────────────
  app.post(
    "/api/bookings/:id/request-selling-price-increase",
    requireAuth,
    requireAnyPermission("bookings", "finance", "holiday"),
    async (req: AuthRequest, res: Response) => {
      try {
        const booking = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const proposedPackageValue = Number(req.body?.proposedPackageValue);
        const current = booking.packageValue ?? booking.amount;
        if (!proposedPackageValue || proposedPackageValue <= current) {
          res.status(400).json({ error: "Proposed selling price must be higher than current package value" });
          return;
        }
        const approval = await createSellingPriceIncreaseRequest({
          bookingId: booking.id,
          agencyId: booking.agencyId,
          bookingRef: booking.bookingRef,
          currentPackageValue: current,
          proposedPackageValue,
          reason: req.body?.reason ? String(req.body.reason) : undefined,
          requestedById: req.auth?.userId,
          requestedByName: req.auth?.email,
        });
        res.status(201).json({ approval });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/cost-deviations/:id/approve",
    requireAuth,
    requireRole("super_admin", "agency_admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const id = paramId(req);
        const approval = await db.costDeviationApproval.findFirst({
          where: { id, ...agencyScope(req) },
          include: { booking: true },
        });
        if (!approval) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const result = await approveCostDeviation(id, req.auth?.email || "admin", req.body?.notes);
        if ("error" in result) {
          res.status(400).json({ error: result.error });
          return;
        }
        let booking = await db.booking.findUnique({
          where: { id: approval.bookingId },
          include: BOOKING_INCLUDE,
        });
        if (approval.deviationType === "selling_price_increase") {
          booking = await refreshBookingTotals(approval.bookingId);
        }
        await writeAudit({
          req,
          agencyId: approval.agencyId,
          bookingId: approval.bookingId,
          action: "Cost Deviation Approved",
          updatedValue: result.approval,
        });
        res.json({ approval: result.approval, booking });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.post(
    "/api/cost-deviations/:id/reject",
    requireAuth,
    requireRole("super_admin", "agency_admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const id = paramId(req);
        const approval = await db.costDeviationApproval.findFirst({
          where: { id, ...agencyScope(req) },
        });
        if (!approval) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const result = await rejectCostDeviation(id, req.auth?.email || "admin", req.body?.notes);
        if ("error" in result) {
          res.status(400).json({ error: result.error });
          return;
        }
        await writeAudit({
          req,
          agencyId: approval.agencyId,
          bookingId: approval.bookingId,
          action: "Cost Deviation Rejected",
          updatedValue: result.approval,
        });
        res.json({ approval: result.approval });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

  app.get(
    "/api/cost-deviations",
    requireAuth,
    requireRole("super_admin", "agency_admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const status = (req.query.status as string) || "Pending";
        const approvals = await db.costDeviationApproval.findMany({
          where: { status, ...agencyScope(req) },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            booking: { select: { bookingRef: true, customerName: true, destination: true } },
            bookingService: { select: { serviceType: true, title: true } },
          },
        });
        res.json({ approvals });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );
}
