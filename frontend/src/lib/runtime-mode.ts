/**
 * Runtime mode helpers for Demo vs Live deployments.
 *
 * Frontend:
 *   NEXT_PUBLIC_APP_MODE=demo|live   (default: demo in non-production builds, live when NODE_ENV=production)
 *   NEXT_PUBLIC_ENABLE_MOCK_INVENTORY=true|false  (mock flights/hotels; default true only in demo)
 *   NEXT_PUBLIC_ENABLE_STUB_MODULES=true|false    (marketing/cms/holiday shells; default true only in demo)
 *   NEXT_PUBLIC_SHOW_DEMO_LOGIN=true|false        (seed credential helpers on login)
 *   NEXT_PUBLIC_ALLOW_PUBLIC_REGISTER=true|false  (self-serve agency signup; default false in live)
 *
 * Backend (already enforced):
 *   NODE_ENV=production → demo payments OFF unless ALLOW_DEMO_PAYMENTS=true
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET required for live checkout
 *   SMTP or SENDGRID_API_KEY required for password-reset emails in production
 */

export type AppMode = "demo" | "live";

function envFlag(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env[name]?.trim().toLowerCase();
}

export function getAppMode(): AppMode {
  const explicit = envFlag("NEXT_PUBLIC_APP_MODE");
  if (explicit === "demo" || explicit === "live") return explicit;
  return process.env.NODE_ENV === "production" ? "live" : "demo";
}

export function isDemoMode(): boolean {
  return getAppMode() === "demo";
}

/** Mock flights/hotels search — only for demos unless explicitly enabled. */
export function isMockInventoryEnabled(): boolean {
  const flag = envFlag("NEXT_PUBLIC_ENABLE_MOCK_INVENTORY");
  if (flag === "true") return true;
  if (flag === "false") return false;
  return isDemoMode();
}

/** Seed login helper chips / prefilled demo password. */
export function isDemoLoginEnabled(): boolean {
  const flag = envFlag("NEXT_PUBLIC_SHOW_DEMO_LOGIN");
  if (flag === "true") return true;
  if (flag === "false") return false;
  return isDemoMode();
}

/** UI shells (marketing, CMS, holiday catalog, API marketplace, etc.) — demo only by default. */
export function isStubModulesEnabled(): boolean {
  const flag = envFlag("NEXT_PUBLIC_ENABLE_STUB_MODULES");
  if (flag === "true") return true;
  if (flag === "false") return false;
  return isDemoMode();
}

export function mockInventoryBannerText(): string {
  return "Demo inventory — sample flight/hotel results only. Not connected to a live GDS or hotel supplier.";
}
