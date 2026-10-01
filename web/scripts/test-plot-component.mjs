import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

// Mount the production component, including its SVG, React events, and Radix controls.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test/" });
for (const key of ["window", "document", "HTMLElement", "SVGElement", "Element", "Node", "DocumentFragment", "MutationObserver", "CustomEvent"]) {
  globalThis[key] = dom.window[key];
}
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { KinematicsPlots } = await import("../src/components/KinematicsPlots.tsx");
const { makeKinematicsRowId } = await import("../src/lib/kinematicsSelection.ts");

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    object_key: "test", source_provider: "test", source_name: "test", source_row: String(index),
    star_id: `record-${index}`, source_kind: "test", ra_deg: String(index / 100), dec_deg: String(index / 200),
    pmra_masyr: String(index / 1000), pmdec_masyr: String(-index / 1000), vlos_kms: String(index),
    feh: index % 2 === 0 ? String(-index / 100) : "",
  }));
}

async function mount(sample, selectedId = null) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const calls = [];
  let props = { rows: sample, datasets: [], selectedId, xAxis: "ra_deg", yAxis: "dec_deg" };
  const render = () => root.render(createElement(KinematicsPlots, {
    ...props,
    onAxisChange: (patch) => { props = { ...props, ...patch }; render(); },
    onToggleSelect: (row, id) => {
      calls.push({ row, id });
      props = { ...props, selectedId: props.selectedId === id ? null : id };
      render();
    },
  }));
  await act(render);
  return {
    container, calls,
    charts: () => [...container.querySelectorAll('[role="listbox"]')],
    update: async (patch) => { props = { ...props, ...patch }; await act(render); },
    selectedId: () => props.selectedId,
    close: async () => { await act(() => root.unmount()); container.remove(); },
  };
}

const options = (chart) => [...chart.querySelectorAll('[role="option"]')];
const active = (chart) => {
  const id = chart.getAttribute("aria-activedescendant");
  const point = id ? document.getElementById(id) : null;
  assert.ok(!id || (point && chart.contains(point)), "active descendant belongs to this chart");
  return point;
};
async function key(chart, value, extra = {}) {
  const event = new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...extra });
  await act(() => chart.dispatchEvent(event));
  return event;
}
const focus = async (element) => act(() => element.focus());

test("empty charts stay out of Tab order and populated charts have exactly one entry each", async () => {
  for (const count of [0, 1, 1500]) {
    const ui = await mount(rows(count));
    try {
      assert.equal(ui.charts().length, 3);
      assert.equal(ui.container.querySelectorAll('[role="listbox"][tabindex="0"]').length, count ? 3 : 0);
      assert.equal(ui.container.querySelectorAll('circle[tabindex]').length, 0);
      for (const chart of ui.charts()) {
        assert.equal(options(chart).length, count);
        assert.equal(Boolean(active(chart)), count > 0);
        assert.ok(document.getElementById(chart.getAttribute("aria-describedby")));
        assert.equal(chart.querySelector('svg')?.getAttribute("role"), count ? "presentation" : undefined);
      }
    } finally { await ui.close(); }
  }
});

test("production handlers navigate, select once per press, expose selection, and leave Tab untouched", async () => {
  const sample = rows(1500);
  const ui = await mount(sample);
  try {
    const chart = ui.charts()[0];
    await focus(chart);
    const all = options(chart);
    assert.equal(document.activeElement, chart);
    for (const [press, index] of [["End",1499],["ArrowDown",1499],["ArrowLeft",1498],["Home",0],["ArrowUp",0],["ArrowRight",1]]) {
      assert.equal((await key(chart, press)).defaultPrevented, true);
      assert.equal(active(chart), all[index]);
      assert.equal(ui.calls.length, 0, "navigation does not select or change URL selection");
    }
    await key(chart, "Enter");
    assert.equal(ui.selectedId(), makeKinematicsRowId(sample[1], 1));
    assert.equal(active(chart).getAttribute("aria-selected"), "true");
    await key(chart, "Enter", { repeat: true });
    assert.equal(ui.calls.length, 1);
    await key(chart, " ");
    assert.equal(ui.selectedId(), null);
    assert.equal(active(chart), all[1]);
    assert.equal(active(chart).getAttribute("aria-selected"), "false");
    assert.equal((await key(chart, "Tab")).defaultPrevented, false);
    assert.equal((await key(chart, "Tab", { shiftKey: true })).defaultPrevented, false);
    assert.equal((await key(chart, "Home", { ctrlKey: true })).defaultPrevented, false);
    assert.equal((await key(chart, "ArrowLeft", { altKey: true })).defaultPrevented, false);
  } finally { await ui.close(); }
});

test("single-point navigation and repeated activation preserve record identity and values", async () => {
  const sample = rows(1);
  const ui = await mount(sample);
  try {
    const chart = ui.charts()[0];
    await focus(chart);
    for (const press of ["Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) await key(chart, press);
    for (const press of ["Enter", " ", "Enter", " "]) await key(chart, press);
    assert.equal(ui.selectedId(), null);
    assert.equal(ui.calls.length, 4);
    assert.ok(ui.calls.every((call) => call.row === sample[0] && call.id === makeKinematicsRowId(sample[0], 0)));
    assert.equal(document.activeElement, chart);
  } finally { await ui.close(); }
});

test("selected records outside the usual sample enter at selection and recover when deselected", async () => {
  const sample = rows(3001);
  const selectedId = makeKinematicsRowId(sample[1], 1);
  const ui = await mount(sample);
  try {
    const chart = ui.charts()[0];
    const originalLabels = options(chart).map((point) => point.getAttribute("aria-label"));
    assert.equal(originalLabels.length, 1500);
    assert.equal(originalLabels.some((label) => label.startsWith("record-1 ·")), false);
    await ui.update({ selectedId });
    await focus(chart);
    assert.equal(options(chart).length, 1500);
    assert.ok(active(chart).getAttribute("aria-label").startsWith("record-1 ·"));
    assert.equal(active(chart).getAttribute("aria-selected"), "true");
    await key(chart, " ");
    assert.equal(ui.selectedId(), null);
    assert.equal(document.activeElement, chart);
    assert.equal(active(chart), options(chart)[0]);
    assert.deepEqual(options(chart).map((point) => point.getAttribute("aria-label")), originalLabels, "sampling is unchanged");
    await key(chart, "Enter");
    assert.equal(ui.selectedId(), makeKinematicsRowId(sample[0], 0));
  } finally { await ui.close(); }
});

test("filter/axis changes, removed focus and empty/refilled samples keep valid chart focus", async () => {
  const sample = rows(4);
  const ui = await mount(sample);
  try {
    const chart = ui.charts()[2];
    await focus(chart);
    await key(chart, "End");
    await ui.update({ rows: [...sample].reverse() });
    assert.ok(active(chart).getAttribute("aria-label").startsWith("record-3 ·"));
    await ui.update({ xAxis: "feh" });
    assert.equal(options(chart).length, 2);
    assert.ok(active(chart).getAttribute("aria-label").startsWith("record-2 ·"));
    assert.equal(document.activeElement, chart);
    await ui.update({ rows: [] });
    assert.equal(document.activeElement, chart, "stable wrapper retains focus if all points disappear");
    assert.equal(chart.tabIndex, -1);
    assert.equal(active(chart), null);
    assert.equal((await key(chart, "Enter")).defaultPrevented, false);
    await ui.update({ rows: [sample[0]] });
    assert.equal(document.activeElement, chart);
    assert.equal(chart.tabIndex, 0);
    assert.equal(active(chart), options(chart)[0]);
    assert.equal(ui.calls.length, 0);
  } finally { await ui.close(); }
});

test("charts have independent active descendants and mouse selection focuses the clicked record", async () => {
  const sample = rows(3);
  const ui = await mount(sample, makeKinematicsRowId(sample[0], 0));
  try {
    const [first, second, third] = ui.charts();
    await focus(first);
    await key(first, "End");
    await focus(second);
    await key(second, "ArrowDown");
    assert.equal(active(first), options(first)[2]);
    assert.equal(active(second), options(second)[1]);
    assert.equal(active(third), options(third)[0]);
    const ids = ui.charts().flatMap((chart) => options(chart).map((point) => point.id));
    assert.equal(new Set(ids).size, ids.length);
    // The previous selection must not win over the click's target during onFocus.
    await act(() => options(third)[2].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(document.activeElement, third);
    assert.equal(active(third), options(third)[2]);
    assert.equal(ui.selectedId(), makeKinematicsRowId(sample[2], 2));
    assert.ok(ui.charts().every((chart) => options(chart)[2].getAttribute("aria-selected") === "true"));
  } finally { await ui.close(); }
});
