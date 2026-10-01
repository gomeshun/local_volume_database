type Row = Record<string, string>;
export const IDENTITY_COLUMNS = ["source_target_label", "gaia_source_id", "record_id"];
export const GEHA_SOURCE = "geha2026_deimos_expanded_aas_iop";

export type IdentitySupplementReference = {
  path: string;
  sha256: string;
  sourceFileSha256: string;
  sourceUrl: string;
  basePublicDataSha256: string;
};
export type IdentitySupplement = {
  schemaVersion: number;
  objectKey: string;
  sourceProvider: string;
  sourceName: string;
  sourceTable: string;
  sourceUrl: string;
  sourceFileSha256: string;
  basePublicDataSha256: string;
  baseSourceInputSha256: string;
  rows: { source_row: string; star_id: string; source_target_label: string; gaia_source_id: string }[];
};

export function publicIdentityColumns(columns: string[]): string[] {
  return [...columns, ...IDENTITY_COLUMNS.filter((column) => !columns.includes(column))];
}

export function canonicalRecordId(row: Row): string {
  return "record:" + JSON.stringify([row.object_key, row.source_provider, row.source_name, row.source_table, row.source_row].map((value) => String(value ?? "")));
}

export async function validateIdentitySupplement(text: string, reference: IdentitySupplementReference, objectKey: string, baseDataSha: string, sourceInputSha: string, expectedRows: number): Promise<IdentitySupplement> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (checksum !== reference.sha256) throw new Error("Identity supplement checksum mismatch");
  const value = JSON.parse(text) as IdentitySupplement;
  if (value.schemaVersion !== 1 || value.objectKey !== objectKey || value.sourceName !== GEHA_SOURCE || value.sourceProvider !== "aas_iop_mrt" || value.sourceTable !== "apjae290dt5_mrt" || value.sourceUrl !== reference.sourceUrl || value.sourceFileSha256 !== reference.sourceFileSha256 || value.basePublicDataSha256 !== baseDataSha || reference.basePublicDataSha256 !== baseDataSha || value.baseSourceInputSha256 !== sourceInputSha || !Array.isArray(value.rows) || value.rows.length !== expectedRows) {
    throw new Error("Identity supplement does not match this source snapshot");
  }
  const seen = new Set<string>();
  for (const row of value.rows) {
    if (typeof row.source_row !== "string" || !/^\d+$/.test(row.source_row) || seen.has(row.source_row) || typeof row.star_id !== "string" || typeof row.source_target_label !== "string" || typeof row.gaia_source_id !== "string" || (row.gaia_source_id !== "" && !/^\d{16,20}$/.test(row.gaia_source_id))) {
      throw new Error("Invalid or duplicate identity supplement record");
    }
    seen.add(row.source_row);
  }
  return value;
}

export function enrichKinematicsRows(rows: Row[], supplement: IdentitySupplement | null): Row[] {
  const identities = new Map(supplement?.rows.map((row) => [row.source_row, row]) ?? []);
  return rows.map((row) => {
    let source_target_label = row.source_target_label ?? "";
    let gaia_source_id = row.gaia_source_id ?? "";
    if (supplement && row.source_name === supplement.sourceName) {
      const identity = identities.get(row.source_row);
      if (row.object_key !== supplement.objectKey || row.source_provider !== supplement.sourceProvider || row.source_table !== supplement.sourceTable || !identity || identity.star_id !== row.star_id) throw new Error("Identity supplement source-row mismatch");
      source_target_label = identity.source_target_label;
      gaia_source_id = identity.gaia_source_id;
    } else if (row.source_provider === "gaia_tap" && row.source_table === "gaiadr3.gaia_source") {
      gaia_source_id = row.star_id;
    }
    if (gaia_source_id && !/^\d{16,20}$/.test(gaia_source_id)) throw new Error("Invalid exact Gaia identifier");
    return { ...row, source_target_label, gaia_source_id, record_id: canonicalRecordId(row) };
  });
}
