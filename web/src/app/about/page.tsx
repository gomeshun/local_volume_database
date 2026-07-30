import Link from "next/link";
import { siteConfig } from "../siteConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <Link href="/">← Back</Link>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">About</h1>

      <Card>
        <CardHeader>
          <CardTitle>Unofficial fork</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This web application is developed in a fork of the upstream LVDB repository and is not an
          official product of the LVDB project.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This fork</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Links below point to this fork and its deployment (when configured).</p>
          <ul className="list-inside list-disc space-y-1">
          {siteConfig.forkSiteUrl && (
            <li>
              Site:{" "}
              <a href={siteConfig.forkSiteUrl} target="_blank" rel="noreferrer">
                {siteConfig.forkSiteUrl}
              </a>
            </li>
          )}
          {siteConfig.forkRepoUrl && (
            <li>
              Repository:{" "}
              <a href={siteConfig.forkRepoUrl} target="_blank" rel="noreferrer">
                {siteConfig.forkRepoUrl}
              </a>
            </li>
          )}
          {siteConfig.forkIssuesUrl && (
            <li>
              Issues (web UI):{" "}
              <a href={siteConfig.forkIssuesUrl} target="_blank" rel="noreferrer">
                {siteConfig.forkIssuesUrl}
              </a>
            </li>
          )}
          </ul>
          {!siteConfig.forkRepoUrl && !siteConfig.forkSiteUrl && !siteConfig.forkIssuesUrl && (
            <p>
              Tip: set NEXT_PUBLIC_FORK_REPO_URL / NEXT_PUBLIC_FORK_SITE_URL (see `web/.env.example`) to
              show fork-specific links.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upstream project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>The underlying data and documentation originate from the Local Volume Database (LVDB) project:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Repository:{" "}
              <a href="https://github.com/apace7/local_volume_database" target="_blank" rel="noreferrer">
                github.com/apace7/local_volume_database
              </a>
            </li>
            <li>
              Overview paper:{" "}
              <a href="https://arxiv.org/abs/2411.07424" target="_blank" rel="noreferrer">
                arXiv:2411.07424
              </a>{" "}
              (see also{" "}
              <a
                href="https://ui.adsabs.harvard.edu/abs/2025OJAp....8E.142P/abstract"
                target="_blank"
                rel="noreferrer"
              >
                ADS
              </a>
              )
            </li>
          </ul>
          <p>If you use LVDB in research, please follow the upstream acknowledgement/citation guidance.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>License</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The upstream repository includes a CC0 1.0 Universal dedication, which permits reuse,
            modification, and redistribution, including public web deployment.
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              CC0 1.0 summary:{" "}
              <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">
                creativecommons.org/publicdomain/zero/1.0
              </a>
            </li>
          </ul>
          <p>
            (Non-legal note: CC0 does not require attribution, but we provide credit here for clarity
            and good scholarly practice.)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Third-party components</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Sky visualization is powered by Aladin Lite by CDS.</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Aladin Lite:{" "}
              <a href="https://aladin.cds.unistra.fr/AladinLite/" target="_blank" rel="noreferrer">
                aladin.cds.unistra.fr/AladinLite
              </a>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Member-kinematics provenance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Kinematic entries are normalized source records, not a deduplicated catalog of unique
            member stars. Selection functions and membership definitions remain specific to each
            cited provider.
          </p>
          <p>
            Each object page lists its providers, source table, reference, record count, and
            SHA-256 checksums for the normalized input and public projection.
          </p>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Want to report issues? For LVDB data/content issues, please use the upstream LVDB channels.
        For web UI issues specific to this fork, use this fork&apos;s issue tracker.
      </p>
    </div>
  );
}
