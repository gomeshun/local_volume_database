import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ObjectKinematicsClient from "./ObjectKinematicsClient";
import {
  kinematicObjectByKey,
  kinematicObjectSummaries,
} from "@/generated/kinematics_summary";

export const dynamicParams = false;

export function generateStaticParams() {
  return kinematicObjectSummaries.map((object) => ({ key: object.key }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const object = kinematicObjectByKey[key];
  return {
    title: object
      ? `${object.name} member kinematics | LVDB Explorer`
      : "Member kinematics | LVDB Explorer",
  };
}

export default async function ObjectPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const object = kinematicObjectByKey[key];
  if (!object) notFound();
  return <ObjectKinematicsClient object={object} />;
}
