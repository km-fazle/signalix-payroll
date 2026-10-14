import { isIsoDate } from "@/lib/dates";
import { requireUser, rpcFailure } from "@/lib/http";
import { formatStoredAmount } from "@/lib/money";
import type { EmployeeOption, PaymentEvent, PaymentRecord } from "@/lib/types";

type EmployeeEmbed = { full_name: string; employee_code: string } | { full_name: string; employee_code: string }[] | null;

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
  payee_name_raw: string | null;
  status: PaymentRecord["status"];
  counts_toward_totals: boolean;
  duplicate_flag: boolean;
  duplicate_of: string | null;
  period_was_ambiguous: boolean;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  entered_adp_at: string | null;
  screenshot_id: string;
  employee: EmployeeEmbed;
};

function employeeOf(value: EmployeeEmbed): { full_name: string; employee_code: string } {
  const employee = Array.isArray(value) ? value[0] : value;
  return employee ?? { full_name: "Unknown employee", employee_code: "" };
}

function mapPayment(row: PaymentRow, screenshot?: { url: string | null; file_name: string | null }): PaymentRecord {
  return {
    id: row.id,
    employee_id: row.employee_id,
    employee_name: employeeOf(row.employee).full_name,
    employee_code: employeeOf(row.employee).employee_code,
    amount: formatStoredAmount(row.amount) ?? "",
    transaction_date: row.transaction_date,
    period_start: row.period_start,
    period_end: row.period_end,
    hours: row.hours == null ? null : formatStoredAmount(row.hours),
    confirmation_number: row.confirmation_number,
    description: row.description,
    payee_name_raw: row.payee_name_raw,
    status: row.status,
    counts_toward_totals: row.counts_toward_totals,
    duplicate_flag: row.duplicate_flag,
    duplicate_of: row.duplicate_of,
    period_was_ambiguous: row.period_was_ambiguous,
    void_reason: row.void_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    entered_adp_at: row.entered_adp_at,
    screenshot_url: screenshot?.url ?? null,
    file_name: screenshot?.file_name ?? null,
  };
}

const PAYMENT_COLUMNS = `
  id, employee_id, amount, transaction_date, period_start, period_end, hours,
  confirmation_number, description, payee_name_raw, status, counts_toward_totals,
  duplicate_flag, duplicate_of, period_was_ambiguous, void_reason, created_at,
  updated_at, entered_adp_at, screenshot_id,
  employee:employees ( full_name, employee_code )
`;

export async function GET(request: Request) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const employeeId = url.searchParams.get("employee_id");
  const periodStart = url.searchParams.get("period_start");
  const status = url.searchParams.get("status");
  const query = (url.searchParams.get("q") ?? "").replace(/[^a-zA-Z0-9 \-]/g, "").trim().slice(0, 80);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 300);

  let requestQuery = supabase.from("payments").select(PAYMENT_COLUMNS).order("transaction_date", { ascending: false }).limit(limit);
  if (id) requestQuery = requestQuery.eq("id", id);
  if (employeeId) requestQuery = requestQuery.eq("employee_id", employeeId);
  if (periodStart && isIsoDate(periodStart)) requestQuery = requestQuery.eq("period_start", periodStart);
  if (status === "confirmed" || status === "entered_adp" || status === "void") requestQuery = requestQuery.eq("status", status);
  if (status === "awaiting_adp") requestQuery = requestQuery.eq("status", "confirmed").eq("counts_toward_totals", true);
  if (status === "duplicate") requestQuery = requestQuery.eq("duplicate_flag", true);
  if (query) {
    const { data: matches } = await supabase.from("employees").select("id").ilike("full_name", `%${query}%`);
    const ids = (matches ?? []).map((employee) => employee.id);
    const pattern = `"%${query}%"`;
    const nameFilter = ids.length ? `,employee_id.in.(${ids.join(",")})` : "";
    requestQuery = requestQuery.or(`confirmation_number.ilike.${pattern},description.ilike.${pattern}${nameFilter}`);
  }

  const [{ data, error }, directory] = await Promise.all([
    requestQuery,
    supabase.from("employees").select("id, full_name, employee_code, active, role_title").order("full_name"),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []) as unknown as PaymentRow[];
  let events: PaymentEvent[] = [];
  const screenshots = new Map<string, { url: string | null; file_name: string | null }>();

  if (id && rows[0]) {
    const [{ data: eventRows }, { data: shot }] = await Promise.all([
      supabase.from("payment_events").select("id, action, before_state, after_state, created_at, actor_id").eq("payment_id", id).order("created_at"),
      supabase.from("payment_screenshots").select("storage_path, file_name").eq("id", rows[0].screenshot_id).maybeSingle(),
    ]);
    if (shot?.storage_path) {
      const signed = await supabase.storage.from("payment-screenshots").createSignedUrl(shot.storage_path, 60 * 30);
      screenshots.set(rows[0].id, { url: signed.data?.signedUrl ?? null, file_name: shot.file_name });
    }
    const actorIds = [...new Set((eventRows ?? []).map((event) => event.actor_id).filter(Boolean))] as string[];
    const { data: actors } = actorIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
      : { data: [] };
    const names = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]));
    events = (eventRows ?? []).map((event) => ({
      id: event.id,
      action: event.action,
      before_state: event.before_state,
      after_state: event.after_state,
      created_at: event.created_at,
      actor_name: event.actor_id ? names.get(event.actor_id) ?? null : null,
    }));
  }

  return Response.json({
    payments: rows.map((row) => mapPayment(row, screenshots.get(row.id))),
    employees: (directory.data ?? []) as EmployeeOption[],
    events,
  });
}

export async function POST(request: Request) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "The payment could not be read." }, { status: 400 });

  const { data, error } = await supabase.rpc("create_reviewed_payment", {
    p_screenshot_id: body.screenshot_id,
    p_employee_id: body.employee_id,
    p_amount: body.amount,
    p_transaction_date: body.transaction_date,
    p_period_start: body.period_start,
    p_period_end: body.period_end,
    p_hours: body.hours || null,
    p_confirmation_number: body.confirmation_number || null,
    p_description: body.description ?? "",
    p_payee_name_raw: body.payee_name_raw || null,
    p_period_ambiguous: Boolean(body.period_ambiguous),
    p_acknowledge_duplicate: Boolean(body.acknowledge_duplicate),
  });
  if (error) return rpcFailure(error);
  return Response.json({ id: data }, { status: 201 });
}
