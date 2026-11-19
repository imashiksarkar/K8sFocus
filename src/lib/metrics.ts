import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { parseQuantity } from "./k8s";
import type { ResourceRef } from "./resources";
import { getPrefs } from "./prefs";

/**
 * metrics-server polling (roadmap T22). metrics.k8s.io has no watch, so we poll (interval from Preferences).
 * One shared poller per (context, kind) regardless of how many components subscribe.
 * Keeps the last HISTORY samples per object for sparklines.
 */
const HISTORY = 20;

export type Usage = { cpu: number; memory: number; containers?: Record<string, { cpu: number; memory: number }> };
export type MetricsSnapshot = {
  available: boolean | undefined; // undefined = still checking
  error?: string;
  usage: Map<string, Usage>; // key: "ns/name" for pods, "name" for nodes
  history: Map<string, { cpu: number[]; memory: number[] }>;
};

const RES: Record<"pods" | "nodes", ResourceRef> = {
  pods: { group: "metrics.k8s.io", version: "v1beta1", kind: "PodMetrics", plural: "pods", namespaced: true },
  nodes: { group: "metrics.k8s.io", version: "v1beta1", kind: "NodeMetrics", plural: "nodes", namespaced: false },
};

type Poller = { snap: MetricsSnapshot; subs: Set<(s: MetricsSnapshot) => void>; timer?: number };
const pollers = new Map<string, Poller>();

function sum(containers: any[]) {
  const per: Record<string, { cpu: number; memory: number }> = {};
  let cpu = 0, memory = 0;
  for (const c of containers) {
    const u = { cpu: parseQuantity(c.usage?.cpu), memory: parseQuantity(c.usage?.memory) };
    per[c.name] = u; cpu += u.cpu; memory += u.memory;
  }
  return { cpu, memory, containers: per };
}

async function poll(key: string, context: string, kind: "pods" | "nodes") {
  const p = pollers.get(key);
  if (!p) return;
  try {
    const items = await invoke<any[]>("list_resource", { context, resource: RES[kind], namespace: null });
    const usage = new Map<string, Usage>();
    const history = new Map(p.snap.history);
    for (const m of items) {
      const k = kind === "pods" ? `${m.metadata.namespace}/${m.metadata.name}` : m.metadata.name;
      const u: Usage = kind === "pods" ? sum(m.containers ?? []) : { cpu: parseQuantity(m.usage?.cpu), memory: parseQuantity(m.usage?.memory) };
      usage.set(k, u);
      const h = history.get(k) ?? { cpu: [], memory: [] };
      history.set(k, { cpu: [...h.cpu, u.cpu].slice(-HISTORY), memory: [...h.memory, u.memory].slice(-HISTORY) });
    }
    for (const k of history.keys()) if (!usage.has(k)) history.delete(k);
    p.snap = { available: true, usage, history };
  } catch (e) {
    const msg = String(e);
    // 404 / "could not find the requested resource" => metrics-server not installed
    const missing = /404|not find|NotFound|ServiceUnavailable|503/i.test(msg);
    p.snap = { ...p.snap, available: missing ? false : p.snap.available ?? false, error: msg };
  }
  p.subs.forEach((f) => f(p.snap));
}

export function useMetrics(context: string | undefined, kind: "pods" | "nodes"): MetricsSnapshot {
  const empty: MetricsSnapshot = { available: undefined, usage: new Map(), history: new Map() };
  const key = `${context}|${kind}`;
  const [snap, setSnap] = useState<MetricsSnapshot>(() => pollers.get(key)?.snap ?? empty);

  useEffect(() => {
    if (!context) return;
    let p = pollers.get(key);
    if (!p) {
      p = { snap: empty, subs: new Set() };
      pollers.set(key, p);
      poll(key, context, kind);
      p.timer = window.setInterval(() => poll(key, context, kind), getPrefs().metricsIntervalSecs * 1000);
    }
    p.subs.add(setSnap);
    setSnap(p.snap);
    return () => {
      p!.subs.delete(setSnap);
      if (!p!.subs.size) { clearInterval(p!.timer); pollers.delete(key); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return snap;
}

export const fmtCpu = (cores: number) => (cores < 1 ? `${Math.round(cores * 1000)}m` : `${cores.toFixed(2)}`);
export const fmtMem = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)}Gi` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)}Mi` : `${Math.round(b / 1024)}Ki`;
