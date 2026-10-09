"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PUBLIC_IMAGES } from "@/lib/public-marketing-images";

export function HeroSection({
  onLogin,
  onBecomePartner,
}: {
  onLogin: () => void;
  onBecomePartner: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <section className="relative isolate min-h-[92vh] overflow-hidden bg-[#0b1220] text-white">
      <motion.div
        className="absolute inset-0"
        initial={reduce ? false : { scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PUBLIC_IMAGES.hero.src}
          alt={PUBLIC_IMAGES.hero.alt}
          className="h-full w-full object-cover object-[center_35%]"
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#070d18]/92 via-[#0b1220]/72 to-[#0b1220]/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#070d18]/80 via-transparent to-[#070d18]/35" />

      <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:justify-center lg:px-8 lg:pb-24 lg:pt-32">
        <motion.div
          className="max-w-3xl space-y-6"
          initial={reduce ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Trevioglobal
          </p>
          <h1 className="text-[2.35rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.65rem]">
            The Smarter Way to Grow Your Travel Business
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
            Welcome to Trevioglobal — your dedicated B2B travel platform built for travel agents,
            tour operators and travel businesses.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-white/60 sm:text-[0.95rem]">
            Competitive travel rates. Curated destinations. Flexible booking solutions. Dedicated partner support.
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              onClick={onBecomePartner}
              className="h-12 w-full rounded-xl bg-[var(--brand-teal)] px-6 text-sm font-semibold text-white hover:bg-[var(--brand-teal)]/90 sm:w-auto"
            >
              Become a Trevio Partner
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onLogin}
              className="h-12 w-full rounded-xl border-white/30 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10 hover:text-white sm:w-auto"
            >
              Login to Trevioglobal
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
