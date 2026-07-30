import type {
  KinematicsChunk,
  KinematicsSource,
  PublicKinematicsRow,
} from "@/types/kinematics";

export type KinematicsDatasetStyle = {
  id: string;
  label: string;
  color: string;
};

export const KINEMATICS_DATASET_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#c026d3",
  "#65a30d",
  "#4f46e5",
  "#be123c",
];

function datasetId(kind: string, provider: string, name: string): string {
  return [kind, provider, name].join("\u001f");
}

export function sourceDatasetId(
  source: Pick<KinematicsSource, "sourceKind" | "sourceProvider" | "sourceName">,
): string {
  return datasetId(
    source.sourceKind,
    source.sourceProvider,
    source.sourceName,
  );
}

export function chunkDatasetId(
  chunk: Pick<KinematicsChunk, "sourceKind" | "sourceProvider" | "sourceName">,
): string {
  return datasetId(
    chunk.sourceKind,
    chunk.sourceProvider,
    chunk.sourceName,
  );
}

export function rowDatasetId(row: PublicKinematicsRow): string {
  return datasetId(
    row.source_kind ?? "",
    row.source_provider ?? "",
    row.source_name ?? "",
  );
}

export function sourceDatasetLabel(
  source: Pick<KinematicsSource, "sourceProvider" | "sourceName">,
): string {
  return source.sourceName || source.sourceProvider || "Unnamed dataset";
}
