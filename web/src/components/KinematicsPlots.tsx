"use client";

import { useMemo, useState } from "react";
import { makeKinematicsRowId } from "@/components/MemberKinematicsTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublicKinematicsRow } from "@/types/kinematics";

type PlotPoint = {
  id: string;
  row: PublicKinematicsRow;
  x: number;
  y: number;
};

type HistogramValue = {
  id: string;
  value: number;
};

type HistogramBin = {
  lower: number;
  upper: number;
  count: number;
};

type AxisOption = {
  key: string;
  label: string;
  selectLabel?: string;
};

const WIDTH = 420;
const HEIGHT = 260;
const MARGIN = { left: 58, right: 18, top: 18, bottom: 46 };
const MAX_POINTS = 1500;
const MIN_HISTOGRAM_BINS = 5;
const MAX_HISTOGRAM_BINS = 40;

const AXIS_OPTIONS: AxisOption[] = [
  { key: "ra_deg", label: "RA (deg)" },
  { key: "dec_deg", label: "Dec (deg)" },
  {
    key: "vlos_kms",
    label: "Line-of-sight velocity (km/s)",
    selectLabel: "vlos (km/s)",
  },
  {
    key: "vlos_err_kms",
    label: "Velocity uncertainty (km/s)",
    selectLabel: "vlos error (km/s)",
  },
  { key: "pmra_masyr", label: "pmRA (mas/yr)" },
  {
    key: "pmra_err_masyr",
    label: "pmRA uncertainty (mas/yr)",
    selectLabel: "pmRA error (mas/yr)",
  },
  { key: "pmdec_masyr", label: "pmDec (mas/yr)" },
  {
    key: "pmdec_err_masyr",
    label: "pmDec uncertainty (mas/yr)",
    selectLabel: "pmDec error (mas/yr)",
  },
  {
    key: "membership_probability",
    label: "Membership probability",
    selectLabel: "Membership P",
  },
  { key: "feh", label: "[Fe/H] (dex)" },
  {
    key: "feh_err",
    label: "[Fe/H] uncertainty (dex)",
    selectLabel: "[Fe/H] error (dex)",
  },
];

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

function formatTick(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 10_000 || (absolute > 0 && absolute < 0.001)) {
    return value.toExponential(1);
  }
  const digits = absolute >= 100 ? 0 : absolute >= 10 ? 1 : absolute >= 1 ? 2 : 3;
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function quantile(sortedValues: number[], probability: number): number {
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  const fraction = position - lowerIndex;
  return (
    sortedValues[lowerIndex] * (1 - fraction) +
    sortedValues[upperIndex] * fraction
  );
}

function buildHistogram(values: number[]): {
  bins: HistogramBin[];
  domain: [number, number];
  binWidth: number;
} {
  const sorted = [...values].sort((left, right) => left - right);
  const minimum = sorted[0];
  const maximum = sorted[sorted.length - 1];

  if (minimum === maximum) {
    const domain = extent(sorted);
    return {
      bins: [{ lower: domain[0], upper: domain[1], count: sorted.length }],
      domain,
      binWidth: domain[1] - domain[0],
    };
  }

  const range = maximum - minimum;
  const interquartileRange = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const freedmanDiaconisWidth =
    interquartileRange > 0
      ? 2 * interquartileRange * Math.pow(sorted.length, -1 / 3)
      : 0;
  const sturgesCount = Math.ceil(Math.log2(sorted.length) + 1);
  const proposedCount =
    freedmanDiaconisWidth > 0
      ? Math.ceil(range / freedmanDiaconisWidth)
      : sturgesCount;
  const binCount = Math.max(
    1,
    Math.min(
      MAX_HISTOGRAM_BINS,
      sorted.length,
      Math.max(MIN_HISTOGRAM_BINS, proposedCount),
    ),
  );
  const binWidth = range / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lower: minimum + index * binWidth,
    upper: index === binCount - 1 ? maximum : minimum + (index + 1) * binWidth,
    count: 0,
  }));

  sorted.forEach((value) => {
    const index = Math.min(binCount - 1, Math.floor((value - minimum) / binWidth));
    bins[index].count += 1;
  });

  return { bins, domain: [minimum, maximum], binWidth };
}

function samplePoints(points: PlotPoint[], selectedId: string | null): PlotPoint[] {
  if (points.length <= MAX_POINTS) return points;
  const sampled = Array.from(
    { length: MAX_POINTS },
    (_, index) => points[Math.floor((index * points.length) / MAX_POINTS)],
  );
  if (selectedId && !sampled.some((point) => point.id === selectedId)) {
    const selected = points.find((point) => point.id === selectedId);
    if (selected) sampled[sampled.length - 1] = selected;
  }
  return sampled;
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
      <div>
        <div className="mb-1 text-sm font-medium">{title}</div>
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No loaded records contain both selected quantities.
        </div>
      </div>
    );
  }

  const sampled = samplePoints(points, selectedId);
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
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          n = {points.length.toLocaleString()}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full rounded-md border bg-background"
        role="img"
        aria-label={`${title}, ${points.length} loaded records`}
      >
        <title>{title}</title>
        <desc>
          Scatter plot of {yLabel} against {xLabel} for {points.length} loaded records.
        </desc>
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
              {formatTick(tick)}
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
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {sampled.map((point, index) => {
          const selected = point.id === selectedId;
          return (
            <circle
              key={`${point.id}:${index}`}
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
            >
              <title>
                {point.row.star_id || "record"}: {xLabel} {point.x}, {yLabel} {point.y}
              </title>
            </circle>
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

function VelocityHistogram({
  values,
  selectedId,
}: {
  values: HistogramValue[];
  selectedId: string | null;
}) {
  const histogram = useMemo(
    () => (values.length > 0 ? buildHistogram(values.map(({ value }) => value)) : null),
    [values],
  );

  if (!histogram) {
    return (
      <div>
        <div className="mb-1 text-sm font-medium">Line-of-sight velocity distribution</div>
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No loaded records contain a line-of-sight velocity.
        </div>
      </div>
    );
  }

  const { bins, domain, binWidth } = histogram;
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maximumCount = Math.max(...bins.map((bin) => bin.count));
  const selectedValue = values.find(({ id }) => id === selectedId)?.value ?? null;
  const selectedBinIndex =
    selectedValue === null
      ? -1
      : Math.min(
          bins.length - 1,
          Math.max(0, Math.floor((selectedValue - domain[0]) / binWidth)),
        );
  const xPosition = (value: number) =>
    MARGIN.left + ((value - domain[0]) / (domain[1] - domain[0])) * plotWidth;
  const yPosition = (count: number) =>
    MARGIN.top + plotHeight - (count / maximumCount) * plotHeight;
  const countTicks = Array.from(
    new Set(
      Array.from({ length: 5 }, (_, index) =>
        Math.round((maximumCount * index) / 4),
      ),
    ),
  );

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">Line-of-sight velocity distribution</span>
        <span className="text-xs text-muted-foreground">
          n = {values.length.toLocaleString()}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full rounded-md border bg-background"
        role="img"
        aria-label={`Line-of-sight velocity histogram, ${values.length} loaded records in ${bins.length} bins`}
      >
        <title>Line-of-sight velocity distribution</title>
        <desc>
          Histogram of line-of-sight velocity for {values.length} loaded records in {bins.length} automatically selected bins.
        </desc>
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
        {bins.map((bin, index) => {
          const x = xPosition(bin.lower);
          const upper = index === bins.length - 1 ? domain[1] : bin.upper;
          const width = Math.max(1, xPosition(upper) - x);
          const y = yPosition(bin.count);
          return (
            <rect
              key={`${bin.lower}:${bin.upper}`}
              x={x + 0.5}
              y={y}
              width={Math.max(0.5, width - 1)}
              height={MARGIN.top + plotHeight - y}
              className={
                index === selectedBinIndex
                  ? "fill-orange-500/75"
                  : "fill-indigo-500/65"
              }
            >
              <title>
                {formatTick(bin.lower)} to {formatTick(bin.upper)} km/s: {bin.count} records
              </title>
            </rect>
          );
        })}
        {ticks(domain).map((tick) => (
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
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {countTicks.map((tick) => (
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
              {tick}
            </text>
          </g>
        ))}
        {selectedValue !== null ? (
          <line
            x1={xPosition(selectedValue)}
            x2={xPosition(selectedValue)}
            y1={MARGIN.top}
            y2={MARGIN.top + plotHeight}
            className="stroke-orange-500 stroke-2"
            aria-label={`Selected record at ${selectedValue} km/s`}
          />
        ) : null}
        <text
          x={MARGIN.left + plotWidth / 2}
          y={HEIGHT - 8}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          vlos (km/s)
        </text>
        <text
          x={14}
          y={MARGIN.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${MARGIN.top + plotHeight / 2})`}
          className="fill-muted-foreground text-[11px]"
        >
          records
        </text>
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">
        {bins.length} automatic bins (Δv ≈ {formatTick(binWidth)} km/s); orange marks the selected record.
      </p>
    </div>
  );
}

function AxisSelector({
  label,
  value,
  options,
  counts,
  onValueChange,
}: {
  label: string;
  value: string;
  options: AxisOption[];
  counts: Map<string, number>;
  onValueChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 flex-1 text-xs text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full" aria-label={`Select ${label.toLowerCase()}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.selectLabel ?? option.label} ({counts.get(option.key)?.toLocaleString()})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function preferredAvailableAxis(
  availableOptions: AxisOption[],
  preferences: string[],
  excludedKey?: string,
): string {
  const availableKeys = new Set(availableOptions.map(({ key }) => key));
  return (
    preferences.find((key) => key !== excludedKey && availableKeys.has(key)) ??
    availableOptions.find(({ key }) => key !== excludedKey)?.key ??
    availableOptions[0]?.key ??
    ""
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
  const [xAxis, setXAxis] = useState("feh");
  const [yAxis, setYAxis] = useState("vlos_kms");

  const axisCounts = useMemo(
    () =>
      new Map(
        AXIS_OPTIONS.map((option) => [
          option.key,
          rows.reduce(
            (count, row) =>
              count + (finiteNumber(row[option.key]) === null ? 0 : 1),
            0,
          ),
        ]),
      ),
    [rows],
  );
  const availableAxisOptions = useMemo(
    () => AXIS_OPTIONS.filter((option) => (axisCounts.get(option.key) ?? 0) > 0),
    [axisCounts],
  );

  const availableAxisKeys = new Set(
    availableAxisOptions.map(({ key }) => key),
  );
  const effectiveXAxis = availableAxisKeys.has(xAxis)
    ? xAxis
    : preferredAvailableAxis(
        availableAxisOptions,
        ["feh", "pmra_masyr", "ra_deg", "vlos_kms"],
        yAxis,
      );
  const effectiveYAxis = availableAxisKeys.has(yAxis)
    ? yAxis
    : preferredAvailableAxis(
        availableAxisOptions,
        ["vlos_kms", "pmdec_masyr", "dec_deg", "feh"],
        effectiveXAxis,
      );

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
  const velocityValues = useMemo(
    () =>
      rows.flatMap((row, index) => {
        const value = finiteNumber(row.vlos_kms);
        return value === null
          ? []
          : [{ id: makeKinematicsRowId(row, index), value }];
      }),
    [rows],
  );
  const customPoints = useMemo(
    () =>
      rows.flatMap((row, index) => {
        const x = finiteNumber(row[effectiveXAxis]);
        const y = finiteNumber(row[effectiveYAxis]);
        return x !== null && y !== null
          ? [{ id: makeKinematicsRowId(row, index), row, x, y }]
          : [];
      }),
    [effectiveXAxis, effectiveYAxis, rows],
  );

  const xLabel =
    AXIS_OPTIONS.find((option) => option.key === effectiveXAxis)?.label ??
    effectiveXAxis;
  const yLabel =
    AXIS_OPTIONS.find((option) => option.key === effectiveYAxis)?.label ??
    effectiveYAxis;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Loaded-record diagnostics</CardTitle>
        <CardDescription>
          All panels use currently loaded records, not de-duplicated stars. Click a scatter point to link the selection with the table and sky view; source-specific selection functions remain in effect.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <ScatterPlot
          title="Proper-motion plane"
          xLabel="pmRA (mas/yr)"
          yLabel="pmDec (mas/yr)"
          points={properMotionPoints}
          selectedId={selectedId}
          onToggleSelect={onToggleSelect}
        />
        <VelocityHistogram values={velocityValues} selectedId={selectedId} />
        <div className="lg:col-span-2 2xl:col-span-1">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row">
            <AxisSelector
              label="X axis"
              value={effectiveXAxis}
              options={availableAxisOptions}
              counts={axisCounts}
              onValueChange={setXAxis}
            />
            <AxisSelector
              label="Y axis"
              value={effectiveYAxis}
              options={availableAxisOptions}
              counts={axisCounts}
              onValueChange={setYAxis}
            />
          </div>
          <ScatterPlot
            title="Custom two-axis plot"
            xLabel={xLabel}
            yLabel={yLabel}
            points={customPoints}
            selectedId={selectedId}
            onToggleSelect={onToggleSelect}
          />
        </div>
      </CardContent>
    </Card>
  );
}
