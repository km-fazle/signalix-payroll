const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIso(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIso(date);
}

export function daysBetween(later: string, earlier: string): number {
  const ms = parseIso(later).getTime() - parseIso(earlier).getTime();
  return Math.round(ms / 86_400_000);
}

export function payrollWeek(iso: string): { start: string; end: string } {
  const date = parseIso(iso);
  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const start = formatIso(new Date(date.getTime() + mondayOffset * 86_400_000));
  return { start, end: addDays(start, 6) };
}

export function formatUs(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}

export function formatMedium(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseIso(iso));
}

export function formatWeek(start: string, end: string): string {
  return `${formatUs(start)}–${formatUs(end)}`;
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 0));
  return formatIso(date);
}
