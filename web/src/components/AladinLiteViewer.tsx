"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/site.module.css";

export function AladinLiteViewer({
  sources,
  initialTarget,
  selectedId,
  onToggleSelectId,
}: {
  sources: Array<{ id: string; ra: number; dec: number; title?: string }>;
  initialTarget: string;
  selectedId: string | null;
  onToggleSelectId?: (rowId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<any>(null);
  const catalogRef = useRef<any>(null);
  const sourceByIdRef = useRef<Map<string, any>>(new Map());
  const selectedSourceRef = useRef<any>(null);
  const onToggleSelectIdRef = useRef<typeof onToggleSelectId>(onToggleSelectId);
  const [loaded, setLoaded] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const sourcesKey = useMemo(() => {
    // cheap-ish change detector
    return `${sources.length}:${sources[0]?.id ?? ""}:${sources[sources.length - 1]?.id ?? ""}`;
  }, [sources]);

  useEffect(() => {
    onToggleSelectIdRef.current = onToggleSelectId;
  }, [onToggleSelectId]);

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
          fov: 180,
          target: initialTarget,
          showReticle: true,
        });

        catalogRef.current = A.catalog({ name: "LVDB", sourceSize: 8, color: "#ff3b30" });
        aladinRef.current.addCatalog(catalogRef.current);

        aladinRef.current.on("objectClicked", (obj: any) => {
          if (!obj) return;
          const catalog = typeof obj.getCatalog === "function" ? obj.getCatalog() : null;
          if (!catalog || catalog.name !== "LVDB") return;
          const rowId = obj?.data?.id;
          if (typeof rowId !== "string" || rowId.length === 0) return;
          onToggleSelectIdRef.current?.(rowId);
        });

        setViewerReady(true);
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
  }, [initialTarget, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (!viewerReady) return;
    if (!window.A) return;
    if (!aladinRef.current) return;
    if (!catalogRef.current) return;

    const A = window.A;

    catalogRef.current.removeAll();
    sourceByIdRef.current = new Map();

    // Add all sources
    const srcs: any[] = [];
    for (const s of sources) {
      if (!Number.isFinite(s.ra) || !Number.isFinite(s.dec)) continue;
      const src = A.source(s.ra, s.dec, { id: s.id, title: s.title ?? "" });
      srcs.push(src);
      sourceByIdRef.current.set(s.id, src);
    }
    catalogRef.current.addSources(srcs);
  }, [loaded, viewerReady, sources, sourcesKey]);

  useEffect(() => {
    if (!loaded) return;
    if (!viewerReady) return;
    if (!aladinRef.current) return;

    // Clear previous highlight
    if (selectedSourceRef.current && typeof selectedSourceRef.current.deselect === "function") {
      selectedSourceRef.current.deselect();
    }
    selectedSourceRef.current = null;

    if (!selectedId) return;
    const src = sourceByIdRef.current.get(selectedId);
    if (!src) return;

    if (typeof src.select === "function") src.select();
    selectedSourceRef.current = src;

    try {
      aladinRef.current.gotoRaDec(src.ra, src.dec);
    } catch {
      // ignore
    }
  }, [loaded, viewerReady, selectedId]);

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
