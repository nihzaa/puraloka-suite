/**
 * Proyeksi tanggal selesai — automation 3.3.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LAJU NOL ADALAH TEMUAN, BUKAN KEGAGALAN MENGHITUNG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Terukur di basis: keenam proyek aktif terakhir melaporkan progres 2-4 BULAN
 * lalu. Otomasi yang membagi dengan laju nol menghasilkan tak-terhingga lalu
 * memilih diam karena "tak bisa dihitung" — padahal proyek yang mandek di 50%
 * dengan target sudah lewat adalah sinyal keterlambatan TERKUAT yang ada.
 *
 * Test kedua di bawah menjaga persis itu.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-PROY'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let statusAsli = ''
let akhirAsli: string | null = null
let olehId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/proyeksi-selesai${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tgl(mundur: number): string {
  const d = new Date()
  d.setDate(d.getDate() - mundur)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM progress_logs WHERE notes LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE company_id = $1
      AND type IN ('proyeksi_selesai_meleset', 'progres_mandek')`, [companyId])
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

  /*
    Proyek uji harus BELUM punya catatan progres: lajunya dibentuk seluruhnya
    oleh baris yang disisipkan test. Meminjam proyek yang sudah berisi membuat
    hasilnya bergantung pada isi seed.
  */
  const { rows: p } = await db.query(`
    SELECT id, status, end_date FROM projects
     WHERE company_id = $1
       AND NOT EXISTS (SELECT 1 FROM progress_logs l WHERE l.project_id = projects.id)
     LIMIT 1`, [companyId])
  if (!p[0]) throw new Error('tak ada proyek tanpa catatan progres')
  proyek = p[0].id
  statusAsli = p[0].status
  akhirAsli = p[0].end_date

  const { rows: u } = await db.query(`SELECT id FROM users WHERE auth_id = $1`, [auth])
  olehId = u[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await db.query(
    `UPDATE projects SET status = $1::project_status, end_date = $2 WHERE id = $3`,
    [statusAsli, akhirAsli, proyek])
  await app.close()
  await db.end()
})

async function siapkan(targetMundur: number) {
  await db.query(
    `UPDATE projects SET status = 'active', end_date = $1 WHERE id = $2`,
    [tgl(targetMundur), proyek])
}

async function lapor(pct: number, mundur: number) {
  await db.query(
    `INSERT INTO progress_logs (project_id, reported_by, pct_overall, logged_at, notes)
     VALUES ($1,$2,$3,$4,$5)`,
    [proyek, olehId, pct, `${tgl(mundur)}T08:00:00Z`, `${TANDA} catatan`])
}

async function ditegur(tipe: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = $1 AND company_id = $2 AND action_data->>'record_id' = $3`,
    [tipe, companyId, proyek])
  return (rows[0].n as number) > 0
}

describe('3.3 — proyeksi tanggal selesai', () => {
  it('laju lambat memproyeksikan selesai LEWAT tanggal kontrak', async () => {
    /*
      Naik 20 poin dalam 40 hari = 0,5% per hari. Sisa 80 poin butuh 160 hari
      lagi, sementara kontraknya tinggal 10 hari. Meleset ~150 hari.
    */
    await bersihkan()
    await siapkan(-10)          // target 10 hari LAGI
    await lapor(0, 40)
    await lapor(20, 1)

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)
    expect(await ditegur('proyeksi_selesai_meleset'),
      'laju 0,5%/hari dengan sisa 80 poin dan kontrak 10 hari lagi tak ditegur')
      .toBe(true)

    const { rows } = await db.query(
      `SELECT action_data FROM notifications
        WHERE type = 'proyeksi_selesai_meleset' AND company_id = $1
          AND action_data->>'record_id' = $2 LIMIT 1`, [companyId, proyek])
    const d = rows[0].action_data as Record<string, unknown>
    expect(Number(d.meleset_hari), 'selisih hari tak masuk akal').toBeGreaterThan(100)
    expect(Number(d.laju_per_hari), 'laju salah dihitung').toBeCloseTo(0.5, 1)
  }, 120_000)

  it('laju NOL dikirim sebagai temuan, bukan didiamkan', async () => {
    /*
      Dua catatan dengan persen SAMA, terakhir 60 hari lalu. Lajunya nol dan
      pembagiannya tak terhingga.

      Otomasi yang memilih diam di sini membuang sinyal keterlambatan terkuat
      yang ada: proyek yang berhenti bergerak dengan target sudah lewat.
    */
    await bersihkan()
    await siapkan(30)           // target 30 hari LALU — sudah lewat
    await lapor(50, 90)
    await lapor(50, 60)

    await panggil()
    expect(await ditegur('progres_mandek'),
      'proyek yang berhenti dilaporkan 60 hari tak ditegur — otomasinya '
      + 'memilih diam karena lajunya tak bisa dibagi')
      .toBe(true)

    const { rows } = await db.query(
      `SELECT priority, action_data FROM notifications
        WHERE type = 'progres_mandek' AND company_id = $1
          AND action_data->>'record_id' = $2 LIMIT 1`, [companyId, proyek])
    expect(rows[0].priority,
      'proyek mandek yang targetnya SUDAH LEWAT tak berprioritas tertinggi')
      .toBe('urgent')
    expect(Number((rows[0].action_data as Record<string, unknown>).lewat_target))
      .toBeGreaterThan(0)
  }, 120_000)

  it('laju cukup cepat TIDAK ditegur', async () => {
    /*
      Pasangan wajib. Tanpa ini, "yang lambat ditegur" bisa berarti benar atau
      berarti otomasinya menegur segalanya.

      Naik 90 poin dalam 30 hari = 3%/hari. Sisa 10 poin butuh 4 hari,
      kontraknya masih 60 hari lagi.
    */
    await bersihkan()
    await siapkan(-60)
    await lapor(0, 30)
    await lapor(90, 1)

    await panggil()
    expect(await ditegur('proyeksi_selesai_meleset'),
      'proyek yang akan selesai jauh sebelum kontrak ikut ditegur')
      .toBe(false)
    expect(await ditegur('progres_mandek'),
      'proyek yang baru lapor kemarin disebut mandek')
      .toBe(false)
  }, 120_000)

  it('satu catatan saja TIDAK diproyeksikan, dan dilaporkan', async () => {
    /*
      Satu catatan progres bukan laju — ia satu foto. Memproyeksikan garis
      dari satu titik adalah menebak yang dibungkus angka, dan angka yang
      dibungkus terlihat lebih meyakinkan daripada tebakan telanjang.
    */
    await bersihkan()
    await siapkan(10)
    await lapor(30, 5)

    const r = await panggil()
    const c = (r.json() as { checked: { tak_bisa_dinilai: number } }).checked
    expect(await ditegur('proyeksi_selesai_meleset'),
      'proyek dengan SATU catatan diproyeksikan — garis dari satu titik')
      .toBe(false)
    expect(c.tak_bisa_dinilai,
      'proyek yang tak bisa dinilai tak dilaporkan — "0 meleset" jadi terbaca '
      + 'sebagai "semuanya tepat waktu"')
      .toBeGreaterThan(0)
  }, 120_000)

  it('laju dihitung dari KENAIKAN, bukan dari persen terakhir', async () => {
    /*
      Semua test lain di berkas ini mulai dari 0%, dan itu membuat satu cacat
      TAK TERLIHAT: kalau catatan pertama nol, `kenaikan` dan `persen terakhir`
      angkanya sama persis, jadi rumus mana pun memberi hasil identik.

      Proyek nyata tak begitu. Catatan pertama dalam jendela yang ada bisa
      sudah 80% — dan menghitung laju dari persen terakhir alih-alih
      kenaikannya membuat lajunya terlihat 8 kali lebih cepat daripada
      sebenarnya, lalu memproyeksikan selesai jauh lebih awal.

      Di sini: 80% → 82% dalam 40 hari = 0,05%/hari. Sisa 18 poin butuh 360
      hari. Kontraknya 10 hari lagi, jadi meleset ~350 hari dan HARUS ditegur.

      Kalau lajunya dihitung dari 82/40 = 2,05%/hari, sisanya cuma 9 hari dan
      proyeknya terlihat selesai tepat waktu — tak ditegur sama sekali.
    */
    await bersihkan()
    await siapkan(-10)
    await lapor(80, 40)
    await lapor(82, 1)

    await panggil()
    expect(await ditegur('proyeksi_selesai_meleset'),
      'proyek yang bergerak 2 poin dalam 40 hari tak ditegur — lajunya '
      + 'dihitung dari persen terakhir, bukan dari kenaikannya')
      .toBe(true)

    const { rows } = await db.query(
      `SELECT action_data FROM notifications
        WHERE type = 'proyeksi_selesai_meleset' AND company_id = $1
          AND action_data->>'record_id' = $2 LIMIT 1`, [companyId, proyek])
    expect(Number((rows[0].action_data as Record<string, unknown>).laju_per_hari),
      'laju jauh lebih besar daripada kenaikan sebenarnya')
      .toBeLessThan(0.2)
  }, 120_000)

  it('ambang meleset benar-benar menyaring', async () => {
    /*
      Naik 50 poin dalam 50 hari = 1%/hari. Sisa 50 poin butuh 50 hari;
      kontrak 40 hari lagi, jadi meleset ~10 hari.
    */
    await bersihkan()
    await siapkan(-40)
    await lapor(0, 50)
    await lapor(50, 1)

    await panggil('?hari=90')
    expect(await ditegur('proyeksi_selesai_meleset'),
      'meleset ~10 hari ditegur pada ambang 90')
      .toBe(false)

    await panggil('?hari=1')
    expect(await ditegur('proyeksi_selesai_meleset'),
      'ambang 1 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBe(true)
  }, 120_000)
})
