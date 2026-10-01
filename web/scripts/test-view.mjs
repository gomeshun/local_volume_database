import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { DEFAULT_RESEARCH_VIEW, decodeResearchView, filterKinematicsRows, rowsToCsv } from "../src/lib/researchView.ts";
import { scienceGroup, presetColumns } from "../src/lib/columnGroups.ts";

test("membership filters preserve missing, zero, inherited and source-reported distinctions", () => {
  const rows = [
    { star_id: "missing", membership_probability: "", membership_flag: "" },
    { star_id: "zero", membership_probability: "0", membership_probability_origin: "reported" },
    { star_id: "reported", membership_probability: "0.9", membership_probability_origin: "reported" },
    { star_id: "inherited", membership_probability: "1", membership_probability_origin: "same_star" },
    { star_id: "flag", membership_probability: "", membership_flag: "member", membership_flag_origin: "reported" },
    { star_id: "invalid", membership_probability: "NaN", membership_flag: "" },
  ];
  const ids = (membership, query = "") => filterKinematicsRows(rows, query, membership).map((row) => row.star_id);
  assert.deepEqual(ids("probability-0.9"), ["reported", "inherited"]);
  assert.deepEqual(ids("source-reported"), ["zero", "reported", "flag"]);
  assert.deepEqual(ids("available"), ["zero", "reported", "inherited", "flag"]);
  assert.deepEqual(ids("probability-0.9", " INHERITED "), ["inherited"]);
  assert.equal(filterKinematicsRows(rows, "", "all").length, rows.length);
  assert.equal(rows[0].membership_probability, "");
});

test("Draco real-data filtered sample counts agree for CSV, table and plot input", async () => {
  const root = new URL("../public/data/kinematics/draco_1/", import.meta.url);
  const manifest = JSON.parse(await fs.readFile(new URL("manifest.json", root), "utf8"));
  const chunks = await Promise.all(manifest.chunks.map(async (chunk) => JSON.parse(await fs.readFile(new URL(`../public${chunk.path}`, import.meta.url), "utf8"))));
  const rows = chunks.flatMap((chunk) => chunk.rows);
  const geha = rows.filter((row) => row.source_name === "geha2026_deimos_expanded_aas_iop");
  assert.equal(geha.length, 1644);
  for (const [query, membership, count] of [["", "probability-0.9", 302], ["30Drac", "all", 29], ["30Drac", "probability-0.9", 2]]) {
    const sample = filterKinematicsRows(geha, query, membership);
    assert.equal(sample.length, count);
    assert.equal(rowsToCsv(["star_id", "membership_probability", "source_ref"], sample).trim().split("\n").length - 1, count);
  }
  const walker = rows.filter((row) => row.source_name === "walker2015_draco");
  assert.equal(walker.length, 1565);
  for (const membership of ["available", "source-reported", "probability-0.5", "probability-0.9"]) assert.equal(filterKinematicsRows(walker, "", membership).length, 0);
});

test("versioned URL state round-trips selections, filters, axes, sorting and columns", () => {
  const view = { ...DEFAULT_RESEARCH_VIEW, datasets: ["vizier:J/ApJ:source α"], query: "30 Drac & α", membership: "probability-0.9", xAxis: "pmra_masyr", yAxis: "pmdec_masyr", sort: { column: "vlos_kms", direction: "desc" }, columns: ["star_id", "vlos_kms", "source_ref"], pageSize: 100, sky: false, selectedId: "draco:source:1" };
  const url = new URL("https://example.test/objects/draco_1/?unrelated=kept#section");
  url.searchParams.set("view", JSON.stringify(view));
  assert.deepEqual(decodeResearchView(new URL(url).searchParams.get("view")), view);
  assert.equal(url.searchParams.get("unrelated"), "kept");
  assert.equal(url.hash, "#section");
});

test("malformed and future-version URLs safely fall back; unsupported values are bounded", () => {
  for (const raw of [null, "oops", "null", "[]", '{"version":2}', "x".repeat(50001)]) assert.deepEqual(decodeResearchView(raw), DEFAULT_RESEARCH_VIEW);
  const view = decodeResearchView(JSON.stringify({ version: 1, datasets: ["a", "a", 123], membership: "bogus", pageSize: -5, columns: ["name", 2], xAxis: "bad", query: "x".repeat(600) }));
  assert.deepEqual(view.datasets, ["a"]);
  assert.deepEqual(view.columns, ["name"]);
  assert.equal(view.membership, "all");
  assert.equal(view.pageSize, 50);
  assert.equal(view.query.length, 500);
});

test("CSV retains all public columns, references, exact values, empty values and quoting", () => {
  const columns = ["star_id", "value", "missing", "source_ref", "notes"];
  const csv = rowsToCsv(columns, [{ star_id: "0001", value: "0.00", missing: "", source_ref: "2026ApJ", notes: 'a,"b"\nc' }]);
  assert.equal(csv, 'star_id,value,missing,source_ref,notes\n0001,0.00,,2026ApJ,"a,""b""\nc"\n');
  assert.equal(rowsToCsv(columns, []), columns.join(",") + "\n");
});

test("science presets retain value, uncertainty and provenance families", () => {
  const columns = ["name", "ra", "distance", "distance_em", "ref_distance", "pmra", "pmra_em", "pmdec_ep", "ref_proper_motion", "vlos_systemic", "vlos_systemic_em", "ref_vlos", "metallicity", "ref_metallicity", "M_V", "ref_structure"];
  const properMotion = presetColumns(columns, "Proper motion", ["name"]);
  for (const column of ["name", "pmra", "pmra_em", "pmdec_ep", "ref_proper_motion"]) assert.ok(properMotion.includes(column), column);
  assert.equal(scienceGroup("ref_distance"), scienceGroup("distance_em"));
  const spectroscopy = presetColumns(columns, "Spectroscopy", ["name"]);
  for (const column of ["vlos_systemic", "vlos_systemic_em", "ref_vlos", "metallicity", "ref_metallicity"]) assert.ok(spectroscopy.includes(column), column);
});

test("selection details survive filters, URL restoration and missing records honestly", async () => {
  const { makeKinematicsRowId, resolveKinematicsSelection, selectedRecordPage, sortKinematicsRows } = await import("../src/lib/kinematicsSelection.ts");
  const rows = Array.from({ length: 160 }, (_, index) => ({ object_key: "draco_1", source_provider: "aas_iop_mrt", source_name: "geha", source_row: String(index), star_id: "SERENDIP", vlos_kms: String(index - 100), membership_probability: index === 159 ? "0.1" : "0.9" }));
  const selectedId = makeKinematicsRowId(rows[159], 159);
  const view = decodeResearchView(JSON.stringify({ ...DEFAULT_RESEARCH_VIEW, selectedId }));
  assert.equal(resolveKinematicsSelection(rows, rows, view.selectedId).row, rows[159]);
  assert.equal(selectedRecordPage(rows, selectedId, 50), 3);
  assert.equal(selectedRecordPage(rows, selectedId, 50), 3, "repeated reveal remains on the correct page");
  assert.equal(selectedRecordPage(rows, selectedId, 25), 6, "page size changes are respected");
  const sorted = sortKinematicsRows(rows, { column: "vlos_kms", direction: "desc" });
  assert.equal(selectedRecordPage(sorted, selectedId, 50), 0, "current sort is respected");
  const filtered = filterKinematicsRows(rows, "", "probability-0.9");
  assert.equal(resolveKinematicsSelection(rows, filtered, selectedId).row, rows[159]);
  assert.equal(resolveKinematicsSelection(rows, filtered, selectedId).visible, false);
  assert.equal(selectedRecordPage(filtered, selectedId, 50), null);
  assert.equal(resolveKinematicsSelection([], [], selectedId).row, undefined);
  assert.equal(resolveKinematicsSelection(rows, rows, "stale-source-row").row, undefined);
  assert.equal(resolveKinematicsSelection(rows, rows, null).row, undefined);
  assert.equal(new Set(rows.map(makeKinematicsRowId)).size, rows.length, "duplicate labels remain distinct records");
});

test("Gaia identifiers and exports remain exact beyond Number safe-integer range", async () => {
  const { sortKinematicsRows } = await import("../src/lib/kinematicsSelection.ts");
  const rows = [{ gaia_source_id: "1432526329134459393" }, { gaia_source_id: "1432526329134459392" }];
  assert.deepEqual(sortKinematicsRows(rows, { column: "gaia_source_id", direction: "asc" }).map((row) => row.gaia_source_id), ["1432526329134459392", "1432526329134459393"]);
  assert.equal(rowsToCsv(["gaia_source_id"], rows), "gaia_source_id\n1432526329134459393\n1432526329134459392\n");
  assert.deepEqual(filterKinematicsRows(rows, "1432526329134459392", "all"), [rows[1]]);
});

test("verified Geha identity supplements preserve base rows and reject damaged or mismatched payloads", async () => {
  const { createHash } = await import("node:crypto");
  const { validateIdentitySupplement, enrichKinematicsRows, canonicalRecordId } = await import("../src/lib/kinematicsIdentity.ts");
  const root = new URL("../public/data/kinematics/", import.meta.url);
  let gehaCount = 0;
  for (const object of await fs.readdir(root, { withFileTypes: true })) {
    if (!object.isDirectory()) continue;
    const manifest = JSON.parse(await fs.readFile(new URL(`${object.name}/manifest.json`, root), "utf8"));
    if (!manifest.identitySupplement) {
      const gehaChunks = manifest.chunks.filter((chunk) => chunk.sourceName === "geha2026_deimos_expanded_aas_iop");
      if (!gehaChunks.length) continue;
      assert.ok(manifest.columns.includes("gaia_source_id"), "Geha identity requires native fields or a verified supplement");
      for (const chunk of gehaChunks) {
        const rows = JSON.parse(await fs.readFile(new URL(`../public${chunk.path}`, import.meta.url), "utf8")).rows;
        for (const row of rows) {
          assert.equal(typeof row.gaia_source_id, "string");
          assert.equal(row.record_id, canonicalRecordId(row));
        }
        gehaCount += rows.length;
      }
      continue;
    }
    const text = await fs.readFile(new URL(`${object.name}/geha-record-identities.json`, root), "utf8");
    const count = manifest.sources.filter((source) => source.sourceName === "geha2026_deimos_expanded_aas_iop").reduce((sum, source) => sum + source.recordCount, 0);
    const supplement = await validateIdentitySupplement(text, manifest.identitySupplement, object.name, manifest.publicDataSha256, manifest.sourceInputSha256, count);
    const sourceRows = (await Promise.all(manifest.chunks.filter((chunk) => chunk.sourceName === supplement.sourceName).map(async (chunk) => JSON.parse(await fs.readFile(new URL(`../public${chunk.path}`, import.meta.url), "utf8")).rows))).flat();
    const enriched = enrichKinematicsRows(sourceRows, supplement);
    assert.equal(enriched.length, count);
    assert.equal(new Set(enriched.map((row) => row.record_id)).size, count);
    for (let index = 0; index < sourceRows.length; index++) {
      for (const [key, value] of Object.entries(sourceRows[index])) assert.equal(enriched[index][key], value, `${object.name}: original ${key} unchanged`);
      assert.equal(enriched[index].membership_probability_origin, "reported");
      assert.equal(enriched[index].membership_flag_origin, "reported");
      assert.equal(enriched[index].record_id, canonicalRecordId(enriched[index]));
      assert.equal(typeof enriched[index].gaia_source_id, "string");
    }
    gehaCount += count;
    if (object.name !== "draco_1") continue;
    assert.equal(enriched.filter((row) => row.star_id === "30Drac").length, 29);
    assert.equal(new Set(enriched.filter((row) => row.star_id === "30Drac").map((row) => row.record_id)).size, 29);
    await assert.rejects(validateIdentitySupplement(text + " ", manifest.identitySupplement, object.name, manifest.publicDataSha256, manifest.sourceInputSha256, count), /checksum/);
    await assert.rejects(validateIdentitySupplement(text, manifest.identitySupplement, "wrong_object", manifest.publicDataSha256, manifest.sourceInputSha256, count), /snapshot/);
    assert.throws(() => enrichKinematicsRows([{ ...sourceRows[0], star_id: "wrong label" }], supplement), /source-row/);
    assert.throws(() => enrichKinematicsRows([{ ...sourceRows[0], source_provider: "other" }], supplement), /source-row/);
    const corrupt = { ...supplement, rows: [...supplement.rows.slice(0, -1), supplement.rows[0]] };
    const badText = JSON.stringify(corrupt);
    const ref = { ...manifest.identitySupplement, sha256: createHash("sha256").update(badText).digest("hex") };
    await assert.rejects(validateIdentitySupplement(badText, ref, object.name, manifest.publicDataSha256, manifest.sourceInputSha256, count), /duplicate/);
  }
  assert.equal(gehaCount, 11232);
});

test("an old normalized CSV cannot overwrite the verified public identity snapshot", async () => {
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const temp = await fs.mkdtemp(path.join(tmpdir(), "lvdb-identity-schema-"));
  try {
    const web = path.join(temp, "web");
    const publicRoot = path.join(web, "public/data/kinematics");
    await Promise.all([fs.mkdir(path.join(temp, "data_kinematics/processed"), { recursive: true }), fs.mkdir(path.join(temp, "data")), fs.mkdir(path.join(web, "src/data"), { recursive: true }), fs.mkdir(publicRoot, { recursive: true })]);
    await fs.writeFile(path.join(temp, "data/dwarf_mw.csv"), "key,name\ndraco_1,Draco\n");
    await fs.copyFile(new URL("../src/data/kinematics_columns.json", import.meta.url), path.join(web, "src/data/kinematics_columns.json"));
    await fs.writeFile(path.join(publicRoot, "keep.json"), "verified base and identity assets");
    for (const csv of ["object_key,star_id\ndraco_1,SERENDIP\n", "object_key,star_id,source_target_label,gaia_source_id,record_id\ndraco_1,SERENDIP,SERENDIP,,\n"]) {
      await fs.writeFile(path.join(temp, "data_kinematics/processed/dwarf_mw_kinematics.csv"), csv);
      const result = spawnSync(process.execPath, [new URL("./generate-kinematics.mjs", import.meta.url).pathname], { cwd: web, encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /old or incomplete identity schema/);
      assert.equal(await fs.readFile(path.join(publicRoot, "keep.json"), "utf8"), "verified base and identity assets");
      assert.deepEqual(await fs.readdir(publicRoot), ["keep.json"]);
    }
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
