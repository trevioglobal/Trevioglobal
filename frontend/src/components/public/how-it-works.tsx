"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ScrollReveal } from "@/components/public/scroll-reveal";

const STEPS = [
  {
    n: "01",
    title: "Register",
    description: "Create your Trevio Global partner account.",
  },
  {
    n: "02",
    title: "Explore",
    description: "Search destinations, hotels, packages and travel services.",
  },
  {
    n: "03",
    title: "Create & Quote",
    description: "Prepare professional quotations for your customers.",
  },
  {
    n: "04",
    title: "Book",
    description: "Confirm travel services through the platform.",
  },
  {
    n: "05",
    title: "Manage",
    description: "Track bookings, payments, invoices and customer requirements.",
  },
] as const;

export function HowItWorks() {
  const reduce = useReducedMotion();

  return (
    <section id="how-it-works" className="scroll-mt-24 bg-[#f7f4ef]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <ScrollReveal className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Journey
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1220] sm:text-4xl">
            How MyPartner Works
          </h2>
        </ScrollReveal>

        {/* Desktop horizontal journey */}
        <div className="relative mt-14 hidden lg:block">
          <motion.div
            className="absolute left-0 right-0 top-[1.65rem] h-px origin-left bg-gradient-to-r from-[var(--brand-blue)] via-[var(--brand-teal)] to-slate-300"
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
          <ol className="grid grid-cols-5 gap-4">
            {STEPS.map((step, i) => (
              <li key={step.n}>
                <ScrollReveal delay={i * 0.08}>
                  <div className="relative pt-1">
                    <span className="relative z-10 mb-5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0b1220] text-[11px] font-semibold text-white ring-4 ring-[#f7f4ef]">
                      {step.n}
                    </span>
                    <h3 className="text-base font-semibold text-[#0b1220]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
                  </div>
                </ScrollReveal>
              </li>
            ))}
          </ol>
        </div>

        {/* Mobile vertical timeline */}
        <ol className="relative mt-10 space-y-0 border-l border-slate-300 pl-6 lg:hidden">
          {STEPS.map((step, i) => (
            <li key={step.n} className="relative pb-8 last:pb-0">
              <span className="absolute -left-[1.55rem] top-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0b1220] text-[10px] font-semibold text-white ring-4 ring-[#f7f4ef]">
                {step.n}
              </span>
              <ScrollReveal delay={i * 0.05}>
                <h3 className="text-base font-semibold text-[#0b1220]">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.description}</p>
              </ScrollReveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
