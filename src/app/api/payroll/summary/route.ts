import { isIsoDate, payrollWeek, todayInTimeZone } from "@/lib/dates";
import { requireUser } from "@/lib/http";
import { formatStoredAmount } from "@/lib/money";
import type { SummaryRow } from "@/lib/types";

type TotalRow = {
  total_amount: string | number;
  payment_count: number;
  recorded_hours: string | number | null;
  awaiting_count: number;
  entered_count: number;
  missing_hours_count: number;
};

export async function GET(request: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse || !user) return errorResponse;

  const url = new URL(request.url);
  const granularity = url.searchParams.get("granularity") === "month" ? "month" : "week";
  const { data: profile } = await supabase.from("profiles").select("companies(timezone)").eq("id", user.id).single();
  const company = profile?.companies as { timezone: string } | { timezone: string }[] | null;
  const timezone = (Array.isArray(company) ? company[0]?.timezone : company?.timezone) || "America/Chicago";
  const current = payrollWeek(todayInTimeZone(timezone));
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const rangeFrom = from && isIsoDate(from) ? from : current.start;
  const rangeTo = to && isIsoDate(to) ? to : current.end;

  const summaryName = granularity === "month" ? "payroll_month_summary" : "payroll_week_summary";
  const totalName = granularity === "month" ? "payroll_month_totals" : "payroll_totals";
  const [{ data, error }, { data: totals, error: totalError }] = await Promise.all([
    supabase.rpc(summaryName, { p_from: rangeFrom, p_to: rangeTo }),
    supabase.rpc(totalName, { p_from: rangeFrom, p_to: rangeTo }),
  ]);
  if (error || totalError) return Response.json({ error: error?.message || totalError?.message }, { status: 400 });

  const total = ((totals ?? [])[0] ?? null) as TotalRow | null;
  const rows: SummaryRow[] = (data ?? []).map((row: SummaryRow & { total_amount: string | number; recorded_hours: string | number | null }) => ({
    ...row,
    total_amount: formatStoredAmount(row.total_amount) ?? "0.00",
    recorded_hours: row.recorded_hours == null ? null : formatStoredAmount(row.recorded_hours),
    payment_count: Number(row.payment_count),
    payments_missing_hours: Number(row.payments_missing_hours),
    entered_count: Number(row.entered_count),
    awaiting_count: Number(row.awaiting_count),
  }));

  return Response.json({
    granularity,
    from: rangeFrom,
    to: rangeTo,
    rows,
    totals: {
      total_amount: formatStoredAmount(total?.total_amount ?? 0) ?? "0.00",
      payment_count: Number(total?.payment_count ?? 0),
      recorded_hours: total?.recorded_hours == null ? null : formatStoredAmount(total.recorded_hours),
      awaiting_count: Number(total?.awaiting_count ?? 0),
      entered_count: Number(total?.entered_count ?? 0),
      missing_hours_count: Number(total?.missing_hours_count ?? 0),
    },
  });
}
