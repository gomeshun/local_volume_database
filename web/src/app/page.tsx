import Link from "next/link";
import { datasets } from "@/generated/datasets";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Datasets</h1>
      <p className="text-sm text-muted-foreground">
        Initial milestone: show LVDB tables as-is, then visualize with Aladin Lite.
      </p>
      <p className="text-sm text-muted-foreground">
        This is an unofficial fork. See <Link href="/about">About / Credits</Link>.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {datasets.map((d) => (
          <Card key={d.slug}>
            <CardHeader>
              <CardTitle>{d.title}</CardTitle>
              <CardDescription>
                Showing {d.rows.length.toLocaleString()} rows (source total: {d.totalRows.toLocaleString()})
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
        Note: for now we generate a limited number of rows at build time to keep the initial app light.
      </p>
    </div>
  );
}
