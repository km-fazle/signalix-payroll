-- Signalix payroll. PostgreSQL owns totals, duplicates, and the audit trail.
-- Weeks run Monday through Sunday. A month is the calendar month of the week's Sunday.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id),
  full_name text not null,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_code text not null,
  full_name text not null,
  role_title text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, employee_code)
);

create table public.payment_screenshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  extraction jsonb,
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null references public.employees (id),
  screenshot_id uuid not null unique references public.payment_screenshots (id),
  amount numeric(12, 2) not null check (amount > 0),
  transaction_date date not null,
  period_start date not null,
  period_end date not null,
  hours numeric(5, 2),
  confirmation_number text,
  description text not null default '',
  payee_name_raw text,
  period_was_ambiguous boolean not null default false,
  status text not null check (status in ('confirmed', 'entered_adp', 'void')),
  counts_toward_totals boolean not null default true,
  duplicate_of uuid references public.payments (id),
  duplicate_flag boolean not null default false,
  extraction jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  entered_adp_at timestamptz,
  entered_adp_by uuid references auth.users (id),
  void_reason text,
  check (period_end = period_start + 6),
  check (extract(isodow from period_start) = 1),
  check (hours is null or (hours > 0 and hours <= 168)),
  check (duplicate_flag = (duplicate_of is not null)),
  check (
    counts_toward_totals = false
    or (status in ('confirmed', 'entered_adp') and duplicate_of is null)
  )
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  payment_id uuid not null references public.payments (id),
  actor_id uuid references auth.users (id),
  action text not null check (action in ('created', 'corrected', 'entered_adp', 'voided', 'restored')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create unique index payments_counted_confirmation_uidx
  on public.payments (company_id, lower(confirmation_number))
  where counts_toward_totals and confirmation_number is not null;

create index payments_company_period_idx on public.payments (company_id, period_start, period_end);
create index payments_company_employee_idx on public.payments (company_id, employee_id);
create index payments_company_status_idx on public.payments (company_id, status);
create index payment_events_payment_idx on public.payment_events (payment_id, created_at);
create index employees_company_name_idx on public.employees (company_id, full_name);

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.payment_state(p public.payments)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'employee_id', p.employee_id,
    'amount', to_char(p.amount, 'FM999999990.00'),
    'transaction_date', p.transaction_date,
    'period_start', p.period_start,
    'period_end', p.period_end,
    'hours', case when p.hours is null then null else to_char(p.hours, 'FM999990.00') end,
    'confirmation_number', p.confirmation_number,
    'description', p.description,
    'status', p.status,
    'counts_toward_totals', p.counts_toward_totals,
    'duplicate_of', p.duplicate_of,
    'duplicate_flag', p.duplicate_flag,
    'void_reason', p.void_reason
  );
$$;

create or replace function public.guard_payment_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'VALIDATION: payments cannot be deleted';
  end if;

  if current_setting('app.allow_payment_write', true) is distinct from 'on' then
    raise exception 'VALIDATION: payments change only through reviewed payroll actions';
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id
      or new.screenshot_id is distinct from old.screenshot_id
      or new.extraction is distinct from old.extraction
      or new.payee_name_raw is distinct from old.payee_name_raw
      or new.period_was_ambiguous is distinct from old.period_was_ambiguous
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or new.id is distinct from old.id
    then
      raise exception 'VALIDATION: original payment evidence cannot be changed';
    end if;

    if current_setting('app.payment_write_mode', true) = 'reconcile' then
      if new.amount is distinct from old.amount
        or new.hours is distinct from old.hours
        or new.employee_id is distinct from old.employee_id
        or new.period_start is distinct from old.period_start
        or new.period_end is distinct from old.period_end
        or new.transaction_date is distinct from old.transaction_date
        or new.confirmation_number is distinct from old.confirmation_number
        or new.description is distinct from old.description
        or new.counts_toward_totals is distinct from old.counts_toward_totals
        or new.duplicate_of is distinct from old.duplicate_of
        or new.duplicate_flag is distinct from old.duplicate_flag
      then
        raise exception 'VALIDATION: reconciliation cannot change financial values';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger payments_guard
before insert or update or delete on public.payments
for each row execute function public.guard_payment_write();

create or replace function public.payments_match_company()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.employees e
    where e.id = new.employee_id and e.company_id = new.company_id
  ) then
    raise exception 'VALIDATION: employee is not in this company';
  end if;

  if not exists (
    select 1 from public.payment_screenshots s
    where s.id = new.screenshot_id and s.company_id = new.company_id
  ) then
    raise exception 'VALIDATION: screenshot is not in this company';
  end if;

  return new;
end;
$$;

create trigger payments_company_match
before insert or update of employee_id, screenshot_id, company_id on public.payments
for each row execute function public.payments_match_company();

create or replace function public.requesting_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH: sign in required' using errcode = '28000';
  end if;
  select company_id into v_company from public.profiles where id = auth.uid();
  if v_company is null then
    raise exception 'AUTH: no company membership' using errcode = '42501';
  end if;
  return v_company;
end;
$$;

create or replace function public.parse_money(p_amount text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_amount numeric;
begin
  if p_amount is null or p_amount !~ '^[0-9]+(\.[0-9]{1,2})?$' then
    raise exception 'VALIDATION: amount must be a positive decimal with at most 2 places';
  end if;
  v_amount := p_amount::numeric;
  if v_amount <= 0 then
    raise exception 'VALIDATION: amount must be positive';
  end if;
  return v_amount;
end;
$$;

create or replace function public.parse_hours(p_hours text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_hours numeric;
begin
  if p_hours is null or btrim(p_hours) = '' then
    return null;
  end if;
  if p_hours !~ '^[0-9]+(\.[0-9]{1,2})?$' then
    raise exception 'VALIDATION: hours must be a decimal with at most 2 places';
  end if;
  v_hours := p_hours::numeric;
  if v_hours <= 0 or v_hours > 168 then
    raise exception 'VALIDATION: hours must be greater than 0 and at most 168';
  end if;
  return v_hours;
end;
$$;

create or replace function public.assert_payroll_week(p_start date, p_end date)
returns void
language plpgsql
immutable
as $$
begin
  if p_start is null or p_end is null
    or extract(isodow from p_start) <> 1
    or p_end <> p_start + 6
  then
    raise exception 'VALIDATION: payroll period must be a Monday–Sunday week';
  end if;
end;
$$;

create or replace function public.find_counted_duplicate(
  p_company uuid,
  p_confirmation text,
  p_except uuid
)
returns uuid
language sql
stable
set search_path = public
as $$
  select id
  from public.payments
  where company_id = p_company
    and p_confirmation is not null
    and lower(confirmation_number) = lower(p_confirmation)
    and counts_toward_totals
    and (p_except is null or id <> p_except)
  limit 1
$$;

create or replace function public.create_reviewed_payment(
  p_screenshot_id uuid,
  p_employee_id uuid,
  p_amount text,
  p_transaction_date date,
  p_period_start date,
  p_period_end date,
  p_hours text,
  p_confirmation_number text,
  p_description text,
  p_payee_name_raw text,
  p_period_ambiguous boolean,
  p_acknowledge_duplicate boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.requesting_company_id();
  v_uid uuid := auth.uid();
  v_amount numeric := public.parse_money(p_amount);
  v_hours numeric := public.parse_hours(p_hours);
  v_conf text := nullif(left(btrim(coalesce(p_confirmation_number, '')), 64), '');
  v_description text := left(btrim(coalesce(p_description, '')), 2000);
  v_dup uuid;
  v_extraction jsonb;
  v_row public.payments;
begin
  perform public.assert_payroll_week(p_period_start, p_period_end);
  if p_transaction_date is null then
    raise exception 'VALIDATION: transaction date is required';
  end if;

  if not exists (
    select 1 from public.payment_screenshots s
    where s.id = p_screenshot_id and s.company_id = v_company and s.uploaded_by = v_uid
  ) then
    raise exception 'VALIDATION: screenshot not found';
  end if;

  if exists (select 1 from public.payments where screenshot_id = p_screenshot_id) then
    raise exception 'VALIDATION: this screenshot is already saved';
  end if;

  if not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = v_company
  ) then
    raise exception 'VALIDATION: choose an employee from this company';
  end if;

  v_dup := public.find_counted_duplicate(v_company, v_conf, null);
  if v_dup is not null and coalesce(p_acknowledge_duplicate, false) = false then
    raise exception 'DUPLICATE' using errcode = 'P0001', detail = v_dup::text;
  end if;

  select coalesce(extraction, '{}'::jsonb) into v_extraction
  from public.payment_screenshots
  where id = p_screenshot_id;

  perform set_config('app.allow_payment_write', 'on', true);
  perform set_config('app.payment_write_mode', 'create', true);

  insert into public.payments (
    company_id, employee_id, screenshot_id, amount, transaction_date,
    period_start, period_end, hours, confirmation_number, description,
    payee_name_raw, period_was_ambiguous, status, counts_toward_totals,
    duplicate_of, duplicate_flag, extraction, created_by
  ) values (
    v_company, p_employee_id, p_screenshot_id, v_amount, p_transaction_date,
    p_period_start, p_period_end, v_hours, v_conf, v_description,
    nullif(left(btrim(coalesce(p_payee_name_raw, '')), 120), ''),
    coalesce(p_period_ambiguous, false),
    'confirmed',
    v_dup is null,
    v_dup,
    v_dup is not null,
    v_extraction,
    v_uid
  )
  returning * into v_row;

  insert into public.payment_events (company_id, payment_id, actor_id, action, after_state)
  values (v_company, v_row.id, v_uid, 'created', public.payment_state(v_row));

  return v_row.id;
exception
  when unique_violation then
    raise exception 'DUPLICATE' using errcode = 'P0001';
end;
$$;

create or replace function public.correct_payment(
  p_id uuid,
  p_employee_id uuid,
  p_amount text,
  p_transaction_date date,
  p_period_start date,
  p_period_end date,
  p_hours text,
  p_confirmation_number text,
  p_description text,
  p_acknowledge_duplicate boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.requesting_company_id();
  v_uid uuid := auth.uid();
  v_old public.payments;
  v_new public.payments;
  v_amount numeric := public.parse_money(p_amount);
  v_hours numeric := public.parse_hours(p_hours);
  v_conf text := nullif(left(btrim(coalesce(p_confirmation_number, '')), 64), '');
  v_description text := left(btrim(coalesce(p_description, '')), 2000);
  v_dup uuid;
  v_counts boolean;
begin
  perform public.assert_payroll_week(p_period_start, p_period_end);
  if p_transaction_date is null then
    raise exception 'VALIDATION: transaction date is required';
  end if;

  select * into v_old from public.payments where id = p_id and company_id = v_company;
  if not found then
    raise exception 'VALIDATION: payment not found';
  end if;
  if v_old.status = 'void' then
    raise exception 'VALIDATION: restore a voided payment before correcting it';
  end if;
  if not exists (
    select 1 from public.employees e where e.id = p_employee_id and e.company_id = v_company
  ) then
    raise exception 'VALIDATION: choose an employee from this company';
  end if;

  v_dup := public.find_counted_duplicate(v_company, v_conf, p_id);
  if v_dup is not null and coalesce(p_acknowledge_duplicate, false) = false then
    raise exception 'DUPLICATE' using errcode = 'P0001', detail = v_dup::text;
  end if;

  v_counts := v_dup is null;
  perform set_config('app.allow_payment_write', 'on', true);
  perform set_config('app.payment_write_mode', 'correct', true);

  update public.payments
  set employee_id = p_employee_id,
      amount = v_amount,
      transaction_date = p_transaction_date,
      period_start = p_period_start,
      period_end = p_period_end,
      hours = v_hours,
      confirmation_number = v_conf,
      description = v_description,
      counts_toward_totals = v_counts,
      duplicate_of = v_dup,
      duplicate_flag = v_dup is not null,
      updated_at = now()
  where id = p_id
  returning * into v_new;

  insert into public.payment_events (company_id, payment_id, actor_id, action, before_state, after_state)
  values (v_company, p_id, v_uid, 'corrected', public.payment_state(v_old), public.payment_state(v_new));

  return p_id;
exception
  when unique_violation then
    raise exception 'DUPLICATE' using errcode = 'P0001';
end;
$$;

create or replace function public.mark_payment_entered_adp(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.requesting_company_id();
  v_uid uuid := auth.uid();
  v_old public.payments;
  v_new public.payments;
begin
  select * into v_old from public.payments where id = p_id and company_id = v_company;
  if not found then
    raise exception 'VALIDATION: payment not found';
  end if;
  if v_old.status = 'entered_adp' then
    return p_id;
  end if;
  if v_old.status <> 'confirmed' or v_old.counts_toward_totals = false then
    raise exception 'VALIDATION: only a counted, confirmed payment can be marked entered in ADP';
  end if;

  perform set_config('app.allow_payment_write', 'on', true);
  perform set_config('app.payment_write_mode', 'reconcile', true);

  update public.payments
  set status = 'entered_adp',
      entered_adp_at = now(),
      entered_adp_by = v_uid,
      updated_at = now()
  where id = p_id
  returning * into v_new;

  insert into public.payment_events (company_id, payment_id, actor_id, action, before_state, after_state)
  values (v_company, p_id, v_uid, 'entered_adp', public.payment_state(v_old), public.payment_state(v_new));

  return p_id;
end;
$$;

create or replace function public.void_payment(p_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.requesting_company_id();
  v_uid uuid := auth.uid();
  v_old public.payments;
  v_new public.payments;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  if v_reason = '' then
    raise exception 'VALIDATION: a reason is required to exclude a payment';
  end if;
  select * into v_old from public.payments where id = p_id and company_id = v_company;
  if not found then
    raise exception 'VALIDATION: payment not found';
  end if;
  if v_old.status = 'void' then
    return p_id;
  end if;

  perform set_config('app.allow_payment_write', 'on', true);
  perform set_config('app.payment_write_mode', 'correct', true);

  update public.payments
  set status = 'void',
      counts_toward_totals = false,
      void_reason = v_reason,
      updated_at = now()
  where id = p_id
  returning * into v_new;

  insert into public.payment_events (company_id, payment_id, actor_id, action, before_state, after_state)
  values (v_company, p_id, v_uid, 'voided', public.payment_state(v_old), public.payment_state(v_new));

  return p_id;
end;
$$;

create or replace function public.restore_payment(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.requesting_company_id();
  v_uid uuid := auth.uid();
  v_old public.payments;
  v_new public.payments;
  v_dup uuid;
begin
  select * into v_old from public.payments where id = p_id and company_id = v_company;
  if not found then
    raise exception 'VALIDATION: payment not found';
  end if;
  if v_old.status <> 'void' then
    raise exception 'VALIDATION: only an excluded payment can be restored';
  end if;

  v_dup := public.find_counted_duplicate(v_company, v_old.confirmation_number, p_id);

  perform set_config('app.allow_payment_write', 'on', true);
  perform set_config('app.payment_write_mode', 'correct', true);

  update public.payments
  set status = 'confirmed',
      counts_toward_totals = v_dup is null,
      duplicate_of = v_dup,
      duplicate_flag = v_dup is not null,
      void_reason = null,
      updated_at = now()
  where id = p_id
  returning * into v_new;

  insert into public.payment_events (company_id, payment_id, actor_id, action, before_state, after_state)
  values (v_company, p_id, v_uid, 'restored', public.payment_state(v_old), public.payment_state(v_new));

  return p_id;
exception
  when unique_violation then
    raise exception 'DUPLICATE' using errcode = 'P0001';
end;
$$;

create or replace view public.counted_payments
with (security_invoker = true) as
select *
from public.payments
where counts_toward_totals
  and status in ('confirmed', 'entered_adp');

create or replace function public.payroll_week_summary(p_from date, p_to date)
returns table (
  employee_id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
  payment_count integer,
  total_amount numeric,
  recorded_hours numeric,
  payments_missing_hours integer,
  entered_count integer,
  awaiting_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id,
    e.employee_code,
    e.full_name,
    p.period_start,
    p.period_end,
    count(*)::integer,
    sum(p.amount),
    sum(p.hours),
    count(*) filter (where p.hours is null)::integer,
    count(*) filter (where p.status = 'entered_adp')::integer,
    count(*) filter (where p.status = 'confirmed')::integer
  from public.counted_payments p
  join public.employees e on e.id = p.employee_id
  where p.period_end >= p_from
    and p.period_start <= p_to
  group by e.id, e.employee_code, e.full_name, p.period_start, p.period_end
  order by p.period_start, e.full_name;
$$;

create or replace function public.payroll_month_summary(p_from date, p_to date)
returns table (
  employee_id uuid,
  employee_code text,
  employee_name text,
  period_start date,
  period_end date,
  payment_count integer,
  total_amount numeric,
  recorded_hours numeric,
  payments_missing_hours integer,
  entered_count integer,
  awaiting_count integer,
  week_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id,
    e.employee_code,
    e.full_name,
    date_trunc('month', p.period_end)::date,
    (date_trunc('month', p.period_end) + interval '1 month' - interval '1 day')::date,
    count(*)::integer,
    sum(p.amount),
    sum(p.hours),
    count(*) filter (where p.hours is null)::integer,
    count(*) filter (where p.status = 'entered_adp')::integer,
    count(*) filter (where p.status = 'confirmed')::integer,
    count(distinct p.period_start)::integer
  from public.counted_payments p
  join public.employees e on e.id = p.employee_id
  where p.period_end >= date_trunc('month', p_from)::date
    and p.period_end < (date_trunc('month', p_to) + interval '1 month')::date
  group by e.id, e.employee_code, e.full_name, date_trunc('month', p.period_end)
  order by date_trunc('month', p.period_end), e.full_name;
$$;

create or replace function public.payroll_totals(p_from date, p_to date)
returns table (
  total_amount numeric,
  payment_count integer,
  recorded_hours numeric,
  awaiting_count integer,
  entered_count integer,
  missing_hours_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount), 0),
    count(*)::integer,
    sum(hours),
    count(*) filter (where status = 'confirmed')::integer,
    count(*) filter (where status = 'entered_adp')::integer,
    count(*) filter (where hours is null)::integer
  from public.counted_payments
  where period_end >= p_from
    and period_start <= p_to;
$$;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.payment_screenshots enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

alter table public.companies force row level security;
alter table public.profiles force row level security;
alter table public.employees force row level security;
alter table public.payment_screenshots force row level security;
alter table public.payments force row level security;
alter table public.payment_events force row level security;

create policy companies_select on public.companies
for select to authenticated
using (id = public.current_company_id());

create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid());

create policy employees_select on public.employees
for select to authenticated
using (company_id = public.current_company_id());

create policy screenshots_select on public.payment_screenshots
for select to authenticated
using (company_id = public.current_company_id());

create policy screenshots_insert on public.payment_screenshots
for insert to authenticated
with check (company_id = public.current_company_id() and uploaded_by = auth.uid());

create policy payments_select on public.payments
for select to authenticated
using (company_id = public.current_company_id());

create policy events_select on public.payment_events
for select to authenticated
using (company_id = public.current_company_id());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-screenshots',
  'payment-screenshots',
  false,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
);

create policy screenshots_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'payment-screenshots'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

create policy screenshots_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'payment-screenshots'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

revoke all on table public.companies from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.employees from anon, authenticated;
revoke all on table public.payment_screenshots from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.payment_events from anon, authenticated;

grant select on table public.companies to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.employees to authenticated;
grant select, insert on table public.payment_screenshots to authenticated;
grant select on table public.payments to authenticated;
grant select on table public.payment_events to authenticated;
grant select on table public.counted_payments to authenticated;

revoke all on function public.current_company_id() from public;
revoke all on function public.payment_state(public.payments) from public;
revoke all on function public.guard_payment_write() from public;
revoke all on function public.payments_match_company() from public;
revoke all on function public.requesting_company_id() from public;
revoke all on function public.parse_money(text) from public;
revoke all on function public.parse_hours(text) from public;
revoke all on function public.assert_payroll_week(date, date) from public;
revoke all on function public.find_counted_duplicate(uuid, text, uuid) from public;
revoke all on function public.create_reviewed_payment(uuid, uuid, text, date, date, date, text, text, text, text, boolean, boolean) from public;
revoke all on function public.correct_payment(uuid, uuid, text, date, date, date, text, text, text, boolean) from public;
revoke all on function public.mark_payment_entered_adp(uuid) from public;
revoke all on function public.void_payment(uuid, text) from public;
revoke all on function public.restore_payment(uuid) from public;
revoke all on function public.payroll_week_summary(date, date) from public;
revoke all on function public.payroll_month_summary(date, date) from public;
revoke all on function public.payroll_totals(date, date) from public;

grant execute on function public.current_company_id() to authenticated;
grant execute on function public.create_reviewed_payment(uuid, uuid, text, date, date, date, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.correct_payment(uuid, uuid, text, date, date, date, text, text, text, boolean) to authenticated;
grant execute on function public.mark_payment_entered_adp(uuid) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.restore_payment(uuid) to authenticated;
grant execute on function public.payroll_week_summary(date, date) to authenticated;
grant execute on function public.payroll_month_summary(date, date) to authenticated;
grant execute on function public.payroll_totals(date, date) to authenticated;
