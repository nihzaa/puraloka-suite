/**
 * ABSENSI LEWAT ASISTEN — dan upah yang TIDAK boleh dibayar dua kali.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA ENTITAS YANG ANTI-GANDANYA DIJAGA KODE, BUKAN BASIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur ke `pg_constraint`: `absensi_harian` punya PK, tiga FK, dan tiga
 * CHECK rentang — **tak ada unique constraint** pada
 * (scope_id, worker_id, tanggal).
 *
 * Padahal absensi memberi makan `weekly_wage_reports`/`daily_wage_logs`. Dua
 * baris untuk orang yang sama di hari yang sama berarti **upah dibayar dua
 * kali**, dan basisnya tak akan menolak. Tak ada galat, tak ada gejala sampai
 * rekap mingguan terlihat aneh — dan saat itu uangnya sudah keluar.
 *
 * Semua entitas tulis lain lolos karena BASIS menahannya. Yang ini lolos
 * karena KODE menahannya, dan itu perbedaan yang harus punya test sendiri:
 * penjagaan yang hidup di satu baris kode adalah penjagaan yang bisa hilang
 * dalam satu refactor tanpa siapa pun menyadarinya.
 *
 * ── Yang dibuktikan
 *
 *   1. absensi tercatat dengan `scope_id` (BUKAN project_id — kolomnya tak ada)
 *   2. absensi KEDUA di hari yang sama DITOLAK sebelum token terbit
 *   3. tanggal BERBEDA tetap boleh — penolakannya bukan "sekali per orang"
 *   4. porsi & lembur di luar rentang ditolak dengan kalimat, bukan galat CHECK
 *   5. tukang yang namanya ambigu TIDAK ditebak
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { klaimTokenTulis } from '../tulis-klaim.js'
import { terbitkanTokenWa } from '../tulis-konfirmasi-wa.js'

const TANDA = '[UJI-ABSENSI]'
const IZIN = new Set(['ai:tulis'])
const diam = () => {}

let db: Client
let companyId: string
let projectId: string
let namaProyek: string
let scopeId: string
let workerId: string
let namaWorker: string
let userId: string

/** Tanggal uji yang jauh dari hari ini supaya tak menabrak data seed. */
const TGL_UJI = '2026-03-17'
const TGL_UJI_2 = '2026-03-18'

async function tokenAbsensi(tanggal: string, porsi = 1): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  await db.query(
    `INSERT INTO ai_token_tulis
       (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kanal, kedaluwarsa)
     VALUES ($1,$2,$3,'absensi','buat',$4,$5,$6,'ai_whatsapp', now() + interval '15 minutes')`,
    [
      companyId, token, userId, projectId,
      JSON.stringify({ scope_id: scopeId, worker_id: workerId, tanggal, porsi, lembur: 0, catatan: `${TANDA} uji` }),
      `${TANDA} absensi ${tanggal}`,
    ],
  )
  return token
}

beforeAll(async () => {
  db = await createRlsClient()

  /*
    Lingkup kerja dipilih dengan ORDER BY, dan HANYA yang company-nya punya
    tukang aktif.

    Versi sebelumnya `LIMIT 1` tanpa ORDER BY. Selama jumlah barisnya tetap,
    Postgres memulangkan yang sama tiap kali dan itu tak pernah terlihat
    salah. Ia berhenti benar begitu ada baris DIHAPUS: 2026-08-18 dua
    `work_scopes` sisa fixture uji SPK dibersihkan, urutan bergeser, dan
    lingkup yang terpilih ternyata milik company yang tak punya tukang
    aktif — sehingga baris absensi pertama tak pernah tercipta dan test
    "absensi KEDUA DITOLAK" gagal dengan `expected true to be false`.

    Kegagalannya menuduh LOGIKA DUPLIKAT, padahal yang salah pilihan
    fixture-nya. Syaratnya kini dinyatakan di query, bukan diharapkan
    kebetulan.
  */
  const { rows } = await db.query(`
    SELECT ws.id scope_id, ma.project_id, p.company_id, p.name proyek, p.created_by
      FROM work_scopes ws
      JOIN mandor_assignments ma ON ma.id = ws.assignment_id
      JOIN projects p ON p.id = ma.project_id
     WHERE p.created_by IS NOT NULL
       AND EXISTS (SELECT 1 FROM workers w
                    WHERE w.company_id = p.company_id AND w.is_active)
     ORDER BY ws.created_at, ws.id
     LIMIT 1`)
  if (rows.length === 0) {
    throw new Error('Butuh satu work_scope di company yang punya tukang aktif — '
      + 'periksa seed/keanggotaan, bukan berkas ini')
  }

  scopeId = rows[0].scope_id
  projectId = rows[0].project_id
  companyId = rows[0].company_id
  namaProyek = rows[0].proyek
  userId = rows[0].created_by

  const { rows: w } = await db.query(
    `SELECT id, name FROM workers WHERE company_id=$1 AND is_active=true LIMIT 1`, [companyId])
  if (w.length === 0) throw new Error('Butuh satu tukang aktif untuk test ini')
  workerId = w[0].id
  namaWorker = w[0].name
})

afterAll(async () => {
  /*
   * Dibersihkan lewat TANGGAL UJI, bukan hanya lewat TANDA.
   *
   * Token yang diterbitkan `terbitkanTokenWa` memakai ringkasan yang IA susun
   * sendiri — tanpa `TANDA`. Saat sebuah test gagal, token itu mengendap, lalu
   * membuat jalannya berikutnya gagal karena alasan yang sama sekali berbeda
   * ("expected 1 to be 0").
   *
   * Sudah terjadi sekali di sini, sesudah mutasi sengaja. Yang menyesatkan
   * bukan kegagalannya melainkan pesannya: ia menuduh kode, padahal yang kotor
   * basisnya.
   */
  await db.query(
    `DELETE FROM absensi_harian WHERE keterangan LIKE $1 OR tanggal = ANY($2::date[])`,
    [`${TANDA}%`, [TGL_UJI, TGL_UJI_2]],
  )
  await db.query(
    `DELETE FROM ai_token_tulis
      WHERE ringkasan LIKE $1 OR (jenis='absensi' AND (muatan->>'tanggal') = ANY($2::text[]))`,
    [`${TANDA}%`, [TGL_UJI, TGL_UJI_2]],
  )
  await db.end()
})

describe('absensi lewat asisten', () => {
  it('tercatat lewat scope_id — kolom project_id memang tak ada', async () => {
    const token = await tokenAbsensi(TGL_UJI, 1)
    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId), userId, izin: IZIN, token, catatGalat: diam,
    })

    expect(hasil.ok).toBe(true)
    if (!hasil.ok) return

    const { rows } = await db.query(
      `SELECT scope_id, worker_id, tanggal, porsi_hari, dicatat_oleh FROM absensi_harian WHERE id=$1`,
      [hasil.id])
    expect(rows).toHaveLength(1)
    expect(rows[0].scope_id).toBe(scopeId)
    expect(rows[0].worker_id).toBe(workerId)
    expect(Number(rows[0].porsi_hari)).toBe(1)
    expect(rows[0].dicatat_oleh).toBe(userId)
  })

  it('absensi KEDUA di hari yang sama DITOLAK — upah tak boleh dobel', async () => {
    /*
      Inti berkas ini.

      Baris pertama sudah tercipta di test sebelumnya (TGL_UJI). Basis TIDAK
      punya unique constraint, jadi INSERT kedua akan berhasil kalau kodenya
      tak menahannya — dan `weekly_wage_reports` akan menghitung orang ini dua
      kali.
    */
    const hasil = await terbitkanTokenWa(
      createTenantDb(companyId),
      companyId,
      userId,
      { jenis: 'absensi', argumen: { proyek: namaProyek, tukang: namaWorker, tanggal: TGL_UJI } },
      diam,
      'ai_whatsapp',
    )

    expect(hasil.ok).toBe(false)
    if (hasil.ok) return
    expect(hasil.pesan).toMatch(/sudah tercatat absen/i)

    // Dan tak ada token kedua yang terbit.
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM ai_token_tulis
        WHERE jenis='absensi' AND user_id=$1 AND (muatan->>'tanggal')=$2 AND ringkasan NOT LIKE $3`,
      [userId, TGL_UJI, `${TANDA}%`])
    expect(rows[0].n).toBe(0)
  })

  it('tanggal BERBEDA tetap boleh — bukan "sekali per orang"', async () => {
    const hasil = await terbitkanTokenWa(
      createTenantDb(companyId),
      companyId,
      userId,
      { jenis: 'absensi', argumen: { proyek: namaProyek, tukang: namaWorker, tanggal: TGL_UJI_2 } },
      diam,
      'ai_whatsapp',
    )
    expect(hasil.ok).toBe(true)

    // Bersih-bersih token yang barusan terbit — ia tak ber-TANDA.
    await db.query(
      `DELETE FROM ai_token_tulis WHERE jenis='absensi' AND user_id=$1 AND (muatan->>'tanggal')=$2`,
      [userId, TGL_UJI_2])
  })

  it('porsi & lembur di luar rentang ditolak dengan KALIMAT', async () => {
    // CHECK basis sudah menahannya, tetapi galatnya muncul SESUDAH token habis
    // dan berbunyi seperti kerusakan sistem.
    for (const porsi of [1.5, -0.2]) {
      const h = await terbitkanTokenWa(
        createTenantDb(companyId), companyId, userId,
        { jenis: 'absensi', argumen: { proyek: namaProyek, tukang: namaWorker, tanggal: TGL_UJI_2, porsi } },
        diam, 'ai_whatsapp',
      )
      expect(h.ok).toBe(false)
      if (!h.ok) expect(h.pesan).toMatch(/porsi/i)
    }

    const h = await terbitkanTokenWa(
      createTenantDb(companyId), companyId, userId,
      { jenis: 'absensi', argumen: { proyek: namaProyek, tukang: namaWorker, tanggal: TGL_UJI_2, lembur: 20 } },
      diam, 'ai_whatsapp',
    )
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.pesan).toMatch(/lembur/i)
  })

  it('tukang yang TAK ADA ditolak, bukan ditebak', async () => {
    const h = await terbitkanTokenWa(
      createTenantDb(companyId), companyId, userId,
      { jenis: 'absensi', argumen: { proyek: namaProyek, tukang: 'Zzxqv Tak Ada', tanggal: TGL_UJI_2 } },
      diam, 'ai_whatsapp',
    )
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.pesan).toMatch(/tak ada tukang/i)
  })

  it('tanggal MASA DEPAN ditolak', async () => {
    // CHECK `absensi_tanggal_masuk_akal`: tanggal ≤ besok. Absensi untuk hari
    // yang belum tiba adalah laporan tentang pekerjaan yang belum terjadi.
    const jauh = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const h = await terbitkanTokenWa(
      createTenantDb(companyId), companyId, userId,
      { jenis: 'absensi', argumen: { proyek: namaProyek, tukang: namaWorker, tanggal: jauh } },
      diam, 'ai_whatsapp',
    )
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.pesan).toMatch(/belum tiba/i)
  })
})
