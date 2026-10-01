# Research-view review checklist

This branch is for hands-on review. Do not merge until the requester has approved the interaction design. The private review deployment is separate from the production GitHub Pages site.

## Shared sample

1. Open Draco and select `geha2026_deimos_expanded_aas_iop` only: 1,644 loaded records.
2. Choose `P ≥ 0.9`: the shared sample, table, diagnostic input and filtered CSV should contain 302 records. Individual panels count only records with their required measurements; the sky count excludes missing coordinates.
3. Search `30Drac`: 2 records with the threshold, or 29 with `All membership`.
4. Download both CSVs: filtered export follows the current sample; full selected-dataset export retains all 1,644 source records. Both retain every public column and row-level provenance. Table sorting changes presentation only; exports preserve source order.
5. Clear datasets, select Walker 2015, then choose a probability threshold: unknown probabilities remain missing and the sample is empty. Reset filters to recover all 1,565 records.
6. A partial/failed dataset load is labeled, and exports stay disabled until every selected dataset is ready. Deselecting a loading dataset must not add its rows back later.

## Table controls

- On the Milky Way dataset, try column search, science-group show/hide, Basic, Spectroscopy and Proper motion presets.
- Scientific presets include corresponding uncertainty/reference fields. Identity columns remain visible and sticky during horizontal scrolling.
- Toggle `Hide sky / widen table`, then restore the sky. Below the desktop breakpoint, the sky is placed below the table.
- Check a phone viewport: controls wrap, column chooser stays inside the viewport, and wide tables scroll inside their own container.

## Reproduce a view

- Set dataset selection, search, membership, plot axes, columns, sort, page size, sky visibility and a selected record. Use `Copy view link`, then open the link in another tab.
- Reload and use browser Back/Forward. The view should be restored from the URL. Malformed/unsupported state falls back safely.
- Explicit axes remain selected even if a filter leaves no measurements, displaying an empty-plot explanation.
- Download view metadata to retain snapshot/source hashes, selected sources and chunk hashes, filter recipe, display state, counts and export ordering. A link restores settings against the currently deployed snapshot; metadata identifies the snapshot used for the export.

## Verification

Automated checks: build/typecheck, lint, numeric/tick regressions, real-data filter/CSV count cases, URL decoding/roundtrip, membership missingness, column-family presets, data integrity and static artifact budgets.

Live browser interaction, mobile layout, browser CSV downloads/clipboard and Aladin/WebGL rendering require manual acceptance in the private preview. This execution environment did not provide a supported live browser preview bridge, so automated/unit checks are not represented as end-to-end UI verification.

## Selected-record and identity review

- Select the Geha dataset on Draco, leave the table on page 1, and click an off-page proper-motion point (for example SERENDIP source row 3562). The selected-record inspector should immediately show coordinates, velocity/errors, PM/errors, membership origins, source row and exact Gaia ID.
- Click **Show in table**: the selected observation should appear on its correct page with focus/highlight. Repeat the action, change sort direction or page size, and try again.
- Filter out the selected record: details remain, the inspector states that it is outside the filters, and Show in table is disabled. Reset filters and use Show in table again. Clear selection should remove the inspector and URL selection.
- Restore a shared URL with a selection, and try a stale record ID. A stale/unloaded record must be reported as unavailable, never resolved by a reused label.
- Search 30Drac: 29 Geha source records remain distinguishable by row and record ID. Original labels are preserved; Gaia IDs and CSV values must keep all digits. A blank Gaia field means not exposed/not reported, not proof of no source match.
- Download view metadata and CSV: identity supplement/source hashes and all additive identity columns are retained. Base data hashes refer to unchanged science chunks.
- If a Geha identity supplement fails, its dataset stays incomplete and exports stay disabled until retry/deselection. Non-Geha datasets must remain independently usable.
