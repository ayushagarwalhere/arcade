"use client";
import { useEffect, useState } from "react";
import type { Heading } from "@/lib/docs/pages";

/** "On this page" outline with scroll-spy. */
export default function Toc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState(headings[0]?.id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label="On this page">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">On this page</div>
      <ul className="mt-3 border-l border-white/[0.08]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`-ml-px block border-l py-1 text-[13px] leading-5 transition ${h.level === 3 ? "pl-6" : "pl-3.5"} ${
                active === h.id ? "border-emerald-400 text-white" : "border-transparent text-white/45 hover:text-white/80"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
