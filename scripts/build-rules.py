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

# Job helpers (relative to /jobs/$jobId)
JOB_REPORTER = "data.child('reporterUid').val() == auth.uid"
JOB_ASSIGNEE = "data.child('assigneeUid').val() == auth.uid"
NEW_ROOT_FROM_JOB = "newData.parent().parent()"

rules = {
  "rules": {
    ".read": False, ".write": False,

    "config": {"public": {".read": True, ".write": ADMIN}},

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

    "sites": {".read": True, ".write": ADMIN, "$id": {".validate": "newData.hasChildren(['nameTh'])"}},
    "buildings": {".read": True, ".write": ADMIN, ".indexOn": ["siteId"], "$id": {".validate": "newData.hasChildren(['nameTh'])"}},
    "areas": {".read": True, ".write": ADMIN, ".indexOn": ["buildingId"], "$id": {".validate": "newData.hasChildren(['nameTh', 'buildingId'])"}},
    "jobTypes": {".read": True, ".write": ADMIN, "$id": {".validate": "newData.hasChildren(['nameTh'])"}},

    "counters": {"jobs": {"$year": {
      ".read": AUTH,
      ".write": AUTH,
      ".validate": "$year.matches(/^20[0-9][0-9]$/) && newData.isNumber() && newData.val() == (data.exists() ? data.val() + 1 : 1)"
    }}},

    "jobs": {
      ".read": f"{TECH}"
               f" || ({AUTH} && query.orderByChild == 'reporterUid' && query.equalTo == auth.uid)"
               f" || ({CONTRACTOR} && query.orderByChild == 'assigneeUid' && query.equalTo == auth.uid)",
      # idx/* = paging sort keys (src/services/jobIndex.js); jobNo / trackingCode = exact search
      ".indexOn": ["createdAt", "status", "reporterUid", "assigneeUid", "siteId", "jobNo", "trackingCode",
                   "idx/s", "idx/o", "idx/si", "idx/sis", "idx/sio", "idx/b", "idx/bs", "idx/bo"],
      "$jobId": {
        ".read": f"{TECH} || ({AUTH} && ({JOB_REPORTER} || {JOB_ASSIGNEE}))",
        ".write":
          # staff: anything except delete (admin may delete)
          f"({TECH} && (newData.exists() || {ADMIN}))"
          # reporter creates a new job
          f" || ({AUTH} && !data.exists() && newData.child('reporterUid').val() == auth.uid && newData.child('status').val() == 'new'"
          f"     && !newData.hasChild('assigneeUid') && !newData.hasChild('expectedDate')"
          f"     && {NEW_ROOT_FROM_JOB}.child('tracking').child(newData.child('trackingCode').val()).child('jobId').val() == $jobId)"
          # contractor updates a job assigned to them (cannot hand it to someone else)
          f" || ({CONTRACTOR} && data.exists() && newData.exists() && {JOB_ASSIGNEE} && newData.child('assigneeUid').val() == auth.uid)",
        ".validate": "newData.hasChildren(['jobNo', 'trackingCode', 'status', 'reporterUid', 'jobTypeId', 'buildingId', 'description', 'createdAt'])"
                     " && (!data.exists() || (newData.child('jobNo').val() == data.child('jobNo').val()"
                     " && newData.child('trackingCode').val() == data.child('trackingCode').val()"
                     " && newData.child('reporterUid').val() == data.child('reporterUid').val()))",
        "jobNo": {".validate": "newData.isString() && newData.val().matches(/^WO20[0-9][0-9]-[0-9]{4,}$/)"},
        "trackingCode": {".validate": "newData.isString() && newData.val().matches(/^[A-Z0-9]{8}$/)"},
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
        "assigneeUid": {".validate": "newData.isString()"},
        "assigneeName": {".validate": s(120)},
        "expectedDate": {".validate": "newData.isNumber()"},
        "expectedNote": {".validate": s(1000)},
        "hold": {
          "reason": {".validate": "newData.isString() && newData.val().matches(/^(waiting_parts|budget|contractor|access|other)$/)"},
          "note": {".validate": s(1000)}, "resumeDate": {".validate": "newData.isNumber()"}, "partsEta": {".validate": "newData.isNumber()"},
          "since": {".validate": "newData.isNumber()"}, "$o": {".validate": False}
        },
        "workDetail": {".validate": s(3000)},
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
      ".read": f"{TECH} || ({AUTH} && (root.child('jobs').child($jobId).child('reporterUid').val() == auth.uid || root.child('jobs').child($jobId).child('assigneeUid').val() == auth.uid))",
      "$pid": {
        ".write": f"{TECH} || ({AUTH} && (root.child('jobs').child($jobId).child('reporterUid').val() == auth.uid || root.child('jobs').child($jobId).child('assigneeUid').val() == auth.uid))",
        ".validate": "newData.isString() && newData.val().beginsWith('data:image/webp;base64,') && newData.val().length < 560000"
      }
    }},

    "jobEvents": {"$jobId": {
      ".read": f"{TECH} || ({AUTH} && root.child('jobs').child($jobId).child('assigneeUid').val() == auth.uid)",
      "$eventId": {
        # append-only; new root is newData.parent().parent().parent()
        ".write": f"{AUTH} && !data.exists() && newData.child('byUid').val() == auth.uid && ("
                  f"{TECH}"
                  f" || ({CONTRACTOR} && newData.parent().parent().parent().child('jobs').child($jobId).child('assigneeUid').val() == auth.uid)"
                  f" || (newData.parent().parent().parent().child('jobs').child($jobId).child('reporterUid').val() == auth.uid"
                  f"     && newData.child('public').val() == true && newData.child('type').val().matches(/^(created|comment)$/)))",
        ".validate": "newData.hasChildren(['at', 'byUid', 'type', 'public'])"
                     " && newData.child('type').val().matches(/^(created|status|assign|expected|hold|comment|photo)$/)",
        "at": {".validate": NOW_OK},
        "note": {".validate": s(3000)},
        "public": {".validate": "newData.isBoolean()"},
        # set only by the CPFM importer; Cloud Functions never e-mail imported events
        "imported": {".validate": False}
      }
    }},

    "tracking": {
      "$code": {
        ".read": True,
        ".write":
          f"{TECH}"
          f" || ({AUTH} && !data.exists() && newData.parent().parent().child('jobs').child(newData.child('jobId').val()).child('reporterUid').val() == auth.uid"
          f"     && newData.parent().parent().child('jobs').child(newData.child('jobId').val()).child('trackingCode').val() == $code)"
          f" || ({CONTRACTOR} && data.exists() && newData.exists() && root.child('jobs').child(data.child('jobId').val()).child('assigneeUid').val() == auth.uid)",
        ".validate": "newData.hasChildren(['jobId', 'jobNo', 'status']) && $code.matches(/^[A-Z0-9]{8}$/)"
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
