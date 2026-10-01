// Record selection remains compatible with existing shared URLs. A source label
// is never a unique-star key; source_row disambiguates observations.
type Row = Record<string, string>;

export function makeKinematicsRowId(row: Row, index: number): string {
  const identity = [row.object_key, row.source_provider, row.source_name, row.source_row, row.star_id];
  return identity.slice(1).some((value) => String(value ?? "").trim() !== "")
    ? identity.join(":") : `${row.object_key || "record"}:${index}`;
}

export function kinematicsRecordLabel(row: Row): string {
  const label = row.source_target_label || row.star_id || "Unlabelled record";
  return `${label} · ${row.gaia_source_id ? `Gaia ${row.gaia_source_id}` : `source row ${row.source_row || "unknown"}`}`;
}

const NUMERIC_COLUMNS = new Set(["source_row", "ra_deg", "dec_deg", "vlos_kms", "vlos_err_kms", "pmra_masyr", "pmra_err_masyr", "pmdec_masyr", "pmdec_err_masyr", "membership_probability", "feh", "feh_err"]);

export function sortKinematicsRows<T extends Row>(rows: T[], sort: { column: string; direction: "asc" | "desc" } | null): T[] {
  if (!sort) return rows;
  return [...rows].sort((left, right) => {
    const a = left[sort.column] ?? "";
    const b = right[sort.column] ?? "";
    // IDs must never pass through Number: adjacent Gaia identifiers exceed 2^53.
    const numeric = NUMERIC_COLUMNS.has(sort.column) && a.trim() && b.trim() && Number.isFinite(Number(a)) && Number.isFinite(Number(b));
    const result = numeric ? Number(a) - Number(b) : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? result : -result;
  });
}

export function selectedRecordPage(rows: Row[], selectedId: string | null, pageSize: number): number | null {
  if (!selectedId) return null;
  const index = rows.findIndex((row, index) => makeKinematicsRowId(row, index) === selectedId);
  return index < 0 ? null : Math.floor(index / pageSize);
}

export function resolveKinematicsSelection(loadedRows: Row[], filteredRows: Row[], selectedId: string | null) {
  const row = selectedId ? loadedRows.find((row, index) => makeKinematicsRowId(row, index) === selectedId) : undefined;
  const visible = Boolean(row && filteredRows.includes(row));
  return { row, visible };
}
