import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import styles from "./site.module.css";
import { siteConfig } from "./siteConfig";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LVDB Explorer",
  description: "A lightweight viewer for the Local Volume Database (LVDB)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.css"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <div className={styles.layout}>
          <header className={styles.header}>
            <div className={styles.headerInner}>
              <div className={styles.brand}>
                <Link href="/" className={styles.brandTitle}>
                  LVDB Explorer
                </Link>
                <div className={styles.brandSub}>Local Volume Database quick viewer</div>
              </div>
              <div className={styles.headerRight}>
                <nav className={styles.nav}>
                  <Link href="/" className={styles.navLink}>
                    Datasets
                  </Link>
                  <Link href="/about" className={styles.navLink}>
                    About
                  </Link>
                </nav>
                <div className={styles.pill} title="This web UI is an unofficial fork and is not affiliated with the upstream LVDB project.">
                  Unofficial fork
                </div>
              </div>
            </div>
          </header>
          <main className={styles.main}>{children}</main>
          <footer className={styles.footer}>
            <div className={styles.footerInner}>
              <div className={styles.muted}>
                Built from LVDB (Local Volume Database). Not affiliated with upstream.
              </div>
              <div className={styles.footerLinks}>
                {siteConfig.forkSiteUrl && (
                  <a className={styles.navLink} href={siteConfig.forkSiteUrl} target="_blank" rel="noreferrer">
                    This site
                  </a>
                )}
                {siteConfig.forkRepoUrl && (
                  <a className={styles.navLink} href={siteConfig.forkRepoUrl} target="_blank" rel="noreferrer">
                    Fork repo
                  </a>
                )}
                <a className={styles.navLink} href="https://github.com/apace7/local_volume_database" target="_blank" rel="noreferrer">
                  Upstream repo
                </a>
                <a className={styles.navLink} href="https://arxiv.org/abs/2411.07424" target="_blank" rel="noreferrer">
                  Paper (arXiv)
                </a>
                <a className={styles.navLink} href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">
                  License (CC0 1.0)
                </a>
                <Link className={styles.navLink} href="/about">
                  Credits
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
