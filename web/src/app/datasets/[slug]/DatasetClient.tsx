"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { Dataset } from "@/generated/datasets";
import { DatasetTable } from "@/components/DatasetTable";
import { AladinLiteViewer } from "@/components/AladinLiteViewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="mb-3 text-sm text-muted-foreground">
        <Link href="/">← Back</Link>
      </div>

      <h1 className="text-xl font-semibold tracking-tight">{dataset.title}</h1>
      <div className="mt-1 text-sm text-muted-foreground">
        Rows: {dataset.rows.length.toLocaleString()}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <DatasetTable
            columns={dataset.columns}
            rows={dataset.rows}
            selectedId={selection?.id ?? null}
            onToggleSelect={toggleSelectionByRow}
          />
        </div>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Sky view (Aladin Lite)</CardTitle>
            <CardDescription>
              {coords
                ? `${selection?.row.name ?? selection?.row.key ?? "(selected)"} @ RA=${coords.ra}, Dec=${coords.dec}`
                : "No selection (showing all sources)."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AladinLiteViewer
              sources={sources}
              initialTarget={initialTarget}
              selectedId={selection?.id ?? null}
              onToggleSelectId={toggleSelectionById}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
