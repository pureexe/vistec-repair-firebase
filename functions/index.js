/**
 * E-mail notifications for the VISTEC repair system.
 *  - onJobEvent:   /jobEvents/{jobId}/{eventId} created → mail the reporter (public events),
 *                  the facility team (new jobs) and the assignee (assignment / reporter comments).
 *  - onInvite:     /invites/{key} created → mail the invited contractor a sign-in link.
 * Every send attempt is logged in /mail.
 *
 * Deploy (Blaze plan required):
 *   cd functions && npm install
 *   cp .env.example .env   # edit
 *   firebase functions:secrets:set SMTP_PASS
 *   firebase deploy --only functions
 */
import { onValueCreated } from 'firebase-functions/v2/database'
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { getDatabase, ServerValue } from 'firebase-admin/database'
import nodemailer from 'nodemailer'

initializeApp()

const REGION = 'asia-southeast1'
const INSTANCE = 'vistec-repair-default-rtdb'
const SMTP_PASS = defineSecret('SMTP_PASS')
const APP_URL = defineString('APP_URL', { default: 'https://vistec-repair.web.app' })
const SMTP_HOST = defineString('SMTP_HOST', { default: 'smtp.office365.com' })
const SMTP_PORT = defineString('SMTP_PORT', { default: '587' })
const SMTP_USER = defineString('SMTP_USER')
const MAIL_FROM = defineString('MAIL_FROM', { default: '' })
const STAFF_NOTIFY_EMAILS = defineString('STAFF_NOTIFY_EMAILS', { default: '' })

const T = {
  th: {
    status: { new: 'แจ้งงาน', assigned: 'มอบหมายแล้ว', in_progress: 'กำลังดำเนินการ', on_hold: 'หยุดชั่วคราว', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก' },
    hold: { waiting_parts: 'รออะไหล่ / วัสดุ', budget: 'รออนุมัติงบประมาณ / เลื่อนรอบการเงิน', contractor: 'รอผู้รับเหมา / บริษัทภายนอก', access: 'รอเข้าพื้นที่ / นัดหมาย', other: 'อื่น ๆ' },
    created: 'ได้รับแจ้งซ่อมของคุณแล้ว', statusChanged: 'สถานะงานเปลี่ยนเป็น', assigned: 'มอบหมายผู้ปฏิบัติงาน', onHold: 'งานหยุดชั่วคราว',
    expected: 'วันที่คาดว่าจะเสร็จ', comment: 'ข้อความจากเจ้าหน้าที่', partsEta: 'คาดว่าอะไหล่จะมาถึง', resume: 'คาดว่าจะดำเนินการต่อ',
    track: 'ติดตามสถานะงาน', code: 'เลขติดตามงาน', jobNo: 'เลขที่งาน', footer: 'อีเมลนี้ส่งอัตโนมัติจากระบบแจ้งซ่อม VISTEC กรุณาอย่าตอบกลับ',
    newJobStaff: 'มีงานแจ้งซ่อมใหม่', assignedToYou: 'มีงานมอบหมายให้คุณ', reporterComment: 'ผู้แจ้งเพิ่มความเห็น', locale: 'th-TH'
  },
  en: {
    status: { new: 'Reported', assigned: 'Assigned', in_progress: 'In progress', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled' },
    hold: { waiting_parts: 'Waiting for parts / materials', budget: 'Waiting for budget / next finance cycle', contractor: 'Waiting for contractor / vendor', access: 'Waiting for access / appointment', other: 'Other' },
    created: 'We received your repair request', statusChanged: 'Status changed to', assigned: 'Technician assigned', onHold: 'Job on hold',
    expected: 'Expected completion', comment: 'Message from staff', partsEta: 'Parts expected on', resume: 'Expected to resume on',
    track: 'Track this job', code: 'Tracking code', jobNo: 'Job no.', footer: 'Automatic e-mail from the VISTEC repair system — please do not reply.',
    newJobStaff: 'New repair request', assignedToYou: 'A job was assigned to you', reporterComment: 'Reporter added a comment', locale: 'en-GB'
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const day = (ms, L) => (ms ? new Date(Number(ms)).toLocaleDateString(L.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }) : '-')

function headline(ev, job, L) {
  switch (ev.type) {
    case 'created': return L.created
    case 'status': return `${L.statusChanged} "${L.status[ev.to] || ev.to}"`
    case 'assign': return L.assigned
    case 'hold': return `${L.onHold}: ${L.hold[ev.to] || ev.to}`
    case 'expected': return `${L.expected}: ${day(job.expectedDate, L)}`
    default: return L.comment
  }
}

function body(ev, job, L, title) {
  const link = `${APP_URL.value()}/t/${job.trackingCode}`
  const rows = []
  if (ev.note) rows.push(`<p style="white-space:pre-line;background:#f6f3fa;padding:12px;border-radius:8px">${esc(ev.note)}</p>`)
  if (job.status === 'on_hold' && job.hold) {
    if (job.hold.partsEta) rows.push(`<p>📦 ${L.partsEta}: <b>${day(job.hold.partsEta, L)}</b></p>`)
    if (job.hold.resumeDate) rows.push(`<p>📅 ${L.resume}: <b>${day(job.hold.resumeDate, L)}</b></p>`)
  }
  if (job.expectedDate && !['completed', 'cancelled'].includes(job.status)) rows.push(`<p>🗓️ ${L.expected}: <b>${day(job.expectedDate, L)}</b></p>`)
  return `<div style="font-family:Sarabun,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(90deg,#582E91,#A0223A);color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">VISTEC Repair · แจ้งซ่อม</div>
  <div style="padding:20px">
    <h2 style="color:#582E91;margin:0 0 8px">${esc(title)}</h2>
    <p style="color:#666;margin:0 0 12px">${L.jobNo}: <b>${esc(job.jobNo)}</b> · ${L.code}: <b style="letter-spacing:2px">${esc(job.trackingCode)}</b></p>
    <p style="margin:0 0 12px;color:#333">${esc(String(job.description || '').slice(0, 300))}</p>
    ${rows.join('\n')}
    <p style="margin:20px 0"><a href="${link}" style="background:#582E91;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${L.track}</a></p>
    <p style="font-size:12px;color:#999">${L.footer}</p>
  </div></div>`
}

let transporter
function mailer() {
  if (!transporter) {
    const port = Number(SMTP_PORT.value())
    transporter = nodemailer.createTransport({ host: SMTP_HOST.value(), port, secure: port === 465, auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() } })
  }
  return transporter
}

async function send({ to, subject, html, jobId = null, eventId = null }) {
  const db = getDatabase()
  const log = { to: Array.isArray(to) ? to.join(',') : to, subject, jobId, eventId, at: ServerValue.TIMESTAMP }
  if (!to || (Array.isArray(to) && !to.length)) return db.ref('mail').push({ ...log, state: 'skipped' })
  try {
    await mailer().sendMail({ from: MAIL_FROM.value() || SMTP_USER.value(), to, subject, html })
    await db.ref('mail').push({ ...log, state: 'sent' })
  } catch (e) {
    logger.error('mail failed', e)
    await db.ref('mail').push({ ...log, state: 'error', error: String(e.message || e) })
  }
}

export const onJobEvent = onValueCreated(
  { ref: '/jobEvents/{jobId}/{eventId}', instance: INSTANCE, region: REGION, secrets: [SMTP_PASS] },
  async (event) => {
    const ev = event.data.val()
    const { jobId, eventId } = event.params
    const db = getDatabase()
    const job = (await db.ref(`jobs/${jobId}`).get()).val()
    if (!job || !ev) return
    const L = T[job.lang] || T.th
    const fromReporter = ev.byUid === job.reporterUid

    // 1) reporter — every public staff event (+ the "received" mail on creation)
    if (ev.public && !(fromReporter && ev.type === 'comment')) {
      const title = headline(ev, job, L)
      await send({ to: job.reporter?.email, subject: `[${job.jobNo}] ${title}`, html: body(ev, job, L, title), jobId, eventId })
    }
    // 2) facility team — new job
    if (ev.type === 'created') {
      const staff = STAFF_NOTIFY_EMAILS.value().split(',').map((s) => s.trim()).filter(Boolean)
      if (staff.length) await send({ to: staff, subject: `[${job.jobNo}] ${T.th.newJobStaff} / ${T.en.newJobStaff}`, html: body({ note: `${job.reporter?.name} · ${job.reporter?.phone}` }, job, T.th, T.th.newJobStaff), jobId, eventId })
    }
    // 3) assignee — assignment, or reporter commented
    if ((ev.type === 'assign' || (fromReporter && ev.type === 'comment')) && job.assigneeUid) {
      const email = (await db.ref(`users/${job.assigneeUid}/email`).get()).val()
      const lang = (await db.ref(`users/${job.assigneeUid}/lang`).get()).val()
      const LA = T[lang] || T.th
      const title = ev.type === 'assign' ? LA.assignedToYou : LA.reporterComment
      if (email) await send({ to: email, subject: `[${job.jobNo}] ${title}`, html: body(ev, job, LA, title).replace(`/t/${job.trackingCode}`, `/jobs/${jobId}`), jobId, eventId })
    }
  }
)

export const onInvite = onValueCreated(
  { ref: '/invites/{key}', instance: INSTANCE, region: REGION, secrets: [SMTP_PASS] },
  async (event) => {
    const inv = event.data.val()
    if (!inv?.email) return
    const url = `${APP_URL.value()}/login`
    const html = `<div style="font-family:Sarabun,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#582E91">VISTEC Repair · แจ้งซ่อม</h2>
      <p>คุณได้รับเชิญให้ใช้ระบบแจ้งซ่อม VISTEC ${inv.company ? '(' + esc(inv.company) + ')' : ''}<br>You have been invited to the VISTEC repair system.</p>
      <p>เปิดลิงก์ กรอกอีเมลนี้ (<b>${esc(inv.email)}</b>) แล้วกด "ส่งลิงก์เข้าสู่ระบบทางอีเมล"<br>Open the link, enter this e-mail and choose "E-mail me a sign-in link".</p>
      <p><a href="${url}" style="background:#582E91;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${url}</a></p></div>`
    await send({ to: inv.email, subject: 'คำเชิญใช้งานระบบแจ้งซ่อม VISTEC / Invitation to VISTEC Repair', html })
  }
)
