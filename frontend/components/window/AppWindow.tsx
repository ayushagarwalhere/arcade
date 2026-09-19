import type { ComponentType } from "react";

export type Scene = {
  id: string;
  label: string;
  caption: string;
  tabs: { label: string; icon: string }[];
  rightTab: number;
  Center: ComponentType;
  Right: ComponentType;
};

type AppWindowProps = {
  step: number;
  scene: Scene;
};

export default function AppWindow({ step, scene }: AppWindowProps) {
  const Center = scene.Center;
  const Right = scene.Right;

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/10 bg-[#111214] text-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-3 text-[12px] text-white/40">
          arcade / sentinel / {scene.id} / step {step + 1}
        </span>
      </div>
      <div className="grid min-h-[480px] lg:grid-cols-[1.45fr_0.8fr]">
        <div className="min-w-0 border-b border-white/[0.08] lg:border-b-0 lg:border-r">
          <Center />
        </div>
        <aside className="min-w-0 bg-white/[0.015]">
          <Right />
        </aside>
      </div>
    </div>
  );
}
