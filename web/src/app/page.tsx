import Link from "next/link";
import { datasets } from "@/generated/datasets_summary";
import { kinematicObjectSummaries } from "@/generated/kinematics_summary";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const coveredObjects = kinematicObjectSummaries.filter(
    (object) => object.totalRecords > 0,
  );
  const kinematicRecords = coveredObjects.reduce(
    (total, object) => total + object.totalRecords,
    0,
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">LVDB Explorer</h1>
      <p className="text-sm text-muted-foreground">
        Browse LVDB tables, inspect sky positions, and follow references to ADS, VizieR, and SIMBAD.
      </p>
      <p className="text-sm text-muted-foreground">
        This is an unofficial fork. See <Link href="/about">About / Credits</Link>.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Member kinematics</CardTitle>
          <CardDescription>
            {kinematicRecords.toLocaleString()} normalized records across{" "}
            {coveredObjects.length.toLocaleString()} covered Milky Way objects, with source-level
            provenance and linked diagnostics.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href="/objects">Explore kinematics</Link>
          </Button>
        </CardFooter>
      </Card>

      <h2 className="pt-2 text-xl font-semibold tracking-tight">Datasets</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {datasets.map((d) => (
          <Card key={d.slug}>
            <CardHeader>
              <CardTitle>{d.title}</CardTitle>
              <CardDescription>
                {d.totalRows.toLocaleString()} records
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-end">
              <Button asChild variant="outline" size="sm">
                <Link href={`/datasets/${d.slug}`}>Open</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Table data is loaded only after opening a dataset, keeping this index lightweight.
      </p>
    </div>
  );
}
