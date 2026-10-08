"use client";

import { ScrollReveal } from "@/components/public/scroll-reveal";

const BENEFITS = [
  {
    title: "Partner Rates",
    description: "Access competitive B2B pricing.",
  },
  {
    title: "Special Offers",
    description: "Discover selected deals and seasonal promotions.",
  },
  {
    title: "Professional Quotations",
    description: "Create and share customer-ready travel quotations.",
  },
  {
    title: "Booking Management",
    description: "Keep all your travel bookings organized in one place.",
  },
  {
    title: "Dedicated Support",
    description: "Get assistance from our travel support team.",
  },
] as const;

export function PartnerBenefits() {
  return (
    <section id="partner-benefits" className="scroll-mt-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <ScrollReveal className="lg:col-span-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand-blue)]">
              Partner benefits
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1220] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
              More Tools. More Opportunities. More Business.
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">
              MyPartner is designed to help agencies sell more travel — with cleaner workflows, stronger packaging,
              and support that understands the trade.
            </p>
          </ScrollReveal>

          <div className="lg:col-span-7">
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {BENEFITS.map((item, i) => (
                <li key={item.title}>
                  <ScrollReveal delay={i * 0.05}>
                    <div className="grid gap-2 py-6 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-8 sm:py-7">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {String(i + 1).padStart(2, "0")}
                      </p>
                      <div>
                        <h3 className="text-lg font-semibold text-[#0b1220]">{item.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  </ScrollReveal>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
