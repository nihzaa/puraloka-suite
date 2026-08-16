/**
 * PROYEKSI ARUS KAS (2.4) & PRIORITAS BAYAR (8.3).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ANGKA YANG MEMBUAT ORANG MEMUTUSKAN MEMINJAM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Kas bulan depan cukup tidak" adalah pertanyaan yang jawabannya menentukan
 * apakah gaji terbayar. Angka yang terlalu optimis di sini tak menghasilkan
 * galat — ia menghasilkan keputusan yang salah, berbulan kemudian.
 *
 * Dua cara gagal yang paling mahal:
 *
 * 1. **Termin dijumlahkan ke proyeksi.** `termin_schedules` yang `pending`
 *    baru JADWAL TAGIH — belum ditagih, apalagi dibayar. Diukur: Rp 1,08 M.
 *    Menjumlahkannya membuat kas terlihat 5× lebih sehat daripada kenyataan.
 *
 * 2. **Yang lewat tempo dibuang.** Invoice yang sudah 70 hari lewat adalah
 *    uang yang SEHARUSNYA sudah ada. Mengeluarkannya dari proyeksi membuat
 *    kas terlihat lebih sehat — arah kesalahan yang paling berbahaya.
 *
 * ── Yang dibuktikan
 *
 *   1. saldo cocok dengan basis (dihitung ulang lewat SQL terpisah)
 *   2. termin TIDAK ikut ke angka proyeksi utama
 *   3. yang lewat tempo IKUT dihitung dan disebut
 *   4. keterbatasannya dinyatakan — bukan disebut "ramalan"
 *   5. prioritas bayar diurut jatuh tempo, bukan nominal
 *   6. keputusannya diserahkan ke manusia secara eksplisit
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolArusKas, toolPrioritasBayar } from '../ai-tool-arus-kas.js'
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

/** Angka rupiah di keluaran → number. "Rp 222.475.000" → 222475000 */
const angkaDari = (teks: string, pola: RegExp): number => {
  const m = pola.exec(teks)
  return m ? Number(m[1].replace(/\./g, '')) : NaN
}

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT company_id FROM cash_accounts
     WHERE is_active IS DISTINCT FROM false
     GROUP BY company_id ORDER BY count(*) DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu tenant ber-rekening kas')
  companyId = rows[0].company_id
})

afterAll(async () => {
  await db.end()
})

describe('proyeksi arus kas (2.4)', () => {
  it('terdaftar dengan izin finance:view', () => {
    // Arus kas adalah data uang paling terbuka di sistem — siapa pun yang
    // melihatnya tahu perusahaan sedang sehat atau sekarat.
    const t = KATALOG_TOOL.find((x) => x.nama === 'proyeksi_arus_kas')
    expect(t, 'tool `proyeksi_arus_kas` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('finance:view')
  })

  it('saldo COCOK dengan basis — dihitung ulang lewat SQL terpisah', async () => {
    /*
      Dihitung ulang lewat jalur yang sepenuhnya terpisah dari kode yang
      diuji. Membandingkan hasil dengan dirinya sendiri tak membuktikan apa pun.
    */
    const { rows } = await db.query(
      `SELECT COALESCE(sum(balance),0)::numeric AS total FROM cash_accounts
        WHERE company_id = $1 AND is_active IS DISTINCT FROM false`, [companyId])

    const h = await toolArusKas.jalan(ctx(), {})
    expect(h.isError).toBe(false)

    const ditulis = angkaDari(h.isi, /Saldo kas sekarang: Rp ([\d.]+)/)
    expect(Math.abs(ditulis - Math.round(Number(rows[0].total)))).toBeLessThanOrEqual(1)
  })

  it('TERMIN tidak ikut ke angka proyeksi utama', async () => {
    /*
      Inti berkas ini. Termin `pending` baru jadwal tagih — diukur Rp 1,08 M.
      Kalau ia dijumlahkan, kas terlihat 5× lebih sehat daripada kenyataan.
    */
    const { rows: t } = await db.query(
      `SELECT COALESCE(sum(ts.amount),0)::numeric AS v
         FROM termin_schedules ts JOIN projects p ON p.id = ts.project_id
        WHERE p.company_id = $1 AND ts.status = 'pending'`, [companyId])
    const totalTermin = Number(t[0].v)
    if (totalTermin <= 0) return // tenant tanpa termin pending

    const h = await toolArusKas.jalan(ctx(), {})

    // Termin DISEBUT — tetapi terpisah, dengan kata "BELUM ditagih".
    expect(h.isi).toMatch(/termin yang BELUM ditagih/i)

    /*
      ── Dibandingkan dengan PERSAMAANNYA, bukan dengan ambang longgar ────────

      Percobaan pertama memakai `|proyeksi − saldo| < totalTermin`. Itu HIJAU
      bahkan sesudah termin sengaja dijumlahkan — karena termin yang jatuh di
      jendela 30 hari (Rp 477 jt) lebih kecil daripada TOTAL termin (Rp 1,08 M),
      jadi ambangnya tak pernah tersentuh. Assertion-nya tak menguji apa pun.

      Sekarang persamaannya diuji utuh: proyeksi HARUS sama persis dengan
      `saldo + masuk − keluar`. Satu rupiah tambahan dari termin membuatnya
      merah.
    */
    const saldo = angkaDari(h.isi, /Saldo kas sekarang: Rp ([\d.]+)/)
    const masuk30 = angkaDari(h.isi, /30 hari: masuk dari invoice Rp ([\d.]+)/)
    const keluar30 = angkaDari(h.isi, /30 hari:.*?keluar Rp ([\d.]+)/)
    const proyeksi30 = angkaDari(h.isi, /30 hari:.*?perkiraan saldo Rp ([\d.]+)/)

    expect(Number.isFinite(proyeksi30)).toBe(true)
    expect(
      proyeksi30,
      'proyeksi ≠ saldo + masuk − keluar; ada yang ikut terjumlah (termin?)',
    ).toBe(saldo + masuk30 - keluar30)
  })

  it('yang LEWAT TEMPO ikut dihitung, tidak dibuang', async () => {
    // Invoice 70 hari lewat adalah uang yang SEHARUSNYA sudah ada.
    // Membuangnya membuat kas terlihat lebih sehat daripada kenyataannya.
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM invoices i JOIN projects p ON p.id = i.project_id
        WHERE p.company_id = $1 AND i.status <> 'paid' AND i.due_date < CURRENT_DATE`,
      [companyId])
    if (rows[0].n === 0) return

    const h = await toolArusKas.jalan(ctx(), {})
    expect(h.isi).toMatch(/LEWAT TEMPO/i)
    expect(h.isi).toMatch(/hari lewat/i)
  })

  it('menyatakan KETERBATASANNYA, bukan disebut ramalan', async () => {
    /*
      Angka yang disebut "proyeksi kas" tanpa keterangan akan dipakai untuk
      memutuskan meminjam. Yang membacanya harus tahu di mana ia boleh
      bersandar.
    */
    const h = await toolArusKas.jalan(ctx(), {})
    expect(h.isi).toMatch(/yang TIDAK/i)
    expect(h.isi).toMatch(/bukan ramalan/i)
  })
})

describe('prioritas bayar (8.3)', () => {
  it('terdaftar dengan izin finance:view', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'prioritas_bayar')
    expect(t, 'tool `prioritas_bayar` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('finance:view')
  })

  it('diurut JATUH TEMPO, bukan nominal', async () => {
    /*
      Nominal besar yang belum jatuh tempo tak mendesak; nominal kecil yang
      sudah 96 hari lewat adalah hubungan dagang yang sedang rusak.
    */
    const h = await toolPrioritasBayar.jalan(ctx(), {})
    if (h.isError) return

    const lewat = [...h.isi.matchAll(/\((\d+) hari LEWAT\)/g)].map((m) => Number(m[1]))
    if (lewat.length >= 2) {
      // Yang paling lama lewat harus di ATAS.
      const urut = [...lewat].sort((a, b) => b - a)
      expect(lewat, 'urutan tak menempatkan yang terlama lewat di atas').toEqual(urut)
    }
  })

  it('menyerahkan keputusan ke MANUSIA secara eksplisit', async () => {
    // Urutan bayar menyentuh hubungan dagang — supplier yang selalu dibayar
    // terakhir akan menaikkan harga, dan itu tak terbaca dari `due_date`.
    const h = await toolPrioritasBayar.jalan(ctx(), {})
    if (h.isError) return
    expect(h.isi).toMatch(/bukan keputusan/i)
    expect(h.isi).toMatch(/di tangan pengguna/i)
  })

  it('menyatakan saat kas TIDAK menutup semuanya', async () => {
    const h = await toolPrioritasBayar.jalan(ctx(), {})
    if (h.isError) return
    // Salah satu dari dua kalimat harus ada — keduanya menyatakan keadaan
    // apa adanya, bukan menyembunyikan kekurangan.
    expect(h.isi).toMatch(/kas (TIDAK menutup|menutup seluruh)/i)
  })
})
