import express from "express";
import crypto from "crypto";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import type { Prisma } from "@prisma/client";
import { validateEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { db } from "./lib/db.js";
import { signToken } from "./lib/jwt.js";
import {
  allowDemoPayments,
  allowInsecureTempPasswordResponse,
  sendEmail,
} from "./lib/email.js";
import { requireAuth, requireRole, requirePermission, requireAnyPermission, type AuthRequest } from "./middleware/auth.js";
import { generateFlights, generateHotels } from "./lib/mock-data.js";
import { searchAmadeusFlights, searchAmadeusHotels } from "./lib/amadeus.js";
import { effectivePermissions } from "./lib/permissions.js";
import { mountProductRoutes } from "./routes/products.js";
import { mountDestinationRoutes } from "./routes/destinations.js";
import { mountPackageRoutes } from "./routes/packages.js";
import { mountTripPlannerRoutes } from "./routes/trip-planner.js";
import { mountQuoteTemplateRoutes } from "./routes/quote-templates.js";
import { mountTravelProposalRoutes } from "./routes/travel-proposals.js";
import { mountProposalPdfRoutes } from "./routes/proposal-pdf.js";
import { mountBmsRoutes } from "./routes/bms.js";
import { mountQuotationRoutes } from "./routes/quotations.js";
import { sanitizeQuotationForRole } from "./lib/quotations.js";
import { analyticsMiddleware } from "./middleware/analytics.js";
import { analyticsRouter } from "./routes/analytics.js";
import {
  isValidOperationsType,
  isValidDeliveryType,
  departmentForOperationsType,
} from "./lib/support-ticket-taxonomy.js";
import {
  validate, loginSchema, bookingSchema, customerSchema, leadSchema, quotationSchema,
  paymentSchema, employeeSchema, employeeUpdateSchema, taskSchema, agencySchema,
  agencyUpdateSchema, branchSchema, branchUpdateSchema, walletSchema,
  attendanceCheckSchema, leaveSchema, leaveStatusSchema, forgotPasswordSchema,
  resetPasswordSchema, agentRegistrationSchema,
  couponCreateSchema, couponUpdateSchema, couponValidateSchema,
} from "./lib/validation.js";
import { effectiveCouponStatus, validateCouponForOrder } from "./lib/coupons.js";
import { getAgencyApiKeys, maskSecret, resolveDefaultAgencyId, type DynamicApiKeys } from "./lib/api-key-config.js";
import {
  assertRazorpayPayment,
  handleRazorpayWebhook,
  razorpayAuthHeader,
  razorpayKeysForAgency,
} from "./lib/razorpay.js";
import { bookkeepingPaymentStatus, isOfflinePaymentMethod } from "./lib/payments.js";

validateEnv();

// Every role except super_admin only ever sees rows from its own agency.
// A missing agencyId on a non-super_admin token resolves to a sentinel that
// matches nothing, rather than silently falling through to "see everything".
function agencyScope(req: AuthRequest): Record<string, unknown> {
  if (req.auth?.role === "super_admin") return {};
  return { agencyId: req.auth?.agencyId ?? "__no_agency__" };
}

// The agencyId a create/write should be stamped with — always the caller's own
// agency for non-super_admin roles, ignoring whatever the client body claims.
function ownAgencyId(req: AuthRequest, fallback?: string): string | undefined {
  if (req.auth?.role === "super_admin") return fallback ?? req.auth?.agencyId ?? undefined;
  return req.auth?.agencyId ?? undefined;
}

// Branch managers see their whole branch; employees/accountants additionally only
// see records attributed to them (via ownField, e.g. "agentId") within that branch.
// super_admin/agency_admin are agency-wide and unaffected.
function branchScope(req: AuthRequest, ownField?: string): Record<string, unknown> {
  const role = req.auth?.role;
  if (role === "super_admin" || role === "agency_admin") return {};
  const scope: Record<string, unknown> = { branchId: req.auth?.branchId ?? "__no_branch__" };
  if (ownField && (role === "employee" || role === "accountant")) {
    scope[ownField] = req.auth?.userId;
  }
  return scope;
}

// The branchId a create/write should be stamped with — the caller's own branch,
// if they belong to one (branch_manager/employee/accountant); agency-wide roles
// (super_admin/agency_admin) create unscoped records.
function ownBranchId(req: AuthRequest): string | undefined {
  return req.auth?.branchId ?? undefined;
}

function routeParamId(req: { params: Record<string, string | string[] | undefined> }): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : String(id ?? "");
}

/**
 * Settings tenant. Superadmin may pass ?agencyId= / body.agencyId;
 * if omitted, falls back to the first agency so platform keys can be saved once.
 */
async function resolveSettingsAgencyId(req: AuthRequest, res: express.Response): Promise<string | null> {
  if (req.auth?.role === "super_admin") {
    const fromQuery = typeof req.query.agencyId === "string" ? req.query.agencyId : undefined;
    const fromBody = typeof req.body?.agencyId === "string" ? req.body.agencyId : undefined;
    const id = fromQuery || fromBody || req.auth.agencyId || (await resolveDefaultAgencyId());
    if (!id) {
      res.status(400).json({ error: "No agency found. Create an agency first, then save API keys." });
      return null;
    }
    return id;
  }
  const id = req.auth?.agencyId;
  if (!id) {
    res.status(400).json({ error: "Agency context required" });
    return null;
  }
  return id;
}


// Opt-in pagination: ?page=2&pageSize=50. Omitting both preserves each route's
// existing default page size and behaves exactly as before (page 1, that size).
function parsePagination(req: AuthRequest, defaultPageSize: number, maxPageSize: number) {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(req.query.pageSize as string, 10) || defaultPageSize));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

// A readable one-time password for freshly created logins (e.g. "Rk4-Wmp2-Tq9x").
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const group = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

const app = express();
const PORT = process.env.PORT || 4000;

if (isProdLike()) {
  app.set("trust proxy", 1);
}

function isProdLike() {
  return process.env.NODE_ENV === "production";
}

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Strict security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// CORS with strict origin validation
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 3600,
}));

app.post("/api/payments/razorpay/webhook", express.raw({ type: "application/json" }), (req, res) => {
  void handleRazorpayWebhook(req, res);
});

// Limit request size to prevent DoS attacks
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(pinoHttp({ logger }));
app.use(analyticsMiddleware());

const isProd = process.env.NODE_ENV === "production";
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Production: protect against brute force without blocking multi-role demos or mobile retries.
  // Only failed auth responses count (skipSuccessfulRequests).
  limit: isProd ? 60 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
  skip: () => process.env.NODE_ENV === "test",
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl.includes("/payments/razorpay/webhook") || req.originalUrl === "/api/health",
});
app.use("/api", apiLimiter);

let requestCount = 0;
let errorCount = 0;
const requestWindowStart = Date.now();
app.use((req, res, next) => {
  requestCount += 1;
  res.on("finish", () => {
    if (res.statusCode >= 500) errorCount += 1;
  });
  next();
});

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "travelpro-backend",
    name: "Trevio Global API",
    version: "0.3.0",
    health: "/api/health",
    endpoints: "/api",
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "travelpro-backend", timestamp: new Date().toISOString() });
  } catch (e) {
    logger.error(e);
    res.status(503).json({ status: "unavailable", service: "travelpro-backend", timestamp: new Date().toISOString() });
  }
});

app.get("/api", (_req, res) => {
  res.json({
    name: "Trevio Global API",
    version: "0.3.0",
    auth: "JWT Bearer",
    endpoints: [
      "/api/health",
      "/api/auth/login",
      "/api/auth/me",
      "/api/auth/forgot-password",
      "/api/bookings",
      "/api/customers",
      "/api/leads",
      "/api/quotations",
      "/api/payments",
      "/api/employees",
      "/api/tasks",
      "/api/branches",
      "/api/dashboard",
      "/api/reports",
      "/api/commission",
      "/api/finance",
      "/api/agencies",
      "/api/notifications",
      "/api/audit-logs",
      "/api/wallet",
      "/api/flights/search",
      "/api/hotels/search",
      "/api/analytics/platform",
      "/api/analytics/employees",
      "/api/attendance",
      "/api/leaves",
    ],
  });
});

app.post("/api/auth/login", authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.user.findUnique({
      where: { email },
      include: { agency: true, branch: true },
    });
    if (!user || !user.password) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await db.auditLog.create({
      data: { userId: user.id, agencyId: user.agencyId, userName: user.name, action: "Login", module: "Auth", ip: req.ip || "0.0.0.0" },
    });
    const today = new Date().toISOString().slice(0, 10);
    const deviceUsed = String(req.headers["user-agent"] || "").slice(0, 240) || null;
    const ipAddress = req.ip || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "0.0.0.0";
    await db.employeeActivitySnapshot.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      create: {
        userId: user.id,
        agencyId: user.agencyId,
        date: today,
        loginAt: new Date(),
        lastActivity: "Login",
        ipAddress,
        deviceUsed,
      },
      update: {
        loginAt: new Date(),
        lastActivity: "Login",
        ipAddress,
        deviceUsed,
      },
    });
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      agencyId: user.agencyId,
      branchId: user.branchId,
      permissions: Array.isArray(user.permissions) ? (user.permissions as string[]) : null,
    });
    const { password: _password, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.auth!.userId },
      include: { agency: true, branch: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const { password: _password, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Forgot password: issues a time-limited reset token (does not change password yet).
// Production emails the token via SendGrid; never returns it in JSON unless insecure mode.
app.post("/api/auth/forgot-password", authLimiter, validate(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      res.json({ ok: true, emailed: false });
      return;
    }
    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(resetToken, 10);
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await db.user.update({
      where: { id: user.id },
      data: { resetToken: tokenHash, resetTokenExpires },
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        agencyId: user.agencyId,
        userName: user.name,
        action: "Password Reset Requested",
        module: "Auth",
        ip: req.ip || "0.0.0.0",
      },
    });

    const emailed = await sendEmail({
      to: user.email,
      subject: "Reset your Trevio password",
      template: "password_reset",
      data: { agentName: user.name, resetToken },
      agencyId: user.agencyId,
    });

    if (allowInsecureTempPasswordResponse()) {
      res.json({ ok: true, emailed, resetToken });
      return;
    }

    if (!emailed) {
      logger.warn({ email: user.email }, "Password reset token issued without SendGrid delivery");
    }
    res.json({
      ok: true,
      emailed,
      message: emailed
        ? "If an account exists, a reset code has been emailed. It expires in 1 hour."
        : "If an account exists, a reset was started. Configure SMTP or SENDGRID_API_KEY to email the code.",
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/reset-password", authLimiter, validate(resetPasswordSchema), async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    const user = await db.user.findUnique({ where: { email } });
    if (!user?.resetToken || !user.resetTokenExpires) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }
    if (user.resetTokenExpires.getTime() < Date.now()) {
      await db.user.update({
        where: { id: user.id },
        data: { resetToken: null, resetTokenExpires: null },
      });
      res.status(400).json({ error: "Reset token expired. Request a new one." });
      return;
    }
    const valid = await bcrypt.compare(String(token), user.resetToken);
    if (!valid) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }
    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await db.user.update({
      where: { id: user.id },
      data: { password: passwordHash, resetToken: null, resetTokenExpires: null },
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        agencyId: user.agencyId,
        userName: user.name,
        action: "Password Reset Completed",
        module: "Auth",
        ip: req.ip || "0.0.0.0",
      },
    });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/register", authLimiter, validate(agentRegistrationSchema), async (req, res) => {
  const allowRegister = process.env.ALLOW_PUBLIC_REGISTRATION === "true"
    || (process.env.ALLOW_PUBLIC_REGISTRATION !== "false" && process.env.NODE_ENV !== "production");
  if (!allowRegister) {
    res.status(403).json({ error: "Public registration is disabled. Ask an administrator to create your account." });
    return;
  }
  try {
    const body = req.body;
    const email = String(body.email).trim().toLowerCase();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const phone = `${body.countryCode} ${body.phone}`.trim();
    const passwordHash = await bcrypt.hash(body.password, 10);

    const result = await db.$transaction(async (tx) => {
      const agency = await tx.agency.create({
        data: {
          name: body.companyName,
          owner: body.fullName,
          email,
          phone,
          plan: "Starter",
          status: "Trial",
          address: body.address,
          country: body.country,
          state: body.state,
          city: body.city,
          panNumber: body.panNumber || null,
          gstNumber: body.gstNumber || null,
          vatNumber: body.gstNumber || null,
          gstProofUrl: body.gstProofUrl || null,
          termsAcceptedAt: new Date(),
          apiAllocation: { flights: 5000, hotels: 3000 },
        },
      });

      const branch = await tx.branch.create({
        data: {
          agencyId: agency.id,
          name: `${body.companyName} — ${body.city}`,
          manager: body.fullName,
          city: body.city,
        },
      });

      const user = await tx.user.create({
        data: {
          name: body.fullName,
          email,
          phone,
          password: passwordHash,
          role: "agency_admin",
          designation: "Agency Owner",
          agencyId: agency.id,
          branchId: branch.id,
        },
        include: { agency: true, branch: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          agencyId: agency.id,
          userName: user.name,
          action: "Agent Registration",
          module: "Auth",
          ip: req.ip || "0.0.0.0",
          details: `New agency registered: ${agency.name}`,
        },
      });

      return user;
    });

    const token = signToken({
      userId: result.id,
      email: result.email,
      role: result.role,
      agencyId: result.agencyId,
      branchId: result.branchId,
      permissions: null,
    });

    const { password: _password, ...safeUser } = result;
    res.status(201).json({ user: safeUser, token });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/bookings", requireAuth, requireAnyPermission("flights", "hotels", "holiday", "bookings"), async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const service = req.query.service as string | undefined;
    const search = req.query.q as string | undefined;
    const where: Record<string, unknown> = { ...agencyScope(req), ...branchScope(req, "agentId") };
    if (status && status !== "All") where.status = status;
    if (service && service !== "All") where.service = service;
    if (search) where.customerName = { contains: search };
    const { skip, take, page, pageSize } = parsePagination(req, 100, 200);
    const [bookings, total] = await Promise.all([
      db.booking.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      db.booking.count({ where }),
    ]);
    res.json({ bookings, total, page, pageSize });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/bookings", requireAuth, requireAnyPermission("flights", "hotels", "holiday", "bookings"), validate(bookingSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const booking = await db.booking.create({
      data: {
        bookingRef: `BK-${Math.floor(10000 + Math.random() * 90000)}`,
        customerName: body.customerName,
        service: body.service,
        route: body.route,
        travelDate: body.travelDate,
        amount: body.amount,
        commission: body.commission || 0,
        status: body.status || "Confirmed",
        paymentStatus: body.paymentStatus || "Paid",
        paymentMethod: body.paymentMethod || "Razorpay",
        agentId: req.auth?.userId,
        agentName: body.agentName || "System",
        agencyId: ownAgencyId(req, body.agencyId),
        agencyName: body.agencyName || "",
        branchId: ownBranchId(req),
        packageValue: body.amount,
        amountPaid: body.paymentStatus === "Paid" || !body.paymentStatus ? body.amount : 0,
        balanceAmount: body.paymentStatus === "Paid" || !body.paymentStatus ? 0 : body.amount,
        salesExecutiveName: body.agentName || "System",
      },
    });
    res.status(201).json({ booking });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/bookings/:id", requireAuth, requirePermission("bookings"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.booking.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req, "agentId") },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { status, paymentStatus } = req.body;
    const data: Record<string, string> = {};
    if (status) data.status = status;
    if (paymentStatus) data.paymentStatus = paymentStatus;
    const booking = await db.booking.update({ where: { id: existing.id }, data });
    res.json({ booking });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/customers", requireAuth, requirePermission("customers"), async (req: AuthRequest, res) => {
  try {
    const where = agencyScope(req);
    const { skip, take, page, pageSize } = parsePagination(req, 200, 200);
    const [customers, total] = await Promise.all([
      db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      db.customer.count({ where }),
    ]);
    res.json({ customers, total, page, pageSize });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/customers", requireAuth, requirePermission("customers"), validate(customerSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const customer = await db.customer.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        type: body.type || "Individual",
        tier: body.tier || "Silver",
        passportNo: body.passportNo,
        visaStatus: body.visaStatus,
        city: body.city || "",
        agencyId: ownAgencyId(req, body.agencyId),
      },
    });
    res.status(201).json({ customer });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/leads", requireAuth, requirePermission("crm"), async (req: AuthRequest, res) => {
  try {
    const leads = await db.lead.findMany({ where: { ...agencyScope(req), ...branchScope(req, "assignedToId") }, orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ leads, total: leads.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/leads", requireAuth, requirePermission("crm"), validate(leadSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const lead = await db.lead.create({
      data: {
        customerName: body.customerName,
        email: body.email || "",
        phone: body.phone || "",
        source: body.source,
        service: body.service,
        value: body.value,
        stage: body.stage || "New",
        assignedTo: body.assignedTo || "Unassigned",
        assignedToId: req.auth?.userId,
        expectedClose: body.expectedClose || new Date().toISOString().slice(0, 10),
        notes: body.notes || "",
        agencyId: ownAgencyId(req),
        branchId: ownBranchId(req),
      },
    });
    res.status(201).json({ lead });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/leads/:id", requireAuth, requirePermission("crm"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.lead.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req, "assignedToId") },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { stage } = req.body;
    const lead = await db.lead.update({
      where: { id: existing.id },
      data: { stage },
    });
    res.json({ lead });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/quotations", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res) => {
  try {
    const quotations = await db.quotation.findMany({
      where: { deletedAt: null, ...agencyScope(req), ...branchScope(req, "createdById") },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const role = req.auth?.role;
    res.json({
      quotations: quotations.map((q) => sanitizeQuotationForRole(q as unknown as Record<string, unknown>, role)),
      total: quotations.length,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/quotations", requireAuth, requirePermission("quotations"), validate(quotationSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const agencyId = ownAgencyId(req);
    const count = await db.quotation.count();
    const quoteNo = body.quoteNo || `QT-2025-${String(count + 1).padStart(3, "0")}`;

    let couponCode: string | null = null;
    let couponDiscount = 0;
    let couponIdForRedeem: string | null = null;
    const requestedCode = typeof body.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";
    if (requestedCode) {
      if (!agencyId) {
        res.status(400).json({ error: "Agency context required to apply a coupon" });
        return;
      }
      const coupon = await db.coupon.findUnique({
        where: { agencyId_code: { agencyId, code: requestedCode } },
      });
      const fromLines = Array.isArray(body.lineItems)
        ? body.lineItems.reduce((s: number, i: { qty?: number; price?: number }) => s + Number(i.qty || 0) * Number(i.price || 0), 0)
        : 0;
      const orderAmount = fromLines > 0
        ? fromLines
        : Math.max(0, Number(body.amount || 0) + Number(body.couponDiscount || 0));
      const check = validateCouponForOrder(coupon, orderAmount);
      if (!check.ok) {
        res.status(400).json({ error: check.message, code: check.error });
        return;
      }
      couponCode = requestedCode;
      couponDiscount = check.discountAmount;
      couponIdForRedeem = coupon!.id;
    }

    const quotation = await db.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          quoteNo,
          customerName: body.customerName,
          service: body.service,
          items: body.items,
          amount: body.amount,
          gst: body.gst,
          total: body.total,
          status: body.status || "Draft",
          validTill: body.validTill,
          createdBy: body.createdBy || req.auth?.email || "System",
          createdById: req.auth?.userId,
          agencyId,
          branchId: ownBranchId(req),
          isInternational: body.isInternational ?? false,
          contactPerson: body.contactPerson,
          contactEmail: body.contactEmail || null,
          contactPhone: body.contactPhone,
          destination: body.destination,
          country: body.country,
          departureCity: body.departureCity,
          travelDates: body.travelDates,
          returnDate: body.returnDate,
          nights: body.nights,
          days: body.days,
          adults: body.adults,
          children: body.children,
          infants: body.infants,
          hotelStarPreference: body.hotelStarPreference,
          roomTypePreference: body.roomTypePreference,
          mealPlanPreference: body.mealPlanPreference,
          location: body.location,
          budget: body.budget,
          currency: body.currency ?? "INR",
          packageIncludes: body.packageIncludes ?? [],
          packageExcludes: body.packageExcludes ?? [],
          termsAndConditions: body.termsAndConditions,
          paymentTerms: body.paymentTerms,
          cancellationPolicy: body.cancellationPolicy,
          salesExecutiveName: body.salesExecutiveName,
          salesExecutivePhone: body.salesExecutivePhone,
          salesExecutiveEmail: body.salesExecutiveEmail || null,
          approvalStatus: body.approvalStatus ?? "Draft",
          lineItems: body.lineItems ?? [],
          couponCode,
          couponDiscount,
        },
      });

      if (couponIdForRedeem && agencyId && couponCode) {
        const fromLines = Array.isArray(body.lineItems)
          ? body.lineItems.reduce((s: number, i: { qty?: number; price?: number }) => s + Number(i.qty || 0) * Number(i.price || 0), 0)
          : 0;
        await tx.couponRedemption.create({
          data: {
            couponId: couponIdForRedeem,
            agencyId,
            userId: req.auth?.userId,
            quotationId: created.id,
            orderAmount: fromLines > 0 ? fromLines : Math.max(0, Number(body.amount || 0) + couponDiscount),
            discountAmount: couponDiscount,
            code: couponCode,
          },
        });
        const updated = await tx.coupon.update({
          where: { id: couponIdForRedeem },
          data: { usedCount: { increment: 1 } },
        });
        if (updated.usageLimit > 0 && updated.usedCount >= updated.usageLimit) {
          await tx.coupon.update({
            where: { id: couponIdForRedeem },
            data: { status: "Expired" },
          });
        }
      }

      return created;
    });

    const date = new Date().toISOString().slice(0, 10);
    await db.employeeActivitySnapshot.upsert({
      where: { userId_date: { userId: req.auth!.userId, date } },
      create: { userId: req.auth!.userId, agencyId: req.auth?.agencyId, date, quotationsCreated: 1, lastActivity: "Quotation created" },
      update: { quotationsCreated: { increment: 1 }, lastActivity: "Quotation created" },
    });
    res.status(201).json({ quotation });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/payments", requireAuth, requirePermission("payments"), async (req: AuthRequest, res) => {
  try {
    const where = { ...agencyScope(req), ...branchScope(req, "collectedById") };
    const { skip, take, page, pageSize } = parsePagination(req, 200, 200);
    const [payments, total] = await Promise.all([
      db.payment.findMany({ where, orderBy: { date: "desc" }, skip, take }),
      db.payment.count({ where }),
    ]);
    res.json({ payments, total, page, pageSize });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/payments", requireAuth, requirePermission("payments"), validate(paymentSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const txnId = `pay_${Date.now().toString(36).toUpperCase()}`;
    let status = bookkeepingPaymentStatus(body.method, body.status);
    if (!isOfflinePaymentMethod(body.method) && body.orderId && body.paymentId && body.signature) {
      const keys = await razorpayKeysForAgency(ownAgencyId(req));
      if (keys) {
        const check = await assertRazorpayPayment({
          orderId: String(body.orderId),
          paymentId: String(body.paymentId),
          signature: String(body.signature),
          amountRupees: Number(body.amount),
          keyId: keys.keyId,
          keySecret: keys.keySecret,
        });
        if (!check.ok) {
          res.status(400).json({ error: check.error });
          return;
        }
        status = "Success";
      }
    }
    if (status === "Success" && !isOfflinePaymentMethod(body.method) && !(body.orderId && body.paymentId && body.signature)) {
      status = "Pending";
    }
    const payment = await db.payment.create({
      data: {
        txnId,
        customerName: body.customerName,
        bookingRef: body.bookingRef || "—",
        amount: body.amount,
        method: body.method,
        status,
        type: body.type || "Payment",
        gateway: body.gateway || (isOfflinePaymentMethod(body.method) ? "Manual" : "Razorpay"),
        agencyId: ownAgencyId(req),
        branchId: ownBranchId(req),
        collectedById: req.auth?.userId,
      },
    });
    res.status(201).json({ payment });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Razorpay: order creation + signature verification ─────────────────────
// When keys are missing: { configured: false, demoAllowed }.
// demoAllowed is false in production unless ALLOW_DEMO_PAYMENTS=true.
app.post("/api/payments/razorpay/order", requireAuth, requireAnyPermission("payments", "wallet"), async (req, res) => {
  try {
    const keys = await razorpayKeysForAgency((req as AuthRequest).auth?.agencyId);
    if (!keys) {
      return res.json({ configured: false, demoAllowed: allowDemoPayments() });
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: razorpayAuthHeader(keys.keyId, keys.keySecret) },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
        notes: {
          agencyId: (req as AuthRequest).auth?.agencyId || "",
          userId: (req as AuthRequest).auth?.userId || "",
          purpose: String(req.body?.purpose || "wallet"),
        },
      }),
    });

    if (!rzpRes.ok) {
      const detail = await rzpRes.text();
      logger.error({ detail }, "Razorpay order creation failed");
      return res.status(502).json({ error: "Payment gateway error" });
    }

    const order = await rzpRes.json() as { id: string; amount: number; currency: string };
    res.json({ configured: true, orderId: order.id, amount: order.amount, currency: order.currency, keyId: keys.keyId });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/payments/razorpay/verify", requireAuth, requireAnyPermission("payments", "wallet"), async (req, res) => {
  try {
    const keys = await razorpayKeysForAgency((req as AuthRequest).auth?.agencyId);
    const { orderId, paymentId, signature, amount } = req.body ?? {};
    if (!keys || !orderId || !paymentId || !signature) {
      return res.status(400).json({ verified: false });
    }
    const check = await assertRazorpayPayment({
      orderId: String(orderId),
      paymentId: String(paymentId),
      signature: String(signature),
      amountRupees: Number.isFinite(Number(amount)) ? Number(amount) : undefined,
      keyId: keys.keyId,
      keySecret: keys.keySecret,
    });
    return res.json({ verified: check.ok, error: check.ok ? undefined : check.error });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/agencies", requireAuth, requireRole("super_admin"), async (_req, res) => {
  try {
    const agencies = await db.agency.findMany({ orderBy: { createdAt: "desc" } });
    const enriched = await Promise.all(
      agencies.map(async (a) => {
        const [branches, employees] = await Promise.all([
          db.branch.count({ where: { agencyId: a.id } }),
          db.employee.count({ where: { agencyId: a.id } }),
        ]);
        const apiAllocation = a.apiAllocation && typeof a.apiAllocation === "object"
          ? a.apiAllocation
          : { flights: 0, hotels: 0 };
        return { ...a, apiAllocation, branches, employees };
      })
    );
    res.json({ agencies: enriched, total: enriched.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/branches", requireAuth, async (req: AuthRequest, res) => {
  try {
    const requestedAgencyId = req.query.agencyId as string | undefined;
    const where = req.auth?.role === "super_admin"
      ? (requestedAgencyId ? { agencyId: requestedAgencyId } : {})
      : agencyScope(req);
    const branches = await db.branch.findMany({ where, orderBy: { createdAt: "desc" } });
    const enriched = await Promise.all(
      branches.map(async (b) => {
        const employees = await db.employee.count({
          where: { agencyId: b.agencyId, branch: { contains: b.city } },
        });
        return { ...b, employees: employees || 0 };
      })
    );
    res.json({ branches: enriched, total: enriched.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/employees", requireAuth, requirePermission("employees"), async (req: AuthRequest, res) => {
  try {
    const requestedAgencyId = req.query.agencyId as string | undefined;
    const where = req.auth?.role === "super_admin"
      ? (requestedAgencyId ? { agencyId: requestedAgencyId } : {})
      : { ...agencyScope(req), ...branchScope(req) };
    const employees = await db.employee.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ employees, total: employees.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/employees", requireAuth, requireRole("super_admin", "agency_admin", "branch_manager"), validate(employeeSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    // branch managers may only onboard rank-and-file employees, not peers/accountants,
    // and only within their own branch
    const role = req.auth?.role === "branch_manager" ? "employee" : body.role || "employee";
    const agencyId = ownAgencyId(req, body.agencyId);
    const branchId = req.auth?.role === "branch_manager" ? req.auth?.branchId : (body.branchId ?? undefined);
    const branchRecord = branchId ? await db.branch.findUnique({ where: { id: branchId } }) : null;
    const permissions = req.auth?.role === "branch_manager" ? undefined : (body.permissions ?? undefined);

    const employee = await db.employee.create({
      data: {
        agencyId,
        branchId,
        name: body.name,
        email: body.email,
        phone: body.phone,
        designation: body.designation,
        department: body.department || "Sales",
        branch: branchRecord?.name ?? body.branch ?? "",
        role,
        status: "Active",
        salary: body.salary || 0,
        target: body.target || 0,
        joinDate: body.joinDate || new Date().toISOString().slice(0, 10),
        permissions: permissions ?? undefined,
      },
    });

    let tempPassword: string | undefined;
    let emailedCredentials = false;
    try {
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await db.user.create({
        data: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          password: passwordHash,
          role,
          designation: body.designation,
          agencyId,
          branchId,
          permissions: permissions ?? undefined,
        },
      });
      emailedCredentials = await sendEmail({
        to: body.email,
        subject: "Your Trevio employee login",
        template: "temp_credentials",
        data: { agentName: body.name, loginEmail: body.email, tempPassword },
        agencyId,
      });
    } catch {
      // Email already has a login (or another conflict) — the Employee record
      // above still succeeds; no new/duplicate login is created.
      tempPassword = undefined;
      emailedCredentials = false;
    }

    res.status(201).json({
      employee,
      tempPassword: allowInsecureTempPasswordResponse() ? tempPassword : undefined,
      emailedCredentials,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/tasks", requireAuth, requirePermission("tasks"), async (req: AuthRequest, res) => {
  try {
    const tasks = await db.task.findMany({ where: { ...agencyScope(req), ...branchScope(req, "assignedToId") }, orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ tasks, total: tasks.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/tasks", requireAuth, requirePermission("tasks"), validate(taskSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const task = await db.task.create({
      data: {
        title: body.title,
        description: body.description || "",
        assignedTo: body.assignedTo,
        assignedToId: body.assignedToId ?? req.auth?.userId,
        assignedBy: body.assignedBy || "System",
        priority: body.priority || "Medium",
        status: body.status || "To Do",
        dueDate: body.dueDate,
        relatedTo: body.relatedTo,
        agencyId: ownAgencyId(req),
        branchId: ownBranchId(req),
      },
    });
    res.status(201).json({ task });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/tasks/:id", requireAuth, requirePermission("tasks"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.task.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req, "assignedToId") },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { status, priority } = req.body;
    const data: Record<string, string> = {};
    if (status) data.status = status;
    if (priority) data.priority = priority;
    const task = await db.task.update({ where: { id: existing.id }, data });
    res.json({ task });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/audit-logs", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const logs = await db.auditLog.findMany({ where: agencyScope(req), orderBy: { createdAt: "desc" }, take: 100 });
    res.json({ logs, total: logs.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/reports", requireAuth, requirePermission("reports"), async (req: AuthRequest, res) => {
  try {
    const bookingScope = { ...agencyScope(req), ...branchScope(req, "agentId") };
    const paymentScope = { ...agencyScope(req), ...branchScope(req, "collectedById") };
    const [bookings, payments] = await Promise.all([
      db.booking.findMany({ where: bookingScope, select: { service: true, amount: true, commission: true, createdAt: true, status: true } }),
      db.payment.findMany({ where: paymentScope, select: { method: true, amount: true, status: true, type: true } }),
    ]);

    const byService: Record<string, { bookings: number; revenue: number }> = {};
    for (const b of bookings) {
      if (!byService[b.service]) byService[b.service] = { bookings: 0, revenue: 0 };
      byService[b.service].bookings += 1;
      byService[b.service].revenue += b.amount;
    }

    const byMethod: Record<string, number> = {};
    for (const p of payments.filter((x) => x.status === "Success")) {
      byMethod[p.method] = (byMethod[p.method] || 0) + 1;
    }

    const totalRevenue = bookings.reduce((s, b) => s + b.amount, 0);
    const totalCommission = bookings.reduce((s, b) => s + b.commission, 0);
    const confirmedBookings = bookings.filter((b) => !["Cancelled", "Failed"].includes(b.status)).length;

    res.json({
      summary: {
        totalRevenue,
        totalCommission,
        totalBookings: bookings.length,
        confirmedBookings,
        successPayments: payments.filter((p) => p.status === "Success").length,
      },
      byService: Object.entries(byService).map(([service, data]) => ({ service, ...data })),
      byPaymentMethod: Object.entries(byMethod).map(([method, count]) => ({ method, count })),
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/flights/search", requireAuth, requirePermission("flights"), async (req: AuthRequest, res) => {
  try {
    const origin = (req.query.origin as string) || "BOM";
    const destination = (req.query.destination as string) || "DEL";
    const count = Math.min(parseInt(req.query.count as string) || 8, 20);
    const departureDate = (req.query.departureDate as string) || undefined;
    const agencyId = req.auth?.agencyId || (await resolveDefaultAgencyId());
    const keys = await getAgencyApiKeys(agencyId);
    const provider = keys.flightProvider || "mock";

    if (provider === "amadeus" && keys.flightApiKey && keys.flightApiSecret) {
      const flights = await searchAmadeusFlights({
        clientId: keys.flightApiKey,
        clientSecret: keys.flightApiSecret,
        origin,
        destination,
        departureDate,
        max: count,
      });
      res.json({ flights, provider: "amadeus", source: "live" });
      return;
    }

    if (provider !== "mock" && (!keys.flightApiKey || !keys.flightApiSecret)) {
      res.status(400).json({
        error: `Flight provider "${provider}" needs API key + secret in Settings → API Keys.`,
        provider,
      });
      return;
    }

    if (provider !== "mock" && provider !== "amadeus") {
      res.status(400).json({
        error: `Flight provider "${provider}" is not enabled yet. Choose Amadeus (or Mock) in Settings.`,
        provider,
      });
      return;
    }

    res.json({ flights: generateFlights(origin, destination, count), provider: "mock", source: "demo" });
  } catch (e) {
    logger.error(e);
    res.status(502).json({
      error: e instanceof Error ? e.message : "Flight search failed",
      provider: "amadeus",
    });
  }
});

app.get("/api/hotels/search", requireAuth, requirePermission("hotels"), async (req: AuthRequest, res) => {
  try {
    const city = (req.query.city as string) || "Mumbai";
    const count = Math.min(parseInt(req.query.count as string) || 8, 20);
    const checkIn = (req.query.checkIn as string) || undefined;
    const checkOut = (req.query.checkOut as string) || undefined;
    const agencyId = req.auth?.agencyId || (await resolveDefaultAgencyId());
    const keys = await getAgencyApiKeys(agencyId);
    // Prefer hotel keys; if hotel provider is amadeus with empty keys, reuse flight Amadeus credentials.
    const provider = keys.hotelProvider || "mock";
    const clientId = keys.hotelApiKey || (provider === "amadeus" ? keys.flightApiKey : undefined);
    const clientSecret = keys.hotelApiSecret || (provider === "amadeus" ? keys.flightApiSecret : undefined);

    if (provider === "amadeus" && clientId && clientSecret) {
      const hotels = await searchAmadeusHotels({
        clientId,
        clientSecret,
        city,
        checkIn,
        checkOut,
        max: count,
      });
      res.json({ hotels, provider: "amadeus", source: "live" });
      return;
    }

    if (provider !== "mock" && (!clientId || !clientSecret)) {
      res.status(400).json({
        error: `Hotel provider "${provider}" needs API key + secret in Settings → API Keys.`,
        provider,
      });
      return;
    }

    if (provider !== "mock" && provider !== "amadeus") {
      res.status(400).json({
        error: `Hotel provider "${provider}" is not enabled yet. Choose Amadeus (or Mock) in Settings.`,
        provider,
      });
      return;
    }

    res.json({ hotels: generateHotels(city, count), provider: "mock", source: "demo" });
  } catch (e) {
    logger.error(e);
    res.status(502).json({
      error: e instanceof Error ? e.message : "Hotel search failed",
      provider: "amadeus",
    });
  }
});

app.get("/api/dashboard", requireAuth, async (req: AuthRequest, res) => {
  try {
    const scope = agencyScope(req);
    const isSuperAdmin = req.auth?.role === "super_admin";
    const [bookings, agencies, customers, leads, payments] = await Promise.all([
      db.booking.count({ where: scope }),
      isSuperAdmin ? db.agency.count({ where: { status: "Active" } }) : Promise.resolve(1),
      db.customer.count({ where: scope }),
      db.lead.count({ where: scope }),
      db.payment.count({ where: { ...scope, status: "Success" } }),
    ]);

    const destinationWhere: Prisma.DestinationWhereInput = {
      ...scope,
      deletedAt: null,
    };
    const destinations = await db.destination.findMany({
      where: destinationWhere,
      select: {
        id: true,
        name: true,
        country: true,
        thumbnail: true,
        heroImage: true,
        _count: { select: { hotelProducts: true, activityProducts: true, transferProducts: true } },
      },
    });
    const destinationInsights = destinations
      .map((d) => ({
        id: d.id,
        name: d.name,
        country: d.country,
        thumbnail: d.thumbnail || d.heroImage,
        hotelCount: d._count.hotelProducts,
        activityCount: d._count.activityProducts,
        transferCount: d._count.transferProducts,
        productCount: d._count.hotelProducts + d._count.activityProducts + d._count.transferProducts,
      }))
      .sort((a, b) => b.productCount - a.productCount);

    const packageWhere: Prisma.TravelPackageWhereInput = { ...scope, deletedAt: null };
    const [packageCount, featuredPackages, topPackages] = await Promise.all([
      db.travelPackage.count({ where: packageWhere }),
      db.travelPackage.findMany({
        where: { ...packageWhere, isFeatured: true, status: "Published" },
        take: 6,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, packageName: true, packageCode: true, heroImage: true,
          finalPrice: true, currency: true, durationDays: true, durationNights: true,
          destination: { select: { name: true } },
        },
      }),
      db.travelPackage.findMany({
        where: { ...packageWhere, status: "Published" },
        take: 6,
        orderBy: { finalPrice: "desc" },
        select: {
          id: true, packageName: true, packageCode: true, heroImage: true,
          finalPrice: true, currency: true, durationDays: true,
          destination: { select: { name: true } },
          _count: { select: { hotels: true, activities: true, transfers: true } },
        },
      }),
    ]);

    res.json({
      stats: { bookings, agencies, customers, leads, payments, packages: packageCount },
      destinationInsights: {
        topDestinations: destinationInsights.slice(0, 6),
        productsPerDestination: destinationInsights,
      },
      packageInsights: {
        totalPackages: packageCount,
        featuredPackages,
        topSellingPackages: topPackages.map((p) => ({
          ...p,
          componentCount: p._count.hotels + p._count.activities + p._count.transfers,
        })),
      },
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/notifications", requireAuth, async (req: AuthRequest, res) => {
  try {
    const notifications = await db.notification.findMany({ where: agencyScope(req), orderBy: { createdAt: "desc" }, take: 50 });
    res.json({ notifications });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/notifications/read-all", requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await db.notification.updateMany({
      where: { ...agencyScope(req), read: false },
      data: { read: true },
    });
    res.json({ updated: result.count });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/notifications/:id/read", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.notification.findFirst({
      where: { id, ...agencyScope(req) },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const notification = await db.notification.update({
      where: { id: existing.id },
      data: { read: true },
    });
    res.json({ notification });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/wallet", requireAuth, requirePermission("wallet"), async (req: AuthRequest, res) => {
  try {
    const agencyId = req.query.agencyId as string | undefined;
    if (!agencyId) {
      res.status(400).json({ error: "agencyId required" });
      return;
    }
    if (req.auth?.role !== "super_admin" && agencyId !== req.auth?.agencyId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const agency = await db.agency.findUnique({ where: { id: agencyId } });
    const txns = await db.walletTransaction.findMany({
      where: { agencyId },
      orderBy: { date: "desc" },
      take: 50,
    });
    res.json({ balance: agency?.walletBalance ?? 0, transactions: txns });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/wallet", requireAuth, requirePermission("wallet"), validate(walletSchema), async (req: AuthRequest, res) => {
  try {
    const { agencyId, type, amount, source, description, orderId, paymentId, signature, demo } = req.body;
    const id = req.auth?.role === "super_admin" ? (agencyId || req.auth?.agencyId) : req.auth?.agencyId;
    if (!id || !type || !amount) {
      res.status(400).json({ error: "agencyId, type, and amount required" });
      return;
    }
    if (req.auth?.role !== "super_admin" && id !== req.auth?.agencyId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    let paymentRef: string | undefined;
    if (type === "Credit") {
      const keys = await razorpayKeysForAgency(id);
      if (keys) {
        if (!orderId || !paymentId || !signature) {
          res.status(400).json({ error: "Verified Razorpay payment required for wallet credit" });
          return;
        }
        const check = await assertRazorpayPayment({
          orderId: String(orderId),
          paymentId: String(paymentId),
          signature: String(signature),
          amountRupees: Number(amount),
          keyId: keys.keyId,
          keySecret: keys.keySecret,
        });
        if (!check.ok) {
          res.status(400).json({ error: check.error });
          return;
        }
        const reused = await db.walletTransaction.findUnique({ where: { paymentRef: String(paymentId) } });
        if (reused) {
          res.status(409).json({ error: "Payment already credited" });
          return;
        }
        paymentRef = String(paymentId);
      } else if (allowDemoPayments() && demo === true) {
        paymentRef = `demo_${id}_${Date.now()}_${Math.round(amount)}`;
      } else {
        res.status(403).json({
          error: "Wallet credit requires a verified Razorpay payment (or demo mode with ALLOW_DEMO_PAYMENTS)",
        });
        return;
      }
    }

    const agency = await db.agency.findUnique({ where: { id } });
    if (!agency) {
      res.status(404).json({ error: "Agency not found" });
      return;
    }
    const delta = type === "Credit" ? amount : -amount;
    const balance = agency.walletBalance + delta;
    if (balance < 0) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    await db.agency.update({ where: { id }, data: { walletBalance: balance } });
    const txn = await db.walletTransaction.create({
      data: {
        agencyId: id,
        type,
        source: source || (type === "Credit" ? "Top-up" : "Transfer"),
        amount,
        balance,
        description: description || `${type} transaction`,
        paymentRef,
      },
    });
    res.status(201).json({ balance, transaction: txn });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});


// ── PATCH /api/quotations/:id ────────────────────────────────────────────────
app.patch("/api/quotations/:id", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.quotation.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req, "createdById") },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { status, validTill } = req.body;
    const data: Record<string, string> = {};
    if (status) data.status = status;
    if (validTill) data.validTill = validTill;
    const quotation = await db.quotation.update({ where: { id: existing.id }, data });
    res.json({ quotation });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/customers/:id ─────────────────────────────────────────────────
app.patch("/api/customers/:id", requireAuth, requirePermission("customers"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.customer.findFirst({ where: { id, ...agencyScope(req) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { name, email, phone, type, tier, passportNo, visaStatus, city } = req.body;
    const data: Record<string, string | undefined> = {};
    if (name) data.name = name;
    if (email) data.email = email;
    if (phone) data.phone = phone;
    if (type) data.type = type;
    if (tier) data.tier = tier;
    if (passportNo !== undefined) data.passportNo = passportNo;
    if (visaStatus !== undefined) data.visaStatus = visaStatus;
    if (city !== undefined) data.city = city;
    const customer = await db.customer.update({ where: { id: existing.id }, data });
    res.json({ customer });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/customers/:id ─────────────────────────────────────────────────
app.delete("/api/customers/:id", requireAuth, requirePermission("customers"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.customer.findFirst({ where: { id, ...agencyScope(req) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db.customer.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/bookings/:id  (soft-cancel) ───────────────────────────────────
app.delete("/api/bookings/:id", requireAuth, requirePermission("bookings"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.booking.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req, "agentId") },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const booking = await db.booking.update({
      where: { id: existing.id },
      data: { status: "Cancelled" },
    });
    res.json({ booking });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────
app.delete("/api/tasks/:id", requireAuth, requirePermission("tasks"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.task.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req, "assignedToId") },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db.task.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/employees/:id ──────────────────────────────────────────────────
app.patch("/api/employees/:id", requireAuth, requireRole("super_admin", "agency_admin", "branch_manager"), validate(employeeUpdateSchema), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.employee.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req) },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { name, email, phone, designation, department, branch, branchId, role, status, salary, target, permissions } = req.body;
    // branch managers may only manage employees within their own branch, and can't grant custom permissions
    const isBranchManager = req.auth?.role === "branch_manager";
    const data: Record<string, string | number | object | null | undefined> = {};
    if (name) data.name = name;
    if (email) data.email = email;
    if (phone) data.phone = phone;
    if (designation) data.designation = designation;
    if (department) data.department = department;
    if (role && !isBranchManager) data.role = role;
    if (status) data.status = status;
    if (salary !== undefined) data.salary = salary;
    if (target !== undefined) data.target = target;
    if (branchId !== undefined && !isBranchManager) {
      data.branchId = branchId || null;
      const branchRecord = branchId ? await db.branch.findUnique({ where: { id: branchId } }) : null;
      data.branch = branchRecord?.name ?? branch ?? "";
    } else if (branch !== undefined) {
      data.branch = branch;
    }
    const employee = await db.employee.update({ where: { id: existing.id }, data });
    if (permissions !== undefined && !isBranchManager) {
      await db.employee.update({ where: { id: employee.id }, data: { permissions: permissions ?? null } }).catch(() => undefined);
      await db.user.updateMany({ where: { email: employee.email }, data: { permissions: permissions ?? null } }).catch(() => undefined);
    }
    res.json({ employee });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/branches ────────────────────────────────────────────────────────
app.post("/api/branches", requireAuth, requireRole("super_admin", "agency_admin"), validate(branchSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const branch = await db.branch.create({
      data: {
        agencyId: body.agencyId || req.auth?.agencyId || "",
        name: body.name,
        manager: body.manager,
        city: body.city,
        revenue: body.revenue || 0,
      },
    });
    res.status(201).json({ branch });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/branches/:id ───────────────────────────────────────────────────
app.patch("/api/branches/:id", requireAuth, requireRole("super_admin", "agency_admin"), validate(branchUpdateSchema), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.branch.findFirst({ where: { id, ...agencyScope(req) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { name, manager, city, revenue } = req.body;
    const data: Record<string, string | number | undefined> = {};
    if (name) data.name = name;
    if (manager) data.manager = manager;
    if (city) data.city = city;
    if (revenue !== undefined) data.revenue = revenue;
    const branch = await db.branch.update({ where: { id: existing.id }, data });
    res.json({ branch });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/agencies ────────────────────────────────────────────────────────
app.post("/api/agencies", requireAuth, requireRole("super_admin"), validate(agencySchema), async (req, res) => {
  try {
    const body = req.body;
    const agency = await db.agency.create({
      data: {
        name: body.name,
        owner: body.owner,
        email: body.email,
        phone: body.phone,
        plan: body.plan || "Starter",
        status: body.status || "Trial",
        walletBalance: body.walletBalance || 0,
        apiAllocation: body.apiAllocation || { flights: 5000, hotels: 3000 },
        gstNumber: body.gstNumber,
        panNumber: body.panNumber,
        address: body.address,
      },
    });

    let tempPassword: string | undefined;
    let emailedCredentials = false;
    try {
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await db.user.create({
        data: {
          name: body.owner,
          email: body.email,
          phone: body.phone,
          password: passwordHash,
          role: "agency_admin",
          designation: "Agency Owner",
          agencyId: agency.id,
        },
      });
      emailedCredentials = await sendEmail({
        to: body.email,
        subject: "Your Trevio agency admin login",
        template: "temp_credentials",
        data: { agentName: body.owner, loginEmail: body.email, tempPassword },
        agencyId: agency.id,
      });
    } catch {
      tempPassword = undefined;
      emailedCredentials = false;
    }

    res.status(201).json({
      agency,
      tempPassword: allowInsecureTempPasswordResponse() ? tempPassword : undefined,
      emailedCredentials,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/agencies/:id ───────────────────────────────────────────────────
app.patch("/api/agencies/:id", requireAuth, requireRole("super_admin"), validate(agencyUpdateSchema), async (req, res) => {
  try {
    const { name, owner, email, phone, plan, status, walletBalance, apiAllocation, gstNumber, panNumber, address } = req.body;
    const data: Record<string, string | number | object | undefined> = {};
    if (name) data.name = name;
    if (owner) data.owner = owner;
    if (email) data.email = email;
    if (phone) data.phone = phone;
    if (plan) data.plan = plan;
    if (status) data.status = status;
    if (walletBalance !== undefined) data.walletBalance = walletBalance;
    if (apiAllocation) data.apiAllocation = apiAllocation;
    if (gstNumber !== undefined) data.gstNumber = gstNumber;
    if (panNumber !== undefined) data.panNumber = panNumber;
    if (address !== undefined) data.address = address;
    const agency = await db.agency.update({ where: { id: req.params.id as string }, data });
    res.json({ agency });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/commission ───────────────────────────────────────────────────────
app.get("/api/commission", requireAuth, requirePermission("commission"), async (req: AuthRequest, res) => {
  try {
    const bookings = await db.booking.findMany({
      where: { ...agencyScope(req), ...branchScope(req, "agentId") },
      select: { agencyId: true, agencyName: true, agentName: true, commission: true, amount: true, status: true, createdAt: true },
    });

    const confirmedBookings = bookings.filter((b) => !["Cancelled", "Failed"].includes(b.status));

    // Per-agency commission
    const agencyMap: Record<string, { agency: string; bookings: number; revenue: number; commission: number }> = {};
    for (const b of confirmedBookings) {
      const key = b.agencyId || "unknown";
      if (!agencyMap[key]) agencyMap[key] = { agency: b.agencyName, bookings: 0, revenue: 0, commission: 0 };
      agencyMap[key].bookings += 1;
      agencyMap[key].revenue += b.amount;
      agencyMap[key].commission += b.commission;
    }

    // Per-agent top earners
    const agentMap: Record<string, { agent: string; bookings: number; commission: number }> = {};
    for (const b of confirmedBookings) {
      const key = b.agentName;
      if (!agentMap[key]) agentMap[key] = { agent: key, bookings: 0, commission: 0 };
      agentMap[key].bookings += 1;
      agentMap[key].commission += b.commission;
    }
    const topAgents = Object.values(agentMap)
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 10);

    // Monthly breakdown (last 6 months)
    const monthlyMap: Record<string, { month: string; bookings: number; commission: number }> = {};
    for (const b of confirmedBookings) {
      const m = b.createdAt.toISOString().slice(0, 7); // "YYYY-MM"
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, bookings: 0, commission: 0 };
      monthlyMap[m].bookings += 1;
      monthlyMap[m].commission += b.commission;
    }
    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

    const totalCommission = confirmedBookings.reduce((s, b) => s + b.commission, 0);
    const totalRevenue = confirmedBookings.reduce((s, b) => s + b.amount, 0);
    const pendingCommission = 0;
    const paidCommission = totalCommission;

    res.json({
      summary: { totalCommission, paidCommission, pendingCommission, totalRevenue, totalBookings: confirmedBookings.length },
      byAgency: Object.values(agencyMap),
      topAgents,
      monthly,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/finance ──────────────────────────────────────────────────────────
app.get("/api/finance", requireAuth, requirePermission("finance"), async (req: AuthRequest, res) => {
  try {
    const bookingScope = { ...agencyScope(req), ...branchScope(req, "agentId") };
    const paymentScope = { ...agencyScope(req), ...branchScope(req, "collectedById") };
    const [bookings, payments] = await Promise.all([
      db.booking.findMany({
        where: bookingScope,
        select: { amount: true, commission: true, status: true, service: true, createdAt: true, bookingRef: true, customerName: true, agencyName: true },
      }),
      db.payment.findMany({
        where: paymentScope,
        select: { amount: true, method: true, status: true, type: true, date: true, txnId: true, customerName: true, bookingRef: true },
      }),
    ]);

    const confirmedBookings = bookings.filter((b) => !["Cancelled", "Failed"].includes(b.status));
    const successPayments = payments.filter((p) => p.status === "Success");

    const totalRevenue = confirmedBookings.reduce((s, b) => s + b.amount, 0);
    const totalCommission = confirmedBookings.reduce((s, b) => s + b.commission, 0);
    const totalGst = 0;
    const netRevenue = totalRevenue;
    const totalExpenses = 0;
    const netProfit = netRevenue;

    // Monthly P&L (last 6 months) — revenue only until a GST/expense ledger exists
    const monthlyMap: Record<string, { month: string; revenue: number; gst: number; expenses: number; profit: number }> = {};
    for (const b of confirmedBookings) {
      const m = b.createdAt.toISOString().slice(0, 7);
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, revenue: 0, gst: 0, expenses: 0, profit: 0 };
      monthlyMap[m].revenue += b.amount;
      monthlyMap[m].profit += b.amount;
    }
    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

    // By service revenue
    const serviceMap: Record<string, number> = {};
    for (const b of confirmedBookings) {
      serviceMap[b.service] = (serviceMap[b.service] || 0) + b.amount;
    }
    const byService = Object.entries(serviceMap).map(([service, revenue]) => ({ service, revenue }));

    // Latest invoices (top 20 bookings as invoices)
    const invoices = confirmedBookings
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map((b) => ({
        ref: b.bookingRef,
        customer: b.customerName,
        agency: b.agencyName,
        service: b.service,
        amount: b.amount,
        gst: 0,
        total: b.amount,
        date: b.createdAt.toISOString().slice(0, 10),
      }));

    res.json({
      summary: { totalRevenue, totalGst, netRevenue, totalCommission, totalExpenses, netProfit },
      monthly,
      byService,
      invoices,
      paymentMethods: successPayments.reduce((acc: Record<string, number>, p) => {
        acc[p.method] = (acc[p.method] || 0) + p.amount;
        return acc;
      }, {}),
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/analytics/platform ───────────────────────────────────────────────
app.get("/api/analytics/platform", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const range = req.query.range === "yearly" ? "yearly" : "monthly";
    const [bookings, agencies, totalUsers] = await Promise.all([
      db.booking.findMany({
        select: { agencyId: true, agencyName: true, amount: true, commission: true, status: true, createdAt: true },
      }),
      db.agency.findMany({ select: { id: true, status: true } }),
      db.user.count(),
    ]);

    const confirmedBookings = bookings.filter((b) => !["Cancelled", "Failed"].includes(b.status));

    const bucketKey = (d: Date) => (range === "yearly" ? String(d.getFullYear()) : d.toISOString().slice(0, 7));
    const trendMap: Record<string, { period: string; revenue: number; commission: number; bookings: number }> = {};
    for (const b of confirmedBookings) {
      const key = bucketKey(b.createdAt);
      if (!trendMap[key]) trendMap[key] = { period: key, revenue: 0, commission: 0, bookings: 0 };
      trendMap[key].revenue += b.amount;
      trendMap[key].commission += b.commission;
      trendMap[key].bookings += 1;
    }
    const trendLimit = range === "yearly" ? 5 : 12;
    const trend = Object.values(trendMap).sort((a, b) => a.period.localeCompare(b.period)).slice(-trendLimit);

    const agencyMap: Record<string, { agency: string; bookings: number; revenue: number; commission: number }> = {};
    for (const b of confirmedBookings) {
      const key = b.agencyId || "unknown";
      if (!agencyMap[key]) agencyMap[key] = { agency: b.agencyName, bookings: 0, revenue: 0, commission: 0 };
      agencyMap[key].bookings += 1;
      agencyMap[key].revenue += b.amount;
      agencyMap[key].commission += b.commission;
    }
    const byAgency = Object.values(agencyMap).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = confirmedBookings.reduce((s, b) => s + b.amount, 0);
    const totalCommission = confirmedBookings.reduce((s, b) => s + b.commission, 0);

    res.json({
      summary: {
        totalRevenue,
        totalCommission,
        totalBookings: confirmedBookings.length,
        activeAgencies: agencies.filter((a) => a.status === "Active").length,
        totalUsers,
      },
      trend,
      byAgency,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/analytics/employees ──────────────────────────────────────────────
app.get("/api/analytics/employees", requireAuth, requireRole("super_admin", "agency_admin", "branch_manager"), async (req: AuthRequest, res) => {
  try {
    const range = req.query.range === "yearly" ? "yearly" : "monthly";
    const employeeScope = { ...agencyScope(req), ...branchScope(req) };
    const [employees, bookings] = await Promise.all([
      db.employee.findMany({ where: employeeScope, orderBy: { createdAt: "desc" } }),
      db.booking.findMany({
        where: { ...agencyScope(req), ...branchScope(req, "agentId") },
        select: { agentName: true, amount: true, commission: true, status: true, createdAt: true },
      }),
    ]);

    const confirmedBookings = bookings.filter((b) => !["Cancelled", "Failed"].includes(b.status));
    const bucketKey = (d: Date) => (range === "yearly" ? String(d.getFullYear()) : d.toISOString().slice(0, 7));
    const trendLimit = range === "yearly" ? 5 : 12;

    const performance = employees.map((e) => {
      const own = confirmedBookings.filter((b) => b.agentName === e.name);
      const revenue = own.reduce((s, b) => s + b.amount, 0);
      const commission = own.reduce((s, b) => s + b.commission, 0);

      const trendMap: Record<string, { period: string; revenue: number; commission: number; bookings: number }> = {};
      for (const b of own) {
        const key = bucketKey(b.createdAt);
        if (!trendMap[key]) trendMap[key] = { period: key, revenue: 0, commission: 0, bookings: 0 };
        trendMap[key].revenue += b.amount;
        trendMap[key].commission += b.commission;
        trendMap[key].bookings += 1;
      }
      const trend = Object.values(trendMap).sort((a, b) => a.period.localeCompare(b.period)).slice(-trendLimit);

      return {
        id: e.id,
        name: e.name,
        designation: e.designation,
        department: e.department,
        branch: e.branch,
        status: e.status,
        target: e.target,
        achieved: commission || e.achieved,
        attendance: e.attendance,
        bookings: own.length,
        revenue,
        commission,
        trend,
      };
    });

    const topPerformers = [...performance].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    res.json({
      employees: performance,
      topPerformers,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// --- Phase 2 Endpoints ---

app.get("/api/marketing/campaigns", requireAuth, requirePermission("marketing"), async (req: AuthRequest, res) => {
  try {
    const campaigns = await db.marketingCampaign.findMany({
      where: agencyScope(req),
      orderBy: { createdAt: "desc" },
    });
    res.json({ campaigns });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/marketing/campaigns", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = ownAgencyId(req, req.body?.agencyId);
    if (!agencyId) {
      res.status(400).json({ error: "Agency context required" });
      return;
    }
    const { name, type, status, audience } = req.body ?? {};
    if (!name || !type || !audience) {
      res.status(400).json({ error: "name, type, and audience are required" });
      return;
    }
    const campaign = await db.marketingCampaign.create({
      data: {
        agencyId,
        name: String(name),
        type: String(type),
        status: status ? String(status) : "Draft",
        audience: String(audience),
      },
    });
    res.status(201).json(campaign);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

function serializeCoupon(coupon: {
  id: string;
  agencyId: string;
  code: string;
  type: string;
  value: number;
  minOrderAmount: number;
  usageLimit: number;
  usedCount: number;
  maxDiscount: number | null;
  validFrom: Date;
  validTill: Date;
  status: string;
  description: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const status = effectiveCouponStatus(coupon);
  return {
    ...coupon,
    status,
    validFrom: coupon.validFrom.toISOString().slice(0, 10),
    validTill: coupon.validTill.toISOString().slice(0, 10),
    limit: coupon.usageLimit,
    used: coupon.usedCount,
  };
}

async function resolveCouponAgencyId(req: AuthRequest, requested?: string): Promise<string | undefined> {
  const fromAuth = ownAgencyId(req, requested);
  if (fromAuth) return fromAuth;
  if (req.auth?.role === "super_admin") {
    const first = await db.agency.findFirst({ where: { status: "Active" }, orderBy: { createdAt: "asc" } });
    return first?.id;
  }
  return undefined;
}

app.get("/api/marketing/coupons", requireAuth, requirePermission("marketing"), async (req: AuthRequest, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim().toUpperCase() : "";
    const coupons = await db.coupon.findMany({
      where: {
        ...agencyScope(req),
        ...(status && status !== "All" ? { status } : {}),
        ...(q ? { code: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    // Auto-mark expired in response (and lazily persist expired status)
    const now = new Date();
    const payload = [];
    for (const c of coupons) {
      const effective = effectiveCouponStatus(c, now);
      if (effective === "Expired" && c.status === "Active") {
        await db.coupon.update({ where: { id: c.id }, data: { status: "Expired" } }).catch(() => undefined);
      }
      payload.push(serializeCoupon({ ...c, status: effective }));
    }
    res.json({ coupons: payload });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/marketing/coupons", requireAuth, requireRole("super_admin", "agency_admin"), validate(couponCreateSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const agencyId = await resolveCouponAgencyId(req, body.agencyId);
    if (!agencyId) {
      res.status(400).json({ error: "Agency context required" });
      return;
    }
    if (body.type === "Percent" && body.value > 100) {
      res.status(400).json({ error: "Percent coupons cannot exceed 100%" });
      return;
    }
    const code = String(body.code).trim().toUpperCase();
    const validTill = new Date(body.validTill);
    if (Number.isNaN(validTill.getTime())) {
      res.status(400).json({ error: "validTill must be a valid date" });
      return;
    }
    const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
    if (Number.isNaN(validFrom.getTime())) {
      res.status(400).json({ error: "validFrom must be a valid date" });
      return;
    }
    if (validTill < validFrom) {
      res.status(400).json({ error: "validTill must be on or after validFrom" });
      return;
    }
    const existing = await db.coupon.findUnique({ where: { agencyId_code: { agencyId, code } } });
    if (existing) {
      res.status(409).json({ error: "A coupon with this code already exists for the agency" });
      return;
    }
    const coupon = await db.coupon.create({
      data: {
        agencyId,
        code,
        type: body.type,
        value: body.value,
        minOrderAmount: body.minOrderAmount ?? 0,
        usageLimit: body.usageLimit ?? 0,
        maxDiscount: body.maxDiscount ?? null,
        validFrom,
        validTill,
        status: body.status ?? "Active",
        description: body.description ?? null,
        createdById: req.auth?.userId,
      },
    });
    res.status(201).json({ coupon: serializeCoupon(coupon) });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/marketing/coupons/:id", requireAuth, requireRole("super_admin", "agency_admin"), validate(couponUpdateSchema), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.coupon.findFirst({
      where: { id, ...agencyScope(req) },
    });
    if (!existing) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }
    const body = req.body;
    if (body.type === "Percent" && body.value != null && body.value > 100) {
      res.status(400).json({ error: "Percent coupons cannot exceed 100%" });
      return;
    }
    const data: Record<string, unknown> = {};
    if (body.code != null) data.code = String(body.code).trim().toUpperCase();
    if (body.type != null) data.type = body.type;
    if (body.value != null) data.value = body.value;
    if (body.minOrderAmount != null) data.minOrderAmount = body.minOrderAmount;
    if (body.usageLimit != null) data.usageLimit = body.usageLimit;
    if (body.maxDiscount !== undefined) data.maxDiscount = body.maxDiscount;
    if (body.status != null) data.status = body.status;
    if (body.description !== undefined) data.description = body.description;
    if (body.validFrom) {
      const d = new Date(body.validFrom);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "validFrom must be a valid date" });
        return;
      }
      data.validFrom = d;
    }
    if (body.validTill) {
      const d = new Date(body.validTill);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "validTill must be a valid date" });
        return;
      }
      data.validTill = d;
    }
    if (data.code && data.code !== existing.code) {
      const clash = await db.coupon.findUnique({
        where: { agencyId_code: { agencyId: existing.agencyId, code: data.code as string } },
      });
      if (clash) {
        res.status(409).json({ error: "A coupon with this code already exists for the agency" });
        return;
      }
    }
    const coupon = await db.coupon.update({ where: { id: existing.id }, data });
    res.json({ coupon: serializeCoupon(coupon) });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/marketing/coupons/:id", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.coupon.findFirst({
      where: { id, ...agencyScope(req) },
    });
    if (!existing) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }
    await db.coupon.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/marketing/coupons/validate", requireAuth, requireAnyPermission("marketing", "quotations"), validate(couponValidateSchema), async (req: AuthRequest, res) => {
  try {
    const code = String(req.body.code).trim().toUpperCase();
    const orderAmount = Number(req.body.orderAmount);
    const agencyId = await resolveCouponAgencyId(req, req.body.agencyId);
    if (!agencyId) {
      res.status(400).json({ error: "Agency context required" });
      return;
    }
    const coupon = await db.coupon.findUnique({
      where: { agencyId_code: { agencyId, code } },
    });
    const check = validateCouponForOrder(coupon, orderAmount);
    if (!check.ok) {
      res.status(400).json({ valid: false, error: check.message, code: check.error });
      return;
    }
    res.json({
      valid: true,
      discountAmount: check.discountAmount,
      coupon: serializeCoupon(coupon!),
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/cms/pages", requireAuth, requirePermission("cms"), async (req: AuthRequest, res) => {
  try {
    const pages = await db.contentPage.findMany({
      where: agencyScope(req),
      orderBy: { createdAt: "desc" },
    });
    res.json({ pages });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/cms/pages", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = ownAgencyId(req, req.body?.agencyId);
    if (!agencyId) {
      res.status(400).json({ error: "Agency context required" });
      return;
    }
    const { title, slug, content, status, author } = req.body ?? {};
    if (!title || !slug || !content) {
      res.status(400).json({ error: "title, slug, and content are required" });
      return;
    }
    const page = await db.contentPage.create({
      data: {
        agencyId,
        title: String(title),
        slug: String(slug),
        content: String(content),
        status: status ? String(status) : "Draft",
        author: author ? String(author) : (req.auth?.email ?? "Unknown"),
      },
    });
    res.status(201).json(page);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/management/keys", requireAuth, requirePermission("api-management"), async (req: AuthRequest, res) => {
  try {
    const keys = await db.apiKey.findMany({
      where: agencyScope(req),
      orderBy: { createdAt: "desc" },
    });
    res.json({ keys: keys.map((k) => ({ ...k, key: maskSecret(k.key) })) });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/management/keys", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = ownAgencyId(req, req.body?.agencyId);
    if (!agencyId) {
      res.status(400).json({ error: "Agency context required" });
      return;
    }
    const { name, environment, limit } = req.body ?? {};
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const keyValue = `tv_${crypto.randomBytes(24).toString("hex")}`;
    const key = await db.apiKey.create({
      data: {
        agencyId,
        name: String(name),
        key: keyValue,
        environment: environment ? String(environment) : "Test",
        limit: typeof limit === "number" ? limit : 1000,
      },
    });
    res.status(201).json(key);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/support/tickets", requireAuth, requirePermission("support"), async (req: AuthRequest, res) => {
  try {
    const operationsType = req.query.operationsType as string | undefined;
    const deliveryType = req.query.deliveryType as string | undefined;
    const department = req.query.department as string | undefined;
    const status = req.query.status as string | undefined;
    const where: Record<string, unknown> = { ...agencyScope(req) };
    if (operationsType && operationsType !== "All") where.operationsType = operationsType;
    if (deliveryType && deliveryType !== "All") where.deliveryType = deliveryType;
    if (department && department !== "All") where.department = department;
    if (status && status !== "All") where.status = status;
    const tickets = await db.supportTicket.findMany({
      where,
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ tickets });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/support/tickets", requireAuth, requirePermission("support"), async (req: AuthRequest, res) => {
  try {
    const agencyId = ownAgencyId(req);
    if (!agencyId && req.auth?.role !== "super_admin") {
      res.status(400).json({ error: "Agency context required" });
      return;
    }
    const {
      subject,
      description,
      priority = "Medium",
      operationsType = "general_inquiry",
      deliveryType = "remote",
      scheduledAt,
      customerName,
      customerId,
      assignedTo,
    } = req.body ?? {};

    if (!subject || !description || !customerName) {
      res.status(400).json({ error: "subject, description, and customerName are required" });
      return;
    }

    if (!isValidOperationsType(operationsType)) {
      res.status(400).json({ error: "Invalid operations type" });
      return;
    }
    if (!isValidDeliveryType(deliveryType)) {
      res.status(400).json({ error: "Invalid delivery type" });
      return;
    }
    if (deliveryType === "scheduled" && !scheduledAt) {
      res.status(400).json({ error: "scheduledAt is required for scheduled delivery" });
      return;
    }

    const count = await db.supportTicket.count({ where: agencyScope(req) });
    const ticketId = `TK-${String(count + 3401).padStart(4, "0")}`;
    const department = departmentForOperationsType(operationsType);

    const ticket = await db.supportTicket.create({
      data: {
        agencyId: agencyId ?? ownAgencyId(req, req.body?.agencyId) ?? null,
        ticketId,
        subject: String(subject),
        description: String(description),
        priority: String(priority),
        operationsType,
        deliveryType,
        department,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        customerName: String(customerName),
        customerId: customerId || null,
        assignedTo: assignedTo || null,
        status: "Open",
      },
      include: { messages: true },
    });
    res.status(201).json({ ticket });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/support/tickets/:id", requireAuth, requirePermission("support"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.supportTicket.findFirst({ where: { id, ...agencyScope(req) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { status, assignedTo, priority, deliveryType, scheduledAt } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (assignedTo !== undefined) data.assignedTo = assignedTo;
    if (priority) data.priority = priority;
    if (deliveryType) {
      if (!isValidDeliveryType(deliveryType)) {
        res.status(400).json({ error: "Invalid delivery type" });
        return;
      }
      data.deliveryType = deliveryType;
    }
    if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    const ticket = await db.supportTicket.update({
      where: { id: existing.id },
      data,
      include: { messages: true },
    });
    res.json({ ticket });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/settings", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    let settings = await db.settings.findUnique({ where: { agencyId } });
    if (!settings) {
      settings = await db.settings.create({ data: { agencyId } });
    }
    const { apiKeys: _apiKeys, ...safe } = settings;
    res.json(safe);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/settings", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    const body = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (typeof body.theme === "string") data.theme = body.theme;
    if (typeof body.currency === "string") data.currency = body.currency;
    if (typeof body.timezone === "string") data.timezone = body.timezone;
    if (typeof body.notifications === "boolean") data.notifications = body.notifications;
    const settings = await db.settings.upsert({
      where: { agencyId },
      update: data,
      create: { ...data, agencyId },
    });
    const { apiKeys: _apiKeys, ...safe } = settings;
    res.json(safe);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/settings/api-keys", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    const settings = await db.settings.findUnique({ where: { agencyId }, select: { apiKeys: true } });
    const stored = (settings?.apiKeys as DynamicApiKeys | null) ?? {};
    const resolved = await getAgencyApiKeys(agencyId);
    const agency = await db.agency.findUnique({ where: { id: agencyId }, select: { id: true, name: true } });

    res.json({
      agencyId,
      agencyName: agency?.name || "",
      razorpayKeyId: stored.razorpayKeyId || process.env.RAZORPAY_KEY_ID || "",
      razorpayKeySecretMasked: maskSecret(stored.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET),
      hasRazorpaySecret: Boolean(stored.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET),
      razorpayMode: stored.razorpayMode || "Test",
      razorpayLive: Boolean(resolved.razorpayKeyId && resolved.razorpayKeySecret),
      flightProvider: stored.flightProvider || "mock",
      flightApiKey: stored.flightApiKey || "",
      flightApiSecretMasked: maskSecret(stored.flightApiSecret),
      hasFlightSecret: Boolean(stored.flightApiSecret),
      hotelProvider: stored.hotelProvider || "mock",
      hotelApiKey: stored.hotelApiKey || "",
      hotelApiSecretMasked: maskSecret(stored.hotelApiSecret),
      hasHotelSecret: Boolean(stored.hotelApiSecret),
      sendgridApiKeyMasked: maskSecret(stored.sendgridApiKey || process.env.SENDGRID_API_KEY),
      hasSendgridKey: Boolean(stored.sendgridApiKey || process.env.SENDGRID_API_KEY),
      sendgridFromEmail: stored.sendgridFromEmail || process.env.SENDGRID_FROM_EMAIL || "",
      smtpHost: stored.smtpHost || process.env.SMTP_HOST || "",
      smtpPort: stored.smtpPort || process.env.SMTP_PORT || "587",
      smtpUser: stored.smtpUser || process.env.SMTP_USER || "",
      smtpPasswordMasked: maskSecret(stored.smtpPassword || process.env.SMTP_PASSWORD),
      hasSmtpPassword: Boolean(stored.smtpPassword || process.env.SMTP_PASSWORD),
      smtpSecure: stored.smtpSecure || process.env.SMTP_SECURE || "false",
      smtpFrom: stored.smtpFrom || process.env.SMTP_FROM || "",
      emailLive: Boolean(
        (resolved.smtpHost && resolved.smtpUser && resolved.smtpPassword) ||
          resolved.sendgridApiKey,
      ),
      s3Bucket: stored.s3Bucket || process.env.AWS_S3_BUCKET || "",
      s3Region: stored.s3Region || process.env.AWS_REGION || "ap-south-1",
      s3AccessKey: stored.s3AccessKey || process.env.AWS_ACCESS_KEY_ID || "",
      s3SecretKeyMasked: maskSecret(stored.s3SecretKey || process.env.AWS_SECRET_ACCESS_KEY),
      hasS3Secret: Boolean(stored.s3SecretKey || process.env.AWS_SECRET_ACCESS_KEY),
      smsProvider: stored.smsProvider || "none",
      twilioAccountSid: stored.twilioAccountSid || "",
      twilioAuthTokenMasked: maskSecret(stored.twilioAuthToken),
      hasTwilioToken: Boolean(stored.twilioAuthToken),
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/settings/api-keys", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    const body = req.body ?? {};

    const existingSettings = await db.settings.findUnique({ where: { agencyId }, select: { apiKeys: true } });
    const currentKeys = (existingSettings?.apiKeys as Record<string, string> | null) ?? {};

    const updatedKeys: Record<string, string> = { ...currentKeys };
    const fieldsToUpdate = [
      "razorpayKeyId", "razorpayMode", "flightProvider", "flightApiKey",
      "hotelProvider", "hotelApiKey", "sendgridFromEmail", "s3Bucket",
      "s3Region", "s3AccessKey", "smsProvider", "twilioAccountSid",
      "smtpHost", "smtpPort", "smtpUser", "smtpSecure", "smtpFrom",
    ];

    for (const f of fieldsToUpdate) {
      if (body[f] !== undefined) updatedKeys[f] = String(body[f]).trim();
    }

    if (body.razorpayKeySecret && !body.razorpayKeySecret.includes("••••")) {
      updatedKeys.razorpayKeySecret = String(body.razorpayKeySecret).trim();
    }
    if (body.flightApiSecret && !body.flightApiSecret.includes("••••")) {
      updatedKeys.flightApiSecret = String(body.flightApiSecret).trim();
    }
    if (body.hotelApiSecret && !body.hotelApiSecret.includes("••••")) {
      updatedKeys.hotelApiSecret = String(body.hotelApiSecret).trim();
    }
    if (body.sendgridApiKey && !body.sendgridApiKey.includes("••••")) {
      updatedKeys.sendgridApiKey = String(body.sendgridApiKey).trim();
    }
    if (body.smtpPassword && !body.smtpPassword.includes("••••")) {
      updatedKeys.smtpPassword = String(body.smtpPassword).trim();
    }
    if (body.s3SecretKey && !body.s3SecretKey.includes("••••")) {
      updatedKeys.s3SecretKey = String(body.s3SecretKey).trim();
    }
    if (body.twilioAuthToken && !body.twilioAuthToken.includes("••••")) {
      updatedKeys.twilioAuthToken = String(body.twilioAuthToken).trim();
    }

    await db.settings.upsert({
      where: { agencyId },
      update: { apiKeys: updatedKeys },
      create: { agencyId, apiKeys: updatedKeys },
    });

    res.json({ ok: true, agencyId, message: "API Keys & Integrations saved. Razorpay and email use these keys immediately." });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/settings/role-permissions", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    const settings = await db.settings.findUnique({ where: { agencyId } });
    const { ROLE_CRUD, MODULES, ROLE_DEFAULT_PERMISSIONS } = await import("./lib/permissions.js");
    res.json({
      defaults: ROLE_CRUD,
      modules: MODULES,
      roleModules: ROLE_DEFAULT_PERMISSIONS,
      overrides: settings?.rolePermissions ?? null,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/settings/role-permissions", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    const rolePermissions = req.body.rolePermissions ?? req.body;
    const settings = await db.settings.upsert({
      where: { agencyId },
      update: { rolePermissions },
      create: { agencyId, rolePermissions },
    });
    res.json({ rolePermissions: settings.rolePermissions });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/monitoring/metrics", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const dbStart = Date.now();
    let dbHealthy = true;
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      dbHealthy = false;
    }
    const dbLatencyMs = Date.now() - dbStart;
    const mem = process.memoryUsage();
    const uptimeMinutes = process.uptime() / 60;
    const requestsPerMin = uptimeMinutes > 0 ? Math.round(requestCount / uptimeMinutes) : requestCount;
    const errorRate = requestCount > 0 ? ((errorCount / requestCount) * 100).toFixed(2) + "%" : "0.00%";
    res.json({
      uptime: process.uptime(),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      db: { healthy: dbHealthy, latencyMs: dbLatencyMs },
      requestsPerMin,
      totalRequests: requestCount,
      errorRate,
      windowStart: new Date(requestWindowStart).toISOString(),
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Attendance ─────────────────────────────────────────────────────────────
app.post("/api/attendance/check-in", requireAuth, requirePermission("attendance"), validate(attendanceCheckSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.auth!.userId;
    const date = new Date().toISOString().slice(0, 10);
    const attendance = await db.attendance.upsert({
      where: { userId_date: { userId, date } },
      update: { checkIn: new Date(), status: "Present" },
      create: {
        userId, date, checkIn: new Date(), status: "Present",
        agencyId: req.auth?.agencyId ?? undefined,
        branchId: req.auth?.branchId ?? undefined,
      },
    });
    res.status(201).json({ attendance });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/attendance/check-out", requireAuth, requirePermission("attendance"), validate(attendanceCheckSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.auth!.userId;
    const date = new Date().toISOString().slice(0, 10);
    const existing = await db.attendance.findUnique({ where: { userId_date: { userId, date } } });
    if (!existing) {
      res.status(400).json({ error: "Check in before checking out" });
      return;
    }
    const attendance = await db.attendance.update({
      where: { userId_date: { userId, date } },
      data: { checkOut: new Date() },
    });
    res.json({ attendance });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/attendance", requireAuth, requirePermission("attendance"), async (req: AuthRequest, res) => {
  try {
    const isManager = ["super_admin", "agency_admin", "branch_manager"].includes(req.auth?.role ?? "");
    const requestedUserId = req.query.userId as string | undefined;
    const where: Record<string, unknown> = isManager
      ? { ...agencyScope(req), ...branchScope(req), ...(requestedUserId ? { userId: requestedUserId } : {}) }
      : { userId: req.auth!.userId };
    const records = await db.attendance.findMany({
      where,
      include: { user: { select: { email: true, name: true } } },
      orderBy: { date: "desc" },
      take: 200,
    });
    res.json({ attendance: records, total: records.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Leaves ─────────────────────────────────────────────────────────────────
app.post("/api/leaves", requireAuth, requirePermission("leaves"), validate(leaveSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const leave = await db.leave.create({
      data: {
        userId: req.auth!.userId,
        userName: req.auth!.email,
        type: body.type,
        fromDate: body.fromDate,
        toDate: body.toDate,
        reason: body.reason,
        agencyId: req.auth?.agencyId ?? undefined,
        branchId: req.auth?.branchId ?? undefined,
      },
    });
    res.status(201).json({ leave });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/leaves", requireAuth, requirePermission("leaves"), async (req: AuthRequest, res) => {
  try {
    const isManager = ["super_admin", "agency_admin", "branch_manager"].includes(req.auth?.role ?? "");
    const where: Record<string, unknown> = isManager
      ? { ...agencyScope(req), ...branchScope(req) }
      : { userId: req.auth!.userId };
    const leaves = await db.leave.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ leaves, total: leaves.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/leaves/:id", requireAuth, requireRole("super_admin", "agency_admin", "branch_manager"), validate(leaveStatusSchema), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const leave = await db.leave.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req) },
    });
    if (!leave) {
      res.status(404).json({ error: "Leave not found" });
      return;
    }
    const updated = await db.leave.update({
      where: { id: leave.id },
      data: { status: req.body.status, approvedById: req.auth!.userId, approvedByName: req.auth!.email },
    });
    res.json({ leave: updated });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

mountProductRoutes(app, agencyScope);
mountDestinationRoutes(app, agencyScope);
mountPackageRoutes(app, agencyScope);
mountTripPlannerRoutes(app, agencyScope);
mountQuoteTemplateRoutes(app, agencyScope);
mountTravelProposalRoutes(app, agencyScope);
mountProposalPdfRoutes(app, agencyScope);
mountQuotationRoutes(app, agencyScope, ownAgencyId, ownBranchId, branchScope);
mountBmsRoutes(app, agencyScope, ownAgencyId, ownBranchId, branchScope);

// Analytics routes
app.use("/api/analytics", analyticsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export { app, PORT };
