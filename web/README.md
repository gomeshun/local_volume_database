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
- Kinematics chunks contain at most 1,000 public normalized records. Raw
  provider payloads and `original_row_json` are excluded.
- `src/generated/datasets_summary.ts` and
  `src/generated/kinematics_summary.ts` contain only route metadata.

## Deployment Notes

The app is configured for static export through `next.config.ts`. In GitHub Actions, `basePath` and `assetPrefix` are inferred from `GITHUB_REPOSITORY` so GitHub Pages project URLs are served from `/<repo>/`.

Optional public environment variables for fork-specific links are documented in `.env.example`.
