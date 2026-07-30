"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AladinLiteViewer } from "@/components/AladinLiteViewer";
import {
  MemberKinematicsTable,
  makeKinematicsRowId,
} from "@/components/MemberKinematicsTable";
import { KinematicsPlots } from "@/components/KinematicsPlots";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KinematicObjectSummary } from "@/generated/kinematics_summary";
import { assetPath } from "@/lib/assetPath";
import type {
  KinematicsChunkPayload,
  KinematicsManifest,
  PublicKinematicsRow,
} from "@/types/kinematics";

const MAX_ALADIN_SOURCES = 5000;

function formatValue(value: string, unit?: string): string {
  if (!value) return "—";
  return unit ? `${value} ${unit}` : value;
}

function finiteNumber(value: string | undefined): number | null {
  if (String(value ?? "").trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bibcodeFromReference(value: string): string | null {
  const firstDigit = value.search(/\d/);
  return firstDigit >= 0 ? value.slice(firstDigit) : null;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function downloadCsv(columns: string[], rows: PublicKinematicsRow[], objectKey: string) {
  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column] ?? "")).join(",")),
  ];
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${objectKey}_kinematics_loaded.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ObjectKinematicsClient({
  object,
}: {
  object: KinematicObjectSummary;
}) {
  const chunkCacheRef = useRef(new Map<string, PublicKinematicsRow[]>());
  const failedPathsRef = useRef(new Set<string>());
  const [cacheVersion, setCacheVersion] = useState(0);
  const [manifest, setManifest] = useState<KinematicsManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(object.totalRecords > 0);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selection, setSelection] = useState<{
    id: string;
    row: PublicKinematicsRow;
  } | null>(null);

  useEffect(() => {
    if (!object.manifestPath) {
      setLoadingManifest(false);
      return;
    }
    const controller = new AbortController();
    setLoadingManifest(true);
    setManifestError(null);
    fetch(assetPath(object.manifestPath), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as KinematicsManifest;
      })
      .then((payload) => {
        if (payload.objectKey !== object.key) {
          throw new Error("Generated manifest does not match this object.");
        }
        setManifest(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setManifestError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingManifest(false);
      });
    return () => controller.abort();
  }, [object.key, object.manifestPath]);

  const kindOptions = useMemo(
    () =>
      Array.from(new Set(manifest?.sources.map((source) => source.sourceKind) ?? [])).sort(),
    [manifest],
  );
  const providerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (manifest?.sources ?? [])
            .filter((source) => kindFilter === "all" || source.sourceKind === kindFilter)
            .map((source) => source.sourceProvider),
        ),
      ).sort(),
    [kindFilter, manifest],
  );
  const sourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (manifest?.sources ?? [])
            .filter((source) => kindFilter === "all" || source.sourceKind === kindFilter)
            .filter(
              (source) =>
                providerFilter === "all" || source.sourceProvider === providerFilter,
            )
            .map((source) => source.sourceName),
        ),
      ).sort(),
    [kindFilter, manifest, providerFilter],
  );

  useEffect(() => {
    if (providerFilter !== "all" && !providerOptions.includes(providerFilter)) {
      setProviderFilter("all");
    }
    if (sourceFilter !== "all" && !sourceOptions.includes(sourceFilter)) {
      setSourceFilter("all");
    }
    setSelection(null);
  }, [kindFilter, providerFilter, providerOptions, sourceFilter, sourceOptions]);

  const visibleChunks = useMemo(
    () =>
      (manifest?.chunks ?? [])
        .filter((chunk) => kindFilter === "all" || chunk.sourceKind === kindFilter)
        .filter(
          (chunk) =>
            providerFilter === "all" || chunk.sourceProvider === providerFilter,
        )
        .filter((chunk) => sourceFilter === "all" || chunk.sourceName === sourceFilter),
    [kindFilter, manifest, providerFilter, sourceFilter],
  );

  const loadPaths = useCallback(
    async (paths: string[]) => {
      const pending = paths.filter((path) => !chunkCacheRef.current.has(path));
      if (pending.length === 0) return;
      pending.forEach((path) => failedPathsRef.current.delete(path));
      setLoadingChunks(true);
      setChunkError(null);
      let nextIndex = 0;
      const errors: string[] = [];
      try {
        const workers = new Array(Math.min(4, pending.length)).fill(0).map(async () => {
          while (nextIndex < pending.length) {
            const index = nextIndex;
            nextIndex += 1;
            const path = pending[index];
            try {
              const response = await fetch(assetPath(path));
              if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
              const payload = (await response.json()) as KinematicsChunkPayload;
              if (payload.objectKey !== object.key || !Array.isArray(payload.rows)) {
                throw new Error(`${path}: invalid generated payload`);
              }
              chunkCacheRef.current.set(path, payload.rows);
            } catch (error) {
              failedPathsRef.current.add(path);
              errors.push(error instanceof Error ? error.message : String(error));
            }
          }
        });
        await Promise.all(workers);
        if (errors.length > 0) {
          throw new Error(errors.slice(0, 3).join("; "));
        }
      } catch (error) {
        setChunkError(error instanceof Error ? error.message : String(error));
      } finally {
        setCacheVersion((value) => value + 1);
        setLoadingChunks(false);
      }
    },
    [object.key],
  );

  useEffect(() => {
    const hasVisibleLoaded = visibleChunks.some((chunk) =>
      chunkCacheRef.current.has(chunk.path),
    );
    if (hasVisibleLoaded || loadingChunks) return;

    const initialPaths: string[] = [];
    const representedKinds = new Set<string>();
    visibleChunks.forEach((chunk) => {
      if (
        representedKinds.has(chunk.sourceKind) ||
        chunkCacheRef.current.has(chunk.path) ||
        failedPathsRef.current.has(chunk.path)
      ) {
        return;
      }
      representedKinds.add(chunk.sourceKind);
      initialPaths.push(chunk.path);
    });
    if (initialPaths.length > 0) {
      // Load one chunk per record kind so the initial diagnostics can include
      // both spectroscopy and proper motion without loading the full object.
      void loadPaths(initialPaths);
    }
  }, [cacheVersion, loadPaths, loadingChunks, visibleChunks]);

  const loadedRows = useMemo(
    () =>
      visibleChunks.flatMap(
        (chunk) => chunkCacheRef.current.get(chunk.path) ?? [],
      ),
    // cacheVersion is an explicit signal that the mutable chunk cache changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheVersion, visibleChunks],
  );
  const selectedTotalRecords = visibleChunks.reduce(
    (total, chunk) => total + chunk.recordCount,
    0,
  );
  const unloadedChunks = visibleChunks.filter(
    (chunk) => !chunkCacheRef.current.has(chunk.path),
  );

  const rowById = useMemo(() => {
    const map = new Map<string, PublicKinematicsRow>();
    loadedRows.forEach((row, index) => map.set(makeKinematicsRowId(row, index), row));
    return map;
  }, [loadedRows]);

  const plottedSources = useMemo(() => {
    const rowsWithCoordinates = loadedRows
      .map((row, index) => {
        const ra = finiteNumber(row.ra_deg);
        const dec = finiteNumber(row.dec_deg);
        if (ra === null || dec === null) return null;
        return {
          id: makeKinematicsRowId(row, index),
          ra,
          dec,
          title: row.star_id || row.source_name || object.name,
        };
      })
      .filter(
        (source): source is { id: string; ra: number; dec: number; title: string } =>
          source !== null,
      );
    if (rowsWithCoordinates.length <= MAX_ALADIN_SOURCES) return rowsWithCoordinates;
    const stride = Math.ceil(rowsWithCoordinates.length / MAX_ALADIN_SOURCES);
    return rowsWithCoordinates.filter((_, index) => index % stride === 0);
  }, [loadedRows, object.name]);

  const initialTarget = useMemo(() => {
    const ra = finiteNumber(object.ra);
    const dec = finiteNumber(object.dec);
    if (ra !== null && dec !== null) return `${ra} ${dec}`;
    return plottedSources[0]
      ? `${plottedSources[0].ra} ${plottedSources[0].dec}`
      : "0 0";
  }, [object.dec, object.ra, plottedSources]);

  const selectedCoordinates = useMemo(() => {
    if (!selection) return null;
    const ra = finiteNumber(selection.row.ra_deg);
    const dec = finiteNumber(selection.row.dec_deg);
    return ra !== null && dec !== null ? { ra, dec } : null;
  }, [selection]);

  const toggleSelectionById = useCallback(
    (rowId: string) => {
      const row = rowById.get(rowId);
      if (!row) return;
      setSelection((current) =>
        current?.id === rowId ? null : { id: rowId, row },
      );
    },
    [rowById],
  );

  const toggleSelectionByRow = useCallback(
    (row: PublicKinematicsRow, rowId: string) => {
      setSelection((current) =>
        current?.id === rowId ? null : { id: rowId, row },
      );
    },
    [],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <Link href="/objects">← Objects</Link>
        <Link href="/datasets/dwarf_mw">Dwarf MW table</Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{object.name}</h1>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{object.key}</div>
        </div>
        <div className="text-sm text-muted-foreground">
          {object.totalRecords.toLocaleString()} normalized records
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <div className="text-muted-foreground">RA</div>
          <div className="font-medium">{formatValue(object.ra, "deg")}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Dec</div>
          <div className="font-medium">{formatValue(object.dec, "deg")}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Distance</div>
          <div className="font-medium">{formatValue(object.distance, "kpc")}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Host</div>
          <div className="font-medium">{formatValue(object.host)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Spectroscopy</div>
          <div className="font-medium">{object.spectroscopyRecords.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Proper motion</div>
          <div className="font-medium">
            {object.properMotionRecords.toLocaleString()} ({object.gaiaRecords.toLocaleString()} Gaia)
          </div>
        </div>
      </div>

      {object.totalRecords === 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Not yet covered</CardTitle>
            <CardDescription>
              The LVDB object exists, but no normalized member-kinematics product is currently generated.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loadingManifest ? (
        <Card className="mt-4">
          <CardContent className="p-6 text-sm text-muted-foreground">Loading provenance manifest…</CardContent>
        </Card>
      ) : null}
      {manifestError ? (
        <Card className="mt-4 border-red-300">
          <CardContent className="p-6 text-sm text-red-700">
            Could not load the provenance manifest: {manifestError}
          </CardContent>
        </Card>
      ) : null}

      {manifest ? (
        <>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Record selection and provenance</CardTitle>
              <CardDescription>
                Filters select source chunks before they are downloaded. Search and sorting below apply to the currently loaded records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger className="h-9 w-44" aria-label="Filter record kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All record kinds</SelectItem>
                    {kindOptions.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={providerFilter} onValueChange={setProviderFilter}>
                  <SelectTrigger className="h-9 w-44" aria-label="Filter provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All providers</SelectItem>
                    {providerOptions.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="h-9 w-64" aria-label="Filter source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {sourceOptions.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingChunks || unloadedChunks.length === 0}
                  onClick={() => void loadPaths(unloadedChunks.slice(0, 1).map((chunk) => chunk.path))}
                >
                  Load next chunk
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingChunks || unloadedChunks.length === 0}
                  onClick={() => void loadPaths(unloadedChunks.map((chunk) => chunk.path))}
                >
                  Load all selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadedRows.length === 0}
                  onClick={() => downloadCsv(manifest.columns, loadedRows, object.key)}
                >
                  Download loaded CSV
                </Button>
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {loadingChunks ? "Loading… " : ""}
                  {loadedRows.length.toLocaleString()} / {selectedTotalRecords.toLocaleString()} selected records loaded
                </span>
              </div>
              {chunkError ? <p className="mt-2 text-sm text-red-700">{chunkError}</p> : null}

              <div className="mt-4 break-all rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                <p>{manifest.semantics.recordUnit}</p>
                <p className="mt-1">{manifest.semantics.membership}</p>
                <p className="mt-2 font-mono">
                  public data SHA-256: {manifest.publicDataSha256}
                </p>
                <p className="font-mono">
                  normalized input SHA-256: {manifest.sourceInputSha256}
                </p>
                <p className="font-mono">
                  normalized snapshot modified: {manifest.sourceSnapshotModifiedAt}
                </p>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manifest.sources.map((source) => {
                      const bibcode = bibcodeFromReference(source.sourceRef);
                      return (
                        <TableRow key={`${source.sourceKind}:${source.sourceProvider}:${source.sourceName}`}>
                          <TableCell>
                            {source.sourceUrl ? (
                              <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceName}</a>
                            ) : source.sourceName}
                          </TableCell>
                          <TableCell>{source.sourceKind}</TableCell>
                          <TableCell>{source.sourceProvider}</TableCell>
                          <TableCell>{source.recordCount.toLocaleString()}</TableCell>
                          <TableCell>
                            {bibcode ? (
                              <a
                                href={`https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcode)}/abstract`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {source.sourceRef}
                              </a>
                            ) : source.sourceRef || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {loadedRows.length > 0 ? (
            <>
            <KinematicsPlots
              rows={loadedRows}
              selectedId={selection?.id ?? null}
              onToggleSelect={toggleSelectionByRow}
            />
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
              <div className="min-w-0">
                <MemberKinematicsTable
                  columns={manifest.columns}
                  rows={loadedRows}
                  selectedId={selection?.id ?? null}
                  onToggleSelect={toggleSelectionByRow}
                />
              </div>
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Loaded-record sky view</CardTitle>
                  <CardDescription>
                    {selectedCoordinates
                      ? `${selection?.row.star_id || "selected"} @ RA=${selectedCoordinates.ra}, Dec=${selectedCoordinates.dec}`
                      : `${plottedSources.length.toLocaleString()} plotted of ${loadedRows.length.toLocaleString()} loaded records`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AladinLiteViewer
                    sources={plottedSources}
                    initialTarget={initialTarget}
                    selectedId={selection?.id ?? null}
                    onToggleSelectId={toggleSelectionById}
                  />
                  {plottedSources.length < loadedRows.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      The sky preview is deterministically sampled to at most {MAX_ALADIN_SOURCES.toLocaleString()} points.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
