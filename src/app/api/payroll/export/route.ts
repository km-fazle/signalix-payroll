import { formatWeek, isIsoDate } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { requireUser } from "@/lib/http";
import { formatStoredAmount } from "@/lib/money";
import type { SummaryRow } from "@/lib/types";

export async function GET(request: Request) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const granularity = url.searchParams.get("granularity") === "month" ? "month" : "week";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to)) {
    return Response.json({ error: "Choose a start and end date for the export." }, { status: 400 });
  }

  const summaryName = granularity === "month" ? "payroll_month_summary" : "payroll_week_summary";
  const { data, error } = await supabase.rpc(summaryName, { p_from: from, p_to: to });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []) as Array<SummaryRow & { total_amount: string | number; recorded_hours: string | number | null }>;
  const header = [
    "employee_code",
    "employee_name",
    "pay_period_start",
    "pay_period_end",
    "total_payments",
    "recorded_hours",
    "payment_count",
    "payments_missing_hours",
    "adp_entry",
    "hours_note",
  ];
  const body = rows.map((row) => {
    const amount = formatStoredAmount(row.total_amount);
    const hours = row.recorded_hours == null ? "" : formatStoredAmount(row.recorded_hours) ?? "";
    const adp =
      row.entered_count === row.payment_count ? "entered" : row.entered_count === 0 ? "not_entered" : "partial";
    const hoursNote =
      Number(row.payments_missing_hours) > 0
        ? `Hours were not recorded on ${row.payments_missing_hours} of ${row.payment_count} payments`
        : "";
    return [
      row.employee_code,
      row.employee_name,
      row.period_start,
      row.period_end,
      amount ?? "",
      hours,
      row.payment_count,
      row.payments_missing_hours,
      adp,
      hoursNote,
    ];
  });

  const csv = toCsv([
    ["Signalix payroll reconciliation"],
    ["This is a reconciliation report, not an ADP import file."],
    [`Range ${formatWeek(from, to)} grouped by ${granularity === "month" ? "the month of the payroll week's Sunday" : "Monday–Sunday payroll week"}`],
    [],
    header,
    ...body,
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="signalix-payroll-${from}-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
