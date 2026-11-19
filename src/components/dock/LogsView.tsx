import { useEffect, useMemo, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownToLine, Download, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { LogsTab } from "./types";

type LogEvent = { type: "lines"; lines: string[] } | { type: "end"; error?: string };
const MAX_LINES = 50_000;
const TAIL_OPTIONS = [100, 500, 1000, 5000, -1];

/** Pod logs (roadmap T18): follow, container, previous, timestamps, tail, search, download. Read-only. */
export function LogsView({ tab }: { tab: LogsTab }) {
  const [container, setContainer] = useState(tab.container);
  const [previous, setPrevious] = useState(false);
  const [timestamps, setTimestamps] = useState(false);
  const [tail, setTail] = useState(1000);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "streaming" | "ended">("loading");
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [filterOnly, setFilterOnly] = useState(false);
  const [stick, setStick] = useState(true);
  const [wrap, setWrap] = useState(false);

  useEffect(() => {
    let id: number | undefined;
    let cancelled = false;
    let buf: string[] = [];
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      if (cancelled || !buf.length) return;
      const add = buf; buf = [];
      setLines((l) => {
        const next = l.concat(add);
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };
    setLines([]); setError(undefined); setStatus("loading");
    const ch = new Channel<LogEvent>();
    ch.onmessage = (ev) => {
      if (cancelled) return;
      if (ev.type === "lines") {
        buf.push(...ev.lines);
        setStatus("streaming");
        if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
      } else {
        flush();
        setStatus("ended");
        if (ev.error) setError(ev.error);
      }
    };
    invoke<number>("stream_logs", {
      context: tab.context,
      opts: {
        namespace: tab.namespace, pod: tab.pod, container, previous, timestamps,
        follow: true, tailLines: tail < 0 ? null : tail,
      },
      onEvent: ch,
    }).then((wid) => { if (cancelled) invoke("stop_watch", { id: wid }); else id = wid; })
      .catch((e) => { setError(String(e)); setStatus("ended"); });
    return () => { cancelled = true; if (id !== undefined) invoke("stop_watch", { id }); };
  }, [tab.context, tab.namespace, tab.pod, container, previous, timestamps, tail]);

  const q = search.toLowerCase();
  const shown = useMemo(
    () => (filterOnly && q ? lines.filter((l) => l.toLowerCase().includes(q)) : lines),
    [lines, filterOnly, q],
  );
  const matches = useMemo(() => (q ? lines.reduce((n, l) => n + (l.toLowerCase().includes(q) ? 1 : 0), 0) : 0), [lines, q]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: shown.length, getScrollElement: () => scrollRef.current, estimateSize: () => 18, overscan: 30 });

  useEffect(() => {
    if (stick && shown.length) virt.scrollToIndex(shown.length - 1, { align: "end" });
  }, [shown.length, stick, virt]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }

  async function download() {
    const path = await save({ defaultPath: `${tab.pod}-${container}.log` });
    if (path) await invoke("save_text_file", { path, contents: lines.join("\n") });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-1.5 text-xs">
        <select value={container} onChange={(e) => setContainer(e.target.value)} className="h-7 rounded-md border bg-background px-1">
          {tab.containers.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={tail} onChange={(e) => setTail(Number(e.target.value))} className="h-7 rounded-md border bg-background px-1" title="Lines to load">
          {TAIL_OPTIONS.map((t) => <option key={t} value={t}>{t < 0 ? "all lines" : `last ${t}`}</option>)}
        </select>
        <label className="flex items-center gap-1.5"><Checkbox checked={previous} onCheckedChange={(v) => setPrevious(!!v)} />Previous container</label>
        <label className="flex items-center gap-1.5"><Checkbox checked={timestamps} onCheckedChange={(v) => setTimestamps(!!v)} />Timestamps</label>
        <label className="flex items-center gap-1.5"><Checkbox checked={wrap} onCheckedChange={(v) => setWrap(!!v)} />Wrap</label>
        <div className="relative">
          <Search className="absolute top-1.5 left-1.5 size-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="h-7 w-48 rounded-md border bg-transparent pr-2 pl-6 outline-none focus:border-primary" />
        </div>
        {q && <span className="text-muted-foreground">{matches} matches</span>}
        {q && <label className="flex items-center gap-1.5"><Checkbox checked={filterOnly} onCheckedChange={(v) => setFilterOnly(!!v)} />Only matching</label>}
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          {status === "loading" && <><Loader2 className="size-3 animate-spin" /> connecting</>}
          {status === "streaming" && <><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> following</>}
          {status === "ended" && "stream ended"}
          · {lines.length.toLocaleString()} lines
        </span>
        <Button variant="ghost" size="icon" className="size-7" title="Clear view" onClick={() => setLines([])}><Trash2 /></Button>
        <Button variant="ghost" size="icon" className={cn("size-7", stick && "text-primary")} title="Follow (scroll to bottom)"
          onClick={() => { setStick(true); virt.scrollToIndex(shown.length - 1, { align: "end" }); }}><ArrowDownToLine /></Button>
        <Button variant="ghost" size="icon" className="size-7" title="Download" onClick={download} disabled={!lines.length}><Download /></Button>
      </div>
      {error && <p className="border-b bg-destructive/15 px-3 py-1 text-xs text-destructive select-text">{error}</p>}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto bg-[#111113] font-mono text-xs leading-[18px] select-text">
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((vi) => (
            <div key={vi.key} data-index={vi.index} ref={wrap ? virt.measureElement : undefined}
              className={cn("absolute left-0 w-full px-3", wrap ? "break-all whitespace-pre-wrap" : "whitespace-pre")}
              style={{ transform: `translateY(${vi.start}px)`, minHeight: 18 }}>
              <Highlight text={shown[vi.index]} q={q} />
            </div>
          ))}
        </div>
        {status !== "loading" && !lines.length && !error && <p className="p-3 text-muted-foreground">No logs.</p>}
      </div>
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let i = 0, j: number;
  while ((j = lower.indexOf(q, i)) >= 0) {
    parts.push(text.slice(i, j), <mark key={j} className="bg-primary text-primary-foreground">{text.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  parts.push(text.slice(i));
  return <>{parts}</>;
}
