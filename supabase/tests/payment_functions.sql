-- Tests for migration 3 (resolve_occurrences, undo_payment).
-- Safe to run in the Supabase SQL Editor: one transaction, rolled back at the end.
-- Dates are relative to today (IST), so the test works on any day.
-- Success: the last result is "ALL PAYMENT CHECKS PASSED".

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'pay-test-a@example.invalid', '{}'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'pay-test-b@example.invalid', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

-- b = the 5th of the month three months ago. Payday is 1, so b and b+1 month are before
-- the current pay cycle.
create temp table t_dates on commit drop as
select (date_trunc('month', private.ist_today()) - interval '3 months' + interval '4 days')::date as b;

insert into public.commitments (id, name, kind, tracking_mode, amount_paise, frequency, next_due_date)
select 'aaaaaaaa-5555-4000-8000-000000000001', 'Broadband', 'bill', 'outflow', 100000, 'monthly', b from t_dates;

do $$
declare
  b date := (select b from t_dates);
  m1 date := (b + interval '1 month')::date;
  m2 date := (b + interval '2 months')::date;
  m3 date := (b + interval '3 months')::date;
  m4 date := (b + interval '4 months')::date;
  cid uuid := 'aaaaaaaa-5555-4000-8000-000000000001';
  latest uuid;
begin
  -- Catch up: oldest paid before tracking, next paid; the rest stay unresolved.
  perform public.resolve_occurrences(cid, jsonb_build_array(
    jsonb_build_object('due_date', b, 'outcome', 'paid_unrecorded'),
    jsonb_build_object('due_date', m1, 'outcome', 'paid', 'amount_paise', 100000, 'paid_on', m1 + 1)));
  if (select next_due_date from public.commitments where id = cid) <> m2 then
    raise exception 'FAIL: next due date should be the earliest unresolved date';
  end if;
  raise notice 'PASS: catch up records only the chosen dates and moves next due';

  begin
    perform public.resolve_occurrences(cid, jsonb_build_array(jsonb_build_object('due_date', m2 + 1, 'outcome', 'skipped')));
    raise exception 'FAIL: an off-schedule date was accepted';
  exception when invalid_parameter_value then null; end;

  begin
    perform public.resolve_occurrences(cid, jsonb_build_array(jsonb_build_object('due_date', m1, 'outcome', 'skipped')));
    raise exception 'FAIL: an already recorded date was accepted twice';
  exception when unique_violation then null; end;

  begin
    perform public.resolve_occurrences(cid, '[]'::jsonb);
    raise exception 'FAIL: an empty request was accepted';
  exception when invalid_parameter_value then null; end;
  raise notice 'PASS: off-schedule, duplicate and empty requests are rejected';

  -- Gap: settle m3 while m2 stays open, then m2.
  perform public.resolve_occurrences(cid, jsonb_build_array(jsonb_build_object('due_date', m3, 'outcome', 'skipped')));
  if (select next_due_date from public.commitments where id = cid) <> m2 then
    raise exception 'FAIL: settling a later date moved next due past an open one';
  end if;
  perform public.resolve_occurrences(cid, jsonb_build_array(jsonb_build_object('due_date', m2, 'outcome', 'skipped')));
  if (select next_due_date from public.commitments where id = cid) <> m4 then
    raise exception 'FAIL: next due did not jump over already recorded dates';
  end if;
  raise notice 'PASS: gaps are handled';

  -- Undo: only the latest record.
  begin
    perform public.undo_payment((select id from public.commitment_payments where commitment_id = cid and due_date = m2));
    raise exception 'FAIL: a non-latest payment was undone';
  exception when invalid_parameter_value then null; end;
  latest := (select id from public.commitment_payments where commitment_id = cid and due_date = m3);
  perform public.undo_payment(latest);
  if (select next_due_date from public.commitments where id = cid) <> m3 then
    raise exception 'FAIL: undo did not reopen the date';
  end if;
  raise notice 'PASS: undo removes the latest record and reopens its date';
end $$;

-- One-time items end when settled and come back on undo.
insert into public.commitments (id, name, kind, tracking_mode, amount_paise, frequency, next_due_date)
values ('aaaaaaaa-5555-4000-8000-000000000002', 'Course fee', 'bill', 'outflow', 500000, 'one_time', private.ist_today() + 10);

do $$
declare cid uuid := 'aaaaaaaa-5555-4000-8000-000000000002';
begin
  perform public.resolve_occurrences(cid, jsonb_build_array(jsonb_build_object(
    'due_date', private.ist_today() + 10, 'outcome', 'paid', 'amount_paise', 500000, 'paid_on', private.ist_today())));
  if (select status from public.commitments where id = cid) <> 'ended'
     or (select next_due_date from public.commitments where id = cid) is not null then
    raise exception 'FAIL: a paid one-time item did not end';
  end if;
  perform public.undo_payment((select id from public.commitment_payments where commitment_id = cid));
  if (select status from public.commitments where id = cid) <> 'active'
     or (select next_due_date from public.commitments where id = cid) <> private.ist_today() + 10 then
    raise exception 'FAIL: undo did not restore the one-time item';
  end if;
  raise notice 'PASS: one-time items end when paid and reopen on undo';
end $$;

-- End date: the last instalment ends the item.
insert into public.commitments (id, name, kind, tracking_mode, amount_paise, frequency, next_due_date, end_date)
values ('aaaaaaaa-5555-4000-8000-000000000003', 'Loan', 'loan', 'outflow', 900000, 'monthly',
        private.ist_today() + 1, (private.ist_today() + 1 + interval '1 month')::date);

do $$
declare
  cid uuid := 'aaaaaaaa-5555-4000-8000-000000000003';
  d1 date := private.ist_today() + 1;
  d2 date := (select end_date from public.commitments where id = 'aaaaaaaa-5555-4000-8000-000000000003');
begin
  begin
    perform public.resolve_occurrences(cid, jsonb_build_array(jsonb_build_object(
      'due_date', (d2 + interval '1 month')::date, 'outcome', 'skipped')));
    raise exception 'FAIL: a date after the end date was accepted';
  exception when invalid_parameter_value then null; end;
  perform public.resolve_occurrences(cid, jsonb_build_array(
    jsonb_build_object('due_date', d1, 'outcome', 'skipped'),
    jsonb_build_object('due_date', d2, 'outcome', 'skipped')));
  if (select status from public.commitments where id = cid) <> 'ended' then
    raise exception 'FAIL: the item did not end after its last instalment';
  end if;
  raise notice 'PASS: the end date stops the schedule';
end $$;

-- Schedule edits block undo of older records; cancelled and info items can't be settled.
do $$
declare cid uuid := 'aaaaaaaa-5555-4000-8000-000000000001';
begin
  update public.commitments set next_due_date = next_due_date + 1 where id = cid;
  begin
    perform public.undo_payment((select id from public.commitment_payments where commitment_id = cid order by due_date desc limit 1));
    raise exception 'FAIL: undo allowed after a schedule edit';
  exception when invalid_parameter_value then null; end;

  update public.commitments set status = 'cancelled' where id = cid;
  begin
    perform public.resolve_occurrences(cid, jsonb_build_array(jsonb_build_object(
      'due_date', (select next_due_date from public.commitments where id = cid), 'outcome', 'skipped')));
    raise exception 'FAIL: a cancelled item was settled';
  exception when invalid_parameter_value then null; end;

  insert into public.commitments (id, name, kind, subtype, tracking_mode, frequency, maturity_date)
  values ('aaaaaaaa-5555-4000-8000-000000000004', 'FD', 'investment', 'fd', 'info', 'one_time', private.ist_today() + 300);
  begin
    perform public.resolve_occurrences('aaaaaaaa-5555-4000-8000-000000000004',
      jsonb_build_array(jsonb_build_object('due_date', private.ist_today(), 'outcome', 'skipped')));
    raise exception 'FAIL: an info-only item was settled';
  exception when invalid_parameter_value then null; end;
  raise notice 'PASS: schedule edits, cancelled and info-only items are protected';
end $$;

-- Another user can neither settle nor undo user A's items.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.resolve_occurrences('aaaaaaaa-5555-4000-8000-000000000003',
      jsonb_build_array(jsonb_build_object('due_date', private.ist_today(), 'outcome', 'skipped')));
    raise exception 'FAIL: user B settled user A''s item';
  exception when no_data_found then null; end;
  begin
    perform public.undo_payment((select id from public.commitment_payments limit 1));
    raise exception 'FAIL: user B undid a payment';
  exception when no_data_found then null; end;
  raise notice 'PASS: functions respect row-level security';
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform public.undo_payment(gen_random_uuid());
    raise exception 'FAIL: anonymous visitor could call undo_payment';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: anonymous visitors cannot call the functions';
end $$;

reset role;
rollback;

select 'ALL PAYMENT CHECKS PASSED' as result;
