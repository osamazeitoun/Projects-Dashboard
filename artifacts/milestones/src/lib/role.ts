import { useEffect, useState } from "react";

export type Perspective = "pm" | "company";

const KEY = "milestones.perspective";

function read(): Perspective {
  if (typeof window === "undefined") return "company";
  const v = window.localStorage.getItem(KEY);
  return v === "pm" ? "pm" : "company";
}

const listeners = new Set<(p: Perspective) => void>();

export function setPerspective(p: Perspective) {
  window.localStorage.setItem(KEY, p);
  listeners.forEach((fn) => fn(p));
}

export function usePerspective(): [Perspective, (p: Perspective) => void] {
  const [p, setP] = useState<Perspective>(() => read());
  useEffect(() => {
    const fn = (next: Perspective) => setP(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [p, setPerspective];
}

export const PM_CONFIG = {
  defaultProjectId: 1,
};
