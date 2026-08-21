import { db } from "./db.js";

export interface DynamicApiKeys {
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayMode?: "Test" | "Live";
  flightProvider?: "amadeus" | "duffel" | "tbo" | "mock";
  flightApiKey?: string;
  flightApiSecret?: string;
  hotelProvider?: "amadeus" | "ratehawk" | "hotelbeds" | "tbo" | "mock";
  hotelApiKey?: string;
  hotelApiSecret?: string;
  sendgridApiKey?: string;
  sendgridFromEmail?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: string;
  smtpFrom?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  smsProvider?: "twilio" | "gupshup";
  twilioAccountSid?: string;
  twilioAuthToken?: string;
}

export function maskSecret(val?: string | null): string {
  if (!val) return "";
  if (val.length <= 6) return "••••••••";
  return `${val.slice(0, 4)}••••••••${val.slice(-3)}`;
}

/** First active agency — used when superadmin has no agencyId on the JWT. */
export async function resolveDefaultAgencyId(): Promise<string | null> {
  const agency = await db.agency.findFirst({
    where: { status: { not: "Deleted" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return agency?.id ?? null;
}

function pick(primary?: string, secondary?: string, tertiary?: string): string | undefined {
  const a = primary?.trim();
  if (a) return a;
  const b = secondary?.trim();
  if (b) return b;
  const c = tertiary?.trim();
  return c || undefined;
}

function mergeKeys(agency: DynamicApiKeys, platform: DynamicApiKeys, env: DynamicApiKeys): DynamicApiKeys {
  return {
    razorpayKeyId: pick(agency.razorpayKeyId, platform.razorpayKeyId, env.razorpayKeyId),
    razorpayKeySecret: pick(agency.razorpayKeySecret, platform.razorpayKeySecret, env.razorpayKeySecret),
    razorpayMode: (pick(agency.razorpayMode, platform.razorpayMode, env.razorpayMode) as "Test" | "Live") || "Test",
    flightProvider: (pick(agency.flightProvider, platform.flightProvider, env.flightProvider) as DynamicApiKeys["flightProvider"]) || "mock",
    flightApiKey: pick(agency.flightApiKey, platform.flightApiKey, env.flightApiKey),
    flightApiSecret: pick(agency.flightApiSecret, platform.flightApiSecret, env.flightApiSecret),
    hotelProvider: (pick(agency.hotelProvider, platform.hotelProvider, env.hotelProvider) as DynamicApiKeys["hotelProvider"]) || "mock",
    hotelApiKey: pick(agency.hotelApiKey, platform.hotelApiKey, env.hotelApiKey),
    hotelApiSecret: pick(agency.hotelApiSecret, platform.hotelApiSecret, env.hotelApiSecret),
    sendgridApiKey: pick(agency.sendgridApiKey, platform.sendgridApiKey, env.sendgridApiKey),
    sendgridFromEmail: pick(agency.sendgridFromEmail, platform.sendgridFromEmail, env.sendgridFromEmail),
    smtpHost: pick(agency.smtpHost, platform.smtpHost, env.smtpHost),
    smtpPort: pick(agency.smtpPort, platform.smtpPort, env.smtpPort),
    smtpUser: pick(agency.smtpUser, platform.smtpUser, env.smtpUser),
    smtpPassword: pick(agency.smtpPassword, platform.smtpPassword, env.smtpPassword),
    smtpSecure: pick(agency.smtpSecure, platform.smtpSecure, env.smtpSecure),
    smtpFrom: pick(agency.smtpFrom, platform.smtpFrom, env.smtpFrom),
    s3Bucket: pick(agency.s3Bucket, platform.s3Bucket, env.s3Bucket),
    s3Region: pick(agency.s3Region, platform.s3Region, env.s3Region) || "ap-south-1",
    s3AccessKey: pick(agency.s3AccessKey, platform.s3AccessKey, env.s3AccessKey),
    s3SecretKey: pick(agency.s3SecretKey, platform.s3SecretKey, env.s3SecretKey),
    smsProvider: (pick(agency.smsProvider, platform.smsProvider, env.smsProvider) as DynamicApiKeys["smsProvider"]),
    twilioAccountSid: pick(agency.twilioAccountSid, platform.twilioAccountSid, env.twilioAccountSid),
    twilioAuthToken: pick(agency.twilioAuthToken, platform.twilioAuthToken, env.twilioAuthToken),
  };
}

async function loadStoredKeys(agencyId: string): Promise<DynamicApiKeys> {
  const settings = await db.settings.findUnique({
    where: { agencyId },
    select: { apiKeys: true },
  });
  return (settings?.apiKeys as DynamicApiKeys | null) ?? {};
}

/**
 * Resolve integration keys for an agency.
 * Precedence: agency Settings → platform (first agency) Settings → process.env
 * So superadmin can set keys once on the primary agency and every user inherits them.
 */
export async function getAgencyApiKeys(agencyId?: string | null): Promise<DynamicApiKeys> {
  const env = getFallbackEnvKeys();
  const platformId = await resolveDefaultAgencyId();
  const id = agencyId || platformId;
  if (!id) return env;

  try {
    const agencyStored = await loadStoredKeys(id);
    const platformStored =
      platformId && platformId !== id ? await loadStoredKeys(platformId) : {};
    return mergeKeys(agencyStored, platformStored, env);
  } catch {
    return env;
  }
}

function getFallbackEnvKeys(): DynamicApiKeys {
  return {
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayMode: "Test",
    flightProvider: (process.env.FLIGHT_PROVIDER as DynamicApiKeys["flightProvider"]) || "mock",
    flightApiKey: process.env.FLIGHT_API_KEY,
    flightApiSecret: process.env.FLIGHT_API_SECRET,
    hotelProvider: (process.env.HOTEL_PROVIDER as DynamicApiKeys["hotelProvider"]) || "mock",
    hotelApiKey: process.env.HOTEL_API_KEY,
    hotelApiSecret: process.env.HOTEL_API_SECRET,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpSecure: process.env.SMTP_SECURE,
    smtpFrom: process.env.SMTP_FROM,
    s3Bucket: process.env.AWS_S3_BUCKET,
    s3Region: process.env.AWS_REGION || "ap-south-1",
    s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
    s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  };
}
