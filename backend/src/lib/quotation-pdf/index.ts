import { db } from "../db.js";
import { logger } from "../logger.js";
import { isAgentLike } from "../quotations.js";
import { agentCanAccessQuote, agentQuoteScope, quoteSendBlockReason } from "../quote-access.js";
import { putPrivateObject, objectKey } from "../document-storage.js";
import { safeStoredName } from "../documents.js";
import { assertCustomerSafeModel, buildQuotationPdfModel, type PdfAudience, type PdfMode } from "./model.js";
import { renderQuotationPdf } from "./render.js";

export class QuotationPdfError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "QuotationPdfError";
    this.statusCode = statusCode;
  }
}

export type GenerateQuotationPdfInput = {
  quotationId: string;
  agencyScope: Record<string, unknown>;
  role?: string;
  userId?: string;
  email?: string;
  mode?: PdfMode;
};

function resolveAudience(role?: string): PdfAudience {
  if (role === "customer") return "customer";
  if (role === "travel_agent") return "agent";
  return "internal";
}

function resolveMode(requested: PdfMode | undefined, role?: string): PdfMode {
  if (role === "customer") return "customer";
  return requested === "preview" ? "preview" : "customer";
}

async function loadBranding(agencyId: string | null | undefined) {
  if (!agencyId) {
    return {
      agencyName: "Trevio Global",
      phone: "+91 89516 63471",
      legalFallback: true,
    };
  }
  const [agency, branding] = await Promise.all([
    db.agency.findUnique({ where: { id: agencyId }, select: { name: true, phone: true, email: true, address: true, logo: true } }),
    db.agencyBranding.findUnique({ where: { agencyId } }),
  ]);
  return {
    agencyName: branding?.footerText?.split("•")[0]?.trim() || agency?.name || "Trevio Global",
    logo: branding?.logo || agency?.logo || null,
    watermark: branding?.watermark || null,
    footerText: branding?.footerText || agency?.name || "Trevio Global",
    phone: agency?.phone || null,
    email: agency?.email || null,
    address: agency?.address || null,
  };
}

/**
 * Each generate creates a new QuotationDocument. Previous PDFs are kept for history.
 * Customer mode requires Phase 1 send/approval gates. Preview is internal-only storage.
 */
export async function generateQuotationPdf(input: GenerateQuotationPdfInput) {
  const mode = resolveMode(input.mode, input.role);
  const audience = resolveAudience(input.role);

  const quote = await db.quotation.findFirst({
    where: {
      id: input.quotationId,
      deletedAt: null,
      ...input.agencyScope,
      ...agentQuoteScope(input.role, input.userId),
    },
    include: {
      packages: { orderBy: { sortOrder: "asc" } },
      approvals: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!quote) throw new QuotationPdfError("Quotation not found", 404);

  if (isAgentLike(input.role) && !agentCanAccessQuote(input.role, input.userId, quote)) {
    throw new QuotationPdfError("Quotation not found", 404);
  }

  if (mode === "customer") {
    const block = quoteSendBlockReason(quote);
    if (block) throw new QuotationPdfError(block, 403);
  } else if (isAgentLike(input.role)) {
    throw new QuotationPdfError("Agents cannot create an internal preview PDF.", 403);
  } else if (["Archived", "Converted to Booking"].includes(quote.status)) {
    throw new QuotationPdfError(`A ${quote.status.toLowerCase()} quotation cannot generate a preview PDF.`, 400);
  }

  if (!quote.packages.length) {
    throw new QuotationPdfError("Add at least one package before generating a PDF.");
  }

  const branding = await loadBranding(quote.agencyId);

  let destinationCoverImage: string | null = null;
  if (!quote.coverImage && quote.destination) {
    try {
      const destName = String(quote.destination).split(/[·,]/)[0].trim();
      const dest = await db.destination.findFirst({
        where: {
          AND: [
            {
              OR: [
                { name: { equals: destName, mode: "insensitive" } },
                { name: { contains: destName, mode: "insensitive" } },
                ...(quote.country
                  ? [{ country: { equals: String(quote.country), mode: "insensitive" as const } }]
                  : []),
              ],
            },
            ...(quote.agencyId
              ? [{ OR: [{ agencyId: quote.agencyId }, { agencyId: null }] }]
              : []),
          ],
        },
        select: { heroImage: true, thumbnail: true },
        orderBy: { updatedAt: "desc" },
      });
      destinationCoverImage = dest?.heroImage || dest?.thumbnail || null;
    } catch {
      destinationCoverImage = null;
    }
  }

  const model = buildQuotationPdfModel({
    quote: quote as unknown as Record<string, unknown>,
    branding,
    destinationCoverImage,
    mode,
    audience,
  });
  const leaks = assertCustomerSafeModel(model);
  if (leaks.length) {
    logger.error({ quotationId: quote.id, leaks }, "quotation pdf model leaked sensitive fields");
    throw new QuotationPdfError("PDF generation blocked: sensitive fields were present in the content model.", 500);
  }

  let rendered: { buffer: Buffer; pageCount: number };
  try {
    rendered = await renderQuotationPdf(model);
  } catch (e) {
    logger.error(e);
    throw new QuotationPdfError("PDF generation failed.", 500);
  }
  if (!rendered.buffer.length || rendered.buffer.subarray(0, 4).toString() !== "%PDF") {
    throw new QuotationPdfError("PDF generation produced an invalid file.", 500);
  }

  const visibility = mode === "customer" ? "CUSTOMER" : "INTERNAL";
  const storedName = safeStoredName(".pdf");
  const fileName = `${quote.quoteNo.replace(/[^A-Za-z0-9_-]/g, "_")}-v${quote.currentVersion || 1}-${mode}.pdf`;
  let stored;
  try {
    stored = await putPrivateObject(objectKey(`quote-${quote.id}`, storedName), rendered.buffer, "application/pdf");
  } catch (e) {
    logger.error(e);
    throw new QuotationPdfError("PDF storage failed.", 500);
  }

  const versionRow = await db.quotationVersion.findFirst({
    where: { quotationId: quote.id, versionNumber: quote.currentVersion || 1 },
    select: { id: true, versionNumber: true },
  });

  const document = await db.quotationDocument.create({
    data: {
      quotationId: quote.id,
      docType: "QUOTE_ATTACHMENT",
      fileName,
      fileUrl: "",
      mimeType: "application/pdf",
      sizeBytes: rendered.buffer.length,
      visibility,
      relatedEntity: mode === "customer" ? "CUSTOMER_QUOTATION_PDF" : "INTERNAL_QUOTATION_PDF_PREVIEW",
      description: mode === "customer"
        ? `Customer quotation PDF (v${quote.currentVersion || 1})`
        : `Internal quotation PDF preview (v${quote.currentVersion || 1})`,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      storedName,
      uploadedBy: input.email || null,
      uploadedById: input.userId || null,
      versionNumber: quote.currentVersion || 1,
      quotationVersionId: versionRow?.id || null,
    },
  });

  return {
    document: {
      id: document.id,
      docType: document.docType,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      visibility: document.visibility,
      relatedEntity: document.relatedEntity,
      description: document.description,
      versionNumber: document.versionNumber,
      createdAt: document.createdAt,
      downloadPath: `/api/quotations/${quote.id}/documents/${document.id}/content`,
    },
    pageCount: rendered.pageCount,
    packageCount: model.packages.length,
    mode,
    quoteId: quote.id,
    quoteNo: quote.quoteNo,
    agencyId: quote.agencyId,
    versionNumber: quote.currentVersion || 1,
  };
}

export { buildQuotationPdfModel, assertCustomerSafeModel, renderQuotationPdf };
