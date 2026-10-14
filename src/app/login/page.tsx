"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const DEMOS = [
  ["Apex Shield Security", "mara.chen@apexshield.test", "Apex-payroll-2026"],
  ["Northline Patrol", "ellis.ward@northline.test", "Northline-payroll-2026"],
];

function destination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function SignInForm() {
  const router = useRouter();
  const next = destination(useSearchParams().get("next"));
  const [email, setEmail] = useState(DEMOS[0][1]);
  const [password, setPassword] = useState(DEMOS[0][2]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError("Those credentials were not recognized.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <Link href="/login" className="wordmark">
          <span className="mark" aria-hidden />
          <span>Signalix<small>Payroll</small></span>
        </Link>
        <h1>Sign in</h1>
        <label className="field">
          <span className="field-label">Email</span>
          <input className="control" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="control" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="banner">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="demo">
          <span className="field-label">Companies</span>
          {DEMOS.map(([company, demoEmail, demoPassword]) => (
            <button
              key={demoEmail}
              type="button"
              onClick={() => {
                setEmail(demoEmail);
                setPassword(demoPassword);
              }}
              style={{ background: "transparent", border: 0, padding: 0, textAlign: "left" }}
            >
              <div>
                <span>{company}</span>
                <span>{demoEmail}</span>
              </div>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="boot">Loading sign in…</div>}>
      <SignInForm />
    </Suspense>
  );
}
