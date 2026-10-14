"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useCompany } from "@/components/shell";
import { api } from "@/lib/browser";
import { formatWeek } from "@/lib/dates";
import type { PaymentRecord, SummaryRow } from "@/lib/types";

type Summary = {
  from: string;
  to: string;
  rows: SummaryRow[];
  totals: {
    total_amount: string;
    payment_count: number;
    recorded_hours: string | null;
    awaiting_count: number;
    missing_hours_count: number;
  };
};

function money(value: string) {
  return `$${value}`;
}

export default function OverviewPage() {
  const { company } = useCompany();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [awaiting, setAwaiting] = useState<PaymentRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<Summary>("/api/payroll/summary?granularity=week"),
      api<{ payments: PaymentRecord[] }>("/api/payments?status=awaiting_adp&limit=8"),
    ])
      .then(([nextSummary, nextPayments]) => {
        if (cancel) return;
        setSummary(nextSummary);
        setAwaiting(nextPayments.payments);
      })
      .catch((reason: Error) => {
        if (!cancel) setError(reason.message);
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="crumbs">Signalix <span>/</span> Payroll</p>
          <h1>This week is ready to <em>reconcile.</em></h1>
          <p className="deck">
            {company} can check each screenshot, keep the payment date separate from the payroll week, and see what still has to be typed into ADP.
          </p>
          <div className="badges">
            <span className="badge">Private screenshots</span>
            <span className="badge">Exact totals</span>
            <span className="badge">ADP reconciliation</span>
          </div>
        </div>
      </section>
      <div className="page">
        <div className="container" style={{ display: "grid", gap: 32 }}>
          {error ? <p className="banner">{error}</p> : null}
          {!summary && !error ? <p className="empty">Loading this payroll week…</p> : null}
          {summary ? (
            <>
              <section className="stat-row" aria-label="This payroll week">
                <div className="stat"><span>Payroll week total</span><strong>{money(summary.totals.total_amount)}</strong><em>{formatWeek(summary.from, summary.to)}</em></div>
                <div className="stat"><span>Payments counted</span><strong>{summary.totals.payment_count}</strong><em>Duplicates stay out</em></div>
                <div className="stat"><span>Awaiting ADP</span><strong>{summary.totals.awaiting_count}</strong><em>Confirmed, not entered</em></div>
                <div className="stat"><span>Hours recorded</span><strong>{summary.totals.recorded_hours ?? "—"}</strong><em>{summary.totals.missing_hours_count ? `${summary.totals.missing_hours_count} payments have no hours` : "Every counted payment has hours"}</em></div>
              </section>
              <section className="panel">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">By employee</p>
                    <h2>Payroll week, not payment date</h2>
                  </div>
                  <Link className="btn btn-outline" href="/payroll">Open payroll</Link>
                </div>
                {summary.rows.length === 0 ? (
                  <div className="empty">No counted payments in this week yet. Upload a screenshot to add one.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="responsive">
                      <thead>
                        <tr><th>Employee</th><th className="num">Total</th><th className="num">Hours</th><th className="num">Payments</th><th>ADP</th></tr>
                      </thead>
                      <tbody>
                        {summary.rows.map((row) => (
                          <tr key={row.employee_id}>
                            <td data-label="Employee"><span className="name">{row.employee_name}</span><span className="sub">{row.employee_code}</span></td>
                            <td className="num" data-label="Total">{money(row.total_amount)}</td>
                            <td className="num" data-label="Hours">{row.recorded_hours ?? "—"}{row.payments_missing_hours ? <span className="sub">Incomplete</span> : null}</td>
                            <td className="num" data-label="Payments">{row.payment_count}</td>
                            <td data-label="ADP">{row.awaiting_count ? <span className="pill">Awaiting</span> : <span className="pill pill-done">Entered</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <section>
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Reconciliation</p>
                    <h2>All payments awaiting ADP</h2>
                  </div>
                  <Link className="btn btn-primary" href="/upload">Upload screenshots</Link>
                </div>
                {awaiting.length === 0 ? (
                  <div className="empty">Nothing is waiting. Confirmed payments in this company have been marked entered, or none are confirmed yet.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="responsive">
                      <thead>
                        <tr><th>Employee</th><th>Paid on</th><th>Payroll week</th><th className="num">Amount</th><th></th></tr>
                      </thead>
                      <tbody>
                        {awaiting.map((payment) => (
                          <tr key={payment.id}>
                            <td data-label="Employee"><span className="name">{payment.employee_name}</span></td>
                            <td data-label="Paid on">{payment.transaction_date}</td>
                            <td data-label="Payroll week">{formatWeek(payment.period_start, payment.period_end)}</td>
                            <td className="num" data-label="Amount">{money(payment.amount)}</td>
                            <td><Link className="row-link" href={`/payments/${payment.id}`}>Review</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
