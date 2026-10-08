"use client";

import { Building2, FileCheck, Map, Plane, Route, Sparkles } from "lucide-react";
import { ScrollReveal } from "@/components/public/scroll-reveal";

const ITEMS = [
  { icon: Plane, label: "Flights" },
  { icon: Building2, label: "Hotels" },
  { icon: Map, label: "Holiday Packages" },
  { icon: Route, label: "Transfers" },
  { icon: Sparkles, label: "Tours & Activities" },
  { icon: FileCheck, label: "Visa Services" },
] as const;

export function ProductStrip() {
  return (
    <section className="border-b border-slate-200/80 bg-[#f7f4ef]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <ScrollReveal>
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Product suite
          </p>
          <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight text-[#0b1220] sm:text-3xl">
            Everything You Need to Serve Your Customers
          </h2>
        </ScrollReveal>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
          {ITEMS.map((item, i) => (
            <ScrollReveal key={item.label} delay={i * 0.04}>
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-5 text-center shadow-[0_1px_0_rgba(15,23,42,0.03)]">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#0b1220]/[0.04] text-[#0b1220]">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-slate-800">{item.label}</span>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
