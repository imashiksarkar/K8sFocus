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

export type HelmRepo = { name: string; url: string };
export type HelmChart = { name: string; version: string; app_version: string; description: string };

export const helmCharts = {
  repos: () => invoke<HelmRepo[]>("helm_repo_list"),
  addRepo: (name: string, url: string) => invoke<string>("helm_repo_add", { name, url }),
  removeRepo: (name: string) => invoke<string>("helm_repo_remove", { name }),
  updateRepos: () => invoke<string>("helm_repo_update"),
  search: (query: string, versions = false) => invoke<HelmChart[]>("helm_search", { query, versions }),
  show: (chart: string, what: "values" | "readme" | "chart", version?: string) => invoke<string>("helm_show", { chart, version, what }),
  install: (context: string, req: {
    name: string; namespace: string; chart: string; version?: string; values: string; createNamespace: boolean; dryRun: boolean;
  }) => invoke<string>("helm_install", { context, req }),
};

/** "nginx-15.1.0" -> "nginx" */
export const chartBaseName = (chart: string) => chart.replace(/-v?\d+\.\d+.*$/, "");
