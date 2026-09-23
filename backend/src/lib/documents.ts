import { randomBytes, randomUUID } from "crypto";

function isAgentLike(role?: string): boolean {
  return role === "travel_agent" || role === "customer";
}

export const DOCUMENT_TYPES = [
  "QUOTE_ATTACHMENT",
  "HOTEL_VOUCHER",
  "HOTEL_CONFIRMATION",
  "HOTEL_INVOICE",
  "FLIGHT_TICKET",
  "FLIGHT_CONFIRMATION",
  "FLIGHT_INVOICE",
  "VISA_DOCUMENT",
  "INSURANCE_POLICY",
  "ACTIVITY_VOUCHER",
  "TRANSFER_VOUCHER",
  "GST_VAT_PROOF",
  "PASSPORT_FRONT",
  "PASSPORT_BACK",
  "PAN",
  "OTHER",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const LEGACY_TYPES: Record<string, DocumentType> = {
  voucher: "HOTEL_VOUCHER",
  ticket: "FLIGHT_TICKET",
  insurance: "INSURANCE_POLICY",
  other: "OTHER",
  "quote attachment": "QUOTE_ATTACHMENT",
  "passport front": "PASSPORT_FRONT",
  "passport back": "PASSPORT_BACK",
  "pan card": "PAN",
  pan: "PAN",
};

export const VISIBILITIES = ["INTERNAL", "AGENT", "CUSTOMER"] as const;
export type DocumentVisibility = (typeof VISIBILITIES)[number];

const ALLOWED = [
  { mime: "application/pdf", extensions: [".pdf"] },
  { mime: "image/jpeg", extensions: [".jpg", ".jpeg"] },
  { mime: "image/png", extensions: [".png"] },
] as const;

export const URL_UPLOAD_REJECTED = "Upload the file. A URL is not accepted as a document.";
export const GST_MAX_BYTES = 5 * 1024 * 1024;

export function documentMaxBytes(): number {
  const configured = Number(process.env.DOCUMENT_MAX_BYTES || 10 * 1024 * 1024);
  return Number.isFinite(configured) && configured > 0 ? configured : 10 * 1024 * 1024;
}

export function gstProofMaxBytes(): number {
  const configured = Number(process.env.DOCUMENT_GST_MAX_BYTES || GST_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, GST_MAX_BYTES) : GST_MAX_BYTES;
}

export function normalizeVisibility(value: unknown): DocumentVisibility {
  const raw = String(value || "INTERNAL").trim().toUpperCase();
  if (raw === "AGENT") return "AGENT";
  if (raw === "CUSTOMER") return "CUSTOMER";
  return "INTERNAL";
}

export function normalizeDocType(value: unknown): DocumentType | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if ((DOCUMENT_TYPES as readonly string[]).includes(upper)) return upper as DocumentType;
  return LEGACY_TYPES[raw.toLowerCase()] || null;
}

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

export function rejectUrlUpload(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.fileUrl != null || record.url != null || record.gstProofUrl != null) return URL_UPLOAD_REJECTED;
  return null;
}

export function isUnrestrictedPublicUrl(value: string): boolean {
  return /^(https?:|data:)/i.test(value) || value.startsWith("/uploads/") || value.startsWith("/storage/");
}

export type UploadCheck = {
  originalName: string;
  declaredMime?: string | null;
  bytes: Buffer;
  limit: number;
};

export function validateUpload(input: UploadCheck): { ok: true; mime: string; extension: string } | { ok: false; error: string } {
  if (!input.bytes.length) return { ok: false, error: "Empty files are not accepted." };
  if (input.bytes.length > input.limit) {
    const mb = Math.round(input.limit / (1024 * 1024));
    return { ok: false, error: `File exceeds the ${mb} MB limit.` };
  }
  const extension = extensionOf(input.originalName);
  const sniffed = sniffMime(input.bytes);
  if (!sniffed) return { ok: false, error: "Unsupported file type. Upload JPG, PNG, or PDF." };
  const rule = ALLOWED.find((item) => item.mime === sniffed);
  if (!rule || !(rule.extensions as readonly string[]).includes(extension)) {
    return { ok: false, error: "File extension does not match the file contents." };
  }
  if (input.declaredMime && input.declaredMime !== sniffed && input.declaredMime !== "application/octet-stream") {
    return { ok: false, error: "Declared file type does not match the file contents." };
  }
  return { ok: true, mime: sniffed, extension };
}

export function visibilityAllows(role: string | undefined, visibility: unknown): boolean {
  const level = normalizeVisibility(visibility);
  if (role === "customer") return level === "CUSTOMER";
  if (role === "travel_agent") return level === "AGENT" || level === "CUSTOMER";
  if (isAgentLike(role)) return false;
  return true;
}

export function assignVisibility(role: string | undefined, requested: unknown): DocumentVisibility | null {
  const level = normalizeVisibility(requested || (role === "travel_agent" ? "AGENT" : "INTERNAL"));
  if (role === "travel_agent" && level === "INTERNAL") return null;
  if (role === "customer") return null;
  if (role === "travel_agent") return level === "CUSTOMER" ? "CUSTOMER" : "AGENT";
  return level;
}

export function canDeleteDocument(input: {
  role?: string;
  userId?: string;
  visibility: unknown;
  uploadedById?: string | null;
  canAccessParent: boolean;
}): "ok" | "forbidden" | "not_found" {
  if (!input.canAccessParent) return "not_found";
  if (!visibilityAllows(input.role, input.visibility) && isAgentLike(input.role)) return "not_found";
  if (input.role === "customer") return "forbidden";
  if (input.role === "travel_agent") {
    if (normalizeVisibility(input.visibility) === "INTERNAL") return "not_found";
    if (input.uploadedById && input.userId && input.uploadedById !== input.userId) return "forbidden";
    return "ok";
  }
  return "ok";
}

export function filterDocumentsForRole<T extends { visibility?: unknown; storageKey?: unknown; fileUrl?: unknown; storedName?: unknown }>(
  documents: T[] | undefined,
  role?: string,
): Array<Omit<T, "storageKey" | "fileUrl" | "storedName">> {
  if (!Array.isArray(documents)) return [];
  return documents.filter((doc) => visibilityAllows(role, doc.visibility)).map((doc) => {
    const next = { ...doc };
    delete next.storageKey;
    delete next.fileUrl;
    delete next.storedName;
    delete (next as { storageProvider?: unknown }).storageProvider;
    return next;
  });
}

export function safeStoredName(extension: string): string {
  return `${randomUUID()}${extension}`;
}

export function claimToken(): string {
  return randomBytes(24).toString("hex");
}

export type QuoteDocumentLink = {
  id: string;
  docType: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  visibility?: string | null;
  relatedEntity?: string | null;
  description?: string | null;
  storageKey?: string | null;
  storageProvider?: string | null;
  storedName?: string | null;
  uploadedBy?: string | null;
  uploadedById?: string | null;
};

/** Same stored object. No file copy. */
export function bookingLinkFromQuoteDocument(doc: QuoteDocumentLink, bookingId: string) {
  return {
    bookingId,
    quotationDocumentId: doc.id,
    docType: doc.docType,
    fileName: doc.fileName,
    fileUrl: "",
    mimeType: doc.mimeType || null,
    sizeBytes: doc.sizeBytes || 0,
    visibility: normalizeVisibility(doc.visibility),
    relatedEntity: doc.relatedEntity || null,
    description: doc.description || null,
    storageKey: doc.storageKey || null,
    storageProvider: doc.storageProvider || "local",
    storedName: doc.storedName || null,
    uploadedBy: doc.uploadedBy || null,
    uploadedById: doc.uploadedById || null,
  };
}

export function contentDisposition(filename: string): string {
  const cleaned = filename.replace(/[\r\n"]/g, "").slice(0, 180) || "document";
  return `attachment; filename="${cleaned}"`;
}
