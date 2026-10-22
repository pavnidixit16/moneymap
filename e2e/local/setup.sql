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
  ('66666666-6666-4666-8666-666666666666', 'noscope-e@example.invalid', '{"full_name":"Tester E"}')
on conflict do nothing;
