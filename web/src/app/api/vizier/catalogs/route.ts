import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// For static export compatibility in this project, configure a revalidate interval.
export const revalidate = 60; // seconds

// NOTE:
// This API route previously proxied Vizier requests. That caused problems with
// the project's "output: export" setting in development (Next.js refused to
// load the route when it required dynamic behavior). The client now queries
// Vizier directly (CORS is allowed), so we return 501 to indicate this route
// is disabled and avoid Next.js static export conflicts.
export async function GET(_req: NextRequest) {
  return NextResponse.json({ error: "disabled; query Vizier directly from client" }, { status: 501 });

  // Define a dummy bibcode to keep the unused proxy code type-checking (code is unreachable).
  const bibcode = "";

  try {
    // Query the VizieR ASU-TSV endpoint by reference (bibcode).
    // We ask for a reasonable max number of results.
    const url = `https://vizier.u-strasbg.fr/viz-bin/asu-tsv?-ref=${encodeURIComponent(
      bibcode,
    )}&-out.max=200`;

    const res = await fetch(url, { next: { revalidate: 60 * 60 } });
    if (!res.ok) {
      return NextResponse.json({ error: `vizier returned ${res.status}` }, { status: 502 });
    }

    const text = await res.text();

    // Try to extract catalog identifiers from the response.
    // The ASU/HTML outputs typically include links with "?-source=CATALOG"; try to extract those.
    const matches = Array.from(text.matchAll(/(?:\?|&)-source=([^&\s'"]+)/g));
    const catalogs = Array.from(new Set(matches.map((m) => decodeURIComponent(m[1])))).filter(Boolean);

    return NextResponse.json({ catalogs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
