"use client";

import { useMemo } from "react";
import { makeKinematicsRowId } from "@/components/MemberKinematicsTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicKinematicsRow } from "@/types/kinematics";

type PlotPoint = {
  id: string;
  row: PublicKinematicsRow;
  x: number;
  y: number;
};

const WIDTH = 420;
const HEIGHT = 260;
const MARGIN = { left: 58, right: 18, top: 18, bottom: 46 };
const MAX_POINTS = 1500;

function finiteNumber(value: string | undefined): number | null {
  if (String(value ?? "").trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extent(values: number[]): [number, number] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    const padding = Math.max(1, Math.abs(minimum) * 0.05);
    return [minimum - padding, maximum + padding];
  }
  const padding = (maximum - minimum) * 0.06;
  return [minimum - padding, maximum + padding];
}

function ticks(domain: [number, number], count = 5): number[] {
  return Array.from(
    { length: count },
    (_, index) => domain[0] + ((domain[1] - domain[0]) * index) / (count - 1),
  );
}

function ScatterPlot({
  title,
  xLabel,
  yLabel,
  points,
  selectedId,
  onToggleSelect,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  points: PlotPoint[];
  selectedId: string | null;
  onToggleSelect: (row: PublicKinematicsRow, rowId: string) => void;
}) {
  if (points.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        {title}: no loaded records contain both quantities.
      </div>
    );
  }

  const sampled =
    points.length <= MAX_POINTS
      ? points
      : points.filter((_, index) => index % Math.ceil(points.length / MAX_POINTS) === 0);
  const xDomain = extent(points.map((point) => point.x));
  const yDomain = extent(points.map((point) => point.y));
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xPosition = (value: number) =>
    MARGIN.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const yPosition = (value: number) =>
    MARGIN.top + plotHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight;

  return (
    <div>
      <div className="mb-1 text-sm font-medium">{title}</div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full rounded-md border bg-background"
        role="img"
        aria-label={`${title}, ${points.length} loaded records`}
      >
        <line
          x1={MARGIN.left}
          x2={MARGIN.left}
          y1={MARGIN.top}
          y2={MARGIN.top + plotHeight}
          className="stroke-border"
        />
        <line
          x1={MARGIN.left}
          x2={MARGIN.left + plotWidth}
          y1={MARGIN.top + plotHeight}
          y2={MARGIN.top + plotHeight}
          className="stroke-border"
        />
        {ticks(xDomain).map((tick) => (
          <g key={`x-${tick}`}>
            <line
              x1={xPosition(tick)}
              x2={xPosition(tick)}
              y1={MARGIN.top + plotHeight}
              y2={MARGIN.top + plotHeight + 5}
              className="stroke-muted-foreground"
            />
            <text
              x={xPosition(tick)}
              y={MARGIN.top + plotHeight + 18}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {tick.toPrecision(3)}
            </text>
          </g>
        ))}
        {ticks(yDomain).map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={MARGIN.left - 5}
              x2={MARGIN.left}
              y1={yPosition(tick)}
              y2={yPosition(tick)}
              className="stroke-muted-foreground"
            />
            <text
              x={MARGIN.left - 8}
              y={yPosition(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {tick.toPrecision(3)}
            </text>
          </g>
        ))}
        {sampled.map((point) => {
          const selected = point.id === selectedId;
          return (
            <circle
              key={point.id}
              cx={xPosition(point.x)}
              cy={yPosition(point.y)}
              r={selected ? 5 : 2.5}
              className={
                selected
                  ? "cursor-pointer fill-orange-500 stroke-background stroke-2"
                  : "cursor-pointer fill-indigo-500/65 hover:fill-orange-500"
              }
              role="button"
              tabIndex={0}
              aria-label={`${point.row.star_id || "record"}: ${xLabel} ${point.x}, ${yLabel} ${point.y}`}
              onClick={() => onToggleSelect(point.row, point.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggleSelect(point.row, point.id);
                }
              }}
            />
          );
        })}
        <text
          x={MARGIN.left + plotWidth / 2}
          y={HEIGHT - 8}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          {xLabel}
        </text>
        <text
          x={14}
          y={MARGIN.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${MARGIN.top + plotHeight / 2})`}
          className="fill-muted-foreground text-[11px]"
        >
          {yLabel}
        </text>
      </svg>
      {sampled.length < points.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Deterministic preview of {sampled.length.toLocaleString()} / {points.length.toLocaleString()} points.
        </p>
      ) : null}
    </div>
  );
}

export function KinematicsPlots({
  rows,
  selectedId,
  onToggleSelect,
}: {
  rows: PublicKinematicsRow[];
  selectedId: string | null;
  onToggleSelect: (row: PublicKinematicsRow, rowId: string) => void;
}) {
  const properMotionPoints = useMemo(
    () =>
      rows.flatMap((row, index) => {
        const x = finiteNumber(row.pmra_masyr);
        const y = finiteNumber(row.pmdec_masyr);
        return x !== null && y !== null
          ? [{ id: makeKinematicsRowId(row, index), row, x, y }]
          : [];
      }),
    [rows],
  );
  const chemistryPoints = useMemo(
    () =>
      rows.flatMap((row, index) => {
        const x = finiteNumber(row.feh);
        const y = finiteNumber(row.vlos_kms);
        return x !== null && y !== null
          ? [{ id: makeKinematicsRowId(row, index), row, x, y }]
          : [];
      }),
    [rows],
  );

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Loaded-record diagnostics</CardTitle>
        <CardDescription>
          Click a point to link the selection with the table and sky view. Provider-specific selection functions remain in effect.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <ScatterPlot
          title="Proper-motion plane"
          xLabel="pmRA (mas/yr)"
          yLabel="pmDec (mas/yr)"
          points={properMotionPoints}
          selectedId={selectedId}
          onToggleSelect={onToggleSelect}
        />
        <ScatterPlot
          title="Velocity–metallicity"
          xLabel="[Fe/H] (dex)"
          yLabel="vlos (km/s)"
          points={chemistryPoints}
          selectedId={selectedId}
          onToggleSelect={onToggleSelect}
        />
      </CardContent>
    </Card>
  );
}
