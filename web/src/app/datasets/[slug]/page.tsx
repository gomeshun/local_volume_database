import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DatasetClient from "./DatasetClient";
import { datasetBySlug, datasets } from "@/generated/datasets";

export const dynamicParams = false;

export function generateStaticParams() {
  return datasets.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ds = datasetBySlug[slug];
  return {
    title: ds ? `${ds.title} | LVDB Explorer` : "Dataset | LVDB Explorer",
  };
}

export default async function DatasetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dataset = datasetBySlug[slug];
  if (!dataset) notFound();

  return <DatasetClient dataset={dataset} />;
}
