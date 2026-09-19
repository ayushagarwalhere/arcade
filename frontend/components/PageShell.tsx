export default function PageShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[900px] px-6 pb-32 pt-24 md:px-10">
      <h1 className="h-display text-[44px] font-medium md:text-[72px]">{title}</h1>
      <p className="mt-6 text-[20px] leading-8 text-white/50">{intro}</p>
      <div className="mt-16">{children}</div>
    </div>
  );
}