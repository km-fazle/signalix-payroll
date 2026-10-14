import { requireUser, rpcFailure } from "@/lib/http";
import type { EmployeeRecord } from "@/lib/types";

const COLUMNS = "id, employee_code, full_name, role_title, phone, email, notes, active";

export async function GET(request: Request) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  let builder = supabase.from("employees").select(COLUMNS).order("full_name");
  if (query) {
    const safe = query.replace(/[%_,.()]/g, "").slice(0, 80);
    builder = builder.or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`);
  }
  const { data, error } = await builder;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ employees: (data ?? []) as EmployeeRecord[] });
}

export async function POST(request: Request) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Enter the employee details." }, { status: 400 });
  const { data, error } = await supabase.rpc("create_employee", {
    p_code: body.employee_code ?? "",
    p_name: body.full_name ?? "",
    p_role: body.role_title ?? "",
    p_phone: body.phone ?? "",
    p_email: body.email ?? "",
    p_notes: body.notes ?? "",
  });
  if (error) return rpcFailure(error);
  return Response.json({ id: data });
}
