export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function formatMoneyAmount(value: number | string) {
  const raw = typeof value === "number" ? value.toFixed(2) : value;
  return raw;
}
