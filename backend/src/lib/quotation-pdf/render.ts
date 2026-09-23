import PDFDocument from "pdfkit";
import { loadImageBuffer } from "../proposal-pdf/images.js";
import { pdfMoney, pdfSafeText } from "../pdf-text.js";
import type { QuotationPdfModel, QuotationPdfPackage } from "./model.js";

const MARGIN = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const NAVY: [number, number, number] = [10, 22, 40];
const TEAL: [number, number, number] = [13, 115, 119];
const CREAM: [number, number, number] = [244, 241, 234];
const GOLD: [number, number, number] = [196, 165, 116];

function money(amount: number, currency: string): string {
  return pdfMoney(amount, currency);
}

function contentWidth(): number {
  return PAGE_W - MARGIN * 2;
}

function ensure(doc: PDFKit.PDFDocument, needed: number, onNewPage: () => void) {
  if (doc.y + needed > PAGE_H - 56) {
    onNewPage();
  }
}

function footer(doc: PDFKit.PDFDocument, model: QuotationPdfModel, page: number) {
  // Draw inside the bottom margin so PDFKit does not auto-insert another page.
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const y = PAGE_H - 36;
  const savedY = doc.y;
  doc.save();
  doc.moveTo(MARGIN, y - 8).lineTo(PAGE_W - MARGIN, y - 8).strokeColor("#e6dfd2").lineWidth(0.5).stroke();
  doc.fillColor("#7a7164").font("Helvetica").fontSize(8);
  doc.text(model.branding.footerText || model.branding.brandName, MARGIN, y, { width: contentWidth() * 0.65, lineBreak: false });
  doc.text(`${model.quoteNo} · ${page}`, MARGIN + contentWidth() * 0.65, y, { width: contentWidth() * 0.35, align: "right", lineBreak: false });
  doc.restore();
  doc.y = savedY;
  doc.page.margins.bottom = prevBottom;
}

function kicker(doc: PDFKit.PDFDocument, text: string) {
  doc.x = MARGIN;
  doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(9).text(text.toUpperCase(), { characterSpacing: 1.5, width: contentWidth() });
  doc.moveDown(0.3);
}

function heading(doc: PDFKit.PDFDocument, text: string) {
  doc.x = MARGIN;
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(18).text(text, { width: contentWidth() });
  doc.moveDown(0.4);
}

function body(doc: PDFKit.PDFDocument, text: string, opts: PDFKit.Mixins.TextOptions = {}) {
  doc.x = MARGIN;
  doc.fillColor("#1a1a1a").font("Helvetica").fontSize(10).text(pdfSafeText(text), { width: contentWidth(), ...opts });
}

function kvTable(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, onNewPage: () => void) {
  const labelW = 140;
  const valueW = contentWidth() - labelW;
  for (const [label, value] of rows) {
    ensure(doc, 28, onNewPage);
    const y = doc.y;
    doc.rect(MARGIN, y, labelW, 22).fill(NAVY);
    doc.rect(MARGIN + labelW, y, valueW, 22).fill(CREAM);
    doc.fillColor("#f7f3ea").font("Helvetica-Bold").fontSize(8).text(label, MARGIN + 8, y + 7, { width: labelW - 12, lineBreak: false });
    doc.fillColor("#1a1a1a").font("Helvetica").fontSize(9).text(value, MARGIN + labelW + 8, y + 7, { width: valueW - 12, lineBreak: false });
    doc.y = y + 24;
  }
  doc.moveDown(0.4);
}

async function drawImage(doc: PDFKit.PDFDocument, src: string | undefined, x: number, y: number, w: number, h: number) {
  if (!src) return false;
  const buf = await loadImageBuffer(src);
  if (!buf) return false;
  try {
    doc.image(buf, x, y, { fit: [w, h], align: "center", valign: "center" });
    return true;
  } catch {
    return false;
  }
}

function packagePricing(doc: PDFKit.PDFDocument, pkg: QuotationPdfPackage, onNewPage: () => void) {
  ensure(doc, 90, onNewPage);
  kicker(doc, "Rate breakdown");
  heading(doc, `${pkg.name} — Price summary`);
  const rows: Array<[string, string]> = [
    ["Per Adult Price", money(pkg.pricing.perAdultPrice, pkg.pricing.currency)],
  ];
  if (pkg.pricing.perChildPrice > 0) rows.push(["Per Child Price", money(pkg.pricing.perChildPrice, pkg.pricing.currency)]);
  rows.push(["Package Price (Base)", money(pkg.pricing.packageBase, pkg.pricing.currency)]);
  if (pkg.pricing.taxConfigured && pkg.pricing.taxAmount != null) {
    rows.push([`Applicable tax${pkg.pricing.taxRate != null ? ` (${pkg.pricing.taxRate}%)` : ""}`, money(pkg.pricing.taxAmount, pkg.pricing.currency)]);
  } else {
    rows.push(["Tax configuration required", "—"]);
  }
  rows.push(["Total Price", money(pkg.pricing.finalPrice, pkg.pricing.currency)]);
  kvTable(doc, rows, onNewPage);
}

async function renderCover(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  if (model.coverImage) {
    const buf = await loadImageBuffer(model.coverImage);
    if (buf) {
      try {
        doc.image(buf, 0, 0, { cover: [PAGE_W, PAGE_H] });
        doc.rect(0, 0, PAGE_W, PAGE_H).fillOpacity(0.55).fill(NAVY).fillOpacity(1);
      } catch {
        doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
      }
    } else {
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
    }
  } else {
    doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
  }

  if (model.branding.logo) {
    await drawImage(doc, model.branding.logo, MARGIN, MARGIN, 120, 48);
  }
  doc.fillColor("#c4b8a4").font("Helvetica").fontSize(8).text(model.branding.legalName, MARGIN, MARGIN + 60, { width: contentWidth(), lineBreak: false });
  if (model.branding.address || model.branding.phone) {
    doc.text([model.branding.address, model.branding.phone].filter(Boolean).join("  |  "), MARGIN, MARGIN + 74, { width: contentWidth(), lineBreak: false });
  }
  doc.fillColor(GOLD).font("Helvetica").fontSize(11).text("GREETINGS FROM", MARGIN, 280, { characterSpacing: 3, lineBreak: false });
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(34).text(model.branding.brandName.toUpperCase(), MARGIN, 300, { width: contentWidth() });
  doc.fillColor("#f7f3ea").font("Helvetica").fontSize(12).text(
    `Dear ${model.customerName},\n\nPlease find your travel quotation ${model.quoteNo} for ${model.destination}. This plan is designed as a ${model.nightsLabel} holiday.`,
    MARGIN,
    360,
    { width: contentWidth() * 0.85, lineGap: 4 },
  );
  doc.fillColor("#c4b8a4").font("Helvetica").fontSize(8).text(model.travelDates, MARGIN, PAGE_H - 48, { lineBreak: false });
  doc.text(model.quoteNo, MARGIN, PAGE_H - 48, { width: contentWidth(), align: "right", lineBreak: false });
  doc.page.margins.bottom = prevBottom;
  doc.y = MARGIN;
}

export async function renderQuotationPdf(model: QuotationPdfModel): Promise<{ buffer: Buffer; pageCount: number }> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: 56, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    info: { Title: `${model.quoteNo} — ${model.destination}`, Author: model.branding.brandName },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  let pageCount = 1;
  doc.on("pageAdded", () => {
    pageCount += 1;
    footer(doc, model, pageCount);
    doc.x = MARGIN;
    doc.y = MARGIN + 8;
  });
  const onNewPage = () => {
    doc.addPage();
  };

  await renderCover(doc, model);

  doc.addPage();
  doc.x = MARGIN;
  doc.y = MARGIN;
  kicker(doc, "Overview");
  heading(doc, model.destination);
  kvTable(doc, [
    ["Destination", `${model.destination} : ${model.nightsLabel}`],
    ["Dates", model.travelDates],
    ["Travellers", `${model.adults} adult(s)${model.children ? `, ${model.children} child(ren)` : ""}${model.infants ? `, ${model.infants} infant(s)` : ""}`],
    ["Customer", model.customerName],
    ...(model.validTill ? [["Valid until", new Date(model.validTill).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })] as [string, string]] : []),
  ], onNewPage);
  if (model.specialRequests) {
    ensure(doc, 40, onNewPage);
    body(doc, model.specialRequests, { width: contentWidth() });
  }

  for (let i = 0; i < model.packages.length; i += 1) {
    const pkg = model.packages[i];
    doc.addPage();
    doc.x = MARGIN;
    doc.y = MARGIN;
    kicker(doc, model.packages.length > 1 ? `Package ${i + 1}` : "Package");
    heading(doc, pkg.name);
    if (pkg.description) body(doc, pkg.description, { width: contentWidth() });
    doc.moveDown(0.4);
    packagePricing(doc, pkg, onNewPage);

    if (pkg.activities.length) {
      ensure(doc, 40, onNewPage);
      kicker(doc, "Highlights");
      for (const activity of pkg.activities.slice(0, 8)) {
        ensure(doc, 36, onNewPage);
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text(activity.activityName || "Experience");
        const meta = [
          activity.city,
          activity.date,
          activity.duration,
          activity.timeSlot,
          activity.paxLabel,
          activity.ticketType,
          activity.sellingPrice != null
            ? `${activity.currency || "INR"} ${Math.round(activity.sellingPrice).toLocaleString("en-IN")}`
            : "",
        ].filter(Boolean).join(" · ");
        if (meta) body(doc, meta, { width: contentWidth() });
        if (activity.description) body(doc, activity.description, { width: contentWidth() });
        doc.moveDown(0.25);
      }
    }

    if (pkg.itinerary.length) {
      ensure(doc, 80, onNewPage);
      kicker(doc, "Itinerary");
      heading(doc, "Day-wise plan");
      body(doc, "Tentative: flow can interchange based on weather and operational feasibility.");
      doc.moveDown(0.4);
      for (const day of pkg.itinerary) {
        ensure(doc, 50, onNewPage);
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(12).text(day.title || `Day ${day.day}`);
        if (day.city || day.date) {
          body(doc, [day.city, day.date].filter(Boolean).join(" · "));
        }
        const places = Array.isArray(day.places) ? day.places : [];
        for (const place of places) {
          if (!place?.name) continue;
          body(doc, `• ${place.name}`, { width: contentWidth() });
          if (place.bestTimeToVisit) body(doc, `  Best time: ${place.bestTimeToVisit}`, { width: contentWidth() });
          if (place.famousFor) body(doc, `  Famous for: ${place.famousFor}`, { width: contentWidth() });
          if (place.description) body(doc, `  ${place.description}`, { width: contentWidth() });
        }
        for (const item of day.items) {
          const prefix = item.itemType ? `[${String(item.itemType).charAt(0)}${String(item.itemType).slice(1).toLowerCase()}] ` : "";
          const time = item.pickupTime ? `${item.pickupTime} · ` : "";
          const line = [item.activityName, item.description].filter(Boolean).join(" — ");
          if (line) body(doc, `• ${prefix}${time}${line}`, { width: contentWidth() });
        }
        if (day.mealPlan) {
          doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(9).text(`Meal plan: ${day.mealPlan}`);
        }
        doc.moveDown(0.35);
      }
    }

    if (pkg.hotels.length) {
      for (const hotel of pkg.hotels) {
        ensure(doc, 120, onNewPage);
        kicker(doc, "Accommodation");
        heading(doc, hotel.city || hotel.hotelName);
        if (hotel.imageUrl) {
          const drawn = await drawImage(doc, hotel.imageUrl, MARGIN, doc.y, contentWidth(), 160);
          if (drawn) doc.y += 170;
        }
        const hotelRows: Array<[string, string]> = [
          ["Property", hotel.hotelName],
        ];
        if (hotel.selfBooked) hotelRows.push(["Booking", "Self-booked by customer / agent"]);
        if (hotel.starCategory) hotelRows.push(["Category", `${hotel.starCategory} Star`]);
        if (hotel.address) hotelRows.push(["Address", hotel.address]);
        hotelRows.push(["Room", [hotel.roomType || "Standard", hotel.mealPlan || "Breakfast"].join(" · ")]);
        if (hotel.checkIn || hotel.checkOut) hotelRows.push(["Stay", [hotel.checkIn, hotel.checkOut].filter(Boolean).join(" to ")]);
        if (hotel.nights != null) hotelRows.push(["Nights", String(hotel.nights)]);
        if (hotel.cancellationPolicy) hotelRows.push(["Cancellation", hotel.cancellationPolicy]);
        kvTable(doc, hotelRows, onNewPage);
      }
    }

    if (pkg.flights.length) {
      ensure(doc, 80, onNewPage);
      kicker(doc, "Airlines");
      heading(doc, "Flight itinerary");
      for (const flight of pkg.flights) {
        ensure(doc, 36, onNewPage);
        const sector = [flight.from, flight.to].filter(Boolean).join(" to ") || "Sector as discussed";
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text(sector);
        const dates = [flight.date, flight.arrivalDate && flight.arrivalDate !== flight.date ? `arr ${flight.arrivalDate}` : ""]
          .filter(Boolean)
          .join(" · ");
        const priceBit = flight.sellingPrice != null
          ? `${flight.currency || "INR"} ${Math.round(flight.sellingPrice).toLocaleString("en-IN")}`
          : "";
        body(doc, [
          flight.airline,
          flight.flightNo,
          dates,
          [flight.depTime, flight.arrTime].filter(Boolean).join(" – "),
          flight.cabin,
          flight.baggage,
          flight.duration,
          flight.stops != null ? `${flight.stops} stop${flight.stops === 1 ? "" : "s"}` : "",
          priceBit,
        ].filter(Boolean).join(" · "), { width: contentWidth() });
        doc.moveDown(0.25);
      }
      if (model.flightTerms) {
        ensure(doc, 40, onNewPage);
        body(doc, model.flightTerms, { width: contentWidth() });
      }
    }

    if (pkg.transfers.length) {
      ensure(doc, 60, onNewPage);
      kicker(doc, "Transfers");
      heading(doc, "Ground transfers");
      for (const transfer of pkg.transfers) {
        ensure(doc, 28, onNewPage);
        const route = transfer.route
          || (transfer.pickup && transfer.drop ? `${transfer.pickup} → ${transfer.drop}` : "")
          || transfer.pickup
          || transfer.drop
          || "";
        body(doc, [
          transfer.transferType,
          route,
          transfer.date,
          transfer.pickupTime,
          transfer.vehicleType,
          transfer.duration,
          transfer.pax != null ? `${transfer.pax} pax` : "",
          transfer.remarks,
          transfer.sellingPrice != null
            ? `${transfer.currency || "INR"} ${Math.round(transfer.sellingPrice).toLocaleString("en-IN")}`
            : "",
          transfer.description,
        ].filter(Boolean).join(" · "), { width: contentWidth() });
      }
    }

    if (pkg.meals.length) {
      ensure(doc, 50, onNewPage);
      kicker(doc, "Meals");
      heading(doc, "Meal arrangements");
      for (const meal of pkg.meals) {
        ensure(doc, 28, onNewPage);
        body(doc, [
          meal.mealType,
          meal.city,
          meal.date,
          meal.time,
          meal.restaurant,
          meal.location,
          meal.duration,
          meal.paxLabel,
          meal.remarks,
          meal.voucher ? `Ref ${meal.voucher}` : "",
          meal.sellingPrice != null
            ? `${meal.currency || "INR"} ${Math.round(meal.sellingPrice).toLocaleString("en-IN")}`
            : "",
          meal.description,
        ].filter(Boolean).join(" · "), { width: contentWidth() });
      }
    }

    if (pkg.visa?.enabled) {
      ensure(doc, 80, onNewPage);
      kicker(doc, "Visa");
      heading(doc, "Visa services");
      const visaRows: Array<[string, string]> = [];
      if (pkg.visa.visaType) visaRows.push(["Visa type", pkg.visa.visaType]);
      if (pkg.visa.entryType) visaRows.push(["Entry", pkg.visa.entryType]);
      if (pkg.visa.processingTime) visaRows.push(["Processing time", pkg.visa.processingTime]);
      if (pkg.visa.feeLabel) visaRows.push(["Visa fee", pkg.visa.feeLabel]);
      if (pkg.visa.appointmentRequired) {
        visaRows.push(["Appointment", pkg.visa.appointmentNote || "Required"]);
      }
      if (pkg.visa.documentsRequired) visaRows.push(["Required documents", pkg.visa.documentsRequired]);
      if (pkg.visa.notes) visaRows.push(["Notes", pkg.visa.notes]);
      if (visaRows.length) kvTable(doc, visaRows, onNewPage);
      else body(doc, "Visa assistance included as discussed.", { width: contentWidth() });
    }

    if (pkg.insurance?.enabled) {
      ensure(doc, 80, onNewPage);
      kicker(doc, "Insurance");
      heading(doc, "Travel insurance");
      const insRows: Array<[string, string]> = [];
      if (pkg.insurance.provider) insRows.push(["Provider", pkg.insurance.provider]);
      if (pkg.insurance.planName) insRows.push(["Plan", pkg.insurance.planName]);
      if (pkg.insurance.coverage) insRows.push(["Coverage", pkg.insurance.coverage]);
      if (pkg.insurance.validity) insRows.push(["Validity", pkg.insurance.validity]);
      if (pkg.insurance.policyNumber) insRows.push(["Policy number", pkg.insurance.policyNumber]);
      if (pkg.insurance.premiumLabel) insRows.push(["Premium", pkg.insurance.premiumLabel]);
      if (pkg.insurance.notes) insRows.push(["Notes", pkg.insurance.notes]);
      if (insRows.length) kvTable(doc, insRows, onNewPage);
      else body(doc, "Travel insurance included as discussed.", { width: contentWidth() });
    }

    if (pkg.inclusions.length || pkg.exclusions.length) {
      ensure(doc, 100, onNewPage);
      kicker(doc, "Inclusions & exclusions");
      heading(doc, "What is included");
      const mid = MARGIN + contentWidth() / 2 + 8;
      const top = doc.y;
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("Inclusions", MARGIN, top);
      doc.text("Exclusions", mid, top);
      doc.y = top + 18;
      const leftItems = pkg.inclusions.length ? pkg.inclusions : ["As discussed"];
      const rightItems = pkg.exclusions.length ? pkg.exclusions : ["Personal expenses"];
      const max = Math.max(leftItems.length, rightItems.length);
      for (let idx = 0; idx < max; idx += 1) {
        ensure(doc, 16, onNewPage);
        const y = doc.y;
        if (leftItems[idx]) doc.fillColor("#1a1a1a").font("Helvetica").fontSize(9).text(`• ${leftItems[idx]}`, MARGIN, y, { width: contentWidth() / 2 - 12 });
        if (rightItems[idx]) doc.fillColor("#1a1a1a").font("Helvetica").fontSize(9).text(`• ${rightItems[idx]}`, mid, y, { width: contentWidth() / 2 - 12 });
        doc.y = y + 14;
      }
      doc.x = MARGIN;
    }
  }

  doc.addPage();
  doc.x = MARGIN;
  doc.y = MARGIN;
  kicker(doc, "Payment & terms");
  heading(doc, "How to confirm");
  body(doc, model.paymentTerms || "Payment terms as discussed with your travel advisor.", { width: contentWidth() });
  doc.moveDown(0.5);
  if (model.cancellationPolicy) {
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("Cancellation");
    body(doc, model.cancellationPolicy, { width: contentWidth() });
    doc.moveDown(0.35);
  }
  if (model.refundPolicy) {
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("Refunds");
    body(doc, model.refundPolicy, { width: contentWidth() });
    doc.moveDown(0.35);
  }
  const termBlocks: Array<[string, string | undefined]> = [
    ["Terms & conditions", model.termsAndConditions],
    ["Hotel terms", model.hotelTerms],
    ["Flight terms", model.flightTerms],
    ["Visa terms", model.visaTerms || model.visaNote],
    ["Insurance terms", model.insuranceTerms || model.insuranceNote],
    ["Force majeure", model.forceMajeure],
    ["Travel disclaimer", model.travelDisclaimer],
  ];
  for (const [title, text] of termBlocks) {
    if (!text) continue;
    ensure(doc, 40, onNewPage);
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text(title);
    body(doc, text, { width: contentWidth() });
    doc.moveDown(0.35);
  }
  if (model.salesContact) {
    ensure(doc, 20, onNewPage);
    body(doc, `Prepared by ${model.salesContact}`, { width: contentWidth() });
  }

  doc.addPage();
  {
    const prevBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    if (model.coverImage) {
      const buf = await loadImageBuffer(model.coverImage);
      if (buf) {
        try {
          doc.image(buf, 0, 0, { cover: [PAGE_W, PAGE_H] });
          doc.rect(0, 0, PAGE_W, PAGE_H).fillOpacity(0.6).fill(NAVY).fillOpacity(1);
        } catch {
          doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
        }
      } else doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
    } else {
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
    }
    doc.fillColor(GOLD).font("Helvetica").fontSize(11).text("THANK YOU", MARGIN, 340, { align: "center", width: contentWidth(), characterSpacing: 3, lineBreak: false });
    doc.fillColor("#f7f3ea").font("Helvetica-Bold").fontSize(18).text("GLOBAL IMMERSION EXPERIENCES", MARGIN, 370, { align: "center", width: contentWidth(), characterSpacing: 2, lineBreak: false });
    doc.fillColor("#c4b8a4").font("Helvetica").fontSize(9).text(model.branding.legalName, MARGIN, 410, { align: "center", width: contentWidth(), lineBreak: false });
    if (model.branding.phone || model.branding.email) {
      doc.text([model.branding.phone, model.branding.email].filter(Boolean).join("  ·  "), MARGIN, 430, { align: "center", width: contentWidth(), lineBreak: false });
    }
    doc.page.margins.bottom = prevBottom;
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  return { buffer: Buffer.concat(chunks), pageCount };
}
