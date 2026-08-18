import nodemailer from "nodemailer";
import { logger } from "./logger.js";
import { escapeHtml } from "./html.js";

export interface EmailPayload {
  to: string;
  subject: string;
  template: "approval" | "rejection" | "password_reset" | "temp_credentials";
  data: {
    agentName: string;
    productName?: string;
    productType?: "activity" | "transfer" | "hotel";
    reason?: string;
    approverName?: string;
    tempPassword?: string;
    resetToken?: string;
    loginEmail?: string;
  };
}

type SendGridMail = {
  setApiKey: (key: string) => void;
  send: (msg: { to: string; from: string; subject: string; html: string }) => Promise<unknown>;
};

let sgMailPromise: Promise<SendGridMail | null> | null = null;
let smtpTransport: nodemailer.Transporter | null | undefined;

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function fromAddress(): string {
  return (
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    process.env.SENDGRID_FROM_EMAIL ||
    "noreply@travelpartner.pro"
  );
}

function getSmtpTransport(): nodemailer.Transporter | null {
  if (!smtpConfigured()) return null;
  if (smtpTransport) return smtpTransport;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: (process.env.SMTP_PASSWORD || "").replace(/\s/g, ""),
    },
  });
  return smtpTransport;
}

function loadSendGrid(): Promise<SendGridMail | null> {
  if (!process.env.SENDGRID_API_KEY) return Promise.resolve(null);
  if (!sgMailPromise) {
    sgMailPromise = import("@sendgrid/mail")
      .then((mod) => {
        const client = mod.default as SendGridMail;
        client.setApiKey(process.env.SENDGRID_API_KEY!);
        return client;
      })
      .catch(() => {
        logger.warn("SendGrid not installed. Email notifications will be logged only.");
        return null;
      });
  }
  return sgMailPromise;
}

function buildHtml(payload: EmailPayload): string {
  if (payload.template === "approval") return generateApprovalEmail(payload);
  if (payload.template === "rejection") return generateRejectionEmail(payload);
  if (payload.template === "password_reset") return generatePasswordResetEmail(payload);
  return generateTempCredentialsEmail(payload);
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  return sendRawHtml(payload.to, payload.subject, buildHtml(payload));
}

/** Transactional HTML (quotations, etc.) using the same SMTP/SendGrid transport. */
export async function sendHtmlEmail(to: string, subject: string, html: string): Promise<boolean> {
  return sendRawHtml(to, subject, html);
}

async function sendRawHtml(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const smtp = getSmtpTransport();
    if (smtp) {
      await smtp.sendMail({
        to,
        from: fromAddress(),
        subject,
        html,
      });
      logger.info(`[EMAIL-SENT] To: ${to}, Subject: ${subject}`);
      return true;
    }

    const sgMail = await loadSendGrid();
    if (sgMail) {
      await sgMail.send({
        to,
        from: fromAddress(),
        subject,
        html,
      });
      logger.info(`[EMAIL-SENT] To: ${to}, Subject: ${subject}`);
      return true;
    }

    logger.warn(`[EMAIL-FALLBACK] SMTP/SendGrid not configured. To: ${to}, Subject: ${subject}`);
    return false;
  } catch (error) {
    logger.error(`Email send failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** True when plaintext temp passwords may be returned in API responses (dev/test only). */
export function allowInsecureTempPasswordResponse(): boolean {
  if (process.env.ALLOW_INSECURE_TEMP_PASSWORD_RESPONSE === "true") return true;
  if (process.env.ALLOW_INSECURE_TEMP_PASSWORD_RESPONSE === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** Demo checkout is allowed only outside production, unless explicitly enabled. */
export function allowDemoPayments(): boolean {
  if (process.env.ALLOW_DEMO_PAYMENTS === "true") return true;
  if (process.env.ALLOW_DEMO_PAYMENTS === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function generateApprovalEmail(payload: EmailPayload): string {
  const { agentName, productName, productType, approverName } = payload.data;
  return `
    <h2>Rate Approval Notification</h2>
    <p>Hi ${escapeHtml(agentName)},</p>
    <p>Your ${escapeHtml(productType)} "<strong>${escapeHtml(productName)}</strong>" has been <strong style="color: green;">APPROVED</strong> and is now live!</p>
    <p>Agents can now see and book this product at the approved rates.</p>
    <p>Approved by: <strong>${escapeHtml(approverName || "Admin")}</strong></p>
    <p>Best regards,<br/>TravelPartner Pro Team</p>
  `;
}

export function generateRejectionEmail(payload: EmailPayload): string {
  const { agentName, productName, productType, reason, approverName } = payload.data;
  return `
    <h2>Rate Rejection Notification</h2>
    <p>Hi ${escapeHtml(agentName)},</p>
    <p>Your ${escapeHtml(productType)} "<strong>${escapeHtml(productName)}</strong>" has been <strong style="color: red;">REJECTED</strong> and returned to Draft status.</p>
    <p><strong>Reason for rejection:</strong></p>
    <p style="background: #f3f4f6; padding: 10px; border-left: 3px solid #ef4444;">${escapeHtml(reason || "No reason provided")}</p>
    <p>Please review and edit the rates, then resubmit for approval.</p>
    <p>Rejected by: <strong>${escapeHtml(approverName || "Admin")}</strong></p>
    <p>Best regards,<br/>TravelPartner Pro Team</p>
  `;
}

export function generatePasswordResetEmail(payload: EmailPayload): string {
  const { agentName, resetToken, tempPassword } = payload.data;
  if (resetToken) {
    return `
    <h2>Password Reset</h2>
    <p>Hi ${escapeHtml(agentName)},</p>
    <p>Use this one-time reset code within 1 hour to set a new password (it does not change your password until you complete the reset):</p>
    <p style="background:#f3f4f6;padding:12px;font-size:16px;font-weight:bold;letter-spacing:1px;word-break:break-all;">${escapeHtml(resetToken)}</p>
    <p>If you did not request this, ignore this email — your password stays unchanged.</p>
    <p>Best regards,<br/>Trevio Global Team</p>
  `;
  }
  return `
    <h2>Password Reset</h2>
    <p>Hi ${escapeHtml(agentName)},</p>
    <p>Your password has been reset. Use this temporary password to sign in, then change it immediately:</p>
    <p style="background:#f3f4f6;padding:12px;font-size:18px;font-weight:bold;letter-spacing:1px;">${escapeHtml(tempPassword)}</p>
    <p>If you did not request this, contact your administrator.</p>
    <p>Best regards,<br/>Trevio Global Team</p>
  `;
}

export function generateTempCredentialsEmail(payload: EmailPayload): string {
  const { agentName, loginEmail, tempPassword } = payload.data;
  return `
    <h2>Your Trevio Account</h2>
    <p>Hi ${escapeHtml(agentName)},</p>
    <p>An account has been created for you.</p>
    <p><strong>Login:</strong> ${escapeHtml(loginEmail)}<br/><strong>Temporary password:</strong> ${escapeHtml(tempPassword)}</p>
    <p>Please sign in and change your password.</p>
    <p>Best regards,<br/>Trevio Global Team</p>
  `;
}
