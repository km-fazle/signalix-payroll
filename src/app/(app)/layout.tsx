import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Shell } from "@/components/shell";
import { createClient } from "@/lib/supabase/server";

async function Guard({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, companies(name)")
    .eq("id", data.user.id)
    .single();
  const companyEmbed = profile?.companies as { name: string } | { name: string }[] | null;
  const company = (Array.isArray(companyEmbed) ? companyEmbed[0]?.name : companyEmbed?.name) || "Your company";
  return <Shell company={company} person={profile?.full_name ?? "Administrator"}>{children}</Shell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="boot">Loading payroll…</div>}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}
