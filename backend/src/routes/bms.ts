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
  nextBookingRef,
  nextChangeRequestRef,
  nextInvoiceNo,
  nextPaymentRequestRef,
  notify,
  passengerSlotsFromRooms,
  recalculateFinancials,
  seedBookingServices,
  seedOpsTasks,
  validatePassenger,
  verifyPanStub,
  writeAudit,
} from "../lib/bms.js";
import { isAgentLike } from "../lib/quotations.js";

import {
  assertRazorpayPayment,
  razorpayKeysForAgency,
} from "../lib/razorpay.js";
import { isOfflinePaymentMethod } from "../lib/payments.js";

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

function jsonArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function lineNote(line: Record<string, unknown>, extra: Array<string | number | undefined | null>) {
  return [...extra, line.remarks ? String(line.remarks) : ""].map((x) => (x == null ? "" : String(x))).filter(Boolean).join(" · ") || undefined;
}

async function copySelectedPackageToBooking(
  bookingId: string,
  selected: {
    hotels: unknown;
    flights: unknown;
    transfers: unknown;
    activities: unknown;
    meals: unknown;
    itinerary: unknown;
    visa: unknown;
    insurance: unknown;
    addOns: unknown;
  },
) {
  async function svc(serviceType: string, title: string, line: Record<string, unknown>, notes?: string) {
    await db.bookingService.create({
      data: {
        bookingId,
        serviceType,
        title: (title || serviceType).slice(0, 240),
        status: "Pending",
        costPrice: Math.round(Number(line.costPrice || 0)),
        sellingPrice: Math.round(Number(line.sellingPrice || line.fare || 0)),
        supplierName: line.supplier ? String(line.supplier) : undefined,
        confirmationNo: String(line.confirmationNumber || line.pnr || line.policyNumber || "") || undefined,
        voucherUrl: line.voucherUrl ? String(line.voucherUrl) : undefined,
        ticketUrl: line.ticketUrl ? String(line.ticketUrl) : undefined,
        notes,
      },
    });
  }

  for (const h of jsonArr(selected.hotels)) {
    await svc(
      "Hotel",
      String(h.hotelName || h.name || "Hotel"),
      h,
      lineNote(h, [
        h.starCategory ? `${h.starCategory}*` : "",
        h.roomType ? String(h.roomType) : "",
        h.mealPlan ? String(h.mealPlan) : "",
        h.checkIn && h.checkOut ? `${h.checkIn} → ${h.checkOut}` : "",
        h.rooms ? `${h.rooms} rooms` : "",
      ]),
    );
  }
  for (const f of jsonArr(selected.flights)) {
    await svc(
      "Flight",
      `${f.airline || "Flight"} ${f.flightNumber || ""}`.trim(),
      f,
      lineNote(f, [
        f.from && f.to ? `${f.from} → ${f.to}` : "",
        f.date ? String(f.date) : "",
        f.cabinClass ? String(f.cabinClass) : "",
      ]),
    );
  }
  for (const t of jsonArr(selected.transfers)) {
    await svc(
      "Transfer",
      String(t.transferType || t.name || "Transfer"),
      t,
      lineNote(t, [
        t.vehicleType ? String(t.vehicleType) : "",
        t.pickup ? String(t.pickup) : "",
        t.drop ? String(t.drop) : "",
        t.date ? String(t.date) : "",
      ]),
    );
  }
  for (const a of jsonArr(selected.activities)) {
    await svc(
      "Attraction",
      String(a.activityName || a.name || "Activity"),
      a,
      lineNote(a, [a.ticketType ? String(a.ticketType) : "", a.date ? String(a.date) : ""]),
    );
  }
  for (const m of jsonArr(selected.meals)) {
    await svc(
      "Other",
      `${m.mealType || "Meal"} ${m.restaurant || ""}`.trim(),
      m,
      lineNote(m, [m.cuisine ? String(m.cuisine) : "", m.date ? String(m.date) : ""]),
    );
  }
  const visa = selected.visa && typeof selected.visa === "object" ? (selected.visa as Record<string, unknown>) : null;
  if (visa?.enabled) {
    await svc(
      "Visa",
      `Visa — ${visa.visaType || "Tourist"}`,
      visa,
      lineNote(visa, [visa.entryType ? String(visa.entryType) : "", visa.processingTime ? String(visa.processingTime) : ""]),
    );
  }
  const ins = selected.insurance && typeof selected.insurance === "object" ? (selected.insurance as Record<string, unknown>) : null;
  if (ins?.enabled) {
    await svc(
      "Insurance",
      `${ins.provider || "Insurance"} ${ins.planName || ""}`.trim(),
      ins,
      lineNote(ins, [ins.coverage ? String(ins.coverage) : "", ins.validity ? String(ins.validity) : ""]),
    );
  }
  for (const day of jsonArr(selected.itinerary)) {
    const items = Array.isArray(day.items) ? (day.items as Array<{ activityName?: string; description?: string }>) : [];
    const notes = items.map((i) => i.activityName || i.description || "").filter(Boolean).join("; ");
    await svc("Other", String(day.title || `Day ${day.day || ""}`), { costPrice: 0, sellingPrice: 0 }, notes || undefined);
  }
  for (const a of jsonArr(selected.addOns)) {
    if (a.enabled === false) continue;
    await db.bookingAddOn.create({
      data: {
        bookingId,
        addOnType: String(a.name || a.addOnType || "Other"),
        title: String(a.name || "Add-on"),
        amount: Math.round(Number(a.sellingPrice || 0)),
        costPrice: Math.round(Number(a.costPrice || 0)),
      },
    });
  }
}

function packageHasCopiedLines(selected: {
  hotels: unknown;
  flights: unknown;
  transfers: unknown;
  activities: unknown;
  meals: unknown;
  itinerary: unknown;
  visa: unknown;
  insurance: unknown;
  addOns: unknown;
}) {
  const visa = selected.visa && typeof selected.visa === "object" ? (selected.visa as { enabled?: boolean }) : null;
  const ins = selected.insurance && typeof selected.insurance === "object" ? (selected.insurance as { enabled?: boolean }) : null;
  return (
    jsonArr(selected.hotels).length +
      jsonArr(selected.flights).length +
      jsonArr(selected.transfers).length +
      jsonArr(selected.activities).length +
      jsonArr(selected.meals).length +
      jsonArr(selected.itinerary).length +
      jsonArr(selected.addOns).length >
      0 ||
    Boolean(visa?.enabled) ||
    Boolean(ins?.enabled)
  );
}

async function findBooking(req: AuthRequest, agencyScope: ScopeFn, branchScope: BranchScopeFn) {
  return db.booking.findFirst({
    where: { id: paramId(req), ...agencyScope(req), ...branchScope(req, "agentId") },
    include: BOOKING_INCLUDE,
  });
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
  // ── Proceed to Booking from Quotation ────────────────────────────────────
  app.post(
    "/api/quotations/:id/proceed-to-booking",
    requireAuth,
    requireAnyPermission("quotations", "bookings"),
    async (req: AuthRequest, res: Response) => {
      try {
        const quoteId = paramId(req);
        if (isAgentLike(req.auth?.role)) {
          res.status(403).json({ error: "Agents cannot convert quotations to bookings" });
          return;
        }
        const quote = await db.quotation.findFirst({
          where: { id: quoteId, ...agencyScope(req) },
          include: { packages: true },
        });
        if (!quote) {
          res.status(404).json({ error: "Quotation not found" });
          return;
        }
        if (quote.status === "Expired") {
          res.status(400).json({ error: "Renew expired quotation before conversion" });
          return;
        }
        if (quote.status === "Converted to Booking" && quote.convertedBookingId) {
          const prior = await db.booking.findFirst({ where: { id: quote.convertedBookingId } });
          res.status(409).json({ error: "Booking already exists for this quotation", booking: prior });
          return;
        }
        if (quote.status !== "Accepted") {
          res.status(400).json({
            error: "Quotation must be Accepted before proceeding to booking",
          });
          return;
        }
        if (!quote.customerName?.trim()) {
          res.status(400).json({ error: "Customer name is required before conversion" });
          return;
        }
        if (!quote.travelStartDate && !quote.travelDates) {
          res.status(400).json({ error: "Travel dates are required before conversion" });
          return;
        }
        const existing = await db.booking.findFirst({ where: { quotationId: quote.id } });
        if (existing) {
          res.status(409).json({ error: "Booking already exists for this quotation", booking: existing });
          return;
        }

        const adults = quote.adults ?? 2;
        const children = quote.children ?? 0;
        const infants = quote.infants ?? 0;
        const rooms = Math.max(1, Math.ceil((adults + children) / 3));
        const packageValue = quote.total;
        const costPrice = quote.totalNetCost ?? 0;
        const grossProfit = quote.grossProfit ?? packageValue - costPrice;
        const bookingRef = await nextBookingRef();
        const salesName = quote.salesExecutiveName || quote.createdBy || req.auth?.email || "Sales";
        const opsName = (req.body?.operationsExecutiveName as string) || "Operations";

        const booking = await db.booking.create({
          data: {
            bookingRef,
            customerName: quote.customerName,
            service: quote.service === "International" ? "Holiday" : (quote.service as string) || "Holiday",
            route: quote.destination || quote.travelDates || "Package",
            travelDate: (quote.travelDates || quote.validTill || "").slice(0, 32) || new Date().toISOString().slice(0, 10),
            amount: packageValue,
            commission: Math.round(packageValue * 0.05),
            status: "Awaiting Passenger Details",
            paymentStatus: "Pending",
            agentId: req.auth?.userId,
            agentName: salesName,
            agencyId: ownAgencyId(req, quote.agencyId ?? undefined),
            agencyName: "",
            branchId: ownBranchId(req) ?? quote.branchId ?? undefined,
            quotationId: quote.id,
            quoteNo: quote.quoteNo,
            destination: quote.destination,
            nights: quote.nights,
            totalRooms: rooms,
            adults,
            children,
            infants,
            packageValue,
            amountPaid: 0,
            balanceAmount: packageValue,
            costPrice,
            grossProfit,
            netProfit: Math.round(grossProfit * 0.9),
            salesExecutiveId: quote.createdById ?? req.auth?.userId,
            salesExecutiveName: salesName,
            operationsExecutiveName: opsName,
            isInternational: quote.isInternational,
            pricingLocked: true,
            pricingSnapshot: {
              quoteNo: quote.quoteNo,
              amount: quote.amount,
              gst: quote.gst,
              total: quote.total,
              totalNetCost: quote.totalNetCost,
              couponCode: quote.couponCode,
              couponDiscount: quote.couponDiscount,
              lineItems: quote.lineItems,
              lockedAt: new Date().toISOString(),
            },
            termsAndConditions: quote.termsAndConditions,
            paymentTerms: quote.paymentTerms,
            cancellationPolicy: quote.cancellationPolicy,
            packageIncludes: quote.packageIncludes ?? [],
            packageExcludes: quote.packageExcludes ?? [],
            currency: quote.currency || "INR",
          },
        });

        const slots = passengerSlotsFromRooms(rooms, adults, children, infants);
        const nameParts = quote.customerName.trim().split(/\s+/);
        await db.bookingPassenger.createMany({
          data: slots.map((s, idx) => ({
            bookingId: booking.id,
            roomIndex: s.roomIndex,
            isLead: s.isLead,
            firstName: idx === 0 ? (nameParts[0] || "Lead") : `Passenger`,
            lastName: idx === 0 ? (nameParts.slice(1).join(" ") || "Traveller") : String(idx + 1),
          })),
        });

        const selected =
          quote.packages.find((p) => p.id === quote.selectedPackageId) ||
          quote.packages.find((p) => p.isSelected) ||
          quote.packages[0];
        const hasPackageLines = selected ? packageHasCopiedLines(selected) : false;

        if (!hasPackageLines) {
          await seedBookingServices(booking.id, quote.isInternational);
        }
        await seedOpsTasks({
          bookingId: booking.id,
          bookingRef,
          agencyId: booking.agencyId,
          branchId: booking.branchId,
          assignedBy: req.auth?.email || "System",
          isInternational: quote.isInternational,
        });

        if (selected) {
          await copySelectedPackageToBooking(booking.id, selected);
        }

        await db.quotation.update({
          where: { id: quote.id },
          data: {
            status: "Converted to Booking",
            convertedBookingId: booking.id,
            convertedAt: new Date(),
            convertedBy: req.auth?.email,
          },
        });

        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Proceed to Booking",
          details: `Created ${bookingRef} from ${quote.quoteNo}`,
          updatedValue: { bookingRef, quotationId: quote.id, version: quote.currentVersion },
        });
        await notify({
          agencyId: booking.agencyId,
          title: "Booking Created",
          message: `${bookingRef} created from quotation ${quote.quoteNo}`,
          priority: "high",
        });

        const full = await db.booking.findUnique({ where: { id: booking.id }, include: BOOKING_INCLUDE });
        res.status(201).json({ booking: full });
      } catch (e) {
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
        res.json({ booking, tasks, audits });
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
        const existing = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
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
        res.json({ booking });
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
          where: { id: paramId(req), ...agencyScope(req) },
          include: { passengers: true },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const list = Array.isArray(req.body?.passengers) ? req.body.passengers : [];
        if (!list.length) {
          res.status(400).json({ error: "passengers array required" });
          return;
        }
        for (const p of list) {
          const err = validatePassenger(p, existing.isInternational);
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
                  passportNumber: existing.isInternational ? p.passportNumber : null,
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

  // ── Documents (metadata; file stored as URL / data URL ≤10MB) ────────────
  app.post(
    "/api/bookings/:id/documents",
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
        const { docType, fileName, fileUrl, mimeType, sizeBytes, passengerId } = req.body || {};
        if (!docType || !fileName || !fileUrl) {
          res.status(400).json({ error: "docType, fileName, fileUrl required" });
          return;
        }
        const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
        if (mimeType && !allowed.includes(String(mimeType).toLowerCase()) && !String(mimeType).includes("pdf") && !String(mimeType).includes("image")) {
          res.status(400).json({ error: "Supported formats: PDF, JPG, PNG" });
          return;
        }
        if (sizeBytes && Number(sizeBytes) > 10 * 1024 * 1024) {
          res.status(400).json({ error: "Maximum file size is 10 MB" });
          return;
        }
        const doc = await db.bookingDocument.create({
          data: {
            bookingId: booking.id,
            passengerId: passengerId || null,
            docType,
            fileName,
            fileUrl,
            mimeType: mimeType || null,
            sizeBytes: Number(sizeBytes) || 0,
            uploadedBy: req.auth?.email,
          },
        });
        await writeAudit({
          req,
          agencyId: booking.agencyId,
          bookingId: booking.id,
          action: "Document Uploaded",
          details: `${docType}: ${fileName}`,
        });
        res.status(201).json({ document: doc });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Server error" });
      }
    },
  );

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
        const payAmount = Number(req.body?.amount) || pr.amount - pr.amountPaid;
        if (payAmount <= 0) {
          res.status(400).json({ error: "Invalid payment amount" });
          return;
        }
        const method = String(req.body?.method || "Bank Transfer");
        let gateway = String(req.body?.gateway || "Manual");
        if (!isOfflinePaymentMethod(method)) {
          const keys = await razorpayKeysForAgency(pr.agencyId);
          const { orderId, paymentId, signature } = req.body ?? {};
          if (!keys || !orderId || !paymentId || !signature) {
            res.status(400).json({
              error: "Online payments require a verified Razorpay payment. Use Cash, Bank Transfer, or Cheque for manual collection.",
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
        }
        const newPaid = Math.min(pr.amount, pr.amountPaid + payAmount);
        const status = newPaid >= pr.amount ? "Paid" : "Partially Paid";
        const updated = await db.paymentRequest.update({
          where: { id: pr.id },
          data: { amountPaid: newPaid, status },
        });
        await db.payment.create({
          data: {
            txnId: `TXN-BMS-${Date.now()}`,
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
            gateway,
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
        const data: Record<string, unknown> = {};
        for (const k of ["status", "confirmationNo", "supplierName", "supplierRef", "voucherUrl", "ticketUrl", "notes"] as const) {
          if (req.body?.[k] !== undefined) data[k] = req.body[k];
        }
        if (req.body?.costPrice !== undefined) data.costPrice = Number(req.body.costPrice);
        if (req.body?.sellingPrice !== undefined) data.sellingPrice = Number(req.body.sellingPrice);
        if (data.status === "Confirmed" || data.status === "Issued") data.confirmedAt = new Date();
        const updated = await db.bookingService.update({ where: { id: svc.id }, data });

        const all = await db.bookingService.findMany({ where: { bookingId: booking.id } });
        const confirmed = all.filter((s) => s.status === "Confirmed" || s.status === "Issued").length;
        let bookingStatus = booking.status;
        if (confirmed === 0) bookingStatus = booking.status;
        else if (confirmed < all.length) bookingStatus = "Partially Confirmed";
        else bookingStatus = "Confirmed";

        const costPrice = all.reduce((s, x) => s + (x.id === updated.id ? Number(updated.costPrice) : x.costPrice), 0);
        await db.booking.update({
          where: { id: booking.id },
          data: {
            status: ["Completed", "Cancelled", "Travel Documents Ready"].includes(booking.status)
              ? booking.status
              : bookingStatus,
            costPrice,
            grossProfit: booking.amount - costPrice,
            netProfit: Math.round((booking.amount - costPrice) * 0.9),
          },
        });

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
        });
        if (!booking) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const invoiceType = req.body?.invoiceType || "Tax Invoice";
        const amount = Number(req.body?.amount) || booking.amount;
        const gst = Number(req.body?.gst) ?? Math.round(amount * 0.18 / 1.18);
        const total = Number(req.body?.total) || amount;
        const invoice = await db.bookingInvoice.create({
          data: {
            bookingId: booking.id,
            agencyId: booking.agencyId,
            invoiceNo: await nextInvoiceNo(invoiceType),
            invoiceType,
            amount,
            gst,
            total,
            notes: req.body?.notes,
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
    requireAnyPermission("finance", "suppliers"),
    requireRole("super_admin", "agency_admin", "accountant"),
    async (req: AuthRequest, res: Response) => {
      try {
        const payout = await db.supplierPayout.create({
          data: {
            bookingId: req.body?.bookingId || null,
            agencyId: ownAgencyId(req, req.body?.agencyId),
            supplierName: req.body?.supplierName || "Supplier",
            amount: Number(req.body?.amount) || 0,
            currency: req.body?.currency || "INR",
            paymentMode: req.body?.paymentMode,
            utr: req.body?.utr,
            paymentDate: req.body?.paymentDate,
            paymentTime: req.body?.paymentTime,
            status: req.body?.status || "Pending",
            notes: req.body?.notes,
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

  app.get(
    "/api/supplier-payouts",
    requireAuth,
    requireAnyPermission("finance", "suppliers"),
    async (req: AuthRequest, res: Response) => {
      try {
        const payouts = await db.supplierPayout.findMany({
          where: agencyScope(req),
          orderBy: { createdAt: "desc" },
          take: 200,
        });
        res.json({ payouts });
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
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
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
        res.json({ booking });
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
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
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
        res.json({ booking });
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
    requireRole("super_admin", "agency_admin", "branch_manager"),
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await db.booking.findFirst({
          where: { id: paramId(req), ...agencyScope(req) },
        });
        if (!existing) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        const booking = await db.booking.update({
          where: { id: existing.id },
          data: {
            salesExecutiveId: req.body?.salesExecutiveId ?? existing.salesExecutiveId,
            salesExecutiveName: req.body?.salesExecutiveName ?? existing.salesExecutiveName,
            operationsExecutiveId: req.body?.operationsExecutiveId ?? existing.operationsExecutiveId,
            operationsExecutiveName: req.body?.operationsExecutiveName ?? existing.operationsExecutiveName,
          },
          include: BOOKING_INCLUDE,
        });
        res.json({ booking });
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
}
