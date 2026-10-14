import { requireUser, rpcFailure } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const { data, error } = await supabase.rpc("add_employee_note", {
    p_employee: id,
    p_body: typeof body?.body === "string" ? body.body : "",
  });
  if (error) return rpcFailure(error);
  return Response.json({ id: data });
}
