"use client";

import { useToast } from "@/hooks/use-toast";
import { FinalCta } from "@/components/public/final-cta";
import { HeroSection } from "@/components/public/hero-section";
import { HowItWorks } from "@/components/public/how-it-works";
import { NetworkSection } from "@/components/public/network-section";
import { PartnerBenefits } from "@/components/public/partner-benefits";
import { ProductStrip } from "@/components/public/product-strip";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicNavbar } from "@/components/public/public-navbar";
import { TravelSolutions } from "@/components/public/travel-solutions";
import { WhyTrevio } from "@/components/public/why-trevio";

export function PublicHomePage({
  onLogin,
  onBecomePartner,
  allowPublicRegister,
}: {
  onLogin: () => void;
  onBecomePartner: () => void;
  allowPublicRegister: boolean;
}) {
  const { toast } = useToast();

  const handleBecomePartner = () => {
    if (allowPublicRegister) {
      onBecomePartner();
      return;
    }
    toast({
      title: "Partner registration is invitation-only",
      description:
        "Self-serve signup is currently disabled. Contact Trevio Global partner support, or login if you already have an account.",
    });
  };

  return (
    <div id="top" className="min-h-dvh bg-[#f7f4ef] text-[#0b1220]">
      <PublicNavbar onLogin={onLogin} onBecomePartner={handleBecomePartner} />
      <main>
        <HeroSection onLogin={onLogin} onBecomePartner={handleBecomePartner} />
        <ProductStrip />
        <TravelSolutions />
        <WhyTrevio />
        <NetworkSection />
        <HowItWorks />
        <PartnerBenefits />
        <FinalCta onLogin={onLogin} onBecomePartner={handleBecomePartner} />
      </main>
      <PublicFooter onLogin={onLogin} onBecomePartner={handleBecomePartner} />
    </div>
  );
}
