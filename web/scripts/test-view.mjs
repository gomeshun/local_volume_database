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
