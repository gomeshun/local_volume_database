"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

/** Keep versioned view state in a URL parameter without navigation or server dependencies. */
export function useUrlView<T>(key: string, defaults: T, decode: (raw: string | null) => T) {
  const [state, setState] = useState(defaults);
  const [ready, setReady] = useState(false);
  const valueRef = useRef(defaults);
  useEffect(() => {
    const restore = () => {
      const value = decode(new URL(window.location.href).searchParams.get(key));
      valueRef.current = value;
      setState(value);
      setReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [decode, key]);
  const update = useCallback((action: SetStateAction<T>) => {
    const next = typeof action === "function" ? (action as (value: T) => T)(valueRef.current) : action;
    valueRef.current = next;
    setState(next);
    const url = new URL(window.location.href);
    url.searchParams.set(key, JSON.stringify(next));
    window.history.replaceState(window.history.state, "", url);
  }, [key]);
  return [state, update, ready] as const;
}
