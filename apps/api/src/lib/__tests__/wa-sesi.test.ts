/**
 * TJS-D1 — pabrik sesi sintetis, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN: PERAN DATANG DARI BASIS, DAN PENCABUTAN LANGSUNG BERLAKU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-sesi-sintetis-aman.mjs` sudah menjaga BENTUKNYA (tak ada parameter
 * peran). Yang belum terbukti dari situ: perannya benar-benar diresolusi, dan
 * mencabut keanggotaan benar-benar menutup jalur WhatsApp.
 *
 * Itu perbedaan yang menentukan dari TJS. Di sana nomor terikat daftar kontak
 * terpisah (`ownerAiContact`), jadi orang yang dicabut aksesnya di ERP tetap
 * punya sesi sintetis yang sah sampai seseorang ingat menghapusnya dari daftar
 * kedua — dan tak ada yang mengingatkan.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { supabase } from '../../utils/supabase.js'
import { bangunSesiDariNomor, catatAksesDitolak } from '../wa-sesi.js'

const NOMOR = '628999777001'
const NOMOR_ASING = '628999777999'

let db: Client
let companyId: string
let userId: string
let roleId: string

beforeAll(async () => {
  db = await createRlsClient()
  const { rows: c } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = c[0].id
  const { rows: m } = await db.query(
    `SELECT user_id, role_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
  userId = m[0].user_id
  roleId = m[0].role_id
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM wa_nomor_pengguna WHERE nomor IN ($1, $2)`, [NOMOR, NOMOR_ASING])
  await db.query(`DELETE FROM ai_akses_ditolak WHERE pengenal IN ($1, $2)`, [NOMOR, NOMOR_ASING])
  // Keanggotaan dipulihkan — test yang mengubah data bersama harus
  // mengembalikannya, kalau tidak test berikutnya gagal karena sisa test ini.
  await db.query(
    `INSERT INTO company_members (company_id, user_id, role_id) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [companyId, userId, roleId],
  )
  await db.end()
})

beforeEach(async () => {
  await db.query(`DELETE FROM wa_nomor_pengguna WHERE nomor IN ($1, $2)`, [NOMOR, NOMOR_ASING])
  await db.query(`DELETE FROM ai_akses_ditolak WHERE pengenal IN ($1, $2)`, [NOMOR, NOMOR_ASING])
})

async function daftarkan(opsi: { verifikasi: boolean; aktif?: boolean }) {
  await db.query(
    `INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor, terverifikasi_pada, aktif)
     VALUES ($1, $2, $3, $4, $5)`,
    [companyId, userId, NOMOR, opsi.verifikasi ? new Date().toISOString() : null, opsi.aktif ?? true],
  )
}

describe('nomor terverifikasi → sesi sah', () => {
  it('peran DIRESOLUSI dari basis, bukan dikarang', async () => {
    await daftarkan({ verifikasi: true })
    const h = await bangunSesiDariNomor(supabase, NOMOR)

    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.sesi.userId).toBe(userId)
    expect(h.sesi.companyId).toBe(companyId)

    // Perannya harus SAMA dengan yang tercatat di company_members. Kalau
    // undefined, `get_role_permissions(undefined)` mengembalikan set kosong —
    // yang terbaca sebagai "orang ini tak punya izin apa pun".
    const { rows } = await db.query(
      `SELECT r.name FROM company_members m JOIN roles r ON r.id = m.role_id
        WHERE m.company_id = $1 AND m.user_id = $2`,
      [companyId, userId],
    )
    expect(h.sesi.peran).toBe(rows[0].name)
    expect(h.sesi.peran).toBeTruthy()
  })

  it('nomor dinormalkan — bentuk apa pun menemukan orang yang sama', async () => {
    await daftarkan({ verifikasi: true })
    // `+62 899-9777-001` adalah nomor yang SAMA dengan yang terdaftar.
    const h = await bangunSesiDariNomor(supabase, '+62 899-9777-001')
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.sesi.nomor).toBe(NOMOR)
  })
})

describe('penolakan — tiap alasan bisa dibedakan', () => {
  it('nomor TAK TERDAFTAR ditolak', async () => {
    const h = await bangunSesiDariNomor(supabase, NOMOR_ASING)
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('nomor_tak_terdaftar')
  })

  it('nomor BELUM DIVERIFIKASI ditolak', async () => {
    await daftarkan({ verifikasi: false })
    const h = await bangunSesiDariNomor(supabase, NOMOR)
    // Siapa pun bisa mengetik nomor orang lain di halaman profil. Tanpa
    // verifikasi, mendaftarkan nomor korban sudah cukup untuk membaca datanya.
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('belum_terverifikasi')
  })

  it('nomor DINONAKTIFKAN ditolak', async () => {
    await daftarkan({ verifikasi: true, aktif: false })
    const h = await bangunSesiDariNomor(supabase, NOMOR)
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('nonaktif')
  })

  it('nomor tak sah ditolak sebelum menyentuh basis', async () => {
    const h = await bangunSesiDariNomor(supabase, 'bukan-nomor')
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('nomor_tak_sah')
  })
})

describe('PENCABUTAN AKSES langsung berlaku — perbedaan dari TJS', () => {
  it('keanggotaan dicabut → sesi DITOLAK meski nomornya masih terdaftar', async () => {
    await daftarkan({ verifikasi: true })

    // Sesi sah dulu.
    expect((await bangunSesiDariNomor(supabase, NOMOR)).ok).toBe(true)

    // Cabut keanggotaan — persis yang terjadi saat orang keluar dari
    // perusahaan.
    await db.query(
      `DELETE FROM company_members WHERE company_id = $1 AND user_id = $2`,
      [companyId, userId],
    )

    const h = await bangunSesiDariNomor(supabase, NOMOR)
    // Di TJS ini masih SAH: nomornya terikat daftar kontak terpisah yang tak
    // ikut terhapus. Orang yang sudah keluar tetap bisa bertanya lewat
    // WhatsApp sampai seseorang ingat menghapusnya dari daftar kedua.
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('bukan_anggota')

    await db.query(
      `INSERT INTO company_members (company_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [companyId, userId, roleId],
    )
  })

  it('peran TIDAK disalin ke wa_nomor_pengguna', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'wa_nomor_pengguna'
    `)
    const kolom = rows.map((r) => r.column_name as string)
    // Peran yang disalin akan basi begitu peran orangnya diubah di ERP — dan
    // basinya tak terlihat sampai seseorang memakai wewenang yang dicabut.
    for (const terlarang of ['role', 'role_id', 'peran']) {
      expect(kolom, `kolom '${terlarang}' tak boleh ada`).not.toContain(terlarang)
    }
  })
})

describe('C-9 — percobaan dari nomor tak dikenal DICATAT', () => {
  it('tercatat di ai_akses_ditolak dengan alasannya', async () => {
    await catatAksesDitolak(supabase, NOMOR_ASING, 'nomor_tak_terdaftar')

    const { rows } = await db.query(
      `SELECT pengenal, kanal, alasan FROM ai_akses_ditolak WHERE pengenal = $1`,
      [NOMOR_ASING],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kanal).toBe('ai_whatsapp')
    expect(rows[0].alasan).toBe('nomor_tak_terdaftar')
  })

  it('nomor dinormalkan sebelum dicatat', async () => {
    await catatAksesDitolak(supabase, '+62 899-9777-999', 'nomor_tak_terdaftar')
    const { rows } = await db.query(
      `SELECT pengenal FROM ai_akses_ditolak WHERE pengenal = $1`, [NOMOR_ASING])
    // Tanpa normalisasi, satu penyerang yang memutar bentuk nomornya akan
    // tampak sebagai banyak orang berbeda — dan polanya tak pernah terlihat.
    expect(rows).toHaveLength(1)
  })

  it('ISI pesan TIDAK ikut tercatat', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ai_akses_ditolak'
    `)
    const kolom = rows.map((r) => r.column_name as string)
    // Pesan dari orang tak dikenal bisa memuat apa saja; menyimpannya berarti
    // menyimpan data orang yang tak pernah menyetujui apa pun.
    for (const terlarang of ['pesan', 'isi', 'teks', 'body']) {
      expect(kolom).not.toContain(terlarang)
    }
  })
})
