export default function Frame({ path, status, children }: { path: string; status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-900">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2.5 font-mono text-[12px] text-white/55">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
          <span className="ml-2">{path}</span>
        </div>
        {status}
      </div>
      {children}
    </div>
  );
}