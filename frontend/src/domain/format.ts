const SIGNIFICANT_DIGITS = 12;

export function formatResult(n: number): string {
  return String(Number(n.toPrecision(SIGNIFICANT_DIGITS)));
}
