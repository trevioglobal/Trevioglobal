import type { AgencyBrandingRecord, Quotation, QuotationPackage } from "@/types";
import { apiFetch } from "@/lib/api";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n || 0);
}

function asArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function str(v: unknown, fallback = "") {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function isImgUrl(v: unknown) {
  const s = str(v);
  return /^(https?:\/\/|data:image\/|\/)/i.test(s);
}

function imgTag(src: unknown, className: string, alt = "") {
  if (!isImgUrl(src)) return "";
  return `<img class="${className}" src="${escapeHtml(str(src))}" alt="${escapeHtml(alt)}" />`;
}

function galleryHtml(day: Record<string, unknown>) {
  const urls = Array.isArray(day.gallery) ? day.gallery.filter(isImgUrl) : [];
  if (!urls.length) return "";
  return `<div class="gallery">${urls.map((u) => imgTag(u, "gallery-img", "Place")).join("")}</div>`;
}

function selling(line: Record<string, unknown>) {
  const qty = Number(line.qty ?? line.quantity ?? 1) || 1;
  if (line.adultRate != null || line.childRate != null) {
    return Number(line.adultRate || 0) * Number(line.adults || 0) + Number(line.childRate || 0) * Number(line.children || 0);
  }
  return Number(line.sellingPrice ?? line.fare ?? 0) * qty;
}

function selectedPackage(quote: Quotation): QuotationPackage | undefined {
  const pkgs = quote.packages || [];
  return pkgs.find((p) => p.isSelected) || pkgs.find((p) => p.id === quote.selectedPackageId) || pkgs[0];
}

function formatDates(quote: Quotation) {
  if (quote.travelStartDate && quote.travelEndDate) {
    const a = new Date(quote.travelStartDate);
    const b = new Date(quote.travelEndDate);
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime())) return `${fmt(a)} – ${fmt(b)}`;
  }
  return quote.travelDates || "Dates as discussed";
}

function nightsLabel(quote: Quotation, pkg?: QuotationPackage) {
  const n = quote.nights ?? asArr(pkg?.hotels).reduce((s, h) => s + Number(h.nights || 0), 0);
  const days = quote.days ?? (n ? n + 1 : 0);
  if (n && days) return `${n}N & ${days}D`;
  if (n) return `${n} nights`;
  return pkg?.description || "Package";
}

const COMPANY = {
  legal: "TREVIO GLOBAL VOYAGE PRIVATE LIMITED",
  address: "No.1, Ayana Tree, Kempapura Road, Dasarahalli Main Rd, Hebbal post, Bengaluru, Karnataka 560024",
  phone: "+91 89516 63471",
  brand: "TREVIO",
};

function openPrint(html: string, title: string) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;
  return true;
}

async function loadBranding(): Promise<AgencyBrandingRecord | null> {
  try {
    const data = await apiFetch<{ branding: AgencyBrandingRecord }>("/api/settings/branding");
    return data.branding || null;
  } catch {
    return null;
  }
}

/** Customer-facing brochure. Never include cost, supplier, profit, or internal notes. */
export async function downloadClientQuotationBrochure(quote: Quotation): Promise<boolean> {
  const pkg = selectedPackage(quote);
  const branding = await loadBranding();
  const currency = quote.currency || "INR";
  const hotels = asArr(pkg?.hotels);
  const flights = asArr(pkg?.flights);
  const activities = asArr(pkg?.activities);
  const transfers = asArr(pkg?.transfers);
  const itinerary = asArr(pkg?.itinerary);
  const inclusions = (pkg?.inclusions?.length ? pkg.inclusions : quote.packageIncludes) || [];
  const exclusions = (pkg?.exclusions?.length ? pkg.exclusions : quote.packageExcludes) || [];
  const logo = isImgUrl(branding?.logo) ? str(branding?.logo) : `${window.location.origin}/trevio-logo.png`;
  const brandName = COMPANY.brand;
  const code = (quote.quoteNo || "TG").replace(/[^A-Za-z0-9]/g, "_").slice(0, 18);
  const pax = Math.max(1, Number(quote.adults || 0) + Number(quote.children || 0));
  const flightSell = flights.reduce((s, f) => s + selling(f), 0);
  const landSell = Math.max(0, Number(quote.total || 0) - flightSell);
  const perPax = quote.perPersonCost ?? Math.round(Number(quote.total || 0) / pax);
  const hotelLine = hotels
    .map((h) => `${str(h.city || h.hotelName)} — ${str(h.hotelName)} — ${str(h.roomType, "Standard")} room`)
    .join(" · ") || "As per itinerary";
  const roomTypes = [...new Set(hotels.map((h) => str(h.roomType)).filter(Boolean))].join(" / ") || "Standard";
  const dest = [quote.destination, quote.country].filter(Boolean).join(" · ") || "Holiday";
  const coverSrc =
    str(quote.coverImage) ||
    str(itinerary.find((d) => isImgUrl(d.coverImage))?.coverImage) ||
    str(hotels.find((h) => isImgUrl(h.imageUrl))?.imageUrl);
  const coverBg = isImgUrl(coverSrc)
    ? `background-image:linear-gradient(180deg,rgba(10,22,40,.42),rgba(10,22,40,.88)),url('${escapeHtml(coverSrc)}');background-size:cover;background-position:center;`
    : "";
  const watermark = isImgUrl(branding?.watermark)
    ? `<img class="watermark" src="${escapeHtml(str(branding?.watermark))}" alt="" />`
    : "";
  const footBrand = escapeHtml(str(branding?.footerText, "Trevio Global").split("•")[0].trim() || "Trevio Global");

  const highlightCards = activities
    .filter((a) => str(a.description) || str(a.activityName) || isImgUrl(a.imageUrl))
    .map(
      (a) => `
      <article class="card">
        ${imgTag(a.imageUrl, "card-photo", str(a.activityName, "Experience"))}
        <h3>${escapeHtml(str(a.activityName, "Experience"))}</h3>
        <p>${escapeHtml(str(a.description, str(a.ticketType)))}</p>
      </article>`,
    )
    .join("");

  const itineraryHtml = itinerary
    .map((day, i) => {
      const items = asArr(day.items);
      const lis = items
        .map((it) => `<li>${escapeHtml(str(it.activityName || it.description))}${it.description && it.activityName && it.description !== it.activityName ? ` — ${escapeHtml(str(it.description))}` : ""}</li>`)
        .join("");
      return `
        <div class="day">
          <h3>${escapeHtml(str(day.title, `Day ${day.day || i + 1}`))}</h3>
          ${day.city ? `<p class="muted">${escapeHtml(str(day.city))}</p>` : ""}
          ${imgTag(day.coverImage, "day-photo", str(day.title, `Day ${i + 1}`))}
          ${galleryHtml(day)}
          <ul>${lis || "<li>Leisure</li>"}</ul>
          ${day.mealPlan ? `<p class="meals">Meal plan: ${escapeHtml(str(day.mealPlan))}</p>` : ""}
        </div>`;
    })
    .join("");

  const flightRows = flights
    .map(
      (f) => `
      <tr>
        <td>${escapeHtml(str(f.from))} to ${escapeHtml(str(f.to))}</td>
        <td>${escapeHtml(str(f.date || formatDates(quote)))}</td>
        <td>${escapeHtml(str(f.airline))}</td>
        <td>${escapeHtml(str(f.depTime))} – ${escapeHtml(str(f.arrTime))}</td>
      </tr>`,
    )
    .join("");

  const hotelPages = hotels
    .map(
      (h) => `
      <section class="page">
        ${watermark}
        <p class="kicker">Accommodation</p>
        <h2>${escapeHtml(str(h.city, "Stay"))}</h2>
        <div class="hotel-layout">
          ${isImgUrl(h.imageUrl) ? `<div>${imgTag(h.imageUrl, "hotel-photo", str(h.hotelName))}</div>` : ""}
          <div class="hotel">
            <p><strong>Property:</strong> ${escapeHtml(str(h.hotelName))} ${h.hotelName && !String(h.hotelName).toLowerCase().includes("similar") ? "or similar" : ""}</p>
            <p><strong>Category:</strong> ${escapeHtml(str(h.starCategory, "—"))} Star</p>
            ${h.rating ? `<p><strong>Rating:</strong> ${escapeHtml(str(h.rating))} on Google</p>` : ""}
            ${h.address ? `<p><strong>Address:</strong> ${escapeHtml(str(h.address))}</p>` : ""}
            <p><strong>Room:</strong> ${escapeHtml(str(h.roomType, "Standard"))} · ${escapeHtml(str(h.mealPlan, "Breakfast"))}</p>
            <p><strong>Duration:</strong> ${escapeHtml(str(h.nights, "—"))} night(s). Subject to availability at the time of booking.</p>
          </div>
        </div>
        <footer class="foot"><span>${footBrand}</span><span>${escapeHtml(code)}</span></footer>
      </section>`,
    )
    .join("");

  const inc = inclusions.map((i) => `<li>${escapeHtml(i)}</li>`).join("") || "<li>As discussed</li>";
  const exc = exclusions.map((i) => `<li>${escapeHtml(i)}</li>`).join("") || "<li>Personal expenses</li>";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(quote.quoteNo)} — ${escapeHtml(dest)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Georgia, serif; color: #1a1a1a; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 16mm 16mm 22mm; page-break-after: always; position: relative; overflow: hidden; }
    .cover { background: #0a1628; color: #f7f3ea; display: flex; flex-direction: column; justify-content: space-between; ${coverBg} }
    .cover .legal { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; opacity: .85; }
    .cover .addr { font-size: 11px; color: #c4b8a4; margin-top: 8px; line-height: 1.5; }
    .greet { font-size: 13px; letter-spacing: .35em; text-transform: uppercase; color: #c4a574; margin: 40px 0 8px; }
    .brand { font-size: 42px; font-weight: 700; letter-spacing: .12em; margin: 0; color: #fff; }
    .dear { margin-top: 36px; font-size: 15px; line-height: 1.6; max-width: 150mm; }
    .kicker { font-size: 11px; letter-spacing: .28em; text-transform: uppercase; color: #0d7377; margin: 0 0 6px; }
    h1, h2 { font-family: Georgia, serif; color: #0a1628; margin: 0 0 12px; }
    h2 { font-size: 22px; }
    h3 { font-size: 15px; margin: 0 0 6px; color: #0a1628; }
    table.kv { width: 100%; border-collapse: collapse; margin-top: 10px; }
    table.kv th { width: 32%; text-align: left; padding: 9px 10px; background: #0a1628; color: #f7f3ea; font-size: 11px; letter-spacing: .04em; vertical-align: top; }
    table.kv td { padding: 9px 12px; background: #f4f1ea; font-size: 13px; }
    .note { margin-top: 18px; font-size: 12px; color: #444; }
    .note li { margin-bottom: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
    .card { border: 1px solid #e6dfd2; padding: 0 0 14px; background: #fbfaf6; min-height: 90px; overflow: hidden; }
    .card h3, .card p { padding: 0 14px; }
    .card h3 { margin-top: 12px; }
    .card p { font-size: 12px; line-height: 1.45; margin: 0; color: #333; }
    .card-photo { width: 100%; height: 42mm; object-fit: cover; display: block; }
    .hero { height: 110mm; background: #0a1628; color: #fff; display: flex; align-items: flex-end; padding: 16mm; margin: -16mm -16mm 12mm; background-size: cover; background-position: center; }
    .hero h2 { color: #fff; font-size: 36px; margin: 0; }
    .hero p { margin: 8px 0 0; max-width: 150mm; font-size: 13px; color: #e8e0d0; }
    .day { border-left: 3px solid #0d7377; padding: 0 0 14px 14px; margin-bottom: 8px; }
    .day ul { margin: 6px 0; padding-left: 16px; font-size: 13px; }
    .day-photo { width: 100%; max-height: 48mm; object-fit: cover; border-radius: 8px; margin: 6px 0 8px; display: block; }
    .gallery { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 8px; }
    .gallery-img { width: 32%; height: 28mm; object-fit: cover; border-radius: 6px; }
    .meals { font-size: 12px; color: #0d7377; font-weight: 600; }
    .muted { color: #64748b; font-size: 12px; margin: 0 0 6px; }
    table.data { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
    table.data th { background: #0a1628; color: #fff; padding: 8px; text-align: left; }
    table.data td { border-bottom: 1px solid #e6dfd2; padding: 8px; }
    .hotel p { margin: 6px 0; font-size: 13px; }
    .hotel-layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; align-items: start; }
    .hotel-photo { width: 100%; height: 70mm; object-fit: cover; border-radius: 10px; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .split ul { font-size: 12px; padding-left: 18px; }
    .foot { position: absolute; left: 16mm; right: 16mm; bottom: 10mm; display: flex; justify-content: space-between; font-size: 10px; color: #7a7164; border-top: 1px solid #e6dfd2; padding-top: 6px; }
    .cover .foot { color: #c4b8a4; border-color: #2a3b52; }
    .end { background: #0a1628; color: #c4a574; display: flex; align-items: center; justify-content: center; text-align: center; ${coverBg} }
    .end h2 { color: #f7f3ea; letter-spacing: .2em; font-size: 18px; }
    .watermark { position: absolute; right: 12mm; top: 40%; width: 42mm; opacity: .08; pointer-events: none; }
  </style>
</head>
<body>
  <section class="page cover">
    <div>
      <img src="${escapeHtml(logo)}" alt="${escapeHtml(brandName)}" style="height:48px;background:#fff;padding:6px 10px;border-radius:4px" />
      <p class="legal" style="margin-top:16px">${escapeHtml(COMPANY.legal)}</p>
      <p class="addr">${escapeHtml(COMPANY.address)}<br/>| ${escapeHtml(COMPANY.phone)} |</p>
    </div>
    <div>
      <p class="greet">Greetings from</p>
      <p class="brand">${escapeHtml(brandName.toUpperCase())}</p>
      <p class="dear">Dear ${escapeHtml(quote.customerName || "Sir/Ma'am")},<br/><br/>
      Please find your travel quotation <strong>${escapeHtml(quote.quoteNo)}</strong> for ${escapeHtml(dest)}.
      ${quote.nights ? `This plan is designed as a ${escapeHtml(nightsLabel(quote, pkg))} holiday.` : ""}</p>
    </div>
    <footer class="foot"><span>${new Date(quote.quoteDate || quote.createdAt).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span><span>${escapeHtml(quote.quoteNo)}</span></footer>
  </section>

  <section class="page">
    ${watermark}
    <p class="kicker">Overview</p>
    <h2>${escapeHtml(dest)}</h2>
    <table class="kv">
      <tr><th>Destination</th><td>${escapeHtml(dest)} : ${escapeHtml(nightsLabel(quote, pkg))}</td></tr>
      <tr><th>Dates</th><td>${escapeHtml(formatDates(quote))}</td></tr>
      <tr><th>Property (or similar)</th><td>${escapeHtml(hotelLine)}</td></tr>
      <tr><th>Room type</th><td>${escapeHtml(roomTypes)}</td></tr>
      <tr><th>Land cost</th><td>${escapeHtml(money(landSell, currency))}${pax > 1 ? ` for ${pax} travellers` : ""}</td></tr>
      ${flightSell ? `<tr><th>Flight cost</th><td>${escapeHtml(money(flightSell, currency))} (tentative)</td></tr>` : ""}
      <tr><th>Total</th><td><strong>${escapeHtml(money(Number(quote.total || 0), currency))} · ${escapeHtml(money(perPax, currency))} per pax</strong></td></tr>
    </table>
    <div class="note">
      <p><strong>Note</strong></p>
      <ul>
        <li>Above quote is not blocked or booked. It is strictly subject to availability.</li>
        <li>Includes GST ${escapeHtml(String(quote.taxRate ?? 18))}% on our service charges (tax-inclusive split).</li>
        <li>The above quote is as per twin/double sharing unless stated otherwise.</li>
        <li>Valid until ${escapeHtml(new Date(quote.validTill).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))}.</li>
      </ul>
      ${quote.specialRequests ? `<p>${escapeHtml(quote.specialRequests)}</p>` : ""}
    </div>
    <footer class="foot"><span>${footBrand}</span><span>${escapeHtml(code)}</span></footer>
  </section>

  ${highlightCards ? `
  <section class="page">
    ${watermark}
    <p class="kicker">Highlights</p>
    <h2>Experiences included</h2>
    <div class="grid">${highlightCards}</div>
    <footer class="foot"><span>${footBrand}</span><span>${escapeHtml(code)}</span></footer>
  </section>` : ""}

  ${quote.destination ? `
  <section class="page">
    ${watermark}
    <div class="hero"${isImgUrl(coverSrc) ? ` style="background-image:linear-gradient(180deg,rgba(10,22,40,.15),rgba(10,22,40,.78)),url('${escapeHtml(coverSrc)}');"` : ""}>
      <div>
        <p class="kicker" style="color:#c4a574">${escapeHtml(quote.country || "Destination")}</p>
        <h2>${escapeHtml(quote.destination)}</h2>
        <p>A curated ${escapeHtml(nightsLabel(quote, pkg))} plan for ${escapeHtml(quote.customerName)} — hotels, sightseeing and transfers as listed in this quotation.</p>
      </div>
    </div>
    <footer class="foot"><span>${footBrand}</span><span>${escapeHtml(code)}</span></footer>
  </section>` : ""}

  ${itineraryHtml ? `
  <section class="page">
    ${watermark}
    <p class="kicker">Itinerary</p>
    <h2>Day-wise plan</h2>
    <p class="muted">Tentative: flow can interchange based on weather and operational feasibility.</p>
    ${itineraryHtml}
    <footer class="foot"><span>${footBrand}</span><span>${escapeHtml(code)}</span></footer>
  </section>` : ""}

  ${flights.length ? `
  <section class="page">
    ${watermark}
    <p class="kicker">Airlines</p>
    <h2>Flight itinerary</h2>
    <table class="data">
      <thead><tr><th>Sector</th><th>Date</th><th>Carrier</th><th>Time</th></tr></thead>
      <tbody>${flightRows}</tbody>
    </table>
    <div class="note">
      <p><strong>Airline notes</strong></p>
      <ul>
        <li>Cancellation policy as per the airline.</li>
        <li>Fares are subject to availability and are guaranteed only at ticket issuance.</li>
        <li>Baggage typically includes check-in and 7 kg hand baggage unless the carrier specifies otherwise.</li>
        <li>Advise us in advance for special meals.</li>
      </ul>
    </div>
    <footer class="foot"><span>${footBrand}</span><span>${escapeHtml(code)}</span></footer>
  </section>` : ""}

  ${hotelPages}

  <section class="page">
    ${watermark}
    <p class="kicker">Inclusions &amp; exclusions</p>
    <h2>What is included</h2>
    <div class="split">
      <div>
        <h3>Inclusions</h3>
        <ul>${inc}</ul>
      </div>
      <div>
        <h3>Exclusions</h3>
        <ul>${exc}</ul>
      </div>
    </div>
    ${transfers.length ? `<p class="muted" style="margin-top:16px">Transfers: ${escapeHtml(transfers.map((t) => str(t.transferType || t.vehicleType)).join(", "))}</p>` : ""}
    <footer class="foot"><span>${footBrand}</span><span>${escapeHtml(code)}</span></footer>
  </section>

  <section class="page">
    ${watermark}
    <p class="kicker">Payment process</p>
    <h2>How to confirm</h2>
    <p>${escapeHtml(quote.paymentTerms || "50% advance to confirm. Balance before travel.")}</p>
    <p style="margin-top:16px"><strong>Cancellation</strong><br/>${escapeHtml(quote.cancellationPolicy || "As per supplier policy.")}</p>
    ${quote.refundPolicy ? `<p style="margin-top:12px"><strong>Refunds</strong><br/>${escapeHtml(quote.refundPolicy)}</p>` : ""}
    <div class="note">
      <p><strong>Important for the traveller</strong></p>
      <ul>
        <li>PAN is required to confirm the booking as per RBI guidelines.</li>
        <li>No refund for unused nights or early check-out, except as per hotel policy in medical cases.</li>
        <li>Early check-in is subject to availability unless pre-blocked.</li>
        <li>Names must match the passport. Visa and transit visa are the passenger's responsibility.</li>
        <li>Passport should have at least 6 months validity after the return journey.</li>
      </ul>
      ${quote.termsAndConditions ? `<p>${escapeHtml(quote.termsAndConditions)}</p>` : ""}
    </div>
    <p class="muted">Prepared by ${escapeHtml(quote.salesExecutiveName || quote.createdBy)}. Contact: ${escapeHtml(quote.salesExecutivePhone || quote.contactPhone || COMPANY.phone)}.</p>
    <footer class="foot"><span>${footBrand}</span><span>${escapeHtml(code)}</span></footer>
  </section>

  <section class="page end">
    <div>
      <p class="greet">Thank you</p>
      <h2>GLOBAL IMMERSION EXPERIENCES</h2>
      <p style="margin-top:16px;color:#c4b8a4">${escapeHtml(COMPANY.legal)}</p>
    </div>
  </section>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  return openPrint(html, `${quote.quoteNo} — ${dest}`);
}
