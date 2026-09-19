export type TLine = { k: "cmd" | "info" | "sub" | "ok" | "err" | "warn" | "plain"; t: string };

function Line({ l }: { l: TLine }) {
  const base = "animate-fade-in whitespace-pre-wrap break-words";
  switch (l.k) {
    case "cmd":
      return <div className={base}><span className="text-emerald-400">$</span> <span className="text-white">{l.t}</span></div>;
    case "info":
      return <div className={base}><span className="text-violet-400">●</span> <span className="text-white/90">{l.t}</span></div>;
    case "sub":
      return <div className={`${base} pl-5 text-white/40`}>└ {l.t}</div>;
    case "ok":
      return <div className={`${base} text-emerald-400`}>✓ {l.t}</div>;
    case "err":
      return <div className={`${base} font-medium text-red-400`}>✗ {l.t}</div>;
    case "warn":
      return <div className={`${base} text-amber-300`}>! {l.t}</div>;
    default:
      return <div className={`${base} text-white/60`}>{l.t}</div>;
  }
}

export default function TerminalView({ lines, count }: { lines: TLine[]; count: number }) {
  return (
    <div className="p-5 font-mono text-[12.5px] leading-[1.75]">
      {lines.slice(0, count).map((l, i) => (
        <Line key={i} l={l} />
      ))}
      <span className="mt-1 inline-block h-4 w-2 translate-y-0.5 animate-blink bg-white/70" />
    </div>
  );
}