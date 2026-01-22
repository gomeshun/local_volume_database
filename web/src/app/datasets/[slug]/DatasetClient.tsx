"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "@/app/site.module.css";
import type { Dataset } from "@/generated/datasets";
import { DatasetTable } from "@/components/DatasetTable";
import { AladinLiteViewer } from "@/components/AladinLiteViewer";

export default function DatasetClient({ dataset }: { dataset: Dataset }) {
  const [selected, setSelected] = useState(dataset.rows[0] ?? null);

  const coords = useMemo(() => {
    if (!selected) return null;
    const ra = Number(selected.ra);
    const dec = Number(selected.dec);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
    return { ra, dec };
  }, [selected]);

  return (
    <div>
      <div className={styles.muted} style={{ marginBottom: 12 }}>
        <Link href="/">← Back</Link>
      </div>

      <h1 style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{dataset.title}</h1>
      <div className={styles.muted} style={{ marginTop: 6 }}>
        Parsed rows: {dataset.rows.length.toLocaleString()} (source total: {dataset.totalRows.toLocaleString()})
      </div>

      <div className={styles.split} style={{ marginTop: 16 }}>
        <div>
          <DatasetTable columns={dataset.columns} rows={dataset.rows} onSelect={setSelected} />
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Sky view (Aladin Lite)</div>
          {coords ? (
            <>
              <div className={styles.muted} style={{ marginBottom: 10 }}>
                {selected?.name ?? selected?.key ?? "(selected)"} @ RA={coords.ra}, Dec={coords.dec}
              </div>
              <AladinLiteViewer
                ra={coords.ra}
                dec={coords.dec}
                title={selected?.name ?? selected?.key ?? undefined}
              />
            </>
          ) : (
            <div className={styles.muted}>
              Select a row with valid `ra`/`dec` to show it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
