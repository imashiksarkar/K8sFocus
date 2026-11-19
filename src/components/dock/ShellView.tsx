import { useState } from "react";
import { TermView } from "./TermView";
import type { ShellTab, TerminalTab } from "./types";

/** Pod shell (T19). */
export function ShellView({ tab }: { tab: ShellTab }) {
  const [container, setContainer] = useState(tab.container);
  return (
    <TermView
      prefix="exec"
      depsKey={`${tab.id}/${container}`}
      startArgs={{ context: tab.context, namespace: tab.namespace, pod: tab.pod, container }}
      banner={`Connecting to ${tab.namespace}/${tab.pod} (${container})…`}
      toolbar={<>
        {tab.containers.length > 1 && (
          <select value={container} onChange={(e) => setContainer(e.target.value)} className="h-7 rounded-md border bg-background px-1">
            {tab.containers.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <span className="text-muted-foreground">{tab.context} · {tab.namespace}/{tab.pod}</span>
      </>}
    />
  );
}

/** Local terminal (T20) with KUBECONFIG scoped to the selected context. */
export function LocalTerminalView({ tab }: { tab: TerminalTab }) {
  return (
    <TermView
      prefix="terminal"
      depsKey={tab.id}
      startArgs={{ context: tab.context ?? null }}
      banner={tab.context ? `Local shell · KUBECONFIG scoped to context "${tab.context}"` : "Local shell"}
      toolbar={<span className="text-muted-foreground">
        Local terminal{tab.context && <> · kubectl → <span className="text-primary">{tab.context}</span></>}
      </span>}
    />
  );
}
