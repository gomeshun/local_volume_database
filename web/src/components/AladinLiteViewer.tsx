"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/site.module.css";

export function AladinLiteViewer({
  ra,
  dec,
  title,
}: {
  ra: number;
  dec: number;
  title?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<any>(null);
  const catalogRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const target = useMemo(() => `${ra} ${dec}`, [ra, dec]);

  useEffect(() => {
    if (!loaded) return;
    if (!containerRef.current) return;
    if (!window.A) return;

    let cancelled = false;

    const waitWithTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      let timeoutId: number | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error("Aladin init timeout")), ms);
          }),
        ]);
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
    };

    const ensureAladin = async () => {
      const A = window.A;

      // Aladin Lite v3 initializes WASM asynchronously; its own examples use:
      //   A.init.then(() => A.aladin(...))
      const initThenable = A?.init && typeof A.init.then === "function" ? (A.init as Promise<unknown>) : null;
      if (initThenable) {
        await waitWithTimeout(initThenable, 15_000);
      }
      if (cancelled) return;

      if (!aladinRef.current) {
        aladinRef.current = A.aladin(containerRef.current, {
          survey: "P/DSS2/color",
          fov: 1,
          target,
          showReticle: true,
        });

        catalogRef.current = A.catalog({ name: "LVDB", sourceSize: 8, color: "#ff3b30" });
        aladinRef.current.addCatalog(catalogRef.current);
      }

      try {
        aladinRef.current.gotoObject(target);
      } catch {
        aladinRef.current.gotoRaDec(ra, dec);
      }

      if (catalogRef.current) {
        catalogRef.current.removeAll();
        const src = A.source(ra, dec, { popupTitle: title ?? target });
        catalogRef.current.addSources([src]);
      }

      setInitError(null);
    };

    ensureAladin().catch((err) => {
      if (cancelled) return;
      const msg = err instanceof Error ? err.message : String(err);
      setInitError(msg);
      // Keep the console useful for debugging; Aladin itself logs additional context.
      console.error("Aladin Lite init failed:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [dec, loaded, ra, target, title]);

  return (
    <div>
      <Script
        src="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <div className={styles.aladin} ref={containerRef} />
      {!loaded && (
        <div className={styles.muted} style={{ marginTop: 8 }}>
          Loading Aladin Lite…
        </div>
      )}
      {loaded && initError && (
        <div className={styles.muted} style={{ marginTop: 8 }}>
          Aladin Lite failed to initialize: {initError}
        </div>
      )}
    </div>
  );
}
