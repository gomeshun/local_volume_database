import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const PUBLIC_ROOT = path.resolve(process.cwd(), "public", "data", "kinematics");
const GENERATED_ROOT = path.resolve(process.cwd(), "src", "generated");
const COLUMN_DICTIONARY_SOURCE = path.resolve(
  process.cwd(),
  "src",
  "data",
  "kinematics_columns.json",
);
const COLUMN_DICTIONARY_PUBLIC_PATH = "/data/kinematics/columns.json";
const CHUNK_SIZE = 1000;

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
  "membership_probability_origin",
  "membership_flag",
  "membership_flag_origin",
  "feh",
  "feh_err",
];

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += character;
      }
    } else if (character === ",") {
      values.push(current);
      current = "";
    } else if (character === '"') {
      inQuotes = true;
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}

async function readCsv(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { columns: [], rows: [], text };
  const columns = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
  });
  return { columns, rows, text };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validateColumnDictionary(dictionary) {
  if (
    dictionary.schemaVersion !== 1 ||
    !Array.isArray(dictionary.columns) ||
    typeof dictionary.missingValue !== "string"
  ) {
    throw new Error("Invalid kinematics column dictionary structure.");
  }
  const names = dictionary.columns.map((definition) => definition.column);
  if (
    names.length !== new Set(names).size ||
    names.length !== PUBLIC_KINEMATICS_COLUMNS.length ||
    names.some(
      (name, index) => name !== PUBLIC_KINEMATICS_COLUMNS[index],
    )
  ) {
    throw new Error(
      "Kinematics column dictionary must define every public column in schema order.",
    );
  }
  for (const definition of dictionary.columns) {
    for (const field of [
      "column",
      "label",
      "dataType",
      "unit",
      "description",
      "notes",
    ]) {
      if (typeof definition[field] !== "string") {
        throw new Error(
          `Invalid ${field} for kinematics column ${definition.column ?? "unknown"}.`,
        );
      }
    }
    if (!definition.label || !definition.description) {
      throw new Error(
        `Kinematics column ${definition.column} requires a label and description.`,
      );
    }
  }
}

function safeSegment(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function numericString(value) {
  if (String(value ?? "").trim() === "") return "";
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? String(numberValue) : "";
}

function hasFiniteNumber(value) {
  if (String(value ?? "").trim() === "") return false;
  return Number.isFinite(Number(value));
}

function sanitizeRow(row) {
  return Object.fromEntries(
    PUBLIC_KINEMATICS_COLUMNS.map((column) => [column, String(row[column] ?? "")]),
  );
}

function sourceKey(row) {
  return [row.source_kind, row.source_provider, row.source_name].join("\u0000");
}

function compareRows(left, right) {
  const sourceComparison = sourceKey(left).localeCompare(sourceKey(right));
  if (sourceComparison !== 0) return sourceComparison;
  const leftRow = Number(left.source_row);
  const rightRow = Number(right.source_row);
  if (Number.isFinite(leftRow) && Number.isFinite(rightRow) && leftRow !== rightRow) {
    return leftRow - rightRow;
  }
  return String(left.star_id).localeCompare(String(right.star_id), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function aggregateSources(rows) {
  const bySource = new Map();
  for (const row of rows) {
    const key = sourceKey(row);
    const existing = bySource.get(key);
    if (existing) {
      existing.recordCount += 1;
      existing.lineOfSightVelocityRecords += hasFiniteNumber(row.vlos_kms) ? 1 : 0;
      existing.properMotionRecords +=
        hasFiniteNumber(row.pmra_masyr) && hasFiniteNumber(row.pmdec_masyr)
          ? 1
          : 0;
      existing.metallicityRecords += hasFiniteNumber(row.feh) ? 1 : 0;
      existing.membershipProbabilityRecords += row.membership_probability ? 1 : 0;
      existing.membershipProbabilityInheritedRecords +=
        row.membership_probability_origin === "same_star" ? 1 : 0;
      existing.membershipFlagRecords += row.membership_flag ? 1 : 0;
      existing.membershipFlagInheritedRecords +=
        row.membership_flag_origin === "same_star" ? 1 : 0;
      continue;
    }
    bySource.set(key, {
      sourceKind: row.source_kind,
      sourceProvider: row.source_provider,
      sourceName: row.source_name,
      sourceRef: row.source_ref,
      sourceTable: row.source_table,
      sourceUrl: row.source_url,
      recordCount: 1,
      lineOfSightVelocityRecords: hasFiniteNumber(row.vlos_kms) ? 1 : 0,
      properMotionRecords:
        hasFiniteNumber(row.pmra_masyr) && hasFiniteNumber(row.pmdec_masyr)
          ? 1
          : 0,
      metallicityRecords: hasFiniteNumber(row.feh) ? 1 : 0,
      membershipProbabilityRecords: row.membership_probability ? 1 : 0,
      membershipProbabilityInheritedRecords:
        row.membership_probability_origin === "same_star" ? 1 : 0,
      membershipFlagRecords: row.membership_flag ? 1 : 0,
      membershipFlagInheritedRecords:
        row.membership_flag_origin === "same_star" ? 1 : 0,
    });
  }
  return Array.from(bySource.values()).sort((left, right) =>
    `${left.sourceKind}:${left.sourceName}`.localeCompare(
      `${right.sourceKind}:${right.sourceName}`,
    ),
  );
}

async function writeObjectData(object, rows, inputSha256, sourceSnapshotModifiedAt) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(object.key)) {
    throw new Error(`Unsafe object key for generated path: ${object.key}`);
  }
  const objectDir = path.resolve(PUBLIC_ROOT, object.key);
  await fs.mkdir(objectDir, { recursive: true });
  const orderedRows = [...rows].sort(compareRows);
  const chunks = [];
  const writtenRows = [];

  for (const source of aggregateSources(orderedRows)) {
    const sourceRows = orderedRows.filter(
      (row) =>
        row.source_kind === source.sourceKind &&
        row.source_provider === source.sourceProvider &&
        row.source_name === source.sourceName,
    );
    for (let offset = 0; offset < sourceRows.length; offset += CHUNK_SIZE) {
      const page = Math.floor(offset / CHUNK_SIZE);
      const chunkRows = sourceRows.slice(offset, offset + CHUNK_SIZE);
      writtenRows.push(...chunkRows);
      const fileName = `${safeSegment(source.sourceKind)}--${safeSegment(source.sourceProvider)}--${safeSegment(source.sourceName)}--${String(page).padStart(3, "0")}.json`;
      const relativePath = `/data/kinematics/${object.key}/${fileName}`;
      const payload = {
        schemaVersion: 2,
        objectKey: object.key,
        columns: PUBLIC_KINEMATICS_COLUMNS,
        rows: chunkRows,
      };
      const serialized = `${JSON.stringify(payload)}\n`;
      await fs.writeFile(path.resolve(objectDir, fileName), serialized, "utf8");
      chunks.push({
        path: relativePath,
        recordCount: chunkRows.length,
        sourceKind: source.sourceKind,
        sourceProvider: source.sourceProvider,
        sourceName: source.sourceName,
        sourceRef: source.sourceRef,
        sha256: sha256(serialized),
        bytes: Buffer.byteLength(serialized),
      });
    }
  }

  const publicRowsSerialized = JSON.stringify(writtenRows);
  const manifest = {
    schemaVersion: 2,
    objectKey: object.key,
    objectName: object.name,
    sourceInputSha256: inputSha256,
    sourceSnapshotModifiedAt,
    publicDataSha256: sha256(publicRowsSerialized),
    columnDictionaryPath: COLUMN_DICTIONARY_PUBLIC_PATH,
    columns: PUBLIC_KINEMATICS_COLUMNS,
    totalRecords: orderedRows.length,
    chunkSize: CHUNK_SIZE,
    chunks,
    sources: aggregateSources(orderedRows),
    semantics: {
      recordUnit:
        "A normalized source record. Records are not guaranteed to represent unique stars across providers.",
      membership:
        "Membership probability and flag retain provider-specific definitions. Origin 'reported' is present on that provider row, 'same_star' is copied only when all reported values for the same source and star ID agree, and 'seed_source' is inherited by a Gaia row from its cited input record. Blank membership remains unknown and is not a non-member classification.",
    },
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(path.resolve(objectDir, "manifest.json"), manifestText, "utf8");
  return {
    manifestPath: `/data/kinematics/${object.key}/manifest.json`,
    dataSha256: manifest.publicDataSha256,
    sourceCount: manifest.sources.length,
    chunkCount: chunks.length,
    publicBytes: chunks.reduce((total, chunk) => total + chunk.bytes, 0),
  };
}

async function main() {
  const inputCsv = path.resolve(
    REPO_ROOT,
    "data_kinematics",
    "processed",
    "dwarf_mw_kinematics.csv",
  );
  const dwarfCsv = path.resolve(REPO_ROOT, "data", "dwarf_mw.csv");
  const summaryPath = path.resolve(GENERATED_ROOT, "kinematics_summary.ts");

  try {
    await fs.access(inputCsv);
  } catch {
    try {
      await Promise.all([fs.access(summaryPath), fs.access(PUBLIC_ROOT)]);
      console.warn(
        "Normalized kinematics CSV is absent; preserving committed generated public assets.",
      );
      return;
    } catch {
      throw new Error(
        `Missing ${path.relative(REPO_ROOT, inputCsv)} and no generated kinematics assets are available.`,
      );
    }
  }

  const [kinematics, dwarfData, inputStat, columnDictionaryText] = await Promise.all([
    readCsv(inputCsv),
    readCsv(dwarfCsv),
    fs.stat(inputCsv),
    fs.readFile(COLUMN_DICTIONARY_SOURCE, "utf8"),
  ]);
  const columnDictionary = JSON.parse(columnDictionaryText);
  validateColumnDictionary(columnDictionary);
  const inputSha256 = sha256(kinematics.text);
  const sourceSnapshotModifiedAt = inputStat.mtime.toISOString();
  const publicRows = kinematics.rows.map(sanitizeRow);
  const rowsByObject = new Map();
  for (const row of publicRows) {
    if (!row.object_key) continue;
    const existing = rowsByObject.get(row.object_key) ?? [];
    existing.push(row);
    rowsByObject.set(row.object_key, existing);
  }

  const dwarfByKey = new Map(
    dwarfData.rows.filter((row) => row.key).map((row) => [row.key, row]),
  );
  const objectKeys = Array.from(
    new Set([...dwarfByKey.keys(), ...rowsByObject.keys()]),
  ).sort((left, right) => {
    const leftName = dwarfByKey.get(left)?.name ?? left;
    const rightName = dwarfByKey.get(right)?.name ?? right;
    return leftName.localeCompare(rightName);
  });

  await fs.rm(PUBLIC_ROOT, { recursive: true, force: true });
  await Promise.all([
    fs.mkdir(PUBLIC_ROOT, { recursive: true }),
    fs.mkdir(GENERATED_ROOT, { recursive: true }),
  ]);
  await fs.writeFile(
    path.resolve(PUBLIC_ROOT, "columns.json"),
    `${JSON.stringify(columnDictionary, null, 2)}\n`,
    "utf8",
  );

  const summaries = [];
  for (const key of objectKeys) {
    const dwarf = dwarfByKey.get(key) ?? {};
    const rows = rowsByObject.get(key) ?? [];
    const object = {
      key,
      name: dwarf.name ?? rows[0]?.object_name ?? key,
    };
    const generated =
      rows.length > 0
        ? await writeObjectData(object, rows, inputSha256, sourceSnapshotModifiedAt)
        : {
            manifestPath: "",
            dataSha256: "",
            sourceCount: 0,
            chunkCount: 0,
            publicBytes: 0,
          };
    summaries.push({
      ...object,
      ra: numericString(dwarf.ra),
      dec: numericString(dwarf.dec),
      distance: numericString(dwarf.distance),
      host: dwarf.host ?? "",
      refVlos: dwarf.ref_vlos ?? "",
      refProperMotion: dwarf.ref_proper_motion ?? "",
      totalRecords: rows.length,
      lineOfSightVelocityRecords: rows.filter((row) =>
        hasFiniteNumber(row.vlos_kms),
      ).length,
      properMotionMeasurementRecords: rows.filter(
        (row) =>
          hasFiniteNumber(row.pmra_masyr) && hasFiniteNumber(row.pmdec_masyr),
      ).length,
      gaiaProperMotionRecords: rows.filter(
        (row) =>
          row.source_provider === "gaia_tap" &&
          hasFiniteNumber(row.pmra_masyr) &&
          hasFiniteNumber(row.pmdec_masyr),
      ).length,
      ...generated,
    });
  }

  const lines = [
    "// THIS FILE IS AUTO-GENERATED. DO NOT EDIT BY HAND.",
    "// Generated by scripts/generate-kinematics.mjs",
    "",
    "export type KinematicObjectSummary = { key: string; name: string; ra: string; dec: string; distance: string; host: string; refVlos: string; refProperMotion: string; totalRecords: number; lineOfSightVelocityRecords: number; properMotionMeasurementRecords: number; gaiaProperMotionRecords: number; manifestPath: string; dataSha256: string; sourceCount: number; chunkCount: number; publicBytes: number };",
    "",
    `export const kinematicObjectSummaries: KinematicObjectSummary[] = ${JSON.stringify(summaries, null, 2)};`,
    "",
    "export const kinematicObjectByKey = Object.fromEntries(kinematicObjectSummaries.map((object) => [object.key, object])) as Record<string, KinematicObjectSummary>;",
    "",
  ];
  await fs.writeFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
  console.log(
    `Generated ${publicRows.length} public records in ${summaries.filter((object) => object.totalRecords > 0).length} object directories.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
