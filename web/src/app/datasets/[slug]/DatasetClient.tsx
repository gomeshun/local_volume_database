"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DatasetPayload,
  DatasetRow,
  DatasetSummary,
} from "@/generated/datasets_summary";
import { CopyViewLink } from "@/components/CopyViewLink";
import { Button } from "@/components/ui/button";
import { DEFAULT_RESEARCH_VIEW, decodeResearchView, rowsToCsv, type ResearchView } from "@/lib/researchView";
import { useUrlView } from "@/lib/useUrlView";
import { DatasetTable } from "@/components/DatasetTable";
import { AladinLiteViewer } from "@/components/AladinLiteViewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assetPath } from "@/lib/assetPath";

type Row = DatasetRow;
const DEFAULT_DATASET_VIEW: ResearchView = { ...DEFAULT_RESEARCH_VIEW, sort: null };
function decodeDatasetView(raw: string | null): ResearchView {
  return raw ? decodeResearchView(raw) : DEFAULT_DATASET_VIEW;
}
function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
  const [view, setView] = useUrlView("table", DEFAULT_DATASET_VIEW, decodeDatasetView);
  const updateView = useCallback((patch: Partial<ResearchView>) => setView((current) => ({ ...current, ...patch })), [setView]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);


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

  const filteredRows = useMemo(() => {
    const query = view.query.trim().toLowerCase();
    return rows.filter((row) => !query || String(row.key ?? "").toLowerCase().includes(query) || String(row.name ?? "").toLowerCase().includes(query));
  }, [rows, view.query]);
  const rowById = useMemo(() => {
    const map = new Map<string, Row>();
    filteredRows.forEach((row, idx) => {
      map.set(makeRowId(row, idx), row);
    });
    return map;
  }, [filteredRows]);

  const selectedRow = view.selectedId ? rowById.get(view.selectedId) : undefined;
  const selection = useMemo(() => selectedRow && view.selectedId ? { id: view.selectedId, row: selectedRow } : null, [selectedRow, view.selectedId]);
  const sources = useMemo(() => {
    const out: Array<{ id: string; ra: number; dec: number; title?: string }> = [];
    filteredRows.forEach((row, idx) => {
      const ra = finiteNumber(row.ra);
      const dec = finiteNumber(row.dec);
      if (ra === null || dec === null) return;
      const id = makeRowId(row, idx);
      out.push({ id, ra, dec, title: row.name ?? row.key ?? undefined });
    });
    return out;
  }, [filteredRows]);

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
      setView((current) => ({ ...current, selectedId: current.selectedId === rowId ? null : rowId }));
    },
    [rowById, setView],
  );

  const toggleSelectionByRow = useCallback((_row: Row, rowId: string) => {
    setView((current) => ({ ...current, selectedId: current.selectedId === rowId ? null : rowId }));
  }, [setView]);

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
      <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => updateView({ sky: !view.sky })}>{view.sky ? "Hide sky / widen table" : "Show sky view"}</Button>
        <CopyViewLink />
        <Button variant="outline" size="sm" onClick={() => download(rowsToCsv(dataset.columns, filteredRows), dataset.slug + "_filtered.csv", "text/csv;charset=utf-8")}>Download filtered CSV ({filteredRows.length})</Button>
        <Button variant="outline" size="sm" onClick={() => download(rowsToCsv(dataset.columns, rows), dataset.slug + "_full.csv", "text/csv;charset=utf-8")}>Download full dataset ({rows.length})</Button>
        <Button variant="outline" size="sm" onClick={() => download(JSON.stringify({ schemaVersion: 1, dataset, view, counts: { full: rows.length, filtered: filteredRows.length }, csvOrder: "original source order (table sorting is presentation only)", viewUrl: window.location.href }, null, 2) + "\n", dataset.slug + "_view_metadata.json", "application/json")}>Download view metadata</Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground" role="status">Shared sample: {filteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} records · {sources.length.toLocaleString()} with sky coordinates. CSV retains all columns, including references and missing values.</p>
      <div className={`mt-4 grid gap-4 ${view.sky ? "xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]" : ""}`}>
        <div className="min-w-0">
          <DatasetTable
            view={view}
            onViewChange={updateView}
            columns={dataset.columns}
            rows={filteredRows}
            sourceRows={rows}
            selectedId={selection?.id ?? null}
            onToggleSelect={toggleSelectionByRow}
            datasetSlug={dataset.slug}
          />
        </div>
        {view.sky ? <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Sky view (Aladin Lite)</CardTitle>
            <CardDescription>
              {coords
                ? `${selection?.row.name ?? selection?.row.key ?? "(selected)"} @ RA=${coords.ra}, Dec=${coords.dec}`
                : `${sources.length.toLocaleString()} coordinate pairs in the filtered sample.`}
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
        </Card> : null}
      </div>
      </>
      ) : null}
    </div>
  );
}
