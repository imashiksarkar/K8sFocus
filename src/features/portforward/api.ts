import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ForwardInfo = {
  id: number; context: string; namespace: string; kind: "pod" | "service"; name: string;
  requestedPort: number; localPort?: number;
  status: "active" | "paused" | "error";
  pod: string; remotePort: number; connections: number; lastError?: string;
};

export const portForward = {
  start: (context: string, req: { namespace: string; kind: "pod" | "service"; name: string; port: number; localPort?: number }) =>
    invoke<ForwardInfo>("port_forward_start", { context, req }),
  list: () => invoke<ForwardInfo[]>("port_forward_list"),
  pause: (id: number) => invoke<void>("port_forward_pause", { id }),
  resume: (id: number) => invoke<void>("port_forward_resume", { id }),
  remove: (id: number) => invoke<void>("port_forward_remove", { id }),
};

/** Saved forwards (active, paused or failed). Rust emits "port-forwards-changed". */
export function usePortForwards() {
  const [items, setItems] = useState<ForwardInfo[]>([]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    const refresh = () => portForward.list().then((x) => alive && setItems(x)).catch(() => {});
    refresh();
    listen("port-forwards-changed", refresh).then((u) => { if (alive) unlisten = u; else u(); });
    return () => { alive = false; unlisten?.(); };
  }, []);
  return items;
}
