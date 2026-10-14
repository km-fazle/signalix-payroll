"use client";

import { useEffect, useState } from "react";

import { download, api } from "@/lib/browser";
import { addDays, formatMedium, formatWeek, monthEnd, monthStart, payrollWeek } from "@/lib/dates";
import type { SummaryRow } from "@/lib/types";

type Summary = {
  granularity: "week" | "month";
  from: string;
  to: string;
  rows: SummaryRow[];
  totals: {
    total_amount: string;
    payment_count: number;
    recorded_hours: string | null;
    awaiting_count: number;
    entered_count: number;
    missing_hours_count: number;
  };
};

export default function PayrollPage() {
  const [range, setRange] = useState<{ granularity: "week" | "month"; from?: string; to?: string }>({ granularity: "week" });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ granularity: range.granularity });
    if (range.from && range.to) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    let cancel = false;
    api<Summary>(`/api/payroll/summary?${params.toString()}`)
      .then((body) => {
        if (cancel) return;
        setSummary(body);
        setError("");
      })
      .catch((reason: Error) => {
        if (!cancel) setError(reason.message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [range]);

  function show(next: { granularity: "week" | "month"; from?: string; to?: string }) {
    setLoading(true);
    setRange(next);
  }

  function move(direction: number) {
    if (!summary) return;
    if (range.granularity === "week") {
      const next = payrollWeek(addDays(summary.from, direction * 7));
      show({ granularity: "week", from: next.start, to: next.end });
      return;
    }
    const anchor = addDays(monthStart(summary.from), direction > 0 ? 32 : -1);
    const start = monthStart(anchor);
    show({ granularity: "month", from: start, to: monthEnd(start) });
  }

  async function exportCsv() {
    if (!summary) return;
    setExporting(true);
    setError("");
    try {
      await download(
        `/api/payroll/export?granularity=${range.granularity}&from=${summary.from}&to=${summary.to}`,
        `signalix-payroll-${summary.from}-${summary.to}.csv`,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <div className="container stack">
        <div className="page-head">
          <h1>Payroll</h1>
          <button className="btn btn-primary" type="button" disabled={!summary || exporting} onClick={() => void exportCsv()}>
            {exporting ? "Preparing…" : "Export CSV"}
          </button>
        </div>
        <div className="week-switch">
          <button className={range.granularity === "week" ? "btn btn-primary" : "btn btn-outline"} type="button" onClick={() => show({ granularity: "week" })}>Week</button>
          <button className={range.granularity === "month" ? "btn btn-primary" : "btn btn-outline"} type="button" onClick={() => show({ granularity: "month" })}>Month</button>
          <button className="icon-btn" type="button" onClick={() => move(-1)} aria-label="Previous period">←</button>
          <strong>{summary ? (range.granularity === "week" ? formatWeek(summary.from, summary.to) : formatMedium(summary.from).replace(/\d+, /, "")) : "Loading"}</strong>
          <button className="icon-btn" type="button" onClick={() => move(1)} aria-label="Next period">→</button>
        </div>
        {error ? <p className="banner">{error}</p> : null}
        {loading || !summary ? <p className="empty">Loading totals…</p> : (
          <>
            <section className="stat-row">
              <div className="stat"><span>Total payments</span><strong>${summary.totals.total_amount}</strong></div>
              <div className="stat"><span>Payments</span><strong>{summary.totals.payment_count}</strong></div>
              <div className="stat"><span>Recorded hours</span><strong>{summary.totals.recorded_hours ?? "—"}</strong><em>{summary.totals.missing_hours_count ? `${summary.totals.missing_hours_count} missing` : "Complete"}</em></div>
              <div className="stat"><span>ADP</span><strong>{summary.totals.entered_count}/{summary.totals.payment_count}</strong><em>{summary.totals.awaiting_count} awaiting</em></div>
            </section>
            {summary.rows.length === 0 ? <div className="empty">No payments in this {range.granularity}.</div> : (
              <div className="table-wrap">
                <table className="responsive">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>{range.granularity === "month" ? "Month" : "Payroll week"}</th>
                      <th className="num">Total</th>
                      <th className="num">Hours</th>
                      <th className="num">Payments</th>
                      <th>ADP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row) => (
                      <tr key={`${row.employee_id}-${row.period_start}`}>
                        <td data-label="Employee"><span className="name">{row.employee_name}</span><span className="sub">{row.employee_code}</span></td>
                        <td data-label="Period">{range.granularity === "month" ? formatMedium(row.period_start).replace(/ \d+,/, "") : formatWeek(row.period_start, row.period_end)}{row.week_count ? <span className="sub">{row.week_count} {Number(row.week_count) === 1 ? "week" : "weeks"}</span> : null}</td>
                        <td className="num" data-label="Total">${row.total_amount}</td>
                        <td className="num" data-label="Hours">{row.recorded_hours ?? "—"}{row.payments_missing_hours ? <span className="sub">{row.payments_missing_hours} without hours</span> : null}</td>
                        <td className="num" data-label="Payments">{row.payment_count}</td>
                        <td data-label="ADP">{row.entered_count === row.payment_count ? <span className="pill pill-done">Entered</span> : row.entered_count === 0 ? <span className="pill">Not entered</span> : <span className="pill">Partial</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
