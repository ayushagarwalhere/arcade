import Hero from "@/components/hero";
import FeatureShowcase from "@/components/featureShowcase";
import DevLoop from "@/components/DevLoop";
import SentinelScroll from "@/components/SentinelScroll";
import MobileSection from "@/components/MobileSection";
import Comparison from "@/components/Comparison";
import FAQ from "@/components/FAQ";
import FinalCTA from "@/components/FinalCTA";

export default function Home() {
  return (
    <>
      <Hero />
      <FeatureShowcase />
      <DevLoop />
      <SentinelScroll />
      <MobileSection />
      <Comparison />
      <FAQ />
      <FinalCTA />
    </>
  );
}
