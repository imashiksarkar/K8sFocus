import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";

/** xterm.js instance with the app theme; links open in the system browser. */
export function createTerminal() {
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'Menlo, "SF Mono", Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    scrollback: 10_000,
    macOptionIsMeta: true,
    allowProposedApi: true,
    theme: {
      background: "#111113", foreground: "#e4e4e7", cursor: "#facc15", cursorAccent: "#111113",
      selectionBackground: "#facc1555", yellow: "#facc15", brightYellow: "#fde047",
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_e, url) => { openUrl(url).catch(() => {}); }));
  return { term, fit };
}

export function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
