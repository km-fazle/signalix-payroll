-- Demo companies, employees, and reviewed payments. Images are uploaded by scripts/seed-images.mjs.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000a1',
    'authenticated', 'authenticated', 'mara.chen@apexshield.test',
    extensions.crypt('Apex-payroll-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Mara Chen"}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-0000000000b1',
    'authenticated', 'authenticated', 'ellis.ward@northline.test',
    extensions.crypt('Northline-payroll-2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ellis Ward"}'::jsonb,
    now(), now(), '', '', '', '', '', ''
  );

insert into auth.identities (user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
values
  (
    'a0000000-0000-4000-8000-0000000000a1',
    '{"sub":"a0000000-0000-4000-8000-0000000000a1","email":"mara.chen@apexshield.test","email_verified":true}'::jsonb,
    'email', 'a0000000-0000-4000-8000-0000000000a1', now(), now(), now()
  ),
  (
    'b0000000-0000-4000-8000-0000000000b1',
    '{"sub":"b0000000-0000-4000-8000-0000000000b1","email":"ellis.ward@northline.test","email_verified":true}'::jsonb,
    'email', 'b0000000-0000-4000-8000-0000000000b1', now(), now(), now()
  );

insert into public.companies (id, name, slug) values
  ('a0000000-0000-4000-8000-000000000001', 'Apex Shield Security', 'apex-shield'),
  ('b0000000-0000-4000-8000-000000000001', 'Northline Patrol', 'northline');

insert into public.profiles (id, company_id, full_name) values
  ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001', 'Mara Chen'),
  ('b0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-000000000001', 'Ellis Ward');

insert into public.employees (company_id, employee_code, full_name, role_title) values
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1001', 'Jordan Hale', 'Shift lead'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1002', 'Priya Shah', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1003', 'Luis Ortega', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1004', 'Amira Cole', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1005', 'Noah Bennett', 'Rover'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1006', 'Elena Vasquez', 'Shift lead'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1007', 'Marcus Webb', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1008', 'Hannah Cho', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1009', 'Caleb Brooks', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1010', 'Imani Wright', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1011', 'Owen Park', 'Rover'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1012', 'Sofia Marin', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1013', 'Derek Lang', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1014', 'Nina Patel', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1015', 'Felix Grant', 'Security officer'),
  ('a0000000-0000-4000-8000-000000000001', 'ASH-1016', 'Rosa Delgado', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2001', 'Camille Brooks', 'Shift lead'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2002', 'Andre Phillips', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2003', 'Sofia Nguyen', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2004', 'Malik Johnson', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2005', 'Hannah Kim', 'Rover'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2006', 'Victor Alvarez', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2007', 'Grace Donnelly', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2008', 'Samuel Ortiz', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2009', 'Aisha Rahman', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2010', 'Peter Novak', 'Rover'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2011', 'Chloe Martin', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2012', 'Jamal Wright', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2013', 'Lena Cho', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2014', 'Brian Foster', 'Security officer'),
  ('b0000000-0000-4000-8000-000000000001', 'NTL-2015', 'Megan Walsh', 'Security officer');

create temp table seed_pay (
  employee_code text not null,
  amount numeric(12, 2) not null,
  hours numeric(5, 2),
  transaction_date date not null,
  period_start date not null,
  confirmation_number text not null,
  description text not null,
  status text not null,
  ambiguous boolean not null,
  is_duplicate boolean not null,
  shot_id uuid not null default gen_random_uuid(),
  pay_id uuid not null default gen_random_uuid()
);

insert into seed_pay (employee_code, amount, hours, transaction_date, period_start, confirmation_number, description, status, ambiguous, is_duplicate) values
  ('ASH-1001', 610.00, 24, '2026-09-27', '2026-09-21', 'ZEL-A080', 'Shifts Sep 22, 23, 24 — 24 hrs', 'entered_adp', false, false),
  ('ASH-1003', 880.00, 40, '2026-09-27', '2026-09-21', 'ZEL-A081', 'Week ending 9/27/2026 — 40 hrs', 'entered_adp', false, false),
  ('ASH-1005', 530.00, 20, '2026-09-27', '2026-09-21', 'ZEL-A082', 'Sep 21-24 coverage 20 hours', 'entered_adp', false, false),
  ('ASH-1011', 400.00, 16, '2026-09-27', '2026-09-21', 'ZEL-A083', 'Sep 25 and Sep 26 — 16 hrs', 'entered_adp', false, false),
  ('ASH-1001', 600.00, 24, '2026-10-04', '2026-09-28', 'ZEL-A090', 'Sep 29, 30, Oct 1 — 24 hrs', 'entered_adp', false, false),
  ('ASH-1002', 500.00, 20, '2026-10-04', '2026-09-28', 'ZEL-A091', 'Shifts 9/29 and 9/30 20 hrs', 'entered_adp', false, false),
  ('ASH-1003', 900.00, 40, '2026-10-04', '2026-09-28', 'ZEL-A092', 'Week ending 10/04/2026 — 40 hrs', 'entered_adp', false, false),
  ('ASH-1004', 700.00, 32, '2026-10-04', '2026-09-28', 'ZEL-A093', 'Sep 28-Oct 1 32 hours', 'entered_adp', false, false),
  ('ASH-1009', 550.00, 22, '2026-10-04', '2026-09-28', 'ZEL-A094', 'Oct 2 and Oct 3 — 22 hrs', 'entered_adp', false, false),
  ('ASH-1010', 475.75, null, '2026-10-04', '2026-09-28', 'ZEL-A095', 'Payment sent', 'entered_adp', true, false),
  ('ASH-1001', 625.00, 24, '2026-10-12', '2026-10-05', 'ZEL-A100', 'Payroll Oct 9, 10, 11 — 24 hrs', 'entered_adp', false, false),
  ('ASH-1002', 480.00, null, '2026-10-12', '2026-10-05', 'ZEL-A101', 'Shifts 10/6 and 10/7', 'confirmed', false, false),
  ('ASH-1003', 960.00, 40, '2026-10-12', '2026-10-05', 'ZEL-A102', 'Week ending 10/11/2026 — 40 hrs', 'entered_adp', false, false),
  ('ASH-1004', 720.50, 32, '2026-10-12', '2026-10-05', 'ZEL-A103', 'Oct 5-8 coverage 32 hours', 'confirmed', false, false),
  ('ASH-1005', 540.00, 20, '2026-10-12', '2026-10-05', 'ZEL-A104', 'Payroll week of 10/05/2026 20 hrs', 'entered_adp', false, false),
  ('ASH-1006', 810.25, 36, '2026-10-12', '2026-10-05', 'ZEL-A105', 'Oct 8, 9, 10 — 36 hrs', 'confirmed', false, false),
  ('ASH-1007', 450.00, null, '2026-10-12', '2026-10-05', 'ZEL-A106', 'Night differential, week of Oct 5', 'confirmed', false, false),
  ('ASH-1008', 600.00, 24, '2026-10-12', '2026-10-05', 'ZEL-A107', 'Oct 9, 10, 11 24 hours', 'entered_adp', false, false),
  ('ASH-1001', 625.00, 24, '2026-10-12', '2026-10-05', 'ZEL-A100', 'Payroll Oct 9, 10, 11 — 24 hrs', 'confirmed', false, true),
  ('ASH-1006', 300.00, 12, '2026-10-13', '2026-10-12', 'ZEL-A110', 'Oct 12 shift 12 hrs', 'confirmed', false, false),
  ('ASH-1012', 275.00, null, '2026-10-13', '2026-10-12', 'ZEL-A111', 'Payment sent', 'confirmed', true, false),
  ('NTL-2001', 680.00, 32, '2026-10-04', '2026-09-28', 'ZEL-N090', 'Sep 29, 30, Oct 1 — 32 hrs', 'entered_adp', false, false),
  ('NTL-2004', 440.00, 16, '2026-10-04', '2026-09-28', 'ZEL-N091', 'Sep 28 and Sep 30 16 hours', 'entered_adp', false, false),
  ('NTL-2001', 700.00, 32, '2026-10-12', '2026-10-05', 'ZEL-N100', 'Oct 6, 7, 8 — 32 hrs', 'entered_adp', false, false),
  ('NTL-2002', 650.00, 30, '2026-10-12', '2026-10-05', 'ZEL-N101', 'Week ending 10/11 30 hrs', 'entered_adp', false, false),
  ('NTL-2003', 525.25, null, '2026-10-12', '2026-10-05', 'ZEL-N102', 'Thanks for covering', 'confirmed', true, false),
  ('NTL-2001', 700.00, 32, '2026-10-12', '2026-10-05', 'ZEL-N100', 'Oct 6, 7, 8 — 32 hrs', 'confirmed', false, true);

select set_config('app.allow_payment_write', 'on', true);
select set_config('app.payment_write_mode', 'create', true);

insert into public.payment_screenshots (
  id, company_id, storage_path, file_name, mime_type, byte_size, extraction, uploaded_by
)
select
  s.shot_id,
  e.company_id,
  e.company_id::text || '/' || s.shot_id::text || '.png',
  s.confirmation_number || case when s.is_duplicate then '-copy' else '' end || '.png',
  'image/png',
  1024,
  jsonb_build_object(
    'source', 'seed',
    'payee_name', e.full_name,
    'amount', to_char(s.amount, 'FM999999990.00'),
    'transaction_date', s.transaction_date,
    'confirmation_number', s.confirmation_number,
    'description', s.description,
    'hours', case when s.hours is null then null else to_char(s.hours, 'FM999990.00') end
  ),
  p.id
from seed_pay s
join public.employees e on e.employee_code = s.employee_code
join public.profiles p on p.company_id = e.company_id;

insert into public.payments (
  id, company_id, employee_id, screenshot_id, amount, transaction_date, period_start, period_end,
  hours, confirmation_number, description, payee_name_raw, period_was_ambiguous, status,
  counts_toward_totals, duplicate_of, duplicate_flag, extraction, created_by, entered_adp_at, entered_adp_by
)
select
  s.pay_id, e.company_id, e.id, s.shot_id, s.amount, s.transaction_date, s.period_start, s.period_start + 6,
  s.hours, s.confirmation_number, s.description, e.full_name, s.ambiguous, s.status,
  true, null, false, sh.extraction, pr.id,
  case when s.status = 'entered_adp' then now() else null end,
  case when s.status = 'entered_adp' then pr.id else null end
from seed_pay s
join public.employees e on e.employee_code = s.employee_code
join public.profiles pr on pr.company_id = e.company_id
join public.payment_screenshots sh on sh.id = s.shot_id
where not s.is_duplicate;

insert into public.payments (
  id, company_id, employee_id, screenshot_id, amount, transaction_date, period_start, period_end,
  hours, confirmation_number, description, payee_name_raw, period_was_ambiguous, status,
  counts_toward_totals, duplicate_of, duplicate_flag, extraction, created_by
)
select
  s.pay_id, e.company_id, e.id, s.shot_id, s.amount, s.transaction_date, s.period_start, s.period_start + 6,
  s.hours, s.confirmation_number, s.description, e.full_name, s.ambiguous, 'confirmed',
  false, original.id, true, sh.extraction, pr.id
from seed_pay s
join public.employees e on e.employee_code = s.employee_code
join public.profiles pr on pr.company_id = e.company_id
join public.payment_screenshots sh on sh.id = s.shot_id
join public.payments original
  on original.company_id = e.company_id
 and original.confirmation_number = s.confirmation_number
 and original.counts_toward_totals
where s.is_duplicate;

insert into public.payment_events (company_id, payment_id, actor_id, action, after_state)
select company_id, id, created_by, 'created', public.payment_state(p)
from public.payments p;

insert into public.payment_events (company_id, payment_id, actor_id, action, before_state, after_state)
select company_id, id, entered_adp_by, 'entered_adp', public.payment_state(p), public.payment_state(p)
from public.payments p
where status = 'entered_adp';

do $$
declare
  v_week numeric;
  v_october numeric;
  v_september numeric;
  v_northline numeric;
  v_duplicates integer;
begin
  select sum(amount) into v_week
  from public.payments p
  join public.companies c on c.id = p.company_id
  where c.slug = 'apex-shield' and p.counts_toward_totals and p.period_start = '2026-10-05';
  if v_week <> 5185.75 then
    raise exception 'Apex week of 2026-10-05 total is %, expected 5185.75', v_week;
  end if;

  select sum(amount) into v_october
  from public.payments p
  join public.companies c on c.id = p.company_id
  where c.slug = 'apex-shield' and p.counts_toward_totals
    and p.period_end >= '2026-10-01' and p.period_end < '2026-11-01';
  if v_october <> 9486.50 then
    raise exception 'Apex October total is %, expected 9486.50', v_october;
  end if;

  select sum(amount) into v_september
  from public.payments p
  join public.companies c on c.id = p.company_id
  where c.slug = 'apex-shield' and p.counts_toward_totals
    and p.period_end >= '2026-09-01' and p.period_end < '2026-10-01';
  if v_september <> 2420.00 then
    raise exception 'Apex September total is %, expected 2420.00', v_september;
  end if;

  select sum(amount) into v_northline
  from public.payments p
  join public.companies c on c.id = p.company_id
  where c.slug = 'northline' and p.counts_toward_totals and p.period_start = '2026-10-05';
  if v_northline <> 1875.25 then
    raise exception 'Northline week total is %, expected 1875.25', v_northline;
  end if;

  select count(*) into v_duplicates
  from public.payments
  where duplicate_flag and counts_toward_totals;
  if v_duplicates <> 0 then
    raise exception 'Duplicate payments must not count toward totals';
  end if;
end $$;
