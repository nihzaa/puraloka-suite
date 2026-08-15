/**
 * KLAIM TOKEN TULIS — terhadap Postgres NYATA, dua kanal satu jalur.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INTEGRASI, BUKAN MOCK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang diuji di sini justru hal-hal yang mock TIDAK PERNAH salah:
 *
 *   - klaim atomik (`dipakai_pada IS NULL` di WHERE) — mock akan "berhasil"
 *     dua kali dan test tetap hijau, sementara di produksi dua kasbon tercipta
 *   - `status` yang dibiarkan BAWAAN supaya kasbon lahir di antrean approval —
 *     mock tak punya bawaan kolom
 *   - constraint yang menolak muatan (mis. `chk_petty_cash_source`), yang
 *     baru muncul SESUDAH token habis
 *
 * Ketiganya adalah cacat yang pernah benar-benar terjadi di repo ini, dan
 * ketiganya lolos dari test bermock.
 *
 * ── Yang dibuktikan
 *
 *   1. token sah → baris BENAR-BENAR tercipta, dan tokennya tertaut hasilnya
 *   2. token yang SAMA diklaim dua kali → tepat SATU baris (bukan dua)
 *   3. token ORANG LAIN ditolak, meski satu tenant
 *   4. token kedaluwarsa ditolak
 *   5. tanpa izin `ai:tulis` ditolak — dan ditolak SEBELUM token dibaca
 *   6. kasbon lahir berstatus `pending`, bukan disetujui
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { randomBytes } from 'node:crypto'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { klaimTokenTulis } from '../tulis-klaim.js'

const TANDA = '[UJI-KLAIM-TULIS]'
const IZIN = new Set(['ai:tulis'])
const diam = () => {}

let db: Client
let companyId: string
let projectId: string
let userId: string
let userLain: string

/** Menyisipkan satu token siap-klaim, mengembalikan nilainya. */
async function buatToken(opsi: {
  jenis: string
  muatan: Record<string, unknown>
  userId?: string
  kedaluwarsaMs?: number
}): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  await db.query(
    `INSERT INTO ai_token_tulis
       (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kanal, kedaluwarsa)
     VALUES ($1,$2,$3,$4,'buat',$5,$6,$7,'ai_whatsapp', now() + ($8 || ' milliseconds')::interval)`,
    [
      companyId,
      token,
      opsi.userId ?? userId,
      opsi.jenis,
      projectId,
      JSON.stringify(opsi.muatan),
      `${TANDA} ${opsi.jenis}`,
      String(opsi.kedaluwarsaMs ?? 15 * 60_000),
    ],
  )
  return token
}

beforeAll(async () => {
  db = await createRlsClient()

  // Tenant yang SUDAH berdata — proyek nyata, supaya `viaProject` punya
  // sesuatu untuk disaring. Fixture proyek sendiri butuh 5 kolom wajib
  // (diukur), dan menumpang yang ada jauh lebih murah daripada membuatnya.
  const { rows } = await db.query(`
    SELECT p.id AS project_id, p.company_id, p.created_by
      FROM projects p
     WHERE p.is_deleted = false AND p.created_by IS NOT NULL
     ORDER BY p.created_at DESC NULLS LAST
     LIMIT 1
  `)
  if (rows.length === 0) throw new Error('Butuh minimal satu proyek berdata untuk test ini')

  projectId = rows[0].project_id
  companyId = rows[0].company_id
  userId = rows[0].created_by

  // Orang KEDUA di tenant yang sama — inti kasus 3. Kalau ia diambil dari
  // tenant lain, yang menahan kebocoran jadi RLS, bukan cek kepemilikan
  // token yang sedang diuji.
  const { rows: lain } = await db.query(
    `SELECT cm.user_id FROM company_members cm
      WHERE cm.company_id = $1 AND cm.user_id <> $2 LIMIT 1`,
    [companyId, userId],
  )
  userLain = lain[0]?.user_id ?? null
})

afterAll(async () => {
  // Bersih-bersih memakai TANDA — baris uji tak boleh mengendap di basis
  // bersama, karena shard lain membaca tabel yang sama.
  await db.query(`DELETE FROM ai_token_tulis WHERE ringkasan LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM kasbons WHERE purpose LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM progress_logs WHERE notes LIKE $1`, [`${TANDA}%`])
  await db.end()
})

describe('klaim token tulis', () => {
  it('token sah → baris tercipta dan tertaut', async () => {
    const token = await buatToken({
      jenis: 'catatan_progres',
      muatan: { pct_overall: 41, notes: `${TANDA} progres uji` },
    })

    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId),
      userId,
      izin: IZIN,
      token,
      catatGalat: diam,
    })

    expect(hasil.ok).toBe(true)
    if (!hasil.ok) return

    expect(hasil.id).toBeTruthy()

    // Barisnya BENAR-BENAR ada — bukan sekadar "fungsi mengembalikan ok".
    const { rows } = await db.query(`SELECT id, notes FROM progress_logs WHERE id = $1`, [hasil.id])
    expect(rows).toHaveLength(1)
    expect(rows[0].notes).toContain(TANDA)

    // Jejak niat → hasil.
    const { rows: tok } = await db.query(
      `SELECT hasil_id, dipakai_pada FROM ai_token_tulis WHERE token = $1`,
      [token],
    )
    expect(tok[0].hasil_id).toBe(hasil.id)
    expect(tok[0].dipakai_pada).not.toBeNull()
  })

  it('DUA klaim atas token yang sama → tepat SATU baris', async () => {
    /*
     * Bukan skenario teoretis di WhatsApp: orang yang merasa pesannya belum
     * terkirim mengetik "ya" dua kali, dan penyedia webhook sendiri mencoba
     * ulang saat balasan lambat.
     */
    const token = await buatToken({
      jenis: 'catatan_progres',
      muatan: { pct_overall: 55, notes: `${TANDA} anti-dobel` },
    })

    const sekali = () =>
      klaimTokenTulis({
        db: createTenantDb(companyId),
        userId,
        izin: IZIN,
        token,
        catatGalat: diam,
      })

    // BERSAMAAN, bukan berurutan — berurutan akan hijau bahkan tanpa
    // `dipakai_pada IS NULL` di WHERE.
    const [a, b] = await Promise.all([sekali(), sekali()])

    const berhasil = [a, b].filter((h) => h.ok)
    expect(berhasil).toHaveLength(1)

    const gagal = [a, b].find((h) => !h.ok)
    expect(gagal && !gagal.ok && gagal.sebab).toBe('sudah_dipakai')

    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM progress_logs WHERE notes = $1`,
      [`${TANDA} anti-dobel`],
    )
    expect(rows[0].n).toBe(1)
  })

  it('token ORANG LAIN ditolak meski satu tenant', async () => {
    if (!userLain) return // tenant berpenghuni satu orang — tak ada yang bisa diuji

    const token = await buatToken({
      jenis: 'catatan_progres',
      muatan: { pct_overall: 10, notes: `${TANDA} milik orang lain` },
      userId: userLain,
    })

    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId),
      userId, // BUKAN pemiliknya
      izin: IZIN,
      token,
      catatGalat: diam,
    })

    expect(hasil.ok).toBe(false)
    if (hasil.ok) return
    expect(hasil.sebab).toBe('bukan_pemilik')

    // Dan tak ada yang tertulis.
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM progress_logs WHERE notes = $1`,
      [`${TANDA} milik orang lain`],
    )
    expect(rows[0].n).toBe(0)
  })

  it('token KEDALUWARSA ditolak', async () => {
    const token = await buatToken({
      jenis: 'catatan_progres',
      muatan: { pct_overall: 20, notes: `${TANDA} kedaluwarsa` },
      kedaluwarsaMs: -1000, // sudah lewat
    })

    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId),
      userId,
      izin: IZIN,
      token,
      catatGalat: diam,
    })

    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.sebab).toBe('kedaluwarsa')
  })

  it('TANPA izin ai:tulis ditolak', async () => {
    const token = await buatToken({
      jenis: 'catatan_progres',
      muatan: { pct_overall: 30, notes: `${TANDA} tanpa izin` },
    })

    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId),
      userId,
      izin: new Set(['ai:chat']), // punya chat, TIDAK punya tulis
      token,
      catatGalat: diam,
    })

    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.sebab).toBe('tanpa_izin')

    // Tokennya HARUS masih utuh — ditolak sebelum dibaca, jadi tak terpakai.
    const { rows } = await db.query(`SELECT dipakai_pada FROM ai_token_tulis WHERE token = $1`, [
      token,
    ])
    expect(rows[0].dipakai_pada).toBeNull()
  })

  it('kasbon lahir PENDING, bukan disetujui', async () => {
    /*
     * Justru inilah alasan kasbon boleh ditulis lewat percakapan: ia lahir di
     * antrean approval. Kalau suatu hari bawaannya berubah jadi `approved`,
     * asisten akan mengeluarkan uang tanpa satu pun persetujuan — dan test
     * ini yang merah lebih dulu.
     */
    const token = await buatToken({
      jenis: 'kasbon',
      muatan: { jumlah: 250000, keperluan: `${TANDA} beli solar`, sumber_dana: 'owner_advance' },
    })

    const hasil = await klaimTokenTulis({
      db: createTenantDb(companyId),
      userId,
      izin: IZIN,
      token,
      catatGalat: diam,
    })

    expect(hasil.ok).toBe(true)
    if (!hasil.ok) return

    const { rows } = await db.query(`SELECT status, amount FROM kasbons WHERE id = $1`, [hasil.id])
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
    expect(Number(rows[0].amount)).toBe(250000)
  })
})
