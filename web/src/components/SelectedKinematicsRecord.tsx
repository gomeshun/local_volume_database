"use client";

import { Button } from "@/components/ui/button";
import type { PublicKinematicsRow } from "@/types/kinematics";

function measurement(row: PublicKinematicsRow, value: string, error: string, unit: string) {
  if (!row[value]) return "not reported";
  return `${row[value]}${row[error] ? ` ± ${row[error]}` : " (uncertainty not reported)"} ${unit}`;
}

export function SelectedKinematicsRecord({ row, selectedId, visible, loading, onShowInTable, onClear }: {
  row: PublicKinematicsRow | undefined;
  selectedId: string;
  visible: boolean;
  loading: boolean;
  onShowInTable: () => void;
  onClear: () => void;
}) {
  const values = row ? [
    ["RA / Dec (deg)", `${row.ra_deg || "not reported"} / ${row.dec_deg || "not reported"}`],
    ["Line-of-sight velocity", measurement(row, "vlos_kms", "vlos_err_kms", "km/s")],
    ["Proper motion RA*", measurement(row, "pmra_masyr", "pmra_err_masyr", "mas/yr")],
    ["Proper motion Dec", measurement(row, "pmdec_masyr", "pmdec_err_masyr", "mas/yr")],
    ["Membership probability", row.membership_probability ? `${row.membership_probability} (${row.membership_probability_origin || "origin unavailable"})` : "not reported"],
    ["Membership flag", row.membership_flag ? `${row.membership_flag} (${row.membership_flag_origin || "origin unavailable"})` : "not reported"],
  ] : [];
  return (
    <section aria-label="Selected record details" className="mt-4 rounded-lg border-2 border-primary/40 bg-background p-4 shadow-sm lg:sticky lg:top-2 lg:z-10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">Selected record{row ? `: ${row.source_target_label || row.star_id || "unlabelled"}` : ""}</h2>
          {row ? <p className="break-words text-xs text-muted-foreground">{row.source_name} · source row {row.source_row} · Gaia ID: <span className="font-mono">{row.gaia_source_id || "not exposed / not reported"}</span></p> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" disabled={!visible} onClick={onShowInTable}>Show in table</Button>
          <Button variant="ghost" size="sm" onClick={onClear}>Clear selection</Button>
        </div>
      </div>
      {!row ? <p className="mt-2 text-sm" role="status">{loading ? "Loading the selected record…" : "This record is unavailable in the selected datasets. Choose its dataset above or clear the selection."}</p> : !visible ? <p className="mt-2 text-sm" role="status">This record is outside the current filters. Reset or adjust filters to show it in the table.</p> : null}
      {row ? <>
        <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
          {values.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{value}</dd></div>)}
        </dl>
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Record identity and provenance</summary>
          <dl className="mt-2 grid gap-1 break-all">
            <div><dt className="inline font-medium">Record ID: </dt><dd className="inline font-mono">{row.record_id || selectedId}</dd></div>
            <div><dt className="inline font-medium">Legacy source label (star_id): </dt><dd className="inline">{row.star_id || "not reported"}</dd></div>
            <div><dt className="inline font-medium">Source: </dt><dd className="inline">{row.source_provider} / {row.source_table} / {row.source_ref}</dd></div>
          </dl>
          <p className="mt-1 text-muted-foreground">Source labels may repeat, even within one dataset. Record IDs identify source observations, not unique physical stars. Gaia IDs are kept as exact strings; no cross-source match is implied.</p>
        </details>
      </> : <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{selectedId}</p>}
    </section>
  );
}
