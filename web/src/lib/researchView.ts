export type ResearchView = {
  version: 1;
  datasets: string[];
  query: string;
  membership: string;
  xAxis: string;
  yAxis: string;
  sort: { column: string; direction: "asc" | "desc" } | null;
  columns: string[] | null;
  pageSize: number;
  sky: boolean;
  selectedId: string | null;
};

export const DEFAULT_RESEARCH_VIEW: ResearchView = {
  version: 1, datasets: [], query: "", membership: "all", xAxis: "feh", yAxis: "vlos_kms",
  sort: { column: "star_id", direction: "asc" }, columns: null, pageSize: 50, sky: true, selectedId: null,
};
export const MEMBERSHIP_FILTERS = ["all", "available", "source-reported", "probability-0.5", "probability-0.9"];
const AXES = ["ra_deg", "dec_deg", "vlos_kms", "vlos_err_kms", "pmra_masyr", "pmra_err_masyr", "pmdec_masyr", "pmdec_err_masyr", "membership_probability", "feh", "feh_err"];

export function decodeResearchView(raw: string | null): ResearchView {
  if (!raw || raw.length > 50000) return DEFAULT_RESEARCH_VIEW;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return DEFAULT_RESEARCH_VIEW;
    const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length < 1000))].slice(0, 300) : [];
    return {
      ...DEFAULT_RESEARCH_VIEW,
      datasets: strings(data.datasets),
      query: typeof data.query === "string" ? data.query.slice(0, 500) : "",
      membership: MEMBERSHIP_FILTERS.includes(data.membership) ? data.membership : "all",
      xAxis: AXES.includes(data.xAxis) ? data.xAxis : DEFAULT_RESEARCH_VIEW.xAxis,
      yAxis: AXES.includes(data.yAxis) ? data.yAxis : DEFAULT_RESEARCH_VIEW.yAxis,
      sort: data.sort === null ? null : data.sort && typeof data.sort.column === "string" && ["asc", "desc"].includes(data.sort.direction) ? { column: data.sort.column.slice(0, 100), direction: data.sort.direction } : DEFAULT_RESEARCH_VIEW.sort,
      columns: Array.isArray(data.columns) ? strings(data.columns) : null,
      pageSize: [25, 50, 100, 200].includes(data.pageSize) ? data.pageSize : 50,
      sky: data.sky !== false,
      selectedId: typeof data.selectedId === "string" ? data.selectedId.slice(0, 1000) : null,
    };
  } catch { return DEFAULT_RESEARCH_VIEW; }
}

export function filterKinematicsRows<T extends Record<string, string>>(rows: T[], query: string, membership: string): T[] {
  const normalized = query.trim().toLowerCase();
  return rows.filter((row) => {
    const raw = String(row.membership_probability ?? "").trim();
    const probability = raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
    if (membership === "available" && probability === null && !String(row.membership_flag ?? "").trim()) return false;
    if (membership === "source-reported" && row.membership_probability_origin !== "reported" && row.membership_flag_origin !== "reported") return false;
    if (membership === "probability-0.5" && (probability === null || probability < 0.5)) return false;
    if (membership === "probability-0.9" && (probability === null || probability < 0.9)) return false;
    return !normalized || [row.star_id, row.source_kind, row.source_name, row.source_provider, row.source_ref, row.membership_flag].join(" ").toLowerCase().includes(normalized);
  });
}

export function rowsToCsv(columns: string[], rows: Record<string, string>[]): string {
  const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column] ?? "")).join(","))].join("\n") + "\n";
}
