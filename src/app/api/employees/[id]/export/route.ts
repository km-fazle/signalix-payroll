import { formatWeek } from "@/lib/dates";
import { hourArgs, readHourFilter } from "@/lib/employee-hours";
import { toCsv } from "@/lib/csv";
import { requireUser } from "@/lib/http";
import { formatHours, formatStoredAmount } from "@/lib/money";
import { hoursPdf } from "@/lib/pdf-report";
import type { EmployeeRecord } from "@/lib/types";

type PaymentRow = {
  transaction_date: string;
  period_start: string;
  period_end: string;
  hours: string | number | null;
  amount: string | number;
  confirmation_number: string | null;
  description: string;
  status: string;
  counts_toward_totals: boolean;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const filter = readHourFilter(url);
  if ("error" in filter) return Response.json({ error: filter.error }, { status: 400 });

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, employee_code, full_name, role_title, phone, email, notes, active")
    .eq("id", id)
    .maybeSingle();
  if (employeeError) return Response.json({ error: employeeError.message }, { status: 400 });
  if (!employee) return Response.json({ error: "Employee not found." }, { status: 404 });
  const person = employee as EmployeeRecord;

  const args = hourArgs(id, filter);
  const [payments, totals, notes, company] = await Promise.all([
    supabase.rpc("employee_payment_rows", args),
    supabase.rpc("employee_payment_totals", args),
    supabase.from("employee_notes").select("body, created_at").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("companies").select("name").limit(1).maybeSingle(),
  ]);
  if (payments.error) return Response.json({ error: payments.error.message }, { status: 400 });
  if (totals.error) return Response.json({ error: totals.error.message }, { status: 400 });
  if (notes.error) return Response.json({ error: notes.error.message }, { status: 400 });

  const rows = (payments.data ?? []) as PaymentRow[];
  const totalRow = (totals.data?.[0] ?? null) as {
    total_amount: string | number;
    recorded_hours: string | number | null;
    payment_count: number;
    missing_hours_count: number;
  } | null;
  const totalAmount = formatStoredAmount(totalRow?.total_amount ?? 0) ?? "0.00";
  const totalHours = totalRow?.recorded_hours == null ? "" : formatStoredAmount(totalRow.recorded_hours) ?? "";
  const companyName = (company.data as { name: string } | null)?.name ?? "Company";
  const fileBase = `${person.employee_code}-hours`;

  if (format === "csv") {
    const table = [
      ["company", companyName],
      ["employee_code", person.employee_code],
      ["employee_name", person.full_name],
      ["role", person.role_title ?? ""],
      ["filter_status", filter.status],
      ["filter_week", filter.period ?? ""],
      ["total_payments", totalAmount],
      ["recorded_hours", totalHours],
      ["payment_count", String(totalRow?.payment_count ?? 0)],
      ["payments_missing_hours", String(totalRow?.missing_hours_count ?? 0)],
      [],
      ["paid_on", "payroll_week_start", "payroll_week_end", "hours", "amount", "status", "counted", "confirmation", "note"],
      ...rows.map((row) => [
        row.transaction_date,
        row.period_start,
        row.period_end,
        row.hours == null ? "" : formatHours(row.hours) ?? formatStoredAmount(row.hours) ?? "",
        formatStoredAmount(row.amount) ?? "",
        row.status,
        row.counts_toward_totals ? "yes" : "no",
        row.confirmation_number ?? "",
        row.description,
      ]),
    ];
    return new Response(toCsv(table), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const lines = [
    { text: companyName },
    { text: `${person.full_name}  ${person.employee_code}` , bold: true },
    { text: [person.role_title, person.phone, person.email].filter(Boolean).join("  ") || "No contact details" },
    { text: `Filter: ${filter.status.replaceAll("_", " ")}. ${filter.period ? formatWeek(filter.period, addDaysSafe(filter.period)) : "All weeks."}` },
    { text: `Paid ${totalAmount}. Hours ${totalHours || "none recorded"}. ${totalRow?.payment_count ?? 0} payments.` , bold: true },
    { text: " " },
    { text: "Paid on     Week                    Hours    Amount     Status", bold: true },
    ...rows.map((row) => ({
      text: [
        row.transaction_date,
        formatWeek(row.period_start, row.period_end),
        (row.hours == null ? "-" : formatHours(row.hours) ?? "-").padEnd(8, " "),
        `$${formatStoredAmount(row.amount) ?? ""}`,
        row.counts_toward_totals ? row.status : "excluded",
      ].join("  "),
    })),
    { text: " " },
    { text: "Notes", bold: true },
    ...(person.notes ? [{ text: person.notes }] : []),
    ...((notes.data ?? []) as Array<{ body: string; created_at: string }>).map((note) => ({
      text: `${note.created_at.slice(0, 10)}  ${note.body}`,
    })),
  ];
  if (!person.notes && (notes.data ?? []).length === 0) lines.push({ text: "No notes." });

  const pdf = await hoursPdf(`${person.full_name} paid hours`, lines);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

function addDaysSafe(start: string) {
  const [year, month, day] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 6));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
