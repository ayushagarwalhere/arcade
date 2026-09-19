import Link from "next/link";

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <path d="M4 27A23 23 0 0 1 27 4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10 27A17 17 0 0 1 27 10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity=".75" />
      <path d="M16.5 27A10.5 10.5 0 0 1 27 16.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity=".5" />
      <circle cx="26.5" cy="26.5" r="2.2" fill="currentColor" />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-white">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">Arcade</span>
    </Link>
  );
}