-- MoneyMap migration 2: lock down Supabase's "automatic RLS" helper.
-- The project was created with "Enable automatic RLS", which adds the SECURITY DEFINER
-- event-trigger function public.rls_auto_enable(). Supabase's Security Advisor warns
-- that anonymous and signed-in users can execute it. Nobody needs to call it directly
-- (the event trigger still fires without these privileges), so remove them.
-- Safe to run more than once, and a no-op on projects without the function.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
