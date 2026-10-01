"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SCIENCE_GROUPS, scienceGroup, presetColumns } from "@/lib/columnGroups";

export function ColumnPicker({ columns, visible, onChange, defaults, identity, label = (column) => column }: {
  columns: string[]; visible: string[]; onChange: (columns: string[]) => void; defaults: string[]; identity: string; label?: (column: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matching = columns.filter((column) => `${column} ${label(column)} ${scienceGroup(column)}`.toLowerCase().includes(query.toLowerCase()));
  const select = (next: string[]) => onChange(columns.filter((column) => column === identity || next.includes(column)));
  return <div className="relative" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>Columns ({visible.length})</Button>
    {open ? <div className="fixed inset-x-4 top-[12vh] z-30 mx-auto max-w-lg rounded-lg border bg-background p-3 shadow-lg" role="region" aria-label="Column chooser">
      <div className="mb-2 flex items-center justify-between gap-2"><span className="font-medium">Visible columns</span><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button></div>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search columns" placeholder="Search values, errors or references…" />
      <div className="my-2 flex flex-wrap gap-1">{["Basic", "Spectroscopy", "Proper motion", "All"].map((preset) => <Button key={preset} variant="outline" size="sm" onClick={() => select(presetColumns(columns, preset, defaults))}>{preset}</Button>)}</div>
      <p className="mb-2 text-xs text-muted-foreground">Science presets include matching values, uncertainties and references. The identity column stays visible.</p>
      <div className="max-h-[45vh] overflow-y-auto">
        {SCIENCE_GROUPS.map((group) => {
          const groupColumns = matching.filter((column) => scienceGroup(column) === group);
          if (!groupColumns.length) return null;
          return <fieldset className="mb-3 border-t pt-2" key={group}><legend className="px-1 text-xs font-semibold">{group}</legend>
            <div className="mb-1 flex gap-2"><button type="button" className="text-xs underline" onClick={() => select([...visible, ...groupColumns])}>Show group</button><button type="button" className="text-xs underline" onClick={() => select(visible.filter((column) => !groupColumns.includes(column)))}>Hide group</button></div>
            {groupColumns.map((column) => <label key={column} className="flex cursor-pointer items-start gap-2 py-1 text-xs"><Checkbox checked={visible.includes(column)} disabled={column === identity} onCheckedChange={(checked) => select(checked ? [...visible, column] : visible.filter((item) => item !== column))} /><span className="min-w-0 break-words">{label(column)}</span></label>)}
          </fieldset>;
        })}
        {!matching.length ? <p className="py-3 text-sm text-muted-foreground">No matching columns</p> : null}
      </div>
    </div> : null}
  </div>;
}
