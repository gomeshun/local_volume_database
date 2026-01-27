"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

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

  // Track whether Aladin is currently in fullscreen and toggle a body-level
  // CSS class + dispatch an event so other components can react. Use the
  // official Aladin "AL:fullscreen.toggled" event (no polling fallback).
  useEffect(() => {
    if (!loaded || !viewerReady || !aladinRef.current) {
      // Ensure any leftover class is removed if viewer is not ready.
      if (typeof document !== "undefined" && document.body.classList.contains("aladin-fullscreen")) {
        document.body.classList.remove("aladin-fullscreen");
        window.dispatchEvent(new CustomEvent("aladin-fullscreen-changed", { detail: { isFullscreen: false } }));
      }
      return;
    }

    const al = aladinRef.current;
    const setState = (isFullscreen: boolean) => {
      try {
        if (isFullscreen) document.body.classList.add("aladin-fullscreen");
        else document.body.classList.remove("aladin-fullscreen");
        window.dispatchEvent(new CustomEvent("aladin-fullscreen-changed", { detail: { isFullscreen } }));
      } catch {
        // ignore
      }
    };

    // initialize
    setState(Boolean(al?.isInFullscreen));

    const handler = (evt: Event) => {
      try {
        const ce = evt as CustomEvent<{ fullscreen: boolean }>;
        setState(Boolean(ce?.detail?.fullscreen));
      } catch {
        // ignore
      }
    };

    // Attach official event on the Aladin DOM node
    if (al?.aladinDiv && typeof al.aladinDiv.addEventListener === "function") {
      al.aladinDiv.addEventListener("AL:fullscreen.toggled", handler as EventListener);
    }

    return () => {
      if (al?.aladinDiv && typeof al.aladinDiv.removeEventListener === "function") {
        al.aladinDiv.removeEventListener("AL:fullscreen.toggled", handler as EventListener);
      }
      if (typeof document !== "undefined") {
        document.body.classList.remove("aladin-fullscreen");
      }
      window.dispatchEvent(new CustomEvent("aladin-fullscreen-changed", { detail: { isFullscreen: false } }));
    };
  }, [loaded, viewerReady]);

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

  const reloadButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs text-muted-foreground"
      onClick={() => window.location.reload()}
    >
      Having trouble loading? Reload the page
    </Button>
  );

  return (
    <div>
      <Script
        src="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <div
        className="h-[min(70vh,760px)] min-h-[420px] w-full overflow-hidden rounded-md"
        ref={containerRef}
      />

      {!loaded && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Loading Aladin Lite…</span>
          {reloadButton}
        </div>
      )}

      {loaded && !viewerReady && !initError && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Initializing Aladin Lite…</span>
          {reloadButton}
        </div>
      )}

      {loaded && initError && (
        <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="text-sm font-medium">Aladin Lite failed to initialize</div>
          <div className="text-sm text-muted-foreground">
            Please reload the page and try again. If it still fails, your network may be blocking
            the Aladin CDN.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
            <div className="text-xs text-muted-foreground">Details: {initError}</div>
          </div>
        </div>
      )}
    </div>
  );
}
