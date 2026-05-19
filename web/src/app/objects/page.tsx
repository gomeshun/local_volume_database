import Link from "next/link";
import { kinematicObjectSummaries } from "@/generated/kinematics_summary";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = {
  title: "Objects | LVDB Explorer",
};

export default function ObjectsPage() {
  const objectsWithRows = kinematicObjectSummaries.filter((object) => object.totalRows > 0);
  const objectsWithoutRows = kinematicObjectSummaries.length - objectsWithRows.length;

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">
        <Link href="/">Datasets</Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Objects</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {objectsWithRows.length.toLocaleString()} objects with member-star products
            {objectsWithoutRows > 0 ? `, ${objectsWithoutRows.toLocaleString()} without generated member rows` : ""}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border">
        <Table wrapperClassName="max-h-[calc(100vh-260px)]">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-[1] bg-background/80 backdrop-blur">Object</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/80 backdrop-blur">Rows</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/80 backdrop-blur">Spectroscopy</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/80 backdrop-blur">Proper Motion</TableHead>
              <TableHead className="sticky top-0 z-[1] bg-background/80 backdrop-blur">Gaia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {objectsWithRows.map((object) => (
              <TableRow key={object.key}>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/objects/${object.key}`}>{object.name}</Link>
                  <span className="ml-2 text-xs text-muted-foreground">{object.key}</span>
                </TableCell>
                <TableCell>{object.totalRows.toLocaleString()}</TableCell>
                <TableCell>{object.spectroscopyRows.toLocaleString()}</TableCell>
                <TableCell>{object.properMotionRows.toLocaleString()}</TableCell>
                <TableCell>{object.gaiaRows.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}