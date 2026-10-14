import { hourArgs, readHourFilter } from "@/lib/employee-hours";
import { requireUser, rpcFailure } from "@/lib/http";
import { formatHours, formatStoredAmount } from "@/lib/money";
import type { EmployeeNote, EmployeeRecord, HourTotals, PaymentRecord } from "@/lib/types";

type PaymentRow = {
  id: string;
  employee_id: string;
  amount: string | number;
  transaction_date: string;
  period_start: string;
  period_end: string;
  hours: string | number | null;
  confirmation_number: string | null;
  description: string;
  status: PaymentRecord["status"];
  counts_toward_totals: boolean;
  duplicate_flag: boolean;
};

function mapPayment(row: PaymentRow, employee: EmployeeRecord): PaymentRecord {
  return {
    id: row.id,
    employee_id: row.employee_id,
    employee_name: employee.full_name,
    employee_code: employee.employee_code,
    amount: formatStoredAmount(row.amount) ?? "",
    transaction_date: row.transaction_date,
    period_start: row.period_start,
    period_end: row.period_end,
    hours: row.hours == null ? null : formatHours(row.hours) ?? formatStoredAmount(row.hours),
    confirmation_number: row.confirmation_number,
    description: row.description,
    payee_name_raw: null,
    status: row.status,
    counts_toward_totals: row.counts_toward_totals,
    duplicate_flag: row.duplicate_flag,
    duplicate_of: null,
    period_was_ambiguous: false,
    void_reason: null,
    created_at: "",
    updated_at: "",
    entered_adp_at: null,
    screenshot_url: null,
    file_name: null,
  };
}

async function loadEmployee(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], id: string) {
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_code, full_name, role_title, phone, email, notes, active")
    .eq("id", id)
    .maybeSingle();
  if (error) return { employee: null, error: error.message };
  return { employee: data as EmployeeRecord | null, error: null };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const filter = readHourFilter(new URL(request.url));
  if ("error" in filter) return Response.json({ error: filter.error }, { status: 400 });

  const { employee, error } = await loadEmployee(supabase, id);
  if (error) return Response.json({ error }, { status: 400 });
  if (!employee) return Response.json({ error: "Employee not found." }, { status: 404 });

  const args = hourArgs(id, filter);
  const [payments, totals, notes] = await Promise.all([
    supabase.rpc("employee_payment_rows", args),
    supabase.rpc("employee_payment_totals", args),
    supabase.from("employee_notes").select("id, body, created_at").eq("employee_id", id).order("created_at", { ascending: false }),
  ]);
  if (payments.error) return Response.json({ error: payments.error.message }, { status: 400 });
  if (totals.error) return Response.json({ error: totals.error.message }, { status: 400 });
  if (notes.error) return Response.json({ error: notes.error.message }, { status: 400 });

  const totalRow = (totals.data?.[0] ?? null) as {
    total_amount: string | number;
    recorded_hours: string | number | null;
    payment_count: number;
    missing_hours_count: number;
  } | null;
  const hourTotals: HourTotals = {
    total_amount: formatStoredAmount(totalRow?.total_amount ?? 0) ?? "0.00",
    recorded_hours: totalRow?.recorded_hours == null ? null : formatStoredAmount(totalRow.recorded_hours),
    payment_count: totalRow?.payment_count ?? 0,
    missing_hours_count: totalRow?.missing_hours_count ?? 0,
  };

  return Response.json({
    employee,
    filter,
    totals: hourTotals,
    payments: ((payments.data ?? []) as PaymentRow[]).map((row) => mapPayment(row, employee)),
    notes: (notes.data ?? []) as EmployeeNote[],
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Enter the employee details." }, { status: 400 });
  const { data, error } = await supabase.rpc("update_employee", {
    p_id: id,
    p_code: body.employee_code ?? "",
    p_name: body.full_name ?? "",
    p_role: body.role_title ?? "",
    p_phone: body.phone ?? "",
    p_email: body.email ?? "",
    p_notes: body.notes ?? "",
    p_active: body.active !== false,
  });
  if (error) return rpcFailure(error);
  return Response.json({ id: data });
}
