import Decimal from "decimal.js";

import { addDays, daysBetween, isIsoDate, payrollWeek } from "./dates";
import { parseHours } from "./money";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_WORD =
  "january|february|march|april|may|june|july|august|september|sept|sep|october|oct|november|nov|december|dec|jan|feb|mar|apr|jun|jul|aug";

export type PeriodCandidate = {
  start: string;
  end: string;
  dates: string[];
};

export type PeriodInterpretation = {
  status: "confident" | "ambiguous" | "unknown";
  start: string | null;
  end: string | null;
  evidenceDates: string[];
  candidates: PeriodCandidate[];
  reason: string;
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function chooseYear(month: number, day: number, anchor: string): string | null {
  const anchorYear = Number(anchor.slice(0, 4));
  let best: { value: string; distance: number } | null = null;
  for (const year of [anchorYear - 1, anchorYear, anchorYear + 1]) {
    const value = iso(year, month, day);
    if (!value) continue;
    const distance = daysBetween(value, anchor);
    if (distance > 45 || distance < -370) continue;
    const score = Math.abs(distance);
    if (!best || score < best.distance) best = { value, distance: score };
  }
  return best?.value ?? null;
}

function readMonthDays(rest: string): number[] {
  const days: number[] = [];
  const first = /^\s*(\d{1,2})\b(?!\s*(?:hours|hrs|hr)\b)/i.exec(rest);
  if (!first) return days;
  days.push(Number(first[1]));
  let index = first[0].length;
  while (index < rest.length) {
    const next = /^(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*|\s*-\s*)(\d{1,2})\b(?!\s*(?:hours|hrs|hr)\b)/i.exec(
      rest.slice(index),
    );
    if (!next) break;
    days.push(Number(next[1]));
    index += next[0].length;
  }
  return days;
}

function addDate(target: Set<string>, value: string | null) {
  if (value && isIsoDate(value)) target.add(value);
}

export function datesInText(text: string, anchor: string): string[] {
  const found = new Set<string>();
  const source = text.replace(/[–—]/g, "-");

  for (const match of source.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    addDate(found, iso(year, month, day));
  }

  for (const match of source.matchAll(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/g)) {
    addDate(found, chooseYear(Number(match[1]), Number(match[2]), anchor));
  }

  const monthRe = new RegExp(`\\b(${MONTH_WORD})\\b\\.?`, "gi");
  for (const match of source.matchAll(monthRe)) {
    const month = MONTHS[match[1].toLowerCase()];
    const days = readMonthDays(source.slice((match.index ?? 0) + match[0].length));
    for (const day of days) addDate(found, chooseYear(month, day, anchor));
  }

  return [...found].sort();
}

export function interpretPayPeriod(
  description: string | null | undefined,
  transactionDate: string | null | undefined,
  today: string,
): PeriodInterpretation {
  const anchor = transactionDate && isIsoDate(transactionDate) ? transactionDate : today;
  const text = description?.trim() ?? "";
  if (!text) {
    return {
      status: "unknown",
      start: null,
      end: null,
      evidenceDates: [],
      candidates: [],
      reason: "The screenshot has no payment note, so the payroll week has to be chosen.",
    };
  }

  const evidenceDates = datesInText(text, anchor);
  if (evidenceDates.length === 0) {
    return {
      status: "unknown",
      start: null,
      end: null,
      evidenceDates: [],
      candidates: [],
      reason:
        "The note does not list work dates. Words like “last week” are not treated as a payroll period.",
    };
  }

  const grouped = new Map<string, PeriodCandidate>();
  for (const date of evidenceDates) {
    const week = payrollWeek(date);
    const existing = grouped.get(week.start);
    if (existing) existing.dates.push(date);
    else grouped.set(week.start, { ...week, dates: [date] });
  }
  const candidates = [...grouped.values()].sort((a, b) => a.start.localeCompare(b.start));

  if (candidates.length === 1) {
    const week = candidates[0];
    return {
      status: "confident",
      start: week.start,
      end: week.end,
      evidenceDates,
      candidates,
      reason: `The dates in the note fall in the payroll week of ${week.start} through ${week.end}.`,
    };
  }

  const suggested = [...candidates].sort((a, b) => {
    if (b.dates.length !== a.dates.length) return b.dates.length - a.dates.length;
    return b.start.localeCompare(a.start);
  })[0];

  return {
    status: "ambiguous",
    start: suggested.start,
    end: suggested.end,
    evidenceDates,
    candidates,
    reason: `The note mentions dates in ${candidates.length} payroll weeks. Confirm which week these hours belong to.`,
  };
}

export function weekContaining(isoDate: string): { start: string; end: string } | null {
  if (!isIsoDate(isoDate)) return null;
  return payrollWeek(isoDate);
}

export function isPayrollWeek(start: string, end: string): boolean {
  if (!isIsoDate(start) || !isIsoDate(end)) return false;
  const week = payrollWeek(start);
  return week.start === start && week.end === end && addDays(start, 6) === end;
}

export function hoursInText(description: string | null | undefined): {
  hours: string | null;
  ambiguous: boolean;
} {
  if (!description) return { hours: null, ambiguous: false };
  const found = new Set<string>();
  for (const match of description.matchAll(/\b(\d{1,3}(?:\.\d{1,2})?)\s*(?:hours|hrs|hr)\b/gi)) {
    const hours = parseHours(new Decimal(match[1]).toFixed(2));
    if (hours) found.add(hours.toFixed(2));
  }
  if (found.size === 1) return { hours: [...found][0], ambiguous: false };
  if (found.size > 1) return { hours: null, ambiguous: true };
  return { hours: null, ambiguous: false };
}
