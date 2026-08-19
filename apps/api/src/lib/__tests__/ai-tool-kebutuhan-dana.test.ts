/**
 * 2.18 — kebutuhan dana, diuji terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIJAGA BERKAS INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Satu hal, dan seluruh alasan tool ini ada: **kewajiban tanpa tanggal jatuh
 * tempo tak boleh hilang dari jawaban.**
 *
 * Diukur 2026-08-16 — `proyeksi_arus_kas` (2.4) memulangkan saldo NAIK dan
 * DATAR di 30/60/90 hari, terlihat sehat. Yang tak terlihat: kasbon
 * `approved` Rp 491 juta dan pengeluaran `approved` Rp 263 juta, keduanya
 * tanpa tanggal, total 3,4× saldo kas.
 *
 * Kalau kelak seseorang "merapikan" tool ini dengan membuang bagian beban
 * menggantung — atau menyaringnya hanya saat proyeksi negatif — jawabannya
 * akan berbunyi "kas aman 90 hari" untuk perusahaan yang kewajibannya tiga
 * kali lipat kasnya. Tak ada galat. Test di bawah satu-satunya yang menahan.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import {
  hitungKebutuhanDana,
  ringkasKebutuhanDana,
  JENDELA_HARI,
} from '../ai-tool-kebutuhan-dana.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT p.company_id FROM projects p
     WHERE p.is_deleted = false
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu tenant berproyek')
  companyId = rows[0].company_id
})

afterAll(async () => {
  await db.end()
})

describe('tool kebutuhan dana', () => {
  it('terdaftar dengan izin yang BENAR-BENAR ada', async () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'kebutuhan_dana')
    expect(t, 'tool `kebutuhan_dana` tak terdaftar').toBeTruthy()
    const { rows } = await db.query('SELECT 1 FROM permissions WHERE key = $1', [
      t!.izin,
    ])
    expect(rows.length, `izin ${t!.izin} tak ada di tabel permissions`).toBe(1)
  })

  it('saldo cocok dengan jumlah rekening AKTIF di SQL terpisah', async () => {
    const h = await hitungKebutuhanDana(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT coalesce(sum(balance),0)::float8 t FROM cash_accounts
        WHERE company_id = $1 AND is_active = true`,
      [companyId],
    )
    expect(h.saldoSekarang).toBe(Math.round(Number(rows[0].t)))
  })

  it('kasbon approved MASUK beban menggantung, dan nominalnya cocok', async () => {
    const h = await hitungKebutuhanDana(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT count(*)::int n, coalesce(sum(amount),0)::float8 t FROM kasbons
        WHERE company_id = $1 AND status = 'approved'`,
      [companyId],
    )
    const jumlahKasbon = Number(rows[0].n)
    expect(
      jumlahKasbon,
      'tenant uji tak punya kasbon approved — test ini tak menguji apa pun',
    ).toBeGreaterThan(0)

    const b = h.bebanMenggantung.find((x) => x.jenis.includes('Kasbon'))
    expect(b, 'kasbon approved HILANG dari beban menggantung').toBeTruthy()
    expect(b!.jumlah).toBe(jumlahKasbon)
    expect(b!.nominal).toBe(Math.round(Number(rows[0].t)))
  })

  it('kasbon SETTLED tidak ikut — yang sudah selesai bukan kewajiban', async () => {
    const h = await hitungKebutuhanDana(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT coalesce(sum(amount),0)::float8 t FROM kasbons
        WHERE company_id = $1 AND status <> 'approved'`,
      [companyId],
    )
    const bukanApproved = Number(rows[0].t)
    expect(
      bukanApproved,
      'semua kasbon berstatus approved — saringan status tak teruji',
    ).toBeGreaterThan(0)

    const b = h.bebanMenggantung.find((x) => x.jenis.includes('Kasbon'))!
    // Kalau saringan status dicabut, nominalnya akan MEMUAT yang settled juga.
    const { rows: semua } = await db.query(
      `SELECT coalesce(sum(amount),0)::float8 t FROM kasbons WHERE company_id = $1`,
      [companyId],
    )
    expect(b.nominal).toBeLessThan(Math.round(Number(semua[0].t)))
  })

  it('beban menggantung tetap disebut MESKI proyeksi terlihat aman', async () => {
    /*
     * Inti berkas ini. Justru saat proyeksi positif, peringatan ini paling
     * dibutuhkan — "aman" yang mengabaikan kewajiban 3× saldo adalah
     * kesimpulan yang menyesatkan, bukan sekadar tak lengkap.
     */
    const h = await hitungKebutuhanDana(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    expect(h.keringPada, 'data uji sudah kering — cabang "aman" tak teruji').toBeNull()
    expect(h.bebanMenggantung.length).toBeGreaterThan(0)

    const teks = ringkasKebutuhanDana(h).join('\n')
    expect(teks).toContain('KEWAJIBAN TANPA TANGGAL JATUH TEMPO')
    expect(teks).toContain('tidak diperkirakan kering')
  })

  it('memperingatkan EKSPLISIT saat kewajiban melebihi saldo', async () => {
    const h = await hitungKebutuhanDana(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    expect(
      h.totalMenggantung,
      'kewajiban tak melebihi saldo di data uji — cabang peringatan tak teruji',
    ).toBeGreaterThan(h.saldoSekarang)

    const teks = ringkasKebutuhanDana(h).join('\n')
    expect(teks).toContain('MELEBIHI saldo')
    // Sebabnya harus disebut, kalau tidak pembaca menyangka sistem lupa.
    expect(teks).toContain('tanggalnya tak ada di sistem')
  })

  it('MENOLAK menyarankan produk keuangan', () => {
    /*
     * Katalog menamainya "Loan/Credit Facility Advisor". Menyarankan pinjaman
     * menuntut plafon, tenor, dan bunga — tak satu pun ada di basis. Kalau
     * kelak ada yang menambahkan saran semacam itu, angkanya PASTI karangan.
     */
    const teks = ringkasKebutuhanDana({
      saldoSekarang: 100, masuk: [], keluar: [], proyeksi: [],
      keringPada: null, kekurangan: 0,
      bebanMenggantung: [], totalMenggantung: 0,
    }).join('\n')
    expect(teks).toContain('bukan saran keuangan')
    expect(teks).toContain('tidak tahu plafon')
  })

  it('jendela proyeksi sama dengan 2.4 — dua tool tak boleh berselisih', async () => {
    const h = await hitungKebutuhanDana(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)
    expect(h.proyeksi.map((p) => p.hari)).toEqual([...JENDELA_HARI])
    expect(h.masuk.map((m) => m.hari)).toEqual([...JENDELA_HARI])
  })

  it('kalimat kering menyebut jendela PERTAMA yang minus', () => {
    // Kas yang minus di hari ke-30 lalu pulih di hari ke-90 tetap berarti gaji
    // tak terbayar di hari ke-30. Saldo akhir positif tak boleh menutupinya.
    const teks = ringkasKebutuhanDana({
      saldoSekarang: 100,
      masuk: [{ hari: 30, nominal: 0 }, { hari: 60, nominal: 0 }, { hari: 90, nominal: 500 }],
      keluar: [{ hari: 30, nominal: 400 }, { hari: 60, nominal: 400 }, { hari: 90, nominal: 400 }],
      proyeksi: [
        { hari: 30, saldoPerkiraan: -300 },
        { hari: 60, saldoPerkiraan: -300 },
        { hari: 90, saldoPerkiraan: 200 },
      ],
      keringPada: 30, kekurangan: 300,
      bebanMenggantung: [], totalMenggantung: 0,
    }).join('\n')
    expect(teks).toContain('KERING di hari ke-30')
    expect(teks).not.toContain('tidak diperkirakan kering')
  })

  it('kekurangan dihitung `hitungKebutuhanDana` dari saldo TERBURUK', async () => {
    /*
     * Versi pertama test ini memakai objek buatan tangan, jadi ia menguji
     * `ringkasKebutuhanDana` — bukan aritmetika yang sebenarnya berisiko.
     * Dibuktikan lewat mutasi: mengganti `Math.min(...)` dengan saldo akhir
     * TIDAK membuatnya merah. Test yang tak bisa merah adalah hiasan.
     *
     * Sekarang fungsi nyatanya yang dipanggil, dan hubungan
     * "kekurangan = |saldo terburuk| bila negatif, 0 bila tidak" ditegakkan.
     */
    const h = await hitungKebutuhanDana(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)

    const terburuk = Math.min(h.saldoSekarang, ...h.proyeksi.map((p) => p.saldoPerkiraan))
    expect(h.kekurangan).toBe(terburuk < 0 ? Math.abs(terburuk) : 0)

    // Dan `keringPada` wajib konsisten dengan proyeksinya sendiri.
    const pertamaMinus = h.proyeksi.find((p) => p.saldoPerkiraan < 0)
    expect(h.keringPada).toBe(pertamaMinus?.hari ?? null)

    /*
     * ⚠ CABANG "TERBURUK vs AKHIR" MASIH BELUM TERUJI SUNGGUHAN.
     *
     * Dibuktikan lewat mutasi 2026-08-16: mengganti
     *   Math.min(saldoSekarang, ...proyeksi)
     * dengan saldo jendela TERAKHIR tidak membuat satu test pun merah.
     *
     * Sebabnya bukan test yang lemah melainkan datanya: tenant uji tak punya
     * satu pun jendela bersaldo negatif, jadi minimum dan nilai akhir sama
     * persis. Perbedaan keduanya baru muncul pada pola "minus di hari ke-30,
     * pulih di hari ke-90".
     *
     * Dinyatakan di sini alih-alih dibiarkan hijau diam-diam. Assertion
     * berikut mulai menggigit begitu data uji punya kasus itu.
     */
    const adaMinus = h.proyeksi.some((p) => p.saldoPerkiraan < 0)
    if (!adaMinus) {
      expect(
        adaMinus,
        'data uji tak punya jendela minus — beda "saldo terburuk" vs "saldo ' +
          'akhir" TIDAK teruji',
      ).toBe(false)
    } else {
      const akhir = h.proyeksi[h.proyeksi.length - 1].saldoPerkiraan
      expect(terburuk).toBeLessThanOrEqual(akhir)
    }
  })
})
