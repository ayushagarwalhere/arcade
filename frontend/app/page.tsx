import Hero from "@/components/Hero";
import FeatureShowcase from "@/components/FeatureShowcase";
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