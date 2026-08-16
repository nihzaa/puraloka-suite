/**
 * SIMULASI KAS (8.1) — dan nominal yang datang dari KALIMAT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA TOOL YANG ANGKANYA BUKAN DARI BASIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tool lain membaca angka dari tabel. Yang ini menerimanya dari kalimat, lewat
 * model — dan model bisa salah dengar "lima puluh juta" untuk "lima juta".
 *
 * Angka yang salah di sini menghasilkan kesimpulan "aman" untuk keputusan yang
 * sebenarnya menguras kas. Tak ada galat, tak ada gejala; yang keliru cuma
 * keputusannya, berminggu kemudian.
 *
 * ── Yang dibuktikan
 *
 *   1. saldo & sisa COCOK dengan basis (dihitung ulang lewat SQL terpisah)
 *   2. nominal DISEBUT KEMBALI di jawaban — supaya salah dengar ketahuan
 *   3. nominal tak masuk akal DITOLAK, bukan dihitung serius
 *   4. kewajiban LEWAT TEMPO ikut dihitung, tidak dibuang
 *   5. menyatakan tidak menyimpan apa pun
 *   6. nol / negatif / bukan angka ditolak
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolSimulasiKas } from '../ai-tool-simulasi-kas.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string
let saldoBasis: number

const ctx = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['finance:view']),
  }) as never

const rupiahKe = (teks: string, pola: RegExp): number => {
  const m = pola.exec(teks)
  return m ? Number(m[1].replace(/\./g, '')) : NaN
}

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT company_id, sum(balance)::numeric AS saldo FROM cash_accounts
     WHERE is_active IS DISTINCT FROM false
     GROUP BY company_id ORDER BY count(*) DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu tenant ber-rekening kas')
  companyId = rows[0].company_id
  saldoBasis = Number(rows[0].saldo)
})

afterAll(async () => {
  await db.end()
})

describe('tool simulasi kas', () => {
  it('terdaftar dengan izin finance:view', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'simulasi_kas')
    expect(t, 'tool `simulasi_kas` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('finance:view')
  })

  it('saldo & sisa COCOK dengan basis', async () => {
    /*
      Dihitung ulang lewat jalur terpisah. Kalau saldonya diambil dari sumber
      berbeda dengan 2.4, dua tool akan menyebut angka berbeda untuk hal yang
      sama — dan yang membacanya tak tahu mana yang benar.
    */
    const nominal = 1_000_000
    const h = await toolSimulasiKas.jalan(ctx(), { nominal })
    expect(h.isError).toBe(false)

    const saldo = rupiahKe(h.isi, /Saldo sekarang\s*: Rp ([\d.]+)/)
    const sisa = rupiahKe(h.isi, /Sesudah keluar\s*: Rp ([\d.]+)/)

    expect(Math.abs(saldo - Math.round(saldoBasis))).toBeLessThanOrEqual(1)
    expect(sisa).toBe(saldo - nominal)
  })

  it('nominal DISEBUT KEMBALI — salah dengar ketahuan sebelum diputuskan', async () => {
    /*
      Inti berkas ini. Model bisa salah dengar; yang menahan bukan validasi
      melainkan mata pengguna yang melihat angkanya tertulis.
    */
    const h = await toolSimulasiKas.jalan(ctx(), { nominal: 50_000_000 })
    expect(h.isi).toMatch(/Rp 50\.000\.000/)
    expect(h.isi).toMatch(/pastikan ini yang Anda maksud/i)
  })

  it('nominal TAK MASUK AKAL ditolak, bukan dihitung serius', async () => {
    /*
      Menghitungnya membuat salah ketik nol terlihat seperti hasil sah — dan
      yang membacanya menyimpulkan kasnya jauh lebih buruk daripada kenyataan.
    */
    const h = await toolSimulasiKas.jalan(ctx(), { nominal: 9e14 })
    expect(h.isError).toBe(true)
    expect(h.isi).toMatch(/tak masuk akal/i)
    // Dan TIDAK menyebut sisa saldo apa pun.
    expect(h.isi).not.toMatch(/Sesudah keluar/)
  })

  it('nol, negatif, dan bukan-angka ditolak', async () => {
    for (const n of [0, -5_000_000, NaN, 'banyak' as unknown as number]) {
      const h = await toolSimulasiKas.jalan(ctx(), { nominal: n })
      expect(h.isError, `nominal ${String(n)} seharusnya ditolak`).toBe(true)
    }
  })

  it('kewajiban LEWAT TEMPO ikut dihitung', async () => {
    /*
      Yang lewat tempo paling mengikat — ia kewajiban yang seharusnya sudah
      dibayar. Membuangnya membuat sisa kas terlihat lebih longgar daripada
      kenyataannya.
    */
    const { rows } = await db.query(
      `SELECT COALESCE(sum(amount_due),0)::numeric AS v, count(*)::int n
         FROM supplier_invoices
        WHERE company_id = $1 AND status <> 'paid'
          AND due_date IS NOT NULL AND due_date <= CURRENT_DATE + 30`, [companyId])
    if (rows[0].n === 0) return

    const h = await toolSimulasiKas.jalan(ctx(), { nominal: 1_000_000 })
    const ditulis = rupiahKe(h.isi, /Kewajiban 30 hari\s*: Rp ([\d.]+)/)
    expect(Math.abs(ditulis - Math.round(Number(rows[0].v)))).toBeLessThanOrEqual(1)
  })

  it('menyatakan TIDAK menyimpan apa pun', async () => {
    // Simulasi adalah pertanyaan, bukan tindakan. Pengguna yang mengira ia
    // sudah membayar akan berhenti menagih dirinya sendiri.
    const h = await toolSimulasiKas.jalan(ctx(), { nominal: 1_000_000 })
    expect(h.isi).toMatch(/tidak ada yang tersimpan/i)
    expect(h.isi).toMatch(/bukan pembayaran/i)
  })

  it('menyatakan apa yang TIDAK ikut dihitung', async () => {
    // Sisa kas yang disebut tanpa keterangan akan dipakai seolah ia seluruh
    // gambaran — padahal gaji dan biaya rutin tak ada di dalamnya.
    const h = await toolSimulasiKas.jalan(ctx(), { nominal: 1_000_000 })
    expect(h.isi).toMatch(/TIDAK termasuk/i)
  })
})
