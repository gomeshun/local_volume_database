import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { createTable, getCoreRowModel, getSortedRowModel } from "@tanstack/react-table";
import { datasetColumnOptions, datasetNumber } from "../src/lib/datasetSorting.ts";
import { formatTick } from "../src/lib/plotTicks.ts";

function sortedRows(rows, column, desc = false) {
  const table = createTable({
    data: rows.map((row) => ({ row })),
    columns: [{ id: column, ...datasetColumnOptions(column, rows) }],
    state: { sorting: [{ id: column, desc }] },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return table.getSortedRowModel().rows.map((row) => row.original.row);
}

test("dataset sorting orders decimals, negatives, zero, and scientific notation numerically", () => {
  const rows = ["27.8", "27.54", "-2", "-10", "0", "1e2", "+2.00", ".5"]
    .map((distance) => ({ distance }));
  assert.deepEqual(
    sortedRows(rows, "distance").map((row) => row.distance),
    ["-10", "-2", "0", ".5", "+2.00", "27.54", "27.8", "1e2"],
  );
  assert.deepEqual(
    sortedRows(rows, "distance", true).map((row) => row.distance),
    ["1e2", "27.8", "27.54", "+2.00", ".5", "0", "-2", "-10"],
  );
});

test("missing and non-finite measurements remain last in both directions", () => {
  const rows = ["", "-inf", "27.8", "nan", "0", "   ", "-27.54", "Infinity", "1e999", undefined]
    .map((dec) => ({ dec }));
  for (const desc of [false, true]) {
    const result = sortedRows(rows, "dec", desc);
    assert.deepEqual(
      result.slice(0, 3).map((row) => row.dec),
      desc ? ["27.8", "0", "-27.54"] : ["-27.54", "0", "27.8"],
    );
    assert.ok(result.slice(3).every((row) => datasetNumber(row.dec) === undefined));
    assert.equal(result.length, rows.length);
  }
});

test("numeric accessors preserve raw formatting and equal-value row order", () => {
  const rows = ["2.00", "2e0", "2", " 2.0 "].map((distance, index) => ({ distance, key: String(index) }));
  const options = datasetColumnOptions("distance", rows);
  assert.equal(options.accessorFn({ row: rows[0] }), 2);
  assert.equal(options.sortDescFirst, false);
  for (const desc of [false, true]) {
    assert.deepEqual(sortedRows(rows, "distance", desc), rows);
  }
  assert.equal(rows[0].distance, "2.00");
});

test("identifiers, references, metadata, and mixed text remain text", () => {
  for (const column of ["name", "key", "host", "ref", "ref_distance", "metallicity_type", "distance_measurement_method"]) {
    const rows = [{ [column]: "002" }, { [column]: "10" }];
    const options = datasetColumnOptions(column, rows);
    assert.equal(options.sortingFn, "auto", column);
    assert.equal(options.accessorFn({ row: rows[0] }), "002", column);
  }
  const rows = [{ label: "Object 10" }, { label: "Object 2" }, { label: "3" }];
  assert.equal(datasetColumnOptions("label", rows).sortingFn, "auto");
  assert.deepEqual(sortedRows(rows, "label").map((row) => row.label), ["3", "Object 10", "Object 2"]);
  assert.doesNotThrow(() => sortedRows([{ distance: "" }], "distance"));
  assert.doesNotThrow(() => sortedRows([], "distance"));
});

test("numeric parsing does not coerce blanks, non-decimal strings, or non-finite values", () => {
  for (const value of [undefined, "", " ", "nan", "Infinity", "-inf", "1e999", "0x10", "2 kpc"]) {
    assert.equal(datasetNumber(value), undefined, String(value));
  }
  assert.equal(datasetNumber(" 0 "), 0);
  assert.equal(datasetNumber("-1.25E+2"), -125);
});

test("real dataset numeric columns sort correctly with missing values last", async () => {
  const root = new URL("../public/data/datasets/", import.meta.url);
  const files = (await fs.readdir(root)).filter((file) => file.endsWith(".json"));
  let numericColumns = 0;
  for (const file of files) {
    const { rows, columns } = JSON.parse(await fs.readFile(new URL(file, root), "utf8"));
    for (const column of columns) {
      if (datasetColumnOptions(column, rows).sortingFn !== "basic") continue;
      numericColumns += 1;
      for (const desc of [false, true]) {
        let previous = desc ? Infinity : -Infinity;
        let reachedMissing = false;
        for (const row of sortedRows(rows, column, desc)) {
          const value = datasetNumber(row[column]);
          if (value === undefined) {
            reachedMissing = true;
            continue;
          }
          assert.equal(reachedMissing, false, `${file}: ${column} missing values last`);
          assert.ok(desc ? value <= previous : value >= previous, `${file}: ${column} numeric order`);
          previous = value;
        }
      }
    }
  }
  assert.ok(numericColumns > 0, "real numeric columns must be tested");
});

test("tick labels retain integer zeros at default and coarse resolutions", () => {
  for (const value of [-1000, -320, -100, -20, -10, 0, 10, 20, 100, 320, 1000]) {
    for (const resolution of [undefined, 10, 100]) {
      assert.equal(formatTick(value, resolution), String(value), `${value} at ${resolution}`);
    }
  }
});

test("tick labels trim only decimal zeros and retain scientific notation", () => {
  for (const [value, resolution, expected] of [
    [1.2, undefined, "1.2"], [-1.25, undefined, "-1.25"],
    [10.5, undefined, "10.5"], [0.125, undefined, "0.125"],
    [100.125, 0.01, "100.125"], [0, 0.01, "0"], [-0, undefined, "0"],
    [-0.01, 100, "0"], [10_000, undefined, "1.0e+4"],
    [-100_000, undefined, "-1.0e+5"], [0.00012, undefined, "1.2e-4"],
    [-0.00012, undefined, "-1.2e-4"],
  ]) {
    assert.equal(formatTick(value, resolution), expected);
  }
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(formatTick(value), "");
});
