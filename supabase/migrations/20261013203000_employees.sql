-- Employee directory, profile notes, and paid-hour totals.
-- Totals stay in PostgreSQL. Writes go through company-checked functions.

alter table public.employees
  add column phone text,
  add column email text,
  add column notes text not null default '';

alter table public.employees
  add constraint employees_phone_len check (phone is null or char_length(phone) <= 40),
  add constraint employees_email_len check (email is null or char_length(email) <= 120),
  add constraint employees_notes_len check (char_length(notes) <= 2000);

create table public.employee_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null references public.employees (id),
  body text not null check (char_length(btrim(body)) >= 1 and char_length(body) <= 2000),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index employee_notes_employee_idx on public.employee_notes (employee_id, created_at desc);

alter table public.employee_notes enable row level security;
alter table public.employee_notes force row level security;

create policy employee_notes_select on public.employee_notes
for select to authenticated
using (company_id = public.current_company_id());

revoke all on table public.employee_notes from anon, authenticated;
grant select on table public.employee_notes to authenticated;

create or replace function public.create_employee(
  p_code text,
  p_name text,
  p_role text,
  p_phone text,
  p_email text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.requesting_company_id();
  v_code text := left(btrim(coalesce(p_code, '')), 20);
  v_name text := left(btrim(coalesce(p_name, '')), 80);
  v_role text := nullif(left(btrim(coalesce(p_role, '')), 80), '');
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 40), '');
  v_email text := nullif(left(btrim(coalesce(p_email, '')), 120), '');
  v_notes text := left(btrim(coalesce(p_notes, '')), 2000);
  v_id uuid;
begin
  if char_length(v_name) < 2 then
    raise exception 'VALIDATION: enter the employee name';
  end if;
  if v_code !~ '^[A-Za-z0-9][A-Za-z0-9-]{1,19}$' then
    raise exception 'VALIDATION: employee code uses letters, numbers, and hyphens';
  end if;
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'VALIDATION: enter a valid email or leave it blank';
  end if;

  insert into public.employees (company_id, employee_code, full_name, role_title, phone, email, notes)
  values (v_company, v_code, v_name, v_role, v_phone, v_email, v_notes)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'VALIDATION: that employee code is already used';
end;
$$;

create or replace function public.update_employee(
  p_id uuid,
  p_code text,
  p_name text,
  p_role text,
  p_phone text,
  p_email text,
  p_notes text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.requesting_company_id();
  v_code text := left(btrim(coalesce(p_code, '')), 20);
  v_name text := left(btrim(coalesce(p_name, '')), 80);
  v_role text := nullif(left(btrim(coalesce(p_role, '')), 80), '');
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 40), '');
  v_email text := nullif(left(btrim(coalesce(p_email, '')), 120), '');
  v_notes text := left(btrim(coalesce(p_notes, '')), 2000);
begin
  if char_length(v_name) < 2 then
    raise exception 'VALIDATION: enter the employee name';
  end if;
  if v_code !~ '^[A-Za-z0-9][A-Za-z0-9-]{1,19}$' then
    raise exception 'VALIDATION: employee code uses letters, numbers, and hyphens';
  end if;
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'VALIDATION: enter a valid email or leave it blank';
  end if;

  update public.employees
  set employee_code = v_code,
      full_name = v_name,
      role_title = v_role,
      phone = v_phone,
      email = v_email,
      notes = v_notes,
      active = coalesce(p_active, true)
  where id = p_id
    and company_id = v_company;
  if not found then
    raise exception 'VALIDATION: employee not found';
  end if;
  return p_id;
exception
  when unique_violation then
    raise exception 'VALIDATION: that employee code is already used';
end;
$$;

create or replace function public.add_employee_note(p_employee uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.requesting_company_id();
  v_body text := left(btrim(coalesce(p_body, '')), 2000);
  v_id uuid;
begin
  if char_length(v_body) < 1 then
    raise exception 'VALIDATION: write a note before saving it';
  end if;
  if not exists (
    select 1 from public.employees e where e.id = p_employee and e.company_id = v_company
  ) then
    raise exception 'VALIDATION: employee not found';
  end if;
  insert into public.employee_notes (company_id, employee_id, body, created_by)
  values (v_company, p_employee, v_body, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.employee_payment_rows(
  p_employee uuid,
  p_period date,
  p_status text,
  p_query text
)
returns setof public.payments
language sql
stable
security invoker
set search_path = public
as $$
  select p.*
  from public.payments p
  join public.employees e on e.id = p.employee_id
  where p.employee_id = p_employee
    and e.company_id = public.current_company_id()
    and p.company_id = public.current_company_id()
    and (p_period is null or p.period_start = p_period)
    and (
      coalesce(nullif(btrim(p_status), ''), 'counted') = 'all'
      or (coalesce(nullif(btrim(p_status), ''), 'counted') = 'counted' and p.counts_toward_totals)
      or (p_status = 'awaiting_adp' and p.status = 'confirmed' and p.counts_toward_totals)
      or (p_status = 'entered_adp' and p.status = 'entered_adp' and p.counts_toward_totals)
      or (p_status = 'missing_hours' and p.counts_toward_totals and p.hours is null)
      or (p_status = 'excluded' and p.counts_toward_totals = false)
    )
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or p.confirmation_number ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%'
      or p.description ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%'
    )
  order by p.period_start desc, p.transaction_date desc;
$$;

create or replace function public.employee_payment_totals(
  p_employee uuid,
  p_period date,
  p_status text,
  p_query text
)
returns table (
  total_amount numeric,
  recorded_hours numeric,
  payment_count integer,
  missing_hours_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount), 0),
    sum(hours),
    count(*)::integer,
    count(*) filter (where hours is null)::integer
  from public.employee_payment_rows(p_employee, p_period, p_status, p_query);
$$;

revoke all on function public.create_employee(text, text, text, text, text, text) from public;
revoke all on function public.update_employee(uuid, text, text, text, text, text, text, boolean) from public;
revoke all on function public.add_employee_note(uuid, text) from public;
revoke all on function public.employee_payment_rows(uuid, date, text, text) from public;
revoke all on function public.employee_payment_totals(uuid, date, text, text) from public;

grant execute on function public.create_employee(text, text, text, text, text, text) to authenticated;
grant execute on function public.update_employee(uuid, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.add_employee_note(uuid, text) to authenticated;
grant execute on function public.employee_payment_rows(uuid, date, text, text) to authenticated;
grant execute on function public.employee_payment_totals(uuid, date, text, text) to authenticated;
