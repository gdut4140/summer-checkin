import { Hero } from "@/components/landing/hero";
import { FeaturesGrid } from "@/components/landing/features-grid";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="scenic-shell flex min-h-[100dvh] flex-col">
      <Hero />
      <FeaturesGrid />
      <HowItWorks />
      <CTASection />
      <Footer />
    </div>
  );
}
