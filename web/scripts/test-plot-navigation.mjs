import assert from "node:assert/strict";
import test from "node:test";
import { activePlotPointIndex, nextPlotPointIndex } from "../src/lib/plotNavigation.ts";

test("empty plots have no active descendant or keyboard destination", () => {
  assert.equal(activePlotPointIndex([], "removed", "selected"), -1);
  for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " ", "Tab"]) {
    assert.equal(nextPlotPointIndex(key, -1, 0), null);
  }
});

test("a single point remains the destination of every navigation key", () => {
  assert.equal(activePlotPointIndex(["only"], null, null), 0);
  for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"]) {
    assert.equal(nextPlotPointIndex(key, 0, 1), 0);
  }
});

test("1500-point plots navigate by displayed order and stop at both ends", () => {
  const ids = Array.from({ length: 1500 }, (_, index) => `point-${index}`);
  for (let index = 0; index < ids.length; index += 1) {
    assert.equal(activePlotPointIndex(ids, ids[index], null), index);
    for (const key of ["ArrowDown", "ArrowRight"]) assert.equal(nextPlotPointIndex(key, index, ids.length), Math.min(1499, index + 1));
    for (const key of ["ArrowUp", "ArrowLeft"]) assert.equal(nextPlotPointIndex(key, index, ids.length), Math.max(0, index - 1));
    assert.equal(nextPlotPointIndex("Home", index, ids.length), 0);
    assert.equal(nextPlotPointIndex("End", index, ids.length), 1499);
  }
});

test("selection included outside the usual sample is the initial keyboard destination", () => {
  const ids = ["sample-1", "sample-2", "selected-outside-sample"];
  assert.equal(activePlotPointIndex(ids, null, "selected-outside-sample"), 2);
  // Focus stays independent of selection, including repeated selection/deselection.
  for (const selectedId of [ids[2], null, ids[0]]) {
    assert.equal(activePlotPointIndex(ids, ids[1], selectedId), 1);
  }
});

test("focus follows record identity through reordering, axes, and filtering", () => {
  assert.equal(activePlotPointIndex(["c", "b", "a"], "b", "a"), 1);
  assert.equal(activePlotPointIndex(["b", "a"], "b", "a"), 0);
  assert.equal(activePlotPointIndex(["a", "c"], "b", "c"), 1);
  assert.equal(activePlotPointIndex(["a", "c"], "b", "missing"), 0);
  assert.equal(activePlotPointIndex(["returned"], "removed", null), 0);
});

test("Tab, activation, modifier names and unrelated keys are not navigation", () => {
  for (const key of ["Tab", "Enter", " ", "Escape", "Shift", "a", "PageDown"]) {
    assert.equal(nextPlotPointIndex(key, 1, 3), null);
  }
});

test("independent charts resolve their own sample and focus", () => {
  assert.equal(activePlotPointIndex(["a", "b"], "a", "b"), 0);
  assert.equal(activePlotPointIndex(["b", "c"], "c", "b"), 1);
  assert.equal(activePlotPointIndex(["c", "a"], null, "b"), 0);
});
