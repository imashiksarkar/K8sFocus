import { invoke } from "@tauri-apps/api/core";

export type HelmRelease = {
  name: string; namespace: string; revision: string; updated: string;
  status: string; chart: string; app_version: string;
};
export type HelmRevision = { revision: number; updated: string; status: string; chart: string; app_version: string; description: string };

export const helm = {
  list: (context: string, namespace?: string) => invoke<HelmRelease[]>("helm_list", { context, namespace }),
  get: (context: string, req: { namespace: string; name: string; what: string; revision?: number }) =>
    invoke<string>("helm_get", { context, req }),
  history: (context: string, namespace: string, name: string) => invoke<HelmRevision[]>("helm_history", { context, namespace, name }),
  rollback: (context: string, namespace: string, name: string, revision: number) =>
    invoke<string>("helm_rollback", { context, namespace, name, revision }),
  uninstall: (context: string, namespace: string, name: string) => invoke<string>("helm_uninstall", { context, namespace, name }),
};

/** helm prints "2024-05-01 10:00:00.123 +0000 UTC" — make it Date-parsable. */
export function helmDate(s: string) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)? ([+-]\d{2})(\d{2})/.exec(s);
  return m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : s;
}
