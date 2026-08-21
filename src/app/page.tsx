import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-utils";
import { Hero } from "@/components/landing/hero";
import { FeaturesGrid } from "@/components/landing/features-grid";
import { CheckinShowcase } from "@/components/landing/checkin-showcase";
import { StudioShowcase } from "@/components/landing/studio-showcase";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="scenic-shell flex min-h-[100dvh] flex-col">
      <Hero />
      <FeaturesGrid />
      <CheckinShowcase />
      <StudioShowcase />
      <HowItWorks />
      <CTASection />
      <Footer />
    </div>
  );
}
