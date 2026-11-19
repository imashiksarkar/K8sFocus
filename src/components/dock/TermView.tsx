import { useEffect, useRef, useState, type ReactNode } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { b64ToBytes, createTerminal } from "./xterm";

type Event = { type: "data"; b64: string } | { type: "exit"; message: string };

/**
 * xterm.js bound to a Rust session. `prefix` selects the command family:
 * "exec" (pod shell, T19) or "terminal" (local PTY, T20).
 */
export function TermView({ prefix, startArgs, banner, toolbar, depsKey }: {
  prefix: "exec" | "terminal";
  startArgs: Record<string, unknown>;
  banner: string;
  toolbar?: ReactNode;
  depsKey: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState(0);
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
    term.writeln(`\x1b[90m${banner}\x1b[0m`);

    const ch = new Channel<Event>();
    ch.onmessage = (ev) => {
      if (cancelled) return;
      if (ev.type === "data") term.write(b64ToBytes(ev.b64));
      else { setState("closed"); term.writeln(`\r\n\x1b[33m[session ${ev.message}]\x1b[0m`); }
    };

    invoke<number>(`${prefix}_start`, { ...startArgs, cols: term.cols, rows: term.rows, onEvent: ch })
      .then((sid) => {
        if (cancelled) { invoke(`${prefix}_close`, { id: sid }); return; }
        id = sid; setState("open"); term.focus();
      })
      .catch((e) => { setState("closed"); term.writeln(`\r\n\x1b[31m${String(e)}\x1b[0m`); });

    const dataSub = term.onData((d) => { if (id !== undefined) invoke(`${prefix}_write`, { id, data: d }).catch(() => {}); });
    const resizeSub = term.onResize(({ cols, rows }) => { if (id !== undefined) invoke(`${prefix}_resize`, { id, cols, rows }); });
    const ro = new ResizeObserver(() => safeFit());
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect(); dataSub.dispose(); resizeSub.dispose();
      if (id !== undefined) invoke(`${prefix}_close`, { id });
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, session]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b px-3 py-1.5 text-xs">
        {toolbar}
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          <span className={state === "open" ? "size-1.5 rounded-full bg-emerald-400" : state === "connecting" ? "size-1.5 animate-pulse rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground"} />
          {state}
        </span>
        <Button variant="ghost" size="icon" className="size-7" title="Restart session" onClick={() => setSession((n) => n + 1)}><RotateCw /></Button>
      </div>
      <div ref={host} className="min-h-0 flex-1 bg-[#111113] p-1" />
    </div>
  );
}
