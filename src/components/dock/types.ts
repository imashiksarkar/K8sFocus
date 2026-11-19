type Base = { id: string; title: string; context: string; namespace: string; pod: string; containers: string[]; container: string };
export type LogsTab = Base & { kind: "logs" };
export type ShellTab = Base & { kind: "shell" };
export type DockTab = LogsTab | ShellTab; // local terminal arrives in T20
