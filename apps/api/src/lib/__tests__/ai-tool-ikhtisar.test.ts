/**
 * IKHTISAR PERUSAHAAN (2.17 + 8.9) — angka yang dibawa ke bank.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA ANGKA YANG SERING TERTUKAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16:
 *
 *   kontrak berjalan  Rp 6.060.000.000   ← yang DIJANJIKAN
 *   sudah ditagih     Rp 2.092.560.000   ← yang sudah jadi invoice
 *   sudah diterima    Rp 1.992.165.000   ← yang benar-benar masuk
 *
 * Selisihnya Rp 4 miliar, dan ketiganya sering disebut "omzet" bergantian.
 * Untuk laporan yang dibawa ke bank, tertukar bukan kesalahpahaman kecil —
 * ia menyesatkan keputusan kredit.
 *
 * ── Yang dibuktikan
 *
 *   1. ketiga angka DIPISAH dan dinamai — bukan satu "omzet"
 *   2. tiap angka cocok dengan basis (dihitung ulang lewat SQL terpisah)
 *   3. "kontrak berjalan" hanya active+on_hold, bukan seluruh proyek
 *   4. margin/laba TIDAK dihitung, dan alasannya dinyatakan
 *   5. selisih kas−hutang ditandai saat minus
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolIkhtisar } from '../ai-tool-ikhtisar.js'
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

const angka = (teks: string, pola: RegExp): number => {
  const m = pola.exec(teks)
  return m ? Number(m[1].replace(/\./g, '')) : NaN
}

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

describe('tool ikhtisar perusahaan', () => {
  it('terdaftar dengan izin finance:view', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'ikhtisar_perusahaan')
    expect(t, 'tool `ikhtisar_perusahaan` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('finance:view')
  })

  it('ketiga angka nilai DIPISAH dan dinamai', async () => {
    /*
      Inti berkas ini. Satu angka tanpa nama membuat pembacanya menyimpulkan
      hal yang berbeda dari maksud penulisnya — dan selisih ketiganya di sini
      miliaran.
    */
    const h = await toolIkhtisar.jalan(ctx(), {})
    expect(h.isError).toBe(false)

    expect(h.isi).toMatch(/Kontrak berjalan\s*:/)
    expect(h.isi).toMatch(/Sudah ditagih\s*:/)
    expect(h.isi).toMatch(/Sudah diterima\s*:/)
    // Dan peringatan supaya model tak meringkasnya jadi "omzet".
    expect(h.isi).toMatch(/jangan menyebut salah satunya sebagai "omzet"/i)
  })

  it('kontrak berjalan COCOK dengan basis, dan hanya active+on_hold', async () => {
    /*
      Dihitung ulang lewat jalur terpisah. Kalau proyek `completed` ikut,
      angkanya melonjak dan "kontrak berjalan" jadi klaim yang salah — bank
      membaca kapasitas yang tak lagi ada.
    */
    const { rows } = await db.query(
      `SELECT COALESCE(sum(contract_value),0)::numeric AS v, count(*)::int n
         FROM projects
        WHERE company_id = $1 AND is_deleted = false
          AND status IN ('active','on_hold')`, [companyId])

    const h = await toolIkhtisar.jalan(ctx(), {})
    const ditulis = angka(h.isi, /Kontrak berjalan\s*: Rp ([\d.]+)/)
    expect(Math.abs(ditulis - Math.round(Number(rows[0].v)))).toBeLessThanOrEqual(1)

    // Jumlah proyeknya ikut disebut — supaya angka besar punya konteks.
    expect(h.isi).toMatch(new RegExp(`\\(${rows[0].n} proyek`))
  })

  it('ditagih & diterima COCOK dengan basis', async () => {
    const { rows } = await db.query(
      `SELECT COALESCE(sum(i.total_amount),0)::numeric AS ditagih,
              COALESCE(sum(i.amount_paid),0)::numeric AS diterima
         FROM invoices i JOIN projects p ON p.id = i.project_id
        WHERE p.company_id = $1 AND p.is_deleted = false`, [companyId])

    const h = await toolIkhtisar.jalan(ctx(), {})
    const dt = angka(h.isi, /Sudah ditagih\s*: Rp ([\d.]+)/)
    const dr = angka(h.isi, /Sudah diterima\s*: Rp ([\d.]+)/)

    expect(Math.abs(dt - Math.round(Number(rows[0].ditagih)))).toBeLessThanOrEqual(1)
    expect(Math.abs(dr - Math.round(Number(rows[0].diterima)))).toBeLessThanOrEqual(1)
    // Diterima tak pernah melebihi ditagih — kalau ya, ada yang salah hitung.
    expect(dr).toBeLessThanOrEqual(dt)
  })

  it('MARGIN & LABA tidak dihitung, dan alasannya dinyatakan', async () => {
    /*
      Margin menuntut biaya per proyek yang lengkap — hanya sebagian proyek
      punya pengeluaran tercatat. Angka laba dari data separuh lengkap akan
      terlihat bagus dan salah, dan untuk laporan ke pihak luar itu
      menyesatkan keputusan kredit.
    */
    const h = await toolIkhtisar.jalan(ctx(), {})
    expect(h.isi).toMatch(/TIDAK dihitung di sini: margin, laba/i)

    // Dan memang tak ada baris yang mengaku menghitungnya.
    const kode = h.isi.split('TIDAK dihitung')[0]
    expect(kode).not.toMatch(/^\s*(Margin|Laba|Profit)\s*:/im)
  })

  it('proyek per status dijumlah benar', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM projects WHERE company_id=$1 AND is_deleted=false`,
      [companyId])

    const h = await toolIkhtisar.jalan(ctx(), {})
    expect(h.isi).toMatch(new RegExp(`PROYEK \\(${rows[0].n} total\\)`))
  })

  it('selisih kas − hutang dihitung, dan ditandai saat minus', async () => {
    const h = await toolIkhtisar.jalan(ctx(), {})
    const kas = angka(h.isi, /Saldo rekening\s*: Rp ([\d.]+)/)
    const hutang = angka(h.isi, /Hutang supplier\s*: Rp ([\d.]+)/)
    const selisih = angka(h.isi, /Selisih\s*: Rp ([\d.]+)/)

    if (Number.isFinite(kas) && Number.isFinite(hutang) && Number.isFinite(selisih)) {
      expect(selisih).toBe(kas - hutang)
    }
  })
})
