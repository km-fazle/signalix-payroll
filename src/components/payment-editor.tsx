"use client";

import { useMemo, useState } from "react";

import { formatWeek, isIsoDate, payrollWeek } from "@/lib/dates";
import { parseAmount, parseHours } from "@/lib/money";
import { interpretPayPeriod } from "@/lib/pay-period";
import type { EmployeeOption, UploadReview } from "@/lib/types";

export type EditorValues = {
  employee_id: string;
  amount: string;
  transaction_date: string;
  period_start: string;
  period_end: string;
  hours: string;
  confirmation_number: string;
  description: string;
  acknowledge_duplicate: boolean;
  period_chosen: boolean;
};

export function valuesFromReview(review: UploadReview): EditorValues {
  return {
    employee_id: review.employee.selected_id ?? "",
    amount: review.amount ?? "",
    transaction_date: review.transaction_date ?? "",
    period_start: review.pay_period.start ?? "",
    period_end: review.pay_period.end ?? "",
    hours: review.hours ?? "",
    confirmation_number: review.confirmation_number ?? "",
    description: review.description,
    acknowledge_duplicate: false,
    period_chosen: review.pay_period.status === "confident",
  };
}

export function PaymentEditor({
  review,
  employees,
  values,
  onChange,
  onSubmit,
  submitLabel,
  busy,
  extra,
}: {
  review: Pick<UploadReview, "fields" | "warnings" | "pay_period" | "duplicate" | "preview_url" | "payee_name" | "employee">;
  employees: EmployeeOption[];
  values: EditorValues;
  onChange: (values: EditorValues) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
  extra?: React.ReactNode;
}) {
  const [customDate, setCustomDate] = useState("");
  const suggestion = useMemo(
    () => interpretPayPeriod(values.description, values.transaction_date || null, values.transaction_date || "2026-10-13"),
    [values.description, values.transaction_date],
  );
  const candidates = suggestion.candidates.length ? suggestion.candidates : review.pay_period.candidates;
  const amountMissing = !parseAmount(values.amount);
  const dateMissing = !isIsoDate(values.transaction_date);
  const hoursInvalid = values.hours.trim() !== "" && !parseHours(values.hours);
  const periodReady = values.period_chosen && isIsoDate(values.period_start) && isIsoDate(values.period_end);
  const duplicateReady = !review.duplicate || values.acknowledge_duplicate;
  const canSave = Boolean(values.employee_id) && !amountMissing && !dateMissing && !hoursInvalid && periodReady && duplicateReady && !busy;

  function patch(partial: Partial<EditorValues>) {
    onChange({ ...values, ...partial });
  }

  function chooseWeek(start: string, end: string) {
    patch({ period_start: start, period_end: end, period_chosen: true });
  }

  return (
    <div className="review-grid">
      <div className="frame">
        {review.preview_url ? (
          // Signed storage URLs expire and are not eligible for the image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={review.preview_url} alt="Payment screenshot" />
        ) : (
          <div className="empty">The screenshot will appear here after it is stored.</div>
        )}
      </div>
      <div className="stack">
        {review.warnings.map((warning) => (
          <p className="note" key={warning}>{warning}</p>
        ))}
        {review.duplicate ? (
          <div className="banner">
            <strong>Duplicate confirmation</strong>
            <p>
              {review.duplicate.amount ? `$${review.duplicate.amount} ` : "A payment "}
              for {review.duplicate.employee_name} in the week of {formatWeek(review.duplicate.period_start, review.duplicate.period_end)} already uses this confirmation.
              Saving keeps this screenshot for evidence and excludes it from payroll totals.
            </p>
            <label className="choice">
              <input
                type="checkbox"
                checked={values.acknowledge_duplicate}
                onChange={(event) => patch({ acknowledge_duplicate: event.target.checked })}
              />
              <span>Keep this copy out of the totals</span>
            </label>
          </div>
        ) : null}

        <div className="tip">
          <strong>{suggestion.status === "confident" ? "Payroll week" : "Confirm the payroll week"}</strong>
          <p>{suggestion.reason}</p>
          {candidates.map((candidate) => (
            <label className="choice" key={candidate.start}>
              <input
                type="radio"
                name={`week-${review.payee_name ?? "payment"}`}
                checked={values.period_chosen && values.period_start === candidate.start}
                onChange={() => chooseWeek(candidate.start, candidate.end)}
              />
              <span>
                {formatWeek(candidate.start, candidate.end)}
                <span className="sub">{candidate.dates.join(", ")}</span>
              </span>
            </label>
          ))}
          <label className="field" style={{ marginTop: 8 }}>
            <span className="field-label">Or any date in the right week</span>
            <input
              className="control"
              type="date"
              value={customDate}
              onChange={(event) => {
                setCustomDate(event.target.value);
                if (!isIsoDate(event.target.value)) return;
                const week = payrollWeek(event.target.value);
                chooseWeek(week.start, week.end);
              }}
            />
          </label>
          {values.period_chosen && values.period_start ? (
            <p style={{ marginTop: 8 }}>Selected payroll week {formatWeek(values.period_start, values.period_end)}. This is separate from the payment date.</p>
          ) : (
            <p className="field-hint" style={{ color: "var(--error)", marginTop: 8 }}>Choose a payroll week before saving.</p>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="form-grid">
            <label className={`field wide ${review.fields.payee_name === "missing" && !values.employee_id ? "field-missing" : ""}`}>
              <span className="field-label">Employee</span>
              <select className="control" value={values.employee_id} onChange={(event) => patch({ employee_id: event.target.value })}>
                <option value="">Choose an employee</option>
                {review.employee.candidates.length ? (
                  <optgroup label="Closest names">
                    {review.employee.candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.full_name} · {candidate.employee_code}</option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Company directory">
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>
                  ))}
                </optgroup>
              </select>
              <span className="field-hint">{review.payee_name ? `Screenshot name: ${review.payee_name}` : "No payee name was readable."}</span>
            </label>
            <label className={`field ${amountMissing ? "field-missing" : ""}`}>
              <span className="field-label">Amount</span>
              <input className="control" inputMode="decimal" value={values.amount} onChange={(event) => patch({ amount: event.target.value })} placeholder="0.00" />
              <span className="field-hint">{amountMissing ? "Enter the amount printed on the screenshot." : "Payment amount"}</span>
            </label>
            <label className={`field ${dateMissing ? "field-missing" : ""}`}>
              <span className="field-label">Paid on</span>
              <input className="control" type="date" value={values.transaction_date} onChange={(event) => patch({ transaction_date: event.target.value })} />
              <span className="field-hint">Date the transfer was sent, not the payroll week.</span>
            </label>
            <label className={`field ${hoursInvalid ? "field-missing" : ""}`}>
              <span className="field-label">Hours</span>
              <input className="control" inputMode="decimal" value={values.hours} onChange={(event) => patch({ hours: event.target.value })} placeholder="Only if printed" />
              <span className="field-hint">{hoursInvalid ? "Hours must be greater than 0 and at most 168." : "Leave blank when the screenshot does not show hours."}</span>
            </label>
            <label className="field">
              <span className="field-label">Confirmation</span>
              <input className="control" value={values.confirmation_number} onChange={(event) => patch({ confirmation_number: event.target.value })} />
              <span className="field-hint">{review.fields.confirmation_number === "missing" ? "No confirmation number was readable." : "Used to catch duplicate screenshots."}</span>
            </label>
            <label className="field wide">
              <span className="field-label">Payment note</span>
              <textarea className="control" value={values.description} onChange={(event) => patch({ description: event.target.value })} />
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" type="button" disabled={!canSave} onClick={onSubmit}>{busy ? "Saving…" : submitLabel}</button>
            {extra}
          </div>
        </div>
      </div>
    </div>
  );
}
