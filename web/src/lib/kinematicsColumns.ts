import columnDictionary from "@/data/kinematics_columns.json";

export type KinematicsColumnDefinition = {
  column: string;
  label: string;
  dataType: string;
  unit: string;
  description: string;
  notes: string;
};

export const KINEMATICS_COLUMN_DICTIONARY = columnDictionary;

export const KINEMATICS_COLUMN_DEFINITIONS =
  columnDictionary.columns as KinematicsColumnDefinition[];

export const KINEMATICS_COLUMN_DEFINITION_BY_NAME = new Map(
  KINEMATICS_COLUMN_DEFINITIONS.map((definition) => [
    definition.column,
    definition,
  ]),
);

export function getKinematicsColumnDefinition(
  column: string,
): KinematicsColumnDefinition | undefined {
  return KINEMATICS_COLUMN_DEFINITION_BY_NAME.get(column);
}

export function formatKinematicsColumnLabel(column: string): string {
  const definition = getKinematicsColumnDefinition(column);
  if (!definition) return column;
  return definition.unit
    ? `${definition.column} (${definition.unit})`
    : definition.column;
}

export function describeKinematicsColumn(column: string): string {
  const definition = getKinematicsColumnDefinition(column);
  if (!definition) return column;
  const parts = [
    definition.label,
    definition.description,
    definition.notes,
  ].filter(Boolean);
  return parts.join(" ");
}
