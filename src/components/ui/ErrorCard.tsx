import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Copy, X } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * User-friendly error display: plain-language title, the actual message, a hint,
 * and the raw backend text tucked under "Details" (with copy).
 */
export function ErrorCard({ error, title, className, compact, onDismiss }: {
  error?: unknown;
  /** Overrides the derived title, e.g. "Couldn't load pods". */
  title?: string;
  className?: string;
  /** One-line style for banners (logs, toolbars). */
  compact?: boolean;
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (error === undefined || error === null || error === "") return null;
  const e = friendlyError(error);
  const showDetails = e.raw && e.raw !== e.message;

  function copy() {
    navigator.clipboard?.writeText(e.raw).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); });
  }

  return (
    <div role="alert" className={cn(
      "rounded-lg border border-destructive/30 bg-destructive/10 text-sm select-text",
      compact ? "px-3 py-1.5" : "p-3",
      className,
    )}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={cn("shrink-0 text-destructive", compact ? "mt-0.5 size-3.5" : "mt-0.5 size-4")} />
        <div className="min-w-0 flex-1">
          <div className={cn("flex flex-wrap items-baseline gap-x-2", compact && "text-xs")}>
            <span className="font-semibold text-destructive">{title ?? e.title}</span>
            {e.code && <span className="text-[11px] text-muted-foreground">HTTP {e.code}</span>}
            {compact && <span className="min-w-0 truncate text-foreground/80" title={e.message}>{e.message}</span>}
          </div>
          {!compact && <p className="mt-1 wrap-break-word text-xs text-foreground/90">{e.message}</p>}
          {!compact && e.hint && <p className="mt-1.5 text-xs text-muted-foreground">{e.hint}</p>}
          {!compact && showDetails && (
            <div className="mt-2">
              <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} /> Details
              </button>
              {open && (
                <div className="relative mt-1">
                  <pre className="max-h-48 overflow-auto rounded-md bg-background/60 p-2 pr-8 font-mono text-[11px] break-all whitespace-pre-wrap text-muted-foreground">{e.raw}</pre>
                  <button onClick={copy} title="Copy" className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground">
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} title="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
