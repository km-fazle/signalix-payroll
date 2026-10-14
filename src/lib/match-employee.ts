export type EmployeeRecord = {
  id: string;
  full_name: string;
  employee_code: string;
  active: boolean;
};

export type EmployeeCandidate = EmployeeRecord & {
  score: number;
  reason: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[a.length][b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function matchEmployees(payee: string | null, employees: EmployeeRecord[]): {
  selectedId: string | null;
  candidates: EmployeeCandidate[];
} {
  const query = normalize(payee ?? "");
  if (!query) return { selectedId: null, candidates: [] };

  const [first, ...rest] = query.split(" ");
  const last = rest.at(-1) ?? "";
  const scored: EmployeeCandidate[] = [];

  for (const employee of employees) {
    const name = normalize(employee.full_name);
    const [employeeFirst, ...employeeRest] = name.split(" ");
    const employeeLast = employeeRest.at(-1) ?? "";
    const fullScore = similarity(query, name);
    const lastScore = last ? similarity(last, employeeLast) : 0;
    const firstScore = similarity(first, employeeFirst);
    let score = fullScore;
    let reason = "Name is similar";

    if (name === query) {
      score = 1;
      reason = "Exact name match";
    } else if (last && last === employeeLast && firstScore >= 0.8) {
      score = Math.max(score, 0.9);
      reason = "Last name matches and the first name is close";
    } else if (lastScore >= 0.92 && firstScore >= 0.72) {
      score = Math.max(score, 0.84);
      reason = "Close to an employee name";
    }

    if (score >= 0.72) scored.push({ ...employee, score, reason });
  }

  scored.sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name));
  const top = scored[0];
  const second = scored[1];
  const selectedId =
    top && top.score >= 0.98 && (!second || second.score < 0.9) ? top.id : null;

  return { selectedId, candidates: scored.slice(0, 4) };
}
