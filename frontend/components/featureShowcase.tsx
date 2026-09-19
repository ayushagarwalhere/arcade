"use client";
import { useEffect, useRef, useState } from "react";
import AppWindow from "./window/AppWindow";
import { SCENES } from "./window/scenes";
import { gsap } from "@/lib/gsap";

const DURATION = 8000; // ms each scene plays

export default function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const elapsed = useRef(0);
  const inView = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const select = (i: number) => {
    activeRef.current = i;
    elapsed.current = 0;
    setActive(i);
  };

  // Progress line: one continuous bar across all tabs, advancing through each scene.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; }, { threshold: 0.1 });
    if (wrapRef.current) io.observe(wrapRef.current);
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (inView.current) {
        elapsed.current += dt;
        if (elapsed.current >= DURATION) {
          const n = (activeRef.current + 1) % SCENES.length;
          activeRef.current = n;
          elapsed.current = 0;
          setActive(n);
        }
      }
      const total = (activeRef.current + elapsed.current / DURATION) / SCENES.length;
      if (barRef.current) barRef.current.style.transform = `scaleX(${total})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  // The window settles into place as you scroll.
  useEffect(() => {
    if (!frameRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        frameRef.current,
        { rotateX: 9, scale: 0.94, y: 50, transformOrigin: "50% 0%" },
        { rotateX: 0, scale: 1, y: 0, ease: "none", scrollTrigger: { trigger: frameRef.current, start: "top 98%", end: "top 45%", scrub: true } }
      );
    });
    return () => ctx.revert();
  }, []);

  return (
    <section ref={wrapRef} className="relative pb-24">
      <div className="sticky top-[88px] z-30 flex justify-center px-4">
        <div className="relative max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d0e10]/90 p-1.5 backdrop-blur-md">
          <div className="scrollbar-none flex gap-1 overflow-x-auto">
            {SCENES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => select(i)}
                className={`whitespace-nowrap rounded-xl px-5 py-3 text-[15px] font-medium transition-colors ${i === active ? "bg-white/10 text-white" : "text-white/55 hover:text-white"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.06]">
            <div ref={barRef} className="h-full origin-left bg-white/70" style={{ transform: "scaleX(0)" }} />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-[1720px] px-3 md:px-6" style={{ perspective: 1800 }}>
        <div ref={frameRef} className="rounded-[26px] border border-white/15 bg-black p-2.5 shadow-[0_60px_140px_-50px_rgba(255,255,255,0.14)] md:rounded-[36px] md:p-3">
          <AppWindow step={active} scene={SCENES[active]} />
        </div>
      </div>

      <p key={active} className="mx-auto mt-8 max-w-xl animate-fade-in px-6 text-center text-[16px] leading-6 text-white/50">
        {SCENES[active].caption}
      </p>
    </section>
  );
}