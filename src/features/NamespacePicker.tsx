import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useWatch } from "@/lib/useWatch";
import { R } from "@/lib/resources";

/** Multi-select namespace filter. Empty selection = all namespaces. */
export function NamespacePicker({ context, value, onChange }: {
  context: string; value: string[]; onChange: (v: string[]) => void;
}) {
  const { items } = useWatch(context, R.namespaces);
  const [q, setQ] = useState("");
  const names = items.map((n) => n.metadata.name).sort();
  const shown = names.filter((n) => n.includes(q));
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);

  const label = value.length === 0 ? "All namespaces" : value.length === 1 ? value[0] : `${value.length} namespaces`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">{label}<ChevronDown /></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter namespaces…"
          className="mb-2 h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-primary"
        />
        <button className="mb-1 w-full rounded px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => onChange([])}>
          <span className={value.length === 0 ? "text-primary" : ""}>All namespaces</span>
        </button>
        <div className="max-h-72 overflow-auto">
          {shown.map((n) => (
            <label key={n} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
              <Checkbox checked={value.includes(n)} onCheckedChange={() => toggle(n)} />
              <span className="truncate">{n}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
