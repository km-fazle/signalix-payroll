import { requireUser, rpcFailure } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return Response.json({ error: "Choose a correction or a reconciliation action." }, { status: 400 });
  }

  if (body.action === "enter_adp") {
    if (Object.keys(body).some((key) => key !== "action")) {
      return Response.json(
        { error: "Marking a payment as entered in ADP cannot change its amount, hours, employee, or dates." },
        { status: 400 },
      );
    }
    const { data, error } = await supabase.rpc("mark_payment_entered_adp", { p_id: id });
    if (error) return rpcFailure(error);
    return Response.json({ id: data });
  }

  if (body.action === "void") {
    const { data, error } = await supabase.rpc("void_payment", { p_id: id, p_reason: body.reason ?? "" });
    if (error) return rpcFailure(error);
    return Response.json({ id: data });
  }

  if (body.action === "restore") {
    if (Object.keys(body).some((key) => key !== "action")) {
      return Response.json({ error: "Restoring a payment does not change its financial values." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("restore_payment", { p_id: id });
    if (error) return rpcFailure(error);
    return Response.json({ id: data });
  }

  if (body.action !== "correct") {
    return Response.json({ error: "Unknown payment action." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("correct_payment", {
    p_id: id,
    p_employee_id: body.employee_id,
    p_amount: body.amount,
    p_transaction_date: body.transaction_date,
    p_period_start: body.period_start,
    p_period_end: body.period_end,
    p_hours: body.hours || null,
    p_confirmation_number: body.confirmation_number || null,
    p_description: body.description ?? "",
    p_acknowledge_duplicate: Boolean(body.acknowledge_duplicate),
  });
  if (error) return rpcFailure(error);
  return Response.json({ id: data });
}
