import Link from "next/link";
import ObjectsTable from "./ObjectsTable";
import { kinematicObjectSummaries } from "@/generated/kinematics_summary";

export const metadata = {
  title: "Member kinematics | LVDB Explorer",
};

export default function ObjectsPage() {
  const covered = kinematicObjectSummaries.filter((object) => object.totalRecords > 0);
  const totalRecords = covered.reduce((total, object) => total + object.totalRecords, 0);

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">
        <Link href="/">← Datasets</Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Member kinematics</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        {totalRecords.toLocaleString()} normalized source records across{" "}
        {covered.length.toLocaleString()} covered objects. Records from different providers are not
        guaranteed to represent unique stars.
      </p>
      <ObjectsTable objects={kinematicObjectSummaries} />
    </div>
  );
}
