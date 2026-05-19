# LVDB Explorer

Next.js frontend for browsing the Local Volume Database CSV tables in this repository.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) after the dev server starts.

`npm run dev` runs `npm run prepare:data` first, which regenerates files in `src/generated/` from `../data/*.csv` and the cached VizieR/SIMBAD lookup files.

## Useful Commands

```bash
npm run prepare:data
npm run lint
npm run build
```

SIMBAD cache refresh helpers:

```bash
npm run prepare:data:force
npm run prepare:data:retry-bad
```

## Deployment Notes

The app is configured for static export through `next.config.ts`. In GitHub Actions, `basePath` and `assetPrefix` are inferred from `GITHUB_REPOSITORY` so GitHub Pages project URLs are served from `/<repo>/`.

Optional public environment variables for fork-specific links are documented in `.env.example`.
