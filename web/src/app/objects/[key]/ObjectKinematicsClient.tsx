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
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KinematicObjectSummary } from "@/generated/kinematics_summary";
import { assetPath } from "@/lib/assetPath";
import {
  getKinematicsColumnDefinition,
  KINEMATICS_COLUMN_DICTIONARY,
} from "@/lib/kinematicsColumns";
import {
  chunkDatasetId,
  KINEMATICS_DATASET_COLORS,
  rowDatasetId,
  sourceDatasetId,
  sourceDatasetLabel,
  type KinematicsDatasetStyle,
} from "@/lib/kinematicsDatasets";
import type {
  KinematicsChunk,
  KinematicsChunkPayload,
  KinematicsManifest,
  KinematicsSource,
  PublicKinematicsRow,
} from "@/types/kinematics";

const MAX_ALADIN_SOURCES = 5000;

type DatasetEntry = {
  id: string;
  source: KinematicsSource;
  chunks: KinematicsChunk[];
  style: KinematicsDatasetStyle;
};

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

function triggerCsvDownload(lines: string[], fileName: string) {
  const blob = new Blob([`${lines.join("\n")}\n`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(columns: string[], rows: PublicKinematicsRow[], objectKey: string) {
  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column] ?? "")).join(",")),
  ];
  triggerCsvDownload(lines, `${objectKey}_kinematics_selected.csv`);
}

function downloadColumnGuideCsv(columns: string[], objectKey: string) {
  const guideColumns = [
    "column",
    "label",
    "data_type",
    "unit",
    "description",
    "notes",
    "missing_value",
  ];
  const lines = [
    guideColumns.map(csvCell).join(","),
    ...columns.map((column) => {
      const definition = getKinematicsColumnDefinition(column);
      return [
        column,
        definition?.label ?? "",
        definition?.dataType ?? "",
        definition?.unit ?? "",
        definition?.description ?? "",
        definition?.notes ?? "",
        KINEMATICS_COLUMN_DICTIONARY.missingValue,
      ]
        .map(csvCell)
        .join(",");
    }),
  ];
  triggerCsvDownload(lines, `${objectKey}_kinematics_columns.csv`);
}

export default function ObjectKinematicsClient({
  object,
}: {
  object: KinematicObjectSummary;
}) {
  const chunkCacheRef = useRef(new Map<string, PublicKinematicsRow[]>());
  const inFlightPathsRef = useRef(new Map<string, Promise<void>>());
  const [cacheVersion, setCacheVersion] = useState(0);
  const [manifest, setManifest] = useState<KinematicsManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(object.totalRecords > 0);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingDatasetIds, setLoadingDatasetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [datasetErrors, setDatasetErrors] = useState<Record<string, string>>({});
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
        chunkCacheRef.current.clear();
        inFlightPathsRef.current.clear();
        setCacheVersion(0);
        setSelectedDatasetIds(new Set());
        setLoadingDatasetIds(new Set());
        setDatasetErrors({});
        setSelection(null);
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

  const datasetEntries = useMemo<DatasetEntry[]>(() => {
    if (!manifest) return [];
    const chunksByDataset = new Map<string, KinematicsChunk[]>();
    manifest.chunks.forEach((chunk) => {
      const id = chunkDatasetId(chunk);
      const chunks = chunksByDataset.get(id) ?? [];
      chunks.push(chunk);
      chunksByDataset.set(id, chunks);
    });
    return manifest.sources.map((source, index) => {
      const id = sourceDatasetId(source);
      return {
        id,
        source,
        chunks: chunksByDataset.get(id) ?? [],
        style: {
          id,
          label: sourceDatasetLabel(source),
          color:
            KINEMATICS_DATASET_COLORS[
              index % KINEMATICS_DATASET_COLORS.length
            ],
        },
      };
    });
  }, [manifest]);
  const datasetEntryById = useMemo(
    () => new Map(datasetEntries.map((entry) => [entry.id, entry])),
    [datasetEntries],
  );

  const loadChunk = useCallback(
    (chunk: KinematicsChunk): Promise<void> => {
      if (chunkCacheRef.current.has(chunk.path)) return Promise.resolve();
      const existing = inFlightPathsRef.current.get(chunk.path);
      if (existing) return existing;

      const request = fetch(assetPath(chunk.path))
        .then(async (response) => {
          if (!response.ok) throw new Error(`${chunk.path}: HTTP ${response.status}`);
          const payload = (await response.json()) as KinematicsChunkPayload;
          if (
            payload.objectKey !== object.key ||
            !Array.isArray(payload.rows) ||
            payload.rows.length !== chunk.recordCount ||
            payload.rows.some(
              (row) => rowDatasetId(row) !== chunkDatasetId(chunk),
            )
          ) {
            throw new Error(`${chunk.path}: invalid generated payload`);
          }
          chunkCacheRef.current.set(chunk.path, payload.rows);
        })
        .finally(() => {
          inFlightPathsRef.current.delete(chunk.path);
        });
      inFlightPathsRef.current.set(chunk.path, request);
      return request;
    },
    [object.key],
  );

  const loadDatasets = useCallback(
    async (datasetIds: string[]) => {
      const entries = datasetIds
        .map((id) => datasetEntryById.get(id))
        .filter((entry): entry is DatasetEntry => Boolean(entry));
      if (entries.length === 0) return;
      setLoadingDatasetIds((current) => {
        const next = new Set(current);
        entries.forEach((entry) => next.add(entry.id));
        return next;
      });
      await Promise.all(
        entries.map(async (entry) => {
          setDatasetErrors((current) => {
            const next = { ...current };
            delete next[entry.id];
            return next;
          });
          try {
            await Promise.all(entry.chunks.map((chunk) => loadChunk(chunk)));
          } catch (error) {
            setDatasetErrors((current) => ({
              ...current,
              [entry.id]: error instanceof Error ? error.message : String(error),
            }));
          } finally {
            setLoadingDatasetIds((current) => {
              const next = new Set(current);
              next.delete(entry.id);
              return next;
            });
            setCacheVersion((value) => value + 1);
          }
        }),
      );
    },
    [datasetEntryById, loadChunk],
  );

  const toggleDataset = useCallback(
    (datasetId: string, checked: boolean) => {
      setSelectedDatasetIds((current) => {
        const next = new Set(current);
        if (checked) next.add(datasetId);
        else next.delete(datasetId);
        return next;
      });
      setSelection((current) =>
        !checked && current && rowDatasetId(current.row) === datasetId
          ? null
          : current,
      );
      if (checked) void loadDatasets([datasetId]);
    },
    [loadDatasets],
  );

  const selectAllDatasets = useCallback(() => {
    const ids = datasetEntries.map((entry) => entry.id);
    setSelectedDatasetIds(new Set(ids));
    void loadDatasets(ids);
  }, [datasetEntries, loadDatasets]);

  const clearAllDatasets = useCallback(() => {
    setSelectedDatasetIds(new Set());
    setSelection(null);
  }, []);

  const selectedDatasetEntries = useMemo(
    () => datasetEntries.filter((entry) => selectedDatasetIds.has(entry.id)),
    [datasetEntries, selectedDatasetIds],
  );
  const readyDatasetIds = useMemo(
    () =>
      new Set(
        selectedDatasetEntries
          .filter(
            (entry) =>
              entry.chunks.length > 0 &&
              entry.chunks.every((chunk) =>
                chunkCacheRef.current.has(chunk.path),
              ),
          )
          .map((entry) => entry.id),
      ),
    // cacheVersion is an explicit signal that the mutable chunk cache changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheVersion, selectedDatasetEntries],
  );
  const readyDatasetEntries = useMemo(
    () =>
      selectedDatasetEntries.filter((entry) => readyDatasetIds.has(entry.id)),
    [readyDatasetIds, selectedDatasetEntries],
  );
  const loadedRows = useMemo(
    () =>
      readyDatasetEntries.flatMap((entry) =>
        entry.chunks.flatMap(
          (chunk) => chunkCacheRef.current.get(chunk.path) ?? [],
        ),
      ),
    // cacheVersion is an explicit signal that the mutable chunk cache changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheVersion, readyDatasetEntries],
  );
  const selectedTotalRecords = selectedDatasetEntries.reduce(
    (total, entry) => total + entry.source.recordCount,
    0,
  );
  const allSelectedReady =
    selectedDatasetEntries.length > 0 &&
    readyDatasetEntries.length === selectedDatasetEntries.length;

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
          <div className="text-muted-foreground">vlos available</div>
          <div className="font-medium">
            {object.lineOfSightVelocityRecords.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">PM available</div>
          <div className="font-medium">
            {object.properMotionMeasurementRecords.toLocaleString()} (
            {object.gaiaProperMotionRecords.toLocaleString()} Gaia)
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
              <CardTitle>Dataset selection and provenance</CardTitle>
              <CardDescription>
                Check complete source datasets to include them in diagnostics,
                the record table, the sky view, and CSV downloads. Uncheck a
                dataset to remove it; previously fetched data stays cached in
                this browser tab for fast re-selection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    datasetEntries.length === 0 ||
                    selectedDatasetIds.size === datasetEntries.length
                  }
                  onClick={selectAllDatasets}
                >
                  Select all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedDatasetIds.size === 0}
                  onClick={clearAllDatasets}
                >
                  Clear all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!allSelectedReady}
                  onClick={() => downloadCsv(manifest.columns, loadedRows, object.key)}
                >
                  Download selected CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadColumnGuideCsv(manifest.columns, object.key)
                  }
                >
                  Download column guide
                </Button>
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {readyDatasetEntries.length.toLocaleString()} /{" "}
                  {selectedDatasetEntries.length.toLocaleString()} selected
                  datasets ready · {loadedRows.length.toLocaleString()} /{" "}
                  {selectedTotalRecords.toLocaleString()} records
                </span>
              </div>

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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            selectedDatasetIds.size === datasetEntries.length
                              ? true
                              : selectedDatasetIds.size > 0
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(checked) =>
                            checked === true
                              ? selectAllDatasets()
                              : clearAllDatasets()
                          }
                          aria-label="Select or clear all datasets"
                        />
                      </TableHead>
                      <TableHead>Dataset</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Value coverage</TableHead>
                      <TableHead>Membership coverage</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datasetEntries.map((entry) => {
                      const { source } = entry;
                      const bibcode = bibcodeFromReference(source.sourceRef);
                      const selected = selectedDatasetIds.has(entry.id);
                      const loading = loadingDatasetIds.has(entry.id);
                      const ready = readyDatasetIds.has(entry.id);
                      const error = datasetErrors[entry.id];
                      return (
                        <TableRow
                          key={entry.id}
                          data-state={selected ? "selected" : undefined}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) =>
                                toggleDataset(entry.id, checked === true)
                              }
                              aria-label={`${selected ? "Remove" : "Add"} ${entry.style.label}`}
                            />
                          </TableCell>
                          <TableCell className="min-w-56">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: entry.style.color }}
                                aria-hidden="true"
                              />
                              {source.sourceUrl ? (
                                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                                  {source.sourceName}
                                </a>
                              ) : source.sourceName}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-32 text-xs">
                            {loading ? (
                              <span className="text-muted-foreground">Loading…</span>
                            ) : error && selected ? (
                              <div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void loadDatasets([entry.id])}
                                >
                                  Retry
                                </Button>
                                <div className="mt-1 max-w-72 break-words text-red-700">
                                  {error}
                                </div>
                              </div>
                            ) : ready ? (
                              <span>Ready</span>
                            ) : (
                              <span className="text-muted-foreground">
                                Not selected
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{source.sourceKind}</TableCell>
                          <TableCell>{source.sourceProvider}</TableCell>
                          <TableCell>{source.recordCount.toLocaleString()}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            <div>
                              vlos: {source.lineOfSightVelocityRecords.toLocaleString()} /{" "}
                              {source.recordCount.toLocaleString()}
                            </div>
                            <div className="text-muted-foreground">
                              PM: {source.properMotionRecords.toLocaleString()} /{" "}
                              {source.recordCount.toLocaleString()} · [Fe/H]:{" "}
                              {source.metallicityRecords.toLocaleString()} /{" "}
                              {source.recordCount.toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            <div>
                              Flag: {source.membershipFlagRecords.toLocaleString()} /{" "}
                              {source.recordCount.toLocaleString()}
                              {source.membershipFlagInheritedRecords > 0
                                ? ` (${source.membershipFlagInheritedRecords.toLocaleString()} same-star)`
                                : ""}
                            </div>
                            <div className="text-muted-foreground">
                              Probability:{" "}
                              {source.membershipProbabilityRecords.toLocaleString()} /{" "}
                              {source.recordCount.toLocaleString()}
                              {source.membershipProbabilityInheritedRecords > 0
                                ? ` (${source.membershipProbabilityInheritedRecords.toLocaleString()} same-star)`
                                : ""}
                            </div>
                          </TableCell>
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

              <details className="mt-4 rounded-lg border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                  Column guide for the record table and downloaded CSV (
                  {manifest.columns.length})
                </summary>
                <div className="border-t p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-4xl text-sm text-muted-foreground">
                      Columns appear in the same order in the browser table and
                      selected-data CSV.{" "}
                      {KINEMATICS_COLUMN_DICTIONARY.missingValue}
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={assetPath(
                          manifest.columnDictionaryPath ||
                            "/data/kinematics/columns.json",
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open machine-readable JSON
                      </a>
                    </Button>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-lg border">
                    <Table wrapperClassName="max-h-[60vh]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky top-0 bg-background">
                            Column
                          </TableHead>
                          <TableHead className="sticky top-0 bg-background">
                            Type
                          </TableHead>
                          <TableHead className="sticky top-0 bg-background">
                            Unit
                          </TableHead>
                          <TableHead className="sticky top-0 bg-background">
                            Meaning
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manifest.columns.map((column) => {
                          const definition =
                            getKinematicsColumnDefinition(column);
                          return (
                            <TableRow key={column}>
                              <TableCell className="whitespace-nowrap font-mono text-xs">
                                {column}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {definition?.dataType || "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {definition?.unit || "—"}
                              </TableCell>
                              <TableCell className="min-w-96">
                                <div className="font-medium">
                                  {definition?.label || column}
                                </div>
                                <div className="mt-1 text-sm">
                                  {definition?.description ||
                                    "No description is available."}
                                </div>
                                {definition?.notes ? (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {definition.notes}
                                  </div>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>

          {loadedRows.length === 0 ? (
            <Card className="mt-4">
              <CardContent className="p-6 text-sm text-muted-foreground">
                {selectedDatasetEntries.length === 0
                  ? "Select one or more datasets above to load records for diagnostics, browsing, and download."
                  : loadingDatasetIds.size > 0
                    ? "Loading the selected datasets…"
                    : "No selected dataset is ready. Retry any failed dataset above or choose another dataset."}
              </CardContent>
            </Card>
          ) : null}

          {loadedRows.length > 0 ? (
            <>
            <KinematicsPlots
              rows={loadedRows}
              datasets={readyDatasetEntries.map((entry) => entry.style)}
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
                  <CardTitle>Selected-dataset sky view</CardTitle>
                  <CardDescription>
                    {selectedCoordinates
                      ? `${selection?.row.star_id || "selected"} @ RA=${selectedCoordinates.ra}, Dec=${selectedCoordinates.dec}`
                      : `${plottedSources.length.toLocaleString()} plotted of ${loadedRows.length.toLocaleString()} selected-dataset records`}
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
