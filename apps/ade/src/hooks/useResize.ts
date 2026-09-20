"use client";
import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Drag-to-resize for a workbench pane. `grow` is the drag direction that makes
 * the pane larger: "right" for a left-docked pane, "left" for a right-docked
 * one, "up" for a bottom panel.
 */
export function useResize(initial: number, min: number, max: number, grow: "left" | "right" | "up") {
  const [size, setSize] = useState(initial);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    const vertical = grow === "up";
    const start = vertical ? e.clientY : e.clientX;
    const startSize = size;

    const move = (ev: PointerEvent) => {
      const cur = vertical ? ev.clientY : ev.clientX;
      const delta = grow === "right" ? cur - start : start - cur;
      setSize(Math.min(max, Math.max(min, startSize + delta)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return [size, onPointerDown] as const;
}
