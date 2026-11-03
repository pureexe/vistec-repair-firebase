"""Generates database.rules.json (RTDB rules have no functions, so helpers are expanded here).
Run: python3 scripts/build-rules.py   — edit THIS file, not the JSON."""
import json, pathlib

ROLE = "root.child('users').child(auth.uid).child('role').val()"
AUTH = "auth != null"
TECH = f"({AUTH} && ({ROLE} == 'technician' || {ROLE} == 'admin'))"
ADMIN = f"({AUTH} && {ROLE} == 'admin')"
CONTRACTOR = f"({AUTH} && {ROLE} == 'contractor')"
NOW_OK = "newData.isNumber() && newData.val() <= now + 60000"
EMAIL_KEY = "auth.token.email.toLowerCase().replace('.', ',')"

def s(maxlen, allow_empty=True):
    base = f"newData.isString() && newData.val().length <= {maxlen}"
    return base if allow_empty else base + " && newData.val().length > 0"

STATUS_RE = "newData.isString() && newData.val().matches(/^(new|assigned|in_progress|on_hold|completed|cancelled)$/)"

# The viewer's linked /staff record (a job can be assigned to it before the person has an account)
MY_STAFF = "root.child('users').child(auth.uid).child('staffId')"

def assignee(job):
    """auth user is one of the job's ผู้ปฏิบัติงาน. `job` = rules expression of the job node.
    assigneeKeys is ",k1,k2," (src/services/util.js → assigneeKeyString); a key is a uid or a staff id."""
    keys = f"{job}.child('assigneeKeys')"
    return (f"({AUTH} && {keys}.isString() && ({keys}.val().contains(',' + auth.uid + ',')"
            f" || ({MY_STAFF}.isString() && {keys}.val().contains(',' + {MY_STAFF}.val() + ','))))")

# Job helpers (relative to /jobs/$jobId)
JOB_REPORTER = "data.child('reporterUid').val() == auth.uid"
JOB_ASSIGNEE = assignee("data")
NEW_ROOT_FROM_JOB = "newData.parent().parent()"
# App-created job numbers must use the configured prefix (VR… while CPFM still issues WO…; see DB.md)
PREFIX = "root.child('config').child('public').child('jobPrefix')"
JOB_PREFIX_OK = f"newData.child('jobNo').val().beginsWith({PREFIX}.isString() ? {PREFIX}.val() + '20' : 'VR20')"

JOB_OF = "root.child('jobs').child($jobId)"

# Assets, materials and PM plans (DB.md → Assets & inventory): staff read and write, only admins delete.
STAFF_EDIT = f"{TECH} && (newData.exists() || {ADMIN})"
NUM = {".validate": "newData.isNumber()"}
NUM_POS = {".validate": "newData.isNumber() && newData.val() >= 0"}
BOOL = {".validate": "newData.isBoolean()"}
def strs(**fields):
    """{name: maxlen} → validators for plain string fields"""
    return {k: {".validate": s(n)} for k, n in fields.items()}
EXISTS_IN = lambda coll: f"newData.isString() && root.child('{coll}').child(newData.val()).exists()"
# change log on a record: append-only lines { at, byUid, byName, note }
HISTORY = {"$h": {".validate": "newData.hasChildren(['at', 'note']) && !data.exists()", "note": {".validate": s(3000)}}}
STAMPS = {"createdAt": {".validate": NOW_OK}, "updatedAt": {".validate": NOW_OK}, **strs(createdBy=120, updatedBy=120)}
# files (links to attachments left on the old server) and cpfm are written only by scripts/import-cpfm.mjs
IMPORTED = {"files": {".validate": False}, "cpfm": {".validate": False}}
PLACE = {"siteId": {".validate": EXISTS_IN('sites')}, "buildingId": {".validate": EXISTS_IN('buildings')}, "areaId": {".validate": "newData.isString()"}}
NEW_JOB_OF_EVENT = "newData.parent().parent().parent().child('jobs').child($jobId)"
JOB_OF_TRACKING = "root.child('jobs').child(data.child('jobId').val())"

rules = {
  "rules": {
    ".read": False, ".write": False,

    "config": {"public": {".read": True, ".write": ADMIN,
                          "jobPrefix": {".validate": "newData.isString() && newData.val().matches(/^[A-Z]{2}$/)"}}},

    "users": {
      ".read": TECH,
      ".indexOn": ["role", "email"],
      "$uid": {
        ".read": f"{AUTH} && (auth.uid == $uid || {TECH})",
        ".write": f"{AUTH} && (auth.uid == $uid || {ADMIN})",
        ".validate": "newData.hasChildren(['role'])",
        "role": {".validate":
          "newData.isString() && newData.val().matches(/^(user|contractor|technician|admin)$/) && ("
          f"{ADMIN}"
          " || (!data.exists() && newData.val() == 'user')"
          " || data.val() == newData.val()"
          f" || (data.val() == 'user' && auth.token.email != null && auth.token.email_verified == true"
          f"     && root.child('invites').child({EMAIL_KEY}).child('role').val() == newData.val()))"},
        "email": {".validate": s(200)},
        "displayName": {".validate": s(120)},
        "phone": {".validate": s(40)},
        "department": {".validate": s(120)},
        "company": {".validate": s(120)},
        # link to a /staff record — only to one that already points back at this account (or by an admin)
        "staffId": {".validate": f"newData.isString() && ({ADMIN} || (!data.exists()"
                                 " && newData.parent().parent().parent().child('staff').child(newData.val()).child('uid').val() == $uid))"},
        "lang": {".validate": "newData.isString() && newData.val().matches(/^(th|en)$/)"},
        "providers": {"$p": {".validate": "newData.isBoolean()"}},
        "createdAt": {".validate": NOW_OK},
        "lastLoginAt": {".validate": NOW_OK},
        "$other": {".validate": False}
      }
    },

    "invites": {
      ".read": ADMIN,
      "$key": {
        ".read": f"{AUTH} && auth.token.email != null && $key == {EMAIL_KEY}",
        ".write": ADMIN,
        ".validate": "newData.hasChildren(['email', 'role']) && newData.child('role').val().matches(/^(contractor|technician)$/)"
      }
    },

    # ผู้ปฏิบัติงาน without an account yet (CPFM technicians …). Linked when someone signs in with `email`.
    "staff": {
      ".read": f"{TECH} || ({AUTH} && auth.token.email != null && query.orderByChild == 'email' && query.equalTo == auth.token.email.toLowerCase())",
      ".indexOn": ["email", "uid"],
      "$id": {
        ".write": ADMIN,
        ".validate": "newData.hasChildren(['name'])",
        "name": {".validate": s(120, False)},
        "email": {".validate": "newData.isString() && newData.val().length <= 200 && newData.val() == newData.val().toLowerCase()"},
        "uid": {
          # the person claims the record with the verified e-mail the admin entered
          ".write": f"{AUTH} && !data.exists() && newData.val() == auth.uid && auth.token.email_verified == true"
                    " && root.child('staff').child($id).child('email').val() == auth.token.email.toLowerCase()",
          ".validate": "newData.isString()"
        },
        "role": {".validate": "newData.isString() && newData.val().matches(/^(contractor|technician)$/)"},
        "company": {".validate": s(120)}, "phone": {".validate": s(40)}, "code": {".validate": s(40)},
        "siteId": {".validate": "newData.isString()"}, "active": {".validate": "newData.isBoolean()"},
        "order": {".validate": "newData.isNumber()"}, "createdAt": {".validate": "newData.isNumber()"},
        "cpfm": {".validate": False},  # importer only
        "$other": {".validate": False}
      }
    },

    # assignee key (uid or staff id) → jobs, so people can list their own jobs (contractors may not query /jobs)
    "assignments": {"$key": {
      ".read": f"{TECH} || ({AUTH} && ($key == auth.uid || {MY_STAFF}.val() == $key))",
      "$jobId": {".write": TECH, ".validate": "newData.val() == true"}
    }},

    "sites": {".read": True, ".write": ADMIN, "$id": {".validate": "newData.hasChildren(['nameTh'])"}},
    "buildings": {".read": True, ".write": ADMIN, ".indexOn": ["siteId"], "$id": {".validate": "newData.hasChildren(['nameTh'])"}},
    "areas": {".read": True, ".write": ADMIN, ".indexOn": ["buildingId"], "$id": {".validate": "newData.hasChildren(['nameTh', 'buildingId'])"}},
    "jobTypes": {".read": True, ".write": ADMIN, "$id": {".validate": "newData.hasChildren(['nameTh'])"}},

    # categories of assets and materials: a group (parentId null) → types
    "assetTypes": {".read": TECH, ".write": ADMIN, "$id": {
      ".validate": "newData.hasChildren(['nameTh'])",
      "parentId": {".validate": EXISTS_IN('assetTypes')}, "order": NUM, "active": BOOL,
      **strs(code=80, nameTh=200, nameEn=200), "cpfm": {".validate": False}, "$other": {".validate": False}
    }},
    # PM / QM check-list templates
    "checklists": {".read": TECH, ".write": ADMIN, "$id": {
      ".validate": "newData.hasChildren(['nameTh'])", **strs(code=80, nameTh=200), "active": BOOL,
      "items": {"$k": {".validate": "newData.hasChildren(['label'])", "order": NUM, **strs(label=300, kind=20, options=500), "$o": {".validate": False}}},
      "cpfm": {".validate": False}, "$other": {".validate": False}
    }},

    # เครื่องจักรและอุปกรณ์
    "assets": {".read": TECH, ".indexOn": ["code", "buildingId"], "$id": {
      ".write": STAFF_EDIT,
      ".validate": "newData.hasChildren(['code', 'name'])",
      **strs(code=80, name=200, locationDetail=200, brand=120, model=120, serial=120, supplier=120, unit=40, detail=3000, remark=3000),
      "code": {".validate": s(80, False)}, "name": {".validate": s(200, False)},
      "typeId": {".validate": EXISTS_IN('assetTypes')}, **PLACE,
      "status": {".validate": "newData.isString() && newData.val().matches(/^(normal|repair|written_off|expired)$/)"},
      "qty": NUM_POS, "price": NUM_POS, "warrantyYears": NUM_POS, "lifeYears": NUM_POS, "installedAt": NUM,
      "pm": BOOL, "qm": BOOL, "checklistId": {".validate": EXISTS_IN('checklists')},
      "history": HISTORY, **STAMPS, **IMPORTED, "$other": {".validate": False}
    }},
    # ซ่อมเครื่องจักร: repair / maintenance log lines
    "assetLogs": {".read": TECH, ".indexOn": ["assetId", "jobId"], "$id": {
      ".write": STAFF_EDIT,
      ".validate": "newData.hasChildren(['assetId', 'action', 'at'])",
      "assetId": {".validate": EXISTS_IN('assets')},
      "action": {".validate": "newData.isString() && newData.val().matches(/^(pm|repair|change|transfer|install|other)$/)"},
      "at": NUM, "qty": NUM_POS, "cost": NUM_POS, **strs(detail=3000, unit=40, downtime=40, jobNo=20, byName=120),
      "jobId": {".validate": EXISTS_IN('jobs')}, "byUid": {".validate": "newData.val() == auth.uid"}, "createdAt": {".validate": NOW_OK},
      "cpfm": {".validate": False}, "$other": {".validate": False}
    }},
    # วัสดุอุปกรณ์ (spare parts). onHand = sum of the item's stockMoves, moved in the same write as each line
    "materials": {".read": TECH, ".indexOn": ["code"], "$id": {
      ".write": STAFF_EDIT,
      ".validate": "newData.hasChildren(['code', 'name'])",
      **strs(store=80, brand=120, model=120, serial=120, supplier=120, unit=40, detail=3000, remark=3000),
      "code": {".validate": s(80, False)}, "name": {".validate": s(200, False)},
      "typeId": {".validate": EXISTS_IN('assetTypes')},
      "price": NUM_POS, "min": NUM_POS, "max": NUM_POS, "onHand": NUM, "active": BOOL,
      "history": HISTORY, **STAMPS, **IMPORTED, "$other": {".validate": False}
    }},
    # Stock card: append-only (admins may delete a wrong line). delta = +qty (in) / -qty (out)
    "stockMoves": {".read": TECH, ".indexOn": ["materialId", "jobId"], "$id": {
      ".write": f"{TECH} && ((!data.exists() && newData.exists()) || {ADMIN})",
      ".validate": "newData.hasChildren(['materialId', 'type', 'qty', 'delta', 'at'])"
                   " && (newData.child('type').val() == 'in' ? newData.child('delta').val() == newData.child('qty').val()"
                   " : newData.child('delta').val() + newData.child('qty').val() == 0)",
      "materialId": {".validate": EXISTS_IN('materials')},
      "type": {".validate": "newData.isString() && newData.val().matches(/^(in|out)$/)"},
      "qty": {".validate": "newData.isNumber() && newData.val() > 0"}, "delta": NUM, "price": NUM_POS, "total": NUM_POS, "at": NUM,
      **strs(code=80, name=200, unit=40, store=80, title=200, detail=1000, jobNo=20, byName=120), **PLACE,
      "jobId": {".validate": EXISTS_IN('jobs')}, "byUid": {".validate": "newData.val() == auth.uid"}, "createdAt": {".validate": NOW_OK},
      "cpfm": {".validate": False}, "$other": {".validate": False}
    }},
    # แผนบำรุงรักษา (PM). Due dates follow the repeat rule (src/services/pmSchedule.js); jobs/{dueMs} = the work order made for it
    "pmPlans": {".read": TECH, "$id": {
      ".write": STAFF_EDIT,
      ".validate": "newData.hasChildren(['code', 'title', 'start', 'buildingId', 'jobTypeId'])"
                   " && (!data.exists() || newData.child('code').val() == data.child('code').val())",
      "code": {".validate": "newData.isString() && newData.val().matches(/^PM20[0-9][0-9]-[0-9]{4,}$/)"},
      "title": {".validate": s(200, False)}, "detail": {".validate": s(3000)},
      **PLACE, "jobTypeId": {".validate": EXISTS_IN('jobTypes')},
      "priority": {".validate": "newData.isString() && newData.val().matches(/^(normal|urgent|low|callback)$/)"},
      "start": NUM, "end": NUM, "lastAt": NUM,
      "repeat": {".validate": "newData.isString() && newData.val().matches(/^(none|minute|hour|day|week|month|quarter|year)$/)"},
      "every": {".validate": "newData.isNumber() && newData.val() >= 1"},
      "remind": {"n": NUM_POS, "unit": {".validate": "newData.isString() && newData.val().matches(/^(minute|hour|day|week)$/)"}, "$o": {".validate": False}},
      "active": BOOL, "checklistId": {".validate": EXISTS_IN('checklists')},
      "assets": {"$a": {".validate": "newData.val() == true"}},
      "jobs": {"$at": {".validate": f"$at.matches(/^[0-9]+$/) && {EXISTS_IN('jobs')}"}},
      "history": HISTORY, **STAMPS, **IMPORTED, "$other": {".validate": False}
    }},

    # counters/jobs/{prefix}{yyyy}, e.g. VR2026 (app) and WO2026 (raised by the CPFM importer)
    "counters": {
      "jobs": {"$key": {
        ".read": AUTH,
        ".write": AUTH,
        ".validate": "$key.matches(/^[A-Z]{2}20[0-9][0-9]$/) && newData.isNumber() && newData.val() == (data.exists() ? data.val() + 1 : 1)"
      }},
      # counters/pm/{yyyy}: PM plan numbers (PM2026-0008), raised by the importer to CPFM's highest
      "pm": {"$year": {
        ".read": TECH, ".write": TECH,
        ".validate": "$year.matches(/^20[0-9][0-9]$/) && newData.isNumber() && newData.val() == (data.exists() ? data.val() + 1 : 1)"
      }}
    },

    "jobs": {
      ".read": f"{TECH}"
               f" || ({AUTH} && query.orderByChild == 'reporterUid' && query.equalTo == auth.uid)",
      # idx/* = paging sort keys (src/services/jobIndex.js); jobNo = exact search
      ".indexOn": ["createdAt", "status", "reporterUid", "siteId", "jobNo", "assetId", "pm/planId",
                   "idx/s", "idx/o", "idx/si", "idx/sis", "idx/sio", "idx/b", "idx/bs", "idx/bo"],
      "$jobId": {
        ".read": f"{TECH} || ({AUTH} && ({JOB_REPORTER} || {JOB_ASSIGNEE}))",
        ".write":
          # staff: anything except delete (admin may delete)
          f"({TECH} && (newData.exists() || {ADMIN}))"
          # reporter creates a new job
          f" || ({AUTH} && !data.exists() && newData.child('reporterUid').val() == auth.uid && newData.child('status').val() == 'new'"
          f"     && !newData.hasChild('assigneeKeys') && !newData.hasChild('assignees') && !newData.hasChild('expectedDate')"
          f"     && {JOB_PREFIX_OK}"
          f"     && {NEW_ROOT_FROM_JOB}.child('tracking').child(newData.child('jobNo').val()).child('jobId').val() == $jobId)"
          # contractor updates a job assigned to them (cannot change who is on it)
          f" || ({CONTRACTOR} && data.exists() && newData.exists() && {JOB_ASSIGNEE} && newData.child('assigneeKeys').val() == data.child('assigneeKeys').val())",
        ".validate": "newData.hasChildren(['jobNo', 'status', 'reporterUid', 'jobTypeId', 'buildingId', 'description', 'createdAt'])"
                     " && (!data.exists() || (newData.child('jobNo').val() == data.child('jobNo').val()"
                     " && newData.child('reporterUid').val() == data.child('reporterUid').val()))",
        # also the public tracking id: /tracking/{jobNo}
        "jobNo": {".validate": "newData.isString() && newData.val().matches(/^[A-Z]{2}20[0-9][0-9]-[0-9]{4,}$/)"},
        "status": {".validate": STATUS_RE},
        "priority": {".validate": "newData.isString() && newData.val().matches(/^(normal|urgent|low|callback)$/)"},
        "jobTypeId": {".validate": f"newData.isString() && root.child('jobTypes').child(newData.val()).exists()"},
        "siteId": {".validate": f"newData.isString() && root.child('sites').child(newData.val()).exists()"},
        "buildingId": {".validate": f"newData.isString() && root.child('buildings').child(newData.val()).exists()"},
        "areaId": {".validate": "newData.isString()"},
        "locationDetail": {".validate": s(200)},
        "description": {".validate": s(3000, False)},
        "gps": {".validate": "newData.hasChildren(['lat', 'lng'])", "lat": {".validate": "newData.isNumber()"}, "lng": {".validate": "newData.isNumber()"},
                "accuracy": {".validate": "newData.isNumber()"}, "at": {".validate": "newData.isNumber()"}, "$o": {".validate": False}},
        "reporterUid": {".validate": "newData.isString()"},
        "reporter": {
          ".validate": "newData.hasChildren(['name', 'email', 'phone'])",
          "name": {".validate": s(120, False)}, "email": {".validate": s(160, False)}, "phone": {".validate": s(40, False)},
          "department": {".validate": s(120)}, "$o": {".validate": False}
        },
        "lang": {".validate": "newData.isString() && newData.val().matches(/^(th|en)$/)"},
        "pdpaAt": {".validate": NOW_OK},
        # ผู้ปฏิบัติงาน: key (staff id or uid) → name; assigneeKeys ",k1,k2," for the rules; assigneeName = names joined
        "assignees": {"$k": {".validate": s(120, False)}},
        "assigneeKeys": {".validate": "newData.isString() && newData.val().length <= 2000 && newData.val().matches(/^,([-_A-Za-z0-9]+,)+$/)"},
        "assigneeName": {".validate": s(300)},
        "expectedDate": {".validate": "newData.isNumber()"},
        "expectedNote": {".validate": s(1000)},
        "hold": {
          "reason": {".validate": "newData.isString() && newData.val().matches(/^(waiting_parts|budget|contractor|access|other)$/)"},
          "note": {".validate": s(1000)}, "resumeDate": {".validate": "newData.isNumber()"}, "partsEta": {".validate": "newData.isNumber()"},
          "since": {".validate": "newData.isNumber()"}, "$o": {".validate": False}
        },
        "workDetail": {".validate": s(3000)},
        # the machine this job is for, and the PM plan + due date a work order was made for
        "assetId": {".validate": EXISTS_IN('assets')},
        "pm": {".validate": "newData.hasChildren(['planId', 'at'])", "planId": {".validate": EXISTS_IN('pmPlans')}, "at": NUM, "$o": {".validate": False}},
        "photos": {
          "$pid": {
            # reporter may add / remove photos on own job
            ".write": f"{AUTH} && data.parent().parent().child('reporterUid').val() == auth.uid",
            ".validate": "newData.hasChildren(['store', 'w', 'h', 'bytes']) && newData.child('w').val() <= 1280 && newData.child('h').val() <= 1280 && newData.child('bytes').val() <= 409600"
            # (RTDB rules have no numChildren(); the per-job photo cap is enforced in PhotoPicker / MAX_PHOTOS)
          }
        },
        "createdAt": {".validate": NOW_OK},
        "updatedAt": {
          ".write": f"{AUTH} && data.parent().child('reporterUid').val() == auth.uid",
          ".validate": NOW_OK
        },
        "completedAt": {".validate": NOW_OK},
        "idx": {"$k": {".validate": "$k.matches(/^(s|o|si|sis|sio|b|bs|bo)$/) && newData.isString() && newData.val().length <= 200"}},
        # links to attachments that stay on the old server (videos, PDFs …) — importer only
        "files": {".validate": False},
        # reference to the old CPFM record — written only by scripts/import-cpfm.mjs (admin SDK bypasses rules)
        "cpfm": {".validate": False},
        "$other": {".validate": False}
      }
    },

    "jobPhotos": {"$jobId": {
      ".read": f"{TECH} || ({AUTH} && root.child('jobs').child($jobId).child('reporterUid').val() == auth.uid) || {assignee(JOB_OF)}",
      "$pid": {
        ".write": f"{TECH} || ({AUTH} && root.child('jobs').child($jobId).child('reporterUid').val() == auth.uid) || {assignee(JOB_OF)}",
        ".validate": "newData.isString() && newData.val().beginsWith('data:image/webp;base64,') && newData.val().length < 560000"
      }
    }},

    "jobEvents": {"$jobId": {
      ".read": f"{TECH} || {assignee(JOB_OF)}",
      "$eventId": {
        # append-only; new root is newData.parent().parent().parent()
        ".write": f"{AUTH} && !data.exists() && newData.child('byUid').val() == auth.uid && ("
                  f"{TECH}"
                  f" || ({CONTRACTOR} && {assignee(NEW_JOB_OF_EVENT)})"
                  f" || (newData.parent().parent().parent().child('jobs').child($jobId).child('reporterUid').val() == auth.uid"
                  f"     && newData.child('public').val() == true && newData.child('type').val().matches(/^(created|comment)$/)))",
        ".validate": "newData.hasChildren(['at', 'byUid', 'type', 'public'])"
                     " && newData.child('type').val().matches(/^(created|status|assign|unassign|expected|hold|comment|photo)$/)",
        "at": {".validate": NOW_OK},
        "note": {".validate": s(3000)},
        "public": {".validate": "newData.isBoolean()"},
        # set only by the CPFM importer; Cloud Functions never e-mail imported events
        "imported": {".validate": False}
      }
    }},

    # keyed by job number (the public tracking id). A number already used by one job can't be taken by another.
    "tracking": {
      "$no": {
        ".read": True,
        ".write":
          f"{TECH}"
          f" || ({AUTH} && !data.exists() && newData.parent().parent().child('jobs').child(newData.child('jobId').val()).child('reporterUid').val() == auth.uid"
          f"     && newData.parent().parent().child('jobs').child(newData.child('jobId').val()).child('jobNo').val() == $no)"
          f" || ({CONTRACTOR} && data.exists() && newData.exists() && {assignee(JOB_OF_TRACKING)})",
        ".validate": "newData.hasChildren(['jobId', 'jobNo', 'status']) && newData.child('jobNo').val() == $no"
                     " && (!data.exists() || newData.child('jobId').val() == data.child('jobId').val())",
        "status": {".validate": STATUS_RE},
        "updatedAt": {
          ".write": f"{AUTH} && root.child('jobs').child(data.parent().child('jobId').val()).child('reporterUid').val() == auth.uid",
          ".validate": NOW_OK
        },
        "timeline": {"$eid": {
          ".write": f"{AUTH} && !data.exists() && root.child('jobs').child(data.parent().parent().child('jobId').val()).child('reporterUid').val() == auth.uid"
                    " && newData.child('type').val() == 'comment'",
          ".validate": "newData.hasChildren(['at', 'type'])",
          "note": {".validate": s(3000)}
        }}
      }
    },

    "mail": {".read": ADMIN, ".write": False}
  }
}

out = pathlib.Path(__file__).resolve().parent.parent / 'database.rules.json'
out.write_text(json.dumps(rules, indent=2, ensure_ascii=False) + "\n")
print("wrote", out)
