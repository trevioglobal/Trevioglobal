import express from "express";
import crypto from "crypto";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import type { Prisma } from "@prisma/client";
import { validateEnv } from "./lib/env.js";
import { resolveGstState } from "./lib/gst-state.js";
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
import { assertNoProviderSecrets, publicFlightSearchResult } from "./lib/flight-quote.js";
import { effectivePermissions } from "./lib/permissions.js";
import { mountProductRoutes } from "./routes/products.js";
import { mountContractedRateRoutes } from "./routes/contracted-rates.js";
import { mountTaxRuleRoutes } from "./routes/tax-rules.js";
import { mountSupplierRoutes } from "./routes/suppliers.js";
import { mountDestinationRoutes } from "./routes/destinations.js";
import { mountPackageRoutes } from "./routes/packages.js";
import { mountTripPlannerRoutes } from "./routes/trip-planner.js";
import { mountQuoteTemplateRoutes } from "./routes/quote-templates.js";
import { mountTravelProposalRoutes } from "./routes/travel-proposals.js";
import { mountProposalPdfRoutes } from "./routes/proposal-pdf.js";
import { mountBmsRoutes } from "./routes/bms.js";
import { mountQuotationRoutes } from "./routes/quotations.js";
import { mountCustomerQuotationRoutes } from "./routes/customer-quotations.js";
import { mountDocumentRoutes } from "./routes/documents.js";
import { mountAgentRegistrationRoutes } from "./routes/agent-registrations.js";
import { mountFinanceRoutes } from "./routes/finance.js";
import {
  REGISTRATION_STATUS,
  isAuthenticatableUserStatus,
  loginBlockReasonForUserStatus,
} from "./lib/agent-registration.js";
import { sanitizeQuotationForRole, isAgentLike } from "./lib/quotations.js";
import { agentQuoteScope } from "./lib/quote-access.js";
import { agentBookingScope, rejectImmutableBookingPatch } from "./lib/booking-access.js";
import { canOverrideBookingStatus, canTransitionBooking } from "./lib/booking-status.js";
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
  isValidEmail, isValidPhone, isValidGstin,
} from "./lib/validation.js";
import { effectiveCouponStatus, validateCouponForOrder } from "./lib/coupons.js";
import { getAgencyApiKeys, maskSecret, resolveDefaultAgencyId, type DynamicApiKeys } from "./lib/api-key-config.js";
import {
  assertRazorpayPayment,
  handleRazorpayWebhook,
  isRazorpayKeyId,
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

/** Shared catalogue products (agencyId null) + the caller's own agency inventory. */
function catalogAgencyScope(req: AuthRequest): Record<string, unknown> {
  if (req.auth?.role === "super_admin") return {};
  const agencyId = req.auth?.agencyId ?? "__no_agency__";
  return {
    OR: [{ agencyId }, { agencyId: null }],
  };
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
  if (ownField && (role === "employee" || role === "accountant" || role === "travel_agent" || role === "sales_executive")) {
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
    const loginBlock = loginBlockReasonForUserStatus(user.status);
    if (loginBlock || !isAuthenticatableUserStatus(user.status)) {
      res.status(403).json({
        error: loginBlock || "This account is not eligible to sign in.",
        registrationStatus: user.agency?.registrationStatus || null,
        userStatus: user.status,
      });
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
    if (user.agencyId) {
      try {
        const { ensureAgencyCode, ensureUserAgentCode } = await import("./lib/agent-codes.js");
        await ensureAgencyCode(user.agencyId, user.agency?.name);
        await ensureUserAgentCode(user.id, true);
      } catch {
        /* non-fatal */
      }
    }
    const refreshed = await db.user.findUnique({
      where: { id: user.id },
      include: { agency: true, branch: true },
    });
    const { password: _password, ...safeUser } = refreshed || user;
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
    if (user.agencyId) {
      try {
        const { ensureAgencyCode, ensureUserAgentCode } = await import("./lib/agent-codes.js");
        await ensureAgencyCode(user.agencyId, user.agency?.name);
        await ensureUserAgentCode(user.id, true);
      } catch {
        /* non-fatal */
      }
    }
    const refreshed = await db.user.findUnique({
      where: { id: user.id },
      include: { agency: true, branch: true },
    });
    const { password: _password, ...safeUser } = refreshed || user;
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
    const body = req.body as {
      fullName: string;
      companyName: string;
      address: string;
      email: string;
      countryCode: string;
      phone: string;
      country: string;
      countryCodeIso?: string;
      state: string;
      city: string;
      panNumber?: string;
      passportNumber: string;
      password: string;
      gstNumber?: string;
      gstProofId?: string;
      termsVersion?: string;
    };
    const email = String(body.email).trim().toLowerCase();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "This email address is already registered. Please login instead." });
      return;
    }

    const phoneDigits = String(body.phone).replace(/\D/g, "");
    const phone = `${body.countryCode} ${phoneDigits}`.trim();
    const phoneDup = await db.user.findFirst({
      where: {
        OR: [
          { phone },
          { phone: phoneDigits },
          { phone: `${body.countryCode}${phoneDigits}` },
          { phone: `${body.countryCode}-${phoneDigits}` },
        ],
      },
      select: { id: true },
    });
    if (phoneDup) {
      res.status(409).json({ error: "This mobile number is already registered. Please login instead." });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const termsVersion = body.termsVersion || "2026-09-1";
    const proof = body.gstProofId
      ? await db.registrationDocument.findFirst({
          where: { claimToken: body.gstProofId, agencyId: null, expiresAt: { gt: new Date() } },
        })
      : null;
    if (body.gstProofId && !proof) {
      res.status(400).json({ error: "GST / VAT proof was not found. Upload the file again." });
      return;
    }

    const result = await db.$transaction(async (tx) => {
      const agency = await tx.agency.create({
        data: {
          name: body.companyName,
          owner: body.fullName,
          email,
          phone,
          plan: "Starter",
          status: "Trial",
          registrationStatus: REGISTRATION_STATUS.SUBMITTED,
          address: body.address,
          country: body.country,
          state: body.state || resolveGstState(null, body.gstNumber) || undefined,
          city: body.city,
          panNumber: body.panNumber || null,
          passportNumber: body.passportNumber || null,
          gstNumber: body.gstNumber || null,
          vatNumber: body.gstNumber || null,
          gstProofUrl: null,
          gstProofDocumentId: proof?.id || null,
          termsAcceptedAt: new Date(),
          apiAllocation: { flights: 5000, hotels: 3000 },
        },
      });
      if (proof) {
        await tx.registrationDocument.update({ where: { id: proof.id }, data: { agencyId: agency.id } });
      }

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
          status: "Submitted",
        },
        include: { agency: true, branch: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          agencyId: agency.id,
          userName: user.name,
          action: "Agent Registration Submitted",
          module: "Auth",
          ip: req.ip || "0.0.0.0",
          details: `New agency registration submitted: ${agency.name}; country=${body.countryCodeIso || body.country}; terms=${termsVersion}; status=Submitted`,
        },
      });

      return user;
    }, { maxWait: 15_000, timeout: 30_000 });

    void import("./lib/email.js")
      .then(({ sendHtmlEmail }) =>
        sendHtmlEmail(
          email,
          "Your Trevio Global agent registration was submitted",
          `<p>Hi ${escapeHtmlSafe(body.fullName)},</p>
         <p>Your Trevio Global agent registration for <strong>${escapeHtmlSafe(body.companyName)}</strong> has been submitted for admin review.</p>
         <p>You will be able to sign in only after an administrator approves your account.</p>
         <p>Regards,<br/>Trevio Global</p>`,
          { agencyId: result.agencyId },
        ),
      )
      .catch(() => undefined);

    const { password: _password, ...safeUser } = result;
    res.status(201).json({
      ok: true,
      status: REGISTRATION_STATUS.SUBMITTED,
      message: "Registration submitted for admin approval. You cannot sign in until an administrator approves your account.",
      registrationId: result.agencyId,
      user: {
        id: safeUser.id,
        name: safeUser.name,
        email: safeUser.email,
        status: safeUser.status,
        agencyId: safeUser.agencyId,
      },
    });
  } catch (e) {
    logger.error(e);
    const detail = e instanceof Error ? e.message : "Server error";
    res.status(500).json({
      error: "Server error",
      ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
    });
  }
});

function escapeHtmlSafe(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.get("/api/bookings", requireAuth, requireAnyPermission("flights", "hotels", "holiday", "bookings"), async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const service = req.query.service as string | undefined;
    const search = (req.query.q as string | undefined)?.trim();
    const destination = (req.query.destination as string | undefined)?.trim();
    const travelFrom = (req.query.travelFrom as string | undefined)?.trim();
    const travelTo = (req.query.travelTo as string | undefined)?.trim();
    const quoteNo = (req.query.quoteNo as string | undefined)?.trim();
    const assigned = (req.query.assigned as string | undefined)?.trim();
    // Keep agent ownership scope in AND so list filters cannot overwrite OR and leak cross-agent rows.
    const agentScope = agentBookingScope(req.auth?.role, req.auth?.userId);
    const andClauses: Record<string, unknown>[] = [];
    if (Object.keys(agentScope).length > 0) andClauses.push(agentScope);
    const where: Record<string, unknown> = {
      ...agencyScope(req),
      ...branchScope(req, "agentId"),
    };
    if (status && status !== "All") where.status = status;
    if (service && service !== "All") where.service = service;
    if (destination) where.destination = { contains: destination, mode: "insensitive" };
    if (quoteNo) where.quoteNo = { contains: quoteNo, mode: "insensitive" };
    if (assigned) {
      andClauses.push({
        OR: [
          { operationsExecutiveName: { contains: assigned, mode: "insensitive" } },
          { salesExecutiveName: { contains: assigned, mode: "insensitive" } },
          { agentName: { contains: assigned, mode: "insensitive" } },
        ],
      });
    }
    if (travelFrom || travelTo) {
      const travelDate: Record<string, string> = {};
      if (travelFrom) travelDate.gte = travelFrom;
      if (travelTo) travelDate.lte = travelTo;
      where.travelDate = travelDate;
    }
    if (search) {
      andClauses.push({
        OR: [
          { customerName: { contains: search, mode: "insensitive" } },
          { bookingRef: { contains: search, mode: "insensitive" } },
          { quoteNo: { contains: search, mode: "insensitive" } },
          { destination: { contains: search, mode: "insensitive" } },
          { route: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (andClauses.length) where.AND = andClauses;
    const { skip, take, page, pageSize } = parsePagination(req, 100, 200);
    const [bookings, total] = await Promise.all([
      db.booking.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      db.booking.count({ where }),
    ]);
    const role = req.auth?.role;
    const sanitized = bookings.map((b) => {
      if (role !== "travel_agent" && role !== "customer") return b;
      const clone = { ...b } as Record<string, unknown>;
      delete clone.costPrice;
      delete clone.grossProfit;
      delete clone.netProfit;
      delete clone.pricingSnapshot;
      return clone;
    });
    res.json({ bookings: sanitized, total, page, pageSize });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/bookings", requireAuth, requireAnyPermission("flights", "hotels", "holiday", "bookings"), validate(bookingSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    // Never trust client Paid/Confirmed — payment must go through verified payment paths.
    const booking = await db.booking.create({
      data: {
        bookingRef: `BK-${Math.floor(10000 + Math.random() * 90000)}`,
        customerName: body.customerName,
        service: body.service,
        route: body.route,
        travelDate: body.travelDate,
        amount: body.amount,
        commission: body.commission || 0,
        status: "Pending",
        paymentStatus: "Pending",
        paymentMethod: body.paymentMethod || "Razorpay",
        agentId: req.auth?.userId,
        agentName: body.agentName || "System",
        agencyId: ownAgencyId(req, body.agencyId),
        agencyName: body.agencyName || "",
        branchId: ownBranchId(req),
        packageValue: body.amount,
        amountPaid: 0,
        balanceAmount: body.amount,
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
      where: {
        id,
        ...agencyScope(req),
        ...branchScope(req, "agentId"),
        ...agentBookingScope(req.auth?.role, req.auth?.userId),
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const immutable = rejectImmutableBookingPatch(req.body || {});
    if (immutable) {
      res.status(400).json({ error: immutable });
      return;
    }
    const { status, paymentStatus, operationsExecutiveName, operationsExecutiveId } = req.body || {};
    const data: Record<string, unknown> = {};
    if (status) {
      const override = canOverrideBookingStatus(req.auth?.role) && Boolean(req.body?.override);
      if (!canTransitionBooking(existing.status, String(status), override)) {
        res.status(400).json({ error: `Invalid booking transition ${existing.status} → ${status}` });
        return;
      }
      if (existing.status === "Completed" || existing.status === "Cancelled") {
        if (!override) {
          res.status(400).json({ error: `A ${existing.status} booking cannot be changed` });
          return;
        }
      }
      data.status = String(status);
    }
    if (paymentStatus) {
      const role = req.auth?.role || "";
      const canSetPayment = ["super_admin", "agency_admin", "accountant", "management", "branch_manager"].includes(role);
      const cancelRefund = String(status || data.status || "") === "Cancelled" && String(paymentStatus) === "Refunded";
      if (!canSetPayment && !cancelRefund) {
        res.status(403).json({ error: "Only finance/admin roles can change payment status directly" });
        return;
      }
      data.paymentStatus = String(paymentStatus);
    }
    if (typeof operationsExecutiveName === "string") data.operationsExecutiveName = operationsExecutiveName;
    if (typeof operationsExecutiveId === "string") data.operationsExecutiveId = operationsExecutiveId;
    const booking = await db.booking.update({ where: { id: existing.id }, data });
    res.json({ booking: isAgentLike(req.auth?.role) ? (() => {
      const clone = { ...booking } as Record<string, unknown>;
      delete clone.costPrice;
      delete clone.grossProfit;
      delete clone.netProfit;
      delete clone.pricingSnapshot;
      return clone;
    })() : booking });
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
    const agentOnly = req.auth?.role === "travel_agent"
      ? { assignedToId: req.auth.userId }
      : {};
    const leads = await db.lead.findMany({
      where: { ...agencyScope(req), ...branchScope(req, "assignedToId"), ...agentOnly },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ leads, total: leads.length });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/leads", requireAuth, requirePermission("crm"), validate(leadSchema), async (req: AuthRequest, res) => {
  try {
    const body = req.body;
    const isAgent = req.auth?.role === "travel_agent";
    const lead = await db.lead.create({
      data: {
        customerName: body.customerName,
        email: body.email || "",
        phone: body.phone || "",
        source: isAgent ? (body.source || "Referral") : body.source,
        service: body.service,
        value: body.value,
        stage: body.stage || "New",
        assignedTo: isAgent
          ? (req.auth?.email || body.assignedTo || "Agent")
          : (body.assignedTo || "Unassigned"),
        assignedToId: req.auth?.userId,
        expectedClose: body.expectedClose || new Date().toISOString().slice(0, 10),
        notes: body.notes || (isAgent ? "Submitted via Agent Portal" : ""),
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
    const agentOnly = req.auth?.role === "travel_agent"
      ? { assignedToId: req.auth.userId }
      : {};
    const existing = await db.lead.findFirst({
      where: { id, ...agencyScope(req), ...branchScope(req, "assignedToId"), ...agentOnly },
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
      where: {
        deletedAt: null,
        ...agencyScope(req),
        ...branchScope(req, "createdById"),
        ...agentQuoteScope(req.auth?.role, req.auth?.userId),
      },
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
    const { travelDatesBlockReason, todayYmd, defaultValidTill } = await import("./lib/travel-dates.js");
    const dateBlock = travelDatesBlockReason({
      travelDates: body.travelDates,
      travelStartDate: body.travelStartDate,
      travelEndDate: body.travelEndDate,
      returnDate: body.returnDate,
      validTill: body.validTill,
      estimatedBookingDate: body.estimatedBookingDate,
    });
    if (dateBlock) {
      res.status(400).json({ error: dateBlock });
      return;
    }
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
          validTill: body.validTill || defaultValidTill(),
          quoteDate: todayYmd(),
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
      let agentCode: string | undefined;
      if (role === "travel_agent" && agencyId) {
        const { allocateAgentCode, ensureAgencyCode } = await import("./lib/agent-codes.js");
        await ensureAgencyCode(agencyId);
        agentCode = await allocateAgentCode(agencyId);
      }
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
          agentCode: agentCode || null,
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
    const tripTypeRaw = String(req.query.tripType || "one_way").toLowerCase().replace(/-/g, "_");
    const tripType = tripTypeRaw === "round_trip" || tripTypeRaw === "roundtrip"
      ? "round_trip"
      : tripTypeRaw === "multi_city" || tripTypeRaw === "multicity"
        ? "multi_city"
        : "one_way";

    const origin = String(req.query.origin || "").trim();
    const destination = String(req.query.destination || "").trim();
    const count = Math.min(parseInt(String(req.query.count || "8"), 10) || 8, 20);
    const departureDate = (req.query.departureDate as string) || undefined;
    const returnDate = (req.query.returnDate as string) || undefined;
    const adults = Math.max(1, parseInt(String(req.query.adults || "1"), 10) || 1);
    const children = Math.max(0, parseInt(String(req.query.children || "0"), 10) || 0);
    const infants = Math.max(0, parseInt(String(req.query.infants || "0"), 10) || 0);
    const cabinClass = String(req.query.cabinClass || req.query.cabin || "").trim() || undefined;

    let segments: Array<{ origin: string; destination: string; date?: string }> = [];
    if (tripType === "multi_city") {
      try {
        const raw = req.query.segments;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          segments = parsed
            .map((s) => ({
              origin: String((s as { origin?: string }).origin || "").trim(),
              destination: String((s as { destination?: string }).destination || "").trim(),
              date: String((s as { date?: string; departureDate?: string }).date
                || (s as { departureDate?: string }).departureDate || "").trim() || undefined,
            }))
            .filter((s) => s.origin && s.destination);
        }
      } catch {
        segments = [];
      }
      if (!segments.length) {
        res.status(400).json({ error: "multi_city requires segments=[{origin,destination,date},…]" });
        return;
      }
    } else {
      if (!origin || !destination) {
        res.status(400).json({
          error: "origin and destination are required (do not rely on hardcoded airport defaults).",
        });
        return;
      }
      if (tripType === "round_trip" && !returnDate) {
        res.status(400).json({ error: "returnDate is required for round_trip searches." });
        return;
      }
      segments = [{ origin, destination, date: departureDate }];
      if (tripType === "round_trip" && returnDate) {
        segments.push({ origin: destination, destination: origin, date: returnDate });
      }
    }

    const agencyId = req.auth?.agencyId || (await resolveDefaultAgencyId());
    const keys = await getAgencyApiKeys(agencyId);
    const provider = keys.flightProvider || "mock";

    async function runLiveAmadeus(): Promise<ReturnType<typeof searchAmadeusFlights>> {
      if (tripType === "multi_city") {
        const all: Awaited<ReturnType<typeof searchAmadeusFlights>> = [];
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const leg = await searchAmadeusFlights({
            clientId: keys.flightApiKey!,
            clientSecret: keys.flightApiSecret!,
            origin: seg.origin,
            destination: seg.destination,
            departureDate: seg.date,
            adults,
            children,
            infants,
            cabinClass,
            max: Math.max(2, Math.ceil(count / segments.length)),
          });
          for (const f of leg) {
            all.push({
              ...f,
              direction: "segment",
              segmentIndex: i,
              journeyId: f.journeyId || `mc-${i}-${f.id}`,
              id: `mc-${i}-${f.id}`,
            });
          }
        }
        return all;
      }
      return searchAmadeusFlights({
        clientId: keys.flightApiKey!,
        clientSecret: keys.flightApiSecret!,
        origin: segments[0].origin,
        destination: segments[0].destination,
        departureDate: segments[0].date,
        returnDate: tripType === "round_trip" ? returnDate : undefined,
        adults,
        children,
        infants,
        cabinClass,
        max: count,
      });
    }

    function runMock(): ReturnType<typeof generateFlights> {
      if (tripType === "round_trip" && segments.length >= 2) {
        const out = generateFlights(segments[0].origin, segments[0].destination, Math.ceil(count / 2), {
          departureDate: segments[0].date,
          cabinClass,
          direction: "outbound",
          segmentIndex: 0,
          journeyPrefix: "mock-out",
        });
        const ret = generateFlights(segments[1].origin, segments[1].destination, Math.ceil(count / 2), {
          departureDate: segments[1].date,
          cabinClass,
          direction: "return",
          segmentIndex: 1,
          journeyPrefix: "mock-ret",
        });
        // Pair journey ids for first N offers
        const n = Math.min(out.length, ret.length);
        for (let i = 0; i < n; i++) {
          const jid = `mock-rt-${i + 1}`;
          out[i] = { ...out[i], journeyId: jid, id: `${jid}-0` };
          ret[i] = { ...ret[i], journeyId: jid, id: `${jid}-1` };
        }
        return [...out, ...ret];
      }
      if (tripType === "multi_city") {
        const all: ReturnType<typeof generateFlights> = [];
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const leg = generateFlights(seg.origin, seg.destination, Math.max(2, Math.ceil(count / segments.length)), {
            departureDate: seg.date,
            cabinClass,
            direction: "segment",
            segmentIndex: i,
            journeyPrefix: `mock-mc-${i}`,
          });
          all.push(...leg);
        }
        return all;
      }
      return generateFlights(segments[0].origin, segments[0].destination, count, {
        departureDate: segments[0].date,
        cabinClass,
        direction: "outbound",
        segmentIndex: 0,
        journeyPrefix: "mock",
      });
    }

    if (provider === "amadeus" && keys.flightApiKey && keys.flightApiSecret) {
      const flights = await runLiveAmadeus();
      const safe = flights.map((f) =>
        publicFlightSearchResult({ ...f as unknown as Record<string, unknown>, source: "AMADEUS_API" }),
      );
      const body = {
        flights: safe,
        provider: "amadeus" as const,
        source: "live" as const,
        rateSource: "AMADEUS_API" as const,
        tripType,
        adults,
        children,
        infants,
        cabinClass: cabinClass || null,
        demo: false,
      };
      if (!assertNoProviderSecrets(body)) {
        res.status(500).json({ error: "Flight search sanitization failed" });
        return;
      }
      res.json(body);
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

    const safe = runMock().map((f) =>
      publicFlightSearchResult({ ...f as unknown as Record<string, unknown>, source: "MOCK" }),
    );
    const body = {
      flights: safe,
      provider: "mock" as const,
      source: "demo" as const,
      rateSource: "MOCK" as const,
      tripType,
      adults,
      children,
      infants,
      cabinClass: cabinClass || null,
      demo: true,
      message: "Demo flight results (mock provider). Configure Amadeus API keys for live search.",
    };
    if (!assertNoProviderSecrets(body)) {
      res.status(500).json({ error: "Flight search sanitization failed" });
      return;
    }
    res.json(body);
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
    const { resolveDefaultAgencyId } = await import("./lib/api-key-config.js");
    const agencyId =
      (req.query.agencyId as string | undefined) ||
      req.auth?.agencyId ||
      (req.auth?.role === "super_admin" ? await resolveDefaultAgencyId() : null);
    if (!agencyId) {
      res.status(400).json({ error: "No agency context — create an agency first" });
      return;
    }
    if (req.auth?.role !== "super_admin" && agencyId !== req.auth?.agencyId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const agency = await db.agency.findUnique({
      where: { id: agencyId },
      select: { id: true, name: true, walletBalance: true },
    });
    if (!agency) {
      res.status(404).json({ error: "Agency not found" });
      return;
    }
    const txns = await db.walletTransaction.findMany({
      where: { agencyId },
      orderBy: { date: "desc" },
      take: 50,
    });
    res.json({
      balance: agency.walletBalance ?? 0,
      agencyId: agency.id,
      agencyName: agency.name,
      transactions: txns,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/wallet", requireAuth, requirePermission("wallet"), validate(walletSchema), async (req: AuthRequest, res) => {
  try {
    const { resolveDefaultAgencyId } = await import("./lib/api-key-config.js");
    const { agencyId, type, amount, source, description, orderId, paymentId, signature, demo } = req.body;
    const id =
      (req.auth?.role === "super_admin"
        ? agencyId || req.auth?.agencyId || (await resolveDefaultAgencyId())
        : req.auth?.agencyId) || null;
    if (!id || !type || !amount) {
      res.status(400).json({ error: "agencyId, type, and amount required" });
      return;
    }
    if (req.auth?.role !== "super_admin" && id !== req.auth?.agencyId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (type === "Debit") {
      const role = req.auth?.role || "";
      if (!["super_admin", "agency_admin", "accountant", "management", "branch_manager"].includes(role)) {
        res.status(403).json({
          error: "Only finance/admin roles can debit the agency wallet. Use booking payment settlement for trip charges.",
        });
        return;
      }
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
      where: {
        id,
        ...agencyScope(req),
        ...branchScope(req, "agentId"),
        ...agentBookingScope(req.auth?.role, req.auth?.userId),
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!canTransitionBooking(existing.status, "Cancelled")) {
      res.status(400).json({ error: `Cannot cancel booking in status ${existing.status}` });
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

// ── Travel agents & product access ───────────────────────────────────────────
app.get("/api/agents", requireAuth, requireAnyPermission("quotations", "bookings"), async (req: AuthRequest, res) => {
  try {
    const { ensureAgencyCode, ensureUserAgentCode } = await import("./lib/agent-codes.js");
    const scopeAgencyId = req.auth?.agencyId || (req.auth?.role === "super_admin" ? await (await import("./lib/api-key-config.js")).resolveDefaultAgencyId() : null);
    if (scopeAgencyId) await ensureAgencyCode(scopeAgencyId);
    const missing = await db.user.findMany({
      where: {
        role: "travel_agent",
        agentCode: null,
        status: { in: ["Active", "Approved"] },
        ...agencyScope(req),
      },
      select: { id: true },
    });
    for (const m of missing) await ensureUserAgentCode(m.id, true);
    const agents = await db.user.findMany({
      where: {
        role: "travel_agent",
        status: { in: ["Active", "Approved"] },
        ...agencyScope(req),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        agentCode: true,
        productAccess: true,
        createdAt: true,
        agency: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: "asc" },
    });
    const { parseProductAccess } = await import("./lib/booking-invoice.js");
    res.json({
      agents: agents.map((a) => ({
        ...a,
        productAccess: parseProductAccess(a.productAccess, "travel_agent"),
      })),
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/** Staff: assign a registered travel agent to a quotation. */
app.patch("/api/quotations/:id/assign-agent", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res) => {
  try {
    if (req.auth?.role === "travel_agent" || req.auth?.role === "customer") {
      res.status(403).json({ error: "Not allowed to assign agents" });
      return;
    }
    const id = routeParamId(req);
    const existing = await db.quotation.findFirst({
      where: { id, deletedAt: null, ...agencyScope(req), ...branchScope(req, "createdById") },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (["Converted to Booking", "Archived"].includes(existing.status)) {
      res.status(400).json({ error: "Cannot reassign this quotation" });
      return;
    }

    const rawAgentId = req.body?.agentId;
    const clear = rawAgentId === null || rawAgentId === "" || rawAgentId === undefined;
    let agentId: string | null = null;
    let agentName: string | null = null;
    let agentCode: string | null = existing.agentCode;
    let agencyCode: string | null = existing.agencyCode;
    let agencyId = existing.agencyId;

    if (!clear) {
      const agent = await db.user.findFirst({
        where: {
          id: String(rawAgentId),
          role: "travel_agent",
          status: { in: ["Active", "Approved"] },
          ...agencyScope(req),
        },
        select: {
          id: true,
          name: true,
          agentCode: true,
          agencyId: true,
          agency: { select: { code: true, name: true } },
        },
      });
      if (!agent) {
        res.status(400).json({ error: "Registered travel agent not found" });
        return;
      }
      const { ensureUserAgentCode, ensureAgencyCode } = await import("./lib/agent-codes.js");
      agentId = agent.id;
      agentName = agent.name;
      agentCode = (await ensureUserAgentCode(agent.id, true)) || agent.agentCode || null;
      if (agent.agencyId) {
        agencyId = agent.agencyId;
        await ensureAgencyCode(agent.agencyId);
        agencyCode = agent.agency?.code || agencyCode;
      }
    } else {
      agentId = null;
      agentName = null;
    }

    const quotation = await db.quotation.update({
      where: { id: existing.id },
      data: {
        agentId,
        agentName,
        agentCode,
        agencyCode,
        ...(req.auth?.role === "super_admin" && agencyId ? { agencyId } : {}),
      },
      include: { packages: true },
    });
    await db.auditLog.create({
      data: {
        userId: req.auth?.userId,
        agencyId: quotation.agencyId,
        userName: req.auth?.email || "System",
        action: "Quotation Agent Assigned",
        module: "Quotations",
        details: agentName ? `Assigned to ${agentName}` : "Agent cleared",
        ip: req.ip || "0.0.0.0",
      },
    });
    res.json({ quotation });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/** Sales executives selectable on Create Quote Basic Details. */
app.get("/api/sales-executives", requireAuth, requirePermission("quotations"), async (req: AuthRequest, res) => {
  try {
    const salesExecutives = await db.user.findMany({
      where: {
        ...agencyScope(req),
        status: "Active",
        role: { in: ["sales_executive", "product_executive", "agency_admin", "branch_manager", "super_admin", "employee"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    res.json({ salesExecutives });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/agents/:id/product-access", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.user.findFirst({
      where: { id, role: "travel_agent", ...agencyScope(req) },
    });
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const { flights, hotels, packages } = req.body || {};
    const productAccess = {
      flights: Boolean(flights),
      hotels: hotels !== false,
      packages: packages !== false,
    };
    const agent = await db.user.update({
      where: { id: existing.id },
      data: { productAccess },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        productAccess: true,
      },
    });
    res.json({ agent });
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
        registrationStatus: REGISTRATION_STATUS.APPROVED,
        walletBalance: body.walletBalance || 0,
        apiAllocation: body.apiAllocation || { flights: 5000, hotels: 3000 },
        gstNumber: body.gstNumber,
        panNumber: body.panNumber,
        address: body.address,
      },
    });
    try {
      const { ensureAgencyCode } = await import("./lib/agent-codes.js");
      await ensureAgencyCode(agency.id, agency.name);
    } catch {
      /* non-fatal */
    }

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
          status: "Active",
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

    const agencyId = ownAgencyId(req);
    const walletTxns = agencyId
      ? await db.walletTransaction.findMany({
          where: { agencyId, OR: [{ source: "Commission" }, { type: "Credit" }] },
          orderBy: { date: "desc" },
          take: 50,
        })
      : [];
    const commissionCredits = walletTxns
      .filter((t) => String(t.source || "").toLowerCase().includes("commission") || String(t.description || "").toLowerCase().includes("commission"))
      .map((t) => ({
        id: t.id,
        date: (t.date instanceof Date ? t.date : new Date(t.date)).toISOString().slice(0, 10),
        amount: t.amount,
        description: t.description || t.source || "Commission credit",
        status: "Credited",
      }));

    const settings = agencyId
      ? await db.settings.findUnique({ where: { agencyId }, select: { commissionRules: true } })
      : null;

    // Paid = wallet commission credits; pending = booking commission not yet credited
    const paidCommission = commissionCredits.reduce((s, c) => s + c.amount, 0);
    const pendingCommission = Math.max(0, totalCommission - paidCommission);

    res.json({
      summary: { totalCommission, paidCommission, pendingCommission, totalRevenue, totalBookings: confirmedBookings.length },
      byAgency: Object.values(agencyMap),
      topAgents,
      monthly,
      credits: commissionCredits,
      rules: settings?.commissionRules ?? null,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Finance routes mounted below (BookingInvoice + Expense + TDS ledgers)
// ── legacy inline /api/finance removed — see mountFinanceRoutes ──────────────

app.put("/api/commission/rules", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    const rules = Array.isArray(req.body?.rules) ? req.body.rules : req.body;
    await db.settings.upsert({
      where: { agencyId },
      update: { commissionRules: rules as object },
      create: { agencyId, commissionRules: rules as object },
    });
    res.json({ ok: true, rules });
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

app.get("/api/cms/pages", requireAuth, requirePermission("cms"), async (_req: AuthRequest, res) => {
  res.status(410).json({ error: "CMS module removed" });
});

app.post("/api/cms/pages", requireAuth, requireRole("super_admin", "agency_admin"), async (_req: AuthRequest, res) => {
  res.status(410).json({ error: "CMS module removed" });
});

app.get("/api/management/keys", requireAuth, requirePermission("api-management"), async (_req: AuthRequest, res) => {
  res.status(410).json({ error: "API Management module removed" });
});

app.post("/api/management/keys", requireAuth, requireRole("super_admin", "agency_admin"), async (_req: AuthRequest, res) => {
  res.status(410).json({ error: "API Management module removed" });
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

app.post("/api/support/tickets/:id/messages", requireAuth, requirePermission("support"), async (req: AuthRequest, res) => {
  try {
    const id = routeParamId(req);
    const existing = await db.supportTicket.findFirst({
      where: { id, ...agencyScope(req) },
    });
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const message = String(req.body?.message || "").trim();
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const row = await db.ticketMessage.create({
      data: {
        ticketId: existing.id,
        sender: req.auth?.email || req.body?.sender || "Staff",
        message,
        isInternal: Boolean(req.body?.isInternal),
      },
    });
    if (existing.status === "Open") {
      await db.supportTicket.update({ where: { id: existing.id }, data: { status: "In Progress" } });
    }
    res.status(201).json({ message: row });
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
    if (body.security && typeof body.security === "object") data.security = body.security;
    if (body.commissionRules !== undefined) data.commissionRules = body.commissionRules;
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

app.get("/api/settings/company", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    const [agency, branding] = await Promise.all([
      db.agency.findUnique({ where: { id: agencyId } }),
      db.agencyBranding.findUnique({ where: { agencyId } }),
    ]);
    if (!agency) {
      res.status(404).json({ error: "Agency not found" });
      return;
    }
    res.json({
      id: agency.id,
      name: agency.name,
      owner: agency.owner,
      email: agency.email,
      phone: agency.phone,
      address: agency.address || "",
      city: agency.city || "",
      state: agency.state || "",
      country: agency.country || "",
      gstNumber: agency.gstNumber || "",
      panNumber: agency.panNumber || "",
      logo: branding?.logo || agency.logo || "",
      signatureUrl: branding?.signatureUrl || "",
      authorizedSignatory: branding?.authorizedSignatory || agency.owner,
      footerText: branding?.footerText || "",
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/settings/company", requireAuth, requireRole("super_admin", "agency_admin"), async (req: AuthRequest, res) => {
  try {
    const agencyId = await resolveSettingsAgencyId(req, res);
    if (!agencyId) return;
    const body = req.body ?? {};
    const nextGst = typeof body.gstNumber === "string" ? body.gstNumber : undefined;
    const nextState = typeof body.state === "string" ? body.state : undefined;
    if (typeof body.email === "string" && body.email.trim() && !isValidEmail(body.email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }
    if (typeof body.phone === "string" && body.phone.trim() && !isValidPhone(body.phone)) {
      res.status(400).json({ error: "Enter a valid phone number" });
      return;
    }
    if (nextGst !== undefined && !isValidGstin(nextGst)) {
      res.status(400).json({ error: "Enter a valid 15-character GSTIN" });
      return;
    }
    const derivedState = resolveGstState(nextState, nextGst);
    const agency = await db.agency.update({
      where: { id: agencyId },
      data: {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.owner === "string" ? { owner: body.owner } : {}),
        ...(typeof body.email === "string" ? { email: body.email } : {}),
        ...(typeof body.phone === "string" ? { phone: body.phone } : {}),
        ...(typeof body.address === "string" ? { address: body.address } : {}),
        ...(typeof body.city === "string" ? { city: body.city } : {}),
        ...(typeof body.country === "string" ? { country: body.country } : {}),
        ...(nextState !== undefined ? { state: nextState || derivedState || "" } : nextGst !== undefined && derivedState ? { state: derivedState } : {}),
        ...(nextGst !== undefined ? { gstNumber: nextGst } : {}),
        ...(typeof body.panNumber === "string" ? { panNumber: body.panNumber } : {}),
        ...(typeof body.logo === "string" ? { logo: body.logo } : {}),
      },
    });
    await db.agencyBranding.upsert({
      where: { agencyId },
      update: {
        ...(typeof body.logo === "string" ? { logo: body.logo } : {}),
        ...(typeof body.signatureUrl === "string" ? { signatureUrl: body.signatureUrl } : {}),
        ...(typeof body.authorizedSignatory === "string" ? { authorizedSignatory: body.authorizedSignatory } : {}),
        ...(typeof body.footerText === "string" ? { footerText: body.footerText } : {}),
      },
      create: {
        agencyId,
        logo: typeof body.logo === "string" ? body.logo : agency.logo,
        signatureUrl: typeof body.signatureUrl === "string" ? body.signatureUrl : null,
        authorizedSignatory: typeof body.authorizedSignatory === "string" ? body.authorizedSignatory : agency.owner,
        footerText: typeof body.footerText === "string" ? body.footerText : null,
      },
    });
    res.json({ ok: true, agencyId });
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
      razorpayLive: Boolean(
        resolved.razorpayKeyId && resolved.razorpayKeySecret && isRazorpayKeyId(resolved.razorpayKeyId),
      ),
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

    if (updatedKeys.razorpayKeyId && !isRazorpayKeyId(updatedKeys.razorpayKeyId)) {
      res.status(400).json({ error: "Razorpay Key ID must start with rzp_test_ or rzp_live_" });
      return;
    }

    if (body.razorpayKeySecret && !body.razorpayKeySecret.includes("••••")) {
      const secret = String(body.razorpayKeySecret).trim();
      if (secret.includes("@") || secret.length < 16) {
        res.status(400).json({ error: "Razorpay Key Secret looks invalid. Paste the secret from the Razorpay dashboard." });
        return;
      }
      updatedKeys.razorpayKeySecret = secret;
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

// ── Shifts ───────────────────────────────────────────────────────────────────
app.get("/api/shifts", requireAuth, requirePermission("attendance"), async (req: AuthRequest, res) => {
  try {
    const shifts = await db.shift.findMany({
      where: { ...agencyScope(req) },
      orderBy: [{ date: "desc" }, { startTime: "asc" }],
      take: 200,
    });
    res.json({ shifts });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/shifts", requireAuth, requirePermission("attendance"), async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (!body.employeeName || !body.date || !body.startTime || !body.endTime) {
      res.status(400).json({ error: "employeeName, date, startTime, endTime required" });
      return;
    }
    const shift = await db.shift.create({
      data: {
        agencyId: ownAgencyId(req),
        branchId: ownBranchId(req),
        employeeId: body.employeeId || null,
        employeeName: String(body.employeeName),
        date: String(body.date),
        startTime: String(body.startTime),
        endTime: String(body.endTime),
        roleLabel: body.roleLabel || null,
        status: body.status || "Scheduled",
        notes: body.notes || null,
      },
    });
    res.status(201).json({ shift });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/shifts/:id", requireAuth, requirePermission("attendance"), async (req: AuthRequest, res) => {
  try {
    const existing = await db.shift.findFirst({ where: { id: routeParamId(req), ...agencyScope(req) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body || {};
    const shift = await db.shift.update({
      where: { id: existing.id },
      data: {
        status: body.status ?? existing.status,
        startTime: body.startTime ?? existing.startTime,
        endTime: body.endTime ?? existing.endTime,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        roleLabel: body.roleLabel !== undefined ? body.roleLabel : existing.roleLabel,
      },
    });
    res.json({ shift });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Payroll scaffold ─────────────────────────────────────────────────────────
app.get("/api/payroll", requireAuth, requireAnyPermission("employees", "finance"), async (req: AuthRequest, res) => {
  try {
    const period = typeof req.query.period === "string" ? req.query.period : undefined;
    const entries = await db.payrollEntry.findMany({
      where: { ...agencyScope(req), ...(period ? { period } : {}) },
      orderBy: [{ period: "desc" }, { employeeName: "asc" }],
      take: 200,
    });
    res.json({ entries });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/payroll", requireAuth, requireAnyPermission("employees", "finance"), async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (!body.employeeName || !body.period || body.baseSalary == null) {
      res.status(400).json({ error: "employeeName, period, baseSalary required" });
      return;
    }
    const baseSalary = Math.round(Number(body.baseSalary) || 0);
    const incentives = Math.round(Number(body.incentives) || 0);
    const deductions = Math.round(Number(body.deductions) || 0);
    const netPay = body.netPay != null ? Math.round(Number(body.netPay)) : baseSalary + incentives - deductions;
    const entry = await db.payrollEntry.create({
      data: {
        agencyId: ownAgencyId(req),
        employeeId: body.employeeId || null,
        employeeName: String(body.employeeName),
        period: String(body.period),
        baseSalary,
        incentives,
        deductions,
        netPay,
        status: body.status || "Draft",
        notes: body.notes || null,
      },
    });
    res.status(201).json({ entry });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/payroll/:id", requireAuth, requireAnyPermission("employees", "finance"), async (req: AuthRequest, res) => {
  try {
    const existing = await db.payrollEntry.findFirst({ where: { id: routeParamId(req), ...agencyScope(req) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body || {};
    const baseSalary = body.baseSalary != null ? Math.round(Number(body.baseSalary)) : existing.baseSalary;
    const incentives = body.incentives != null ? Math.round(Number(body.incentives)) : existing.incentives;
    const deductions = body.deductions != null ? Math.round(Number(body.deductions)) : existing.deductions;
    const netPay = body.netPay != null ? Math.round(Number(body.netPay)) : baseSalary + incentives - deductions;
    const entry = await db.payrollEntry.update({
      where: { id: existing.id },
      data: {
        baseSalary,
        incentives,
        deductions,
        netPay,
        status: body.status ?? existing.status,
        notes: body.notes !== undefined ? body.notes : existing.notes,
      },
    });
    res.json({ entry });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

mountProductRoutes(app, catalogAgencyScope);
mountContractedRateRoutes(app, catalogAgencyScope);
mountTaxRuleRoutes(app, agencyScope);
mountSupplierRoutes(app, agencyScope);
mountDestinationRoutes(app, agencyScope);
mountPackageRoutes(app, agencyScope);
mountTripPlannerRoutes(app, agencyScope);
mountQuoteTemplateRoutes(app, agencyScope);
mountTravelProposalRoutes(app, agencyScope);
mountProposalPdfRoutes(app, agencyScope);
mountQuotationRoutes(app, agencyScope, ownAgencyId, ownBranchId, branchScope);
mountCustomerQuotationRoutes(app, agencyScope, branchScope);
mountDocumentRoutes(app, agencyScope);
mountAgentRegistrationRoutes(app);
mountBmsRoutes(app, agencyScope, ownAgencyId, ownBranchId, branchScope);
mountFinanceRoutes(app, agencyScope, ownAgencyId, branchScope);

// Analytics routes
app.use("/api/analytics", analyticsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export { app, PORT };
