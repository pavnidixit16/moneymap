-- LOCAL TESTING ONLY. Lets PostgREST connect and switch into Supabase's roles.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end $$;
grant anon, authenticated to authenticator;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'tester-a@example.invalid', '{"full_name":"Tester A"}'),
  ('22222222-2222-4222-8222-222222222222', 'tester-b@example.invalid', '{"full_name":"Tester B"}'),
  ('33333333-3333-4333-8333-333333333333', 'tester-c@example.invalid', '{"full_name":"Tester C"}'),
  ('44444444-4444-4444-8444-444444444444', 'tester-g@example.invalid', '{"full_name":"Tester G"}'),
  ('55555555-5555-4555-8555-555555555555', 'deny-d@example.invalid', '{"full_name":"Tester D"}'),
  ('66666666-6666-4666-8666-666666666666', 'noscope-e@example.invalid', '{"full_name":"Tester E"}'),
  ('77777777-7777-4777-8777-777777777771', 'progress-p@example.invalid', '{"full_name":"Tester P"}'),
  ('77777777-7777-4777-8777-777777777772', 'progress-q@example.invalid', '{"full_name":"Tester Q"}'),
  ('77777777-7777-4777-8777-777777777773', 'progress-r@example.invalid', '{"full_name":"Tester R"}'),
  ('77777777-7777-4777-8777-777777777774', 'progress-s@example.invalid', '{"full_name":"Tester S"}'),
  ('77777777-7777-4777-8777-777777777775', 'progress-t@example.invalid', '{"full_name":"Tester T"}'),
  ('88888888-8888-4888-8888-888888888888', 'owner-h@example.invalid', '{"full_name":"Owner H"}')
on conflict do nothing;

-- The owner who may read all feedback (in production this row is added by hand).
insert into public.app_admins (user_id) values ('88888888-8888-4888-8888-888888888888') on conflict do nothing;

-- "Can I afford this?" tests. U: payday on the 1st, ₹1,00,000 take-home, ₹30,000 budget,
-- ₹20,000 spent today, rent ₹25,000 and SIP ₹10,000 due at month end, and a card bill in
-- reminder mode (never counted). Estimate: 1,00,000 − 20,000 − 25,000 − 10,000 = ₹45,000.
-- V: signed up but no income yet.
insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-9999-4999-8999-999999999991', 'afford-u@example.invalid', '{"full_name":"Tester U"}'),
  ('99999999-9999-4999-8999-999999999992', 'afford-v@example.invalid', '{"full_name":"Tester V"}')
on conflict do nothing;
update public.profiles set monthly_income_paise = 10000000, cycle_budget_paise = 3000000, payday_day = 1, onboarded_at = now()
 where id = '99999999-9999-4999-8999-999999999991';
update public.profiles set onboarded_at = now() where id = '99999999-9999-4999-8999-999999999992';
with d as (select (date_trunc('month', (now() at time zone 'Asia/Kolkata')) + interval '1 month - 1 day')::date as month_end)
insert into public.commitments (user_id, name, kind, subtype, tracking_mode, amount_paise, frequency, anchor_day, next_due_date)
select '99999999-9999-4999-8999-999999999991', x.name, x.kind, x.subtype, x.mode, x.amount, 'monthly', extract(day from d.month_end)::int, d.month_end
from d, (values ('Rent', 'bill', 'rent', 'outflow', 2500000), ('SIP', 'investment', 'sip', 'outflow', 1000000), ('HDFC card', 'credit_card', 'credit_card', 'reminder', 1800000)) as x(name, kind, subtype, mode, amount);
insert into public.transactions (user_id, kind, amount_paise, category, occurred_on)
values ('99999999-9999-4999-8999-999999999991', 'expense', 2000000, 'shopping', (now() at time zone 'Asia/Kolkata')::date);
