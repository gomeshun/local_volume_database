"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DatasetPayload,
  DatasetRow,
  DatasetSummary,
} from "@/generated/datasets_summary";
import { DatasetTable } from "@/components/DatasetTable";
import { AladinLiteViewer } from "@/components/AladinLiteViewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assetPath } from "@/lib/assetPath";

type Row = DatasetRow;

function makeRowId(row: Row, idx: number): string {
  const key = (row.key ?? "").trim();
  if (key) return key;
  const name = (row.name ?? "").trim();
  if (name) return name;
  return String(idx);
}

function finiteNumber(value: string | undefined): number | null {
  if (String(value ?? "").trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function DatasetClient({ dataset }: { dataset: DatasetSummary }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ id: string; row: Row } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(assetPath(dataset.dataPath), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as DatasetPayload;
      })
      .then((payload) => {
        if (payload.slug !== dataset.slug || !Array.isArray(payload.rows)) {
          throw new Error("Generated dataset payload does not match this route.");
        }
        setRows(payload.rows);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [dataset.dataPath, dataset.slug]);

  const rowById = useMemo(() => {
    const map = new Map<string, Row>();
    rows.forEach((row, idx) => {
      map.set(makeRowId(row, idx), row);
    });
    return map;
  }, [rows]);

  const sources = useMemo(() => {
    const out: Array<{ id: string; ra: number; dec: number; title?: string }> = [];
    rows.forEach((row, idx) => {
      const ra = finiteNumber(row.ra);
      const dec = finiteNumber(row.dec);
      if (ra === null || dec === null) return;
      const id = makeRowId(row, idx);
      out.push({ id, ra, dec, title: row.name ?? row.key ?? undefined });
    });
    return out;
  }, [rows]);

  const initialTarget = useMemo(() => {
    const first = sources[0];
    if (!first) return "0 0";
    return `${first.ra} ${first.dec}`;
  }, [sources]);

  const coords = useMemo(() => {
    if (!selection) return null;
    const ra = finiteNumber(selection.row.ra);
    const dec = finiteNumber(selection.row.dec);
    if (ra === null || dec === null) return null;
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
        Records: {dataset.totalRows.toLocaleString()}
        <span className="ml-2 font-mono text-xs" title={`SHA-256 ${dataset.sha256}`}>
          data {dataset.sha256.slice(0, 10)}
        </span>
      </div>

      {loading ? (
        <Card className="mt-4">
          <CardContent className="p-6 text-sm text-muted-foreground">Loading dataset…</CardContent>
        </Card>
      ) : null}

      {loadError ? (
        <Card className="mt-4 border-red-300">
          <CardContent className="p-6 text-sm text-red-700">
            Could not load this dataset: {loadError}
          </CardContent>
        </Card>
      ) : null}

      {!loading && !loadError ? (
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <DatasetTable
            columns={dataset.columns}
            rows={rows}
            selectedId={selection?.id ?? null}
            onToggleSelect={toggleSelectionByRow}
            datasetSlug={dataset.slug}
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
      ) : null}
    </div>
  );
}
