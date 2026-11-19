import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { b64ToBytes, createTerminal } from "./xterm";
import type { ShellTab } from "./types";

type ExecEvent = { type: "data"; b64: string } | { type: "exit"; message: string };

/** Interactive shell into a pod container (roadmap T19). */
export function ShellView({ tab }: { tab: ShellTab }) {
  const host = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState(tab.container);
  const [session, setSession] = useState(0); // bump to reconnect
  const [state, setState] = useState<"connecting" | "open" | "closed">("connecting");

  useEffect(() => {
    const el = host.current!;
    const { term, fit } = createTerminal();
    term.open(el);
    let id: number | undefined;
    let cancelled = false;
    const safeFit = () => { if (el.clientWidth > 0 && el.clientHeight > 0) fit.fit(); };
    safeFit();
    setState("connecting");
    term.writeln(`\x1b[90mConnecting to ${tab.namespace}/${tab.pod} (${container})…\x1b[0m`);

    const ch = new Channel<ExecEvent>();
    ch.onmessage = (ev) => {
      if (cancelled) return;
      if (ev.type === "data") term.write(b64ToBytes(ev.b64));
      else {
        setState("closed");
        term.writeln(`\r\n\x1b[33m[session ${ev.message}]\x1b[0m`);
      }
    };

    invoke<number>("exec_start", {
      context: tab.context, namespace: tab.namespace, pod: tab.pod, container,
      cols: term.cols, rows: term.rows, onEvent: ch,
    }).then((sid) => {
      if (cancelled) { invoke("exec_close", { id: sid }); return; }
      id = sid;
      setState("open");
      term.focus();
    }).catch((e) => {
      setState("closed");
      term.writeln(`\r\n\x1b[31m${String(e)}\x1b[0m`);
    });

    const dataSub = term.onData((d) => { if (id !== undefined) invoke("exec_write", { id, data: d }).catch(() => {}); });
    const resizeSub = term.onResize(({ cols, rows }) => { if (id !== undefined) invoke("exec_resize", { id, cols, rows }); });
    const ro = new ResizeObserver(() => safeFit());
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect(); dataSub.dispose(); resizeSub.dispose();
      if (id !== undefined) invoke("exec_close", { id });
      term.dispose();
    };
  }, [tab.context, tab.namespace, tab.pod, container, session]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b px-3 py-1.5 text-xs">
        {tab.containers.length > 1 && (
          <select value={container} onChange={(e) => setContainer(e.target.value)} className="h-7 rounded-md border bg-background px-1">
            {tab.containers.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <span className="text-muted-foreground">{tab.context} · {tab.namespace}/{tab.pod}</span>
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          <span className={state === "open" ? "size-1.5 rounded-full bg-emerald-400" : state === "connecting" ? "size-1.5 animate-pulse rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground"} />
          {state}
        </span>
        <Button variant="ghost" size="icon" className="size-7" title="Reconnect" onClick={() => setSession((n) => n + 1)}><RotateCw /></Button>
      </div>
      <div ref={host} className="min-h-0 flex-1 bg-[#111113] p-1" />
    </div>
  );
}
