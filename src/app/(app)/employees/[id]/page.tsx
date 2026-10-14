"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, download } from "@/lib/browser";
import { formatWeek, isIsoDate, payrollWeek } from "@/lib/dates";
import type { EmployeeNote, EmployeeRecord, HourTotals, PaymentRecord } from "@/lib/types";

type Profile = {
  employee: EmployeeRecord;
  totals: HourTotals;
  payments: PaymentRecord[];
  notes: EmployeeNote[];
};

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<EmployeeRecord | null>(null);
  const [status, setStatus] = useState("counted");
  const [period, setPeriod] = useState("");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const search = new URLSearchParams({ status });
    if (period) search.set("period", period);
    if (query) search.set("q", query);
    const handle = setTimeout(() => {
      setLoading(true);
      api<Profile>(`/api/employees/${params.id}?${search.toString()}`)
        .then((body) => {
          setProfile(body);
          setForm(body.employee);
          setError("");
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [params.id, status, period, query, saving]);

  async function saveInfo(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/employees/${params.id}`, { method: "PATCH", body: JSON.stringify(form) });
      setEditing(false);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/api/employees/${params.id}/notes`, { method: "POST", body: JSON.stringify({ body: note }) });
      setNote("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function exportFile(format: "csv" | "pdf") {
    const search = new URLSearchParams({ format, status });
    if (period) search.set("period", period);
    if (query) search.set("q", query);
    const code = profile?.employee.employee_code ?? "employee";
    void download(`/api/employees/${params.id}/export?${search.toString()}`, `${code}-hours.${format}`).catch((reason: Error) => setError(reason.message));
  }

  const employee = profile?.employee;

  return (
    <div className="page">
      <div className="container stack">
        <div className="page-head">
          <div>
            <Link className="back" href="/employees">Employees</Link>
            <h1>{employee?.full_name ?? "Employee"}</h1>
            <p className="lede">{employee ? `${employee.employee_code}${employee.role_title ? ` · ${employee.role_title}` : ""}` : "Paid hours"}</p>
          </div>
          <div className="btn-row">
            <button className="btn btn-outline" type="button" onClick={() => exportFile("csv")}>CSV</button>
            <button className="btn btn-outline" type="button" onClick={() => exportFile("pdf")}>PDF</button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Close" : "Edit"}</button>
          </div>
        </div>
        {error ? <p className="banner">{error}</p> : null}
        {editing && form ? (
          <form className="panel stack" onSubmit={(event) => void saveInfo(event)}>
            <div className="form-grid">
              <label className="field"><span className="field-label">Name</span><input className="control" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
              <label className="field"><span className="field-label">Code</span><input className="control" value={form.employee_code} onChange={(event) => setForm({ ...form, employee_code: event.target.value })} /></label>
              <label className="field"><span className="field-label">Role</span><input className="control" value={form.role_title ?? ""} onChange={(event) => setForm({ ...form, role_title: event.target.value })} /></label>
              <label className="field"><span className="field-label">Phone</span><input className="control" value={form.phone ?? ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label className="field"><span className="field-label">Email</span><input className="control" type="email" value={form.email ?? ""} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label className="field">
                <span className="field-label">Status</span>
                <select className="control" value={form.active ? "active" : "inactive"} onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label className="field wide"><span className="field-label">Profile note</span><textarea className="control" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </form>
        ) : employee ? (
          <p className="field-hint">{[employee.phone, employee.email, employee.active ? null : "Inactive"].filter(Boolean).join(" · ") || "No contact details"}{employee.notes ? ` · ${employee.notes}` : ""}</p>
        ) : null}
        {profile ? (
          <section className="stat-row thirds" aria-label="Paid hours">
            <div className="stat"><span>Paid</span><strong>${profile.totals.total_amount}</strong></div>
            <div className="stat"><span>Hours</span><strong>{profile.totals.recorded_hours ?? "—"}</strong><em>{profile.totals.missing_hours_count ? `${profile.totals.missing_hours_count} missing` : "Recorded"}</em></div>
            <div className="stat"><span>Payments</span><strong>{profile.totals.payment_count}</strong></div>
          </section>
        ) : null}
        <div className="filters">
          <label className="field">
            <span className="field-label">Payroll week</span>
            <input
              className="control"
              type="date"
              value={period}
              onChange={(event) => {
                if (!event.target.value) {
                  setPeriod("");
                  return;
                }
                if (isIsoDate(event.target.value)) setPeriod(payrollWeek(event.target.value).start);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Show</span>
            <select className="control" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="counted">Paid</option>
              <option value="awaiting_adp">Awaiting ADP</option>
              <option value="entered_adp">Entered in ADP</option>
              <option value="missing_hours">Missing hours</option>
              <option value="excluded">Excluded</option>
              <option value="all">All</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Search</span>
            <input className="control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Confirmation or note" />
          </label>
        </div>
        {loading ? <p className="empty">Loading hours…</p> : null}
        {!loading && profile && profile.payments.length === 0 ? <div className="empty">No payments for this filter.</div> : null}
        {!loading && profile && profile.payments.length > 0 ? (
          <div className="table-wrap">
            <table className="responsive">
              <thead>
                <tr><th>Paid on</th><th>Payroll week</th><th className="num">Hours</th><th className="num">Amount</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {profile.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Paid on">{payment.transaction_date}</td>
                    <td data-label="Payroll week">{formatWeek(payment.period_start, payment.period_end)}{payment.description ? <span className="sub">{payment.description}</span> : null}</td>
                    <td className="num" data-label="Hours">{payment.hours ?? "—"}</td>
                    <td className="num" data-label="Amount">${payment.amount}</td>
                    <td data-label="Status">{payment.counts_toward_totals ? payment.status.replaceAll("_", " ") : "Excluded"}</td>
                    <td><Link className="row-link" href={`/payments/${payment.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <section className="panel stack">
          <h2>Notes</h2>
          <form className="stack" onSubmit={(event) => void addNote(event)}>
            <label className="field">
              <span className="field-label">Add note</span>
              <textarea className="control" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={saving || note.trim().length < 1}>Save note</button>
          </form>
          {profile?.notes.length ? (
            <div className="timeline">
              {profile.notes.map((item) => (
                <article key={item.id}>
                  <p>{item.body}</p>
                  <p className="sub">{item.created_at.slice(0, 10)}</p>
                </article>
              ))}
            </div>
          ) : <p className="field-hint">No notes yet.</p>}
        </section>
      </div>
    </div>
  );
}
