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

/users/{uid}
    email, displayName, phone, department, lang ("th"|"en")
    role            "user" | "contractor" | "technician" | "admin"
    company         (contractors)
    providers       { "microsoft_com": true, "google_com": true, "password": true }   ("." → "_" because RTDB keys cannot contain ".")
    createdAt, lastLoginAt

/invites/{emailKey}                emailKey = lower-case email with "." replaced by ","
    email, name, company, role ("contractor" | "technician"), invitedBy, createdAt
    -> on first sign-in with that (verified) email, the client upgrades /users/{uid}/role

/buildings/{buildingId}
    code ("VISTEC-A"), nameTh, nameEn, lat, lng, active, order
/areas/{areaId}
    buildingId, nameTh, nameEn, active, order       (floor / room / zone inside a building)
/jobTypes/{typeId}
    nameTh, nameEn, icon (mdi name), active, order

/counters/jobs/{yyyy}              integer, +1 per job (transaction)  -> jobNo WO{yyyy}-{0000}

/jobs/{jobId}
    jobNo           "WO2026-0001"
    trackingCode    "K7P3QX9M"   (8 chars, random, unguessable — key of /tracking)
    status          "new" | "assigned" | "in_progress" | "on_hold" | "completed" | "cancelled"
    priority        "normal" | "urgent" | "low" | "callback"
    jobTypeId, buildingId, areaId, locationDetail
    gps             { lat, lng, accuracy, at }        (from phone, optional)
    description
    reporterUid                                       (top level: needed for query rules)
    reporter        { name, email, phone, department }
    lang            reporter's UI language at creation ("th"|"en") — used for email
    pdpaAt          time PDPA consent was given
    assigneeUid, assigneeName
    expectedDate    ms — when the repair is expected to be finished
    expectedNote    free text shown to the reporter
    hold            { reason, note, resumeDate, partsEta, since }   (only while status == on_hold)
                    reason: "waiting_parts" | "budget" | "contractor" | "access" | "other"
    workDetail      what the technician did
    photos/{photoId} { store: "storage"|"rtdb", url, path, w, h, bytes, by, at }
                    storage: file at jobs/{jobId}/{photoId}.webp with customMetadata.uid = uploader
                    rtdb:    base64 data URL at /jobPhotos/{jobId}/{photoId}
    createdAt, updatedAt, completedAt

/jobEvents/{jobId}/{eventId}       activity log / timeline (append only)
    at, byUid, byName
    type      "created" | "status" | "assign" | "expected" | "hold" | "comment" | "photo"
    from, to  (status change)
    note
    public    true -> also copied into /tracking timeline and e-mailed to the reporter

/tracking/{trackingCode}           PUBLIC projection — no personal data. Readable by anyone
                                   who knows the code; the list itself is not readable.
    jobId, jobNo, status, jobTypeId, buildingId, areaId,
    createdAt, updatedAt, expectedDate, expectedNote, hold { reason, note, resumeDate, partsEta }
    timeline/{eventId} { at, type, to, note }

/jobPhotos/{jobId}/{photoId}       only used when VITE_IMAGE_STORE=rtdb (base64 webp)

/mail/{mailId}                     written by Cloud Function only (send log)
    to, subject, jobId, eventId, state ("sent"|"error"|"skipped"), error, at
```

## Indexes (`.indexOn`)

- `/jobs`: `createdAt`, `status`, `reporterUid`, `assigneeUid`
- `/areas`: `buildingId`
- `/users`: `role`, `email`

## Write patterns

- **Create job (reporter):** transaction on `/counters/jobs/{yyyy}` → one multi-path `update()` writing
  `jobs/{id}`, `tracking/{code}`, `jobEvents/{id}/{e}`. Photos are uploaded afterwards and added to `jobs/{id}/photos`.
- **Staff change:** one multi-path `update()` of `jobs/{id}/…`, `tracking/{code}/…` and a new `jobEvents/{id}/{e}`.
  Every public event is mirrored to `tracking/{code}/timeline/{e}`.
- **E-mail:** Cloud Function `onJobEvent` triggers on `/jobEvents/{jobId}/{eventId}` create; sends to the
  reporter when `public == true`, and to admins/technicians on `created`. Logs into `/mail`.

## Rule highlights (`database.rules.json`, generated by `scripts/build-rules.py`)

- `/jobs` can only be listed by technician/admin; reporters must query `orderByChild('reporterUid').equalTo(uid)`,
  contractors `orderByChild('assigneeUid').equalTo(uid)`.
- Reporters create a job only with `status = new`, no assignee or expected date, and with a matching `/tracking` entry in the same write.
  Afterwards they may only add photos, set `updatedAt`, and add public `comment` events.
- Contractors can update a job only while it is assigned to them, and cannot reassign it.
- `jobNo`, `trackingCode` and `reporterUid` never change. Only admins can delete a job.
- Users can set their own role only to `user`, or to the role in their invite once their e-mail is verified.

## Size budget

Images are resized in the browser to **≤ 1280×720** and encoded **WebP q≈0.75** (typically 40–120 KB),
max **3 photos per job**. Storage rules reject anything not `image/webp` or larger than 400 KB.
