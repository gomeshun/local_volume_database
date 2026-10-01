export function formatTick(value: number, resolution?: number): string {
  if (!Number.isFinite(value)) return "";
  const absolute = Math.abs(value);
  if (absolute >= 10_000 || (absolute > 0 && absolute < 0.001)) {
    return value.toExponential(1);
  }
  const digits =
    resolution && resolution > 0
      ? Math.min(
          6,
          Math.max(0, Math.ceil(-Math.log10(resolution)) + 1),
        )
      : absolute >= 100
        ? 0
        : absolute >= 10
          ? 1
          : absolute >= 1
            ? 2
            : 3;
  const fixed = value.toFixed(digits);
  // Trailing zeros are insignificant only after a decimal point: integer
  // labels such as -320, 100, and 0 must retain every digit.
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}
