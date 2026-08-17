const INSECURE_DEFAULT_SECRET = "trevio-dev-secret-change-in-production";

export function validateEnv() {
  const isProd = process.env.NODE_ENV === "production";

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Configure it in your environment before starting the server.");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Configure it in your environment before starting the server.");
  }

  // Enforce strong JWT_SECRET in production
  if (isProd && process.env.JWT_SECRET === INSECURE_DEFAULT_SECRET) {
    throw new Error("JWT_SECRET is using the known insecure default. Set a long random value (32+ chars) before deploying to production.");
  }

  // Warn about weak JWT_SECRET even in development
  if (process.env.JWT_SECRET.length < 32) {
    if (isProd) {
      throw new Error("JWT_SECRET must be at least 32 characters long for production.");
    }
    console.warn("[env] JWT_SECRET is shorter than recommended (32+ chars). Consider using a stronger secret.");
  }

  // Enforce CORS_ORIGIN in production — any localhost entry is a misconfig
  if (isProd) {
    const cors = (process.env.CORS_ORIGIN || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    const hasLocalhost = cors.some((o) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o));
    if (cors.length === 0 || hasLocalhost) {
      throw new Error("CORS_ORIGIN must be your production HTTPS origin(s) only — do not include localhost.");
    }
  }

  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
  if (isProd && !hasSmtp && !process.env.SENDGRID_API_KEY) {
    throw new Error("SMTP_* or SENDGRID_API_KEY must be set in production so password-reset emails can be delivered.");
  }

  // Verify NODE_ENV is set correctly
  if (!process.env.NODE_ENV) {
    console.warn("[env] NODE_ENV not set, defaulting to development");
    process.env.NODE_ENV = "development";
  }

  if (!["development", "production", "test"].includes(process.env.NODE_ENV)) {
    throw new Error("NODE_ENV must be one of: development, production, test");
  }
}
