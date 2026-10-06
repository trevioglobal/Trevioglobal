import PDFDocument from "pdfkit";
import { loadImageBuffer } from "../proposal-pdf/images.js";
import { pdfMoney, pdfSafeText } from "../pdf-text.js";
import type { QuotationPdfModel, QuotationPdfPackage } from "./model.js";

const MARGIN = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_BOTTOM = 56;
const INK = "#111111";
const MUTED = "#555555";
const RULE = "#cfcfcf";
const SOFT = "#f4f4f4";

const FONT_REG = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const DISPLAY = "Times-Bold";
const DISPLAY_REG = "Times-Roman";

function money(amount: number, currency: string): string {
  return pdfMoney(amount, currency);
}

function contentWidth(): number {
  return PAGE_W - MARGIN * 2;
}

function ensure(doc: PDFKit.PDFDocument, needed: number, onNewPage: () => void) {
  if (doc.y + needed > PAGE_H - CONTENT_BOTTOM) onNewPage();
}

function pageNumber(doc: PDFKit.PDFDocument, n: number) {
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const savedY = doc.y;
  doc.save();
  doc.fillColor(INK).font(FONT_REG).fontSize(9)
    .text(String(n).padStart(2, "0"), MARGIN, PAGE_H - 36, {
      width: contentWidth(),
      align: "center",
      lineBreak: false,
    });
  doc.restore();
  doc.y = savedY;
  doc.page.margins.bottom = prevBottom;
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.x = MARGIN;
  doc.fillColor(INK).font(DISPLAY).fontSize(28)
    .text(pdfSafeText(text).toUpperCase(), MARGIN, doc.y, {
      width: contentWidth(),
      align: "center",
      characterSpacing: 1,
    });
  doc.moveDown(0.55);
}

function remainingSpace(doc: PDFKit.PDFDocument): number {
  return PAGE_H - CONTENT_BOTTOM - doc.y;
}

function measure(doc: PDFKit.PDFDocument, text: string, width: number, fontSize: number, font = FONT_REG): number {
  doc.font(font).fontSize(fontSize);
  return doc.heightOfString(pdfSafeText(text), { width });
}

/**
 * PDFKit `cover` scales the image larger than the box and does NOT clip.
 * Always clip to the destination rectangle so images never overlap text.
 */
async function drawImage(
  doc: PDFKit.PDFDocument,
  src: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: "fit" | "cover" = "cover",
): Promise<boolean> {
  if (!src) return false;
  const buf = await loadImageBuffer(src);
  if (!buf) return false;
  try {
    doc.save();
    doc.rect(x, y, w, h).clip();
    if (mode === "cover") {
      doc.image(buf, x, y, { cover: [w, h], align: "center", valign: "center" });
    } else {
      doc.image(buf, x, y, { fit: [w, h], align: "center", valign: "center" });
    }
    doc.restore();
    // PDFKit advances doc.y after image(); pin cursor below the intended box.
    doc.x = MARGIN;
    doc.y = y + h;
    return true;
  } catch {
    try { doc.restore(); } catch { /* ignore */ }
    return false;
  }
}

function softImagePlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  doc.save();
  doc.rect(x, y, w, h).fill(SOFT);
  doc.restore();
  doc.x = MARGIN;
  doc.y = y + h;
}

async function drawImageOrSoft(
  doc: PDFKit.PDFDocument,
  src: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  fallbacks: Array<string | undefined> = [],
): Promise<boolean> {
  const candidates = [src, ...fallbacks].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const ok = await drawImage(doc, candidate, x, y, w, h, "cover");
    if (ok) return true;
  }
  softImagePlaceholder(doc, x, y, w, h);
  return false;
}

function dayActivityLines(day: QuotationPdfPackage["itinerary"][number]): string[] {
  const lines: string[] = [];
  for (const place of day.places || []) {
    if (place?.name) lines.push(place.name);
  }
  for (const item of day.items || []) {
    const type = String(item.itemType || "").toUpperCase();
    // Hotel stays belong in Accommodation section — skip repetitive hotel card lines.
    if (type === "HOTEL" || type === "ACCOMMODATION") continue;
    const text = [item.activityName, item.description].filter(Boolean).join(" — ");
    if (text) lines.push(text);
  }
  return lines;
}

/**
 * Itinerary images must NOT default to hotel bedrooms.
 * Prefer day/activity/destination imagery only.
 * Hotel URLs auto-copied onto day.coverImage by the trip builder are ignored.
 */
function dayImage(
  day: QuotationPdfPackage["itinerary"][number],
  pkg: QuotationPdfPackage,
  model: QuotationPdfModel,
  dayIndex: number,
): string | undefined {
  const hotelUrls = new Set(
    pkg.hotels.map((h) => String(h.imageUrl || "").trim()).filter(Boolean),
  );
  const isHotelPhoto = (url?: string) => Boolean(url && hotelUrls.has(String(url).trim()));

  // Accept day cover only when it is not merely the hotel room photo.
  if (day.coverImage && !isHotelPhoto(day.coverImage)) return day.coverImage;

  const placeImg = day.places?.find((p) => p.imageUrl && !isHotelPhoto(p.imageUrl))?.imageUrl;
  if (placeImg) return placeImg;

  const dayDate = String(day.date || "").trim();
  const dayCity = String(day.city || "").trim().toLowerCase();
  const matchedActivity = pkg.activities.find((a) => {
    if (!a.imageUrl || isHotelPhoto(a.imageUrl)) return false;
    if (dayDate && a.date && String(a.date) === dayDate) return true;
    if (dayCity && a.city && String(a.city).toLowerCase() === dayCity) return true;
    return false;
  });
  if (matchedActivity?.imageUrl) return matchedActivity.imageUrl;

  // Destination pool only — never inherit hotel room from coverImage.
  const destPool = model.destinationImages || [];
  if (destPool.length) return destPool[dayIndex % destPool.length];
  return undefined;
}

function isReturnFlight(f: QuotationPdfPackage["flights"][number], index: number, all: QuotationPdfPackage["flights"]): boolean {
  const dir = String(f.direction || f.tripType || "").toLowerCase();
  if (dir.includes("return") || dir.includes("inbound")) return true;
  if (dir.includes("outbound") || dir.includes("one_way") || dir.includes("one-way")) return false;
  if (all.length >= 2 && index === all.length - 1) {
    const first = all[0];
    if (first.from && first.to && f.from && f.to && first.from === f.to && first.to === f.from) return true;
  }
  return false;
}

async function renderCover(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const fallbacks = [
    ...model.destinationImages,
    model.coverImage,
    model.closingImage,
    model.packages[0]?.activities.find((a) => a.imageUrl)?.imageUrl,
    model.packages[0]?.hotels.find((h) => h.imageUrl)?.imageUrl,
  ];
  let drawn = false;
  for (const src of fallbacks) {
    if (!src) continue;
    drawn = await drawImage(doc, src, 0, 0, PAGE_W, PAGE_H, "cover");
    if (drawn) break;
  }
  if (!drawn) doc.rect(0, 0, PAGE_W, PAGE_H).fill("#1a1a1a");
  else doc.rect(0, 0, PAGE_W, PAGE_H).fillOpacity(0.18).fill("#000000").fillOpacity(1);

  const agent = pdfSafeText(model.agentName).toUpperCase();
  doc.fillColor("#ffffff").font(DISPLAY_REG).fontSize(16)
    .text("GREETINGS FROM", MARGIN, PAGE_H * 0.42, {
      width: contentWidth(),
      align: "center",
      characterSpacing: 2,
      lineBreak: false,
    });
  doc.font(DISPLAY).fontSize(34)
    .text(agent, MARGIN, PAGE_H * 0.42 + 34, {
      width: contentWidth(),
      align: "center",
      characterSpacing: 1.5,
    });
  doc.page.margins.bottom = prevBottom;
  doc.y = MARGIN;
}

async function renderOverview(
  doc: PDFKit.PDFDocument,
  model: QuotationPdfModel,
  pkg: QuotationPdfPackage,
  onNewPage: () => void,
  markPage: () => void,
) {
  markPage();
  sectionTitle(doc, model.destinationName);

  // Prominent destination hero — content block, never background behind copy.
  const heroH = 250;
  const heroY = doc.y;
  await drawImageOrSoft(
    doc,
    model.destinationImages[0] || model.coverImage,
    MARGIN,
    heroY,
    contentWidth(),
    heroH,
    model.destinationImages.slice(1),
  );
  let y = heroY + heroH + 20;
  doc.x = MARGIN;
  doc.y = y;

  doc.fillColor(INK).font(FONT_REG).fontSize(10)
    .text(pdfSafeText(model.letterDate), MARGIN, y, { width: contentWidth() });
  y = doc.y + 8;

  doc.font(FONT_BOLD).fontSize(11)
    .text(`Dear ${pdfSafeText(model.customerName)},`, MARGIN, y, { width: contentWidth() });
  y = doc.y + 8;

  if (model.destinationDescription) {
    const desc = pdfSafeText(model.destinationDescription);
    const descH = measure(doc, desc, contentWidth(), 10, FONT_REG);
    if (y + descH > PAGE_H - CONTENT_BOTTOM) {
      onNewPage();
      markPage();
      y = doc.y;
    }
    doc.font(FONT_REG).fontSize(10).fillColor(MUTED)
      .text(desc, MARGIN, y, { width: contentWidth(), align: "justify", lineGap: 2 });
    y = doc.y + 14;
  }

  const rows: Array<[string, string, boolean?]> = [
    ["DESTINATION", model.destinationName.toUpperCase()],
    ["DATES", (model.travelDatesShort || model.travelDates).toUpperCase()],
    ["NO OF PAX", model.paxSummary.toUpperCase()],
  ];
  if (model.hotelSummary) rows.push(["HOTEL", model.hotelSummary]);
  if (model.landCostPerPerson != null) {
    rows.push(["LAND COST PER PERSON", money(model.landCostPerPerson, pkg.pricing.currency)]);
  }
  if (model.flightCostPerPerson != null) {
    rows.push(["FLIGHT COST PER PERSON", money(model.flightCostPerPerson, pkg.pricing.currency)]);
  }
  rows.push(["TOTAL PACKAGE COST", money(pkg.pricing.finalPrice || pkg.pricing.packageBase, pkg.pricing.currency), true]);

  const labelW = 170;
  const valueW = contentWidth() - labelW;
  for (const [label, value, emphasize] of rows) {
    const valueH = Math.max(26, measure(doc, value, valueW - 14, emphasize ? 11 : 9, emphasize ? FONT_BOLD : FONT_REG) + 12);
    if (y + valueH > PAGE_H - CONTENT_BOTTOM) {
      onNewPage();
      markPage();
      y = doc.y;
    }
    doc.save();
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.6).stroke();
    doc.moveTo(MARGIN + labelW, y).lineTo(MARGIN + labelW, y + valueH).stroke();
    doc.restore();
    doc.fillColor(INK).font(FONT_BOLD).fontSize(9)
      .text(label, MARGIN + 6, y + 8, { width: labelW - 12, lineBreak: false });
    doc.font(emphasize ? FONT_BOLD : FONT_REG).fontSize(emphasize ? 11 : 9)
      .text(pdfSafeText(value), MARGIN + labelW + 8, y + 7, { width: valueW - 14 });
    y += valueH;
  }
  doc.save();
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.6).stroke();
  doc.restore();
  y += 16;

  if (model.overviewNotes.length) {
    const noteBlockH = model.overviewNotes.reduce(
      (sum, note) => sum + measure(doc, `> ${note}`, contentWidth() - 70, 9) + 6,
      20,
    );
    if (y + Math.min(noteBlockH, 80) > PAGE_H - CONTENT_BOTTOM) {
      onNewPage();
      markPage();
      y = doc.y;
    }
    doc.fillColor(INK).font(FONT_BOLD).fontSize(10).text("NOTE", MARGIN, y, { width: 60, lineBreak: false });
    let noteY = y;
    for (const note of model.overviewNotes) {
      const h = measure(doc, `> ${note}`, contentWidth() - 70, 9);
      if (noteY + h > PAGE_H - CONTENT_BOTTOM) {
        onNewPage();
        markPage();
        noteY = doc.y;
        doc.fillColor(INK).font(FONT_BOLD).fontSize(10).text("NOTE", MARGIN, noteY, { width: 60, lineBreak: false });
      }
      doc.font(FONT_REG).fontSize(9).fillColor(MUTED)
        .text(`> ${pdfSafeText(note)}`, MARGIN + 70, noteY, { width: contentWidth() - 70 });
      noteY = doc.y + 4;
    }
    y = noteY;
  }
  doc.x = MARGIN;
  doc.y = y;
}

async function renderItinerary(
  doc: PDFKit.PDFDocument,
  model: QuotationPdfModel,
  pkg: QuotationPdfPackage,
  onNewPage: () => void,
  markPage: () => void,
) {
  if (!pkg.itinerary.length) return;
  onNewPage();
  markPage();
  sectionTitle(doc, "Itinerary");

  const imgW = 230;
  const gap = 18;
  const textW = contentWidth() - imgW - gap;
  const minImgH = 118;
  const maxImgH = 150;

  for (let dayIndex = 0; dayIndex < pkg.itinerary.length; dayIndex += 1) {
    const day = pkg.itinerary[dayIndex];
    const lines = dayActivityLines(day);
    const bodyLines = lines.length ? lines : ["Day at Leisure"];
    const rawTitle = String(day.title || day.city || "JOURNEY");
    const cleanedTitle = rawTitle.replace(/^day\s*\d+\s*[:\-—–]?\s*/i, "").trim() || rawTitle;
    const title = `DAY ${day.day}: ${cleanedTitle.toUpperCase()}`;

    const titleH = Math.max(28, measure(doc, title, textW - 16, 10, FONT_BOLD) + 14);
    let textH = titleH + 10;
    for (const line of bodyLines) {
      textH += measure(doc, `- ${line}`, textW, 9) + 4;
    }
    if (day.mealPlan) {
      textH += measure(doc, `Meal Plan: ${day.mealPlan}`, textW, 9, FONT_BOLD) + 8;
    }
    // Keep leisure days compact — image storytelling without oversized empty boxes.
    const rowH = Math.min(maxImgH, Math.max(minImgH, textH));
    const blockH = rowH + 16;

    // Keep each day as one block — page-break before the day if it won't fit.
    if (remainingSpace(doc) < blockH) {
      onNewPage();
      markPage();
      sectionTitle(doc, "Itinerary");
    }

    const y = doc.y;
    const boxX = MARGIN + imgW + gap;

    await drawImageOrSoft(
      doc,
      dayImage(day, pkg, model, dayIndex),
      MARGIN,
      y,
      imgW,
      rowH,
      model.destinationImages,
    );

    // Right column — never inside the left image bounds.
    doc.save();
    doc.rect(boxX, y, textW, titleH).strokeColor(INK).lineWidth(0.9).stroke();
    doc.restore();
    doc.fillColor(INK).font(FONT_BOLD).fontSize(10)
      .text(pdfSafeText(title), boxX + 8, y + 7, { width: textW - 16 });

    let ty = y + titleH + 10;
    for (const line of bodyLines) {
      doc.font(FONT_REG).fontSize(9).fillColor(INK)
        .text(`- ${pdfSafeText(line)}`, boxX, ty, { width: textW });
      ty = doc.y + 3;
    }
    if (day.mealPlan) {
      ty += 4;
      doc.font(FONT_BOLD).fontSize(9).fillColor(INK)
        .text("Meal Plan: ", boxX, ty, { continued: true, width: textW });
      doc.font(FONT_REG).text(pdfSafeText(day.mealPlan));
      ty = doc.y;
    }

    doc.x = MARGIN;
    doc.y = Math.max(y + rowH, ty) + 16;
  }
}

async function renderFlights(
  doc: PDFKit.PDFDocument,
  model: QuotationPdfModel,
  pkg: QuotationPdfPackage,
  onNewPage: () => void,
  markPage: () => void,
) {
  if (!pkg.flights.length) return;
  onNewPage();
  markPage();
  sectionTitle(doc, "Airline");

  const heroH = 180;
  const heroY = doc.y;
  await drawImageOrSoft(doc, model.destinationImages[0] || model.coverImage, MARGIN, heroY, contentWidth(), heroH, model.destinationImages);
  let y = heroY + heroH + 14;
  doc.fillColor(INK).font(FONT_BOLD).fontSize(12)
    .text("Flight Details Below", MARGIN, y, { underline: true, width: contentWidth() });
  y = doc.y + 12;
  doc.y = y;

  for (let index = 0; index < pkg.flights.length; index += 1) {
    const flight = pkg.flights[index];
    const returning = isReturnFlight(flight, index, pkg.flights);
    const sector = pdfSafeText([flight.from, flight.to].filter(Boolean).join(" -> ") || "Sector as discussed");
    if (remainingSpace(doc) < 120) {
      onNewPage();
      markPage();
    }

    if (returning || index > 0) {
      const barY = doc.y;
      doc.rect(MARGIN, barY, contentWidth(), 22).fill("#ececec");
      doc.fillColor(INK).font(FONT_BOLD).fontSize(9)
        .text(
          pdfSafeText(`${returning ? "RETURN" : "OUTBOUND"}  ${sector}${flight.date ? `  ·  ${flight.date}` : ""}${flight.duration ? `  ·  ${flight.duration}` : ""}`),
          MARGIN + 10,
          barY + 6,
          { width: contentWidth() - 20, lineBreak: false },
        );
      doc.y = barY + 30;
    } else {
      doc.fillColor(INK).font(FONT_BOLD).fontSize(11)
        .text(pdfSafeText(`OUTBOUND  ${sector}`), MARGIN, doc.y, { width: contentWidth() });
      doc.moveDown(0.25);
    }

    const left = [
      flight.airline,
      flight.flightNo,
      flight.aircraft,
      flight.cabin,
      flight.baggage ? `Baggage ${flight.baggage}` : "",
    ].filter(Boolean);
    const right = [
      [flight.depTime, flight.date].filter(Boolean).join("  "),
      flight.from ? `Depart ${flight.from}` : "",
      [flight.arrTime, flight.arrivalDate || flight.date].filter(Boolean).join("  "),
      flight.to ? `Arrive ${flight.to}` : "",
      flight.duration ? `Duration ${flight.duration}` : "",
      flight.stops != null ? `${flight.stops} stop${flight.stops === 1 ? "" : "s"}` : "",
    ].filter(Boolean);

    const colW = contentWidth() / 2 - 10;
    const startY = doc.y;
    let ly = startY;
    for (const line of left) {
      doc.fillColor(INK).font(FONT_REG).fontSize(10).text(pdfSafeText(line), MARGIN, ly, { width: colW });
      ly = doc.y + 4;
      doc.save();
      doc.moveTo(MARGIN, ly).lineTo(MARGIN + colW - 20, ly).strokeColor(RULE).lineWidth(0.5).stroke();
      doc.restore();
      ly += 8;
    }
    let ry = startY;
    for (const line of right) {
      doc.fillColor(INK).font(FONT_BOLD).fontSize(11).text(pdfSafeText(line), MARGIN + colW + 20, ry, { width: colW });
      ry = doc.y + 6;
    }
    doc.y = Math.max(ly, ry) + 10;
  }

  if (model.flightTerms) {
    if (remainingSpace(doc) < 36) {
      onNewPage();
      markPage();
    }
    doc.fillColor(MUTED).font(FONT_REG).fontSize(9).text(pdfSafeText(model.flightTerms), { width: contentWidth() });
  }
}

async function renderAccommodation(
  doc: PDFKit.PDFDocument,
  model: QuotationPdfModel,
  pkg: QuotationPdfPackage,
  onNewPage: () => void,
  markPage: () => void,
) {
  if (!pkg.hotels.length) return;
  onNewPage();
  markPage();
  sectionTitle(doc, "Accommodation");

  for (let i = 0; i < pkg.hotels.length; i += 1) {
    const hotel = pkg.hotels[i];
    if (i > 0) {
      onNewPage();
      markPage();
      sectionTitle(doc, "Accommodation");
    }

    const details: Array<[string, string]> = [
      ["Property", hotel.hotelName],
    ];
    if (hotel.starCategory) details.push(["Category", `${String(hotel.starCategory).replace(/star/i, "").trim()} Star`]);
    if (hotel.address) details.push(["Address", hotel.address]);
    if (hotel.nights != null) details.push(["Duration", `${hotel.nights} Night${Number(hotel.nights) === 1 ? "" : "s"}`]);
    if (hotel.highlight) details.push(["Property Highlight", hotel.highlight]);
    if (hotel.roomType) details.push(["Room", hotel.roomType]);
    if (hotel.mealPlan) details.push(["Meal Plan", hotel.mealPlan]);
    if (hotel.checkIn) details.push(["Check-in", hotel.checkIn]);
    if (hotel.checkOut) details.push(["Check-out", hotel.checkOut]);
    if (hotel.selfBooked) details.push(["Booking", "Self-booked by customer / agent"]);

    const detailsH = details.reduce(
      (sum, [, value]) => sum + measure(doc, `${value}`, contentWidth() - 100, 10) + 8,
      0,
    );
    const heroH = 220;
    const needed = heroH + 18 + detailsH;

    if (remainingSpace(doc) < Math.min(needed, heroH + 80)) {
      onNewPage();
      markPage();
      sectionTitle(doc, "Accommodation");
    }

    const imageY = doc.y;
    await drawImageOrSoft(
      doc,
      hotel.imageUrl,
      MARGIN,
      imageY,
      contentWidth(),
      heroH,
      // Prefer destination photography over blank; hotel text stays BELOW the clipped box.
      model.destinationImages,
    );
    // Explicit cursor below the clipped hotel image — never overlay labels on photo.
    let y = imageY + heroH + 18;
    doc.x = MARGIN;
    doc.y = y;

    for (const [label, value] of details) {
      const lineH = measure(doc, `${label}: ${value}`, contentWidth(), 10, FONT_REG) + 6;
      if (y + lineH > PAGE_H - CONTENT_BOTTOM) {
        onNewPage();
        markPage();
        y = doc.y;
      }
      doc.fillColor(INK).font(FONT_BOLD).fontSize(10)
        .text(`${label}: `, MARGIN, y, { continued: true, width: contentWidth() });
      doc.font(FONT_REG).text(pdfSafeText(value));
      y = doc.y + 6;
      doc.y = y;
    }
  }
}

async function renderInclusionsExclusions(
  doc: PDFKit.PDFDocument,
  model: QuotationPdfModel,
  pkg: QuotationPdfPackage,
  onNewPage: () => void,
  markPage: () => void,
) {
  if (!pkg.inclusions.length && !pkg.exclusions.length) return;
  onNewPage();
  markPage();
  sectionTitle(doc, "Inclusions & Exclusions");

  const colGap = 32;
  const colW = (contentWidth() - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;
  const top = doc.y + 6;

  doc.fillColor(INK).font(DISPLAY).fontSize(14).text("INCLUSIONS", leftX, top, { width: colW, characterSpacing: 0.8 });
  doc.font(DISPLAY).fontSize(14).text("EXCLUSIONS", rightX, top, { width: colW, characterSpacing: 0.8 });

  // Underline each column heading
  doc.save();
  doc.moveTo(leftX, top + 20).lineTo(leftX + Math.min(110, colW), top + 20).strokeColor(INK).lineWidth(1).stroke();
  doc.moveTo(rightX, top + 20).lineTo(rightX + Math.min(110, colW), top + 20).strokeColor(INK).lineWidth(1).stroke();
  doc.moveTo(MARGIN + colW + colGap / 2, top)
    .lineTo(MARGIN + colW + colGap / 2, Math.min(top + 220, PAGE_H - CONTENT_BOTTOM - 110))
    .strokeColor(RULE).lineWidth(0.7).stroke();
  doc.restore();

  let ly = top + 34;
  let ry = top + 34;

  const drawLeft = (text: string, bold = false) => {
    if (ly > PAGE_H - CONTENT_BOTTOM - 120) {
      onNewPage();
      markPage();
      sectionTitle(doc, "Inclusions & Exclusions");
      ly = doc.y;
      ry = Math.max(ry, doc.y);
    }
    doc.fillColor(INK).font(bold ? FONT_BOLD : FONT_REG).fontSize(bold ? 10.5 : 10)
      .text(pdfSafeText(text), leftX, ly, { width: colW });
    ly = doc.y + (bold ? 8 : 7);
  };
  const drawRight = (text: string) => {
    if (ry > PAGE_H - CONTENT_BOTTOM - 120) {
      onNewPage();
      markPage();
      sectionTitle(doc, "Inclusions & Exclusions");
      ry = doc.y;
      ly = Math.max(ly, doc.y);
    }
    doc.fillColor(MUTED).font(FONT_REG).fontSize(10)
      .text(`- ${pdfSafeText(text)}`, rightX, ry, { width: colW });
    ry = doc.y + 7;
  };

  if (pkg.inclusionGroups.length) {
    for (const group of pkg.inclusionGroups) {
      drawLeft(group.label.toUpperCase(), true);
      for (const item of group.items) drawLeft(`+ ${item}`);
      ly += 12;
    }
  } else {
    for (const item of pkg.inclusions) drawLeft(`+ ${item}`);
  }

  for (const item of pkg.exclusions) drawRight(item);

  const contentBottom = Math.max(ly, ry) + 24;
  doc.y = contentBottom;
  doc.x = MARGIN;

  // Compact destination strip — fills empty lower page without crowding copy.
  const stripH = 92;
  if (PAGE_H - CONTENT_BOTTOM - contentBottom >= stripH + 8) {
    await drawImageOrSoft(
      doc,
      model.destinationImages[0] || model.coverImage,
      MARGIN,
      contentBottom,
      contentWidth(),
      stripH,
      model.destinationImages.slice(1),
    );
  }
}

function renderAddOns(
  doc: PDFKit.PDFDocument,
  pkg: QuotationPdfPackage,
  onNewPage: () => void,
  markPage: () => void,
) {
  if (!pkg.addOns.length) return;
  onNewPage();
  markPage();
  sectionTitle(doc, "Add-ons");
  for (const addon of pkg.addOns) {
    ensure(doc, 40, () => {
      onNewPage();
      markPage();
    });
    doc.fillColor(INK).font(FONT_BOLD).fontSize(12).text(pdfSafeText(addon.name || "Add-on"), { width: contentWidth() });
    const meta = [
      addon.description,
      addon.date,
      addon.city,
      addon.quantity != null && addon.quantity > 1 ? `Qty ${addon.quantity}` : "",
      addon.sellingPrice != null
        ? money(addon.sellingPrice, addon.currency || "INR")
        : "",
    ].filter(Boolean).join(" · ");
    if (meta) {
      doc.font(FONT_REG).fontSize(9).fillColor(MUTED).text(pdfSafeText(meta), { width: contentWidth() });
    }
    doc.moveDown(0.45);
  }
}

function renderCommercialSummary(
  doc: PDFKit.PDFDocument,
  model: QuotationPdfModel,
  pkg: QuotationPdfPackage,
  onNewPage: () => void,
  markPage: () => void,
) {
  onNewPage();
  markPage();
  sectionTitle(doc, "Investment Summary");
  doc.moveDown(0.35);

  const rows: Array<[string, string, boolean?]> = [];
  for (const row of pkg.serviceTotals) {
    rows.push([row.label, money(row.amount, pkg.pricing.currency)]);
  }
  if (pkg.pricing.perAdultPrice > 0) rows.push(["Per Adult", money(pkg.pricing.perAdultPrice, pkg.pricing.currency)]);
  if (pkg.pricing.perChildPrice > 0) rows.push(["Per Child", money(pkg.pricing.perChildPrice, pkg.pricing.currency)]);
  rows.push(["Package / Services", money(pkg.pricing.packageBase, pkg.pricing.currency)]);
  if (pkg.pricing.taxConfigured && pkg.pricing.taxAmount != null) {
    rows.push([
      `Taxes / Service Charges${pkg.pricing.taxRate != null ? ` (${pkg.pricing.taxRate}%)` : ""}`,
      money(pkg.pricing.taxAmount, pkg.pricing.currency),
    ]);
  }
  rows.push(["TOTAL PAYABLE", money(pkg.pricing.finalPrice || pkg.pricing.packageBase, pkg.pricing.currency), true]);

  for (const [label, value, emphasize] of rows) {
    if (remainingSpace(doc) < 34) {
      onNewPage();
      markPage();
    }
    const y = doc.y;
    if (emphasize) {
      doc.save();
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(INK).lineWidth(1.2).stroke();
      doc.restore();
      doc.fillColor(INK).font(FONT_BOLD).fontSize(12)
        .text(label, MARGIN, y + 14, { width: contentWidth() * 0.5, lineBreak: false });
      doc.font(DISPLAY).fontSize(20)
        .text(value, MARGIN, y + 10, { width: contentWidth(), align: "right", lineBreak: false });
      doc.y = y + 44;
      doc.save();
      doc.moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).strokeColor(INK).lineWidth(1.2).stroke();
      doc.restore();
      doc.moveDown(1.1);
    } else {
      doc.fillColor(MUTED).font(FONT_REG).fontSize(10.5)
        .text(label, MARGIN, y, { width: contentWidth() * 0.55, lineBreak: false });
      doc.fillColor(INK).font(FONT_BOLD).fontSize(11)
        .text(value, MARGIN, y, { width: contentWidth(), align: "right", lineBreak: false });
      doc.y = y + 24;
    }
  }

  doc.moveDown(0.85);

  if (model.paymentTerms) {
    if (remainingSpace(doc) < 50) {
      onNewPage();
      markPage();
    }
    doc.fillColor(INK).font(DISPLAY).fontSize(12).text("PAYMENT", { characterSpacing: 0.6 });
    doc.moveDown(0.3);
    doc.font(FONT_REG).fontSize(10).fillColor(MUTED).text(pdfSafeText(model.paymentTerms), { width: contentWidth() });
    doc.moveDown(0.75);
  }
  if (model.cancellationPolicy) {
    if (remainingSpace(doc) < 50) {
      onNewPage();
      markPage();
    }
    doc.fillColor(INK).font(DISPLAY).fontSize(12).text("CANCELLATION", { characterSpacing: 0.6 });
    doc.moveDown(0.3);
    doc.font(FONT_REG).fontSize(10).fillColor(MUTED).text(pdfSafeText(model.cancellationPolicy), { width: contentWidth() });
  }
}

async function renderClosing(doc: PDFKit.PDFDocument, model: QuotationPdfModel) {
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const img = model.closingImage || model.coverImage;
  if (img) {
    const ok = await drawImage(doc, img, 0, 0, PAGE_W, PAGE_H, "cover");
    if (!ok) doc.rect(0, 0, PAGE_W, PAGE_H).fill("#1a1a1a");
    else doc.rect(0, 0, PAGE_W, PAGE_H).fillOpacity(0.2).fill("#000000").fillOpacity(1);
  } else {
    doc.rect(0, 0, PAGE_W, PAGE_H).fill("#1a1a1a");
  }

  doc.fillColor("#ffffff").font(FONT_REG).fontSize(12)
    .text("Curated with love by", MARGIN, PAGE_H * 0.28, {
      width: contentWidth(),
      align: "center",
      characterSpacing: 1,
      lineBreak: false,
    });

  let logoDrawn = false;
  if (model.branding.logo) {
    logoDrawn = await drawImage(doc, model.branding.logo, PAGE_W / 2 - 70, PAGE_H * 0.36, 140, 70, "fit");
  }
  if (!logoDrawn) {
    doc.font(DISPLAY).fontSize(30)
      .text(pdfSafeText(model.agentName).toUpperCase(), MARGIN, PAGE_H * 0.4, {
        width: contentWidth(),
        align: "center",
        characterSpacing: 1,
      });
  } else {
    doc.font(DISPLAY_REG).fontSize(14)
      .text(pdfSafeText(model.agentName).toUpperCase(), MARGIN, PAGE_H * 0.48, {
        width: contentWidth(),
        align: "center",
        characterSpacing: 1.2,
      });
  }

  doc.save();
  doc.circle(PAGE_W / 2, PAGE_H * 0.68, 18).strokeColor("#ffffff").lineWidth(1).stroke();
  doc.moveTo(PAGE_W / 2 - 40, PAGE_H * 0.68 + 34).lineTo(PAGE_W / 2 + 40, PAGE_H * 0.68 + 34)
    .strokeColor("#ffffff").lineWidth(0.8).stroke();
  doc.restore();
  doc.page.margins.bottom = prevBottom;
}

export async function renderQuotationPdf(model: QuotationPdfModel): Promise<{ buffer: Buffer; pageCount: number }> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: CONTENT_BOTTOM, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    info: { Title: `${model.quoteNo} — ${model.destinationName}`, Author: model.branding.brandName },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  let pageCount = 1;
  let contentPageNo = 0;
  doc.on("pageAdded", () => {
    pageCount += 1;
    doc.x = MARGIN;
    doc.y = MARGIN;
  });

  const markContentPage = () => {
    contentPageNo += 1;
    pageNumber(doc, contentPageNo);
  };
  const onNewPage = () => {
    doc.addPage();
  };

  // Cover — no content page number
  await renderCover(doc, model);

  const primary = model.packages[0];
  if (!primary) {
    doc.end();
    await new Promise<void>((resolve) => doc.on("end", () => resolve()));
    return { buffer: Buffer.concat(chunks), pageCount };
  }

  // Overview
  onNewPage();
  await renderOverview(doc, model, primary, () => {
    onNewPage();
    markContentPage();
  }, markContentPage);

  // Remaining packages get their own commercial overview note if multi-option
  for (let i = 1; i < model.packages.length; i += 1) {
    const pkg = model.packages[i];
    onNewPage();
    markContentPage();
    sectionTitle(doc, pkg.name);
    doc.fillColor(MUTED).font(FONT_REG).fontSize(10)
      .text(pdfSafeText(pkg.description || "Alternative package option"), { width: contentWidth() });
    doc.moveDown(0.5);
    doc.fillColor(INK).font(FONT_BOLD).fontSize(12)
      .text(`Total payable: ${money(pkg.pricing.finalPrice || pkg.pricing.packageBase, pkg.pricing.currency)}`);
  }

  await renderItinerary(doc, model, primary, onNewPage, markContentPage);
  await renderFlights(doc, model, primary, onNewPage, markContentPage);
  await renderAccommodation(doc, model, primary, onNewPage, markContentPage);
  await renderInclusionsExclusions(doc, model, primary, onNewPage, markContentPage);
  renderAddOns(doc, primary, onNewPage, markContentPage);

  if (primary.visa?.enabled) {
    onNewPage();
    markContentPage();
    sectionTitle(doc, "Visa");
    const bits = [
      primary.visa.visaType && `Type: ${primary.visa.visaType}`,
      primary.visa.entryType && `Entry: ${primary.visa.entryType}`,
      primary.visa.processingTime && `Processing: ${primary.visa.processingTime}`,
      primary.visa.feeLabel && `Fee: ${primary.visa.feeLabel}`,
      primary.visa.notes,
    ].filter(Boolean);
    for (const bit of bits) {
      doc.fillColor(INK).font(FONT_REG).fontSize(10).text(pdfSafeText(String(bit)), { width: contentWidth() });
      doc.moveDown(0.2);
    }
  }

  if (primary.insurance?.enabled) {
    onNewPage();
    markContentPage();
    sectionTitle(doc, "Insurance");
    const bits = [
      primary.insurance.provider && `Provider: ${primary.insurance.provider}`,
      primary.insurance.planName && `Plan: ${primary.insurance.planName}`,
      primary.insurance.coverage && `Coverage: ${primary.insurance.coverage}`,
      primary.insurance.premiumLabel && `Premium: ${primary.insurance.premiumLabel}`,
      primary.insurance.notes,
    ].filter(Boolean);
    for (const bit of bits) {
      doc.fillColor(INK).font(FONT_REG).fontSize(10).text(pdfSafeText(String(bit)), { width: contentWidth() });
      doc.moveDown(0.2);
    }
  }

  renderCommercialSummary(doc, model, primary, onNewPage, markContentPage);

  // Closing — no content page number
  onNewPage();
  await renderClosing(doc, model);

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  return { buffer: Buffer.concat(chunks), pageCount };
}
