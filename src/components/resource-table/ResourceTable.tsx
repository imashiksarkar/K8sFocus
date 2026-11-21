import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnSizingState, type RowSelectionState, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Columns3, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ErrorCard } from "@/components/ui/ErrorCard";

const ROW_HEIGHT = 34;

function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}
function saveJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

export type ResourceTableProps<T> = {
  /** Unique key for persisting sort + column visibility, e.g. "pods". */
  id: string;
  items: T[];
  columns: ColumnDef<T, any>[];
  getRowId: (row: T) => string;
  /** Text that the search box matches against. */
  searchText: (row: T) => string;
  ready?: boolean;
  error?: string;
  defaultSort?: SortingState;
  onRowClick?: (row: T) => void;
  selectedRowId?: string;
  /** Rendered in the toolbar when rows are selected (bulk actions later). */
  selectionActions?: (rows: T[]) => ReactNode;
  toolbar?: ReactNode;
};

/**
 * Generic live resource table (roadmap T6): sorting, search, column visibility,
 * multi-select, virtualized rows. Read-only by itself — actions are passed in.
 */
export function ResourceTable<T>({
  id, items, columns, getRowId, searchText, ready = true, error,
  defaultSort = [], onRowClick, selectedRowId, selectionActions, toolbar,
}: ResourceTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(() => loadJSON(`table.${id}.sort`, defaultSort));
  const [visibility, setVisibility] = useState<VisibilityState>(() => loadJSON(`table.${id}.cols`, {}));
  const [sizing, setSizing] = useState<ColumnSizingState>(() => loadJSON(`table.${id}.sizes`, {}));
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [search, setSearch] = useState("");

  useEffect(() => saveJSON(`table.${id}.sort`, sorting), [id, sorting]);
  useEffect(() => saveJSON(`table.${id}.cols`, visibility), [id, visibility]);
  useEffect(() => saveJSON(`table.${id}.sizes`, sizing), [id, sizing]);

  const allColumns = useMemo<ColumnDef<T, any>[]>(() => [
    {
      id: "_select",
      size: 36,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && "indeterminate")}
          onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
    },
    ...columns,
  ], [columns]);

  const table = useReactTable({
    data: items,
    columns: allColumns,
    getRowId: (r) => getRowId(r),
    state: { sorting, columnVisibility: visibility, columnSizing: sizing, rowSelection: selection, globalFilter: search },
    defaultColumn: { size: 140, minSize: 50 },
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    onColumnSizingChange: setSizing,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _col, value: string) =>
      searchText(row.original).toLowerCase().includes(value.toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
    autoResetAll: false,
  });

  // drop selections for rows that disappeared (deleted in the cluster)
  useEffect(() => {
    const ids = new Set(items.map(getRowId));
    setSelection((s) => {
      const keys = Object.keys(s).filter((k) => ids.has(k));
      return keys.length === Object.keys(s).length ? s : Object.fromEntries(keys.map((k) => [k, true]));
    });
  }, [items, getRowId]);

  // ⌘F / Ctrl+F focuses the search box (unless typing in an editor/terminal)
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        const t = e.target as HTMLElement;
        if (t.closest(".monaco-editor, .xterm")) return;
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });
  const vItems = virtual.getVirtualItems();
  const padTop = vItems[0]?.start ?? 0;
  const padBottom = vItems.length ? virtual.getTotalSize() - vItems[vItems.length - 1].end : 0;
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const colCount = table.getVisibleLeafColumns().length + 1; // + filler column

  // Row click opens details. Ignore clicks that end a text-selection drag, and take
  // focus away from the search box so the click never feeds the filter.
  function rowClick(row: T) {
    if (window.getSelection()?.toString()) return;
    if (document.activeElement === searchRef.current) searchRef.current?.blur();
    onRowClick?.(row);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <div className="relative">
          <Search className="absolute top-2 left-2 size-4 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search… (⌘F)"
            className="h-8 w-64 rounded-md border bg-transparent pr-2 pl-8 text-sm outline-none focus:border-primary"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length}{rows.length !== items.length && ` of ${items.length}`} items
          {selectedRows.length > 0 && ` · ${selectedRows.length} selected`}
        </span>
        {selectedRows.length > 0 && selectionActions?.(selectedRows)}
        {toolbar}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {ready ? (
            <><span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> live</>
          ) : (
            <><Loader2 className="size-3 animate-spin" /> loading</>
          )}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" title="Columns"><Columns3 /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={c.getIsVisible()}
                onCheckedChange={(v) => c.toggleVisibility(!!v)}
                onSelect={(e) => e.preventDefault()}
              >
                {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ErrorCard error={error} className="mx-4 mt-2" />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <table className="caption-bottom text-sm" style={{ tableLayout: "fixed", width: `max(100%, ${table.getTotalSize()}px)` }}>
          <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      style={{ width: h.getSize() }}
                      className={cn(
                        "group/th relative h-9 truncate px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground select-none",
                        h.column.getCanSort() && "cursor-pointer hover:text-foreground",
                      )}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" && <ArrowUp className="size-3 text-primary" />}
                        {sorted === "desc" && <ArrowDown className="size-3 text-primary" />}
                      </span>
                      {h.column.getCanResize() && (
                        <div
                          onMouseDown={h.getResizeHandler()}
                          onTouchStart={h.getResizeHandler()}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => { e.stopPropagation(); h.column.resetSize(); }}
                          title="Drag to resize · double-click to reset"
                          className={cn(
                            "absolute top-1.5 right-0 bottom-1.5 w-1.5 cursor-col-resize border-r border-border group-hover/th:border-muted-foreground",
                            h.column.getIsResizing() && "border-primary group-hover/th:border-primary",
                          )}
                        />
                      )}
                    </th>
                  );
                })}
                <th />
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && <tr><td colSpan={colCount} style={{ height: padTop }} /></tr>}
            {vItems.map((vi) => {
              const row = rows[vi.index];
              return (
                <tr
                  key={row.id}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => rowClick(row.original)}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/50",
                    onRowClick && "cursor-pointer",
                    row.getIsSelected() && "bg-muted",
                    selectedRowId === row.id && "bg-accent",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="truncate px-2 align-middle whitespace-nowrap select-text">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  <td />
                </tr>
              );
            })}
            {padBottom > 0 && <tr><td colSpan={colCount} style={{ height: padBottom }} /></tr>}
          </tbody>
        </table>
        {ready && rows.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {items.length ? "No items match your search." : "No resources found."}
          </p>
        )}
      </div>
    </div>
  );
}
