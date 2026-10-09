"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ScrollReveal } from "@/components/public/scroll-reveal";
import { PUBLIC_IMAGES } from "@/lib/public-marketing-images";

export function NetworkSection() {
  const reduce = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden bg-[#0b1220] text-white">
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PUBLIC_IMAGES.network.src}
          alt={PUBLIC_IMAGES.network.alt}
          className="h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070d18]/95 via-[#0b1220]/85 to-[#0b1220]/55" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <ScrollReveal className="max-w-3xl space-y-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Brand statement
          </p>
          <h2 className="text-3xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">
            Your Business.
            <br />
            Your Customers.
            <br />
            Our Travel Network.
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
            Trevio Global connects travel partners with a growing network of destinations, hotels, experiences,
            transfers and travel solutions.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">
            Whether you&apos;re handling an individual booking or managing a complete group itinerary, Trevioglobal gives
            you the tools to manage your travel business efficiently.
          </p>
          <motion.p
            className="pt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
            initial={reduce ? false : { opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, delay: 0.15 }}
          >
            One Platform. Multiple Travel Solutions.
          </motion.p>
        </ScrollReveal>
      </div>
    </section>
  );
}
