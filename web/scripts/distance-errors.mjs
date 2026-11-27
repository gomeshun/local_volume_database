/** Fill missing Explorer distance errors from the same row's measured modulus.
 * The catalogue CSV is untouched. Preserve valid upstream kpc uncertainties.
 */
export function fillDistanceErrors(row) {
  const number = (value) => value?.trim() ? Number(value) : NaN;
  const mu = number(row.distance_modulus);
  const distance = number(row.distance);
  const expectedDistance = 10 ** (mu / 5 - 2);
  // The input stores distance to 0.01 kpc. Do not mix a modulus with
  // a different adopted distance, including an unrelated host distance.
  if (!(distance > 0) || !Number.isFinite(expectedDistance) ||
      Math.abs(distance - expectedDistance) > 0.005001) return row;

  const result = { ...row };
  for (const [side, sign] of [["em", -1], ["ep", 1]]) {
    const key = `distance_${side}`;
    if (!(key in row) || (row[key].trim() && number(row[key]) !== 0)) continue;
    const error = number(row[`distance_modulus_${side}`]);
    if (!(error > 0) || !Number.isFinite(error)) continue;
    const converted = sign * expectedDistance * Math.expm1(sign * error * Math.LN10 / 5);
    if (Number.isFinite(converted)) result[key] = converted.toFixed(2);
  }
  return result;
}
