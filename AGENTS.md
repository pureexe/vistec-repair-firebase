# AGENTS.md — how to pick up this work

You are continuing the **VISTEC repair-request system** (re-implementation of the CPFM "แจ้งซ่อม" system)
on **Vue 3 + Vite + Bulma + Firebase (Realtime Database, Auth, Storage, Functions)**.

## Read first (in this order)
1. `note-vistec-repair-system/PROMPT.md` — the client brief (source of truth)
2. `note-vistec-repair-system/USER_request_feature.md` — the 6 features the client asked for
3. `note-vistec-repair-system/CPFM_feature_spec.md` — inventory of the old system
4. `TODO.md` — what is done / in progress. **Update it whenever you start or finish something.**
5. `DB.md` — database tree. **If you change data shape, update DB.md and `database.rules.json` in the same change.**

## Layout
```
index.html, vite.config.js, package.json
src/
  main.js               app bootstrap (router, i18n, auth listener)
  firebase.js           Firebase init from VITE_* env vars
  styles/main.scss      Bulma 1.x with VISTEC colors (primary #582E91, danger/accent #A0223A)
  i18n/{th,en}.js       all UI strings — never hard-code text in components
  stores/               tiny reactive stores (auth.js, master.js, toast.js)
  services/             Firebase access (jobs.js, authService.js, master.js, images.js, geo.js, util.js)
  router/index.js       routes + role guards (meta.roles)
  components/           shared UI (StatusTag, JobCard, Timeline, PhotoPicker, …)
  views/                pages (public, reporter, staff, admin)
functions/              Cloud Functions (e-mail on job events)
database.rules.json     RTDB rules  (GENERATED — edit scripts/build-rules.py, then run it)
scripts/build-rules.py  source of the RTDB rules
tests/rules.test.mjs    emulator tests for the rules (cd tests && npm i && npm test; needs Java)
storage.rules           Storage rules (client pastes into console)
firebase.json           hosting / rules / functions config
```

## Conventions
- Thai is the default language; every string goes through `$t()` with keys in **both** `th.js` and `en.js`.
- Mobile first. Test at 375 px width. Use Bulma columns `is-mobile` / cards rather than wide tables on phones.
- Every job change = **one multi-path `update()`** touching `jobs/…`, `tracking/{code}/…` and a new `jobEvents/…` (see `services/jobs.js → applyJobChange`). Never write `tracking` separately or the public page goes stale.
- Images go through `services/images.js → compressImage()` (≤1280×720, WebP). Do not upload originals.
- Roles: `user`, `contractor`, `technician`, `admin` (see DB.md). Guard routes with `meta.roles` and keep rules in sync.
- When you change the rules, add a case to `tests/rules.test.mjs` and run it.
- Bulma is themed in `src/styles/main.scss`. Light theme only (the client asked for a white theme), so do not re-enable Bulma's dark theme.

## Commands
```
npm install
cp .env.example .env      # fill Firebase web config
npm run dev               # http://localhost:5173
npm run build             # must pass before you stop
cd functions && npm install && firebase deploy --only functions
```

## If a previous run failed
1. `git status` / `git diff` to see partial work.
2. Run `npm run build`; fix errors first.
3. Look at `TODO.md` items marked `[~]` — that is where work stopped.
4. Keep commits small; mention the TODO item in the commit message.
