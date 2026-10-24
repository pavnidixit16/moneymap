-- MoneyMap migration 8: tester feedback.
-- Additive only: two new tables and one helper function. Nothing existing changes.
--
-- feedback_responses  one response per user (sending again replaces it). Fixed answer
--                     codes plus two short optional texts; no amounts, no account details.
-- app_admins          who may read everyone's feedback. Empty until the owner adds
--                     themselves in the SQL Editor (see docs/SETUP.md); the app can never
--                     add or change admins.

create table public.app_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parts_tried text[] not null default '{}'
    check (parts_tried <@ array['dashboard', 'gmail', 'voice', 'document', 'commitments', 'progress']::text[]),
  ease text not null check (ease in ('very_easy', 'easy', 'okay', 'difficult', 'very_difficult')),
  issues text[] not null default '{}'
    check (issues <@ array['incorrect_transaction', 'gmail_privacy', 'estimate_unclear', 'hard_to_find', 'feature_broken', 'none', 'other']::text[]),
  issue_details text check (char_length(issue_details) <= 300),
  return_intent text not null check (return_intent in ('definitely', 'probably', 'not_sure', 'probably_not')),
  comments text check (char_length(comments) <= 1000),
  quote_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_one_per_user unique (user_id)
);

create trigger feedback_updated_at before update on public.feedback_responses
  for each row execute function private.set_updated_at();

-- True when the signed-in user is listed in app_admins. Invoker rights: it only sees the
-- caller's own app_admins row (policy below), so it can't reveal who else is an admin.
create or replace function private.is_app_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
revoke all on function private.is_app_admin() from public, anon;
grant execute on function private.is_app_admin() to authenticated;

-- Privileges: nothing for anonymous visitors. Users can read only whether they themselves
-- are an admin, and can never write app_admins.
revoke all on public.app_admins, public.feedback_responses from public, anon, authenticated;
grant select on public.app_admins to authenticated;
grant select, insert, update on public.feedback_responses to authenticated;

alter table public.app_admins enable row level security;
alter table public.feedback_responses enable row level security;

create policy "Users can see whether they are an admin" on public.app_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Testers see and change only their own response; admins can read all responses.
create policy "Owners and admins can read feedback" on public.feedback_responses
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_app_admin()));
create policy "Owners can send feedback" on public.feedback_responses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners can update their feedback" on public.feedback_responses
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
