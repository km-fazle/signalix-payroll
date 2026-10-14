import { isIsoDate } from "@/lib/dates";
import { matchEmployees, type EmployeeRecord } from "@/lib/match-employee";
import { formatAmount, formatHours, parseAmount } from "@/lib/money";
import { hoursInText, interpretPayPeriod } from "@/lib/pay-period";
import type { FieldState, ReviewField, UploadReview } from "@/lib/types";

export type ModelExtraction = {
  payee_name: string | null;
  amount: string | null;
  transaction_date: string | null;
  confirmation_number: string | null;
  description: string | null;
  hours: string | null;
  fields: Partial<Record<ReviewField, FieldState>>;
};

const INSTRUCTION_PATTERN =
  /ignore (all |any |previous |prior )?instructions|system prompt|you are now|reveal (all |every )?(company|companies|data)|set (the )?amount to/i;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed.slice(0, max);
}

function fieldState(value: FieldState | undefined, present: boolean): FieldState {
  if (!present) return value === "uncertain" ? "uncertain" : "missing";
  if (value === "uncertain" || value === "missing") return "uncertain";
  return "visible";
}

function dollarsInText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g)) {
    const amount = formatAmount(match[1]);
    if (amount) found.add(amount);
  }
  return [...found];
}

export function blankReview(fileName: string, screenshotId: string, error: string): UploadReview {
  const missing = {
    payee_name: "missing",
    amount: "missing",
    transaction_date: "missing",
    confirmation_number: "missing",
    description: "missing",
    hours: "missing",
  } as const;
  return {
    screenshot_id: screenshotId,
    file_name: fileName,
    preview_url: null,
    payee_name: null,
    amount: null,
    transaction_date: null,
    confirmation_number: null,
    description: "",
    hours: null,
    fields: { ...missing },
    warnings: [error],
    pay_period: {
      status: "unknown",
      start: null,
      end: null,
      evidence_dates: [],
      candidates: [],
      reason: "The payroll week has to be chosen because the screenshot could not be read.",
    },
    employee: { selected_id: null, candidates: [] },
    duplicate: null,
    extraction_error: error,
  };
}

export function interpretModel(args: {
  model: ModelExtraction | null;
  employees: EmployeeRecord[];
  today: string;
  fileName: string;
  screenshotId: string;
  duplicate: UploadReview["duplicate"];
  extractionError?: string | null;
}): UploadReview {
  const model = args.model;
  const warnings: string[] = [];
  if (args.extractionError) warnings.push(args.extractionError);

  const description = cleanText(model?.description, 2000) ?? "";
  const payee = cleanText(model?.payee_name, 120);
  const confirmation = cleanText(model?.confirmation_number, 64);
  const rawAmount = cleanText(model?.amount, 20);
  const amount = formatAmount(rawAmount);
  const rawDate = cleanText(model?.transaction_date, 10);
  const transactionDate = rawDate && isIsoDate(rawDate) ? rawDate : null;
  const notedHours = hoursInText(description);
  const modelHours = formatHours(cleanText(model?.hours, 8));

  let hours: string | null = null;
  if (notedHours.ambiguous) {
    warnings.push("The note mentions more than one hours figure. Hours were left blank.");
  } else if (notedHours.hours) {
    hours = notedHours.hours;
    if (modelHours && modelHours !== notedHours.hours) {
      warnings.push("Hours were taken from the figure printed in the note.");
    }
  } else if (modelHours) {
    warnings.push(
      "Hours were not printed in the payment note, so the hours field was left blank. Add them only if you can see them on the screenshot.",
    );
  }

  if (rawAmount && !amount) {
    warnings.push("The extracted amount was not a valid payment figure, so it was left blank.");
  }
  if (rawDate && !transactionDate) {
    warnings.push("The extracted payment date was not a real date, so it was left blank.");
  }

  const dollars = dollarsInText(description);
  if (amount && dollars.length === 1 && dollars[0] !== amount) {
    warnings.push(
      `The note mentions ${dollars[0]} and the payment amount reads ${amount}. Confirm the amount shown on the screenshot.`,
    );
  }
  if (!amount && dollars.length === 1) {
    warnings.push(
      `A dollar amount appears in the note, but the payment amount itself was not used unless it is the amount on the confirmation.`,
    );
  }

  if (description && INSTRUCTION_PATTERN.test(description)) {
    warnings.push(
      "The note contains instructions aimed at the reader. Those words are stored as the payment description and are not followed.",
    );
  }
  if (amount && parseAmount(amount)!.gt(5000)) {
    warnings.push("This amount is higher than a typical weekly guard payment. Confirm it on the screenshot.");
  }

  const fields: Record<ReviewField, FieldState> = {
    payee_name: fieldState(model?.fields.payee_name, Boolean(payee)),
    amount: fieldState(model?.fields.amount, Boolean(amount)),
    transaction_date: fieldState(model?.fields.transaction_date, Boolean(transactionDate)),
    confirmation_number: fieldState(model?.fields.confirmation_number, Boolean(confirmation)),
    description: description ? fieldState(model?.fields.description, true) : "missing",
    hours: hours ? "visible" : "missing",
  };

  const period = interpretPayPeriod(description, transactionDate, args.today);
  const employee = matchEmployees(payee, args.employees);
  if (payee && !employee.selectedId) {
    warnings.push("The payee was not an exact employee match. Choose the employee yourself.");
  }
  if (!payee) warnings.push("No payee name was readable. Choose the employee.");
  if (!amount) warnings.push("No payment amount was readable. Enter the amount from the screenshot.");
  if (!transactionDate) warnings.push("No payment date was readable. Enter the date the transfer was sent.");
  if (period.status !== "confident") warnings.push(period.reason);

  return {
    screenshot_id: args.screenshotId,
    file_name: args.fileName,
    preview_url: null,
    payee_name: payee,
    amount,
    transaction_date: transactionDate,
    confirmation_number: confirmation,
    description,
    hours,
    fields,
    warnings: [...new Set(warnings)],
    pay_period: {
      status: period.status,
      start: period.start,
      end: period.end,
      evidence_dates: period.evidenceDates,
      candidates: period.candidates,
      reason: period.reason,
    },
    employee: {
      selected_id: employee.selectedId,
      candidates: employee.candidates.map((candidate) => ({
        id: candidate.id,
        full_name: candidate.full_name,
        employee_code: candidate.employee_code,
        active: candidate.active,
        role_title: null,
        score: Number(candidate.score.toFixed(2)),
        reason: candidate.reason,
      })),
    },
    duplicate: args.duplicate,
    extraction_error: args.extractionError ?? null,
  };
}
