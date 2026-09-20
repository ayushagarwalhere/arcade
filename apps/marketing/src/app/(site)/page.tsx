import Preloader from "@/components/Preloader";
import IntroScene from "@/components/IntroScene";
import Hero from "@/components/hero";
import FeatureShowcase from "@/components/featureShowcase";
import DevLoop from "@/components/DevLoop";
import SentinelScroll from "@/components/SentinelScroll";
import MobileSection from "@/components/MobileSection";
import Comparison from "@/components/Comparison";
import DownloadSection from "@/components/DownloadSection";
import FAQ from "@/components/FAQ";
import FinalCTA from "@/components/FinalCTA";

export default function Home() {
  return (
    <>
      {/* Drawn for a black ground, so these stay dark in light mode too. */}
      <div data-theme="dark">
        <Preloader />
        <IntroScene />
      </div>
      <Hero />
      <FeatureShowcase />
      <DevLoop />
      <SentinelScroll />
      <MobileSection />
      <Comparison />
      <DownloadSection />
      <FAQ />
      <FinalCTA />
    </>
  );
}
