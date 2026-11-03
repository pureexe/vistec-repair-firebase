# CPFM_IMPORT.md — the old system and how we copy it

The client's current repair system is **CPFM "Building Intelligent"** at `EXISTING_SYSTEM_URL`
(`https://enco.bi-cpfm.com/`). It is still in daily use. `scripts/import-cpfm.mjs` (`npm run import:cpfm`)
copies its jobs, machines & equipment, spare parts (stock card), repair logs, PM plans and master data into our
Realtime Database. **The old system wins**: every run overwrites the
imported fields with what CPFM shows now. Read this before you touch the importer or the old site.

## Ground rules for agents

- **Read-only.** Never call an endpoint with `act=post`, `act=del`, `act=setstatus`, `act=response` or
  `option/action.php?…act=del`. Never submit `form.php`. It is a production system with real reporters and every
  write e-mails someone. Only the GET-style `act=grid` / `act=load` / `settypelist` / `statuslist` calls below.
- Credentials are only in `.env` (`EXISTING_SYSTEM_USERNAME` / `EXISTING_SYSTEM_PASSWORD`). Never print or commit them.
- Be gentle: the server is slow (≈4 s per 1000-row page). Keep note requests at concurrency ≤ 4.
- Logging in may end the account's session in a browser. Tell the user before long runs.
- Use `--dry-run` first. It writes `.cpfm-cache/dry-run.json` (the exact multi-path update) and sends nothing to Firebase.
- Test writes against the emulator, not production:
  `cd tests && npx firebase emulators:exec --only database --project vistec-repair --config ../firebase.json "FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 node ../scripts/import-cpfm.mjs --limit=30"`
  (Java is at `/usr/bin/java`).

## Running it

```bash
# .env: EXISTING_SYSTEM_URL / _USERNAME / _PASSWORD, VITE_FIREBASE_DATABASE_URL,
#       FIREBASE_SERVICE_ACCOUNT=./service-account.json   (Project settings → Service accounts → Generate new private key; never commit it)
npm run import:cpfm -- --dry-run          # scrape everything, write nothing
npm run import:cpfm                       # scrape + write (refuses if the DB is publicly readable)
npm run import:cpfm -- --site=VISTEC --from=2026-10-01 --no-notes
npm run import:cpfm -- --only=assets,pm --yes   # only assets, materials, stock card, PM: a few minutes, no Storage uploads
```

`--only=jobs,assets,pm` picks the sections (default all three). Sites, buildings, areas, job types and staff are always
refreshed because the other sections point at them.

Flags are documented at the top of the script. A full run fetches ≈25.5k jobs (26 pages), then **two requests per
job**: the activity log and the attachment list. Both are cached in `.cpfm-cache/{notes,docs}/{task_id}.json` and
fetched again only when the job's `users_update`/status changed or the job is still open. The old server answers
≈100 requests a minute at concurrency 4, so the first full run takes **≈8 hours**, plus the photo downloads
(≈11k files, each converted once and cached in `.cpfm-cache/photos/{f_id}.webp`). Later runs take minutes.
Jobs whose generated payload hash (`jobs/{id}/cpfm/hash`) is unchanged are skipped. Use `--force` to rewrite all.

## How the old site works

PHP + ExtJS 3.4. Each screen is an iframe page, and its grids load JSON over `POST`.

**Login:** `POST option/logincheck.php` with
`login_user, login_password, action_alert=js, action_login=ok, url=, login_type=A`. A good login answers
`Login success..!` and sets `PHPSESSID`. An expired session answers with a page containing `session-expired`.

**Loose JSON:** grids answer `{total:25504,data:[…]}` with unquoted top-level keys. Quote `total|data|success`
before `JSON.parse` (see `parseLoose`). Strings are `\uXXXX`-escaped Thai.

| What | Request | Notes |
|---|---|---|
| Jobs | `tasks/tasks_action.php?menu=&status_type=tasks&authen_location=y&act=grid&mode=` + body `start, limit (≤1000 tested), sort=task_id, dir, locationgroup, order_date, date_to, task_status, keyword, task_type` | `locationgroup` = **raw** site code. PTTEP's code is `" PTTEP"` with a leading space. Per-site totals add up to the unfiltered total. |
| One job | same with `act=load`, body `id` | not needed, the grid has every column |
| Activity log | `notes/note_action.php` body `act=grid, row_type=tasks, row_id={task_id}` | real JSON. Without `row_id` it returns nothing, so it is one request per job. (`notes/note.php` is only the iframe page.) |
| Attachments | `document/document_action.php?menu=&status_type=document&row_id={id}&row_type=tasks&category=&act=grid` | One request per job, no bulk listing. **The job grid's `attach_files` column is always 0. Don't trust it.** Most jobs since ~2021 have 1+ files (`f_id` ≈ 10.9k by Nov 2026). Row: `f_id, f_name, f_url (documents/attach-tasks-{task}-{n}.jpg), f_size, f_type, f_status, users_date, users_date_by` |
| File download | `GET files/{f_url}` | **Public**, no cookie needed. Originals are big: phone photos ~3 MB, videos ~30 MB, iPhone `.heic` |
| Sites | `option/action.php?act=settypelist&type_category=location&authen_location=y&type_parent=0&order_by=type_name` | 4 rows: THEENCONY, ` PTTEP`, VISTEC, KVIS |
| Areas | same with `type_parent=sub&order_by=type_parent,t.type_order&partial=y` | ~192 rows, flat, `type_parent` = site code |
| Job types | `…settypelist&type_category=tasktype&order_by=type_order` | codes EE, AC, SN, BD, ICT, FA, Contractor, `V-Fix it`, OT, LAB, EL (+ `PM` seen on jobs) |
| Priorities | `…settypelist&type_category=taskpriority` | N, H, L, D |
| Statuses | `option/action.php?act=statuslist&status_type=tasks` | jobs use `status_code`: 1 new · 2 in progress · 3 on hold · 4 done · 5 cancelled |
| Staff | `…settypelist&type_category=taskstaffen&order_by=type_code&authen_comment=y` | not needed: the job grid already gives `actionby` names |

**Assets, materials, PM** (all read-only grids, `act=grid…` / `listassets…` / `settypelist`; never `act=save`, `copy`,
`genschedule`, `copyschedule`, `statusschedule`, `runnerplan`):

| What | Request | Notes |
|---|---|---|
| Machines & equipment (~384) | `assets/assets_action.php?menu=asset-list&row_type=&row_id=&assetlocation=&assettype=assettype&asset_category=assets&authen_location=y&act=gridassets&status_type=assets` body `start, limit` | real JSON. `asset_location` = location code, `assetlocation` = "site > area", `asset_type` = sub-category code, `asset_brand` = brand code, `asset_status` 1–4. `asset_unit` often holds a location code by mistake (dropped). Pages open only with `?menu=<code>` (e.g. `assets/assets_list.php?menu=asset-list`), otherwise *session-expired* |
| Repair log of one asset | `assets/assets_action.php?menu=asset-list&row_type=assets&row_id={asset_id}&asset_location=&act=grid&asset_code={code}&asset_category=repair&status_type=tasks` | one request per asset; filtered by `asset_code`, an empty code returns nothing. Rows are `asset_category=repair` with `asset_action` (PM/REPAIR/CHANGE/TRANSFER/INSTALL), `asset_price` = cost, `asset_min` = breakdown time, `row_type=tasks`, `row_id` = task_id, `task_code` |
| Materials / spare parts (~71) | same with `menu=asset-equipt…asset_category=equipt&act=gridequipt` | `stock` = on-hand (sum of the stock card), `asset_min`/`asset_max` |
| Stock card (all items, ~835) | `stocks/stocks_action.php?menu=asset-equipt&stk_category=equipt&stk_location=&stk_code=&act=grid&status_type=stocks` | `stk_type` in/out, `stock` = signed qty, `stk_code` = item code, `row_type=tasks` + `row_id` = the job it was issued to. **~140 codes, but only 71 items exist**: the rest were deleted in CPFM and survive only here |
| Asset categories | `settypelist&type_category=assettype&type_parent=0` (8 groups) / `type_parent=sub` (50 types, `type_parent` = group code) | |
| Brands | `settypelist&type_category=assetbrand&partial=y` | code → name |
| Check lists | `settypelist&type_category=asset-checklist&type_parent=0` (templates, e.g. `PM-Air` "ฟอร์ม Air SplitType") / `type_parent=sub&partial=y` (items) | items: `type_parent` = the template *name* without "ฟอร์ม " ("Air SplitType"), `type_name` = `select\|ปกติ,ไม่ปกติ`, `type_color` = the item label |
| Asset statuses | `statuslist&status_type=assets` | 1 ปกติ · 2 ซ่อมแซม · 3 Write-Off · 4 หมดอายุ |
| PM plans (8 by Nov 2026) | `pm/pm_action.php?menu=pm-list&row_type=PM&authen_location=y&act=grid&status_type=preventive&mode=` | `sched_repeat` MINUTE…YEAR, `sched_freq_value` = every N, `sched_remind(_value)`, `sched_status` 1/0, `sched_location`, `locationgroup` = site name |
| Machines in a plan | `assets/assets_action.php?act=listassetspm&asset_pm=PM` body `sched_id` | |
| Plan calendar | `pm/pm_action.php?menu=pm-list&row_type=pm&row_id={sched_id}&act=gridschedule` | one row per month, `sch_date` = comma-separated datetimes, `task_code` = the WO made for it (none so far) |
| Attachments / comments | `document_action.php…row_type=assetslist\|equipt\|pm`, `note_action.php` with the same `row_type` | none on assets or materials by Nov 2026; PM plans have "Add new PM Code" notes |
| Expenses (ค่าใช้จ่าย) | `payments/payments_action.php?act=grid&…&pay_form=paid` | **1 row in the whole system (2021 test)** — not imported |

Useful job-grid columns: `task_id, task_code (WO2026-2598), task_status, task_priority, task_location (area code),
location ("site > area" name), task_type, typename, task_detail, task_action (work done), task_remark (hold note),
task_by / _tel / _email / _dept, actionby (assignee names, comma separated), task_action_by (staff codes), users_date
(reported), users_update, task_status_date, duedate, donetime, rate_star / rate_comment`. Times are Bangkok local
`YYYY-MM-DD HH:mm:ss`.

Activity-log `note_status` values: `แจ้งงานใหม่` (created) · `sent mail` (skip, it holds the reporter's e-mail) ·
`กำลังดำเนินการ` with detail `มอบหมายงานให้ A,B` (assign) · `หยุดปฏิบัติงานชั่วคราว` (hold) · `เสร็จสิ้น ปิดงาน` ·
`ยกเลิกงาน`. Anything else becomes a private comment.

## Mapping to our tree (see DB.md)

| CPFM | Ours | Key |
|---|---|---|
| top-level location (site) | `/sites/{id}` | `cpfm_{CODE}`, or an existing site with the same `code` |
| area "อาคาร R1.1 ชั้น2" | `/buildings` "อาคาร R1.1" + `/areas` "ชั้น 2" | `cpfm_b_{sha1(site\|building)}`, `cpfm_a_{…}`. Matched on `cpfm.key` |
| area without a floor / the site itself / unknown code | building only, or the site-wide building (the building whose `code` = site code, e.g. the seeded "VISTEC" one) | |
| tasktype | `/jobTypes`. Reuses the seeded type with the matching `nameEn` (`TYPE_ALIAS`) | `cpfm.code` |
| task | `/jobs/cpfm_{task_id}` + `/tracking/{task_code}` + `/jobEvents/cpfm_{task_id}/cpfm_{note_id}` | the CPFM number (WO2026-2557) is the tracking id |
| taskstaffen (staff) | `/staff/cpfm_s{code}` | name/code/active from CPFM; `email`, `uid`, `company` set in the app are kept |

- Status 1→`new`, 2→`in_progress`, 3→`on_hold` (reason guessed from the note text), 4→`completed`, 5→`cancelled`.
- `reporterUid` = the uid of a `/users` entry with the same e-mail, or `"cpfm"`. Re-runs pick up people who signed up
  later, so their old jobs appear under "My jobs".
- `assignees` = the job's `task_action_by` staff codes → `/staff/cpfm_s{code}` (+ `/assignments`). A staff record
  linked to an account (Users page) makes those jobs that person's. An unknown code becomes an inactive staff record.
- Imported events carry `imported: true` and `byUid: "cpfm"`. **`functions/index.js` skips them**, so no e-mails.
  Keep that guard if you touch `onJobEvent`.
- Fields only the new app writes (photos, gps, events with push ids) are never touched. CPFM deletions are not mirrored.
- `counters/jobs/WO{yyyy}` is raised to the highest imported number. While CPFM runs the app numbers its jobs
  `VR{yyyy}-{n}` (`/config/public/jobPrefix`), so numbers never collide. At the switch-over set the prefix to `WO`
  and the app continues after CPFM's last number. If an app job ever has a CPFM number, the importer warns and the
  app job keeps the tracking page.
- Jobs imported before 2026-11-02 had a random `trackingCode` and one `assigneeUid`; the next run moves them to
  `tracking/{jobNo}` and `assignees` (every job counts as changed once).
- The last full run's stats are in `/config/cpfmImport`; an `--only` run writes `/config/cpfmImport/sections/{names}`.

### Assets, materials, stock card, PM plans

| CPFM | Ours | Key |
|---|---|---|
| assettype group / type | `/assetTypes` (`parentId` = group) | `cpfm_at_{code}` |
| asset-checklist + items | `/checklists/{id}/items` | `cpfm_cl_{code}` |
| asset (asset_category=assets) | `/assets` (+ `files`, `history` from attachments / comments) | `cpfm_as{asset_id}` |
| repair rows (asset_category=repair) | `/assetLogs` (`jobId` = `cpfm_{row_id}` when that job is in our DB) | `cpfm_al{asset_id}` |
| equipt item | `/materials` | `cpfm_m{asset_id}` |
| stock card code with no item | `/materials`, `active: false`, `cpfm.stockCardOnly` | `cpfm_mc_{sha1(code)}` |
| stocks row | `/stockMoves` (`delta` = signed qty, `jobId` as above) | `cpfm_sk{stk_id}` |
| PM plan (set_schedule) | `/pmPlans` (`assets` from listassetspm, `jobs/{due}` from the calendar's `task_code`) | `cpfm_pm{sched_id}` |

- `materials/*/onHand` = CPFM's stock lines + lines entered in the new app. The run warns when CPFM's own `stock` column
  doesn't match the sum of its stock card.
- Stock lines and repair-log lines deleted in CPFM are deleted here too (only `cpfm_…` ids, and not with `--site`).
- Location: the record's CPFM location code (same table as jobs), else its "site > area" name.
- PM due dates are not copied: the app computes them from the repeat rule. The run compares them with CPFM's
  `gridschedule` dates and warns when they differ (PM2021-0001, a 2021 test plan, does).
- `counters/pm/{yyyy}` is raised to the highest CPFM PM number, so new plans continue after it.
- A job's `task_asset` (always empty so far) sets `jobs/*/assetId` when it matches an asset code.

### Attachments
- Photos (jpg/png/webp/gif/tiff/bmp/heic) are downloaded once, shrunk like `src/services/images.js` does
  (≤1280×720, WebP q72, ~30 KB on average), and stored according to `--photos`:
  `storage` → `jobs/{jobId}/cpfm_f{f_id}.webp` in Firebase Storage (download-token URL) · `rtdb` → `/jobPhotos` base64 ·
  `link` → no copy. Default is `VITE_IMAGE_STORE`. In `storage` mode the importer stops if the bucket doesn't exist.
  The meta goes to `jobs/{id}/photos/cpfm_f{f_id}`, the same shape the app writes, so `PhotoGrid` shows it.
  HEIC goes through `heic-convert` (prebuilt `sharp` has no HEVC decoder).
- Everything else (videos, PDFs, photos that fail to convert, or every file with `--photos=link`) is stored as a
  link in `jobs/{id}/files/cpfm_f{f_id}` = `{ name, url, type, bytes, by, at }` and listed on the job page. **These
  links point to the old server and break when CPFM is switched off.** Copy them to Storage before that.
- A photo that is already in `jobs/{id}/photos` is never downloaded again. Files deleted in CPFM are not removed here.
- `--photos-since=YYYY-MM-DD` stores only photos attached on/after that date; older photos become links in
  `jobs/{id}/files` like videos. A later run without the flag stores them and deletes those links. Use it to keep a
  run under Storage's free 5,000 uploads a month (Blaze). Photos per year are about 1,100 to 1,550 (7,908 total by Nov 2026).
- With `--photos=rtdb`, ~11k photos × ~40 KB base64 ≈ 450 MB of RTDB. That's workable but heavy on the Spark plan (1 GB), so prefer Storage.

## Not imported yet (ideas)
Satisfaction ratings beyond `cpfm.rating`, the expenses tab (1 test row in all of CPFM), meter readings, attachments on
notes (none seen), check-list *results* (CPFM stores none: no PM work orders were ever generated).
