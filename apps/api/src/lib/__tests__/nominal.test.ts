import { describe, it, expect } from 'vitest'
import { bacaNominal, bulatkanRupiah } from '../nominal.js'

/**
 * NOMINAL — satu pintu masuk untuk angka uang & kuantitas.
 *
 * Cacat yang melahirkannya sudah dibuktikan, bukan dibayangkan (2026-08-08):
 * `qty: "abc"` → NaN → lolos cek saldo → diterima Postgres numeric → SUM
 * seluruh laporan jadi NaN. Test di berkas ini mengunci tiap langkah rantai
 * itu supaya tak bisa terbuka lagi.
 */

const sah = (h: ReturnType<typeof bacaNominal>) => {
  expect(h.ok).toBe(true)
  return h.ok ? h.nilai : NaN
}

describe('bacaNominal — NaN & Infinity', () => {
  // INVARIAN 1 — seluruh alasan modul ini ada.
  it('menolak teks yang bukan angka', () => {
    const h = bacaNominal('abc', { nama: 'qty' })
    expect(h.ok).toBe(false)
    if (!h.ok) {
      expect(h.alasan).toMatch(/harus angka/i)
      // Pesannya menyebut nilai yang dikirim — yang menerimanya perlu tahu
      // apa yang salah, bukan sekadar bahwa ada yang salah.
      expect(h.alasan).toContain('abc')
    }
  })

  it('menolak NaN yang dikirim sebagai angka', () => {
    expect(bacaNominal(NaN, { nama: 'total' }).ok).toBe(false)
  })

  // INVARIAN 2: `parseFloat('Infinity')` mengembalikannya, dan Postgres
  // numeric menerimanya sama seperti NaN.
  it('menolak Infinity dan -Infinity', () => {
    expect(bacaNominal(Infinity, { nama: 'total' }).ok).toBe(false)
    expect(bacaNominal(-Infinity, { nama: 'total' }).ok).toBe(false)
    expect(bacaNominal('Infinity', { nama: 'total' }).ok).toBe(false)
  })

  // INVARIAN 3: `parseFloat('12abc')` = 12 — ia membaca sejauh yang bisa lalu
  // berhenti diam-diam, jadi salah ketik menjadi angka yang salah.
  it('menolak angka yang diikuti teks, tidak membacanya separuh', () => {
    const h = bacaNominal('12abc', { nama: 'qty' })
    expect(h.ok).toBe(false)
    // Pembanding langsung dengan perilaku yang sedang digantikan.
    expect(parseFloat('12abc')).toBe(12)
  })

  it('menolak boolean — true bukan 1', () => {
    expect(bacaNominal(true, { nama: 'qty' }).ok).toBe(false)
  })
})

describe('bacaNominal — kosong & bawaan', () => {
  // INVARIAN 4: `Number('   ')` = 0, dan spasi tak sengaja jadi transaksi
  // bernilai nol yang terlihat sah.
  it('menolak string kosong dan spasi, tidak menganggapnya nol', () => {
    expect(bacaNominal('', { nama: 'qty' }).ok).toBe(false)
    expect(bacaNominal('   ', { nama: 'qty' }).ok).toBe(false)
    expect(Number('   ')).toBe(0)
  })

  it('memakai bawaan bila field tak dikirim', () => {
    expect(sah(bacaNominal(undefined, { nama: 'qty', bawaan: 1 }))).toBe(1)
    expect(sah(bacaNominal(null, { nama: 'qty', bawaan: 1 }))).toBe(1)
    expect(sah(bacaNominal('', { nama: 'qty', bawaan: 1 }))).toBe(1)
  })

  it('tanpa bawaan, field yang tak dikirim ditolak', () => {
    const h = bacaNominal(undefined, { nama: 'unit_price' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toMatch(/wajib diisi/i)
  })

  // Bawaan TIDAK dipakai untuk nilai yang salah — hanya untuk yang tak ada.
  it('bawaan tidak menutupi nilai yang cacat', () => {
    expect(bacaNominal('abc', { nama: 'qty', bawaan: 1 }).ok).toBe(false)
  })
})

describe('bacaNominal — tanda & batas', () => {
  // INVARIAN 5.
  it('menolak negatif secara default', () => {
    const h = bacaNominal(-5, { nama: 'unit_price' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toMatch(/negatif/i)
  })

  it('mengizinkan negatif bila diminta', () => {
    expect(sah(bacaNominal(-5, { nama: 'penyesuaian', bolehNegatif: true }))).toBe(-5)
  })

  it('menolak nol bila bolehNol=false', () => {
    expect(bacaNominal(0, { nama: 'qty', bolehNol: false }).ok).toBe(false)
    expect(sah(bacaNominal(0, { nama: 'potongan' }))).toBe(0)
  })

  // INVARIAN 6: salah ketik nol beruntun lebih sering daripada transaksi
  // seharga triliunan.
  it('menolak nilai di luar batas wajar, dan menyarankan periksa nol-nya', () => {
    const h = bacaNominal(1e16, { nama: 'total' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toMatch(/nol/i)
  })

  it('menghormati batas khusus, mis. persentase', () => {
    expect(bacaNominal(150, { nama: 'persen', maks: 100 }).ok).toBe(false)
    expect(sah(bacaNominal(100, { nama: 'persen', maks: 100 }))).toBe(100)
  })
})

describe('bacaNominal — nilai sah lewat apa adanya', () => {
  // INVARIAN 7: pembulatan adalah keputusan tersendiri.
  it('tidak membulatkan masukan', () => {
    expect(sah(bacaNominal(1234.5678, { nama: 'harga' }))).toBe(1234.5678)
    expect(sah(bacaNominal('1234.5678', { nama: 'harga' }))).toBe(1234.5678)
  })

  it('menerima angka maupun string yang setara', () => {
    expect(sah(bacaNominal(100, { nama: 'x' }))).toBe(100)
    expect(sah(bacaNominal('100', { nama: 'x' }))).toBe(100)
    expect(sah(bacaNominal('1e3', { nama: 'x' }))).toBe(1000)
  })
})

describe('bulatkanRupiah', () => {
  it('membulatkan ke 2 desimal', () => {
    expect(sah(bulatkanRupiah(1234.5678))).toBe(1234.57)
    expect(sah(bulatkanRupiah(0.005))).toBe(0.01)
  })

  // Kesalahan pembulatan biner: `(1.005).toFixed(2)` menghasilkan "1.00",
  // bukan "1.01", karena 1.005 tersimpan sedikit di bawah nilainya.
  it('membulatkan 1.005 ke atas, bukan ke bawah seperti toFixed', () => {
    expect(sah(bulatkanRupiah(1.005))).toBe(1.01)
    expect((1.005).toFixed(2)).toBe('1.00')
  })

  // Dua angka yang SAH bisa menghasilkan Infinity saat dikalikan — dan
  // Infinity yang lolos ke sini akan tersimpan ke basis.
  it('menolak hasil yang bukan angka sah', () => {
    expect(bulatkanRupiah(NaN).ok).toBe(false)
    expect(bulatkanRupiah(Infinity).ok).toBe(false)
  })

  it('menolak hasil di luar batas wajar', () => {
    expect(bulatkanRupiah(1e16).ok).toBe(false)
  })

  it('nol tetap nol', () => {
    expect(sah(bulatkanRupiah(0))).toBe(0)
  })
})

describe('rantai cacat yang melahirkan modul ini — kini tertutup', () => {
  it('qty "abc" × harga sah tidak pernah menghasilkan NaN yang lolos', () => {
    const q = bacaNominal('abc', { nama: 'qty', bawaan: 1, bolehNol: false })
    expect(q.ok).toBe(false)

    // Perilaku LAMA, didokumentasikan sebagai pembanding: NaN lolos cek saldo
    // karena setiap perbandingan dengan NaN bernilai false.
    const lama = parseFloat('abc') * 100
    expect(Number.isNaN(lama)).toBe(true)
    expect(0 < lama).toBe(false)
  })
})
