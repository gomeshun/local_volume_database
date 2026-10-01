"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function CopyViewLink() {
  const [status, setStatus] = useState("");
  const [manualLink, setManualLink] = useState("");
  return <div className="flex max-w-full flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={async () => {
    try { await navigator.clipboard.writeText(window.location.href); setStatus("View link copied"); setManualLink(""); }
    catch { setManualLink(window.location.href); setStatus("Copy the link below"); }
  }}>Copy view link</Button><span role="status" className="text-xs text-muted-foreground">{status}</span>{manualLink ? <input aria-label="View link" className="w-full rounded border p-2 text-xs" readOnly value={manualLink} onFocus={(event) => event.target.select()} /> : null}</div>;
}
