-- Two-user isolation and integrity test for migration 1.
--
-- Safe to run in the Supabase SQL Editor: everything happens inside one transaction
-- that is rolled back at the end, so no test users or rows are left behind.
-- Success: the output ends with "ALL CHECKS PASSED". Any failure stops the script
-- with an error that starts with "FAIL".

begin;

-- Two throwaway users. The profile trigger must create a profile for each.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'rls-test-a@example.invalid', '{"full_name":"Test A"}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'rls-test-b@example.invalid', '{"full_name":"Test B"}');

do $$ begin
  if (select count(*) from public.profiles
      where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002')) <> 2
  then raise exception 'FAIL: profile trigger did not create exactly two profiles'; end if;
  raise notice 'PASS: profile created automatically for each new user';
end $$;

-- ---------------------------------------------------------------- user A writes
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public.transactions (id, kind, amount_paise, category, occurred_on)
values ('aaaaaaaa-1111-4000-8000-000000000001', 'expense', 400000, 'groceries', '2026-10-02');

insert into public.commitments (id, name, kind, subtype, tracking_mode, amount_paise, frequency, next_due_date)
values ('aaaaaaaa-2222-4000-8000-000000000001', 'Rent', 'bill', 'rent', 'outflow', 2200000, 'monthly', '2026-11-05');

insert into public.commitment_payments (id, commitment_id, due_date, outcome, amount_paise, paid_on)
values ('aaaaaaaa-3333-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-000000000001', '2026-10-05', 'paid', 2200000, '2026-10-05');

do $$ begin
  if (select count(*) from public.transactions) <> 1
     or (select count(*) from public.commitments) <> 1
     or (select count(*) from public.commitment_payments) <> 1
     or (select count(*) from public.profiles) <> 1
  then raise exception 'FAIL: user A cannot see exactly their own rows'; end if;
  if (select anchor_day from public.commitments) <> 5 then
    raise exception 'FAIL: anchor_day was not derived from the first due date';
  end if;
  raise notice 'PASS: user A can create and read their own rows';
end $$;

-- ---------------------------------------------------------------- user B probes
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
declare n int;
begin
  if (select count(*) from public.transactions) <> 0
     or (select count(*) from public.commitments) <> 0
     or (select count(*) from public.commitment_payments) <> 0
  then raise exception 'FAIL: user B can read user A''s rows'; end if;
  if (select count(*) from public.profiles) <> 1
     or (select id from public.profiles) <> 'bbbbbbbb-0000-4000-8000-000000000002'
  then raise exception 'FAIL: user B can see a profile other than their own'; end if;
  raise notice 'PASS: user B cannot read user A''s rows in any table';

  update public.transactions set amount_paise = 1 where id = 'aaaaaaaa-1111-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B updated user A''s transaction'; end if;
  update public.commitments set amount_paise = 1 where id = 'aaaaaaaa-2222-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B updated user A''s commitment'; end if;
  update public.commitment_payments set amount_paise = 1 where id = 'aaaaaaaa-3333-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B updated user A''s payment'; end if;
  update public.profiles set monthly_income_paise = 1 where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B updated user A''s profile'; end if;
  raise notice 'PASS: user B cannot update user A''s rows in any table';

  delete from public.commitment_payments where id = 'aaaaaaaa-3333-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B deleted user A''s payment'; end if;
  delete from public.commitments where id = 'aaaaaaaa-2222-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B deleted user A''s commitment'; end if;
  delete from public.transactions where id = 'aaaaaaaa-1111-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B deleted user A''s transaction'; end if;
  raise notice 'PASS: user B cannot delete user A''s rows in any table';
end $$;

do $$ begin
  begin
    insert into public.transactions (user_id, kind, amount_paise, category, occurred_on)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'expense', 100, 'food', '2026-10-03');
    raise exception 'FAIL: user B inserted a transaction owned by user A';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.commitment_payments (commitment_id, due_date, outcome, amount_paise, paid_on)
    values ('aaaaaaaa-2222-4000-8000-000000000001', '2026-09-05', 'paid', 100, '2026-09-05');
    raise exception 'FAIL: user B attached a payment to user A''s commitment';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.commitment_payments (user_id, commitment_id, due_date, outcome, amount_paise, paid_on)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-000000000001', '2026-09-05', 'paid', 100, '2026-09-05');
    raise exception 'FAIL: user B inserted a payment in user A''s name';
  exception when insufficient_privilege then null; end;

  raise notice 'PASS: user B cannot create rows owned by, or linked to, user A';
end $$;

do $$ begin
  insert into public.commitments (id, name, kind, tracking_mode, amount_paise, frequency, next_due_date)
  values ('bbbbbbbb-2222-4000-8000-000000000002', 'Netflix', 'subscription', 'outflow', 64900, 'monthly', '2026-10-28');
  begin
    update public.commitments set user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
    where id = 'bbbbbbbb-2222-4000-8000-000000000002';
    raise exception 'FAIL: user B moved their row to user A';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.profiles (id) values (gen_random_uuid());
    raise exception 'FAIL: a client could insert a profile';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profiles;
    raise exception 'FAIL: a client could delete a profile';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set currency = 'USD';
    raise exception 'FAIL: a client could change a protected profile column';
  exception when insufficient_privilege then null; end;
  begin
    perform private.handle_new_user();
    raise exception 'FAIL: a client could call the security-definer trigger function';
  exception when insufficient_privilege or feature_not_supported then null; end;

  raise notice 'PASS: ownership cannot be changed; profiles are trigger-managed';
end $$;

-- ---------------------------------------------------------------- integrity rules (as B)
do $$ begin
  begin
    insert into public.commitment_payments (commitment_id, due_date, outcome, amount_paise, paid_on)
    values ('bbbbbbbb-2222-4000-8000-000000000002', '2026-10-28', 'paid', 64900, private.ist_today() + 1);
    raise exception 'FAIL: a payment with a future paid date was accepted';
  exception when invalid_parameter_value then null; end;

  begin
    insert into public.commitment_payments (commitment_id, due_date, outcome)
    values ('bbbbbbbb-2222-4000-8000-000000000002', private.ist_today(), 'paid_unrecorded');
    raise exception 'FAIL: paid_unrecorded accepted for a date in the current pay cycle';
  exception when invalid_parameter_value then null; end;

  begin
    insert into public.commitment_payments (commitment_id, due_date, outcome, amount_paise)
    values ('bbbbbbbb-2222-4000-8000-000000000002', '2026-07-28', 'skipped', 100);
    raise exception 'FAIL: a skipped record with an amount was accepted';
  exception when check_violation then null; end;

  begin
    insert into public.commitments (name, kind, subtype, tracking_mode, frequency, next_due_date, maturity_date)
    values ('FD', 'investment', 'fd', 'info', 'one_time', '2026-11-15', '2026-11-15');
    raise exception 'FAIL: an info item with a due date was accepted';
  exception when check_violation then null; end;

  begin
    insert into public.commitments (name, kind, tracking_mode, amount_paise, frequency)
    values ('Gym', 'subscription', 'outflow', 150000, 'monthly');
    raise exception 'FAIL: an active outflow item without a due date was accepted';
  exception when check_violation then null; end;

  begin
    insert into public.commitments (name, kind, tracking_mode, amount_paise, frequency, next_due_date)
    values ('Mystery', 'bill', 'outflow', 0, 'monthly', '2026-11-01');
    raise exception 'FAIL: an outflow item with a zero amount was accepted';
  exception when check_violation then null; end;

  begin
    insert into public.transactions (kind, amount_paise, category, occurred_on)
    values ('expense', 100, 'income', '2026-10-03');
    raise exception 'FAIL: an expense with the income category was accepted';
  exception when check_violation then null; end;

  begin
    insert into public.transactions (kind, amount_paise, category, occurred_on)
    values ('expense', 100, 'rent', '2026-10-03');
    raise exception 'FAIL: rent was accepted as an expense category';
  exception when check_violation then null; end;

  insert into public.commitments (id, name, kind, subtype, tracking_mode, frequency, maturity_date, amount_paise)
  values ('bbbbbbbb-4444-4000-8000-000000000002', 'FD', 'investment', 'fd', 'info', 'one_time', '2026-11-15', 10000000);
  begin
    insert into public.commitment_payments (commitment_id, due_date, outcome, amount_paise, paid_on)
    values ('bbbbbbbb-4444-4000-8000-000000000002', '2026-10-01', 'paid', 100, '2026-10-01');
    raise exception 'FAIL: an info-only item was marked paid';
  exception when invalid_parameter_value then null; end;

  raise notice 'PASS: data integrity rules reject invalid records';
end $$;

do $$
declare before_ts timestamptz;
begin
  select schedule_updated_at into before_ts from public.commitments where id = 'bbbbbbbb-2222-4000-8000-000000000002';
  perform set_config('moneymap.internal', 'on', true);
  update public.commitments set next_due_date = '2026-11-28' where id = 'bbbbbbbb-2222-4000-8000-000000000002';
  perform set_config('moneymap.internal', '', true);
  if (select schedule_updated_at from public.commitments where id = 'bbbbbbbb-2222-4000-8000-000000000002') <> before_ts then
    raise exception 'FAIL: an internal due-date advance counted as a schedule edit';
  end if;
  update public.commitments set amount_paise = 79900 where id = 'bbbbbbbb-2222-4000-8000-000000000002';
  if (select previous_amount_paise from public.commitments where id = 'bbbbbbbb-2222-4000-8000-000000000002') <> 64900 then
    raise exception 'FAIL: price increase was not recorded';
  end if;
  raise notice 'PASS: schedule-edit tracking and price-increase history work';
end $$;

-- ---------------------------------------------------------------- anonymous visitor
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

do $$
declare t text;
begin
  foreach t in array array['profiles', 'transactions', 'commitments', 'commitment_payments'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'FAIL: anonymous visitor could query %', t;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS: anonymous visitors cannot query any table';
end $$;

reset role;
rollback;

-- Only reached when every check above passed.
select 'ALL CHECKS PASSED' as result;
