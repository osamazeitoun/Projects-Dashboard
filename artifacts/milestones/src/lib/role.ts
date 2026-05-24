import { useEffect, useState } from "react";

export type Perspective = "pm" | "company" | "client";

const KEY = "milestones.perspective";

function read(): Perspective {
  if (typeof window === "undefined") return "company";
  const v = window.localStorage.getItem(KEY);
  if (v === "pm" || v === "client") return v;
  return "company";
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
