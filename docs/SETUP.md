# MoneyMap setup guide (beginner-friendly)

Do these in order. Each step ends with a **Check** so you know it worked before moving
on. You never need to paste a password, secret key or access token into a chat: secrets
go straight into the provider's own settings page.

| Value | Secret? | Where it lives |
|---|---|---|
| Supabase database password | **Secret** | Your password manager only |
| Supabase project URL | Public | Vercel env var, `.env.local` |
| Supabase publishable key (`sb_publishable_…`) | Public (protected by row-level security) | Vercel env var, `.env.local` |
| Supabase secret / service-role key | **Secret** | Not used by the MVP. Don't copy it anywhere. |
| Google OAuth client ID | Public | Supabase Google provider settings |
| Google OAuth client secret | **Secret** | Pasted directly into Supabase, nowhere else |

---

## Step 1 — GitHub repository

1. Go to <https://github.com/new>.
2. **Repository name:** `moneymap`. **Visibility:** Private (recommended).
3. Leave "Add a README", ".gitignore" and "license" **unticked** (the project already has
   them). Click **Create repository**.
4. Give Claude access: open <https://claude.ai/connect-github>, connect GitHub if asked,
   and make sure the Claude GitHub App is allowed to access `moneymap` (choose "All
   repositories" or add `moneymap` under "Only select repositories").
5. Send Claude the repository URL, e.g. `https://github.com/<your-username>/moneymap`.

**Check:** after Claude pushes, the repository page on GitHub shows `docs/SPEC.md`.

## Step 2 — Supabase project (Mumbai)

1. Go to <https://supabase.com/dashboard> and sign in (GitHub sign-in is fine).
2. Click **New project**.
   - **Name:** `moneymap`
   - **Database password:** click **Generate a password**, save it in your password
     manager. Don't share it with anyone, including Claude.
   - **Region:** **South Asia (Mumbai)**
   - **Plan:** Free
   - Leave the Data API enabled (default).
3. Click **Create new project** and wait 1–2 minutes.

**Check:** the project dashboard opens without a "setting up" banner.

## Step 3 — Run the database migration

1. In the left sidebar open **SQL Editor** → **New query**.
2. Open `supabase/migrations/20261020000001_foundation.sql` from the GitHub repository,
   click the **Copy raw file** button, paste the whole file into the editor.
3. Click **Run**.

**Check 1:** the result panel says *Success. No rows returned*.
**Check 2:** open **Table Editor**. You see `profiles`, `transactions`, `commitments`,
`commitment_payments`, and none of them shows an **Unrestricted** / "RLS disabled" badge.

## Step 4 — Run the security test on Supabase

1. **SQL Editor** → **New query**.
2. Paste the whole of `supabase/tests/rls_isolation.sql` and click **Run**.
   It creates two throwaway users, tries to read and change each other's data, then
   rolls everything back, so nothing is left behind.

**Check:** the result shows one row: **ALL CHECKS PASSED**. If you see an error starting
with `FAIL:`, copy that line to Claude.

3. Open **Advisors → Security Advisor** and click **Refresh** (or **Rerun linter**).

**Check:** no items under **Errors**. Copy any warnings to Claude.

## Step 5 — Google sign-in (Google Cloud)

1. Go to <https://console.cloud.google.com/>, use the project picker at the top →
   **New project** → name `MoneyMap` → **Create**, then select it.
2. Search for **Google Auth Platform** → **Get started**.
   - App name `MoneyMap`, user support email = your email → **Next**.
   - Audience: **External** → **Next**. Contact email = your email → **Next**.
   - Agree to the policy → **Create**.
3. **Branding:** don't upload a logo (a logo triggers a verification review).
   Under **Authorized domains** add `supabase.co`. Save.
4. **Data access:** leave the default scopes (`openid`, `email`, `profile`). Do not add
   Gmail or any other scope.
5. **Clients** → **Create client**.
   - Application type: **Web application**, name `MoneyMap web`.
   - **Authorized redirect URIs** → Add URI:
     `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (Supabase shows this exact URL in step 6 below; copy it from there.)
   - Click **Create**. Keep the dialog with the **Client ID** and **Client secret** open.
6. In a second tab, Supabase → **Authentication** → **Sign In / Providers** → **Google**.
   - Turn it on. Paste the **Client ID** and **Client secret** from Google. **Save.**
   - The "Callback URL (for OAuth)" shown here is the one Google needs in step 5.
7. Back in Google → **Audience** → **Publish app** → confirm. Status becomes
   **In production**. (With only basic scopes, no Google review is needed.)

**Check:** Supabase shows Google as **Enabled**.

## Step 6 — Vercel deployment

1. Go to <https://vercel.com/signup> and sign up with GitHub.
2. **Add New… → Project** → find `moneymap` → **Import**. (If it isn't listed, click
   "Adjust GitHub App Permissions" and allow `moneymap`.)
3. Framework preset: **Next.js** (detected automatically). Open **Environment
   Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = Supabase → **Project Settings → Data API** → Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = Supabase → **Project Settings → API Keys**
     → Publishable key (`sb_publishable_…`)
4. Click **Deploy** and wait for "Congratulations". Copy the production domain, e.g.
   `https://moneymap-abc.vercel.app`.
5. Supabase → **Authentication → URL Configuration**:
   - **Site URL:** your production domain.
   - **Redirect URLs** → add `https://<your-production-domain>/**` and
     `http://localhost:3000/**`.

**Check:** opening the production domain shows the MoneyMap sign-in page.

## Step 7 — Verify milestone 1 in production

1. In a private/incognito window open the production domain → **Continue with Google**
   → pick account 1. You land on **Overview** saying "Signed in as …". (A1)
2. Supabase → Table Editor → `profiles`: exactly one row for that account. (A1)
3. Click **Sign out**, then open `<domain>/overview` directly: you are sent to sign-in. (A2)
4. Repeat 1–2 with a second Google account: `profiles` now has two rows, and each
   account only ever sees its own name. (A3 is proven in depth by step 4's test.)
5. Send Claude your **project URL and publishable key** (both public). Claude will
   confirm from outside that an anonymous request reads nothing. (A4)
6. Claude runs `npm run check:secrets` on the repository and the build. (A6)

## Local development (optional)

```bash
cp .env.example .env.local   # then fill in the two public values
npm install
npm run dev                  # http://localhost:3000
npm test                     # calculation and helper tests
```

## Gmail (Testing mode, optional)

Gmail stays switched off until all three Vercel settings below exist. Do the steps in
order. Never paste the client secret or token key anywhere except Vercel.

### Part A: Supabase, migration 6 (two new tables; nothing existing changes)
1. Supabase → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/migrations/20261024000006_gmail.sql` → **Run**.
   Expect "Success. No rows returned". Run it once only.
3. **Check:** new query → paste the whole of `supabase/tests/rls_isolation.sql` → **Run**.
   It ends with `ALL CHECKS PASSED`, and the messages include
   "PASS: Gmail connections and hidden messages are private to each user".

### Part B: Google Cloud, a separate project (sign-in is not touched)
1. <https://console.cloud.google.com> → project picker (top left) → **New project** →
   name `MoneyMap Gmail Testing` → **Create**, then select it in the project picker.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **Google Auth Platform** (or "OAuth consent screen") → **Get started**:
   app name `MoneyMap (testing)`, support email = your Gmail, Audience **External**,
   contact email = your Gmail → agree → **Create**.
4. **Branding**: Application home page `https://moneymap-ten-bay.vercel.app`,
   privacy policy `https://moneymap-ten-bay.vercel.app/privacy` → **Save**. If it asks
   for an authorised domain and refuses `vercel.app`, leave it empty; Testing mode
   doesn't need it.
5. **Audience**: leave the status as **Testing**. Do **not** click "Publish app".
   **Test users → Add users**: your Gmail and each tester's Gmail → **Save**.
6. **Data Access → Add or remove scopes**: filter `gmail.readonly`, tick
   `https://www.googleapis.com/auth/gmail.readonly` → **Update** → **Save**. Add no
   other scopes.
7. **Clients → Create client** → type **Web application** → name `MoneyMap Gmail` →
   **Authorised redirect URIs → Add URI**:
   `https://moneymap-ten-bay.vercel.app/api/gmail/callback` → **Create**.
   A box shows the **Client ID** and **Client secret**. Keep it open for Part C.

### Part C: Vercel, three environment variables
Vercel → the MoneyMap project → **Settings → Environment Variables**. For each one:
**Add new**, environment **Production**, then **Save**.

| Key | Value | Sensitive |
|---|---|---|
| `GMAIL_CLIENT_ID` | the Client ID from B7 (ends in `.apps.googleusercontent.com`) | optional |
| `GMAIL_CLIENT_SECRET` | the Client secret from B7 | **yes** |
| `GMAIL_TOKEN_KEY` | on your Mac, open **Terminal** and run `openssl rand -base64 32`; paste the line it prints | **yes** |

The token key encrypts stored Google tokens. If it's ever lost or changed, nothing
breaks: everyone just taps "Reconnect Gmail".

Then **Deployments** → the latest one → **⋯ → Redeploy**, so it picks up the settings.

### Check (on your phone)
1. Smart add shows a fourth tab, **Gmail**. Tap it → **Connect Gmail**.
2. Google warns "Google hasn't verified this app": tap **Continue** (this is expected
   in Testing mode). Leave the Gmail box ticked → **Continue**.
3. You're back on Smart add: "Gmail connected", with your address.
4. **Check Gmail now** → review the list → save one → check again: it is not offered
   again.
5. **Disconnect Gmail** → then Google Account → Security → Third-party connections:
   MoneyMap is no longer listed.

Testing-mode limits: only listed test users can connect, Google shows the unverified
warning, and access expires after about 7 days (the app then asks to reconnect).

## Tester feedback (migration 8)

1. Supabase → **SQL Editor** → **New query** → paste the whole of
   `supabase/migrations/20261026000008_feedback.sql` → **Run**. Expect "Success. No rows
   returned". Run it once only.
2. Make yourself the only admin who can read feedback. New query, paste this with your own
   Google address, then **Run**. Expect "Success. 1 rows affected", or "INSERT 0 1":
   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'dixitpavni16@gmail.com';
   ```
3. **Check:** new query → paste the whole of `supabase/tests/rls_isolation.sql` → **Run** →
   `ALL CHECKS PASSED`.
4. In the app: Settings → **Share feedback** (everyone) and **See what testers said
   (admins only)** (only you).
