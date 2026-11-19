type PodBase = { id: string; title: string; context: string; namespace: string; pod: string; containers: string[]; container: string };
export type LogsTab = PodBase & { kind: "logs" };
export type ShellTab = PodBase & { kind: "shell" };
export type TerminalTab = { id: string; kind: "terminal"; title: string; context?: string };
export type DockTab = LogsTab | ShellTab | TerminalTab;
