"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AladinLiteViewer } from "@/components/AladinLiteViewer";
import { MemberKinematicsTable, makeKinematicsRowId } from "@/components/MemberKinematicsTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicKinematicsRow } from "@/generated/kinematics";
import type { KinematicObjectSummary } from "@/generated/kinematics_summary";

function formatValue(value: string, unit?: string): string {
  if (!value) return "-";
  return unit ? `${value} ${unit}` : value;
}

export default function ObjectKinematicsClient({
  object,
  rows,
  columns,
}: {
  object: KinematicObjectSummary;
  rows: PublicKinematicsRow[];
  columns: string[];
}) {
  const [selection, setSelection] = useState<{ id: string; row: PublicKinematicsRow } | null>(null);

  const rowById = useMemo(() => {
    const map = new Map<string, PublicKinematicsRow>();
    rows.forEach((row, index) => map.set(makeKinematicsRowId(row, index), row));
    return map;
  }, [rows]);

  const sources = useMemo(() => {
    return rows
      .map((row, index) => {
        const ra = Number(row.ra_deg);
        const dec = Number(row.dec_deg);
        if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
        return {
          id: makeKinematicsRowId(row, index),
          ra,
          dec,
          title: row.star_id || row.source_name || object.name,
        };
      })
      .filter((source): source is { id: string; ra: number; dec: number; title: string } => Boolean(source));
  }, [object.name, rows]);

  const initialTarget = useMemo(() => {
    const objectRa = Number(object.ra);
    const objectDec = Number(object.dec);
    if (Number.isFinite(objectRa) && Number.isFinite(objectDec)) return `${objectRa} ${objectDec}`;
    const first = sources[0];
    return first ? `${first.ra} ${first.dec}` : "0 0";
  }, [object.dec, object.ra, sources]);

  const selectedCoords = useMemo(() => {
    if (!selection) return null;
    const ra = Number(selection.row.ra_deg);
    const dec = Number(selection.row.dec_deg);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
    return { ra, dec };
  }, [selection]);

  const toggleSelectionById = useCallback(
    (rowId: string) => {
      const row = rowById.get(rowId);
      if (!row) return;
      setSelection((current) => (current?.id === rowId ? null : { id: rowId, row }));
    },
    [rowById],
  );

  const toggleSelectionByRow = useCallback((row: PublicKinematicsRow, rowId: string) => {
    setSelection((current) => (current?.id === rowId ? null : { id: rowId, row }));
  }, []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <Link href="/objects">Objects</Link>
        <Link href="/datasets/dwarf_mw">Dwarf MW table</Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{object.name}</h1>
          <div className="mt-1 text-sm text-muted-foreground">{object.key}</div>
        </div>
        <div className="text-sm text-muted-foreground">
          {object.totalRows.toLocaleString()} member-star rows
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
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
          <div className="text-muted-foreground">Spectroscopy</div>
          <div className="font-medium">{object.spectroscopyRows.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Proper motion</div>
          <div className="font-medium">
            {object.properMotionRows.toLocaleString()} ({object.gaiaRows.toLocaleString()} Gaia)
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
        <div className="min-w-0">
          <MemberKinematicsTable columns={columns} rows={rows} selectedId={selection?.id ?? null} onToggleSelect={toggleSelectionByRow} />
        </div>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Member-star sky view</CardTitle>
            <CardDescription>
              {selectedCoords
                ? `${selection?.row.star_id || "selected"} @ RA=${selectedCoords.ra}, Dec=${selectedCoords.dec}`
                : `${sources.length.toLocaleString()} plotted sources`}
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