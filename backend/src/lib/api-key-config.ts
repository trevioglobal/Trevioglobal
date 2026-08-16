import { db } from "./db.js";

export interface DynamicApiKeys {
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayMode?: "Test" | "Live";
  flightProvider?: "amadeus" | "duffel" | "tbo" | "mock";
  flightApiKey?: string;
  flightApiSecret?: string;
  hotelProvider?: "ratehawk" | "hotelbeds" | "tbo" | "mock";
  hotelApiKey?: string;
  hotelApiSecret?: string;
  sendgridApiKey?: string;
  sendgridFromEmail?: string;
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

export async function getAgencyApiKeys(agencyId?: string | null): Promise<DynamicApiKeys> {
  if (!agencyId) {
    return getFallbackEnvKeys();
  }
  try {
    const settings = await db.settings.findUnique({
      where: { agencyId },
      select: { apiKeys: true },
    });
    const stored = (settings?.apiKeys as DynamicApiKeys | null) ?? {};
    return {
      razorpayKeyId: stored.razorpayKeyId || process.env.RAZORPAY_KEY_ID,
      razorpayKeySecret: stored.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET,
      razorpayMode: stored.razorpayMode || "Test",
      flightProvider: stored.flightProvider || "mock",
      flightApiKey: stored.flightApiKey || process.env.FLIGHT_API_KEY,
      flightApiSecret: stored.flightApiSecret || process.env.FLIGHT_API_SECRET,
      hotelProvider: stored.hotelProvider || "mock",
      hotelApiKey: stored.hotelApiKey || process.env.HOTEL_API_KEY,
      hotelApiSecret: stored.hotelApiSecret || process.env.HOTEL_API_SECRET,
      sendgridApiKey: stored.sendgridApiKey || process.env.SENDGRID_API_KEY,
      sendgridFromEmail: stored.sendgridFromEmail || process.env.SENDGRID_FROM_EMAIL,
      s3Bucket: stored.s3Bucket || process.env.AWS_S3_BUCKET,
      s3Region: stored.s3Region || process.env.AWS_REGION || "ap-south-1",
      s3AccessKey: stored.s3AccessKey || process.env.AWS_ACCESS_KEY_ID,
      s3SecretKey: stored.s3SecretKey || process.env.AWS_SECRET_ACCESS_KEY,
      smsProvider: stored.smsProvider,
      twilioAccountSid: stored.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: stored.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN,
    };
  } catch {
    return getFallbackEnvKeys();
  }
}

function getFallbackEnvKeys(): DynamicApiKeys {
  return {
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayMode: "Test",
    flightProvider: "mock",
    flightApiKey: process.env.FLIGHT_API_KEY,
    flightApiSecret: process.env.FLIGHT_API_SECRET,
    hotelProvider: "mock",
    hotelApiKey: process.env.HOTEL_API_KEY,
    hotelApiSecret: process.env.HOTEL_API_SECRET,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL,
    s3Bucket: process.env.AWS_S3_BUCKET,
    s3Region: process.env.AWS_REGION || "ap-south-1",
    s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
    s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  };
}
