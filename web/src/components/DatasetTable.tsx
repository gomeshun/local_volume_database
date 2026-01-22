"use client";

import { useMemo, useState } from "react";
import styles from "@/app/site.module.css";

type Row = Record<string, string>;

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
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const visibleColumns = useMemo(() => {
    const preferred = ["key", "name", "ra", "dec", "host", "distance", "M_V", "mass_stellar"];
    const selected = preferred.filter((c) => columns.includes(c));
    const rest = columns.filter((c) => !selected.includes(c));
    return [...selected, ...rest].slice(0, 10);
  }, [columns]);

  const indexedRows = useMemo(() => rows.map((row, idx) => ({ row, idx })), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return indexedRows;
    return indexedRows.filter(({ row }) => {
      const key = (row.key ?? "").toLowerCase();
      const name = (row.name ?? "").toLowerCase();
      return key.includes(q) || name.includes(q);
    });
  }, [indexedRows, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          className={styles.input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search by key or name…"
          aria-label="Search"
        />
        <div className={styles.muted}>
          Showing {filtered.length.toLocaleString()} rows
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={styles.button}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Prev
          </button>
          <button
            className={styles.button}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            Next
          </button>
          <div className={styles.muted} style={{ alignSelf: "center" }}>
            Page {page + 1} / {pageCount}
          </div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {visibleColumns.map((c) => (
                <th key={c} className={styles.th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ row, idx }) => {
              const rowId = makeRowId(row, idx);
              const isSelected = selectedId != null && rowId === selectedId;
              return (
                <tr
                  key={`${rowId}-${idx}`}
                  className={isSelected ? styles.selectedRow : undefined}
                  onClick={() => onToggleSelect(row, rowId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleSelect(row, rowId);
                    }
                  }}
                >
                {visibleColumns.map((c) => (
                  <td key={c} className={styles.td}>
                    {row[c] ?? ""}
                  </td>
                ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
