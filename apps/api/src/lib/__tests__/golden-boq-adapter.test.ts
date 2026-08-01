import { describe, it, expect } from 'vitest'
import {
  bacaBoQ, bacaRentangSubtotal, periksaKonsistensi, TOLERANSI_RP,
  type BarisExcel,
} from '../golden-boq-adapter'

// Adapter ini membaca RAB Excel senilai MILIARAN dan membandingkannya dengan
// hitungan sistem. Kalau pembacaannya salah, hasilnya bukan "test gagal" —
// melainkan tuduhan bahwa Excel yang keliru. Uji paritas yang menuduh sumbernya
// salah lebih berbahaya daripada tak ada uji sama sekali: ia melatih orang
// mengabaikan hasilnya, dan saat cacat SUNGGUHAN muncul, tak ada yang percaya.
//
// Tiap kasus di bawah lahir dari RAB Cibuluh Rp 3,63 M — bukan dikarang.

/** Bangun baris sesuai peta kolom nyata (nomor=0, uraian=2, vol=13, sat=14, hs=15, jml=16). */
const baris = (o: Partial<{ nomor: string | number; uraian: string; vol: number; sat: string; hs: number; jml: number; label: string }>): BarisExcel => {
  const r: BarisExcel = new Array(17).fill(null)
  if (o.nomor !== undefined) r[0] = o.nomor
  if (o.uraian !== undefined) r[2] = o.uraian
  if (o.vol !== undefined) r[13] = o.vol
  if (o.sat !== undefined) r[14] = o.sat
  if (o.hs !== undefined) r[15] = o.hs
  if (o.label !== undefined) r[15] = o.label
  if (o.jml !== undefined) r[16] = o.jml
  return r
}

describe('mengenali struktur RAB nyata', () => {
  it('divisi romawi BERTITIK maupun TANPA titik', () => {
    // RAB Cibuluh punya `IX` dan `XIV` tanpa titik — pola yang menuntut titik
    // akan kehilangan dua divisi utuh.
    const rows = [
      baris({ nomor: 'I.', uraian: 'PEKERJAAN PERSIAPAN' }),
      baris({ nomor: 1, uraian: 'Bouwplank', vol: 2, hs: 100, jml: 200 }),
      baris({ label: 'Sub Total   Rp.', jml: 200 }),
      baris({ nomor: 'IX', uraian: 'PEKERJAAN CAT' }),
      baris({ nomor: 1, uraian: 'Cat dinding', vol: 3, hs: 100, jml: 300 }),
      baris({ label: 'Sub Total   Rp.', jml: 300 }),
    ]
    const h = bacaBoQ(rows)
    expect(h.divisi.map((d) => d.kode)).toEqual(['I', 'IX'])
  })

  it('huruf "C" adalah SUB-KELOMPOK, bukan romawi 100', () => {
    // Cacat nyata: `[IVXLC]+` menerima "C" sebagai divisi. Akibatnya subtotal
    // divisi III terbaca Rp 0 sementara "C. Kolom dan Balok" mengklaim
    // Rp 1,15 M yang bukan miliknya — selisih Rp 550 juta.
    const rows = [
      baris({ nomor: 'III.', uraian: 'PEKERJAAN BETON' }),
      baris({ nomor: 'C', uraian: 'Kolom dan Balok' }),
      baris({ nomor: 1, uraian: 'Pedestal', vol: 1, hs: 500, jml: 500 }),
      baris({ label: 'Sub Total   Rp.', jml: 500 }),
    ]
    const h = bacaBoQ(rows)
    expect(h.divisi).toHaveLength(1)
    expect(h.divisi[0].kode).toBe('III')
    expect(h.divisi[0].items).toHaveLength(1)
  })

  it('sub-baris TANPA uraian tetap dihitung — yang menentukan adalah NILAINYA', () => {
    // Baris 36–37 RAB Cibuluh beruang Rp 109.337.202 dengan kolom uraian
    // KOSONG (teksnya di sel gabungan). Menuntut uraian membuangnya, dan
    // subtotal divisi III terlihat "meleset" — seolah Excel yang salah.
    const rows = [
      baris({ nomor: 'III.', uraian: 'PEKERJAAN BETON' }),
      baris({ nomor: 1, uraian: 'Foot Plate' }),
      baris({ jml: 107_740_800 }),   // tanpa nomor, TANPA uraian
      baris({ jml: 1_596_402 }),
      baris({ label: 'Sub Total   Rp.', jml: 109_337_202 }),
    ]
    const h = bacaBoQ(rows)
    const jumlah = h.divisi[0].items.reduce((s, it) => s + it.jumlah, 0)
    expect(jumlah).toBe(109_337_202)
  })

  it('nomor divisi GANDA dibedakan, tidak saling menimpa', () => {
    // RAB Cibuluh punya `IV.` dua kali (PEKERJAAN BAJA & PEKERJAAN PASANGAN).
    // Tanpa pembeda, subtotal yang kedua menimpa yang pertama.
    const rows = [
      baris({ nomor: 'IV.', uraian: 'PEKERJAAN BAJA' }),
      baris({ nomor: 1, uraian: 'Tiang', vol: 1, hs: 1000, jml: 1000 }),
      baris({ label: 'Sub Total   Rp.', jml: 1000 }),
      baris({ nomor: 'IV.', uraian: 'PEKERJAAN PASANGAN' }),
      baris({ nomor: 1, uraian: 'Bata', vol: 1, hs: 2000, jml: 2000 }),
      baris({ label: 'Sub Total   Rp.', jml: 2000 }),
    ]
    const h = bacaBoQ(rows)
    expect(h.divisi).toHaveLength(2)
    expect(h.divisi[0].subtotal).toBe(1000)
    expect(h.divisi[1].subtotal).toBe(2000)
    expect(h.catatan.some((c) => c.includes('2×'))).toBe(true)

    // ⚠️ Yang benar-benar rusak tanpa pembeda adalah KETERTELUSURAN, bukan
    // strukturnya — array tetap dua entri. Uji mutasi membuktikan versi
    // pertama test ini tak menjaga apa pun: menghapus pembeda tetap hijau
    // karena yang diperiksa cuma subtotal.
    //
    // Dampak nyatanya: item "IV.1" dari PEKERJAAN BAJA dan "IV.1" dari
    // PEKERJAAN PASANGAN menyandang kode identik. Saat laporan paritas
    // menyebut "IV.1 meleset Rp 3 juta", tak ada cara tahu yang mana.
    expect(h.divisi[0].kode).not.toBe(h.divisi[1].kode)
    const semuaKode = h.divisi.flatMap((d) => d.items.map((i) => i.code))
    expect(new Set(semuaKode).size).toBe(semuaKode.length)
  })

  it('baris SESUDAH subtotal bukan milik divisi itu', () => {
    // Baris 68 RAB Cibuluh ("Kolom") berdiri di antara subtotal divisi III dan
    // judul divisi IV. Memasukkannya membuat subtotal III seolah meleset.
    const rows = [
      baris({ nomor: 'III.', uraian: 'PEKERJAAN BETON' }),
      baris({ nomor: 1, uraian: 'Pedestal', vol: 1, hs: 500, jml: 500 }),
      baris({ label: 'Sub Total   Rp.', jml: 500 }),
      baris({ nomor: 1, uraian: 'Kolom yatim', vol: 1, hs: 999, jml: 999 }),
    ]
    const h = bacaBoQ(rows)
    expect(h.divisi[0].items).toHaveLength(1)
    expect(periksaKonsistensi(h).lolos).toBe(true)
  })
})

describe('rentang SUM dibaca dari RUMUS, bukan diasumsikan dari posisi', () => {
  it('mengurai =SUM(Q34:Q65) jadi 34..65 — bukan 4..5', () => {
    // Regex `\w+(\d+)` SERAKAH: `\w` mencakup angka, jadi pada "Q12" ia
    // melahap "Q1" dan menyisakan "2". Rentang jadi 2..7 alih-alih 12..17,
    // dan SELURUH item terbuang — sementara laporannya terlihat rapi.
    const peta = bacaRentangSubtotal({
      Q67: { f: 'SUM(Q34:Q65)' },
      Q18: { f: 'SUM(Q12:Q17)' },
      Q154: { f: 'Q18+Q27+Q67' },   // bukan SUM → diabaikan
      A1: { f: 'SUM(A1:A9)' },      // kolom lain → diabaikan
    })
    expect(peta.get(67)).toEqual({ dari: 34, sampai: 65 })
    expect(peta.get(18)).toEqual({ dari: 12, sampai: 17 })
    expect(peta.has(154)).toBe(false)
  })

  it('baris di LUAR rentang SUM dilaporkan, bukan didiamkan', () => {
    // Temuan nyata: Rp 37.876.001 di RAB Cibuluh tertulis di dokumen tapi
    // TIDAK ikut dijumlahkan, karena rumusnya `SUM(Q34:Q65)` sementara
    // barisnya ada di 30–33. Bisa disengaja atau salah ketik rentang —
    // sistem melaporkan, founder yang memutuskan.
    const rows = [
      baris({ nomor: 'III.', uraian: 'PEKERJAAN BETON' }),  // idx 0 → row 1
      baris({ jml: 37_876_001 }),                            // row 2 — DI LUAR
      baris({ nomor: 1, uraian: 'Pedestal', vol: 1, hs: 500, jml: 500 }),  // row 3
      baris({ label: 'Sub Total   Rp.', jml: 500 }),          // row 4
    ]
    const peta = new Map([[4, { dari: 3, sampai: 3 }]])
    const h = bacaBoQ(rows, peta)
    expect(h.diLuarSubtotal).toHaveLength(1)
    expect(h.diLuarSubtotal[0].nilai).toBe(37_876_001)
    // Yang di luar TIDAK ikut dibandingkan — Excel tak menghitungnya.
    expect(periksaKonsistensi(h).lolos).toBe(true)
    expect(h.catatan.some((c) => c.includes('DI LUAR'))).toBe(true)
  })

  it('tanpa rentang SUM, keterbatasannya DINYATAKAN', () => {
    // Asumsi posisi terbukti salah pada dokumen berstruktur dalam. Kalau
    // rumusnya tak tersedia, itu harus terbaca — bukan menghasilkan angka
    // yang terlihat sama meyakinkannya.
    const h = bacaBoQ([baris({ nomor: 'I.', uraian: 'X' })])
    expect(h.catatan.some((c) => c.includes('ASUMSI'))).toBe(true)
  })
})

describe('pemeriksaan konsistensi', () => {
  it('memeriksa TIGA level: item, divisi, total', () => {
    const rows = [
      baris({ nomor: 'I.', uraian: 'PERSIAPAN' }),
      baris({ nomor: 1, uraian: 'A', vol: 2, hs: 100, jml: 200 }),
      baris({ nomor: 2, uraian: 'B', vol: 3, hs: 100, jml: 300 }),
      baris({ label: 'Sub Total   Rp.', jml: 500 }),
      baris({ label: 'TOTAL :', jml: 500 }),
    ]
    const l = periksaKonsistensi(bacaBoQ(rows))
    expect(l.periksa.filter((p) => p.level === 'item')).toHaveLength(2)
    expect(l.periksa.filter((p) => p.level === 'divisi')).toHaveLength(1)
    expect(l.periksa.filter((p) => p.level === 'total')).toHaveLength(1)
    expect(l.lolos).toBe(true)
  })

  it('menangkap item yang jumlahnya ≠ volume × harga', () => {
    const rows = [
      baris({ nomor: 'I.', uraian: 'PERSIAPAN' }),
      baris({ nomor: 1, uraian: 'A', vol: 2, hs: 100, jml: 999 }),   // seharusnya 200
      baris({ label: 'Sub Total   Rp.', jml: 999 }),
    ]
    const l = periksaKonsistensi(bacaBoQ(rows))
    expect(l.lolos).toBe(false)
    const gagal = l.periksa.find((p) => p.level === 'item' && !p.lolos)
    expect(gagal?.selisih).toBe(799)
    // Baris asal disebut supaya bisa ditelusuri di Excel — "ada selisih"
    // tanpa lokasi memaksa orang mencari sendiri di 162 baris.
    expect(gagal?.baris).toBeGreaterThan(0)
  })

  it('toleransi menyerap galat floating-point Excel, bukan menyembunyikan cacat', () => {
    // `126,72 × 127.190` di Excel menghasilkan ...16,799999999. Menuntut
    // kesamaan bit-per-bit membuat test gagal pada hal yang bukan cacat —
    // dan test yang gagal tanpa sebab akan diabaikan orang.
    const rows = [
      baris({ nomor: 'I.', uraian: 'X' }),
      baris({ nomor: 1, uraian: 'A', vol: 126.72, hs: 127190, jml: 16117516.799999999 }),
      baris({ label: 'Sub Total   Rp.', jml: 16117516.8 }),
    ]
    expect(periksaKonsistensi(bacaBoQ(rows)).lolos).toBe(true)

    // Tapi selisih SATU rupiah penuh tetap ditangkap — toleransinya 0,5.
    const rusak = [
      baris({ nomor: 'I.', uraian: 'X' }),
      baris({ nomor: 1, uraian: 'A', vol: 1, hs: 100, jml: 101 }),
      baris({ label: 'Sub Total   Rp.', jml: 101 }),
    ]
    expect(periksaKonsistensi(bacaBoQ(rusak)).lolos).toBe(false)
    expect(TOLERANSI_RP).toBeLessThan(1)
  })

  it('dokumen kosong → nol pemeriksaan, tanpa error', () => {
    const l = periksaKonsistensi(bacaBoQ([]))
    expect(l.jumlahPeriksa).toBe(0)
    expect(l.lolos).toBe(true)
  })
})
