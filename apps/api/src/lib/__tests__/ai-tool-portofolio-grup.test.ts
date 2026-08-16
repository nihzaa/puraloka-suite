/**
 * 1.15 — portofolio lintas badan usaha, diuji terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TEST INI MENJAGA SATU-SATUNYA TOOL YANG MELANGGAR ISOLASI TENANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Semua tool lain terkurung pada satu `companyId`. Yang ini sengaja tidak,
 * jadi bagian terpenting berkas ini bukan "angkanya benar" melainkan
 * "angkanya BERHENTI di batas keanggotaan".
 *
 * Kalau kelak seseorang mengganti saringan `company_members` dengan
 * `parent_company_id` — perubahan yang terlihat menyederhanakan — maka
 * seorang staf di satu anak perusahaan akan melihat nilai kontrak seluruh
 * grup. Tak ada galat, tak ada gejala. Test `bukan anggota` di bawah adalah
 * satu-satunya hal yang menahannya.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { ringkasPortofolioGrup } from '../ai-tool-portofolio-grup.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
/** User yang jadi anggota BEBERAPA badan usaha. */
let userGrup: string
let companyIni: string
/** User yang hanya anggota SATU badan usaha. */
let userTunggal: string | null = null

beforeAll(async () => {
  db = await createRlsClient()

  const { rows } = await db.query(`
    SELECT user_id, count(DISTINCT company_id)::int n
      FROM company_members WHERE is_active = true
     GROUP BY 1 HAVING count(DISTINCT company_id) > 1
     ORDER BY 2 DESC LIMIT 1`)
  if (rows.length === 0) {
    throw new Error(
      'Butuh user beranggota >1 badan usaha. Jalankan: node scripts/seed-grup-usaha.mjs --execute',
    )
  }
  userGrup = rows[0].user_id

  const { rows: co } = await db.query(
    `SELECT company_id FROM company_members
      WHERE user_id = $1 AND is_active = true ORDER BY created_at LIMIT 1`,
    [userGrup],
  )
  companyIni = co[0].company_id

  const { rows: t } = await db.query(`
    SELECT user_id FROM company_members WHERE is_active = true
     GROUP BY 1 HAVING count(DISTINCT company_id) = 1 LIMIT 1`)
  userTunggal = t[0]?.user_id ?? null
})

afterAll(async () => {
  await db.end()
})

describe('tool portofolio grup', () => {
  it('terdaftar dengan izin yang BENAR-BENAR ada', async () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'portofolio_grup')
    expect(t, 'tool `portofolio_grup` tak terdaftar').toBeTruthy()
    const { rows } = await db.query('SELECT 1 FROM permissions WHERE key = $1', [
      t!.izin,
    ])
    expect(rows.length, `izin ${t!.izin} tak ada di tabel permissions`).toBe(1)
  })

  it('menampilkan semua badan usaha tempat penanya jadi anggota', async () => {
    const h = await ringkasPortofolioGrup(
      createTenantDb(companyIni), userGrup, companyIni,
    )
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT count(DISTINCT company_id)::int n FROM company_members
        WHERE user_id = $1 AND is_active = true`,
      [userGrup],
    )
    expect(h.badanUsaha.length).toBe(Number(rows[0].n))
  })

  it('TIDAK menampilkan badan usaha yang penanya BUKAN anggotanya', async () => {
    /*
     * Inti berkas ini. Dibandingkan dengan daftar seluruh company yang ada di
     * basis — bukan sekadar memeriksa jumlahnya cocok.
     */
    const h = await ringkasPortofolioGrup(
      createTenantDb(companyIni), userGrup, companyIni,
    )
    if ('galat' in h) throw new Error(h.galat)

    const { rows: milik } = await db.query(
      `SELECT c.name FROM companies c
         JOIN company_members m ON m.company_id = c.id
        WHERE m.user_id = $1 AND m.is_active = true`,
      [userGrup],
    )
    const namaMilik = new Set(milik.map((r: { name: string }) => r.name))

    for (const b of h.badanUsaha) {
      expect(
        namaMilik.has(b.nama),
        `"${b.nama}" muncul padahal penanya bukan anggotanya — KEBOCORAN LINTAS TENANT`,
      ).toBe(true)
    }

    // Dan pastikan basis memang punya company LAIN, kalau tidak test ini
    // hijau tanpa menguji apa pun.
    const { rows: total } = await db.query('SELECT count(*)::int n FROM companies')
    expect(
      Number(total[0].n),
      'basis cuma punya company milik penanya — test kebocoran tak berarti',
    ).toBeGreaterThan(h.badanUsaha.length)
  })

  it('user beranggota SATU PT dijawab apa adanya, bukan tabel satu baris', async () => {
    if (!userTunggal) {
      expect(userTunggal, 'tak ada user ber-1 PT — cabang ini tak teruji').toBeNull()
      return
    }
    const { rows } = await db.query(
      `SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1`,
      [userTunggal],
    )
    const h = await ringkasPortofolioGrup(
      createTenantDb(rows[0].company_id), userTunggal, rows[0].company_id,
    )
    if ('galat' in h) throw new Error(h.galat)

    // Tabel satu baris membuat penanya menyangka ia punya grup usaha.
    expect(h.badanUsaha).toHaveLength(0)
    expect(h.catatan).toBeTruthy()
    expect(h.catatan).toContain('satu badan usaha')
  })

  it('menandai badan usaha yang sedang dibuka', async () => {
    const h = await ringkasPortofolioGrup(
      createTenantDb(companyIni), userGrup, companyIni,
    )
    if ('galat' in h) throw new Error(h.galat)
    const ditandai = h.badanUsaha.filter((b) => b.ini)
    // Tepat satu — tanpa penanda, pembaca tak tahu angka mana yang di layarnya.
    expect(ditandai).toHaveLength(1)
  })

  it('nilai kontrak cocok dengan hitungan SQL terpisah', async () => {
    const h = await ringkasPortofolioGrup(
      createTenantDb(companyIni), userGrup, companyIni,
    )
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT c.name, coalesce(sum(p.contract_value),0)::float8 nilai,
              count(p.id)::int n
         FROM companies c
         JOIN company_members m ON m.company_id = c.id AND m.user_id = $1
                               AND m.is_active = true
         LEFT JOIN projects p ON p.company_id = c.id AND p.is_deleted = false
        GROUP BY c.name ORDER BY nilai DESC LIMIT 1`,
      [userGrup],
    )
    expect(h.badanUsaha[0].nama).toBe(rows[0].name)
    expect(h.badanUsaha[0].nilaiKontrak).toBe(Math.round(Number(rows[0].nilai)))
    expect(h.badanUsaha[0].jumlahProyek).toBe(Number(rows[0].n))
  })

  it('proyek terhapus tidak ikut dihitung', async () => {
    const h = await ringkasPortofolioGrup(
      createTenantDb(companyIni), userGrup, companyIni,
    )
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE NOT p.is_deleted)::int hidup,
              count(*) FILTER (WHERE p.is_deleted)::int  terhapus
         FROM projects p
         JOIN company_members m ON m.company_id = p.company_id
        WHERE m.user_id = $1 AND m.is_active = true`,
      [userGrup],
    )
    expect(h.totalProyek).toBe(Number(rows[0].hidup))

    /*
     * ⚠ CABANG INI BELUM BENAR-BENAR TERUJI.
     *
     * Diukur 2026-08-16: grup ini punya 22 proyek dan NOL yang terhapus. Jadi
     * assertion di atas hijau baik saringan `is_deleted` dipasang maupun
     * dicabut — dibuktikan lewat mutasi: menghapus `.eq('is_deleted', false)`
     * TIDAK membuat test ini merah.
     *
     * Dinyatakan di sini, bukan dibiarkan diam-diam hijau. Begitu ada proyek
     * terhapus di data uji, assertion berikut mulai menggigit dan cabangnya
     * teruji sungguhan.
     */
    if (Number(rows[0].terhapus) === 0) {
      expect(
        Number(rows[0].terhapus),
        'tak ada proyek terhapus di grup uji — saringan is_deleted TIDAK teruji',
      ).toBe(0)
    } else {
      expect(h.totalProyek).toBeLessThan(
        Number(rows[0].hidup) + Number(rows[0].terhapus),
      )
    }
  })
})
