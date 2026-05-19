import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { siteConfig } from "./siteConfig";
import { Badge } from "@/components/ui/badge";

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
        <div className="min-h-dvh">
          <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto flex max-w-7xl items-baseline justify-between gap-4 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <Link
                  href="/"
                  className="font-mono text-sm font-extrabold uppercase tracking-[0.18em] text-foreground no-underline"
                >
                  LVDB Explorer
                </Link>
                <div className="text-xs text-muted-foreground">Local Volume Database quick viewer</div>
              </div>

              <div className="flex items-baseline gap-3">
                <nav className="flex items-baseline gap-3">
                  <Link href="/" className="text-sm">
                    Datasets
                  </Link>
                  <Link href="/objects" className="text-sm">
                    Objects
                  </Link>
                  <Link href="/about" className="text-sm">
                    About
                  </Link>
                </nav>
                <Badge
                  variant="secondary"
                  className="opacity-90"
                  title="This web UI is an unofficial fork and is not affiliated with the upstream LVDB project."
                >
                  Unofficial fork
                </Badge>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl px-4 py-6">{children}</main>

          <footer className="border-t bg-background/50">
            <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-3">
              <div className="text-sm text-muted-foreground">
                Built from LVDB (Local Volume Database). Not affiliated with upstream.
              </div>

              <div className="flex flex-wrap gap-3">
                {siteConfig.forkSiteUrl && (
                  <a className="text-sm" href={siteConfig.forkSiteUrl} target="_blank" rel="noreferrer">
                    This site
                  </a>
                )}
                {siteConfig.forkRepoUrl && (
                  <a className="text-sm" href={siteConfig.forkRepoUrl} target="_blank" rel="noreferrer">
                    Fork repo
                  </a>
                )}
                <a className="text-sm" href="https://github.com/apace7/local_volume_database" target="_blank" rel="noreferrer">
                  Upstream repo
                </a>
                <a className="text-sm" href="https://arxiv.org/abs/2411.07424" target="_blank" rel="noreferrer">
                  Paper (arXiv)
                </a>
                <a className="text-sm" href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">
                  License (CC0 1.0)
                </a>
                <Link className="text-sm" href="/about">
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
