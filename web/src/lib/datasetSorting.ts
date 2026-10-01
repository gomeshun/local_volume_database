type DatasetRow = Record<string, string>;

// Keep identifiers, references, and categorical metadata as text even when a
// particular table happens to contain only numeric-looking values for them.
const TEXT_COLUMN = /^(?:key|name|host|ref(?:_.*)?|.*_type|.*_method)$/;
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const MISSING_NUMBER = /^(?:[+-]?(?:nan|inf(?:inity)?))?$/i;

export function datasetNumber(value: string | undefined): number | undefined {
  const trimmed = (value ?? "").trim();
  if (!DECIMAL_NUMBER.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function datasetColumnOptions(column: string, rows: readonly DatasetRow[]) {
  // Infer once from the entire dataset, never from the current filtered page.
  // Missing/non-finite CSV values do not turn an otherwise numeric column into
  // text. Mixed categorical columns retain TanStack's existing text ordering.
  const numeric =
    !TEXT_COLUMN.test(column) &&
    rows.some((row) => datasetNumber(row[column]) !== undefined) &&
    rows.every((row) => {
      const value = (row[column] ?? "").trim();
      return DECIMAL_NUMBER.test(value) || MISSING_NUMBER.test(value);
    });

  return {
    accessorFn: (data: { row: DatasetRow }) =>
      numeric ? datasetNumber(data.row[column]) : (data.row[column] ?? ""),
    sortingFn: numeric ? ("basic" as const) : ("auto" as const),
    sortUndefined: "last" as const,
    // Preserve the existing ascending -> descending -> unsorted click cycle.
    sortDescFirst: false,
  };
}
