import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const isMac = navigator.platform.toLowerCase().includes("mac");
const mod = isMac ? "⌘" : "Ctrl+";

export const SHORTCUTS: [string, string][] = [
  [`${mod}K`, "Command palette"],
  [`${mod}F`, "Search the current table"],
  [`${mod}J`, "Show / hide dock"],
  [`${mod}T`, "New local terminal"],
  [`${mod}N`, "New resource from YAML"],
  [`${mod}1 … ${mod}9`, "Switch cluster"],
  [`${mod}⇧O`, "Cluster overview"],
  [`${mod},`, "Preferences"],
  ["Esc", "Close panel / dialog"],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k} className="border-b last:border-0">
                <td className="py-1.5 pr-4"><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd></td>
                <td className="py-1.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
