"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KinematicObjectSummary } from "@/generated/kinematics_summary";

export default function ObjectsTable({
  objects,
}: {
  objects: KinematicObjectSummary[];
}) {
  const [query, setQuery] = useState("");
  const [host, setHost] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [sort, setSort] = useState("name");

  const hosts = useMemo(
    () => Array.from(new Set(objects.map((object) => object.host).filter(Boolean))).sort(),
    [objects],
  );

  const filteredObjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return objects
      .filter((object) => {
        if (host !== "all" && object.host !== host) return false;
        if (coverage === "with" && object.totalRecords === 0) return false;
        if (coverage === "without" && object.totalRecords > 0) return false;
        if (!normalizedQuery) return true;
        return `${object.name} ${object.key}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (sort === "records") return right.totalRecords - left.totalRecords;
        return left.name.localeCompare(right.name);
      });
  }, [coverage, host, objects, query, sort]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-72"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search object name or key…"
          aria-label="Search objects"
        />
        <Select value={host} onValueChange={setHost}>
          <SelectTrigger className="h-9 w-36" aria-label="Filter by host">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All hosts</SelectItem>
            {hosts.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={coverage} onValueChange={setCoverage}>
          <SelectTrigger className="h-9 w-44" aria-label="Filter by data coverage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All coverage</SelectItem>
            <SelectItem value="with">With records</SelectItem>
            <SelectItem value="without">Not yet covered</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-44" aria-label="Sort objects">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort by name</SelectItem>
            <SelectItem value="records">Sort by records</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filteredObjects.length.toLocaleString()} objects
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border">
        <Table wrapperClassName="max-h-[calc(100vh-300px)]">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-[1] bg-background/90 backdrop-blur">Object</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/90 backdrop-blur">Host</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/90 backdrop-blur">Records</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/90 backdrop-blur">Spectroscopy</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/90 backdrop-blur">Proper motion</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/90 backdrop-blur">Gaia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredObjects.map((object) => (
              <TableRow key={object.key}>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/objects/${encodeURIComponent(object.key)}`}>{object.name}</Link>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{object.key}</span>
                </TableCell>
                <TableCell>{object.host || "—"}</TableCell>
                <TableCell>
                  {object.totalRecords > 0 ? object.totalRecords.toLocaleString() : "Not covered"}
                </TableCell>
                <TableCell>{object.spectroscopyRecords.toLocaleString()}</TableCell>
                <TableCell>{object.properMotionRecords.toLocaleString()}</TableCell>
                <TableCell>{object.gaiaRecords.toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {filteredObjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  No objects match the current filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
