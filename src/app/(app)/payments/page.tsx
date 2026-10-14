"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/browser";
import { formatWeek, isIsoDate, payrollWeek } from "@/lib/dates";
import type { EmployeeOption, PaymentRecord } from "@/lib/types";

function statusLabel(payment: PaymentRecord) {
  if (payment.duplicate_flag) return <span className="pill pill-dup">Duplicate</span>;
  if (payment.status === "void") return <span className="pill pill-void">Excluded</span>;
  if (payment.status === "entered_adp") return <span className="pill pill-done">Entered in ADP</span>;
  return <span className="pill">Awaiting ADP</span>;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (employeeId) params.set("employee_id", employeeId);
    if (status) params.set("status", status);
    if (periodStart) params.set("period_start", periodStart);
    if (query) params.set("q", query);
    const handle = setTimeout(() => {
      setLoading(true);
      api<{ payments: PaymentRecord[]; employees: EmployeeOption[] }>(`/api/payments?${params.toString()}`)
        .then((body) => {
          setPayments(body.payments);
          setEmployees(body.employees);
          setError("");
        })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [employeeId, status, query, periodStart]);

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <h1>Payments</h1>
          <Link className="btn btn-primary" href="/upload">Upload</Link>
        </div>
        <div className="filters">
          <label className="field">
            <span className="field-label">Employee</span>
            <select className="control" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">All employees</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Status</span>
            <select className="control" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All</option>
              <option value="awaiting_adp">Awaiting ADP</option>
              <option value="entered_adp">Entered in ADP</option>
              <option value="duplicate">Duplicates</option>
              <option value="void">Excluded</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Payroll week</span>
            <input
              className="control"
              type="date"
              value={periodStart}
              onChange={(event) => {
                if (!event.target.value) {
                  setPeriodStart("");
                  return;
                }
                if (isIsoDate(event.target.value)) setPeriodStart(payrollWeek(event.target.value).start);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Search</span>
            <input className="control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or confirmation" />
          </label>
        </div>
        {error ? <p className="banner">{error}</p> : null}
        {loading ? <p className="empty">Loading payments…</p> : null}
        {!loading && payments.length === 0 ? <div className="empty">No payments match these filters.</div> : null}
        {!loading && payments.length > 0 ? (
          <div className="table-wrap">
            <table className="responsive">
              <thead>
                <tr><th>Employee</th><th>Paid on</th><th>Payroll week</th><th className="num">Amount</th><th className="num">Hours</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Employee"><span className="name">{payment.employee_name}</span><span className="sub">{payment.confirmation_number ?? "No confirmation"}</span></td>
                    <td data-label="Paid on">{payment.transaction_date}</td>
                    <td data-label="Payroll week">{formatWeek(payment.period_start, payment.period_end)}{payment.period_was_ambiguous ? <span className="sub">Confirmed from an unclear note</span> : null}</td>
                    <td className="num" data-label="Amount">${payment.amount}</td>
                    <td className="num" data-label="Hours">{payment.hours ?? "—"}</td>
                    <td data-label="Status">{statusLabel(payment)}</td>
                    <td><Link className="row-link" href={`/payments/${payment.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
