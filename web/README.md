# LVDB Explorer

Next.js frontend for browsing Local Volume Database tables and normalized
member-kinematics products.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) after the dev server starts.

`npm run dev` runs `npm run prepare:data` first. Normal preparation is
deterministic and offline: it writes small route summaries under
`src/generated/` and lazy-loaded JSON under `public/data/`.

## Useful Commands

```bash
npm run prepare:data
npm run lint
npm run build
```

Remote cache refreshes are explicit:

```bash
npm run refresh:vizier
npm run refresh:simbad
npm run refresh:simbad:force
npm run refresh:simbad:retry-bad
```

`prepare:data` never performs those remote requests.

## Data layout

- `public/data/datasets/<slug>.json` contains one LVDB table and is fetched
  only when its route is opened.
- `public/data/kinematics/<object>/manifest.json` records source provenance,
  checksums, semantics, and chunk metadata.
- `public/data/kinematics/columns.json` is the machine-readable data dictionary
  for every normalized table and CSV column. Object pages expose the same
  definitions in a Column guide, table-header tooltips, and a downloadable
  guide CSV.
- Kinematics chunks contain at most 1,000 public normalized records. Raw
  provider payloads and `original_row_json` are excluded.
- Membership values expose `reported`, `same_star`, and `seed_source` origins.
  Source provenance shows both coverage and the number of same-star inherited
  values; blanks remain unknown rather than being converted to non-members.
- `src/generated/datasets_summary.ts` and
  `src/generated/kinematics_summary.ts` contain only route metadata.
- Object pages expose source datasets—not transfer chunks—as reversible
  checkbox selections. Plotting, the record table, the sky view, and CSV export
  share the same selection; cached datasets can be removed and re-added without
  another request.
- Object diagnostics use a stable color per dataset and include the
  proper-motion plane, RA–Dec sky-position distribution, an automatically
  binned line-of-sight velocity histogram, and a selectable-axis scatter plot.
  They describe selected source records rather than a de-duplicated stellar
  sample.
- Object-list coverage counts require actual finite `vlos`, pmRA, and pmDec
  values; a row is not counted merely because its source is categorized as
  spectroscopy or proper motion.

## Deployment Notes

The app is configured for static export through `next.config.ts`. In GitHub Actions, `basePath` and `assetPrefix` are inferred from `GITHUB_REPOSITORY` so GitHub Pages project URLs are served from `/<repo>/`.

Optional public environment variables for fork-specific links are documented in `.env.example`.

## Source-record identity and selection

Selecting a plot point, sky source or table row keeps a record inspector visible
with coordinates, measurements and uncertainties, membership origins and source
provenance. **Show in table** locates the record in the current filtered/sorted
sample and navigates to its page. A filtered-out or unavailable URL selection is
explicitly labelled; it is never silently replaced by a similarly named record.

`star_id` remains the legacy source label so existing URLs and downloads retain
compatibility. It is not unique, including within a source. For Geha Table A5,
`Object` is a DEIMOS design-file target name, not a mask name. Its original value
is separately exposed as `source_target_label`; `gaia_source_id` preserves the
reported Gaia DR3 ID as an exact string. `record_id` is an unambiguous JSON-encoded
source-record locator, not an inferred unique physical-star match.

The committed science snapshot is preserved. Per-object
`geha-record-identities.json` supplements add the missing identity fields and are
bound to each manifest's base `publicDataSha256`, original `sourceInputSha256`, and
the exact publisher MRT SHA-256. Before adding them, the offline migration checks
every existing public field in all 11,232 Geha rows against independently
normalized source rows. No measurement, reported membership, legacy label, base
chunk or original snapshot timestamp/hash is rewritten. The UI verifies supplement
checksums and scope before making the affected dataset ready; failed enrichment
keeps that dataset incomplete and blocks full/filtered exports until retry.
Unrelated source datasets remain usable.

To reproduce the additive enrichment with a local copy of the registered Table A5:

```bash
# From the repository root, in a uv-managed environment with project dependencies
uv run python scripts/build_geha_identity_supplement.py /path/to/apjae290dt5_mrt.txt
```

This command performs no network requests. The supplemental source SHA-256 is
`3b731eb3b055cf14feeccf54cea862102b6be1c75a38b66ba1cbbe38664e82f4`.
View-metadata downloads include both the base-science hashes and supplement/source
hashes. CSV exports include the additive identity columns. Fresh normalization
also writes these fields natively; membership propagation uses source-scoped Gaia
IDs where explicit and never relies on a Geha design label alone when Gaia is
missing. No cross-source membership propagation is introduced.

## Scatter-plot keyboard navigation

Each nonempty scatter plot is one Tab stop. Arrow keys move through the rendered
sample in its existing order (not spatial order, including the reversed RA axis).
Home and End jump to the first and last displayed point. Enter or Space toggles
the active record's selection; navigation alone does not change selection. Tab
and Shift+Tab leave the plot normally. Keyboard focus has a high-contrast ring,
separate from the orange selected-record marker.

The listbox exposes an active descendant and each point's selected state. On
entry, an existing selected point is active, including a selected record inserted
into the deterministic preview. If filtering or an axis change removes the active
point, navigation falls back to the selected displayed record or the first point.
An empty chart is removed from Tab order but keeps its wrapper so an already
focused chart does not drop focus to the document body.

`npm run test:ui` includes pure navigation tests and mounted React/JSDOM component
regressions. JSDOM checks event wiring, focus ownership and ARIA attributes, but
cannot verify native Tab traversal, rendered focus contrast or a browser/screen
reader accessibility tree. Before merging keyboard changes, check these in a real
browser on a populated object page:

1. Tab into each of the three scatter plots and exit with one Tab or Shift+Tab.
2. Navigate with all four arrows and Home/End; confirm only the focus ring moves.
3. Use Enter and Space repeatedly, and verify the inspector/table retain the
   source-record identity, including a selected point outside the usual sample.
4. Change filters/axes and remove the active point, including an empty sample;
   verify a valid remaining focus target and independent focus in other charts.
5. Check that the accessibility tree exposes listbox options, active descendant,
   selected state and sample size, and that keyboard focus is visible in both
   light and dark themes.
