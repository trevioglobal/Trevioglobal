"use client";

import { ArrowUpRight, Building2, FileCheck, Map, Plane, Route, Sparkles } from "lucide-react";
import { ScrollReveal } from "@/components/public/scroll-reveal";
import { PUBLIC_IMAGES } from "@/lib/public-marketing-images";

const SOLUTIONS = [
  {
    title: "Flights",
    description: "Find and book flights with competitive B2B fares.",
    icon: Plane,
    image: PUBLIC_IMAGES.solutions.flights,
  },
  {
    title: "Hotels",
    description: "Access hotels, resorts, villas and stays.",
    icon: Building2,
    image: PUBLIC_IMAGES.solutions.hotels,
  },
  {
    title: "Holiday Packages",
    description: "Discover curated domestic and international travel packages.",
    icon: Map,
    image: PUBLIC_IMAGES.solutions.packages,
  },
  {
    title: "Transfers",
    description: "Arrange airport transfers and destination transportation.",
    icon: Route,
    image: PUBLIC_IMAGES.solutions.transfers,
  },
  {
    title: "Tours & Activities",
    description: "Offer your customers memorable experiences and activities.",
    icon: Sparkles,
    image: PUBLIC_IMAGES.solutions.activities,
  },
  {
    title: "Visa Services",
    description: "Simplify visa enquiries and application assistance.",
    icon: FileCheck,
    image: PUBLIC_IMAGES.solutions.visa,
  },
] as const;

export function TravelSolutions() {
  return (
    <section id="solutions" className="scroll-mt-24 bg-[#f7f4ef]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <ScrollReveal className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand-blue)]">
            Travel solutions
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1220] sm:text-4xl">
            Sell travel with confidence
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            A complete B2B catalogue designed for agencies — from flights and hotels to curated holidays and on-ground services.
          </p>
        </ScrollReveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {SOLUTIONS.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 0.05}>
              <article className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-[#0b1220] shadow-[0_18px_50px_-28px_rgba(11,18,32,0.45)]">
                <div className="relative h-52 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image.src}
                    alt={item.image.alt}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/35 to-transparent" />
                </div>
                <div className="relative -mt-16 space-y-3 px-5 pb-6 pt-2">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-md ring-1 ring-white/15">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-white/65">{item.description}</p>
                    </div>
                    <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors group-hover:border-white/40 group-hover:text-white">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
