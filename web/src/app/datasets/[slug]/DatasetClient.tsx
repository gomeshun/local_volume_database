"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import styles from "@/app/site.module.css";
import type { Dataset } from "@/generated/datasets";
import { DatasetTable } from "@/components/DatasetTable";
import { AladinLiteViewer } from "@/components/AladinLiteViewer";

type Row = Record<string, string>;

function makeRowId(row: Row, idx: number): string {
  const key = (row.key ?? "").trim();
  if (key) return key;
  const name = (row.name ?? "").trim();
  if (name) return name;
  return String(idx);
}

export default function DatasetClient({ dataset }: { dataset: Dataset }) {
  const [selection, setSelection] = useState<{ id: string; row: Row } | null>(null);

  const rowById = useMemo(() => {
    const map = new Map<string, Row>();
    dataset.rows.forEach((row, idx) => {
      map.set(makeRowId(row, idx), row);
    });
    return map;
  }, [dataset.rows]);

  const sources = useMemo(() => {
    const out: Array<{ id: string; ra: number; dec: number; title?: string }> = [];
    dataset.rows.forEach((row, idx) => {
      const ra = Number(row.ra);
      const dec = Number(row.dec);
      if (!Number.isFinite(ra) || !Number.isFinite(dec)) return;
      const id = makeRowId(row, idx);
      out.push({ id, ra, dec, title: row.name ?? row.key ?? undefined });
    });
    return out;
  }, [dataset.rows]);

  const initialTarget = useMemo(() => {
    const first = sources[0];
    if (!first) return "0 0";
    return `${first.ra} ${first.dec}`;
  }, [sources]);

  const coords = useMemo(() => {
    if (!selection) return null;
    const ra = Number(selection.row.ra);
    const dec = Number(selection.row.dec);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
    return { ra, dec };
  }, [selection]);

  const toggleSelectionById = useCallback(
    (rowId: string) => {
      const row = rowById.get(rowId);
      if (!row) return;
      setSelection((prev) => (prev?.id === rowId ? null : { id: rowId, row }));
    },
    [rowById],
  );

  const toggleSelectionByRow = useCallback((row: Row, rowId: string) => {
    setSelection((prev) => (prev?.id === rowId ? null : { id: rowId, row }));
  }, []);

  return (
    <div>
      <div className={styles.muted} style={{ marginBottom: 12 }}>
        <Link href="/">← Back</Link>
      </div>

      <h1 style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{dataset.title}</h1>
      <div className={styles.muted} style={{ marginTop: 6 }}>
        Parsed rows: {dataset.rows.length.toLocaleString()} (source total: {dataset.totalRows.toLocaleString()})
      </div>

      <div className={styles.split} style={{ marginTop: 16 }}>
        <div>
          <DatasetTable
            columns={dataset.columns}
            rows={dataset.rows}
            selectedId={selection?.id ?? null}
            onToggleSelect={toggleSelectionByRow}
          />
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Sky view (Aladin Lite)</div>
          <div className={styles.muted} style={{ marginBottom: 10 }}>
            {coords
              ? `${selection?.row.name ?? selection?.row.key ?? "(selected)"} @ RA=${coords.ra}, Dec=${coords.dec}`
              : "No selection (showing all sources)."}
          </div>
          <AladinLiteViewer
            sources={sources}
            initialTarget={initialTarget}
            selectedId={selection?.id ?? null}
            onToggleSelectId={toggleSelectionById}
          />
        </div>
      </div>
    </div>
  );
}
