"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { makeKinematicsRowId, selectedRecordPage, sortKinematicsRows } from "@/lib/kinematicsSelection";
export { makeKinematicsRowId } from "@/lib/kinematicsSelection";
export type KinematicsTableHandle = { showSelectedRecord: () => void };
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColumnPicker } from "@/components/ColumnPicker";
import type { ResearchView } from "@/lib/researchView";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  describeKinematicsColumn,
  formatKinematicsColumnLabel,
} from "@/lib/kinematicsColumns";
import type { PublicKinematicsRow } from "@/types/kinematics";




const PREFERRED_COLUMNS = [
  "star_id",
  "gaia_source_id",
  "source_row",
  "source_kind",
  "source_provider",
  "source_name",
  "vlos_kms",
  "vlos_err_kms",
  "pmra_masyr",
  "pmra_err_masyr",
  "pmdec_masyr",
  "pmdec_err_masyr",
  "membership_probability",
  "membership_probability_origin",
  "membership_flag",
  "membership_flag_origin",
  "feh",
  "feh_err",
  "ra_deg",
  "dec_deg",
  "source_ref",
];

function bibcodeFromRefValue(value: string): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const firstDigit = trimmed.search(/\d/);
  if (firstDigit < 0) return null;
  return trimmed.slice(firstDigit) || null;
}

function renderCell(column: string, raw: string) {
  if (!raw) {
    if (column === "membership_probability" || column === "membership_flag") {
      return <span className="text-muted-foreground">not reported</span>;
    }
    return <span className="text-muted-foreground">-</span>;
  }

  if (column === "source_ref") {
    const bibcode = bibcodeFromRefValue(raw);
    if (bibcode) {
      return (
        <a
          href={`https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcode)}/abstract`}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {raw}
        </a>
      );
    }
  }

  if (column === "source_url") {
    return (
      <a href={raw} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        Open
      </a>
    );
  }

  return raw;
}

export function MemberKinematicsTable({
  columns,
  rows,
  selectedId,
  onToggleSelect,
  view,
  onViewChange,
  ref,
}: {
  ref?: Ref<KinematicsTableHandle>;
  view: ResearchView;
  onViewChange: (patch: Partial<ResearchView>) => void;
  columns: string[];
  rows: PublicKinematicsRow[];
  selectedId: string | null;
  onToggleSelect: (row: PublicKinematicsRow, rowId: string) => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [revealSequence, setRevealSequence] = useState(0);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const pageSize = view.pageSize;
  const sort = view.sort;
  const visibleColumns = view.columns ?? PREFERRED_COLUMNS;

  const orderedColumns = useMemo(() => {
    const preferred = PREFERRED_COLUMNS.filter((column) => columns.includes(column));
    const rest = columns.filter((column) => !preferred.includes(column));
    return [...preferred, ...rest];
  }, [columns]);

  const visibleOrderedColumns = useMemo(
    () => orderedColumns.filter((column) => column === "star_id" || visibleColumns.includes(column)),
    [orderedColumns, visibleColumns],
  );

  const sortedRows = useMemo(() => sortKinematicsRows(rows, sort), [rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pagedRows = sortedRows.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize);

  useImperativeHandle(ref, () => ({ showSelectedRecord() {
    const page = selectedRecordPage(sortedRows, selectedId, pageSize);
    if (page === null) return;
    setPageIndex(page);
    setRevealSequence((value) => value + 1);
  } }), [sortedRows, selectedId, pageSize]);

  useEffect(() => {
    if (!revealSequence) return;
    selectedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    selectedRowRef.current?.focus({ preventScroll: true });
  }, [revealSequence]);

  function toggleSort(column: string) {
    onViewChange({ sort: !sort || sort.column !== column ? { column, direction: "asc" } : sort.direction === "asc" ? { column, direction: "desc" } : null });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">Table: {rows.length.toLocaleString()} filtered records</div>
        <div className="flex flex-wrap items-center gap-2">
          <ColumnPicker columns={orderedColumns} visible={visibleOrderedColumns} defaults={PREFERRED_COLUMNS} identity="star_id" label={formatKinematicsColumnLabel} onChange={(columns) => onViewChange({ columns })} />

          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onViewChange({ pageSize: Number(value) });
              setPageIndex(0);
            }}
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

          <Button variant="outline" size="sm" onClick={() => setPageIndex((value) => Math.max(0, value - 1))} disabled={safePageIndex === 0}>
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((value) => Math.min(pageCount - 1, value + 1))}
            disabled={safePageIndex >= pageCount - 1}
          >
            Next
          </Button>
          <div className="text-sm text-muted-foreground">
            Page {safePageIndex + 1} / {pageCount}
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border">
        <Table wrapperClassName="max-h-[calc(100vh-360px)]">
          <TableHeader>
            <TableRow>
              {visibleOrderedColumns.map((column) => {
                const sorted = sort?.column === column ? sort.direction : null;
                return (
                  <TableHead key={column} className={`sticky top-0 whitespace-nowrap bg-background ${column === "star_id" ? "left-0 z-[3] shadow-sm" : "z-[1]"}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 px-2 font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSort(column)}
                      title={describeKinematicsColumn(column)}
                    >
                      <span className="max-w-[14rem] truncate whitespace-nowrap">
                        {formatKinematicsColumnLabel(column)}
                      </span>
                      {sorted === "asc" ? (
                        <ArrowUp className="h-4 w-4 opacity-70" aria-label="Sorted ascending" />
                      ) : sorted === "desc" ? (
                        <ArrowDown className="h-4 w-4 opacity-70" aria-label="Sorted descending" />
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-50" aria-label="Not sorted" />
                      )}
                    </Button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((row, index) => {
              const absoluteIndex = safePageIndex * pageSize + index;
              const rowId = makeKinematicsRowId(row, absoluteIndex);
              const selected = selectedId === rowId;
              return (
                <TableRow
                  key={rowId}
                  ref={selected ? selectedRowRef : undefined}
                  aria-label={`Source label ${row.star_id || "unlabelled"}, source row ${row.source_row}`}
                  data-state={selected ? "selected" : undefined}
                  className="cursor-pointer scroll-mt-64 outline-offset-[-2px] focus:outline focus:outline-2 focus:outline-primary"
                  onClick={() => onToggleSelect(row, rowId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onToggleSelect(row, rowId);
                    }
                  }}
                >
                  {visibleOrderedColumns.map((column) => (
                    <TableCell key={column} className={`whitespace-nowrap ${column === "star_id" ? "sticky left-0 z-[2] bg-background shadow-sm" : ""}`}>
                      {renderCell(column, row[column] ?? "")}{column === "star_id" ? <span className="ml-2 text-xs text-muted-foreground">row {row.source_row}</span> : null}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}

            {pagedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(1, visibleOrderedColumns.length)} className="p-4 text-sm text-muted-foreground">
                  No rows
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
