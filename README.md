# VISTEC Repair · ระบบแจ้งซ่อม

Repair-request and tracking system for VISTEC, built with **Vue 3 + Vite + Bulma** on **Firebase**
(Realtime Database, Authentication, Storage, Cloud Functions, Hosting). The UI is Thai by default, with English available.

- Reporters sign in (VISTEC Microsoft / Google / e-mail), report a problem from their phone (GPS fills in the location, photos are shrunk to WebP), and get a **tracking code** plus e-mails on every status change.
- Staff and contractors work the job: assign, start, put on hold (waiting for parts with an ETA, budget/finance delay with a resume date, …), set an expected finish date, comment, and close it.
- Admins manage buildings, areas, job types, users, roles and contractor invites, and print QR codes for each building or room.

See `DB.md` (data design), `TODO.md` (progress) and `AGENTS.md` (hand-off guide).

---

## 1. Firebase console setup (one time)

1. **Web app config.** Go to Project settings → General → *Add app* → Web. Copy the values into `.env` (start from `.env.example`).
2. **Realtime Database rules.** Paste [`database.rules.json`](database.rules.json) into Realtime Database → Rules → Publish.
   *(Generated from `scripts/build-rules.py`. Edit the Python file, then run `python3 scripts/build-rules.py`.)*
3. **Storage rules.** Paste [`storage.rules`](storage.rules) into Storage → Rules. Storage needs the **Blaze** plan.
   If you stay on the free Spark plan, set `VITE_IMAGE_STORE=rtdb` and photos will be saved as small base64 WebP in the RTDB instead.
4. **Authentication → Sign-in method.** Enable:
   - **Microsoft.** Register an app in Microsoft Entra ID (Azure portal → App registrations) with the redirect URI
     `https://vistec-repair.firebaseapp.com/__/auth/handler`. Paste its *Application (client) ID* and a *client secret* into Firebase.
     Set `VITE_MS_TENANT` to the VISTEC tenant (domain or tenant ID) so that only VISTEC accounts can sign in this way.
   - **Google** (optional).
   - **Email/Password** and turn on **Email link (passwordless sign-in)**. Contractors use this.
   - In Settings → *Authorized domains*, add your hosting domain (and `localhost` for development).
   - In Settings → *User account linking*, keep **"Create one account per email address"** (the default). People can link more sign-in methods to one account from **โปรไฟล์**.
   - **Hide methods you have not enabled.** Each button has an `.env` switch: `VITE_AUTH_MICROSOFT`,
     `VITE_AUTH_GOOGLE`, `VITE_AUTH_PASSWORD`, `VITE_AUTH_EMAIL_LINK`. Unset/empty means *on*; set it to
     `false` to hide the button. Showing a button for a disabled provider makes it fail with
     `auth/configuration-not-found` (or `auth/operation-not-allowed`), which confuses users.
     Restart `npm run dev` (or rebuild) after changing these — Vite reads `.env` at build time.
5. **First admin.** Sign in to the site once, then in the RTDB console set `/users/<your uid>/role` to `"admin"`.
   After that, manage everyone else from **ผู้ดูแล → ผู้ใช้งาน**.
6. **Master data.** Open **ผู้ดูแล → ข้อมูลหลัก** and click *สร้างข้อมูลตั้งต้น* to create the VISTEC building and 12 standard job types.
   Then set each building's GPS position (use the *ใช้ตำแหน่งปัจจุบัน* button while standing there). The request form uses these positions to pick the nearest building.

## 1b. Import from the old CPFM system

The old system (`EXISTING_SYSTEM_URL`) stays the source of truth while both run. Re-run the import whenever you like.
CPFM values overwrite ours, and data that only exists here (photos, new jobs) is kept. Details: [`CPFM_IMPORT.md`](CPFM_IMPORT.md).

1. Publish the current [`database.rules.json`](database.rules.json) first. The importer refuses to write into a database anyone can read.
2. Project settings → Service accounts → *Generate new private key*, save it as `service-account.json` in the project root (git-ignored),
   and set `FIREBASE_SERVICE_ACCOUNT=./service-account.json` in `.env` next to `EXISTING_SYSTEM_URL/USERNAME/PASSWORD`.
3. Deploy the functions **before** importing if they are already live (the update that skips imported events), or import before deploying them at all.
4. Run:
   ```bash
   npm run import:cpfm -- --dry-run     # check first: writes .cpfm-cache/dry-run.json only
   npm run import:cpfm                  # all 4 sites, ~25k jobs + photos; first run ≈8 h, later runs minutes
   npm run import:cpfm -- --photos=link # if Storage is not enabled yet: keep attachments as links to the old server
   ```

## 2. E-mail notifications (Cloud Functions, Blaze plan)

```bash
npm i -g firebase-tools && firebase login
cd functions && npm install
cp .env.example .env                 # APP_URL, SMTP host/user, staff e-mails
firebase functions:secrets:set SMTP_PASS
firebase deploy --only functions
```

- `onJobEvent` e-mails the reporter on every public event (received, assigned, status change, on hold with parts ETA or resume date, new expected date, staff comment). It also e-mails the facility team on new jobs, and the assignee when a job is assigned to them or the reporter comments.
- `onInvite` e-mails invited contractors a sign-in link.
- Every attempt is logged in `/mail` (`sent` / `error`).
- SMTP: use a Microsoft 365 mailbox (`smtp.office365.com:587`; SMTP AUTH must be enabled for that mailbox) or any other SMTP relay.

## 3. Develop and deploy

```bash
npm install
cp .env.example .env     # fill in
npm run dev              # http://localhost:5173
npm run build
firebase deploy --only hosting     # or: database,storage,hosting,functions
```

## 4. Test the database rules

The rules come with an emulator test suite (40 cases covering who can read and write what). It needs Java 11+.

```bash
cd tests && npm install && npm test
```

## Roles at a glance

| Role | Can do |
|---|---|
| ผู้แจ้ง `user` | Report a problem, see and comment on their own jobs |
| ผู้รับเหมา `contractor` | See and update only the jobs assigned to them (invite-only; sign in with an e-mail link) |
| ช่าง `technician` | See and work all jobs, view the dashboard, print QR codes |
| ผู้ดูแล `admin` | Everything above, plus master data, users and invites |
