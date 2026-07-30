import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_ROOT = path.resolve(process.cwd(), "public");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function testDatasets() {
  const datasetDir = path.resolve(PUBLIC_ROOT, "data", "datasets");
  const files = (await fs.readdir(datasetDir)).filter((file) => file.endsWith(".json"));
  assert.ok(files.length > 0, "at least one generated dataset is required");
  for (const file of files) {
    const payload = JSON.parse(await fs.readFile(path.resolve(datasetDir, file), "utf8"));
    assert.equal(payload.schemaVersion, 1, `${file}: schema version`);
    assert.equal(payload.totalRows, payload.rows.length, `${file}: row count`);
    assert.ok(Array.isArray(payload.columns) && payload.columns.length > 0, `${file}: columns`);
  }
  return files.length;
}

async function testKinematics() {
  const root = path.resolve(PUBLIC_ROOT, "data", "kinematics");
  const summaryText = await fs.readFile(
    path.resolve(process.cwd(), "src", "generated", "kinematics_summary.ts"),
    "utf8",
  );
  const summaryStartMarker =
    "export const kinematicObjectSummaries: KinematicObjectSummary[] = ";
  const summaryStart = summaryText.indexOf(summaryStartMarker);
  const summaryEnd = summaryText.indexOf(
    ";\n\nexport const kinematicObjectByKey",
    summaryStart,
  );
  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart, "kinematics summary");
  const summaries = JSON.parse(
    summaryText.slice(summaryStart + summaryStartMarker.length, summaryEnd),
  );
  const summaryByKey = new Map(summaries.map((summary) => [summary.key, summary]));
  const objectDirectories = (await fs.readdir(root, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory(),
  );
  assert.ok(objectDirectories.length > 0, "at least one generated kinematics object is required");

  let recordCount = 0;
  let chunkCount = 0;
  const simonSegue1Rows = [];
  const validMembershipOrigins = new Set(["reported", "same_star", "seed_source"]);
  for (const directory of objectDirectories) {
    const manifestPath = path.resolve(root, directory.name, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    assert.equal(manifest.schemaVersion, 2, `${directory.name}: schema version`);
    assert.equal(manifest.objectKey, directory.name, `${directory.name}: object key`);
    assert.ok(
      !Number.isNaN(Date.parse(manifest.sourceSnapshotModifiedAt)),
      `${directory.name}: source snapshot timestamp`,
    );
    assert.ok(!manifest.columns.includes("original_row_json"), `${directory.name}: public columns`);

    const objectRows = [];
    for (const chunk of manifest.chunks) {
      const chunkPath = path.resolve(PUBLIC_ROOT, chunk.path.replace(/^\//, ""));
      const text = await fs.readFile(chunkPath, "utf8");
      assert.equal(sha256(text), chunk.sha256, `${chunk.path}: checksum`);
      const payload = JSON.parse(text);
      assert.equal(payload.schemaVersion, 2, `${chunk.path}: schema version`);
      assert.equal(payload.objectKey, directory.name, `${chunk.path}: object key`);
      assert.equal(payload.rows.length, chunk.recordCount, `${chunk.path}: row count`);
      assert.ok(payload.rows.length <= manifest.chunkSize, `${chunk.path}: chunk size`);
      for (const row of payload.rows) {
        assert.ok(!("original_row_json" in row), `${chunk.path}: raw payload leaked`);
        for (const field of ["membership_probability", "membership_flag"]) {
          const originField = `${field}_origin`;
          if (String(row[field] ?? "").trim()) {
            assert.ok(
              validMembershipOrigins.has(row[originField]),
              `${chunk.path}: ${field} requires a valid origin`,
            );
          } else {
            assert.equal(
              String(row[originField] ?? "").trim(),
              "",
              `${chunk.path}: empty ${field} must not claim an origin`,
            );
          }
        }
        if (
          row.object_key === "segue_1" &&
          row.source_name === "simon2011_segue1"
        ) {
          simonSegue1Rows.push(row);
        }
      }
      objectRows.push(...payload.rows);
      chunkCount += 1;
    }
    assert.equal(objectRows.length, manifest.totalRecords, `${directory.name}: total records`);
    assert.equal(
      sha256(JSON.stringify(objectRows)),
      manifest.publicDataSha256,
      `${directory.name}: public data checksum`,
    );
    const chunkRecordsBySource = new Map();
    for (const chunk of manifest.chunks) {
      const key = [
        chunk.sourceKind,
        chunk.sourceProvider,
        chunk.sourceName,
      ].join("\0");
      chunkRecordsBySource.set(
        key,
        (chunkRecordsBySource.get(key) ?? 0) + chunk.recordCount,
      );
    }
    const sourceStats = new Map();
    for (const row of objectRows) {
      const key = [row.source_kind, row.source_provider, row.source_name].join("\0");
      const stats = sourceStats.get(key) ?? {
        records: 0,
        lineOfSightVelocities: 0,
        properMotions: 0,
        metallicities: 0,
        probabilities: 0,
        inheritedProbabilities: 0,
        flags: 0,
        inheritedFlags: 0,
      };
      stats.records += 1;
      stats.lineOfSightVelocities += row.vlos_kms ? 1 : 0;
      stats.properMotions += row.pmra_masyr && row.pmdec_masyr ? 1 : 0;
      stats.metallicities += row.feh ? 1 : 0;
      stats.probabilities += row.membership_probability ? 1 : 0;
      stats.inheritedProbabilities +=
        row.membership_probability_origin === "same_star" ? 1 : 0;
      stats.flags += row.membership_flag ? 1 : 0;
      stats.inheritedFlags +=
        row.membership_flag_origin === "same_star" ? 1 : 0;
      sourceStats.set(key, stats);
    }
    const manifestSourceKeys = new Set();
    for (const source of manifest.sources) {
      const key = [
        source.sourceKind,
        source.sourceProvider,
        source.sourceName,
      ].join("\0");
      assert.ok(
        !manifestSourceKeys.has(key),
        `${directory.name}: duplicate source dataset ${key}`,
      );
      manifestSourceKeys.add(key);
      assert.equal(
        chunkRecordsBySource.get(key),
        source.recordCount,
        `${directory.name}: source dataset transfer coverage ${key}`,
      );
      const stats = sourceStats.get(key);
      assert.ok(stats, `${directory.name}: source statistics`);
      assert.equal(source.recordCount, stats.records, `${key}: record coverage`);
      assert.equal(
        source.lineOfSightVelocityRecords,
        stats.lineOfSightVelocities,
        `${key}: line-of-sight velocity coverage`,
      );
      assert.equal(
        source.properMotionRecords,
        stats.properMotions,
        `${key}: proper-motion coverage`,
      );
      assert.equal(
        source.metallicityRecords,
        stats.metallicities,
        `${key}: metallicity coverage`,
      );
      assert.equal(
        source.membershipProbabilityRecords,
        stats.probabilities,
        `${key}: membership probability coverage`,
      );
      assert.equal(
        source.membershipProbabilityInheritedRecords,
        stats.inheritedProbabilities,
        `${key}: inherited membership probability coverage`,
      );
      assert.equal(
        source.membershipFlagRecords,
        stats.flags,
        `${key}: membership flag coverage`,
      );
      assert.equal(
        source.membershipFlagInheritedRecords,
        stats.inheritedFlags,
        `${key}: inherited membership flag coverage`,
      );
    }
    assert.equal(
      chunkRecordsBySource.size,
      manifest.sources.length,
      `${directory.name}: every transfer group maps to one source dataset`,
    );
    const summary = summaryByKey.get(directory.name);
    assert.ok(summary, `${directory.name}: generated summary`);
    assert.equal(
      summary.lineOfSightVelocityRecords,
      objectRows.filter((row) => row.vlos_kms).length,
      `${directory.name}: line-of-sight velocity summary`,
    );
    assert.equal(
      summary.properMotionMeasurementRecords,
      objectRows.filter((row) => row.pmra_masyr && row.pmdec_masyr).length,
      `${directory.name}: proper-motion summary`,
    );
    assert.equal(
      summary.gaiaProperMotionRecords,
      objectRows.filter(
        (row) =>
          row.source_provider === "gaia_tap" &&
          row.pmra_masyr &&
          row.pmdec_masyr,
      ).length,
      `${directory.name}: Gaia proper-motion summary`,
    );
    recordCount += objectRows.length;
  }
  assert.equal(simonSegue1Rows.length, 522, "Simon et al. Segue 1 record count");
  assert.ok(
    simonSegue1Rows.every((row) => row.membership_flag === "0" || row.membership_flag === "1"),
    "Simon et al. Segue 1 membership flags",
  );
  assert.equal(
    simonSegue1Rows.filter(
      (row) => row.membership_flag_origin === "same_star",
    ).length,
    129,
    "Simon et al. repeated-observation membership inheritance",
  );
  return { objectCount: objectDirectories.length, chunkCount, recordCount };
}

const datasetCount = await testDatasets();
const kinematics = await testKinematics();
console.log(
  `Generated data checks passed: ${datasetCount} datasets, ${kinematics.objectCount} covered objects, ${kinematics.chunkCount} chunks, ${kinematics.recordCount} kinematic records.`,
);
