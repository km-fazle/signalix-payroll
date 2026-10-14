import { isIsoDate, payrollWeek } from "@/lib/dates";

export const HOUR_STATUSES = ["counted", "awaiting_adp", "entered_adp", "missing_hours", "excluded", "all"] as const;

export type HourStatus = (typeof HOUR_STATUSES)[number];

export type HourFilter = {
  period: string | null;
  status: HourStatus;
  query: string;
};

export function readHourFilter(url: URL): HourFilter | { error: string } {
  const rawPeriod = url.searchParams.get("period") ?? "";
  let period: string | null = null;
  if (rawPeriod) {
    if (!isIsoDate(rawPeriod)) return { error: "Choose a date in the payroll week." };
    period = payrollWeek(rawPeriod).start;
  }
  const rawStatus = url.searchParams.get("status") ?? "counted";
  const status = HOUR_STATUSES.includes(rawStatus as HourStatus) ? (rawStatus as HourStatus) : "counted";
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  return { period, status, query };
}

export function hourArgs(employeeId: string, filter: HourFilter) {
  return {
    p_employee: employeeId,
    p_period: filter.period,
    p_status: filter.status,
    p_query: filter.query || null,
  };
}
