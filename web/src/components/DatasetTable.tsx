"use client";

import { useEffect, useMemo, useState, Fragment, type ReactNode } from "react";
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
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { vizierCatalogs } from "@/generated/vizier_catalogs";
import { simbadMappings } from "@/generated/simbad_mappings";
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

function isRefColumn(columnId: string): boolean {
  return columnId === "ref" || columnId.startsWith("ref_");
}

function bibcodeFromRefValue(value: string): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const idx = s.search(/\d/);
  if (idx < 0) return null;
  const bibcode = s.slice(idx);
  return bibcode.length ? bibcode : null;
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
  datasetSlug,
}: {
  columns: string[];
  rows: Row[];
  selectedId: string | null;
  onToggleSelect: (row: Row, rowId: string) => void;
  datasetSlug?: string;
}) {
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  // Whether Aladin is currently in fullscreen. Updated via a global event dispatched
  // by the Aladin viewer so we can hide sticky headers that would otherwise overlay.
  const [aladinFullscreen, setAladinFullscreen] = useState(false);

  // Track when a row's "Add children" operation is in progress and any error messages
  const [addingChildren, setAddingChildren] = useState<Record<string, boolean>>({});
  const [childrenError, setChildrenError] = useState<Record<string, string | null>>({});

  useEffect(() => {
    // Initialize from the body class (safe in client) and listen for changes.
    const initial = typeof window !== 'undefined' && document.body.classList.contains('aladin-fullscreen');
    setAladinFullscreen(Boolean(initial));
    const handler = (evt: Event) => {
      const ce = evt as CustomEvent<{ isFullscreen: boolean }>;
      setAladinFullscreen(Boolean(ce?.detail?.isFullscreen));
    };
    window.addEventListener('aladin-fullscreen-changed', handler as EventListener);
    return () => window.removeEventListener('aladin-fullscreen-changed', handler as EventListener);
  }, []);

  const orderedColumns = useMemo(() => {
    const preferredOrder = ["name", "ra", "dec", "distance", "key"];
    const preferred = preferredOrder.filter((c) => columns.includes(c));
    const rest = columns.filter((c) => !preferred.includes(c));
    return [...preferred, ...rest];
  }, [columns]);

  // Listen for Aladin catalog add success/failure events to update loading state
  useEffect(() => {
    const onSuccess = (evt: Event) => {
      try {
        const ce = evt as CustomEvent<{ rowId?: string }>;
        const rowId = ce?.detail?.rowId;
        if (!rowId) return;
        setAddingChildren((prev) => ({ ...prev, [rowId]: false }));
        setChildrenError((prev) => ({ ...prev, [rowId]: null }));
      } catch (err) {
        // ignore
      }
    };

    const onError = (evt: Event) => {
      try {
        const ce = evt as CustomEvent<{ rowId?: string; error?: string }>;
        const rowId = ce?.detail?.rowId;
        const errMsg = ce?.detail?.error ?? "Unknown error";
        if (!rowId) return;
        setAddingChildren((prev) => ({ ...prev, [rowId]: false }));
        setChildrenError((prev) => ({ ...prev, [rowId]: String(errMsg) }));
        console.error("Aladin add catalog error", errMsg);
      } catch (err) {
        // ignore
      }
    };

    window.addEventListener("aladin-add-catalog-success", onSuccess as EventListener);
    window.addEventListener("aladin-add-catalog-error", onError as EventListener);
    return () => {
      window.removeEventListener("aladin-add-catalog-success", onSuccess as EventListener);
      window.removeEventListener("aladin-add-catalog-error", onError as EventListener);
    };
  }, []);

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
      cell: (info) => {
        const raw = String(info.getValue() ?? "");
        if (!raw) return "";

        // Name cell: render hyperlink to SIMBAD only if a reliable mapping (mainId + matched) exists
        if (c === "name") {
          const rowId = (info.row.original as RowData).rowId;
          const slug = datasetSlug ?? null;
          const entry = slug ? (simbadMappings as Record<string, any>)[slug]?.[rowId] ?? null : null;

          const suffix = slug ? (slug.startsWith("dwarf") ? "dsph" : slug.startsWith("gc") ? "GC" : null) : null;

          // Link name iff matched succeeded. For non-matched but having a SIMBAD id
          // we link the warning icon instead. If no data, show no trailing badge.
          const hasMainId = Boolean(entry?.mainId);
          const isLinkable = Boolean(hasMainId && entry?.matched === true);
          const simbadHref = hasMainId
            ? `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(entry.mainId)}&NbIdent=1`
            : null;

          // Format separation for tooltips
          const sep = entry && entry.separation_arcsec != null ? Number(entry.separation_arcsec) : null;
          const sepStr = sep !== null && Number.isFinite(sep) ? `${sep.toFixed(2)}″` : "unknown";

          const badge = entry ? (
            entry.error ? (
              <span title={String(entry.error)} className="ml-2 text-sm text-red-600">✗</span>
            ) : entry.matched ? (
              // Matched: we do NOT show a checkmark badge per UX request
              null
            ) : entry.empty ? (
              // No results: do not show a placeholder
              null
            ) : entry.mainId ? (
              // Has a SIMBAD id but did not match: show a warning icon that links to SIMBAD
              <a
                href={simbadHref!}
                title={`SIMBAD — ${entry.mainId} (sep: ${sepStr}) — coordinate mismatch`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-sm text-orange-600"
                onClick={(e) => e.stopPropagation()}
              >
                ⚠
              </a>
            ) : null
          ) : null;

          return (
            <div className="flex items-baseline gap-2">
              {isLinkable ? (
                <a
                  href={simbadHref!}
                  title={`SIMBAD — ${entry.mainId} (sep: ${sepStr})`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {raw}
                </a>
              ) : (
                <span>{raw}</span>
              )}

              {badge}

              {/* Add children button: dispatches a custom event that Aladin viewer listens to */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2 h-7 px-2 text-xs"
                disabled={Boolean(addingChildren[rowId])}
                aria-busy={Boolean(addingChildren[rowId])}
                onClick={(e) => {
                  e.stopPropagation();
                  try {
                    const ident = entry?.mainId ?? raw;
                    if (!ident) return;
                    const url = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(
                      ident,
                    )}&NbIdent=query_hlinks&submit=children&hlinksdisplay=h_all&list.pmsel=on&list.rvsel=on&rvDisplay=V&output.format=votable`;

                    // Mark as loading for this row and clear previous errors
                    setAddingChildren((prev) => ({ ...prev, [rowId]: true }));
                    setChildrenError((prev) => ({ ...prev, [rowId]: null }));

                    // Dispatch the event on the next tick so React can render the loading
                    // state before any synchronous success/error handlers run.
                    const evtDetail = {
                      url,
                      options: { sourceSize: 10, color: "#4f46e5", onClick: "showTable" },
                      name: `children:${ident}`,
                      identifier: ident,
                      rowId,
                    };
                    setTimeout(() => {
                      const evt = new CustomEvent("aladin-add-catalog", { detail: evtDetail });
                      (window as any).dispatchEvent(evt);
                    }, 0);
                  } catch (err) {
                    console.error(err);
                    setAddingChildren((prev) => ({ ...prev, [rowId]: false }));
                    setChildrenError((prev) => ({ ...prev, [rowId]: String(err) }));
                  }
                }}
              >
                {addingChildren[rowId] ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span className="text-xs">loading…</span>
                  </span>
                ) : (
                  "Add children"
                )}
              </Button>

              {childrenError[rowId] ? (
                <span className="ml-2 text-xs text-red-600">{childrenError[rowId]}</span>
              ) : null}
            </div>
          );
        }

        if (isRefColumn(c)) {
          const bibcode = bibcodeFromRefValue(raw);
          if (bibcode) {
            const href = `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcode)}/abstract`;
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
                onClick={(e) => e.stopPropagation()}
              >
                {raw}
              </a>
            );
          }
        }

        return raw;
      },
    }));
  }, [orderedColumns, addingChildren, childrenError]);

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

  // Component to fetch VizieR catalogs for a given bibcode (server-proxied).
  function RefRow({ colId, raw }: { colId: string; raw: string }) {
    const bibcode = bibcodeFromRefValue(raw);


    /* client-side Vizier fetch removed; using build-time cache */
      if (!bibcode) return;

        try {
          // Directly query Vizier ASU-TSV endpoint (CORS is allowed by Vizier)
          const url = `https://vizier.u-strasbg.fr/viz-bin/asu-tsv?-ref=${encodeURIComponent(bibcode)}&-out.max=200`;
          // client-side fetch removed; build-time cache is used instead.
          // (Previous implementation queried Vizier from the browser here, but
          // we now precompute and bundle results at build time.)
          let catalogs = [];

          // If no catalogs found, try a heuristic: derive a Vizier source id from the bibcode
          // e.g. 2009AJ....137.3100W -> J/AJ/137/3100
          if (catalogs.length === 0 && bibcode) {
            // Older bibcodes use runs of dots as separators (e.g. 2011ApJ...733...46S).
            // Use a more flexible regex that accepts one-or-more dots between components.
            const m = String(bibcode).match(/^(?:\d{4})([A-Za-z]{1,6})\.+(\d+)\.+(\d+)/);
            if (m) {
              const journal = m[1];
              const volume = m[2];
              const page = m[3];
              const guess = `J/${journal}/${volume}/${page}`;
              // client-side fallback probe removed; build-time cache will contain
              // heuristically-derived sources when available (no-op here).
            }
          }

          // Discard client-side fetch results; build-time cache is used instead.
        } catch (err) {
          console.warn("vizier fetch error", err);
        }



    const bibcodeStr = bibcode ?? null;

    const adsNode: ReactNode = raw ? (
      bibcodeStr ? (
        <a
          href={`https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcodeStr)}/abstract`}
          target="_blank"
          rel="noreferrer"
          className="underline"
          onClick={(e) => e.stopPropagation()}
        >
          {raw}
        </a>
      ) : (
        raw
      )
    ) : (
      <span className="text-muted-foreground">—</span>
    );

    // Look up build-time cache (generated by scripts/generate-datasets.mjs)
    const entry = bibcodeStr ? (vizierCatalogs as Record<string, any>)[bibcodeStr] ?? null : null;

    let vizierCell: ReactNode = <span className="text-muted-foreground">—</span>;
    if (!bibcodeStr) {
      vizierCell = <span className="text-sm text-muted-foreground">No bibcode</span>;
    } else if (!entry) {
      vizierCell = <span className="text-sm text-muted-foreground">Not cached</span>;
    } else if (entry.error) {
      vizierCell = <span className="text-sm text-red-600">Error</span>;
    } else if (!entry.catalogs || entry.catalogs.length === 0) {
      vizierCell = <span className="text-sm text-muted-foreground">No catalogs</span>;
    } else {
      vizierCell = (
        <div className="flex flex-col gap-1">
          {entry.catalogs.slice(0, 10).map((cat: string) => (
            <a
              key={cat}
              href={`https://vizier.u-strasbg.fr/viz-bin/VizieR?-source=${encodeURIComponent(cat)}`}
              target="_blank"
              rel="noreferrer"
              className="underline text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              {cat}
            </a>
          ))}
          {entry.catalogs.length > 10 ? (
            <div className="text-sm text-muted-foreground">and {entry.catalogs.length - 10} more...</div>
          ) : null}
        </div>
      );
    }

    return (
      <tr key={colId} className="border-b align-top">
        <td className="p-2 font-mono text-muted-foreground w-40">{colId}</td>
        <td className="p-2">{adsNode}</td>
        <td className="p-2">{vizierCell}</td>
      </tr>
    );
  }

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
          {!aladinFullscreen && (
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
          )}
          <TableBody>
            {table.getRowModel().rows.map((tr) => {
              const rowId = tr.original.rowId;
              const isSelected = selectedId != null && rowId === selectedId;
              return (
                <Fragment key={tr.id}>
                  <TableRow
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

                  {isSelected ? (
                    <TableRow className="bg-muted/5">
                      <TableCell colSpan={tr.getVisibleCells().length} className="p-3">
                        <div className="overflow-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="p-2 w-40 text-left font-medium"> </th>
                                <th className="p-2 text-left font-medium">ADS</th>
                                <th className="p-2 text-left font-medium">Vizier</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderedColumns
                                .filter((c) => isRefColumn(c))
                                .map((colId) => {
                                  const raw = String(tr.original.row[colId] ?? "");
                                  return <RefRow key={colId} colId={colId} raw={raw} />;
                                })}

                              {orderedColumns.filter((c) => isRefColumn(c)).length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="p-2 text-sm text-muted-foreground">No references</td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
