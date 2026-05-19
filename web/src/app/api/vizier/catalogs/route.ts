import { NextResponse } from "next/server";

export const dynamic = "force-static";

// NOTE:
// This API route previously proxied Vizier requests. That caused problems with
// the project's "output: export" setting in development (Next.js refused to
// load the route when it required dynamic behavior). VizieR data is now
// generated at build time, so this route stays disabled intentionally.
export function GET() {
  return NextResponse.json({ error: "disabled; VizieR data is generated at build time" }, { status: 501 });
}
