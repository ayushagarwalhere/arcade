import DownloadActions from "./DownloadActions";
import Reveal from "./Reveal";

export default function FinalCTA() {
  return (
    <section className="border-t border-white/[0.07] px-6 py-32 text-center">
      <Reveal>
        <h2 className="h-display mx-auto max-w-[1000px] text-[40px] font-medium md:text-[72px]">
          Build at AI speed.<br />Don&apos;t ship at AI risk.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[20px] text-white/50 md:text-[24px]">
          Get work done dramatically faster than in any IDE, and know it is safe to ship.
        </p>
        <div className="mt-12"><DownloadActions secondary="discord" /></div>
      </Reveal>
    </section>
  );
}