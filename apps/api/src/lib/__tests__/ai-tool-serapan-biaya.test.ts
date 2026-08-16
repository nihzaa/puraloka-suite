/**
 * SERAPAN BIAYA vs PROGRES (8.4).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BENTUKNYA DIUBAH SESUDAH PENGUKURAN — DAN ITU YANG PALING PENTING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog 8.4 menyebut "Profitability Simulation (skenario RAB)". Diukur
 * 2026-08-16:
 *
 *   proyek berjalan       13
 *   punya RAB              2
 *   RAB > nilai kontrak    2   ← KEDUANYA
 *
 * Rumah Bu Sari: kontrak Rp 1.095 juta, RAB Rp 3.630 juta. Tool yang
 * menghitung margin dari RAB melaporkan rugi Rp 2,5 miliar untuk proyek yang
 * tidak rugi — angka salah, disajikan penuh keyakinan, di layar yang dipakai
 * memutuskan.
 *
 * Maka yang dibangun: serapan biaya NYATA terhadap progres. Ketiga sumbernya
 * (`contract_value`, `progress_pct`, uang keluar) terisi untuk seluruh 13.
 *
 * ── Yang dibuktikan
 *
 *   1. RAB TIDAK dipakai — dijaga di sumber, karena datanya menyesatkan
 *   2. uang keluar = pengeluaran disetujui + kasbon disetujui/lunas
 *      (angkanya dihitung ulang lewat SQL terpisah)
 *   3. kontrak nol DIPISAH — pembagiannya akan menghasilkan Infinity
 *   4. diurut selisih, paling mendahului di atas
 *   5. MINUS besar dinyatakan BUKAN kabar baik
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolSerapanBiaya } from '../ai-tool-serapan-biaya.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string

const ctx = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['finance:view']),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT company_id FROM projects WHERE is_deleted = false
     GROUP BY company_id ORDER BY count(*) DESC LIMIT 1`)
  companyId = rows[0].company_id
})

afterAll(async () => {
  await db.end()
})

describe('tool serapan biaya', () => {
  it('terdaftar dengan izin finance:view', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'serapan_biaya')
    expect(t, 'tool `serapan_biaya` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('finance:view')
  })

  it('RAB TIDAK dipakai — datanya menyesatkan, dan itu dijaga di sumber', async () => {
    /*
      Diperiksa di SUMBER, bukan dari keluaran: keluarannya tak menyebut RAB
      apa pun, jadi tak ada yang bisa dibandingkan. Yang dijaga: seseorang
      kelak "melengkapi" tool ini dengan menghitung margin dari `rab_items`,
      dan pada data ini itu menghasilkan rugi miliaran yang tidak nyata.

      Bukti datanya ikut diperiksa di test berikutnya — kalau suatu hari RAB
      jadi wajar, larangan ini pantas ditinjau ulang.
    */
    const src = await (await import('node:fs/promises')).readFile(
      new URL('../ai-tool-serapan-biaya.ts', import.meta.url), 'utf8')
    const kode = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(kode, 'rab_items dibaca — margin dari RAB seed akan salah besar')
      .not.toMatch(/rab_items/)
  })

  it('alasan menolak RAB masih BERLAKU — diukur ulang ke basis', async () => {
    /*
      Larangan yang syaratnya tak pernah diukur ulang akan bertahan sesudah
      penyebabnya hilang, lalu menyesatkan sesi berikutnya (CLAUDE.md §5.5
      mencatat persis pola itu untuk peringatan GL).

      Test ini mengukur syaratnya: kalau kelak RAB tak lagi melebihi kontrak,
      ia MERAH — dan itu isyarat meninjau ulang bentuk toolnya, bukan cacat.
    */
    const { rows } = await db.query(
      `SELECT count(*)::int total,
              count(*) FILTER (WHERE rab > 0)::int punya_rab,
              count(*) FILTER (WHERE rab > contract_value)::int rab_lebih
         FROM (
           SELECT p.contract_value,
                  (SELECT COALESCE(sum(r.total_price),0) FROM rab_items r
                    WHERE r.project_id = p.id AND r.level = 'category') AS rab
             FROM projects p
            WHERE p.company_id = $1 AND p.is_deleted = false
              AND p.status IN ('active','on_hold')
         ) x`, [companyId])

    const { total, punya_rab, rab_lebih } = rows[0]
    // Cakupan RAB masih minoritas, DAN yang punya masih melebihi kontrak.
    // Kalau salah satunya berubah, tinjau ulang keputusan menolak RAB.
    expect(
      punya_rab * 2 <= total || rab_lebih > 0,
      `RAB kini wajar (${punya_rab}/${total} punya, ${rab_lebih} melebihi kontrak) — ` +
        'tinjau ulang keputusan menolak RAB di 8.4',
    ).toBe(true)
  })

  it('uang keluar COCOK dengan basis — dihitung ulang lewat SQL', async () => {
    /*
      Kasbon IKUT. Di lapangan ia sering jadi jalur utama uang keluar, dan
      mengabaikannya membuat proyek yang banyak kasbonnya terlihat paling
      hemat — persis terbalik.
    */
    const { rows } = await db.query(
      `SELECT p.name,
              (SELECT COALESCE(sum(e.total_amount),0) FROM project_expenses e
                WHERE e.project_id = p.id AND e.status = 'approved')
            + (SELECT COALESCE(sum(k.amount),0) FROM kasbons k
                WHERE k.project_id = p.id AND k.status IN ('approved','settled')) AS keluar
         FROM projects p
        WHERE p.company_id = $1 AND p.is_deleted = false
          AND p.status IN ('active','on_hold') AND p.contract_value > 0
        ORDER BY keluar DESC LIMIT 1`, [companyId])
    if (rows.length === 0) return

    const h = await toolSerapanBiaya.jalan(ctx(), {})
    expect(h.isError).toBe(false)

    const baris = h.isi.split('\n').find((l) => l.includes(rows[0].name)) ?? ''
    expect(baris, `proyek '${rows[0].name}' tak muncul`).toBeTruthy()

    const ditulis = Number((/keluar Rp ([\d.]+)/.exec(baris)?.[1] ?? '').replace(/\./g, ''))
    expect(Math.abs(ditulis - Math.round(Number(rows[0].keluar)))).toBeLessThanOrEqual(1)
  })

  it('kontrak NOL dipisah — tak dibagi jadi Infinity', async () => {
    /*
      `Infinity` yang lolos ke kalimat terbaca sebagai angka, dan tak ada yang
      curiga sampai seseorang bertanya kenapa serapannya "tak terhingga".
    */
    const h = await toolSerapanBiaya.jalan(ctx(), {})
    expect(h.isi).not.toMatch(/Infinity|NaN/)

    const { rows } = await db.query(
      `SELECT name FROM projects
        WHERE company_id=$1 AND is_deleted=false AND status IN ('active','on_hold')
          AND (contract_value IS NULL OR contract_value <= 0) LIMIT 3`, [companyId])

    /*
      ── Kalau tak ada proyek berkontrak nol, yang diuji SUMBERNYA ────────────

      Diukur 2026-08-16: 13 proyek berjalan, NOL berkontrak kosong. Mutasi
      sengaja (cabang pemisah dicabut) karena itu tetap HIJAU — datanya tak
      bisa membedakan.

      Assertion `not.toMatch(/Infinity|NaN/)` di atas pun tak menolong: tanpa
      baris berkontrak nol, `Infinity` memang tak akan pernah muncul.

      Membiarkan test yang lolos karena kebetulan tak ada bahannya lebih buruk
      daripada tak punya test. Cabang pemisahnya karena itu diperiksa di kode,
      dan kelemahannya ditulis di sini.
    */
    if (rows.length === 0) {
      const src = await (await import('node:fs/promises')).readFile(
        new URL('../ai-tool-serapan-biaya.ts', import.meta.url), 'utf8')
      expect(
        src,
        'cabang pemisah kontrak nol hilang — pembagiannya akan menghasilkan Infinity',
      ).toMatch(/kontrak <= 0/)
      return
    }

    for (const p of rows as Array<{ name: string }>) {
      const berdeviasi = h.isi.split('\n').filter((l) => /^[+-]\d+ — /.test(l)).join('\n')
      expect(berdeviasi, `proyek tanpa kontrak '${p.name}' ikut dibandingkan`)
        .not.toContain(p.name)
    }
  })

  it('diurut SELISIH — yang paling mendahului di atas', async () => {
    const h = await toolSerapanBiaya.jalan(ctx(), {})
    const selisih = [...h.isi.matchAll(/^([+-]\d+) — /gm)].map((m) => Number(m[1]))
    if (selisih.length < 2) return

    const urut = [...selisih].sort((a, b) => b - a)
    expect(selisih, 'urutan tak menempatkan yang paling mendahului di atas').toEqual(urut)
  })

  it('MINUS besar dinyatakan BUKAN kabar baik', async () => {
    /*
      Serapan 13% pada progres 85% terlihat seperti proyek super-hemat. Hampir
      selalu ia berarti biayanya belum masuk pembukuan — dan memujinya membuat
      orang berhenti mencari yang belum tercatat.
    */
    const h = await toolSerapanBiaya.jalan(ctx(), {})
    expect(h.isi).toMatch(/BUKAN kabar baik/i)
    expect(h.isi).toMatch(/belum\s+masuk pembukuan/i)
  })
})
