"use client";
import type { ArcadeState } from "@arcade/core/types";
import TimelineList from "../TimelineList";

export default function Timeline({ state }: { state: ArcadeState }) {
  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-4">
        <h2 className="text-[16px] font-semibold text-white">Run timeline</h2>
        <p className="mt-1 text-[13px] text-white/50">
          Every step of the security loop, from discovery to a verified, human-approved fix.
        </p>
      </div>
      <div className="rounded-md border border-ade-line bg-ade-base p-5">
        <TimelineList events={state.timeline} empty="Start the run to build the timeline." />
      </div>
    </div>
  );
}
