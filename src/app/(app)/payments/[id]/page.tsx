"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PaymentEditor, type EditorValues } from "@/components/payment-editor";
import { api } from "@/lib/browser";
import { formatMedium } from "@/lib/dates";
import type { EmployeeOption, PaymentEvent, PaymentRecord, UploadReview } from "@/lib/types";

const LABELS: Record<string, string> = {
  amount: "Amount",
  hours: "Hours",
  employee_id: "Employee",
  transaction_date: "Paid on",
  period_start: "Payroll week start",
  period_end: "Payroll week end",
  confirmation_number: "Confirmation",
  description: "Note",
  status: "Status",
  counts_toward_totals: "Counted in totals",
  void_reason: "Reason",
};

function changedFields(event: PaymentEvent) {
  if (!event.before_state || !event.after_state) return [];
  return Object.keys(event.after_state).filter((key) => event.before_state?.[key] !== event.after_state?.[key] && LABELS[key]);
}

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [values, setValues] = useState<EditorValues | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState<UploadReview["duplicate"]>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancel = false;
    api<{ payments: PaymentRecord[]; employees: EmployeeOption[]; events: PaymentEvent[] }>(`/api/payments?id=${params.id}`)
      .then((body) => {
        if (cancel) return;
        const next = body.payments[0];
        if (!next) {
          setError("This payment is not in your company.");
          return;
        }
        setPayment(next);
        setEmployees(body.employees);
        setEvents(body.events);
        setValues({
          employee_id: next.employee_id,
          amount: next.amount,
          transaction_date: next.transaction_date,
          period_start: next.period_start,
          period_end: next.period_end,
          hours: next.hours ?? "",
          confirmation_number: next.confirmation_number ?? "",
          description: next.description,
          acknowledge_duplicate: next.duplicate_flag,
          period_chosen: true,
        });
        setError("");
      })
      .catch((reasonError: Error) => {
        if (!cancel) setError(reasonError.message);
      });
    return () => {
      cancel = true;
    };
  }, [params.id, version]);

  function reload() {
    setVersion((current) => current + 1);
  }

  if (!payment || !values) {
    return <div className="page"><div className="container">{error ? <p className="banner">{error}</p> : <p className="empty">Loading payment…</p>}</div></div>;
  }

  const review: Pick<UploadReview, "fields" | "warnings" | "pay_period" | "duplicate" | "preview_url" | "payee_name" | "employee"> = {
    fields: {
      payee_name: "visible",
      amount: "visible",
      transaction_date: "visible",
      confirmation_number: payment.confirmation_number ? "visible" : "missing",
      description: payment.description ? "visible" : "missing",
      hours: payment.hours ? "visible" : "missing",
    },
    warnings: payment.void_reason ? [`Excluded from totals: ${payment.void_reason}`] : [],
    pay_period: {
      status: payment.period_was_ambiguous ? "ambiguous" : "confident",
      start: payment.period_start,
      end: payment.period_end,
      evidence_dates: [],
      candidates: [{ start: payment.period_start, end: payment.period_end, dates: [] }],
      reason: payment.period_was_ambiguous
        ? "This week was confirmed by an administrator because the note did not define one week."
        : "This is the payroll week stored for the payment.",
    },
    duplicate: payment.duplicate_flag
      ? {
          payment_id: payment.duplicate_of ?? payment.id,
          employee_name: payment.employee_name,
          period_start: payment.period_start,
          period_end: payment.period_end,
          amount: payment.amount,
        }
      : conflict,
    preview_url: payment.screenshot_url,
    payee_name: payment.payee_name_raw,
    employee: { selected_id: payment.employee_id, candidates: [] },
  };

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/api/payments/${payment!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "correct",
          employee_id: values!.employee_id,
          amount: values!.amount,
          transaction_date: values!.transaction_date,
          period_start: values!.period_start,
          period_end: values!.period_end,
          hours: values!.hours || null,
          confirmation_number: values!.confirmation_number || null,
          description: values!.description,
          acknowledge_duplicate: values!.acknowledge_duplicate,
        }),
      });
      setMessage("Correction saved. The original screenshot and the previous values stay in the history.");
      reload();
    } catch (reasonError) {
      const failure = reasonError as Error & { status?: number; duplicate_of?: string };
      if (failure.status === 409 && values && payment) {
        setConflict({
          payment_id: failure.duplicate_of ?? payment.id,
          employee_name: "another counted payment",
          period_start: values.period_start,
          period_end: values.period_end,
          amount: "",
        });
      }
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function markEntered() {
    if (!values || !payment) return;
    const dirty = values.amount !== payment.amount || values.hours !== (payment.hours ?? "") || values.employee_id !== payment.employee_id || values.period_start !== payment.period_start || values.description !== payment.description;
    if (dirty) {
      setError("Save the correction first. Marking ADP entry does not change the amount, hours, or payroll week.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/payments/${payment!.id}`, { method: "PATCH", body: JSON.stringify({ action: "enter_adp" }) });
      setMessage("Marked as entered in ADP. The amount and hours were not changed.");
      reload();
    } catch (reasonError) {
      setError((reasonError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exclude() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/payments/${payment!.id}`, { method: "PATCH", body: JSON.stringify({ action: "void", reason }) });
      setReason("");
      setMessage("This payment is kept for evidence and removed from totals.");
      reload();
    } catch (reasonError) {
      setError((reasonError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/payments/${payment!.id}`, { method: "PATCH", body: JSON.stringify({ action: "restore" }) });
      setMessage("Restored. It counts again only if its confirmation is not already on another counted payment.");
      reload();
    } catch (reasonError) {
      setError((reasonError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="container stack">
        <div className="page-head">
          <div>
            <Link className="back" href="/payments">Payments</Link>
            <h1>{payment.employee_name}</h1>
            <p className="lede">Paid {payment.transaction_date}. Week {payment.period_start}–{payment.period_end}.</p>
          </div>
          {payment.status === "confirmed" && payment.counts_toward_totals ? (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={markEntered}>Mark entered in ADP</button>
          ) : null}
        </div>
        {error ? <p className="banner">{error}</p> : null}
        {message ? <p className="note">{message}</p> : null}
        {payment.status === "entered_adp" ? <p className="note">Already marked entered in ADP{payment.entered_adp_at ? ` on ${formatMedium(payment.entered_adp_at.slice(0, 10))}` : ""}. A correction is recorded, and it does not happen when you only update the reconciliation status.</p> : null}
        <PaymentEditor
          review={review}
          employees={employees}
          values={values}
          onChange={setValues}
          onSubmit={save}
          submitLabel="Save correction"
          busy={busy || payment.status === "void"}
        />
        <section className="split">
          <div className="card" style={{ padding: 20 }}>
            <h2>History</h2>
            <div className="timeline">
              {events.map((event) => (
                <article key={event.id}>
                  <h3>{event.action.replaceAll("_", " ")}</h3>
                  <p className="sub">{formatMedium(event.created_at.slice(0, 10))}{event.actor_name ? ` · ${event.actor_name}` : ""}</p>
                  {changedFields(event).length ? <p>Changed {changedFields(event).map((key) => LABELS[key]).join(", ")}.</p> : null}
                </article>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <h2>Exclude</h2>
            {payment.status === "void" ? (
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={restore}>Restore to payroll</button>
            ) : (
              <div className="stack">
                <label className="field">
                  <span className="field-label">Reason</span>
                  <input className="control" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Duplicate upload, wrong company, …" />
                </label>
                <button className="btn btn-outline" type="button" disabled={busy || reason.trim().length < 3} onClick={exclude}>Exclude from payroll</button>
              </div>
            )}
            <p className="field-hint" style={{ marginTop: 12 }}>The screenshot stays attached.</p>
            <button className="btn btn-outline" type="button" style={{ marginTop: 16 }} onClick={() => router.push("/payments")}>Back to payments</button>
          </div>
        </section>
      </div>
    </div>
  );
}
