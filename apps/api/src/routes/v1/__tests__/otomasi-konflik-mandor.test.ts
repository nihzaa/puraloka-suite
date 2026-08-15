/**
 * Mandor dipegang dua proyek sekaligus — automation 3.9.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Empat keputusan yang masing-masing bisa salah tanpa satu pun galat:
 *
 *   1. Dua lingkup di proyek yang SAMA bukan bentrok. Itu satu penugasan yang
 *      dipecah beberapa pekerjaan — hal paling biasa di lapangan. Kalau ikut
 *      ditegur, hampir tiap mandor "bentrok" dan peringatannya jadi sampah.
 *
 *   2. Ambang BENAR-BENAR menyaring. Serah-terima beberapa hari antar proyek
 *      itu normal; kalau ambangnya cuma dilaporkan, pengaturan tenant tak
 *      berpengaruh sama sekali dan tak ada gejalanya.
 *
 *   3. Tumpang tindih yang SUDAH LEWAT tak ditegur. Peringatan tentang
 *      bentrok yang sudah selesai tak bisa ditindaklanjuti siapa pun.
 *
 *   4. Pasangan A–B dan B–A adalah SATU notifikasi, bukan dua.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-KONFLIK'

let app: FastifyInstance
let db: Client
let companyId: string
let mandorId: string
let adminId: string
let proyekA: string
let proyekB: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/konflik-mandor${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tanggal(selisih: number): string {
  const d = new Date()
  d.setDate(d.getDate() + selisih)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM work_scopes WHERE scope_name LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM mandor_assignments WHERE notes = $1`, [TANDA])
  await db.query(
    `DELETE FROM notifications WHERE type = 'konflik_mandor' AND company_id = $1`,
    [companyId])
}

/**
 * Satu lingkup kerja berentang, di bawah penugasan mandor pada proyek itu.
 *
 * Penugasannya DIPAKAI ULANG bila sudah ada: `mandor_assignments` punya kunci
 * unik `(project_id, mandor_id)` — satu mandor hanya bisa punya SATU penugasan
 * per proyek, dan beberapa pekerjaan di proyek yang sama memang bergantung di
 * bawah penugasan yang satu itu. Itu justru bentuk yang diuji test pertama.
 */
async function buatLingkup(proyek: string, nama: string, mulai: string, akhir: string) {
  const { rows: t } = await db.query(
    `INSERT INTO mandor_assignments (project_id, mandor_id, assigned_by, status, notes)
     VALUES ($1,$2,$3,'active',$4)
     ON CONFLICT (project_id, mandor_id) DO UPDATE SET notes = EXCLUDED.notes
     RETURNING id`,
    [proyek, mandorId, adminId, TANDA])

  const { rows: w } = await db.query(
    // `chk_work_scope_borongan_req` menuntut nilai borongan terisi kecuali
    // sistemnya harian — lingkup borongan tanpa nilai adalah kontrak tanpa
    // angka.
    `INSERT INTO work_scopes (assignment_id, scope_name, payment_system, status,
                              borongan_value, start_date, end_date)
     VALUES ($1,$2,'borongan','active',10000000,$3,$4) RETURNING id`,
    [t[0].id, nama, mulai, akhir])
  return w[0].id as string
}

/** Berapa notifikasi bentrok yang menyebut lingkup uji. */
async function hitungUji() {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = 'konflik_mandor' AND company_id = $1 AND message LIKE $2`,
    [companyId, `%${TANDA}%`])
  return rows[0].n as number
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows: c } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id

  const { rows: a } = await db.query(
    `SELECT id FROM users WHERE auth_id = $1`, [auth])
  adminId = a[0].id

  /*
    Mandor uji SENDIRI, bukan meminjam yang sudah ada.

    Basis dev sudah punya 21 pasangan bentrok nyata. Meminjam salah satu
    mandornya akan membuat test ini lulus atau gagal karena data seed berubah,
    bukan karena kodenya berubah — dan itu test yang tak menguji apa pun.
  */
  const { rows: m } = await db.query(
    /*
      `users` kategori D — keanggotaan tenant ada di `company_members`, BUKAN
      kolom `company_id` pada `users`. Identitas sengaja hidup lintas tenant
      (ADR-011 D6).
    */
    `SELECT u.id FROM users u
      WHERE u.is_active
        AND EXISTS (SELECT 1 FROM company_members m
                     WHERE m.user_id = u.id AND m.company_id = $1)
        AND u.id NOT IN (SELECT DISTINCT mandor_id FROM mandor_assignments)
      LIMIT 1`, [companyId])
  if (!m[0]) throw new Error('tak ada pengguna yang belum pernah jadi mandor')
  mandorId = m[0].id

  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 ORDER BY created_at LIMIT 2`,
    [companyId])
  if (p.length < 2) throw new Error('butuh dua proyek untuk menguji bentrok')
  proyekA = p[0].id
  proyekB = p[1].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

describe('3.9 — mandor bentrok dua proyek', () => {
  it('dua lingkup di proyek yang SAMA bukan bentrok', async () => {
    /*
      Satu penugasan yang dipecah beberapa pekerjaan adalah hal paling biasa
      di lapangan — "struktur" dan "finishing" di rumah yang sama, jalan
      bersamaan, oleh mandor yang sama.

      Kalau itu ikut ditegur, hampir tiap mandor akan "bentrok" dan
      peringatannya jadi sampah dalam sehari.
    */
    await bersihkan()
    await buatLingkup(proyekA, `${TANDA} struktur`, tanggal(-10), tanggal(80))
    await buatLingkup(proyekA, `${TANDA} finishing`, tanggal(-5), tanggal(90))

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)
    expect(await hitungUji(),
      'dua lingkup di proyek yang sama ditegur sebagai bentrok')
      .toBe(0)
  }, 120_000)

  it('proyek BERBEDA yang tumpang tindih ditegur, dan hanya SEKALI per pasangan', async () => {
    /*
      Pasangan A–B dan B–A adalah bentrok yang SAMA. Tanpa kunci terurut, tiap
      bentrok mengirim dua notifikasi yang isinya cuma bertukar urutan proyek —
      dan penerimanya menyimpulkan sistemnya mengirim ganda.
    */
    await bersihkan()
    await buatLingkup(proyekA, `${TANDA} A`, tanggal(-10), tanggal(80))
    await buatLingkup(proyekB, `${TANDA} B`, tanggal(-5), tanggal(90))

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)

    const c = (r.json() as { checked: { pasangan_bentrok: number } }).checked
    expect(c.pasangan_bentrok, 'bentrok lintas proyek tak terdeteksi')
      .toBeGreaterThan(0)

    const sekali = await hitungUji()
    expect(sekali, 'tak ada notifikasi untuk bentrok yang nyata').toBeGreaterThan(0)

    /*
      Tiap penerima dapat SATU, bukan dua. Dibandingkan dengan jumlah penerima
      yang benar-benar dituju — dihitung dari notifikasi itu sendiri, bukan
      ditebak.
    */
    const { rows } = await db.query(
      `SELECT count(DISTINCT user_id)::int n,
              count(DISTINCT action_data->>'record_id')::int p
         FROM notifications
        WHERE type = 'konflik_mandor' AND company_id = $1 AND message LIKE $2`,
      [companyId, `%${TANDA}%`])
    expect(sekali,
      'jumlah notifikasi bukan (penerima × pasangan) — A–B dan B–A terkirim dua kali')
      .toBe(rows[0].n * rows[0].p)
    expect(rows[0].p, 'satu bentrok tercatat sebagai lebih dari satu pasangan').toBe(1)

    // Panggilan kedua tak menambah — dedup harian menahan.
    await panggil()
    expect(await hitungUji(), 'panggilan kedua menambah — dedup tak menahan')
      .toBe(sekali)
  }, 120_000)

  it('ambang BENAR-BENAR menyaring, bukan sekadar dilaporkan', async () => {
    /*
      Cacat "ambang dilaporkan tetapi tak dipakai" sudah terjadi sekali di 5.7
      dan tak punya satu pun gejala: hasilnya tetap masuk akal, pengaturan
      tenant cuma tak berpengaruh.

      Tumpang tindihnya 6 hari — di bawah bawaan 14, di atas ambang 3.
    */
    await bersihkan()
    await buatLingkup(proyekA, `${TANDA} pendek A`, tanggal(-30), tanggal(5))
    await buatLingkup(proyekB, `${TANDA} pendek B`, tanggal(0), tanggal(60))

    await panggil()
    expect(await hitungUji(),
      'tumpang tindih 6 hari ditegur pada ambang bawaan 14')
      .toBe(0)

    await panggil('?hari=3')
    expect(await hitungUji(),
      'ambang 3 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBeGreaterThan(0)
  }, 120_000)

  it('tumpang tindih yang SUDAH LEWAT tidak ditegur', async () => {
    /*
      Bentrok yang sudah selesai tak bisa ditindaklanjuti siapa pun —
      mandornya sudah terlanjur berada di dua tempat, dan menggeser jadwal
      tak lagi mengubah apa pun.

      Kedua lingkup berakhir jauh sebelum hari ini, dengan tumpang tindih 60
      hari — jauh di atas ambang. Yang menahan HARUS saringan waktunya.
    */
    await bersihkan()
    await buatLingkup(proyekA, `${TANDA} lampau A`, tanggal(-200), tanggal(-100))
    await buatLingkup(proyekB, `${TANDA} lampau B`, tanggal(-160), tanggal(-60))

    await panggil()
    expect(await hitungUji(),
      'bentrok yang sudah lewat ikut ditegur — tak bisa ditindaklanjuti siapa pun')
      .toBe(0)
  }, 120_000)
})
