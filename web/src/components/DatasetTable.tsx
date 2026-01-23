"use client";

import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Row = Record<string, string>;

type RowData = {
  row: Row;
  rowId: string;
};

function makeRowId(row: Row, idx: number): string {
  const key = (row.key ?? "").trim();
  if (key) return key;
  const name = (row.name ?? "").trim();
  if (name) return name;
  return String(idx);
}

export function DatasetTable({
  columns,
  rows,
  selectedId,
  onToggleSelect,
}: {
  columns: string[];
  rows: Row[];
  selectedId: string | null;
  onToggleSelect: (row: Row, rowId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const visibleColumns = useMemo(() => {
    const preferred = ["key", "name", "ra", "dec", "host", "distance", "M_V", "mass_stellar"];
    const selected = preferred.filter((c) => columns.includes(c));
    const rest = columns.filter((c) => !selected.includes(c));
    return [...selected, ...rest].slice(0, 10);
  }, [columns]);

  const indexedRows = useMemo(() => rows.map((row, idx) => ({ row, idx })), [rows]);

  const data = useMemo<RowData[]>(() => {
    return indexedRows.map(({ row, idx }) => ({ row, rowId: makeRowId(row, idx) }));
  }, [indexedRows]);

  const columnsDef = useMemo<ColumnDef<RowData>[]>(() => {
    return visibleColumns.map((c) => ({
      id: c,
      enableHiding: true,
      enableSorting: true,
      header: ({ column }) => (
        // Column names can get long; keep the header compact.
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 px-2 font-medium text-muted-foreground hover:text-foreground"
          onClick={column.getToggleSortingHandler()}
          title={c}
        >
          <span className="max-w-[14rem] truncate whitespace-nowrap">{c}</span>
          {column.getIsSorted() === "asc" ? (
            <ArrowUp className="h-4 w-4 opacity-70" aria-label="Sorted ascending" />
          ) : column.getIsSorted() === "desc" ? (
            <ArrowDown className="h-4 w-4 opacity-70" aria-label="Sorted descending" />
          ) : (
            <ArrowUpDown className="h-4 w-4 opacity-50" aria-label="Not sorted" />
          )}
        </Button>
      ),
      accessorFn: (d) => d.row[c] ?? "",
      cell: (info) => String(info.getValue() ?? ""),
    }));
  }, [visibleColumns]);

  const table = useReactTable({
    data,
    columns: columnsDef,
    state: {
      globalFilter: query,
      sorting,
      columnVisibility,
    },
    onGlobalFilterChange: (v) => {
      // TanStack may pass updater functions; we keep it simple by expecting string.
      setQuery(String(v ?? ""));
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "").trim().toLowerCase();
      if (!q) return true;
      const key = String(row.original.row.key ?? "").toLowerCase();
      const name = String(row.original.row.name ?? "").toLowerCase();
      return key.includes(q) || name.includes(q);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          className="h-9 w-full sm:w-[min(520px,100%)]"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            table.setPageIndex(0);
          }}
          placeholder="Search by key or name…"
          aria-label="Search"
        />
        <div className="text-sm text-muted-foreground">
          Showing {table.getFilteredRowModel().rows.length.toLocaleString()} rows
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((col) => col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(checked) => col.toggleVisibility(Boolean(checked))}
                  >
                    {String(col.id)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="h-9 w-[92px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
          <div className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border">
        <Table wrapperClassName="max-h-[calc(100vh-320px)]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="sticky top-0 z-[1] whitespace-nowrap bg-background/80 backdrop-blur"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((tr) => {
              const rowId = tr.original.rowId;
              const isSelected = selectedId != null && rowId === selectedId;
              return (
                <TableRow
                  key={tr.id}
                  data-state={isSelected ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => onToggleSelect(tr.original.row, rowId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleSelect(tr.original.row, rowId);
                    }
                  }}
                >
                  {tr.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
