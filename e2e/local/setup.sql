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
  ('33333333-3333-4333-8333-333333333333', 'tester-c@example.invalid', '{"full_name":"Tester C"}')
on conflict do nothing;
