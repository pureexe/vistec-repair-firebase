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

## Phase 4 — later
- [ ] Satisfaction survey after completion (6 criteria, see CPFM §4.2) — e-mail link + `/survey/:code`
- [ ] SLA per job type + due date / overdue counter
- [ ] Assets & equipment register
- [ ] Materials / stock card
- [ ] Preventive maintenance plans + calendar
- [ ] Reports + Excel export, print work-order sheet
- [ ] Import history from CPFM (~24k jobs)? Ask the client
- [ ] PWA (installable, offline shell)
