# TODO.md — progress tracker

Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` needs the client
Last updated: 2026-11-03 (Claude, PM + assets & inventory)

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
- [x] Run `tests/` against the emulator — 46/46 pass (2026-11-01)
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

## Phase 3b — old system import + multi-site (2026-11-01)
- [x] Sites level: `/sites` → buildings.siteId → areas; jobs/tracking carry `siteId`. Site picker in the request form (hidden when 1 site),
      `?s=CODE` QR param, site filter in jobs / dashboard / QR / master data, `placeName()` everywhere. Rules + tests updated.
- [x] `npm run import:cpfm` (`scripts/import-cpfm.mjs`, guide `CPFM_IMPORT.md`): all 4 sites (THEENCONY, PTTEP, VISTEC, KVIS),
      ~25.5k jobs + activity log, idempotent (`cpfm_` ids + payload hash), old system wins. Tested end-to-end on the emulator.
- [x] `onJobEvent` skips `imported` events (no mail storm)
- [x] Client: generate a service-account key, re-publish `database.rules.json`, then run the import against the live DB
      (done 1 Nov 2026: 25,509 jobs, 80,120 events, 4,076 photos in Storage, 5,013 links; stats in `/config/cpfmImport`)
- [x] Staff job list is paged in the database (50/page, prev/next) with `jobs/*/idx` sort keys. Filters: status / open,
      site, building. Enter in search = exact job no. / tracking code over all jobs. Contractors and "assigned to me" still load their own list.
- [x] Attachments: photos → ≤1280×720 WebP in Storage (or RTDB), HEIC via heic-convert. Videos/other → links (`jobs/*/files`)
      shown on the job page. Found that CPFM's `attach_files` column is always 0. The real data is in `document_action.php`.
- [ ] Dashboard still loads the newest 5000 jobs, so its totals are not all-time. Needs aggregates (`/stats`, kept by the
      importer + a Cloud Function on job writes).
- [ ] Before CPFM is switched off: copy the `jobs/*/files` links (videos, PDFs) into Storage.
- [~] Photo upload split to stay in the free 5,000 Storage uploads/month (`--photos-since`):
      - [x] 1 Nov 2026: `--photos-since=2023-11-01 --yes`: 4,076 photos stored, 2 failed to convert (kept as links).
      - [ ] **Dec 2026 or later: sync again without `--photos-since`** (see AGENTS.md → "Monthly CPFM sync").
            One run stores both gaps: the ≈3,831 photos older than 2023-11-01 (now links to CPFM, removed once stored)
            and every photo/job added in CPFM after 1 Nov 2026. Expect ≈3,831 + ~110 per month since then (< 5,000).
- [ ] Until the switch-over from CPFM, run the monthly sync (AGENTS.md → "Monthly CPFM sync"). CPFM is still in use.

## Phase 3c — one job number, several ผู้ปฏิบัติงาน, staff placeholders (2026-11-02)
- [x] The job number is the only tracking id: `/tracking/{jobNo}`, `trackingCode` removed. App jobs use their own
      prefix (`VR2026-0001`, `/config/public/jobPrefix`) while CPFM still issues `WO…`, so numbers never collide.
- [x] Several assignees per job, add / remove (`jobs/*/assignees`, `assigneeKeys`, `/assignments/{key}/{jobId}`)
- [x] `/staff` records: CPFM technicians imported as placeholders; linked to an account automatically when someone signs
      in with the e-mail the admin entered, or by the admin directly (Users page)
- [x] Rules tests (80 pass) and an end-to-end run on the emulator (old data migrated, add/remove, VR number, auto-link)
- [ ] **Live:** ~~publish `database.rules.json`~~ (done 3 Nov), deploy the app, then `npm run import:cpfm -- --yes` once to move the
      25.5k imported jobs to `tracking/{jobNo}` + `assignees` (writes only, no Storage uploads). The old random tracking
      links stop working (no e-mails were ever sent with them: Cloud Functions are not deployed).
- [ ] Admin: enter the e-mail of each CPFM technician on the Users page so their accounts link when they sign in

## Phase 3d — การบำรุงรักษา (PM) + เครื่องจักรและอุปกรณ์ (2026-11-03)
- [x] DB: `/assetTypes`, `/checklists`, `/assets`, `/assetLogs`, `/materials`, `/stockMoves`, `/pmPlans`, `counters/pm`,
      `jobs/*/assetId`, `jobs/*/pm` (DB.md). Rules + 37 new emulator cases (117 pass)
- [x] เครื่องจักรและอุปกรณ์: list (search, site / building / system / status filters), detail + edit, repair /
      maintenance log (changes the status), work orders for the machine, PM plans using it, check list, history
- [x] วัสดุอุปกรณ์: list (on-hand red at ≤ min, reorder suggestion, store filter, low-stock filter), detail + edit,
      Stock Card with stock in / issue (optionally to a job number)
- [x] Job page: machine picker, PM plan link, "materials and repairs on this job" with issue-stock and repair-log forms
- [x] PM: plan list, plan detail + edit (repeat rule, machines, tasks, check list, reminder), due dates per year with
      "create work order", "Gen. Job ถึง [date]" for all plans, PM calendar (month grid, list on phones, colour per building)
- [x] Master data: asset categories (group → type)
- [x] Importer `--only=jobs,assets,pm`: asset categories, brands, check lists, 384 assets + repair log, 71 materials
      (+ codes only on the stock card), 835 stock lines with job links, 8 PM plans + machines. CPFM_IMPORT.md
- [x] Live import 3 Nov 2026 (`--only=assets,pm --yes`): 58 asset types, 1 check list, 384 assets, 20 repair-log lines,
      142 materials (71 + 71 codes only on the stock card), 835 stock lines (366 linked to WO jobs), 8 PM plans. Re-run = 0 changes.
      The run also created the 20 `/staff` records (master data is always refreshed).
- [x] Live rules published 3 Nov 2026 (checked: identical to `database.rules.json`; anonymous reads of assets / materials /
      stockMoves / pmPlans / staff / jobs are denied). This also published the Phase 3c rules.
- [ ] PM2021-0001 (a 2021 test plan in CPFM) has calendar dates that don't follow its repeat rule; we show the rule's dates
- [ ] PM reminder e-mails (`remind` is stored, nothing sends it) and auto-generating work orders (scheduled Function)
- [ ] Fill in a check list on a PM work order (CPFM has templates but no results to import)
- [ ] Edit check-list templates in the app (imported from CPFM; read-only here)
- [ ] Dashboard filter งานแจ้ง / PM, reports REPORT-02 (repairs by machine), REPORT-08/09 (PM)
- [ ] QR code per machine → its page / a work order for it
- [ ] Monthly sync keeps these in step: the default run (no `--only`) includes assets and PM

## Phase 4 — later
- [ ] Satisfaction survey after completion (6 criteria, see CPFM §4.2) — e-mail link + `/survey/:code`
- [ ] SLA per job type + due date / overdue counter
- [x] Assets & equipment register (Phase 3d)
- [x] Materials / stock card (Phase 3d)
- [x] Preventive maintenance plans + calendar (Phase 3d)
- [ ] Reports + Excel export, print work-order sheet
- [ ] Import CPFM ratings → survey. (Attachments, materials and repair-log tabs are imported. Expenses: 1 test row in all of CPFM, skipped)
- [ ] PWA (installable, offline shell)
