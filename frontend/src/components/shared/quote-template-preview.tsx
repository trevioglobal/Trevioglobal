"use client";

import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { sectionLabel } from "@/lib/quote-template-sections";
import type { QuotePreviewMockData, QuoteSectionType, QuoteTemplateRecord } from "@/types";

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

interface QuoteTemplatePreviewProps {
  template: Pick<
    QuoteTemplateRecord,
    "primaryColor" | "secondaryColor" | "fontFamily" | "logo" | "watermark" | "backgroundImage" | "showPageNumbers" | "footerStyle"
  >;
  sections: { sectionType: QuoteSectionType; customTitle?: string | null; isVisible?: boolean }[];
  mockData: QuotePreviewMockData;
  className?: string;
  compact?: boolean;
}

function SectionHeading({ title, color }: { title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-5 w-1 rounded-full" style={{ backgroundColor: color }} />
      <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color }}>{title}</h3>
    </div>
  );
}

function RenderSection({
  type, title, data, primary, secondary,
}: {
  type: QuoteSectionType;
  title: string;
  data: QuotePreviewMockData;
  primary: string;
  secondary: string;
}) {
  switch (type) {
    case "COVER":
      return (
        <div className="relative rounded-lg overflow-hidden min-h-[220px] text-white">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${data.package.heroImage})` }}
          />
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primary}dd, ${secondary}cc)` }} />
          <div className="relative p-6 flex flex-col justify-end min-h-[220px]">
            <p className="text-xs opacity-90">{data.agency.tagline}</p>
            <h2 className="text-2xl font-bold mt-1">{data.package.name}</h2>
            <p className="text-sm mt-1 opacity-95">{data.package.destination} · {data.package.duration}</p>
            <p className="text-xs mt-3 opacity-90">Prepared for {data.customer.name}</p>
            <p className="text-[10px] opacity-75 mt-1">{data.quoteNumber} · Valid until {data.validUntil}</p>
          </div>
        </div>
      );
    case "OVERVIEW":
      return (
        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div><span className="text-muted-foreground">Traveller</span><p className="font-medium">{data.customer.name}</p></div>
          <div><span className="text-muted-foreground">Travel Dates</span><p>{data.package.travelDates}</p></div>
          <div><span className="text-muted-foreground">Pax</span><p>{data.customer.pax}</p></div>
          <div><span className="text-muted-foreground">Destination</span><p>{data.package.destination}</p></div>
        </div>
      );
    case "DESTINATION_HIGHLIGHTS":
      return (
        <ul className="space-y-1.5 text-xs">
          {data.highlights.map((h, i) => (
            <li key={i} className="flex gap-2"><span style={{ color: secondary }}>✦</span>{h}</li>
          ))}
        </ul>
      );
    case "ITINERARY":
      return (
        <div className="space-y-3">
          {data.days.map((day) => (
            <div key={day.dayNumber} className="border-l-2 pl-3" style={{ borderColor: `${primary}40` }}>
              <p className="text-xs font-semibold" style={{ color: primary }}>Day {day.dayNumber}: {day.title}</p>
              <div className="mt-1 space-y-1">
                {day.items.map((item, i) => (
                  <div key={i} className="text-[11px] text-muted-foreground">
                    {item.time && <span className="font-medium text-foreground mr-2">{item.time}</span>}
                    {item.title}{item.description ? ` — ${item.description}` : ""}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case "HOTELS":
      return (
        <div className="space-y-2">
          {data.hotels.map((h, i) => (
            <div key={i} className="rounded border p-2 text-xs">
              <p className="font-medium">{h.name} <span className="text-muted-foreground">({h.category})</span></p>
              <p className="text-muted-foreground">{h.nights} nights · {h.room} · {h.mealPlan}</p>
            </div>
          ))}
        </div>
      );
    case "ACTIVITIES":
      return (
        <div className="space-y-2">
          {(data.activities?.length ? data.activities : [{ name: "Activities as per itinerary", duration: "—", description: "Included experiences will appear here." }]).map((a, i) => (
            <div key={i} className="rounded border p-2 text-xs">
              <p className="font-medium">{a.name}</p>
              <p className="text-muted-foreground">Duration: {a.duration}{a.location ? ` · ${a.location}` : ""}</p>
              {a.description && <p className="text-muted-foreground mt-0.5">{a.description}</p>}
            </div>
          ))}
        </div>
      );
    case "FLIGHTS":
      return (
        <div className="space-y-2">
          {data.flights.map((f, i) => (
            <div key={i} className="flex justify-between text-xs border-b border-border/50 pb-1">
              <span className="font-medium">{f.route}</span>
              <span className="text-muted-foreground">{f.airline} {f.flightNo}</span>
            </div>
          ))}
        </div>
      );
    case "TRANSFERS":
      return (
        <ul className="text-xs space-y-1">
          {data.transfers.map((t, i) => (
            <li key={i}><span className="font-medium">{t.name}</span> — {t.type}. {t.notes}</li>
          ))}
        </ul>
      );
    case "PRICING":
      return (
        <div className="text-xs space-y-1">
          <div className="flex justify-between"><span>Hotels</span><span>{inr(data.pricing.hotelCost)}</span></div>
          <div className="flex justify-between"><span>Activities</span><span>{inr(data.pricing.activityCost)}</span></div>
          <div className="flex justify-between"><span>Transfers</span><span>{inr(data.pricing.transferCost)}</span></div>
          <div className="flex justify-between"><span>Flights</span><span>{inr(data.pricing.flightCost)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Markup / Discount</span><span>+{inr(data.pricing.markup)} / −{inr(data.pricing.discount)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{inr(data.pricing.tax)}</span></div>
          <div className="flex justify-between font-bold text-sm pt-2 border-t mt-2" style={{ color: primary }}>
            <span>Grand Total</span><span>{inr(data.pricing.total)}</span>
          </div>
        </div>
      );
    case "INCLUSIONS":
      return <ul className="text-xs list-disc pl-4 space-y-0.5">{data.inclusions.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case "EXCLUSIONS":
      return <ul className="text-xs list-disc pl-4 space-y-0.5">{data.exclusions.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case "VISA":
      return <p className="text-xs">{data.visa.details}</p>;
    case "TERMS":
      return <p className="text-xs whitespace-pre-wrap">{data.terms}</p>;
    case "CANCELLATION":
      return <p className="text-xs whitespace-pre-wrap">{data.cancellation}</p>;
    case "NOTES":
      return <p className="text-xs whitespace-pre-wrap">{data.notes}</p>;
    case "CONTACT":
      return (
        <div className="text-xs rounded-lg p-3" style={{ backgroundColor: `${primary}08` }}>
          <p className="font-semibold">{data.contact.executive}</p>
          <p className="text-muted-foreground">{data.contact.designation}</p>
          <p className="mt-1">{data.contact.phone} · {data.contact.email}</p>
        </div>
      );
    case "CUSTOM_HTML":
      return <div className="text-xs prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.customHtml) }} />;
    default:
      return null;
  }
}

export function QuoteTemplatePreview({ template, sections, mockData, className, compact }: QuoteTemplatePreviewProps) {
  const primary = template.primaryColor || "var(--brand-blue)";
  const secondary = template.secondaryColor || "var(--brand-teal)";
  const font = template.fontFamily || "Inter";
  const footerText = (template.footerStyle?.text as string) || mockData.agency.name;
  const visible = sections.filter((s) => s.isVisible !== false);

  return (
    <div
      className={cn("relative bg-white rounded-xl border shadow-sm overflow-hidden", className)}
      style={{
        fontFamily: font,
        backgroundImage: template.backgroundImage ? `url(${template.backgroundImage})` : undefined,
        backgroundSize: "cover",
      }}
    >
      {template.watermark && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06] text-6xl font-bold rotate-[-24deg] select-none"
          aria-hidden
        >
          {template.watermark}
        </div>
      )}

      <div className={cn("relative", compact ? "p-4 space-y-4" : "p-6 space-y-6")}>
        {template.logo && (
          <div className="flex justify-between items-start pb-2 border-b border-border/50">
            <img src={template.logo} alt="Agency logo" className="h-8 object-contain" />
            <div className="text-right text-[10px] text-muted-foreground">
              <p>{mockData.quoteNumber}</p>
              <p>{mockData.quoteDate}</p>
            </div>
          </div>
        )}

        {visible.map((section, idx) => {
          const title = section.customTitle || sectionLabel(section.sectionType);
          if (section.sectionType === "COVER") {
            return (
              <div key={`${section.sectionType}-${idx}`}>
                <RenderSection type="COVER" title={title} data={mockData} primary={primary} secondary={secondary} />
              </div>
            );
          }
          return (
            <div key={`${section.sectionType}-${idx}`} className="rounded-lg border border-border/60 p-4 bg-white/95">
              <SectionHeading title={title} color={primary} />
              <RenderSection type={section.sectionType} title={title} data={mockData} primary={primary} secondary={secondary} />
            </div>
          );
        })}

        {template.showPageNumbers && (
          <p className="text-[10px] text-center text-muted-foreground pt-2">Page 1 of 1</p>
        )}

        {footerText && (
          <div className="text-[10px] text-center text-muted-foreground border-t pt-3 mt-2">
            {footerText} · {mockData.agency.phone} · {mockData.agency.email}
          </div>
        )}
      </div>
    </div>
  );
}
