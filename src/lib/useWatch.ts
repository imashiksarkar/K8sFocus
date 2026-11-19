import { useEffect, useMemo, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { KObject, ResourceRef } from "./resources";

type WatchEvent =
  | { type: "init" } | { type: "ready" }
  | { type: "initApply" | "apply" | "delete"; object: KObject }
  | { type: "error"; message: string };

/**
 * Live list of a resource (read-only list+watch via Rust).
 * namespaces: [] = all. One namespace => namespaced watch; several => cluster-wide watch filtered here.
 */
export function useWatch<T extends KObject = KObject>(
  context: string | undefined, resource: ResourceRef, namespaces: string[] = [],
) {
  const [items, setItems] = useState<Map<string, T>>(new Map());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  const single = resource.namespaced && namespaces.length === 1 ? namespaces[0] : undefined;
  const resKey = JSON.stringify(resource);

  useEffect(() => {
    if (!context) return;
    let id: number | undefined;
    let cancelled = false;
    let pending = new Map<string, T>();
    // batch updates to one render per animation frame (busy clusters emit many events)
    let live = new Map<string, T>();
    let scheduled = false;
    const flush = () => { scheduled = false; if (!cancelled) setItems(new Map(live)); };
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(flush); } };

    setItems(new Map()); setReady(false); setError(undefined);

    const ch = new Channel<WatchEvent>();
    ch.onmessage = (ev) => {
      if (cancelled) return;
      switch (ev.type) {
        case "init": pending = new Map(); break;
        case "initApply": pending.set(ev.object.metadata.uid, ev.object as T); break;
        case "ready": live = pending; setReady(true); setError(undefined); schedule(); break;
        case "apply": live.set(ev.object.metadata.uid, ev.object as T); schedule(); break;
        case "delete": live.delete(ev.object.metadata.uid); schedule(); break;
        case "error": setError(ev.message); break;
      }
    };

    invoke<number>("watch_resource", { context, resource, namespace: single, onEvent: ch })
      .then((wid) => { if (cancelled) invoke("stop_watch", { id: wid }); else id = wid; })
      .catch((e) => setError(String(e)));

    return () => {
      cancelled = true;
      if (id !== undefined) invoke("stop_watch", { id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, resKey, single]);

  const nsKey = namespaces.join(",");
  const list = useMemo(() => {
    const all = [...items.values()];
    if (!resource.namespaced || namespaces.length <= 1) return all;
    const set = new Set(namespaces);
    return all.filter((o) => set.has(o.metadata.namespace ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, nsKey, resource.namespaced]);

  return { items: list, ready, error };
}
