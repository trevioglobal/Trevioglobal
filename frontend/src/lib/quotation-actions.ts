import type { Quotation } from "@/types";
import { downloadInternationalQuotationPdf } from "@/lib/quotation-pdf";
import { downloadProductQuotationPdf, type ProductQuoteLine } from "@/lib/product-quotation-pdf";
import { downloadClientQuotationBrochure } from "@/lib/client-quotation-brochure";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function quoteLines(quote: Quotation): Array<{ description: string; qty: number; price: number; type?: string; imageUrl?: string; currency?: string }> {
  if (quote.lineItems && quote.lineItems.length > 0) return quote.lineItems;
  if (quote.items > 0) {
    const unit = Math.round(quote.amount / Math.max(quote.items, 1));
    return Array.from({ length: quote.items }, (_, i) => ({
      description: `${quote.service} package item ${i + 1}`,
      qty: 1,
      price: unit,
    }));
  }
  return [{ description: `${quote.service} package`, qty: 1, price: quote.amount }];
}

function downloadClassicQuotationPdf(quote: Quotation): boolean {
  const lines = quoteLines(quote);
  const currency = quote.currency || "INR";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const rows = lines
    .map(
      (line, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(line.description)}</td>
        <td style="text-align:center">${line.qty}</td>
        <td style="text-align:right">${fmt(line.price)}</td>
        <td style="text-align:right">${fmt(line.qty * line.price)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quotation ${escapeHtml(quote.quoteNo)}</title>
  <style>
    @page { margin: 18mm; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; line-height: 1.45; }
    .brand { font-size: 20px; font-weight: 700; color: #0f766e; margin: 0; }
    .muted { color: #64748b; font-size: 12px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; }
    h2 { font-size: 15px; margin: 18px 0 8px; color: #0f766e; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 6px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
    th { text-align: left; background: #f8fafc; }
    .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
    .totals { width: 260px; margin-left: auto; margin-top: 16px; }
    .totals td { border: 0; padding: 4px 0; }
    .grand { font-weight: 700; font-size: 14px; border-top: 1px solid #cbd5e1 !important; padding-top: 8px !important; }
    .footer { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p class="brand">Trevio Global</p>
      <p class="muted">Travel Quotation · ${escapeHtml(quote.service)}</p>
    </div>
    <div style="text-align:right">
      <div><strong>${escapeHtml(quote.quoteNo)}</strong></div>
      <div class="muted">${new Date(quote.createdAt).toLocaleDateString("en-IN")}</div>
      <div class="muted">Prepared by ${escapeHtml(quote.createdBy)}</div>
    </div>
  </div>

  <h2>Customer</h2>
  <div class="box">
    <strong>${escapeHtml(quote.customerName)}</strong><br/>
    ${quote.contactEmail ? `Email: ${escapeHtml(quote.contactEmail)}<br/>` : ""}
    ${quote.contactPhone ? `Phone: ${escapeHtml(quote.contactPhone)}` : ""}
  </div>

  ${quote.destination || quote.travelDates ? `
  <h2>Trip</h2>
  <div class="box">
    ${quote.destination ? `Destination: <strong>${escapeHtml(quote.destination)}</strong><br/>` : ""}
    ${quote.travelDates ? `Travel dates: ${escapeHtml(quote.travelDates)}` : ""}
  </div>` : ""}

  <h2>Line Items</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">${fmt(quote.amount)}</td></tr>
    <tr><td>GST</td><td style="text-align:right">${fmt(quote.gst)}</td></tr>
    <tr class="grand"><td>Grand Total</td><td style="text-align:right">${fmt(quote.total)}</td></tr>
  </table>

  <div class="footer">
    Valid till ${escapeHtml(new Date(quote.validTill).toLocaleDateString("en-IN"))}.
    Rates subject to availability. Please reply to confirm booking.
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

/** Open print/Save-as-PDF. Wizard quotes use the Trevio client brochure (no cost/profit). */
export async function downloadQuotationPdf(quote: Quotation): Promise<boolean> {
  const hasBrochure =
    Boolean(quote.packages?.length) ||
    Boolean(quote.destination && (quote.travelStartDate || quote.travelDates));
  if (hasBrochure || quote.service === "Holiday" || quote.service === "International") {
    return downloadClientQuotationBrochure(quote);
  }
  const lines = quoteLines(quote);
  const hasProductImages = lines.some((l) => l.imageUrl || (l.type && ["hotel", "activity", "transfer"].includes(l.type)));

  if (hasProductImages || (quote.destination && lines.some((l) => l.type))) {
    const productLines: ProductQuoteLine[] = lines.map((l) => ({
      type: (["hotel", "activity", "transfer"].includes(l.type || "") ? l.type : "activity") as ProductQuoteLine["type"],
      title: l.description,
      imageUrl: l.imageUrl,
      qty: l.qty,
      unitPrice: l.price,
      currency: l.currency || quote.currency || "INR",
    }));
    return downloadProductQuotationPdf({
      quoteNo: quote.quoteNo,
      customerName: quote.customerName,
      contactEmail: quote.contactEmail,
      contactPhone: quote.contactPhone,
      destination: quote.destination || quote.service,
      travelDates: quote.travelDates || "As discussed",
      adults: quote.adults,
      children: quote.children,
      lines: productLines,
      includes: quote.packageIncludes,
      excludes: quote.packageExcludes,
      paymentTerms: quote.paymentTerms,
      cancellationPolicy: quote.cancellationPolicy,
      currency: quote.currency || "INR",
      gst: quote.gst,
      createdBy: quote.createdBy,
    });
  }

  if (quote.isInternational) {
    return downloadInternationalQuotationPdf({
      quoteNo: quote.quoteNo,
      customerName: quote.customerName,
      contactPerson: quote.contactPerson,
      contactEmail: quote.contactEmail,
      contactPhone: quote.contactPhone,
      destination: quote.destination || "International",
      travelDates: quote.travelDates || "As discussed",
      adults: quote.adults,
      children: quote.children,
      infants: quote.infants,
      hotelStarPreference: quote.hotelStarPreference,
      location: quote.location,
      currency: quote.currency,
      includes: quote.packageIncludes,
      excludes: quote.packageExcludes,
      paymentTerms: quote.paymentTerms,
      cancellationPolicy: quote.cancellationPolicy,
      amount: quote.amount,
      gst: quote.gst,
      total: quote.total,
      createdBy: quote.createdBy,
    });
  }

  return downloadClassicQuotationPdf(quote);
}

export function buildQuotationShareText(quote: Quotation): string {
  const dest = quote.destination ? `\nDestination: ${quote.destination}` : "";
  const dates = quote.travelDates ? `\nTravel: ${quote.travelDates}` : "";
  return (
    `Hello ${quote.customerName},\n\n` +
    `Please find our travel quotation ${quote.quoteNo}.${dest}${dates}\n` +
    `Total: ${formatINR(quote.total)} (incl. GST)\n` +
    `Valid till: ${new Date(quote.validTill).toLocaleDateString("en-IN")}\n\n` +
    `Prepared by ${quote.createdBy} · Trevio Global\n` +
    `We will also share the PDF quotation for your review.`
  );
}

export function shareQuotationViaEmail(quote: Quotation): void {
  const subject = encodeURIComponent(`Travel Quotation ${quote.quoteNo} — ${quote.customerName}`);
  const body = encodeURIComponent(buildQuotationShareText(quote));
  const to = quote.contactEmail ? encodeURIComponent(quote.contactEmail) : "";
  window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_blank");
}

export function shareQuotationViaWhatsApp(quote: Quotation, phoneOverride?: string): void {
  const text = encodeURIComponent(buildQuotationShareText(quote));
  const raw = (phoneOverride || quote.contactPhone || "").replace(/\D/g, "");
  const phone = raw.length >= 10 ? raw : "";
  const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export { quoteLines as getQuotationLineItems };
