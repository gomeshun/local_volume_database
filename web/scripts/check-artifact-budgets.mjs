import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const MIB = 1024 * 1024;
const OUT_ROOT = path.resolve(process.cwd(), "out");
const PUBLIC_ROOT = path.resolve(process.cwd(), "public", "data");
const GENERATED_ROOT = path.resolve(process.cwd(), "src", "generated");

async function walk(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.resolve(root, entry.name);
      return entry.isDirectory() ? walk(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

async function sizeOf(filePath) {
  return (await fs.stat(filePath)).size;
}

async function totalSize(files) {
  const sizes = await Promise.all(files.map(sizeOf));
  return sizes.reduce((total, size) => total + size, 0);
}

const outFiles = await walk(OUT_ROOT);
const publicFiles = await walk(PUBLIC_ROOT);
const largestHtml = Math.max(
  0,
  ...(await Promise.all(
    outFiles.filter((file) => file.endsWith(".html")).map(sizeOf),
  )),
);
const kinematicsJsonSizes = await Promise.all(
  publicFiles
    .filter((file) => file.includes(`${path.sep}kinematics${path.sep}`) && file.endsWith(".json"))
    .map(sizeOf),
);
const datasetJsonSizes = await Promise.all(
  publicFiles
    .filter((file) => file.includes(`${path.sep}datasets${path.sep}`) && file.endsWith(".json"))
    .map(sizeOf),
);
const datasetSummarySize = await sizeOf(path.resolve(GENERATED_ROOT, "datasets_summary.ts"));
const kinematicsSummarySize = await sizeOf(
  path.resolve(GENERATED_ROOT, "kinematics_summary.ts"),
);
const outBytes = await totalSize(outFiles);

assert.ok(largestHtml <= 1 * MIB, `largest HTML is ${(largestHtml / MIB).toFixed(2)} MiB`);
assert.ok(
  Math.max(0, ...kinematicsJsonSizes) <= 1 * MIB,
  "a kinematics JSON chunk exceeds 1 MiB",
);
assert.ok(
  Math.max(0, ...datasetJsonSizes) <= 3 * MIB,
  "a dataset JSON payload exceeds 3 MiB",
);
assert.ok(datasetSummarySize <= 256 * 1024, "dataset summary exceeds 256 KiB");
assert.ok(kinematicsSummarySize <= 256 * 1024, "kinematics summary exceeds 256 KiB");
assert.ok(outBytes <= 120 * MIB, `static export is ${(outBytes / MIB).toFixed(2)} MiB`);

console.log(
  `Artifact budgets passed: out ${(outBytes / MIB).toFixed(2)} MiB, largest HTML ${(largestHtml / 1024).toFixed(1)} KiB, largest kinematics chunk ${(Math.max(0, ...kinematicsJsonSizes) / 1024).toFixed(1)} KiB.`,
);
