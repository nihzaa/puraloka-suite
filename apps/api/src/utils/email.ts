import { Resend } from 'resend'

// Lazy-init: jika RESEND_API_KEY tidak diset, semua kirim email jadi no-op
let resend: Resend | null = null

function getResend(): Resend | null {
  if (resend) return resend
  if (!process.env.RESEND_API_KEY) return null
  resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

const FROM = process.env.EMAIL_FROM ?? 'Puraloka Suite <noreply@puraloka.id>'
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
}

// ─── Core send (fire-and-forget, never throws) ────────────────────────────────

async function sendEmail(payload: EmailPayload): Promise<void> {
  const client = getResend()
  if (!client) return  // no-op jika belum dikonfigurasi

  try {
    await client.emails.send({
      from: FROM,
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      subject: payload.subject,
      html: payload.html,
    })
  } catch (err) {
    console.error('[email] Failed to send:', err)
  }
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function baseTemplate(title: string, body: string, ctaLabel?: string, ctaUrl?: string): string {
  const cta = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:32px 0"><a href="${ctaUrl}" style="display:inline-block;background:#003366;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">${ctaLabel}</a></div>`
    : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,BlinkMacSystemFont,'Plus Jakarta Sans',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td>
      <div style="max-width:560px;margin:0 auto">
        <!-- Header -->
        <div style="background:#003366;border-radius:12px 12px 0 0;padding:20px 28px;display:flex;align-items:center;gap:12px">
          <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px">Puraloka Suite</span>
        </div>

        <!-- Body -->
        <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;border:1px solid #E5E7EB;border-top:none">
          <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827">${title}</h2>
          ${body}
          ${cta}
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#9CA3AF">Email ini dikirim otomatis dari sistem Puraloka Suite. Jangan balas email ini.</p>
        </div>
      </div>
    </td></tr>
  </table>
</body>
</html>`
}

function pill(text: string, color: string, bg: string) {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600;color:${color};background:${bg}">${text}</span>`
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

// ─── Email senders ────────────────────────────────────────────────────────────

export async function sendMilestoneReminderEmail(opts: {
  to: string
  milestoneName: string
  projectName: string
  projectId: string
  targetDate: string
  daysLeft: number
  isOverdue: boolean
}) {
  const { to, milestoneName, projectName, projectId, targetDate, daysLeft, isOverdue } = opts
  const subject = isOverdue
    ? `[Terlambat] Milestone "${milestoneName}" belum tercapai`
    : `[Reminder] Milestone "${milestoneName}" ${daysLeft <= 1 ? 'jatuh tempo besok' : `dalam ${daysLeft} hari`}`

  const badge = isOverdue
    ? pill('Terlambat', '#B91C1C', '#FEF2F2')
    : daysLeft <= 1 ? pill('Besok', '#C2410C', '#FFF7ED') : pill(`${daysLeft} hari lagi`, '#1D4ED8', '#EFF6FF')

  const body = `
    <div style="background:#F8F9FA;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:13px;color:#6B7280;margin-bottom:4px">Milestone</div>
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:8px">${milestoneName}</div>
      <div style="font-size:13px;color:#6B7280">Proyek: <strong style="color:#111827">${projectName}</strong></div>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <div style="font-size:13px;color:#6B7280">Target: <strong style="color:#111827">${new Date(targetDate).toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</strong></div>
      <div>${badge}</div>
    </div>
    ${isOverdue
      ? `<p style="font-size:14px;color:#374151">Milestone ini sudah melewati tanggal target namun belum ditandai selesai. Segera tinjau status di dashboard.</p>`
      : `<p style="font-size:14px;color:#374151">Milestone ini akan jatuh tempo ${daysLeft === 0 ? 'hari ini' : daysLeft === 1 ? 'besok' : `dalam ${daysLeft} hari`}. Pastikan pekerjaan terkait sudah berjalan sesuai rencana.</p>`
    }`

  await sendEmail({
    to,
    subject,
    html: baseTemplate(subject, body, 'Lihat Detail Proyek', `${APP_URL}/proyek/${projectId}`),
  })
}

export async function sendTerminReminderEmail(opts: {
  to: string
  terminNumber: number
  amount: number
  projectName: string
  projectId: string
  dueDate?: string
}) {
  const { to, terminNumber, amount, projectName, projectId, dueDate } = opts
  const subject = `[Tagih Termin ${terminNumber}] Proyek ${projectName} siap ditagih`

  const body = `
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:13px;color:#15803D;font-weight:600">Termin Siap Ditagih</div>
      <div style="font-size:22px;font-weight:800;color:#15803D;margin:4px 0">${fmt(amount)}</div>
      <div style="font-size:13px;color:#6B7280">Termin ${terminNumber} · ${projectName}</div>
    </div>
    ${dueDate ? `<p style="font-size:14px;color:#374151">Jatuh tempo: <strong>${new Date(dueDate).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</strong></p>` : ''}
    <p style="font-size:14px;color:#374151">Progress proyek telah memenuhi syarat untuk termin ini. Segera buat invoice dan kirimkan ke klien.</p>`

  await sendEmail({
    to,
    subject,
    html: baseTemplate(subject, body, 'Buat Invoice', `${APP_URL}/proyek/${projectId}#sec-termin`),
  })
}

export async function sendInvoiceOverdueEmail(opts: {
  to: string
  invoiceNumber: string
  amountDue: number
  projectName: string
  daysLate: number
  dueDate: string
}) {
  const { to, invoiceNumber, amountDue, projectName, daysLate, dueDate } = opts
  const subject = `[Invoice Overdue] ${invoiceNumber} sudah ${daysLate} hari melewati jatuh tempo`

  const body = `
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:13px;color:#B91C1C;font-weight:600">Invoice Jatuh Tempo Terlewat</div>
      <div style="font-size:22px;font-weight:800;color:#B91C1C;margin:4px 0">${fmt(amountDue)}</div>
      <div style="font-size:13px;color:#6B7280">${invoiceNumber} · ${projectName}</div>
    </div>
    <div style="font-size:14px;color:#374151;margin-bottom:12px">Invoice ini sudah <strong style="color:#B91C1C">${daysLate} hari</strong> melewati jatuh tempo ${new Date(dueDate).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}.</div>
    <p style="font-size:14px;color:#374151">Segera follow up ke klien untuk pembayaran.</p>`

  await sendEmail({
    to,
    subject,
    html: baseTemplate(subject, body, 'Lihat Invoice', `${APP_URL}/keuangan`),
  })
}

export async function sendKasbonPendingEmail(opts: {
  to: string
  mandorName: string
  amount: number
  projectName: string
  daysWaiting: number
}) {
  const { to, mandorName, amount, projectName, daysWaiting } = opts
  const subject = `[Kasbon Menunggu] ${mandorName} — ${daysWaiting} hari belum ditindaklanjuti`

  const body = `
    <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:13px;color:#C2410C;font-weight:600">Kasbon Pending</div>
      <div style="font-size:22px;font-weight:800;color:#C2410C;margin:4px 0">${fmt(amount)}</div>
      <div style="font-size:13px;color:#6B7280">${mandorName} · ${projectName}</div>
    </div>
    <p style="font-size:14px;color:#374151">Kasbon ini sudah menunggu persetujuan selama <strong>${daysWaiting} hari</strong>. Segera tinjau dan approve/reject di halaman Mandor.</p>`

  await sendEmail({
    to,
    subject,
    html: baseTemplate(subject, body, 'Tinjau Kasbon', `${APP_URL}/mandor`),
  })
}

export async function sendWelcomeEmail(opts: {
  to: string
  name: string
  role: string
  password: string
}) {
  const { to, name, role, password } = opts
  const roleLabel: Record<string, string> = {
    admin: 'Administrator', pm: 'Project Manager',
    mandor: 'Mandor', client: 'Klien',
  }
  const portalUrl: Record<string, string> = {
    admin: APP_URL,
    pm:    `${APP_URL}/pm-portal`,
    mandor: `${APP_URL}/mandor-portal`,
    client: `${APP_URL}/portal`,
  }
  const loginUrl = portalUrl[role] ?? APP_URL

  const subject = `Selamat datang di Puraloka Suite, ${name}!`

  const body = `
    <p style="font-size:14px;color:#374151;margin-bottom:20px">
      Halo <strong>${name}</strong>, akun Anda di <strong>Puraloka Suite</strong> telah dibuat oleh admin.
      Gunakan informasi di bawah untuk masuk pertama kali.
    </p>
    <div style="background:#F8F9FA;border:1px solid #E5E7EB;border-radius:10px;padding:20px;margin-bottom:20px">
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;color:#9CA3AF;min-width:90px">Email</span>
          <code style="font-size:13px;font-weight:600;color:#111827;background:#fff;border:1px solid #E5E7EB;padding:3px 10px;border-radius:6px">${to}</code>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;color:#9CA3AF;min-width:90px">Password</span>
          <code style="font-size:13px;font-weight:600;color:#111827;background:#fff;border:1px solid #E5E7EB;padding:3px 10px;border-radius:6px">${password}</code>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;color:#9CA3AF;min-width:90px">Role</span>
          <span style="font-size:12px;font-weight:600;color:#003366;background:#EBF2FF;padding:3px 10px;border-radius:99px">${roleLabel[role] ?? role}</span>
        </div>
      </div>
    </div>
    <p style="font-size:13px;color:#D97706;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;margin-bottom:20px">
      ⚠ Segera ganti password Anda setelah login pertama kali untuk keamanan akun.
    </p>`

  await sendEmail({
    to,
    subject,
    html: baseTemplate(subject, body, 'Masuk ke Puraloka Suite', loginUrl),
  })
}

export async function sendProjectEndingEmail(opts: {
  to: string
  projectName: string
  projectId: string
  endDate: string
  daysLeft: number
  progressPct: number
}) {
  const { to, projectName, projectId, endDate, daysLeft, progressPct } = opts
  const isOverdue = daysLeft < 0
  const subject = isOverdue
    ? `[Proyek Terlambat] "${projectName}" sudah ${Math.abs(daysLeft)} hari melewati deadline`
    : `[Reminder] Proyek "${projectName}" selesai dalam ${daysLeft} hari`

  const body = `
    <div style="${isOverdue ? 'background:#FEF2F2;border-color:#FECACA' : 'background:#FFFBEB;border-color:#FDE68A'};border:1px solid;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:13px;color:${isOverdue ? '#B91C1C' : '#D97706'};font-weight:600">${isOverdue ? 'Proyek Melewati Deadline' : 'Mendekati Deadline'}</div>
      <div style="font-size:18px;font-weight:700;color:#111827;margin:4px 0">${projectName}</div>
      <div style="font-size:13px;color:#6B7280">Progress fisik: ${Number(progressPct).toFixed(0)}%</div>
    </div>
    <p style="font-size:14px;color:#374151">
      ${isOverdue
        ? `Proyek ini sudah <strong style="color:#B91C1C">${Math.abs(daysLeft)} hari</strong> melewati deadline ${new Date(endDate).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })} namun belum selesai.`
        : `Proyek ini akan selesai pada <strong>${new Date(endDate).toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</strong> (${daysLeft} hari lagi).`
      }
    </p>`

  await sendEmail({
    to,
    subject,
    html: baseTemplate(subject, body, 'Lihat Proyek', `${APP_URL}/proyek/${projectId}`),
  })
}
