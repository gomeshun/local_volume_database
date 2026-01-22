"use client";

import { useMemo, useState } from "react";
import styles from "@/app/site.module.css";

type Row = Record<string, string>;

export function DatasetTable({
  columns,
  rows,
  onSelect,
}: {
  columns: string[];
  rows: Row[];
  onSelect: (row: Row) => void;
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const key = (r.key ?? "").toLowerCase();
      const name = (r.name ?? "").toLowerCase();
      return key.includes(q) || name.includes(q);
    });
  }, [query, rows]);

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
            {pageRows.map((r, idx) => (
              <tr key={`${r.key ?? "row"}-${idx}`}>
                {visibleColumns.map((c) => (
                  <td key={c} className={styles.td}>
                    {c === "name" || c === "key" ? (
                      <button className={styles.rowButton} onClick={() => onSelect(r)}>
                        {r[c] ?? ""}
                      </button>
                    ) : (
                      r[c] ?? ""
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
