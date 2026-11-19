import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Prefs = {
  kubeconfigPaths: string[];
  helmPath: string;
  shell: string;
  terminalFontSize: number;
  metricsIntervalSecs: number;
  helmPollSecs: number;
  theme: "dark" | "light" | "system";
};

export const DEFAULT_PREFS: Prefs = {
  kubeconfigPaths: [], helmPath: "", shell: "", terminalFontSize: 12,
  metricsIntervalSecs: 15, helmPollSecs: 10, theme: "dark",
};

let current: Prefs = DEFAULT_PREFS;
const subs = new Set<(p: Prefs) => void>();

/** Synchronous read for non-React code (xterm, pollers). */
export const getPrefs = () => current;

function apply(p: Prefs) {
  const dark = p.theme === "dark" || (p.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export async function loadPrefs() {
  try { current = { ...DEFAULT_PREFS, ...(await invoke<Prefs>("load_prefs")) }; } catch { /* defaults */ }
  apply(current);
  subs.forEach((f) => f(current));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => apply(current));
}

export async function savePrefs(p: Prefs) {
  await invoke("save_prefs", { prefs: p });
  current = p;
  apply(p);
  subs.forEach((f) => f(p));
}

export function usePrefs() {
  const [p, setP] = useState(current);
  useEffect(() => { subs.add(setP); setP(current); return () => { subs.delete(setP); }; }, []);
  return p;
}
