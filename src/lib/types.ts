export type FieldState = "visible" | "uncertain" | "missing";

export type ReviewField = "payee_name" | "amount" | "transaction_date" | "confirmation_number" | "description" | "hours";

export type EmployeeOption = {
  id: string;
  full_name: string;
  employee_code: string;
  active: boolean;
  role_title: string | null;
};

export type EmployeeRecord = EmployeeOption & {
  phone: string | null;
  email: string | null;
  notes: string;
};

export type EmployeeNote = {
  id: string;
  body: string;
  created_at: string;
};

export type HourTotals = {
  total_amount: string;
  recorded_hours: string | null;
  payment_count: number;
  missing_hours_count: number;
};

export type PeriodCandidate = {
  start: string;
  end: string;
  dates: string[];
};

export type UploadReview = {
  screenshot_id: string;
  file_name: string;
  preview_url: string | null;
  payee_name: string | null;
  amount: string | null;
  transaction_date: string | null;
  confirmation_number: string | null;
  description: string;
  hours: string | null;
  fields: Record<ReviewField, FieldState>;
  warnings: string[];
  pay_period: {
    status: "confident" | "ambiguous" | "unknown";
    start: string | null;
    end: string | null;
    evidence_dates: string[];
    candidates: PeriodCandidate[];
    reason: string;
  };
  employee: {
    selected_id: string | null;
    candidates: Array<EmployeeOption & { score: number; reason: string }>;
  };
  duplicate: null | {
    payment_id: string;
    employee_name: string;
    period_start: string;
    period_end: string;
    amount: string;
  };
  extraction_error: string | null;
};

export type PaymentRecord = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  amount: string;
  transaction_date: string;
  period_start: string;
  period_end: string;
  hours: string | null;
  confirmation_number: string | null;
  description: string;
  payee_name_raw: string | null;
  status: "confirmed" | "entered_adp" | "void";
  counts_toward_totals: boolean;
  duplicate_flag: boolean;
  duplicate_of: string | null;
  period_was_ambiguous: boolean;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  entered_adp_at: string | null;
  screenshot_url: string | null;
  file_name: string | null;
};

export type PaymentEvent = {
  id: string;
  action: "created" | "corrected" | "entered_adp" | "voided" | "restored";
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
};

export type SummaryRow = {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  period_start: string;
  period_end: string;
  payment_count: number;
  total_amount: string;
  recorded_hours: string | null;
  payments_missing_hours: number;
  entered_count: number;
  awaiting_count: number;
  week_count?: number;
};
