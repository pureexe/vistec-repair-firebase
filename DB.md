# DB.md — Realtime Database design

Database: `https://vistec-repair-default-rtdb.asia-southeast1.firebasedatabase.app`
Rules file: [`database.rules.json`](database.rules.json) (copy into Firebase console → Realtime Database → Rules).

All timestamps are **milliseconds since epoch** (`serverTimestamp()` where possible).
All "key" ids are RTDB push ids unless stated.

## Roles

| role | who | can |
|---|---|---|
| `user` | anyone who signs in (VISTEC Microsoft, Google, email) | create repair requests, see/comment own jobs |
| `contractor` | outsourced repair staff (no VISTEC email) — invited by admin | see & update **only jobs assigned to them** |
| `technician` | VISTEC facility staff | see & update all jobs |
| `admin` | facility manager | everything + master data + users + invites |

The **first admin** must be set by hand in the Firebase console: `/users/{uid}/role = "admin"`.

## Tree

```
/config/public                     (public read, admin write)
    orgNameTh, orgNameEn, supportEmail, supportPhone
    jobPrefix       2 capital letters for app-created job numbers (default "VR"). Set to "WO" when CPFM is switched
                    off: the app then continues after CPFM's last number (counters/jobs/WO{yyyy})

/users/{uid}
    email, displayName, phone, department, lang ("th"|"en")
    role            "user" | "contractor" | "technician" | "admin"
    company         (contractors)
    staffId         linked /staff record (set once, see /staff)
    providers       { "microsoft_com": true, "google_com": true, "password": true }   ("." → "_" because RTDB keys cannot contain ".")
    createdAt, lastLoginAt

/invites/{emailKey}                emailKey = lower-case email with "." replaced by ","
    email, name, company, role ("contractor" | "technician"), invitedBy, createdAt
    -> on first sign-in with that (verified) email, the client upgrades /users/{uid}/role

/staff/{staffId}                   ผู้ปฏิบัติงาน that may not have an account yet. CPFM technicians: id cpfm_s{code}
    name, code (CPFM staff code), role ("technician"|"contractor"), company, siteId, active
    email           lower-case; whoever signs in with it (verified) is linked automatically
    uid             the linked account (users/{uid}/staffId points back). Set by the admin or by that person
    cpfm            { code }  importer only
    -> a job assigned to a staff record before the person had an account becomes theirs when they are linked

/assignments/{key}/{jobId} = true  key = staff id or uid; lets people list their own jobs (contractors can't query /jobs)

/sites/{siteId}                    organisation / campus: THEENCONY, PTTEP, VISTEC, KVIS
    code, nameTh, nameEn, active, order
/buildings/{buildingId}
    siteId, code ("VISTEC-A"), nameTh, nameEn, lat, lng, active, order
/areas/{areaId}
    buildingId, nameTh, nameEn, active, order       (floor / room / zone inside a building)
/jobTypes/{typeId}
    nameTh, nameEn, icon (mdi name), active, order

/counters/jobs/{prefix}{yyyy}      integer, +1 per job (transaction)  -> jobNo {prefix}{yyyy}-{0000}, e.g. VR2026-0001.
                                   WO{yyyy} = highest CPFM number (raised by the importer)
/counters/pm/{yyyy}                integer, +1 per PM plan -> PM{yyyy}-{0000}. Raised by the importer to CPFM's highest

/jobs/{jobId}
    jobNo           "VR2026-0001" (app) / "WO2026-2557" (CPFM). Also the public tracking id (key of /tracking).
                    Never changes. While CPFM still runs the two use different prefixes, so a number is never reused.
    status          "new" | "assigned" | "in_progress" | "on_hold" | "completed" | "cancelled"
    priority        "normal" | "urgent" | "low" | "callback"
    jobTypeId, siteId, buildingId, areaId, locationDetail
    gps             { lat, lng, accuracy, at }        (from phone, optional)
    description
    reporterUid                                       (top level: needed for query rules)
    reporter        { name, email, phone, department }
    lang            reporter's UI language at creation ("th"|"en") — used for email
    pdpaAt          time PDPA consent was given
    assignees/{key} name     ผู้ปฏิบัติงาน, any number. key = /staff id, or uid for an account without a staff record
    assigneeKeys    ",key1,key2,"  same keys as one string: the rules check membership with contains()
    assigneeName    names joined with ", " (cards, search, dashboard)
    expectedDate    ms — when the repair is expected to be finished
    expectedNote    free text shown to the reporter
    hold            { reason, note, resumeDate, partsEta, since }   (only while status == on_hold)
                    reason: "waiting_parts" | "budget" | "contractor" | "access" | "other"
    workDetail      what the technician did
    assetId         the machine (/assets) the job is for (optional)
    pm              { planId, at }   work order made from a PM plan for its due date `at` (ms)
    photos/{photoId} { store: "storage"|"rtdb", url, path, w, h, bytes, by, at }   (imported: id cpfm_f{f_id}, by "cpfm", + name)
    files/{fileId}   { name, url, type, bytes, by, at }   links to attachments left on the old CPFM server (importer only)
    idx             { s, o, si, sis, sio, b, bs, bo }   paging sort keys, see below
                    storage: file at jobs/{jobId}/{photoId}.webp with customMetadata.uid = uploader
                    rtdb:    base64 data URL at /jobPhotos/{jobId}/{photoId}
    createdAt, updatedAt, completedAt
    cpfm            { id, location, type, by, rating, hash }   only on jobs imported from the old system (id cpfm_{task_id})

/jobEvents/{jobId}/{eventId}       activity log / timeline (append only)
    at, byUid, byName
    type      "created" | "status" | "assign" | "unassign" | "expected" | "hold" | "comment" | "photo"
    from, to  (status change; assign: to = name; unassign: from = name)
    key       assign / unassign: the assignee key (the e-mail function uses it)
    note
    public    true -> also copied into /tracking timeline and e-mailed to the reporter
    imported  true on events copied from CPFM (byUid "cpfm") — never e-mailed

/tracking/{jobNo}                  PUBLIC projection — no personal data. Readable by anyone who knows (or guesses)
                                   the job number; the list itself is not readable. Numbers are sequential, so
                                   staff must not put personal details in public timeline notes.
    jobId, jobNo, status, jobTypeId, siteId, buildingId, areaId,
    createdAt, updatedAt, expectedDate, expectedNote, hold { reason, note, resumeDate, partsEta }
    timeline/{eventId} { at, type, to, note }

/jobPhotos/{jobId}/{photoId}       only used when VITE_IMAGE_STORE=rtdb (base64 webp)

--- การบำรุงรักษา (PM) and เครื่องจักรและอุปกรณ์ — technician / admin only (read + write; only admins delete) ---

/assetTypes/{id}                   categories of machines and materials. CPFM: cpfm_at_{code}
    code, nameTh, nameEn, order, active
    parentId        the group (ระบบงาน, e.g. "ระบบวิศวกรรมเครื่องกล…"); null = this is a group
/checklists/{id}                   PM / QM check-list templates. CPFM: cpfm_cl_{code}  (admin)
    code, nameTh, active
    items/{k}       { order, label, kind ("select"|"text"|…), options ("ปกติ,ไม่ปกติ") }

/assets/{assetId}                  เครื่องจักรและอุปกรณ์. CPFM: cpfm_as{asset_id}
    code, name, typeId, siteId, buildingId, areaId, locationDetail
    status          "normal" | "repair" | "written_off" | "expired"   (ปกติ / ซ่อมแซม / Write-Off / หมดอายุ)
    brand, model, serial, supplier, qty, unit, price, installedAt (ms), warrantyYears, lifeYears
    pm, qm          booleans (in PM / QM programmes)
    checklistId, detail, remark
    history/{id}    { at, byUid, byName, note }   change log, append-only (CPFM comments: cpfm_n{note_id})
    files/{id}      { name, url, type, bytes, by, at }   links to CPFM attachments (importer only)
    createdAt, updatedAt, createdBy, updatedBy (names)
    cpfm            { id, code, location, type, brand, hash }   importer only

/assetLogs/{logId}                 ซ่อมเครื่องจักร: repair / maintenance log. CPFM: cpfm_al{asset_id}
    assetId, at, action ("pm"|"repair"|"change"|"transfer"|"install"|"other"), detail, qty, unit, cost,
    downtime (CPFM "BreakDown Time", free text), jobId, jobNo, byUid, byName, createdAt
    -> written from the asset page, or from a job (then the job also gets an internal comment event)

/materials/{materialId}            วัสดุอุปกรณ์ / spare parts. CPFM: cpfm_m{asset_id}; a code seen only on CPFM's
                                   stock card (item deleted there) → cpfm_mc_{sha1(code)}, active false
    code, name, typeId, store, brand, model, serial, supplier, unit, price, min, max, detail, remark, active
    onHand          = sum of the item's stockMoves[].delta. Changed with increment() in the same write as the line
    history, createdAt, updatedAt, createdBy, updatedBy, cpfm (as /assets)
    -> reorder suggestion (แนะนำสั่งซื้อ) = max − onHand once onHand ≤ min (computed, not stored)

/stockMoves/{moveId}               Stock Card lines, append-only (admins may delete). CPFM: cpfm_sk{stk_id}
    materialId, code, name, unit   (code / name / unit copied so the line reads on its own)
    type            "in" (นำเข้าสต็อค) | "out" (ตัดสต็อค)
    qty  > 0, delta = +qty (in) / −qty (out)  (rules check it)
    price, total, store, title, detail, siteId, buildingId, areaId
    jobId, jobNo    materials used on a job ("ตัดสต็อค" from the job page)
    at, byUid, byName, createdAt

/pmPlans/{planId}                  แผนบำรุงรักษา. CPFM: cpfm_pm{sched_id}
    code            "PM2026-0007" (never changes)
    title, detail (tasks to do), siteId, buildingId, areaId, jobTypeId, priority, checklistId
    start, end      ms; the plan repeats from start until end (end null = forever)
    repeat, every   "none"|"minute"|"hour"|"day"|"week"|"month"|"quarter"|"year" × every N
                    due dates are computed, not stored: src/services/pmSchedule.js → occurrences()
    remind          { n, unit }  แจ้งเตือนก่อน (stored; no reminder e-mail yet)
    active          bool (ใช้งาน / ไม่ใช้งาน)
    assets/{assetId} = true        machines in this plan
    jobs/{dueMs}    = jobId        work order made for that due date (so it is never made twice)
    lastAt          latest due date a work order was made for
    history, createdAt, updatedAt, createdBy, updatedBy, cpfm (as /assets)

/mail/{mailId}                     written by Cloud Function only (send log)
    to, subject, jobId, eventId, state ("sent"|"error"|"skipped"), error, at
```

## Paging the job list (`jobs/{id}/idx`)

RTDB can filter and sort on one child only, so each job stores one sort key per filter combination
(`src/services/jobIndex.js`). Each key is `"<filter value>|<createdAt, 16 digits>"`:

| key | filter | example |
|---|---|---|
| `s` / `o` | status / open (`1`) or closed (`0`) | `on_hold\|0001790000000000` |
| `si` / `sis` / `sio` | site, site + status, site + open | `cpfm_VISTEC\|on_hold\|…` |
| `b` / `bs` / `bo` | the same for a building | |

The list queries `orderByChild('idx/sis').startAt(prefix).endBefore(cursor).limitToLast(51)`, 50 per page, newest
first. "All jobs, any status" uses `createdAt`. **Every write that changes `status`, `siteId` or `buildingId` must also
write `idx`.** `applyJobChange` and `createJob` do this. The importer recomputes `idx` for every job (including app jobs)
on each run, so a run of `npm run import:cpfm` also repairs keys.

## Indexes (`.indexOn`)

- `/jobs`: `createdAt`, `status`, `reporterUid`, `siteId`, `jobNo`, `assetId`, `pm/planId`, `idx/{s,o,si,sis,sio,b,bs,bo}`
- `/assets`: `code`, `buildingId` · `/materials`: `code`
- `/assetLogs`: `assetId`, `jobId` · `/stockMoves`: `materialId`, `jobId`
- `/staff`: `email`, `uid`
- `/buildings`: `siteId`
- `/areas`: `buildingId`
- `/users`: `role`, `email`

## Write patterns

- **Create job (reporter):** transaction on `/counters/jobs/{prefix}{yyyy}` → one multi-path `update()` writing
  `jobs/{id}`, `tracking/{jobNo}`, `jobEvents/{id}/{e}`. Photos are uploaded afterwards and added to `jobs/{id}/photos`.
- **Staff change:** one multi-path `update()` of `jobs/{id}/…`, `tracking/{jobNo}/…` and a new `jobEvents/{id}/{e}`.
  Every public event is mirrored to `tracking/{jobNo}/timeline/{e}`.
- **Add / remove ผู้ปฏิบัติงาน:** the same update also sets `assignees/{key}`, `assigneeKeys`, `assigneeName` and
  `assignments/{key}/{jobId}` (`addAssignee` / `removeAssignee` in `services/jobs.js`).
- **Link a staff record:** `staff/{id}/uid` + `users/{uid}/staffId` in one update (admin on the Users page, or the
  person at sign-in when `staff/{id}/email` is their verified e-mail; the admin also creates an invite for the role).
- **Stock in / out:** one `update()` writing `stockMoves/{id}` and `materials/{id}/onHand: increment(±qty)`; from a job
  it goes through `applyJobChange` so the same write adds an internal comment event (`services/inventory.js → addStockMove`).
- **Repair log line:** `assetLogs/{id}` (+ `assets/{id}/status` when it changes; + a job comment when written from a job).
- **PM work order:** `createJob()` with `pm: { planId, at }`, `expectedDate: at` and the plan's location / type, then
  `pmPlans/{id}/jobs/{at} = jobId` (`services/pm.js → createPmJob`). "Gen. Job ถึง" does this for every due date from
  today to the chosen date that has no work order yet. The staff member who presses the button is the reporter.
- **E-mail:** Cloud Function `onJobEvent` triggers on `/jobEvents/{jobId}/{eventId}` create; sends to the
  reporter when `public == true`, and to admins/technicians on `created`. Logs into `/mail`.

## Imported data (old CPFM system)

`npm run import:cpfm` (see `CPFM_IMPORT.md`) writes sites, buildings, areas, job types, jobs, tracking and events,
and the assets, materials, stock card, repair log, check lists, asset types and PM plans, with deterministic ids (`cpfm_…`) and a `cpfm` child, so re-runs update in place and the old system wins.
It runs with the Admin SDK (bypasses rules). Clients can never write `jobs/*/cpfm` or `jobEvents/*/*/imported`.
Imported jobs have `reporterUid` = the matching user's uid (same e-mail) or `"cpfm"`; `assignees` = the CPFM staff
(`/staff/cpfm_s{code}`) from the job's `task_action_by`.
`/config/cpfmImport` holds the last run's time and stats.

## Rule highlights (`database.rules.json`, generated by `scripts/build-rules.py`)

- `/jobs` can only be listed by technician/admin; reporters must query `orderByChild('reporterUid').equalTo(uid)`.
- Reporters create a job only with `status = new`, no assignee or expected date, and with a matching `/tracking` entry in the same write.
  Afterwards they may only add photos, set `updatedAt`, and add public `comment` events.
- Contractors read their jobs through `/assignments`, update a job only while they are on it (by uid or linked staff
  id), and cannot change who is on it (`assigneeKeys`).
- A reporter's new job number must start with `config/public/jobPrefix` (default `VR`), and `tracking/{jobNo}` can't be
  taken by a second job.
- `jobNo` and `reporterUid` never change. Only admins can delete a job.
- Users can set their own role only to `user`, or to the role in their invite once their e-mail is verified.
- Assets, materials, stock card, repair log and PM plans: technician / admin only; contractors and reporters can't read
  them. Stock lines are append-only; `history` lines too. `files` and `cpfm` are importer-only.

## Size budget

Images are resized in the browser to **≤ 1280×720** and encoded **WebP q≈0.75** (typically 40–120 KB),
max **3 photos per job**. Storage rules reject anything not `image/webp` or larger than 400 KB.
