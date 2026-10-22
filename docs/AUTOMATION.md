# Automatic capture: Gmail, SMS and notifications — audit and plan

Status as of commit after `eda6bff` (22 Oct 2026). Facts about Google and Apple policies
below are marked **verify** where they come from secondary sources; check the official page
before relying on them.

## 1. Audit: what exists today

| Area | Status | Evidence |
|---|---|---|
| Google sign-in | **Implemented** (identity only) | `src/app/login/google-button.tsx` calls `signInWithOAuth({ provider: "google" })` with no extra scopes. `src/app/privacy/page.tsx` says "We do not request access to Gmail". |
| Gmail integration | **Built, Testing mode** (phase 1). Off unless the three Vercel settings exist | Routes `src/app/api/gmail/{connect,callback}`, actions `src/app/(app)/spending/smart/gmail-actions.ts`, UI `gmail-panel.tsx` + `batch-review.tsx`, library `src/lib/gmail/*`, migration 6, tests `e2e/gmail.spec.ts` against `e2e/local/fake-google.mjs`. |
| SMS | **Missing** (paste only) | Users can paste an SMS into Smart add, which `parseText` reads (`src/lib/capture/parse-text.ts`). Nothing reads SMS automatically. `sms` is `available: false`. |
| Message detection | **Implemented now** | `src/lib/capture/detect-message.ts` and its tests: bank and merchant sender rules, OTP, failed-payment and advert filtering, and card statements routed to Commitments. Used today for pasted text. Gmail and SMS will use it later. |
| Duplicate protection for imports | **Implemented** | `unique (user_id, source, source_ref)` and `unique (user_id, client_request_id)` on `transactions` (migration 5). Gmail message ids will be the `source_ref`. |
| Web app manifest / Home Screen install | **Missing** | No `manifest` in `src/app/layout.tsx`. No `manifest.webmanifest` or icons in `public/`. |
| Service worker | **Missing** | No `sw.js` in `public/` and no `navigator.serviceWorker` anywhere in `src/`. |
| Push notifications | **Missing** | No `PushManager`, VAPID keys, `web-push` dependency (`package.json`), subscription table, send route or cron. |
| Notification settings | **Missing** | `src/app/(app)/settings/` has payday, budget and sample-data controls only. |

Conclusion: no notification can be sent by the deployed app today, and none of these
features can be described as enabled.

## 2. Gmail plan (P0-A)

### Permission
- Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
  - The amounts are in message bodies. `gmail.metadata` (headers only) cannot read them, and is restricted too.
  - Gmail has no scope limited to particular senders. A read token technically allows reading all mail.
  - MoneyMap limits itself in code: it only searches known bank and merchant senders over a short window. The consent screen and privacy page must say this honestly.
- Requested on a separate **Connect Gmail** screen in Settings, never during sign-in.
- This uses its own OAuth client in a **separate Google Cloud project**, so the sign-in app's production status is untouched.

### Google requirements
| Stage | What works | Limits |
|---|---|---|
| Development / demo (Testing mode) | Full flow for listed test users | "Google hasn't verified this app" warning. Test users must be listed in the console. Refresh tokens expire after **7 days**, so testers reconnect weekly (**verify**). |
| Public launch | Anyone can connect | `gmail.readonly` is a **restricted** scope. Needs OAuth verification plus an **annual third-party security assessment (CASA)**, which is paid and done by an approved assessor; **cost not confirmed: get quotes before committing**. Also needs a domain you own, verified in Google Search Console (a `vercel.app` address can't be verified by us), privacy policy, homepage and demo video. Expect weeks, not days. |

A lower-privilege option for public users is an **email forwarding address**: the user sets a Gmail filter
that forwards bank alerts to a personal MoneyMap address. No Gmail permission is involved and there is no CASA
assessment. It needs a custom domain and an inbound-email service (cost to be reported before choosing one).
Recommended for after the demo.

### Flow
1. Settings → **Connect Gmail**. A screen explains what is read (bank alerts, receipts, card statements from known senders, last 30 days), what is stored, and how to disconnect.
2. `/api/gmail/connect` starts the consent with `access_type=offline` and PKCE, bound to the signed-in user by a random `state` in an httpOnly cookie.
3. `/api/gmail/callback` checks `state`, exchanges the code, and confirms the granted scope. It encrypts the refresh token with AES-256-GCM using a key held only in Vercel, then stores it.
4. **Check Gmail now** (in Smart add) is on demand. There is no background job this sprint, because that would need a service-role key.
   - The scan lists messages from the sender allowlist since the last scan (max 50) and runs each through `detectMessage`.
   - It writes **pending drafts** to `capture_inbox`. Access tokens live in memory only.
5. The user reviews each draft with the existing review card. Confirming uses `confirmDraft` with `source = 'gmail'` and `source_ref = <message id>`. Nothing is ever saved without that tap.
6. **Disconnect** revokes the token at Google, deletes the stored token, and optionally deletes pending Gmail drafts. If Google returns `invalid_grant` (expired, or revoked in the Google account), the app shows "Reconnect Gmail".

### Data (migration 6, as built)
No email content is stored. Drafts are built while the user is looking at them and
live only in the browser until confirmed.
- `gmail_connections`: `user_id` (pk), `google_email`, `encrypted_refresh_token` (AES-256-GCM, user id bound in), `scope`, `status`, `connected_at`, `last_checked_at`. RLS owner only, `anon` revoked. The key is only in Vercel.
- `gmail_dismissed`: `user_id`, `message_id`, `dismissed_at`. Message ids of hidden emails only, so they aren't proposed again. RLS owner only.
- Confirmed drafts: ordinary `transactions` with `source = 'gmail'` and `source_ref` = message id. The existing unique constraint means the same email can never be saved twice.
- Disconnect revokes at Google and deletes both Gmail tables' rows for the user. Confirmed transactions stay.
- Logging: nothing from emails, and no tokens, is logged.

### Configuration you will do (after approving)
1. Create a new Google Cloud project, e.g. "MoneyMap Gmail testing". Enable the **Gmail API**.
2. Set up the OAuth consent screen: External, **Testing**. Add the scope `gmail.readonly` and add yourself and your testers as test users.
3. Create credentials: OAuth client, type Web application. Redirect URI: `https://moneymap-ten-bay.vercel.app/api/gmail/callback`.
4. In Vercel → Settings → Environment Variables, add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_TOKEN_KEY`. The key is 32 random bytes; generate it on your Mac with `openssl rand -base64 32` and paste it only into Vercel.
5. Apply migration 6 in the Supabase SQL Editor.

## 3. SMS feasibility (P0-B)

- **Web app:** cannot read SMS. No browser API exposes the inbox. The WebOTP API only hands one specially formatted OTP to the site it names. This is final for iPhone and Android browsers.
- **Native Android app:** `READ_SMS` / `RECEIVE_SMS` are restricted by Google Play to the default SMS app, or to apps granted an exception through the Permissions Declaration Form. A financial-tracking declaration appears to exist (**verify**: only a secondary source confirms it), but approval is discretionary and has been refused to finance apps before. Building one is a separate product decision: a new codebase, Play review, a video, ongoing compliance. **Decision: not in this sprint, and no SMS permission is added anywhere.**
- **iPhone:** no app can read SMS. The equivalent is user-controlled:
  - An Apple **Shortcuts** personal automation ("When I get a message containing *debited*") sends the message text to a personal MoneyMap capture link.
  - The message lands as a pending draft for review.
  - Whether it can run without asking each time depends on the iOS version (**verify on your phone**).
- **Android without a native app:** install MoneyMap to the Home Screen. The web app can register as a **share target**, so Messages → Share → MoneyMap opens a prefilled draft.
- Both use the same `capture_inbox` and review flow. The capture link uses a revocable per-user token stored hashed.

## 4. Notifications

- **Status:** none (see the audit table).
- **Smallest safe plan, after P0:**
  1. Web app manifest and icons, so the app can be installed (iPhone needs Home Screen install for web push, iOS 16.4+).
  2. A minimal service worker that only handles push and click. It does not cache financial pages offline.
  3. Settings → **Reminders**: the browser permission prompt is shown only after the user taps **Turn on reminders**.
  4. `push_subscriptions` table (owner-only RLS), with unsubscribe on toggle-off. Subscriptions Google or Apple report as gone (404/410) are deleted.
  5. `web-push` library (free) with VAPID keys in Vercel env, plus a **Send me a test notification** button.
  6. Daily due-date reminders need a scheduled job that reads across users. That needs a server-only Supabase secret set in Vercel by you, and Vercel Cron limits on the free plan (**verify**). This is a separate approval.
- **Lock-screen privacy:** reminder text has no amounts by default ("2 payments due tomorrow").

## 5. Phases (each keeps the current app working)

| Phase | Content | Needs from you |
|---|---|---|
| 0 — done | `detect-message.ts` and tests. Pasted OTPs, failed payments, adverts and card statements are explained instead of becoming drafts. | Nothing |
| 1 — Gmail (Testing mode), **built** | Migration 6, Connect / check / hide / disconnect (off unless the Gmail env vars exist), list review, privacy page update, local tests against a stand-in Google server | Google Cloud and Vercel steps in docs/SETUP.md; apply migration 6 |
| 2 — phone capture | iPhone Shortcut capture link, Android share target, manifest | Approval |
| 3 — notifications | N1–N5 above, then N6 | Approval; VAPID keys and, for N6, a server secret set in Vercel |

Every phase adds tables and routes only. It does not change calculations, payments or sign-in.
All existing unit, SQL and browser tests must pass before anything is pushed. New tables get RLS isolation tests.
