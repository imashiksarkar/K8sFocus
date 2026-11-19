export type LogsTab = {
  id: string; kind: "logs"; title: string;
  context: string; namespace: string; pod: string;
  containers: string[]; container: string;
};
export type DockTab = LogsTab; // shell / terminal tabs arrive in T19/T20
