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

-- ---------------------------------------------------------------- migration 4 details (as B)
do $$ begin
  insert into public.transactions (kind, amount_paise, category, occurred_on)
  values ('expense', 120000, 'bills', '2026-10-03');

  insert into public.commitments (name, kind, subtype, provider, tracking_mode, amount_paise, coverage_paise, frequency, next_due_date)
  values ('Family floater', 'insurance', 'health', 'Star Health', 'outflow', 2400000, 1000000000, 'yearly', '2027-03-12');

  begin
    insert into public.commitments (name, kind, tracking_mode, amount_paise, coverage_paise, frequency, next_due_date)
    values ('Bad', 'insurance', 'outflow', 100, -1, 'yearly', '2027-03-12');
    raise exception 'FAIL: a negative coverage amount was accepted';
  exception when check_violation then null; end;

  raise notice 'PASS: bills category, provider and coverage are stored';
end $$;

-- ---------------------------------------------------------------- migration 5 smart entry (as B)
do $$ begin
  insert into public.transactions (kind, amount_paise, category, occurred_on, source, client_request_id, payment_method)
  values ('expense', 45000, 'food', '2026-10-21', 'text', 'cccccccc-0000-4000-8000-000000000001', 'upi');
  begin
    insert into public.transactions (kind, amount_paise, category, occurred_on, source, client_request_id)
    values ('expense', 45000, 'food', '2026-10-21', 'text', 'cccccccc-0000-4000-8000-000000000001');
    raise exception 'FAIL: the same confirmation was saved twice';
  exception when unique_violation then null; end;

  -- A genuinely different expense with the same amount and day is allowed.
  insert into public.transactions (kind, amount_paise, category, occurred_on, source, client_request_id)
  values ('expense', 45000, 'food', '2026-10-21', 'text', 'cccccccc-0000-4000-8000-000000000002');

  insert into public.transactions (kind, amount_paise, category, occurred_on, source, source_ref)
  values ('expense', 99900, 'shopping', '2026-10-20', 'document', 'row:2026-10-20|99900|AMAZON');
  begin
    insert into public.transactions (kind, amount_paise, category, occurred_on, source, source_ref)
    values ('expense', 99900, 'shopping', '2026-10-20', 'document', 'row:2026-10-20|99900|AMAZON');
    raise exception 'FAIL: the same statement row was imported twice';
  exception when unique_violation then null; end;

  begin
    insert into public.transactions (kind, amount_paise, category, occurred_on, payment_method)
    values ('expense', 100, 'food', '2026-10-21', 'bitcoin');
    raise exception 'FAIL: an unknown payment method was accepted';
  exception when check_violation then null; end;

  raise notice 'PASS: smart-entry idempotency and import de-duplication hold';
end $$;

-- The same request id belongs to each user separately (no cross-user collision or leak).
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
  insert into public.transactions (kind, amount_paise, category, occurred_on, source, client_request_id)
  values ('expense', 45000, 'food', '2026-10-21', 'text', 'cccccccc-0000-4000-8000-000000000001');
  if (select count(*) from public.transactions where client_request_id = 'cccccccc-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FAIL: user A can see user B''s smart-entry rows';
  end if;
  raise notice 'PASS: request ids are per user and isolated';
end $$;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- ---------------------------------------------------------------- migration 6 Gmail (A, then B)
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
  insert into public.gmail_connections (google_email, encrypted_refresh_token, scope)
  values ('a@example.invalid', 'v1.ciphertext-for-test-only-000000', 'https://www.googleapis.com/auth/gmail.readonly');
  insert into public.gmail_dismissed (message_id) values ('18c2f0a1b2c3d4e5');
  begin
    insert into public.gmail_dismissed (message_id) values ('not a gmail id!');
    raise exception 'FAIL: malformed Gmail message id accepted';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.gmail_connections) <> 0 or (select count(*) from public.gmail_dismissed) <> 0 then
    raise exception 'FAIL: user B can see user A''s Gmail connection or hidden messages';
  end if;
  update public.gmail_connections set status = 'needs_reconnect';
  delete from public.gmail_dismissed;
  begin
    insert into public.gmail_connections (user_id, google_email, encrypted_refresh_token, scope)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'b@example.invalid', 'v1.ciphertext-for-test-only-000000', 'x');
    raise exception 'FAIL: user B wrote a Gmail connection for user A';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.gmail_dismissed (user_id, message_id) values ('aaaaaaaa-0000-4000-8000-000000000001', '18c2f0a1b2c3d4e6');
    raise exception 'FAIL: user B hid a message for user A';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
  if (select status from public.gmail_connections) <> 'connected' or (select count(*) from public.gmail_dismissed) <> 1 then
    raise exception 'FAIL: user B changed user A''s Gmail rows';
  end if;
  raise notice 'PASS: Gmail connections and hidden messages are private to each user';
end $$;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- ---------------------------------------------------------------- migration 7 Progress (A, then B)
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare before_tx int;
begin
  -- Transactions saved earlier in this script already credited today; start the day afresh.
  if (select count(*) from public.daily_checkins where local_date = private.ist_today()) <> 1 then
    raise exception 'FAIL: saving transactions did not credit today''s check-in';
  end if;
  delete from public.daily_checkins;
  select count(*) into before_tx from public.transactions;
  insert into public.daily_checkins (local_date, kind) values (private.ist_today(), 'no_spend');
  if (select count(*) from public.transactions) <> before_tx then
    raise exception 'FAIL: a check-in created a transaction';
  end if;
  -- One check-in per day, whatever the kind.
  begin
    insert into public.daily_checkins (local_date, kind) values (private.ist_today(), 'reviewed_activity');
    raise exception 'FAIL: two check-ins saved for one day';
  exception when unique_violation then null; end;
  -- No backdating or future-dating.
  begin
    insert into public.daily_checkins (local_date, kind) values (private.ist_today() - 1, 'no_spend');
    raise exception 'FAIL: a check-in was saved for another day';
  exception when check_violation then null; end;
  begin
    insert into public.daily_checkins (local_date, kind) values (private.ist_today(), 'saved_money');
    raise exception 'FAIL: unknown check-in kind accepted';
  exception when check_violation or unique_violation then null; end;
  -- Recording an expense dated today turns a no-spend day into a reviewed day.
  insert into public.transactions (kind, amount_paise, category, occurred_on, source)
  values ('expense', 12000, 'food', private.ist_today(), 'text');
  if (select kind from public.daily_checkins where local_date = private.ist_today()) <> 'reviewed_activity' then
    raise exception 'FAIL: recording an expense did not correct the no-spend day';
  end if;
  insert into public.achievements (key) values ('money_mindful');
  begin
    insert into public.achievements (key) values ('money_mindful');
    raise exception 'FAIL: an achievement was earned twice';
  exception when unique_violation then null; end;
  begin
    insert into public.achievements (key) values ('saved_lakhs');
    raise exception 'FAIL: unknown achievement accepted';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.daily_checkins where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') <> 0
     or (select count(*) from public.achievements) <> 0 then
    raise exception 'FAIL: user B can see user A''s check-ins or achievements';
  end if;
  update public.daily_checkins set kind = 'no_spend';
  delete from public.achievements;
  begin
    insert into public.daily_checkins (user_id, local_date, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', private.ist_today(), 'no_spend');
    raise exception 'FAIL: user B checked in for user A';
  exception when insufficient_privilege or unique_violation then null; end;
  -- Sample data never counts as a check-in.
  delete from public.daily_checkins;
  insert into public.transactions (kind, amount_paise, category, occurred_on, source, is_sample)
  values ('expense', 5000, 'food', private.ist_today(), 'sample', true);
  if (select count(*) from public.daily_checkins) <> 0 then
    raise exception 'FAIL: sample data created a check-in';
  end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
  if (select kind from public.daily_checkins) <> 'reviewed_activity' or (select count(*) from public.achievements) <> 1 then
    raise exception 'FAIL: user B changed user A''s check-ins or achievements';
  end if;
  raise notice 'PASS: check-ins are one per day, never create transactions, and are private to each user';
end $$;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- ---------------------------------------------------------------- anonymous visitor
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

do $$
declare t text;
begin
  foreach t in array array['profiles', 'transactions', 'commitments', 'commitment_payments', 'gmail_connections', 'gmail_dismissed', 'daily_checkins', 'achievements'] loop
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
