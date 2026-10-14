create or replace function public.payroll_month_totals(p_from date, p_to date)
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
  where period_end >= date_trunc('month', p_from)::date
    and period_end < (date_trunc('month', p_to) + interval '1 month')::date;
$$;

revoke all on function public.payroll_month_totals(date, date) from public;
grant execute on function public.payroll_month_totals(date, date) to authenticated;
