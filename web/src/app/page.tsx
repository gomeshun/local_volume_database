import Link from "next/link";
import { datasets } from "@/generated/datasets";
import styles from "./site.module.css";

export default function Home() {
  return (
    <div>
      <h1 style={{ fontSize: 24, letterSpacing: "-0.02em" }}>Datasets</h1>
      <p className={styles.muted} style={{ marginTop: 8 }}>
        Initial milestone: show LVDB tables as-is, then visualize with Aladin Lite.
      </p>

      <div className={styles.grid}>
        {datasets.map((d) => (
          <div key={d.slug} className={styles.card}>
            <div className={styles.cardTitle}>{d.title}</div>
            <div className={styles.muted}>
              Showing {d.rows.length.toLocaleString()} rows (source total: {d.totalRows.toLocaleString()})
            </div>
            <div style={{ marginTop: 10 }}>
              <Link href={`/datasets/${d.slug}`} className={styles.button}>
                Open
              </Link>
            </div>
          </div>
        ))}
      </div>

      <p className={styles.muted} style={{ marginTop: 16 }}>
        Note: for now we generate a limited number of rows at build time to keep the initial app light.
      </p>
    </div>
  );
}
