import { useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Pause, Play, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { commonColumns } from "@/components/resource-table/columns";
import { ResourceView } from "@/components/resource-view/ResourceView";
import { Conditions, Fields, KVChips, Section } from "@/components/details/parts";
import { ConfirmAction } from "@/components/editor/ConfirmAction";
import { useCluster } from "@/lib/cluster-context";
import { age, duration, k8sWrite } from "@/lib/k8s";
import { R, type KObject } from "@/lib/resources";
import { useWatch } from "@/lib/useWatch";
import { cn } from "@/lib/utils";
import { WorkloadPods } from "./details";

type ViewProps = { context: string; namespaces: string[] };
const c = createColumnHelper<KObject>();

export function jobStatus(j: KObject): "Complete" | "Failed" | "Suspended" | "Running" {
  const conds: any[] = j.status?.conditions ?? [];
  if (conds.some((x) => x.type === "Complete" && x.status === "True")) return "Complete";
  if (conds.some((x) => x.type === "Failed" && x.status === "True")) return "Failed";
  if (j.spec?.suspend) return "Suspended";
  return "Running";
}
const jobColor = (s: string) =>
  s === "Complete" ? "text-emerald-400" : s === "Failed" ? "text-destructive" : "text-primary";

// ---------------- Jobs ----------------

export function JobsView(p: ViewProps) {
  const columns = useMemo(() => {
    const k = commonColumns<KObject>();
    return [
      k.name, k.namespace,
      c.accessor((o) => o.status?.succeeded ?? 0, {
        id: "completions", header: "Completions",
        cell: (i) => `${i.getValue()}/${i.row.original.spec?.completions ?? 1}`,
      }),
      c.accessor((o) => duration(o.status?.startTime, o.status?.completionTime), { id: "duration", header: "Duration" }),
      c.accessor((o) => o.metadata.ownerReferences?.[0]?.name ?? "", {
        id: "owner", header: "Controlled By", cell: (i) => <span className="text-muted-foreground">{i.getValue()}</span>,
      }),
      k.age,
      c.accessor(jobStatus, { id: "status", header: "Status", cell: (i) => <span className={jobColor(i.getValue())}>{i.getValue()}</span> }),
    ] as ColumnDef<KObject, any>[];
  }, []);
  return (
    <ResourceView {...p} resource={R.jobs} columns={columns}
      details={(o) => (
        <>
          <Section title="Job">
            <Fields rows={[
              ["Status", <span className={jobColor(jobStatus(o))}>{jobStatus(o)}</span>],
              ["Completions", `${o.status?.succeeded ?? 0}/${o.spec?.completions ?? 1} (parallelism ${o.spec?.parallelism ?? 1})`],
              ["Failed pods", o.status?.failed],
              ["Backoff limit", o.spec?.backoffLimit],
              ["Started", o.status?.startTime && new Date(o.status.startTime).toLocaleString()],
              ["Completed", o.status?.completionTime && new Date(o.status.completionTime).toLocaleString()],
              ["Duration", duration(o.status?.startTime, o.status?.completionTime)],
              ["TTL after finish", o.spec?.ttlSecondsAfterFinished !== undefined ? `${o.spec.ttlSecondsAfterFinished}s` : undefined],
              ["Images", (o.spec?.template?.spec?.containers ?? []).map((x: any) => x.image).join(", ")],
              ["Conditions", o.status?.conditions && <Conditions items={o.status.conditions} />],
            ]} />
          </Section>
          <WorkloadPods obj={o} />
        </>
      )} />
  );
}

// ---------------- CronJobs ----------------

function TriggerButton({ obj }: { obj: KObject }) {
  const { context, readOnly } = useCluster();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<string>();
  return (
    <>
      <Button variant="ghost" size="icon" className="size-7" disabled={readOnly}
        title={readOnly ? "Cluster is read-only" : "Trigger now"} onClick={() => { setCreated(undefined); setOpen(true); }}>
        <PlayCircle />
      </Button>
      <ConfirmAction
        open={open} onOpenChange={setOpen}
        title={`Trigger CronJob “${obj.metadata.name}” now?`}
        description={<>Context <b>{context}</b>, namespace <b>{obj.metadata.namespace}</b>. Creates a new Job from the CronJob's template, same as <code>kubectl create job --from=cronjob/{obj.metadata.name}</code>.</>}
        confirmLabel="Trigger"
        onConfirm={async () => setCreated(await k8sWrite.triggerCronJob(context, obj.metadata.namespace!, obj.metadata.name))}
      />
      {created && <span className="text-xs text-emerald-400" title={created}>created ✓</span>}
    </>
  );
}

function SuspendButton({ obj }: { obj: KObject }) {
  const { context, readOnly } = useCluster();
  const [open, setOpen] = useState(false);
  const suspended = !!obj.spec?.suspend;
  return (
    <>
      <Button variant="ghost" size="icon" className="size-7" disabled={readOnly}
        title={readOnly ? "Cluster is read-only" : suspended ? "Resume" : "Suspend"} onClick={() => setOpen(true)}>
        {suspended ? <Play /> : <Pause />}
      </Button>
      <ConfirmAction
        open={open} onOpenChange={setOpen}
        title={`${suspended ? "Resume" : "Suspend"} CronJob “${obj.metadata.name}”?`}
        description={suspended
          ? <>New Jobs will be scheduled again on <code>{obj.spec?.schedule}</code>.</>
          : <>No new Jobs will be scheduled until resumed. Running Jobs are not affected.</>}
        confirmLabel={suspended ? "Resume" : "Suspend"}
        onConfirm={() => k8sWrite.setCronJobSuspend(context, obj.metadata.namespace!, obj.metadata.name, !suspended)}
      />
    </>
  );
}

function CronJobJobs({ cron }: { cron: KObject }) {
  const { context } = useCluster();
  const { items, ready } = useWatch(context, R.jobs, [cron.metadata.namespace!]);
  const jobs = useMemo(
    () => items.filter((j) => j.metadata.ownerReferences?.some((o) => o.uid === cron.metadata.uid))
      .sort((a, b) => (b.metadata.creationTimestamp ?? "").localeCompare(a.metadata.creationTimestamp ?? "")),
    [items, cron.metadata.uid],
  );
  return (
    <Section title={`Jobs (${jobs.length})`}>
      {!ready ? <p className="text-sm text-muted-foreground">Loading…</p>
        : !jobs.length ? <p className="text-sm text-muted-foreground">No jobs.</p>
        : (
          <ul className="space-y-1 text-sm">
            {jobs.map((j) => {
              const s = jobStatus(j);
              return (
                <li key={j.metadata.uid} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate">{j.metadata.name}</span>
                  {j.metadata.annotations?.["cronjob.kubernetes.io/instantiate"] === "manual" && <Badge variant="outline">manual</Badge>}
                  <span className="text-muted-foreground">{age(j.metadata.creationTimestamp)}</span>
                  <span className={jobColor(s)}>{s}</span>
                </li>
              );
            })}
          </ul>
        )}
    </Section>
  );
}

export function CronJobsView(p: ViewProps) {
  const columns = useMemo(() => {
    const k = commonColumns<KObject>();
    return [
      k.name, k.namespace,
      c.accessor((o) => o.spec?.schedule ?? "", { id: "schedule", header: "Schedule", cell: (i) => <code className="text-xs">{i.getValue()}</code> }),
      c.accessor((o) => !!o.spec?.suspend, {
        id: "suspend", header: "Suspend",
        cell: (i) => <span className={cn(i.getValue() && "text-primary")}>{i.getValue() ? "True" : "False"}</span>,
      }),
      c.accessor((o) => o.status?.active?.length ?? 0, { id: "active", header: "Active" }),
      c.accessor((o) => o.status?.lastScheduleTime ?? "", {
        id: "lastSchedule", header: "Last Schedule", cell: (i) => (i.getValue() ? `${age(i.getValue())} ago` : "—"),
      }),
      k.age,
    ] as ColumnDef<KObject, any>[];
  }, []);
  return (
    <ResourceView {...p} resource={R.cronjobs} columns={columns}
      actions={(o) => <><TriggerButton obj={o} /><SuspendButton obj={o} /></>}
      details={(o) => (
        <>
          <Section title="CronJob">
            <Fields rows={[
              ["Schedule", <code>{o.spec?.schedule}</code>],
              ["Time zone", o.spec?.timeZone],
              ["Suspended", String(!!o.spec?.suspend)],
              ["Concurrency", o.spec?.concurrencyPolicy],
              ["Starting deadline", o.spec?.startingDeadlineSeconds !== undefined ? `${o.spec.startingDeadlineSeconds}s` : undefined],
              ["History limits", `${o.spec?.successfulJobsHistoryLimit ?? 3} successful · ${o.spec?.failedJobsHistoryLimit ?? 1} failed`],
              ["Last schedule", o.status?.lastScheduleTime && new Date(o.status.lastScheduleTime).toLocaleString()],
              ["Last success", o.status?.lastSuccessfulTime && new Date(o.status.lastSuccessfulTime).toLocaleString()],
              ["Images", (o.spec?.jobTemplate?.spec?.template?.spec?.containers ?? []).map((x: any) => x.image).join(", ")],
              ["Job labels", o.spec?.jobTemplate?.metadata?.labels && <KVChips map={o.spec.jobTemplate.metadata.labels} />],
            ]} />
          </Section>
          <CronJobJobs cron={o} />
        </>
      )} />
  );
}
