# Signalix Payroll

Administrators upload Zelle screenshots, confirm what was actually paid, and reconcile weekly payroll before it is typed into ADP. Two companies are seeded and cannot see each other.

## Run

Requires Docker, Node.js 24, and a vision-model key.

```bash
make setup   # install, start Supabase CLI 2.119.0, migrate, seed, write .env.local
make dev     # http://localhost:3000
```

Put `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY` in `.env.local` and set `LLM_PROVIDER` to `openai`, `anthropic`, or `google`. `make setup` preserves keys already there. Sample screenshots are in `examples/screenshots` and on the Upload page under Review samples.

| Company | Email | Password |
|---|---|---|
| Apex Shield Security | mara.chen@apexshield.test | Apex-payroll-2026 |
| Northline Patrol | ellis.ward@northline.test | Northline-payroll-2026 |

## Extraction

`POST /api/payments/upload` stores each image in a private bucket, then asks the vision model for the payee, amount, payment date, confirmation, note, and hours. The model is instructed to return null rather than guess. The server ignores instructions printed inside a screenshot, keeps amount digits as text, and drops hours unless the note itself prints an hours figure. Pay period is not trusted to the model. A payroll week is Monday–Sunday: `Oct 9, 10, 11` in 2026 becomes `10/05/2026–10/11/2026`. Dates in two weeks, or notes like “last week,” stay unassigned until an administrator picks the week. Employees are matched to the company directory and are never created from a name. A repeated confirmation is saved only if the administrator accepts it, and that copy is excluded from totals.

Nothing is payroll until `POST /api/payments`. `PATCH /api/payments/{id}` either corrects fields or, separately, marks ADP entry. Marking ADP sends no financial fields; the database rejects a reconciliation update that changes them.

## Data and security

`companies`, `profiles`, `employees`, `payment_screenshots`, `payments`, and `payment_events`. Counted totals live in `payroll_week_summary`, `payroll_month_summary`, and `payroll_totals`. A month is the calendar month of the week’s Sunday. Amounts are `numeric`; the API formats the returned decimal strings and does not add them in JavaScript. Every correction, ADP mark, exclusion, and restore is appended to `payment_events`. The original extraction JSON and screenshot cannot be overwritten.

Row Level Security forces every table to the signed-in profile’s company. The browser uses the anon key and the user session. The service role is used only by the seed script and is not a `NEXT_PUBLIC` variable. Screenshots are in a private bucket keyed by company id. Signup is disabled.

## Tradeoffs

The vision step can be wrong, so a person confirms every payment and missing fields stay blank. Hours that appear only as a figure outside the note are not prefilled. Duplicate confirmations are kept as evidence instead of deleted, and they do not count. The CSV is a reconciliation report (employee, payroll period, total, hours, ADP status), not an ADP import file. There is no ADP submission, tax calculation, or employee self-service.
