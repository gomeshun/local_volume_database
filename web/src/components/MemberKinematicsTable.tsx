"use client";

import { useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublicKinematicsRow } from "@/types/kinematics";

type SortDirection = "asc" | "desc";

type SortState = {
  column: string;
  direction: SortDirection;
} | null;

const PREFERRED_COLUMNS = [
  "star_id",
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

const COLUMN_UNITS: Record<string, string> = {
  ra_deg: "deg",
  dec_deg: "deg",
  vlos_kms: "km/s",
  vlos_err_kms: "km/s",
  pmra_masyr: "mas/yr",
  pmra_err_masyr: "mas/yr",
  pmdec_masyr: "mas/yr",
  pmdec_err_masyr: "mas/yr",
  feh: "dex",
  feh_err: "dex",
};

function formatColumnLabel(column: string): string {
  const unit = COLUMN_UNITS[column];
  return unit ? `${column} (${unit})` : column;
}

function bibcodeFromRefValue(value: string): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const firstDigit = trimmed.search(/\d/);
  if (firstDigit < 0) return null;
  return trimmed.slice(firstDigit) || null;
}

function numericValue(value: string): number | null {
  if (String(value ?? "").trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareValues(left: string, right: string, direction: SortDirection): number {
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  let result = 0;
  if (leftNumber !== null && rightNumber !== null) {
    result = leftNumber - rightNumber;
  } else {
    result = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  }
  return direction === "asc" ? result : -result;
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

export function makeKinematicsRowId(row: PublicKinematicsRow, index: number): string {
  const sourceIdentity = [
    row.object_key,
    row.source_provider,
    row.source_name,
    row.source_row,
    row.star_id,
  ];
  if (sourceIdentity.slice(1).some((value) => String(value ?? "").trim() !== "")) {
    return sourceIdentity.join(":");
  }
  return `${row.object_key || "record"}:${index}`;
}

export function MemberKinematicsTable({
  columns,
  rows,
  selectedId,
  onToggleSelect,
}: {
  columns: string[];
  rows: PublicKinematicsRow[];
  selectedId: string | null;
  onToggleSelect: (row: PublicKinematicsRow, rowId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [pageIndex, setPageIndex] = useState(0);
  const [sort, setSort] = useState<SortState>({ column: "star_id", direction: "asc" });
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.map((column) => [column, PREFERRED_COLUMNS.includes(column)])),
  );

  const orderedColumns = useMemo(() => {
    const preferred = PREFERRED_COLUMNS.filter((column) => columns.includes(column));
    const rest = columns.filter((column) => !preferred.includes(column));
    return [...preferred, ...rest];
  }, [columns]);

  const visibleOrderedColumns = useMemo(
    () => orderedColumns.filter((column) => visibleColumns[column]),
    [orderedColumns, visibleColumns],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const membershipProbability = numericValue(row.membership_probability);
      if (
        membershipFilter === "available" &&
        membershipProbability === null &&
        !String(row.membership_flag ?? "").trim()
      ) {
        return false;
      }
      if (
        membershipFilter === "source-reported" &&
        row.membership_probability_origin !== "reported" &&
        row.membership_flag_origin !== "reported"
      ) {
        return false;
      }
      if (
        membershipFilter === "probability-0.5" &&
        (membershipProbability === null || membershipProbability < 0.5)
      ) {
        return false;
      }
      if (
        membershipFilter === "probability-0.9" &&
        (membershipProbability === null || membershipProbability < 0.9)
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [
        row.star_id,
        row.source_kind,
        row.source_name,
        row.source_provider,
        row.source_ref,
        row.membership_flag,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [membershipFilter, query, rows]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    return [...filteredRows].sort((left, right) => compareValues(left[sort.column] ?? "", right[sort.column] ?? "", sort.direction));
  }, [filteredRows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pagedRows = sortedRows.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize);

  function toggleSort(column: string) {
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          className="h-9 w-full sm:w-[min(520px,100%)]"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPageIndex(0);
          }}
          placeholder="Search selected-dataset records or sources…"
          aria-label="Search selected kinematic records"
        />

        <div className="text-sm text-muted-foreground">
          Showing {filteredRows.length.toLocaleString()} selected-dataset records
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={membershipFilter}
            onValueChange={(value) => {
              setMembershipFilter(value);
              setPageIndex(0);
            }}
          >
            <SelectTrigger className="h-9 w-[190px]" aria-label="Filter reported membership">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All membership</SelectItem>
              <SelectItem value="available">Any membership value</SelectItem>
              <SelectItem value="source-reported">Reported on source row</SelectItem>
              <SelectItem value="probability-0.5">P ≥ 0.5</SelectItem>
              <SelectItem value="probability-0.9">P ≥ 0.9</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[60vh] w-72 overflow-y-auto">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {orderedColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  checked={Boolean(visibleColumns[column])}
                  onCheckedChange={(checked) => setVisibleColumns((current) => ({ ...current, [column]: Boolean(checked) }))}
                >
                  {formatColumnLabel(column)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
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
                  <TableHead key={column} className="sticky top-0 z-[1] whitespace-nowrap bg-background/80 backdrop-blur">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 px-2 font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSort(column)}
                      title={formatColumnLabel(column)}
                    >
                      <span className="max-w-[14rem] truncate whitespace-nowrap">{formatColumnLabel(column)}</span>
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
                  data-state={selected ? "selected" : undefined}
                  className="cursor-pointer"
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
                    <TableCell key={column} className="whitespace-nowrap">
                      {renderCell(column, row[column] ?? "")}
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
