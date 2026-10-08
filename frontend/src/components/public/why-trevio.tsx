"use client";

import { BadgeCheck, ChartNoAxesCombined, Layers3, LockKeyhole, SearchCheck, Headset } from "lucide-react";
import { ScrollReveal } from "@/components/public/scroll-reveal";
import { cn } from "@/lib/utils";

const BENEFITS = [
  {
    title: "Competitive B2B Rates",
    description: "Get partner pricing designed to help you offer better value and improve your margins.",
    icon: ChartNoAxesCombined,
    span: "lg:col-span-7",
  },
  {
    title: "Wide Travel Inventory",
    description: "Access multiple travel products and destinations through a single platform.",
    icon: Layers3,
    span: "lg:col-span-5",
  },
  {
    title: "Easy Booking Management",
    description: "Search, quote, book and manage your travel requirements from one place.",
    icon: SearchCheck,
    span: "lg:col-span-4",
  },
  {
    title: "Dedicated Partner Support",
    description: "Get assistance from the Trevio Global team whenever you need help.",
    icon: Headset,
    span: "lg:col-span-4",
  },
  {
    title: "Secure & Transparent",
    description: "Manage customer bookings, payments, quotations and documents securely.",
    icon: LockKeyhole,
    span: "lg:col-span-4",
  },
  {
    title: "Business Growth",
    description: "A complete platform designed to help travel agents serve more customers and grow their business.",
    icon: BadgeCheck,
    span: "lg:col-span-12",
  },
] as const;

export function WhyTrevio() {
  return (
    <section id="why-trevio" className="scroll-mt-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <ScrollReveal className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand-teal)]">
            Why Trevio
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1220] sm:text-4xl">
            Built for Travel Businesses
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            One platform. Everything your business needs to sell travel better.
          </p>
        </ScrollReveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-12">
          {BENEFITS.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 0.04} className={cn(item.span)}>
              <div
                className={cn(
                  "h-full rounded-2xl border border-slate-200 bg-[#f7f4ef]/60 p-6 sm:p-7",
                  item.span === "lg:col-span-12" && "sm:flex sm:items-center sm:justify-between sm:gap-8",
                )}
              >
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b1220] text-white">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#0b1220]">{item.title}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{item.description}</p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
