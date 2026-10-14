import assert from "node:assert/strict";
import test from "node:test";

import { formatAmount, parseAmount } from "./money";
import { datesInText, hoursInText, interpretPayPeriod } from "./pay-period";
import { csvCell } from "./csv";

test("maps Oct 9, 10, 11 onto the Monday–Sunday week", () => {
  const period = interpretPayPeriod(
    "Payroll Oct 9, 10, 11 — 24 hrs",
    "2026-10-12",
    "2026-10-13",
  );
  assert.equal(period.status, "confident");
  assert.equal(period.start, "2026-10-05");
  assert.equal(period.end, "2026-10-11");
  assert.deepEqual(period.evidenceDates, ["2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.equal(hoursInText("Payroll Oct 9, 10, 11 — 24 hrs").hours, "24.00");
});

test("does not treat an hours figure as a work date", () => {
  assert.deepEqual(datesInText("Payroll Oct 9, 10, 11 — 24 hrs", "2026-10-12"), [
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ]);
});

test("flags dates that cross two payroll weeks", () => {
  const period = interpretPayPeriod("Oct 10, 11, and 12 coverage", "2026-10-13", "2026-10-13");
  assert.equal(period.status, "ambiguous");
  assert.equal(period.candidates.length, 2);
  assert.equal(period.candidates[0].start, "2026-10-05");
  assert.equal(period.candidates[1].start, "2026-10-12");
});

test("does not invent a period from an unclear note", () => {
  const period = interpretPayPeriod("Payment sent. Thanks for last week.", "2026-10-13", "2026-10-13");
  assert.equal(period.status, "unknown");
  assert.equal(period.start, null);
  assert.equal(hoursInText(period.reason).hours, null);
});

test("reads an explicit payroll week and numeric dates", () => {
  const period = interpretPayPeriod("Shifts 10/05/2026-10/11/2026", "2026-10-12", "2026-10-13");
  assert.equal(period.status, "confident");
  assert.equal(period.start, "2026-10-05");
  assert.equal(period.end, "2026-10-11");
});

test("keeps December work in the prior year when paid in January", () => {
  const dates = datesInText("Dec 30 and 31", "2027-01-02");
  assert.deepEqual(dates, ["2026-12-30", "2026-12-31"]);
});

test("hours are taken only from an explicit hours figure", () => {
  assert.equal(hoursInText("bonus 50").hours, null);
  assert.equal(hoursInText("16 hrs and also 8 hours").hours, null);
  assert.equal(hoursInText("16 hrs and also 8 hours").ambiguous, true);
  assert.equal(hoursInText("worked 7.5 hours").hours, "7.50");
});

test("money parsing never accepts binary floats or invented precision", () => {
  assert.equal(formatAmount("720.50"), "720.50");
  assert.equal(formatAmount("720.5"), "720.50");
  assert.equal(parseAmount("10.999"), null);
  assert.equal(parseAmount("0"), null);
  assert.equal(parseAmount("-5"), null);
  assert.equal(formatAmount("0.10"), "0.10");
  assert.equal(parseAmount("0.10")?.toFixed(2), "0.10");
});

test("csv cells stay literal when a name looks like a formula", () => {
  assert.equal(csvCell("=cmd|'/C calc"), "'=cmd|'/C calc");
  assert.equal(csvCell('Ana "Nia" Cole'), '"Ana ""Nia"" Cole"');
  assert.equal(csvCell("5185.75"), "5185.75");
});
