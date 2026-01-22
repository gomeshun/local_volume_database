import Link from "next/link";
import styles from "../site.module.css";
import { siteConfig } from "../siteConfig";

export default function AboutPage() {
  return (
    <div>
      <div className={styles.muted} style={{ marginBottom: 12 }}>
        <Link href="/">← Back</Link>
      </div>

      <h1 style={{ fontSize: 24, letterSpacing: "-0.02em" }}>About</h1>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <div className={styles.cardTitle}>Unofficial fork</div>
        <p className={styles.muted} style={{ marginTop: 8, lineHeight: 1.5 }}>
          This web application is developed in a fork of the upstream LVDB repository and is not an
          official product of the LVDB project.
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <div className={styles.cardTitle}>This fork</div>
        <p className={styles.muted} style={{ marginTop: 8, lineHeight: 1.5 }}>
          Links below point to this fork and its deployment (when configured).
        </p>
        <ul className={styles.muted} style={{ marginTop: 10, lineHeight: 1.6 }}>
          {siteConfig.forkSiteUrl && (
            <li>
              Site: {" "}
              <a href={siteConfig.forkSiteUrl} target="_blank" rel="noreferrer">
                {siteConfig.forkSiteUrl}
              </a>
            </li>
          )}
          {siteConfig.forkRepoUrl && (
            <li>
              Repository: {" "}
              <a href={siteConfig.forkRepoUrl} target="_blank" rel="noreferrer">
                {siteConfig.forkRepoUrl}
              </a>
            </li>
          )}
          {siteConfig.forkIssuesUrl && (
            <li>
              Issues (web UI): {" "}
              <a href={siteConfig.forkIssuesUrl} target="_blank" rel="noreferrer">
                {siteConfig.forkIssuesUrl}
              </a>
            </li>
          )}
        </ul>
        {!siteConfig.forkRepoUrl && !siteConfig.forkSiteUrl && !siteConfig.forkIssuesUrl && (
          <p className={styles.muted} style={{ marginTop: 10, lineHeight: 1.5 }}>
            Tip: set NEXT_PUBLIC_FORK_REPO_URL / NEXT_PUBLIC_FORK_SITE_URL (see `web/.env.example`) to show
            fork-specific links.
          </p>
        )}
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <div className={styles.cardTitle}>Upstream project</div>
        <p className={styles.muted} style={{ marginTop: 8, lineHeight: 1.5 }}>
          The underlying data and documentation originate from the Local Volume Database (LVDB)
          project:
        </p>
        <ul className={styles.muted} style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>
            Repository: {" "}
            <a href="https://github.com/apace7/local_volume_database" target="_blank" rel="noreferrer">
              github.com/apace7/local_volume_database
            </a>
          </li>
          <li>
            Overview paper: {" "}
            <a href="https://arxiv.org/abs/2411.07424" target="_blank" rel="noreferrer">
              arXiv:2411.07424
            </a>
            {" "} (see also {" "}
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
        <p className={styles.muted} style={{ marginTop: 10, lineHeight: 1.5 }}>
          If you use LVDB in research, please follow the upstream acknowledgement/citation guidance.
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <div className={styles.cardTitle}>License</div>
        <p className={styles.muted} style={{ marginTop: 8, lineHeight: 1.5 }}>
          The upstream repository includes a CC0 1.0 Universal dedication, which permits reuse,
          modification, and redistribution, including public web deployment.
        </p>
        <ul className={styles.muted} style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>
            CC0 1.0 summary: {" "}
            <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">
              creativecommons.org/publicdomain/zero/1.0
            </a>
          </li>
        </ul>
        <p className={styles.muted} style={{ marginTop: 10, lineHeight: 1.5 }}>
          (Non-legal note: CC0 does not require attribution, but we provide credit here for clarity
          and good scholarly practice.)
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <div className={styles.cardTitle}>Third-party components</div>
        <p className={styles.muted} style={{ marginTop: 8, lineHeight: 1.5 }}>
          Sky visualization is powered by Aladin Lite by CDS.
        </p>
        <ul className={styles.muted} style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>
            Aladin Lite: {" "}
            <a href="https://aladin.cds.unistra.fr/AladinLite/" target="_blank" rel="noreferrer">
              aladin.cds.unistra.fr/AladinLite
            </a>
          </li>
        </ul>
      </div>

      <p className={styles.muted} style={{ marginTop: 16 }}>
        Want to report issues? For LVDB data/content issues, please use the upstream LVDB channels.
        For web UI issues specific to this fork, use this fork&apos;s issue tracker.
      </p>
    </div>
  );
}
