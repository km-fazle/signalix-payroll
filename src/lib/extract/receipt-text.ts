import { isIsoDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import type { ModelExtraction } from "@/lib/extract/interpret";

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

const LABEL =
  /^(to|amount|sent|date|paid on|confirmation(?: number|#)?|reference|memo|note)\b\s*[:\-]?\s*(.*)$/i;

type Bucket = "payee" | "amount" | "date" | "confirmation" | "memo";

function bucketFor(label: string): Bucket {
  const word = label.toLowerCase();
  if (word === "to") return "payee";
  if (word === "amount") return "amount";
  if (word === "memo" || word === "note") return "memo";
  if (word.startsWith("confirm") || word === "reference") return "confirmation";
  return "date";
}

function isoFromParts(year: number, month: number, day: number): string | null {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

export function printedDate(value: string): string | null {
  const month = value.match(new RegExp(`\\b(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(20\\d{2})\\b`, "i"));
  if (month) {
    const found = MONTHS[month[1].toLowerCase()];
    if (found) return isoFromParts(Number(month[3]), found, Number(month[2]));
  }
  const numeric = value.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (!numeric) return null;
  return isoFromParts(Number(numeric[3]), Number(numeric[1]), Number(numeric[2]));
}

function money(value: string): string | null {
  const dollar = value.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
  if (dollar) return formatAmount(dollar[1].replace(/,/g, ""));
  const decimal = value.match(/\b([0-9]+\.[0-9]{2})\b/);
  return decimal ? formatAmount(decimal[1]) : null;
}

function payee(value: string): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!/^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){0,3}$/.test(cleaned)) return null;
  return cleaned;
}

function confirmation(value: string): string | null {
  const token = value.replace(/\s+/g, " ").trim().match(/[A-Za-z0-9][A-Za-z0-9-]{4,}/);
  if (!token) return null;
  if (/^(payment|amount|confirmation|reference)$/i.test(token[0])) return null;
  return token[0].slice(0, 64);
}

function collect(text: string): Record<Bucket, string> {
  const found: Record<Bucket, string[]> = { payee: [], amount: [], date: [], confirmation: [], memo: [] };
  let current: Bucket | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const label = line.match(LABEL);
    if (label) {
      current = bucketFor(label[1]);
      if (label[2].trim()) found[current].push(label[2].trim());
      continue;
    }
    if (current) found[current].push(line);
  }
  return {
    payee: found.payee.join(" "),
    amount: found.amount.join(" "),
    date: found.date.join(" "),
    confirmation: found.confirmation.join(" "),
    memo: found.memo.join(" "),
  };
}

export function extractReceiptText(text: string): ModelExtraction {
  const labeled = collect(text);
  const fields: ModelExtraction["fields"] = {};

  let payeeName = payee(labeled.payee);
  let amount = money(labeled.amount);
  let transactionDate = printedDate(labeled.date);
  const confirmationNumber = confirmation(labeled.confirmation);
  const description = labeled.memo.replace(/\s+/g, " ").trim() || null;

  if (payeeName) fields.payee_name = "visible";
  if (amount) fields.amount = "visible";
  if (transactionDate) fields.transaction_date = "visible";
  if (confirmationNumber) fields.confirmation_number = "visible";
  if (description) fields.description = "visible";

  if (!payeeName || !amount) {
    const sent = text.match(
      /\b(?:sent|paid)\s+\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s+to\s+([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){0,3})/i,
    );
    if (sent) {
      if (!amount) {
        amount = formatAmount(sent[1].replace(/,/g, ""));
        if (amount) fields.amount = "visible";
      }
      if (!payeeName) {
        payeeName = payee(sent[2].replace(/\s+on\b[\s\S]*$/i, ""));
        if (payeeName) fields.payee_name = "visible";
      }
    }
  }

  if (!amount) {
    const dollars = [...text.matchAll(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/g)]
      .map((match) => formatAmount(match[1].replace(/,/g, "")))
      .filter((value): value is string => Boolean(value));
    const unique = [...new Set(dollars)];
    if (unique.length === 1) {
      amount = unique[0];
      fields.amount = "visible";
    }
  }

  if (!transactionDate) {
    const dates = [...text.matchAll(new RegExp(`\\b(?:${MONTH_WORD})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+20\\d{2}\\b`, "gi"))]
      .map((match) => printedDate(match[0]))
      .filter((value): value is string => Boolean(value));
    const unique = [...new Set(dates)];
    if (unique.length === 1) {
      transactionDate = unique[0];
      fields.transaction_date = "visible";
    }
  }

  return {
    payee_name: payeeName,
    amount,
    transaction_date: transactionDate,
    confirmation_number: confirmationNumber,
    description,
    hours: null,
    fields,
  };
}
