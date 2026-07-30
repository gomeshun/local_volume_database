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
  const objectDirectories = (await fs.readdir(root, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory(),
  );
  assert.ok(objectDirectories.length > 0, "at least one generated kinematics object is required");

  let recordCount = 0;
  let chunkCount = 0;
  for (const directory of objectDirectories) {
    const manifestPath = path.resolve(root, directory.name, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    assert.equal(manifest.schemaVersion, 1, `${directory.name}: schema version`);
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
      assert.equal(payload.objectKey, directory.name, `${chunk.path}: object key`);
      assert.equal(payload.rows.length, chunk.recordCount, `${chunk.path}: row count`);
      assert.ok(payload.rows.length <= manifest.chunkSize, `${chunk.path}: chunk size`);
      for (const row of payload.rows) {
        assert.ok(!("original_row_json" in row), `${chunk.path}: raw payload leaked`);
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
    recordCount += objectRows.length;
  }
  return { objectCount: objectDirectories.length, chunkCount, recordCount };
}

const datasetCount = await testDatasets();
const kinematics = await testKinematics();
console.log(
  `Generated data checks passed: ${datasetCount} datasets, ${kinematics.objectCount} covered objects, ${kinematics.chunkCount} chunks, ${kinematics.recordCount} kinematic records.`,
);
