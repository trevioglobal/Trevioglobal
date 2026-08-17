import crypto from "crypto";
import type { Request, Response } from "express";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { getAgencyApiKeys } from "./api-key-config.js";

export function razorpayEnvConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export async function razorpayKeysForAgency(agencyId?: string | null): Promise<{ keyId: string; keySecret: string } | null> {
  const keys = await getAgencyApiKeys(agencyId);
  if (!keys.razorpayKeyId || !keys.razorpayKeySecret) return null;
  return { keyId: keys.razorpayKeyId, keySecret: keys.razorpayKeySecret };
}

export function razorpayAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  notes?: Record<string, string>;
};

export async function fetchRazorpayPayment(paymentId: string, keyId: string, keySecret: string): Promise<RazorpayPayment> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: razorpayAuthHeader(keyId, keySecret) },
  });
  if (!res.ok) {
    const detail = await res.text();
    logger.error({ detail }, "Razorpay payment lookup failed");
    throw new Error("Razorpay payment lookup failed");
  }
  return (await res.json()) as RazorpayPayment;
}

export async function assertRazorpayPayment(opts: {
  orderId: string;
  paymentId: string;
  signature: string;
  amountRupees?: number;
  keyId: string;
  keySecret: string;
}): Promise<{ ok: true; payment: RazorpayPayment } | { ok: false; error: string }> {
  if (!verifyRazorpaySignature(opts.orderId, opts.paymentId, opts.signature, opts.keySecret)) {
    return { ok: false, error: "Invalid payment signature" };
  }
  const payment = await fetchRazorpayPayment(opts.paymentId, opts.keyId, opts.keySecret);
  if (payment.order_id !== opts.orderId) {
    return { ok: false, error: "Payment does not match order" };
  }
  if (!["captured", "authorized"].includes(payment.status)) {
    return { ok: false, error: "Payment is not captured" };
  }
  if (opts.amountRupees != null && Number.isFinite(opts.amountRupees)) {
    const expectedPaise = Math.round(opts.amountRupees * 100);
    if (payment.amount !== expectedPaise) {
      return { ok: false, error: "Payment amount mismatch" };
    }
  }
  return { ok: true, payment };
}

export async function creditWalletIfNew(opts: {
  agencyId: string;
  amountRupees: number;
  paymentId: string;
  source?: string;
  description?: string;
}): Promise<{ credited: boolean; balance: number }> {
  const reused = await db.walletTransaction.findUnique({ where: { paymentRef: opts.paymentId } });
  if (reused) {
    const agency = await db.agency.findUnique({ where: { id: opts.agencyId } });
    return { credited: false, balance: agency?.walletBalance ?? 0 };
  }
  const agency = await db.agency.findUnique({ where: { id: opts.agencyId } });
  if (!agency) throw new Error("Agency not found");
  const balance = agency.walletBalance + opts.amountRupees;
  await db.agency.update({ where: { id: opts.agencyId }, data: { walletBalance: balance } });
  await db.walletTransaction.create({
    data: {
      agencyId: opts.agencyId,
      type: "Credit",
      source: opts.source || "Top-up",
      amount: opts.amountRupees,
      balance,
      description: opts.description || "Razorpay wallet top-up",
      paymentRef: opts.paymentId,
    },
  });
  return { credited: true, balance };
}

export async function handleRazorpayWebhook(req: Request, res: Response) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }
  const signature = String(req.headers["x-razorpay-signature"] || "");
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  try {
    if (!signature || expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }
  } catch {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  let event: { event?: string; payload?: { payment?: { entity?: RazorpayPayment & { notes?: Record<string, string> } } } };
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  if (event.event === "payment.captured") {
    const payment = event.payload?.payment?.entity;
    const agencyId = payment?.notes?.agencyId;
    const purpose = payment?.notes?.purpose;
    if (payment && agencyId && purpose === "wallet") {
      try {
        await creditWalletIfNew({
          agencyId,
          amountRupees: Math.round(payment.amount / 100),
          paymentId: payment.id,
          description: "Razorpay wallet top-up (webhook)",
        });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Wallet credit failed" });
        return;
      }
    }
  }

  res.json({ ok: true });
}
