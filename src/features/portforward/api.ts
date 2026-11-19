import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ForwardInfo = {
  id: number; context: string; namespace: string; kind: "pod" | "service"; name: string; pod: string;
  requestedPort: number; remotePort: number; localPort: number; connections: number; lastError?: string;
};

export const portForward = {
  start: (context: string, req: { namespace: string; kind: "pod" | "service"; name: string; port: number; localPort?: number }) =>
    invoke<ForwardInfo>("port_forward_start", { context, req }),
  list: () => invoke<ForwardInfo[]>("port_forward_list"),
  stop: (id: number) => invoke<void>("port_forward_stop", { id }),
};

/** Live list of active forwards (Rust emits "port-forwards-changed"). */
export function usePortForwards() {
  const [items, setItems] = useState<ForwardInfo[]>([]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const refresh = () => portForward.list().then(setItems).catch(() => {});
    refresh();
    listen("port-forwards-changed", refresh).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);
  return items;
}
