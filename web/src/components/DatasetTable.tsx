"use client";

import { useEffect, useMemo, useState } from "react";
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

const COLUMN_UNITS: Record<string, string> = {
  ra: "deg",
  dec: "deg",
  ll: "deg",
  bb: "deg",
  rhalf: "arcmin",
  rcore: "arcmin",
  rking: "arcmin",
  rad_sersic: "arcmin",
  position_angle: "deg",
  distance_modulus: "mag",
  distance: "kpc",
  rhalf_physical: "pc",
  rhalf_sph_physical: "pc",
  apparent_magnitude_v: "mag",
  apparent_magnitude_V: "mag",
  M_V: "mag",
  surface_brightness_rhalf: "mag arcsec^-2",
  vlos_systemic: "km/s",
  vlos_sigma: "km/s",
  metallicity: "dex",
  metallicity_spectroscopic: "dex",
  metallicity_spectroscopic_sigma: "dex",
  metallicity_photometric: "dex",
  pmra: "mas/yr",
  pmdec: "mas/yr",
  age: "Gyr",
  flux_HI: "Jy km s−1",
};

function getUnitForColumn(columnId: string): string | null {
  if (COLUMN_UNITS[columnId]) return COLUMN_UNITS[columnId];

  const m = columnId.match(/^(.*)_(em|ep|ul)$/);
  if (m) {
    const base = m[1];
    return COLUMN_UNITS[base] ?? null;
  }

  return null;
}

function formatColumnLabel(columnId: string): string {
  const unit = getUnitForColumn(columnId);
  return unit ? `${columnId} (${unit})` : columnId;
}

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
  const orderedColumns = useMemo(() => {
    const preferredOrder = ["name", "ra", "dec", "distance", "key"];
    const preferred = preferredOrder.filter((c) => columns.includes(c));
    const rest = columns.filter((c) => !preferred.includes(c));
    return [...preferred, ...rest];
  }, [columns]);

  const initialColumnVisibility = useMemo<VisibilityState>(() => {
    const preferredVisible = new Set(["name", "ra", "dec", "distance"]);
    const vis: VisibilityState = {};

    for (const c of columns) {
      vis[c] = preferredVisible.has(c);
    }

    // If the dataset doesn't have any of the preferred columns, show a few columns by default.
    if (!Object.values(vis).some(Boolean)) {
      for (const c of columns.slice(0, 6)) vis[c] = true;
    }

    return vis;
  }, [columns]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => initialColumnVisibility);

  useEffect(() => {
    setColumnVisibility(initialColumnVisibility);
  }, [initialColumnVisibility]);

  const indexedRows = useMemo(() => rows.map((row, idx) => ({ row, idx })), [rows]);

  const data = useMemo<RowData[]>(() => {
    return indexedRows.map(({ row, idx }) => ({ row, rowId: makeRowId(row, idx) }));
  }, [indexedRows]);

  const columnsDef = useMemo<ColumnDef<RowData>[]>(() => {
    return orderedColumns.map((c) => ({
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
          title={formatColumnLabel(c)}
        >
          <span className="max-w-[14rem] truncate whitespace-nowrap">{formatColumnLabel(c)}</span>
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
  }, [orderedColumns]);

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
            <DropdownMenuContent align="end" className="max-h-[60vh] w-72 overflow-y-auto">
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
                    {formatColumnLabel(String(col.id))}
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
