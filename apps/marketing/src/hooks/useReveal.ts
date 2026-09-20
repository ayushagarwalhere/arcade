"use client";

import { useEffect, useState } from "react";

export function useReveal(total: number, interval: number, delay = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let current = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      current += 1;
      setCount(current);
      if (current < total) timer = setTimeout(reveal, interval);
    };
    timer = setTimeout(reveal, delay);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [delay, interval, total]);

  return count;
}
