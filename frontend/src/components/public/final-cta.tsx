"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/public/scroll-reveal";
import { PUBLIC_IMAGES } from "@/lib/public-marketing-images";

export function FinalCta({
  onLogin,
  onBecomePartner,
}: {
  onLogin: () => void;
  onBecomePartner: () => void;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-[#0b1220] text-white">
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PUBLIC_IMAGES.finalCta.src}
          alt={PUBLIC_IMAGES.finalCta.alt}
          className="h-full w-full object-cover object-center opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070d18] via-[#0b1220]/75 to-[#0b1220]/45" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <ScrollReveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Ready to Grow Your Travel Business?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
            Join Trevioglobal.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">
            Give your customers more travel choices while managing your business from one powerful B2B platform.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              onClick={onBecomePartner}
              className="h-12 rounded-xl bg-[var(--brand-teal)] px-6 text-sm font-semibold text-white hover:bg-[var(--brand-teal)]/90"
            >
              Become a Trevio Partner
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onLogin}
              className="h-12 rounded-xl border-white/30 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
            >
              Already a partner? Login to Trevioglobal
            </Button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
