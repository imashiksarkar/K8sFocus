/**
 * Turn raw backend errors (kube-rs Debug strings, helm stderr, JSON, our own messages)
 * into something a person can read: a short title, the real message, and a hint.
 */
export type FriendlyError = {
  title: string;
  message: string;
  hint?: string;
  /** HTTP status from the API server, when known. */
  code?: number;
  /** Original text, shown under "Details". */
  raw: string;
};

const BY_CODE: Record<number, { title: string; hint?: string }> = {
  400: { title: "Bad request", hint: "The API server rejected the request. Check the YAML or input." },
  401: { title: "Not authenticated", hint: "Your credentials for this cluster expired or are invalid. Log in again (e.g. refresh your cloud CLI login) and reconnect." },
  403: { title: "Permission denied", hint: "Your user isn't allowed to do this. Ask a cluster admin for the RBAC permission, or pick a namespace you can access." },
  404: { title: "Not found", hint: "It may have been deleted, or the API isn't installed on this cluster." },
  405: { title: "Not allowed", hint: "This operation isn't supported for this resource." },
  409: { title: "Conflict", hint: "Someone else changed this resource, or another tool owns these fields. Reload and try again." },
  410: { title: "Expired", hint: "The data is out of date. It will reload automatically." },
  422: { title: "Invalid resource", hint: "The API server validated the change and rejected it. Fix the fields mentioned above." },
  429: { title: "Blocked or rate limited", hint: "The server asked to slow down, or a PodDisruptionBudget blocked the action. Try again later." },
  500: { title: "Cluster server error", hint: "The API server hit an internal error. Try again in a moment." },
  503: { title: "Service unavailable", hint: "The API (or an add-on like metrics-server) isn't available right now." },
};

function unquote(s: string) {
  return s.replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
}

export function friendlyError(input: unknown): FriendlyError {
  const raw = (input instanceof Error ? input.message : typeof input === "string" ? input : JSON.stringify(input)) ?? "";
  const text = raw.trim();

  // 1. JSON body (e.g. a Status object)
  if (text.startsWith("{")) {
    try {
      const j = JSON.parse(text);
      const code = Number(j.code) || undefined;
      const base: { title: string; hint?: string } = (code && BY_CODE[code]) || { title: j.reason || "Request failed" };
      return { title: base.title, message: j.message ?? text, hint: base.hint, code, raw: text };
    } catch { /* not JSON */ }
  }

  // 2. kube-rs ApiError: ... ErrorResponse { status, message, reason, code }
  const er = /ErrorResponse\s*\{[^}]*?message:\s*"((?:[^"\\]|\\.)*)"[^}]*?reason:\s*"((?:[^"\\]|\\.)*)"[^}]*?code:\s*(\d+)/s.exec(text);
  if (er) {
    const code = Number(er[3]);
    const base: { title: string; hint?: string } = BY_CODE[code] ?? { title: er[2] || `Request failed (${code})` };
    const prefix = text.match(/^([^:]+\/[^:]+):\s/)?.[1]; // e.g. "Deployment/web: ApiError…"
    return { title: base.title, message: (prefix ? `${prefix}: ` : "") + unquote(er[1]), hint: base.hint, code, raw: text };
  }

  // 3. Our own Rust messages and common transport failures
  const rules: [RegExp, string, string?][] = [
    [/is read-only/i, "Cluster is read-only", "Turn on Read-write in the header to allow changes to this cluster."],
    [/helm CLI not found/i, "helm isn't installed", "Install it with `brew install helm`, or set its path in Preferences, then restart K8sFocus."],
    [/No kubeconfig contexts found/i, "No kubeconfig found", "Add a kubeconfig in Preferences → Kubeconfig, or create ~/.kube/config."],
    [/context .* not found in kubeconfig/i, "Context not found", "The context was removed from your kubeconfig. Remove it from the hotbar or re-add it."],
    [/exec|auth plugin|gke-gcloud-auth-plugin|aws.*(token|eks)|kubelogin/i, "Cluster login failed", "The kubeconfig's login helper failed or isn't installed. Run the same login in a terminal (e.g. `aws sso login`, `gcloud auth login`) and retry."],
    [/certificate|x509|tls|InvalidCertificate|UnknownIssuer/i, "TLS / certificate problem", "The cluster's certificate couldn't be verified. Check the CA in your kubeconfig."],
    [/connection refused|Connect\b|tcp connect|dns error|failed to lookup|No route to host|network is unreachable/i, "Can't reach the cluster", "Check your network or VPN, and that the cluster is running."],
    [/timed out|timeout|deadline/i, "Request timed out", "The cluster didn't respond in time. Check your connection and try again."],
    [/address already in use|Address in use/i, "Port already in use", "Pick another local port, or stop whatever is using it."],
    [/no ready pod/i, "No ready pod", "None of the pods behind this service are Running and Ready."],
    [/Invalid YAML|did not find expected|mapping values are not allowed/i, "Invalid YAML", "Fix the indentation or syntax near the position mentioned."],
    [/Unknown resource/i, "Unknown resource type", "This kind/apiVersion isn't served by the cluster. Is the CRD installed?"],
    [/INSTALLATION FAILED|UPGRADE FAILED|Error: /, "Helm command failed"],
  ];
  for (const [re, title, hint] of rules) {
    if (re.test(text)) {
      const msg = text.replace(/^Error:\s*/, "").split("\n")[0];
      return { title, message: msg.length > 400 ? `${msg.slice(0, 400)}…` : msg, hint, raw: text };
    }
  }

  const first = text.split("\n")[0] || "Unknown error";
  return { title: "Something went wrong", message: first.length > 400 ? `${first.slice(0, 400)}…` : first, raw: text };
}
