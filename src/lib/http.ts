import { connection } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      supabase,
      user: null,
      errorResponse: Response.json({ error: "Sign in required." }, { status: 401 }),
    };
  }
  return { supabase, user: data.user, errorResponse: null };
}

export function rpcFailure(error: { message?: string; details?: string | null }) {
  const message = error.message ?? "The request could not be completed.";
  const detail = error.details ?? null;
  if (message.includes("DUPLICATE")) {
    return Response.json(
      {
        error: "This confirmation number is already on a counted payment. Acknowledge the duplicate to keep the screenshot without adding it to payroll.",
        duplicate_of: detail,
      },
      { status: 409 },
    );
  }
  const cleaned = message.replace(/^(AUTH|VALIDATION):\s*/, "");
  const status = message.startsWith("AUTH:") ? 401 : 400;
  return Response.json({ error: cleaned }, { status });
}
