import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import styles from "./site.module.css";

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
              <div className={styles.muted}>Static export (GitHub Pages)</div>
            </div>
          </header>
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}
