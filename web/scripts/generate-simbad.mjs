import fs from "node:fs/promises";
import path from "node:path";

// When run from `web/`, repo root is one directory up.
const REPO_ROOT = path.resolve(process.cwd(), "..");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === ',') {
      out.push(cur);
      cur = "";
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

async function readCsv({ filePath }) {
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error(`Empty CSV: ${filePath}`);
  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < header.length; c += 1) {
      row[header[c]] = values[c] ?? "";
    }
    rows.push(row);
  }
  return { header, rows };
}

function makeRowId(row, idx) {
  const key = (row.key ?? "").trim();
  if (key) return key;
  const name = (row.name ?? "").trim();
  if (name) return name;
  return String(idx);
}

function degreesToRadians(d) {
  return (d * Math.PI) / 180.0;
}

function angularSeparationArcsec(ra1deg, dec1deg, ra2deg, dec2deg) {
  // Convert to radians
  const ra1 = degreesToRadians(ra1deg);
  const ra2 = degreesToRadians(ra2deg);
  const dec1 = degreesToRadians(dec1deg);
  const dec2 = degreesToRadians(dec2deg);

  const sinDec1 = Math.sin(dec1);
  const sinDec2 = Math.sin(dec2);
  const cosDec1 = Math.cos(dec1);
  const cosDec2 = Math.cos(dec2);
  const cosDeltaRA = Math.cos(ra1 - ra2);

  let cosAngle = sinDec1 * sinDec2 + cosDec1 * cosDec2 * cosDeltaRA;
  // Numerical guard
  if (cosAngle > 1) cosAngle = 1;
  if (cosAngle < -1) cosAngle = -1;
  const angleRad = Math.acos(cosAngle);
  const angleDeg = (angleRad * 180) / Math.PI;
  return angleDeg * 3600.0;
}

function slugSuffix(slug) {
  if (!slug) return null;
  // If the slug references a dwarf (start or end), try both common variants:
  // - "dsph" (dwarf spheroidal shorthand)
  // - "dwarf galaxy" (full phrase)
  if (slug.startsWith("dwarf")) return ["Dwarf Galaxy", "dSph", "Galaxy"];
  if (slug.startsWith("gc")) return ["GC"];
  return null;
}

// Parse a VOTABLE response into fields and rows keyed by FIELD ID.
function parseVOTable(text) {
  // Extract the first <TABLE>...</TABLE> block (which includes FIELD defs and TABLEDATA)
  const tableMatch = text.match(/<TABLE[\s\S]*?<\/TABLE>/i);
  if (!tableMatch) return { fields: [], rows: [] };
  const table = tableMatch[0];

  // Extract FIELD IDs in order
  const fieldMatches = Array.from(table.matchAll(/<FIELD[^>]*\bID=\"([^\"]+)\"/gi));
  const fields = fieldMatches.map((m) => m[1]);

  const tableDataMatch = table.match(/<TABLEDATA[\s\S]*?<\/TABLEDATA>/i);
  if (!tableDataMatch) return { fields, rows: [] };
  const tableData = tableDataMatch[0];

  const rowMatches = Array.from(tableData.matchAll(/<TR>([\s\S]*?)<\/TR>/gi));
  const rows = rowMatches.map((m) => {
    const rowHtml = m[1];
    const tdMatches = Array.from(rowHtml.matchAll(/<TD>([\s\S]*?)<\/TD>/gi));
    const values = tdMatches.map((t) => t[1].trim());
    // Map values to field IDs
    const obj = {};
    for (let i = 0; i < fields.length; i += 1) {
      obj[fields[i]] = values[i] ?? "";
    }
    return obj;
  });

  return { fields, rows };
}

// Parse ASCII object display to extract coordinates if present.
function parseCoordinatesFromAscii(text) {
  if (!text) return null;
  // Look for a line like: Coordinates(ICRS,ep=J2000,eq=2000): 13 28 03.5  +33 33 21
  const coordMatch = text.match(/Coordinates\([^)]*\):\s*([0-9]{1,2})\s+([0-9]{1,2})\s+([0-9]+(?:\.[0-9]+)?)\s+([+\-]?[0-9]{1,3})\s+([0-9]{1,2})\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (coordMatch) {
    const rah = Number(coordMatch[1]);
    const ram = Number(coordMatch[2]);
    const ras = Number(coordMatch[3]);
    const decd = Number(coordMatch[4]);
    const decm = Number(coordMatch[5]);
    const decs = Number(coordMatch[6]);

    // RA: hours -> degrees
    const raDeg = (rah + ram / 60 + ras / 3600) * 15.0;
    // Dec: sign from degrees
    const sign = String(coordMatch[4]).startsWith("-") ? -1 : 1;
    const decAbs = Math.abs(decd) + decm / 60 + decs / 3600;
    const decDeg = sign * decAbs;

    return { ra: raDeg, dec: decDeg };
  }

  // Fallback: try to capture RA/DEC in decimal degrees if present (e.g., Gal coords)
  const decMatch = text.match(/Coordinates\([^)]*\):[^\n]*?([0-9]+\.[0-9]+)\s+([+\-]?[0-9]+\.[0-9]+)/i);
  if (decMatch) {
    const ra = Number(decMatch[1]);
    const dec = Number(decMatch[2]);
    if (Number.isFinite(ra) && Number.isFinite(dec)) return { ra, dec };
  }

  return null;
}

async function main() {
  const dataDir = path.resolve(REPO_ROOT, "data");
  const files = (await fs.readdir(dataDir)).filter((f) => f.endsWith(".csv"));

  const generatedDir = path.resolve(process.cwd(), "src", "generated");
  await fs.mkdir(generatedDir, { recursive: true });

  const outJson = path.resolve(generatedDir, "simbad_mappings.json");
  const outTs = path.resolve(generatedDir, "simbad_mappings.ts");

  // Support flags:
  // - `--force` to re-fetch all entries regardless of cache
  // - `--retry-bad` to re-fetch previously fetched entries that lacked successful results
  const force = process.argv.includes("--force") || process.env.FORCE_SIMBAD === "1";
  const retryBad = process.argv.includes("--retry-bad") || process.env.RETRY_BAD === "1";
  const refresh = process.argv.includes("--refresh") || force || retryBad;
  if (force) console.log("Force mode: will re-fetch all SIMBAD entries");
  if (retryBad) console.log("Retry-bad mode: will re-fetch previously fetched entries missing successful results");
  if (!refresh) console.log("Offline mode: missing SIMBAD entries will not be fetched");

  // Load existing cache
  let cache = {};
  try {
    const txt = await fs.readFile(outJson, "utf8");
    cache = JSON.parse(txt);
    console.log(`Loaded existing SIMBAD cache: ${Object.keys(cache).length} dataset entries`);
  } catch {
    cache = {};
    console.log("No existing SIMBAD cache found; will create a new one.");
  }

  // Build an index of previous results keyed by rowId across all tables so we can
  // reuse an existing lookup when the same rowId appears in multiple CSVs.
  const previousByRowId = {};
  for (const s of Object.keys(cache)) {
    const entries = cache[s] || {};
    for (const rid of Object.keys(entries)) {
      const ent = entries[rid];
      if (!ent || !ent.fetchedAt) continue;
      const prev = previousByRowId[rid];
      if (!prev) previousByRowId[rid] = ent;
      else {
        // prefer matched results and ones that include coordinates
        const prevScore = (prev.matched ? 2 : 0) + (prev.simbad_ra != null ? 1 : 0);
        const entScore = (ent.matched ? 2 : 0) + (ent.simbad_ra != null ? 1 : 0);
        if (entScore > prevScore) previousByRowId[rid] = ent;
      }
    }
  }
  console.log(`Indexed ${Object.keys(previousByRowId).length} unique previous rowIds for reuse`);

  // Build list of grouped tasks: one task per unique rowId (can serve multiple tables)
  const tasks = [];
  const groupMap = {};

  for (const file of files) {
    const slug = path.basename(file, ".csv");
    const { rows } = await readCsv({ filePath: path.resolve(dataDir, file) });
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowId = makeRowId(row, i);
      const name = (row.name ?? "").trim() || (row.key ?? "").trim();
      if (!name) continue;
      if (!cache[slug]) cache[slug] = {};
      // Skip behavior:
      // - By default: skip any entry that already has `fetchedAt`.
      // - `--retry-bad`: re-fetch previously fetched entries that are missing a `matched` result.
      if (!force && cache[slug][rowId] && cache[slug][rowId].fetchedAt) {
        if (!retryBad) continue;
        // If retryBad is set, only re-fetch entries that don't have a `matched` attribute
        if (Object.prototype.hasOwnProperty.call(cache[slug][rowId], "matched")) continue;
      }
      // If another table already has a result for this same rowId (has 'matched' attribute), reuse it
      if (!force && previousByRowId[rowId] && Object.prototype.hasOwnProperty.call(previousByRowId[rowId], "matched")) {
        cache[slug][rowId] = JSON.parse(JSON.stringify(previousByRowId[rowId]));
        continue;
      }
      // Group by rowId so we fetch once and fill all slugs that reference it
      if (!groupMap[rowId]) {
        groupMap[rowId] = { rowId, name, row, slugs: [slug], idx: i };
        tasks.push(groupMap[rowId]);
      } else {
        groupMap[rowId].slugs.push(slug);
      }
    }
  }

  const totalSlugsToFetch = tasks.reduce((acc, t) => acc + (t.slugs ? t.slugs.length : 1), 0);
  console.log(`Need to fetch SIMBAD for ${tasks.length} unique rowIds across ${totalSlugsToFetch} table entries`);

  if (!refresh && tasks.length > 0) {
    console.log("Skipping remote SIMBAD lookups during deterministic data generation.");
    tasks.length = 0;
  }

  // Limit concurrency
  const concurrency = 6;
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i;
      i += 1;
      const t = tasks[idx];
      const { rowId, name, row, slugs } = t;
      // Build candidate list: try raw name, then any suffix variants required by the different slugs
      const suffixNames = new Set();
      for (const s of slugs) {
        const sf = slugSuffix(s);
        if (!sf) continue;
        if (Array.isArray(sf)) {
          for (const suffix of sf) suffixNames.add(`${name} ${suffix}`);
        } else {
          suffixNames.add(`${name} ${sf}`);
        }
      }
      const candidates = [name, ...Array.from(suffixNames)];

      const entry = { fetchedAt: new Date().toISOString() };
      let vrows = null;

      try {
        for (const ident of candidates) {
          const url = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(ident)}&output.format=votable&output.params=TYPED_ID,MATCHING_ID,ANG_DIST,MAIN_ID,OTYPE_S,RA_d,DEC_d,NB_REF`;
          const res = await fetch(url, { method: "GET" });
          if (!res.ok) {
            // If HTTP error, move to next candidate
            console.log(`HTTP ${res.status} for ${slugs.join('|')}/${rowId} ident='${ident}'`);
            continue;
          }
          const text = await res.text();
          const parsed = parseVOTable(text);
          vrows = parsed.rows;
          if (vrows && vrows.length > 0) {
            break;
          }
          // otherwise try next candidate
        }

        if (!vrows || vrows.length === 0) {
          entry.empty = true;
          for (const s of slugs) {
            if (!cache[s]) cache[s] = {};
            cache[s][rowId] = JSON.parse(JSON.stringify(entry));
          }
          console.log(`No results: ${slugs.join('|')}/${rowId} -> tried: ${candidates.join(' | ')}`);
          continue;
        }

        // Fields may vary per response; read by name
        let best = null;
        const ra0 = Number(row.ra);
        const dec0 = Number(row.dec);
        for (const r of vrows) {
          const typed = r.TYPED_ID ?? "";
          const matching = r.MATCHING_ID ?? "";
          const angDist = r.ANG_DIST !== undefined && r.ANG_DIST !== "" ? Number(r.ANG_DIST) : NaN;
          const mainId = r.MAIN_ID ?? "";
          const otype = r.OTYPE_S ?? r.OTYPE ?? "";
          const ra = r.RA_d !== undefined && r.RA_d !== "" ? Number(r.RA_d) : null;
          const dec = r.DEC_d !== undefined && r.DEC_d !== "" ? Number(r.DEC_d) : null;

          let sep = null;
          if (Number.isFinite(ra0) && Number.isFinite(dec0) && ra !== null && dec !== null) {
            sep = angularSeparationArcsec(ra0, dec0, ra, dec);
          }

          const candidate = {
            typed,
            matching,
            angDist: Number.isFinite(angDist) ? angDist : null,
            mainId,
            otype,
            ra,
            dec,
            sep,
          };

          if (!best) best = candidate;
          else if (sep !== null && best.sep !== null) {
            if (sep < best.sep) best = candidate;
          } else if (candidate.angDist !== null && best.angDist !== null) {
            if (candidate.angDist < best.angDist) best = candidate;
          }
        }

        if (best) {
          // If RA/DEC are missing from the initial list response, try a second fetch
          // using the resolved MAIN_ID to retrieve coordinates specifically.
          if ((best.ra === null || best.dec === null) && best.mainId) {
            try {
              const detailsUrl = `https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(
                best.mainId,
              )}&output.format=votable`;
              const r2 = await fetch(detailsUrl, { method: "GET" });
              if (r2.ok) {
                const txt2 = await r2.text();
                const { rows: rows2 } = parseVOTable(txt2);
                if (rows2 && rows2.length > 0) {
                  // Try to find the first row that contains coordinates
                  for (const rr of rows2) {
                    const ra2 = rr.RA_d !== undefined && rr.RA_d !== "" ? Number(rr.RA_d) : null;
                    const dec2 = rr.DEC_d !== undefined && rr.DEC_d !== "" ? Number(rr.DEC_d) : null;
                    if (ra2 !== null && dec2 !== null) {
                      best.ra = ra2;
                      best.dec = dec2;
                      if (Number.isFinite(ra0) && Number.isFinite(dec0)) {
                        best.sep = angularSeparationArcsec(ra0, dec0, ra2, dec2);
                      }
                      break;
                    }
                  }

                  // If still missing coords, try ASCII output and parse coordinates from text
                  if ((best.ra === null || best.dec === null) || best.ra === undefined) {
                    try {
                      const txtAscii = await fetch(`https://simbad.u-strasbg.fr/simbad/sim-id?Ident=${encodeURIComponent(best.mainId)}&output.format=ASCII`, { method: "GET" }).then((r) => r.text());
                      const coords = parseCoordinatesFromAscii(txtAscii);
                      if (coords) {
                        best.ra = coords.ra;
                        best.dec = coords.dec;
                        if (Number.isFinite(ra0) && Number.isFinite(dec0)) {
                          best.sep = angularSeparationArcsec(ra0, dec0, coords.ra, coords.dec);
                        }
                      }
                    } catch {
                      // ignore ascii parse failures
                    }
                  }
                }
              }
            } catch {
              // ignore detail-fetch errors; we'll still record what we have
            }
          }

          entry.mainId = best.mainId || null;
          entry.otype = best.otype || null;
          entry.simbad_ra = best.ra ?? null;
          entry.simbad_dec = best.dec ?? null;
          entry.separation_arcsec = best.sep ?? best.angDist ?? null;
          // Consider matched if separation available and < 60 arcsec (configurable)
          if (entry.separation_arcsec !== null) entry.matched = entry.separation_arcsec <= 60;
          else entry.matched = false;
        } else {
          entry.empty = true;
        }

        for (const s of slugs) {
          if (!cache[s]) cache[s] = {};
          cache[s][rowId] = JSON.parse(JSON.stringify(entry));
        }
        console.log(`Fetched ${slugs.join('|')}/${rowId}: mainId=${entry.mainId ?? "(none)"} sep=${entry.separation_arcsec ?? "?"}`);
      } catch (err) {
        for (const s of slugs) {
          if (!cache[s]) cache[s] = {};
          cache[s][rowId] = { fetchedAt: new Date().toISOString(), error: String(err) };
        }
        console.log(`Error ${slugs.join('|')}/${rowId}: ${String(err)}`);
      }
    }
  }

  const workers = new Array(Math.min(concurrency, tasks.length)).fill(0).map(() => worker());
  await Promise.all(workers);

  // Propagate best-known results across tables for duplicated rowIds (if one table found data and
  // another table had an empty result, reuse the found data).
  const bestByRowId = {};
  for (const s of Object.keys(cache)) {
    const entries = cache[s] || {};
    for (const rid of Object.keys(entries)) {
      const ent = entries[rid];
      if (!ent || !ent.fetchedAt) continue;
      const prev = bestByRowId[rid];
      if (!prev) bestByRowId[rid] = ent;
      else {
        const prevScore = (prev.matched ? 2 : 0) + (prev.simbad_ra != null ? 1 : 0);
        const entScore = (ent.matched ? 2 : 0) + (ent.simbad_ra != null ? 1 : 0);
        if (entScore > prevScore) bestByRowId[rid] = ent;
      }
    }
  }
  let propagated = 0;
  for (const s of Object.keys(cache)) {
    const entries = cache[s] || {};
    for (const rid of Object.keys(entries)) {
      const ent = entries[rid];
      const best = bestByRowId[rid];
      if (!best) continue;
      // Score: matched (2 points) + has coords (1 point)
      const existingScore = (ent && ent.matched ? 2 : 0) + (ent && ent.simbad_ra != null ? 1 : 0);
      const bestScore = (best.matched ? 2 : 0) + (best.simbad_ra != null ? 1 : 0);
      // Replace if the best-known result is strictly better than the existing one
      if (bestScore > existingScore) {
        cache[s][rid] = JSON.parse(JSON.stringify(best));
        propagated += 1;
      }
    }
  }
  console.log(`Propagated ${propagated} entries from other tables to replace lower-quality/empty duplicate keys`);

  // Write cache files
  await fs.writeFile(outJson, JSON.stringify(cache, null, 2), "utf8");
  const tsPieces = [];
  tsPieces.push("// THIS FILE IS AUTO-GENERATED. DO NOT EDIT BY HAND.");
  tsPieces.push("// Generated by scripts/generate-simbad.mjs");
  tsPieces.push("\nexport const simbadMappings = ");
  tsPieces.push(JSON.stringify(cache, null, 2) + " as const;\n");
  await fs.writeFile(outTs, tsPieces.join("\n"), "utf8");
  console.log(`Wrote SIMBAD cache: ${path.relative(process.cwd(), outJson)}`);
  console.log(`Wrote SIMBAD TS wrapper: ${path.relative(process.cwd(), outTs)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
