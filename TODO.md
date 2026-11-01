# TODO.md — progress tracker

Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` needs the client
Last updated: 2026-10-21 (Claude, first build)

## Phase 0 — planning
- [x] Read notes (`note-vistec-repair-system/*.md`)
- [x] DB design → `DB.md`
- [x] Agent hand-off guide → `AGENTS.md`, setup guide → `README.md`

## Phase 1 — skeleton
- [x] Vue 3 + Vite, Bulma 1.x themed purple `#582E91` / dark red `#A0223A`, light theme only, Sarabun font
- [x] i18n: Thai default, English toggle (navbar), saved per user
- [x] Firebase init from `.env`; the UI still renders, with a warning banner, when `.env` is missing
- [x] Mobile bottom tab bar, card lists, responsive forms (checked at 390 px and 1280 px)

## Phase 2 — user requested features (`USER_request_feature.md`)
- [x] 1. Tracking number: 8-character `trackingCode` + public live page `/t/:code` (+ job number `WO2026-0001`)
- [x] 2. E-mail on status change: `functions/index.js` (`onJobEvent`, `onInvite`) — [!] needs Blaze plan + SMTP mailbox + deploy
- [x] 3. Mobile / tablet friendly UI
- [x] 4. GPS pre-fill on the request form + nearest building + Google Maps link for staff
- [x] 5. Expected date + note; on-hold reasons (waiting for parts + parts ETA, budget / next finance cycle + resume date, contractor, access, other); shown on the tracking page and e-mailed
- [x] 6. Login: Microsoft (VISTEC tenant), Google, e-mail/password, passwordless e-mail link; link several methods in Profile; contractor invites
- [!] Microsoft Entra app registration + enabling providers in the Firebase console (see README §1)

## Phase 3 — back office (from `CPFM_feature_spec.md`)
- [x] Job list (status tabs, building filter, search, assigned-to-me) + job detail with workflow (assign, start, hold, resume, expected date, complete, cancel, reopen, priority)
- [x] Activity log (internal vs public comments)
- [x] Photo upload (≤1280×720 WebP; WASM fallback for Safari; max 3 per upload batch)
- [x] Master data: buildings (with GPS), areas, job types + "create defaults"
- [x] Users & roles, invites
- [x] Printable QR code per building / area → pre-filled request form
- [x] Dashboard (KPIs, 12-month chart, by status / type / building / assignee, on hold, overdue)
- [x] Rules: `database.rules.json` (generated), `storage.rules`, emulator tests in `tests/`
- [ ] Run `tests/` against the emulator (couldn't download the emulator in the build sandbox) — run it on a dev machine
- [ ] End-to-end test with the real Firebase project once `.env` is filled

## Blockers found while testing sign-up (2026-11-01)

Verified against the live project `vistec-repair` with the API key from `.env`:

- [!] **Account creation fails with `auth/configuration-not-found`.** The API key itself is valid
  (`securetoken` accepts it), but `identitytoolkit.googleapis.com` returns `CONFIGURATION_NOT_FOUND`
  for every call — sign-up, sign-in, password reset, reCAPTCHA params. That means Firebase
  **Authentication is not set up yet** for this project, or the `.env` web config comes from a
  different project. Fix in the console (README §1.4): Authentication → *Get started* → enable
  Email/Password (+ Email link) and Microsoft, then re-copy Project settings → General → Your apps.
  `vistec-repair.firebasestorage.app` also returns 404 and `vistec-repair.web.app` shows
  "Site Not Found", so Storage and Hosting have not been initialised either.
- [!] **The live Realtime Database is world-readable.** `GET /.json`, `/users.json`, `/jobs.json`
  all return `null` (HTTP 200) instead of *permission denied*, so the deployed rules are still
  Firebase's open test-mode rules — `database.rules.json` was never published. Publish it before
  any real data goes in.
- [x] `authErrorMessage()` now maps the project-side codes (`configuration-not-found`,
  `operation-not-allowed`, `invalid-api-key`, `unauthorized-domain`) to an actionable message in
  Thai and English, and the remaining auth errors go through `$t()` instead of hard-coded English.
- [x] **Per-method sign-in switches in `.env`**: `VITE_AUTH_MICROSOFT`, `VITE_AUTH_GOOGLE`,
  `VITE_AUTH_PASSWORD`, `VITE_AUTH_EMAIL_LINK` (unset = on). `src/firebase.js → AUTH_METHODS` is
  consumed by `LoginView` (buttons, separator, password form, passwordless link) and by `ProfileView`
  (only methods that are enabled *or* already linked are offered, so a linked method can still be
  unlinked after a provider is turned off). All four off shows a warning instead of an empty card.
  `.env` currently ships Google and the e-mail link as `false` until those providers are enabled.

## Phase 4 — later
- [ ] Satisfaction survey after completion (6 criteria, see CPFM §4.2) — e-mail link + `/survey/:code`
- [ ] SLA per job type + due date / overdue counter
- [ ] Assets & equipment register
- [ ] Materials / stock card
- [ ] Preventive maintenance plans + calendar
- [ ] Reports + Excel export, print work-order sheet
- [ ] Import history from CPFM (~24k jobs)? Ask the client
- [ ] PWA (installable, offline shell)
