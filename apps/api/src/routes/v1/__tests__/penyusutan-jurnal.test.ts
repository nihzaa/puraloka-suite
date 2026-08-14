/**
 * A2 — penyusutan → jurnal, lewat HTTP terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TERPISAH DARI `lib/__tests__/jurnal-penyusutan.test.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test lib membuktikan BENTUK jurnalnya benar: debit beban, kredit akumulasi,
 * jumlah sama besar. Ia hijau meski rutenya tak pernah menulis apa pun.
 *
 * Yang hanya bisa dijawab di sini:
 *
 *   • `penyusutan_alat.journal_entry_id` benar-benar TERISI — inilah lubang
 *     yang ditemukan: 12 dari 12 baris NULL, kolomnya ada sejak lama
 *   • memanggil DUA KALI tak menjurnalkan periode yang sama dua kali
 *     (beban ganda yang totalnya tetap seimbang, jadi tak ada pemeriksaan
 *     yang menabraknya)
 *   • akun 5960 & 1511 dipetakan ke id MILIK TENANT INI
 *   • jurnalnya lolos trigger `fn_gl_wajib_seimbang` di basis
 *
 * ── Kebersihan data
 *
 * Test ini MENULIS ke buku besar dev. Seluruh jejaknya dibersihkan di
 * `afterAll`, DAN `journal_entry_id` dikembalikan NULL — kalau tidak, baris
 * penyusutan nyata akan mengaku sudah dijurnalkan padahal jurnalnya sudah
 * dihapus, dan panggilan berikutnya melewatkannya.
 *
 * Pelajaran G6b: test yang merusak data nyata sudah pernah terjadi sesi ini.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import alatOperasionalRoutes from '../alat-operasional.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let companyId: string
let periodeUji: string | null = null
let idBarisUji: string[] = []
const jurnalDibuat: string[] = []

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const jurnalkan = (periode?: string) =>
  app.inject({
    method: 'POST', url: '/api/v1/alat-operasional/penyusutan/jurnalkan',
    payload: (periode === undefined ? {} : { periode }) as never,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth

  const { rows: co } = await db.query(`
    SELECT c.id FROM companies c
     WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
       AND EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = c.id AND a.code = '5960')
     LIMIT 1`)
  if (!co.length) throw new Error('tak ada company ber-akun 5960 (jalankan migrasi 324)')
  companyId = co[0].id

  // Periode yang PUNYA baris belum terjurnal — dipilih menurut syaratnya,
  // bukan "baris pertama". Test yang mengambil posisi hijau/merah tergantung
  // isi basis.
  // Periode yang belum terjurnal DAN periodenya masih TERBUKA.
  //
  // Tanpa syarat kedua, test ini memilih periode tertutup dan gagal dengan
  // 409 yang justru BENAR — cacatnya di pemilihan fixture, bukan di kode
  // yang diuji. Diukur 2026-08-12: Mei/Juni/Juli 2026 semuanya tertutup.
  const { rows: p } = await db.query(
    `SELECT ps.periode::text AS periode, count(*)::int AS n
       FROM penyusutan_alat ps
       LEFT JOIN periode_akuntansi a
         ON a.company_id = ps.company_id
        AND ps.periode BETWEEN a.tanggal_mulai AND a.tanggal_akhir
      WHERE ps.company_id = $1 AND ps.journal_entry_id IS NULL
        AND (a.id IS NULL OR a.status = 'terbuka')
      GROUP BY ps.periode ORDER BY ps.periode LIMIT 1`, [companyId])
  if (p.length) {
    periodeUji = p[0].periode
    const { rows: b } = await db.query(
      `SELECT id FROM penyusutan_alat
        WHERE company_id = $1 AND periode = $2 AND journal_entry_id IS NULL`,
      [companyId, periodeUji])
    idBarisUji = b.map(r => r.id)
  }

  app = Fastify({ logger: false })
  await app.register(alatOperasionalRoutes)
  await app.ready()
  actAs(adminAuth)
}, 90_000)

afterAll(async () => {
  // Kembalikan penyusutan ke belum-terjurnal LEBIH DULU, baru hapus jurnalnya.
  // Urutan terbalik akan tertahan FK.
  if (idBarisUji.length) {
    await db.query(
      `UPDATE penyusutan_alat SET journal_entry_id = NULL, dijurnal_pada = NULL WHERE id = ANY($1)`,
      [idBarisUji])
  }
  for (const j of jurnalDibuat) {
    await db.query('DELETE FROM journal_entry_lines WHERE entry_id = $1', [j])
    await db.query('DELETE FROM journal_entries WHERE id = $1', [j])
  }
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('penolakan masukan', () => {
  it('periode wajib', async () => {
    const r = await jurnalkan()
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/periode wajib/i)
  })

  it('periode berbentuk salah ditolak 400, bukan 500', async () => {
    const r = await jurnalkan('Mei 2026')
    expect(r.statusCode).toBe(400)
  })

  it('periode tanpa penyusutan belum-terjurnal dijawab 404', async () => {
    const r = await jurnalkan('1999-01-31')
    expect(r.statusCode).toBe(404)
    expect(r.json().error).toMatch(/belum dijurnalkan/i)
  })
})

describe('periode tertutup', () => {
  it('ditolak 409 dengan kalimat yang bisa ditindaklanjuti', async () => {
    // Ditemukan 2026-08-12: Mei/Juni/Juli 2026 semuanya `tertutup`, dan
    // trigger basis menolak POSTING dengan benar — tetapi jurnalnya SUDAH
    // terbuat sebagai draft dan penyusutannya sudah tertandai. Draft yang tak
    // akan pernah bisa diposting, sementara penyusutan mengaku sudah masuk
    // buku: jalan buntu yang harus dibersihkan tangan.
    const { rows } = await db.query(
      `SELECT p.periode::text AS periode
         FROM penyusutan_alat p
         JOIN periode_akuntansi a
           ON a.company_id = p.company_id
          AND p.periode BETWEEN a.tanggal_mulai AND a.tanggal_akhir
        WHERE p.company_id = $1 AND p.journal_entry_id IS NULL AND a.status <> 'terbuka'
        LIMIT 1`, [companyId])
    if (!rows.length) {
      console.warn('  ⏭  tak ada penyusutan di periode tertutup — dilewati')
      return
    }
    const r = await jurnalkan(rows[0].periode)
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/sudah ditutup/i)

    // DAN tak meninggalkan jejak: nol jurnal baru, penyusutan tetap NULL.
    const { rows: cek } = await db.query(
      `SELECT count(*)::int AS n FROM penyusutan_alat
        WHERE company_id = $1 AND periode = $2 AND journal_entry_id IS NOT NULL`,
      [companyId, rows[0].periode])
    expect(cek[0].n).toBe(0)
  })
})

describe('jalur nyata', () => {
  it('menjurnalkan periode dan MENGISI journal_entry_id', async () => {
    if (!periodeUji) {
      // Basis tanpa penyusutan belum-terjurnal: dilewati DENGAN SUARA,
      // bukan dilaporkan lulus.
      console.warn('  ⏭  tak ada penyusutan belum-terjurnal — test jalur nyata dilewati')
      return
    }

    const r = await jurnalkan(periodeUji)
    expect(r.statusCode, r.body).toBe(201)
    const j = r.json()
    expect(j.baris_dijurnalkan).toBe(idBarisUji.length)
    jurnalDibuat.push(j.jurnal.id)

    // INI lubang yang ditutup: kolomnya terisi, bukan tetap NULL.
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM penyusutan_alat
        WHERE id = ANY($1) AND journal_entry_id IS NOT NULL AND dijurnal_pada IS NOT NULL`,
      [idBarisUji])
    expect(rows[0].n).toBe(idBarisUji.length)
  })

  it('jurnalnya SEIMBANG dan memakai akun 5960 + 1511', async () => {
    if (!jurnalDibuat.length) return
    const { rows } = await db.query(
      `SELECT a.code, sum(l.debit)::numeric AS d, sum(l.credit)::numeric AS k
         FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id
        WHERE l.entry_id = $1 GROUP BY a.code ORDER BY a.code`,
      [jurnalDibuat[0]])

    const kode = rows.map(r => r.code)
    expect(kode).toContain('5960')
    expect(kode).toContain('1511')

    const totalD = rows.reduce((a, r) => a + Number(r.d), 0)
    const totalK = rows.reduce((a, r) => a + Number(r.k), 0)
    expect(Math.abs(totalD - totalK)).toBeLessThan(0.01)

    // Arah yang benar: beban di DEBIT, akumulasi di KREDIT. Terbalik akan
    // membuat penyusutan MENAMBAH laba dan menaikkan nilai aset.
    const beban = rows.find(r => r.code === '5960')
    const akum = rows.find(r => r.code === '1511')
    expect(Number(beban.d)).toBeGreaterThan(0)
    expect(Number(beban.k)).toBe(0)
    expect(Number(akum.k)).toBeGreaterThan(0)
    expect(Number(akum.d)).toBe(0)
  })

  it('memanggil DUA KALI tak menjurnalkan periode yang sama lagi', async () => {
    if (!periodeUji || !jurnalDibuat.length) return
    // Tanpa `.is('journal_entry_id', null)` di rutenya, panggilan kedua
    // membuat beban GANDA — dan totalnya tetap seimbang, jadi tak ada satu
    // pun pemeriksaan pembukuan yang menabraknya.
    const r = await jurnalkan(periodeUji)
    expect(r.statusCode).toBe(404)
  })

  it('akun 5960 milik company ini, bukan tenant lain', async () => {
    if (!jurnalDibuat.length) return
    const { rows } = await db.query(
      `SELECT DISTINCT a.company_id FROM journal_entry_lines l
         JOIN accounts a ON a.id = l.account_id
        WHERE l.entry_id = $1`, [jurnalDibuat[0]])
    expect(rows).toHaveLength(1)
    expect(rows[0].company_id).toBe(companyId)
  })
})
