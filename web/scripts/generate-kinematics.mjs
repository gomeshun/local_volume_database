import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd(), "..");

const PUBLIC_KINEMATICS_COLUMNS = [
  "object_key",
  "object_name",
  "source_kind",
  "source_provider",
  "source_ref",
  "source_name",
  "source_table",
  "source_url",
  "source_row",
  "star_id",
  "ra_deg",
  "dec_deg",
  "vlos_kms",
  "vlos_err_kms",
  "pmra_masyr",
  "pmra_err_masyr",
  "pmdec_masyr",
  "pmdec_err_masyr",
  "membership_probability",
  "membership_flag",
  "feh",
  "feh_err",
];

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (inQuotes) {
      if (character === '"') {
        const next = line[index + 1];
        if (next === '"') {
          cur += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += character;
      }
      continue;
    }

    if (character === ",") {
      out.push(cur);
      cur = "";
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    cur += character;
  }

  out.push(cur);
  return out;
}

async function readCsv(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }

  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex]);
    const row = {};
    for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
      row[header[columnIndex]] = values[columnIndex] ?? "";
    }
    rows.push(row);
  }
  return { header, rows };
}

function sanitizeKinematicsRow(row) {
  return Object.fromEntries(PUBLIC_KINEMATICS_COLUMNS.map((column) => [column, row[column] ?? ""]));
}

function numericString(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? String(numberValue) : "";
}

async function main() {
  const generatedDir = path.resolve(process.cwd(), "src", "generated");
  await fs.mkdir(generatedDir, { recursive: true });

  const rowsOutPath = path.resolve(generatedDir, "kinematics.ts");
  const summaryOutPath = path.resolve(generatedDir, "kinematics_summary.ts");
  const kinematicsCsv = path.resolve(REPO_ROOT, "data_kinematics", "processed", "dwarf_mw_kinematics.csv");
  const dwarfCsv = path.resolve(REPO_ROOT, "data", "dwarf_mw.csv");

  let kinematicsRows = [];
  try {
    const parsed = await readCsv(kinematicsCsv);
    kinematicsRows = parsed.rows.map(sanitizeKinematicsRow);
  } catch (error) {
    try {
      await fs.access(rowsOutPath);
      await fs.access(summaryOutPath);
      console.warn(
        `Kinematics CSV not found; keeping existing ${path.relative(process.cwd(), rowsOutPath)} and ${path.relative(
          process.cwd(),
          summaryOutPath,
        )}`,
      );
      return;
    } catch {
      console.warn("Kinematics CSV not found; generating an empty kinematics bundle.");
    }
  }

  let dwarfRows = [];
  try {
    dwarfRows = (await readCsv(dwarfCsv)).rows;
  } catch (error) {
    console.warn(`Could not read ${path.relative(process.cwd(), dwarfCsv)}: ${String(error)}`);
  }

  const kinematicsByObjectKey = {};
  for (const row of kinematicsRows) {
    const objectKey = row.object_key;
    if (!objectKey) continue;
    if (!kinematicsByObjectKey[objectKey]) kinematicsByObjectKey[objectKey] = [];
    kinematicsByObjectKey[objectKey].push(row);
  }

  const objectRowsByKey = Object.fromEntries(dwarfRows.filter((row) => row.key).map((row) => [row.key, row]));
  const objectKeys = Array.from(new Set([...Object.keys(objectRowsByKey), ...Object.keys(kinematicsByObjectKey)])).sort(
    (left, right) => {
      const leftName = objectRowsByKey[left]?.name ?? left;
      const rightName = objectRowsByKey[right]?.name ?? right;
      return leftName.localeCompare(rightName);
    },
  );

  const objectSummaries = objectKeys.map((objectKey) => {
    const sourceRow = objectRowsByKey[objectKey] ?? {};
    const rows = kinematicsByObjectKey[objectKey] ?? [];
    return {
      key: objectKey,
      name: sourceRow.name ?? rows[0]?.object_name ?? objectKey,
      ra: numericString(sourceRow.ra),
      dec: numericString(sourceRow.dec),
      distance: numericString(sourceRow.distance),
      host: sourceRow.host ?? "",
      ref_vlos: sourceRow.ref_vlos ?? "",
      ref_proper_motion: sourceRow.ref_proper_motion ?? "",
      totalRows: rows.length,
      spectroscopyRows: rows.filter((row) => row.source_kind === "spectroscopy").length,
      properMotionRows: rows.filter((row) => row.source_kind === "proper_motion").length,
      gaiaRows: rows.filter((row) => row.source_provider === "gaia_tap").length,
    };
  });

  const rowPieces = [];
  rowPieces.push("// THIS FILE IS AUTO-GENERATED. DO NOT EDIT BY HAND.");
  rowPieces.push("// Generated by scripts/generate-kinematics.mjs");
  rowPieces.push("");
  rowPieces.push("export type PublicKinematicsRow = Record<string, string>;");
  rowPieces.push("");
  rowPieces.push(`export const kinematicsColumns: string[] = ${JSON.stringify(PUBLIC_KINEMATICS_COLUMNS, null, 2)};`);
  rowPieces.push("");
  rowPieces.push(
    `export const kinematicsByObjectKey: Record<string, PublicKinematicsRow[]> = ${JSON.stringify(
      kinematicsByObjectKey,
      null,
      2,
    )};`,
  );
  rowPieces.push("");

  const summaryPieces = [];
  summaryPieces.push("// THIS FILE IS AUTO-GENERATED. DO NOT EDIT BY HAND.");
  summaryPieces.push("// Generated by scripts/generate-kinematics.mjs");
  summaryPieces.push("");
  summaryPieces.push(
    "export type KinematicObjectSummary = { key: string; name: string; ra: string; dec: string; distance: string; host: string; ref_vlos: string; ref_proper_motion: string; totalRows: number; spectroscopyRows: number; properMotionRows: number; gaiaRows: number };",
  );
  summaryPieces.push("");
  summaryPieces.push(
    `export const kinematicObjectSummaries: KinematicObjectSummary[] = ${JSON.stringify(objectSummaries, null, 2)};`,
  );
  summaryPieces.push("");
  summaryPieces.push(
    "export const kinematicObjectByKey = Object.fromEntries(kinematicObjectSummaries.map((object) => [object.key, object])) as Record<string, KinematicObjectSummary>;",
  );
  summaryPieces.push("");

  await fs.writeFile(rowsOutPath, `${rowPieces.join("\n")}\n`, "utf8");
  await fs.writeFile(summaryOutPath, `${summaryPieces.join("\n")}\n`, "utf8");
  console.log(`Generated: ${path.relative(process.cwd(), rowsOutPath)} (${kinematicsRows.length} kinematics rows)`);
  console.log(`Generated: ${path.relative(process.cwd(), summaryOutPath)} (${objectSummaries.length} objects)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});