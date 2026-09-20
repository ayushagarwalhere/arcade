"use client";
import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

/** Fades a block up once when it scrolls into view. Use sparingly. */
export default function Reveal({ children, className = "", delay = 0, y = 32 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el, { opacity: 0, y }, { opacity: 1, y: 0, duration: 0.9, delay, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } });
    }, el);
    return () => ctx.revert();
  }, [delay, y]);
  return <div ref={ref} className={className}>{children}</div>;
}