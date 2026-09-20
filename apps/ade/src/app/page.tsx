"use client";

import { useEffect } from "react";

/**
 * The workbench lives at /arcade, so it keeps its URL when it is served next to
 * the marketing site. On its own (desktop app, `npm run dev`) the root just
 * forwards there.
 */
export default function Root() {
  useEffect(() => {
    window.location.replace("/arcade/");
  }, []);
  return null;
}
