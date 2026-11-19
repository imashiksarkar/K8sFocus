// Bundle Monaco locally (no CDN — the app must work offline).
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker.start?worker";
import { loader } from "@monaco-editor/react";

self.MonacoEnvironment = { getWorker: () => new editorWorker() };
loader.config({ monaco });

monaco.editor.defineTheme("k8sfocus", {
  base: "vs-dark",
  inherit: true,
  rules: [{ token: "type", foreground: "facc15" }],
  colors: {
    "editor.background": "#18181b",
    "editorCursor.foreground": "#facc15",
    "editor.lineHighlightBackground": "#27272a",
  },
});
