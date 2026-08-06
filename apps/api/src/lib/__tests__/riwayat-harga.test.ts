import { describe, it, expect } from 'vitest'
import { susunRiwayatHarga, MIN_TITIK_TREN, type BarisPembelian } from '../riwayat-harga.js'

// ═════════════════════════════════════════════════════════════════════════════
// RIWAYAT HARGA — modul yang lahir dari KESALAHAN BACA SAYA SENDIRI.
//
// Saya melaporkan "Besi Ø12mm +20%" padahal harganya TURUN 16,7%: menghitung
// `max − min` tanpa memperhatikan urutan waktu. Rentangnya memang 20%, tapi
// arahnya terbalik.
//
// Test di bawah menjaga tiga salah-baca yang sudah terbukti terjadi:
//   1. urutan diabaikan       → arah pergerakan terbalik
//   2. beda vendor dikira waktu → "naik 5,4%" untuk dua supplier di hari sama
//   3. satu titik diberi persen → "0%" terbaca "harganya stabil"
// ═════════════════════════════════════════════════════════════════════════════

const B = (o: Partial<BarisPembelian> & Pick<BarisPembelian, 'material_id' | 'tanggal' | 'unit_price'>): BarisPembelian => ({
  material_name: 'Besi Ø12', unit: 'batang', supplier_name: 'Vendor A', ...o,
})

describe('susunRiwayatHarga — arah pergerakan', () => {
  it('harga TURUN dilaporkan negatif, bukan disembunyikan', () => {
    // Data nyata Besi Ø12mm: 120.000 (Mar) → 120.000 (Mei) → 100.000 (Agu).
    // Inilah kasus yang saya laporkan terbalik sebagai "+20%".
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-03-17', unit_price: 120000 }),
      B({ material_id: 'm1', tanggal: '2026-05-10', unit_price: 120000 }),
      B({ material_id: 'm1', tanggal: '2026-08-04', unit_price: 100000 }),
    ])
    const m = h.material[0]
    expect(m.harga_awal).toBe(120000)
    expect(m.harga_akhir).toBe(100000)
    expect(m.perubahan_pct).toBeCloseTo(-16.67, 1)
    expect(h.jumlah_turun).toBe(1)
    expect(h.jumlah_naik).toBe(0)
  })

  it('urutan mengikuti TANGGAL, bukan urutan baris dari basis', () => {
    // Basis boleh mengembalikan baris dalam urutan apa pun. Kalau urutannya
    // diambil apa adanya, jangkarnya salah dan arahnya ikut terbalik.
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-08-04', unit_price: 100000 }),
      B({ material_id: 'm1', tanggal: '2026-03-17', unit_price: 120000 }),
    ])
    expect(h.material[0].harga_awal).toBe(120000)   // Maret, bukan Agustus
    expect(h.material[0].perubahan_pct).toBeLessThan(0)
  })

  it('harga NAIK tetap terdeteksi sebagai positif', () => {
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 100000 }),
      B({ material_id: 'm1', tanggal: '2026-06-01', unit_price: 130000 }),
    ])
    expect(h.material[0].perubahan_pct).toBe(30)
    expect(h.jumlah_naik).toBe(1)
    expect(h.jumlah_turun).toBe(0)
  })
})

describe('susunRiwayatHarga — vendor BUKAN waktu', () => {
  it('dua harga di tanggal SAMA adalah sebaran vendor, bukan perubahan', () => {
    // Data nyata `Pasir Pasang`: 185.000 dan 195.000, tanggal sama, dua
    // supplier. Menghitungnya sebagai "naik 5,4%" adalah salah baca.
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', material_name: 'Pasir', tanggal: '2026-08-04', unit_price: 185000, supplier_name: 'UD Besi Kuat' }),
      B({ material_id: 'm1', tanggal: '2026-08-04', unit_price: 195000, supplier_name: 'Toko Maju' }),
    ])
    const m = h.material[0]
    expect(m.titik).toHaveLength(1)              // satu TANGGAL, bukan dua titik
    expect(m.perubahan_pct).toBe(0)              // tak ada pergerakan waktu
    expect(m.titik[0].jumlah_vendor).toBe(2)
    expect(m.titik[0].sebaran_vendor_pct).toBeCloseTo(5.41, 1)
    expect(h.jumlah_beda_vendor).toBe(1)
    expect(h.jumlah_naik).toBe(0)                // BUKAN dihitung sebagai naik
  })

  it('harga TERBAIK per tanggal yang dipakai sebagai titik waktu', () => {
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 100000, supplier_name: 'A' }),
      B({ material_id: 'm1', tanggal: '2026-06-01', unit_price: 150000, supplier_name: 'A' }),
      B({ material_id: 'm1', tanggal: '2026-06-01', unit_price: 90000, supplier_name: 'B' }),
    ])
    const m = h.material[0]
    expect(m.harga_akhir).toBe(90000)            // termurah di tanggal itu
    expect(m.perubahan_pct).toBe(-10)
  })

  it('satu vendor dengan beberapa baris tak terhitung dua vendor', () => {
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 100000, supplier_name: 'A' }),
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 110000, supplier_name: 'A' }),
    ])
    expect(h.material[0].titik[0].jumlah_vendor).toBe(1)
    expect(h.material[0].titik[0].sebaran_vendor_pct).toBeNull()
  })
})

describe('susunRiwayatHarga — jalan lain di mana angkanya bisa menyesatkan', () => {
  it('NUMERIC berupa STRING dibandingkan sebagai ANGKA, bukan teks', () => {
    // Sebagai TEKS, "100000" < "99000" — arah pergerakannya ikut salah.
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: '100000' }),
      B({ material_id: 'm1', tanggal: '2026-06-01', unit_price: '99000' }),
    ])
    expect(h.material[0].harga_akhir).toBe(99000)
    expect(h.material[0].perubahan_pct).toBeCloseTo(-1, 1)
  })

  it('SATU titik tidak menghasilkan persentase', () => {
    // "0%" akan terbaca "harganya stabil", padahal yang benar "belum ada
    // pembanding sama sekali".
    //
    // ⚠️ Menegaskan `perubahan_pct === 0` SAJA tidak menjaga apa pun: dengan
    // satu titik, `awal === akhir`, jadi rumusnya menghasilkan 0 baik syarat
    // `titik.length >= 2` ada maupun tidak. Terbukti lewat mutasi yang LOLOS
    // (2026-08-06).
    //
    // Yang benar-benar membedakan adalah pencacahnya: satu titik tak boleh
    // ikut terhitung sebagai naik/turun, dan HARUS masuk `jumlah_satu_titik`.
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 100000 }),
      // Material kedua BERGERAK — supaya pencacah tak nol karena tak ada apa-apa.
      B({ material_id: 'm2', material_name: 'Bergerak', tanggal: '2026-01-01', unit_price: 100 }),
      B({ material_id: 'm2', tanggal: '2026-06-01', unit_price: 120 }),
    ])
    const satu = h.material.find((m) => m.material_id === 'm1')!
    expect(satu.titik).toHaveLength(1)
    expect(satu.perubahan_pct).toBe(0)
    expect(satu.cukup_untuk_tren).toBe(false)
    expect(h.jumlah_satu_titik).toBe(1)
    // m2 naik; m1 TIDAK ikut terhitung di mana pun.
    expect(h.jumlah_naik).toBe(1)
    expect(h.jumlah_turun).toBe(0)
  })

  it('satu titik tak ikut dihitung naik walau harganya besar', () => {
    // Mutasi yang lolos 2026-08-06: membuang syarat `titik.length >= 2` dari
    // `perubahan_pct`. Dengan satu titik saja, ia tak terdeteksi karena
    // hasilnya kebetulan sama (0).
    //
    // Uji ini memakai material yang HANYA punya satu titik bersama material
    // lain yang turun — kalau syaratnya dibuang, pencacahnya tetap benar,
    // tapi `perubahan_pct` material satu-titik harus tetap tepat 0 DAN
    // `jumlah_satu_titik` harus menghitungnya.
    const h = susunRiwayatHarga([
      B({ material_id: 'a', material_name: 'Sendirian', tanggal: '2026-05-05', unit_price: 999000 }),
      B({ material_id: 'b', material_name: 'Turun', tanggal: '2026-01-01', unit_price: 100 }),
      B({ material_id: 'b', tanggal: '2026-06-01', unit_price: 80 }),
    ])
    expect(h.jumlah_satu_titik).toBe(1)
    expect(h.jumlah_turun).toBe(1)
    expect(h.jumlah_naik).toBe(0)
    const a = h.material.find((m) => m.material_id === 'a')!
    expect(a.perubahan_pct).toBe(0)
    expect(a.rentang_hari).toBe(0)
  })

  it('dua titik BELUM disebut tren, tiga titik baru cukup', () => {
    // Satu pembelian borongan yang kebetulan murah akan terbaca "harga turun"
    // kalau dua titik sudah dianggap tren.
    const dua = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 100000 }),
      B({ material_id: 'm1', tanggal: '2026-06-01', unit_price: 80000 }),
    ])
    expect(dua.material[0].cukup_untuk_tren).toBe(false)

    const tiga = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 100000 }),
      B({ material_id: 'm1', tanggal: '2026-03-01', unit_price: 90000 }),
      B({ material_id: 'm1', tanggal: '2026-06-01', unit_price: 80000 }),
    ])
    expect(tiga.material[0].cukup_untuk_tren).toBe(true)
    expect(MIN_TITIK_TREN).toBe(3)
  })

  it('jangkar NOL tidak menghasilkan Infinity', () => {
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 0 }),
      B({ material_id: 'm1', tanggal: '2026-06-01', unit_price: 50000 }),
    ])
    expect(Number.isFinite(h.material[0].perubahan_pct)).toBe(true)
    expect(h.material[0].perubahan_pct).toBe(0)
  })

  it('null/undefined tak membuat NaN mengalir', () => {
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: null as unknown as number }),
    ])
    expect(Number.isNaN(h.material[0].harga_awal)).toBe(false)
    expect(h.material[0].harga_awal).toBe(0)
  })

  it('rentang hari dihitung dari titik pertama ke terakhir', () => {
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: '2026-03-17', unit_price: 120000 }),
      B({ material_id: 'm1', tanggal: '2026-08-04', unit_price: 100000 }),
    ])
    expect(h.material[0].rentang_hari).toBe(140)   // Mar 17 → Agu 4
  })

  it('diurutkan menurut BESAR pergerakan, ke arah mana pun', () => {
    // Mengurut hanya menurut kenaikan akan mengubur penurunan tajam —
    // padahal turun 30% juga kabar penting (kualitas? vendor baru? salah input?).
    const h = susunRiwayatHarga([
      B({ material_id: 'naik', material_name: 'Naik Sedikit', tanggal: '2026-01-01', unit_price: 100 }),
      B({ material_id: 'naik', tanggal: '2026-06-01', unit_price: 105 }),
      B({ material_id: 'turun', material_name: 'Turun Tajam', tanggal: '2026-01-01', unit_price: 100 }),
      B({ material_id: 'turun', tanggal: '2026-06-01', unit_price: 70 }),
    ])
    expect(h.material[0].material_id).toBe('turun')
    expect(h.material[0].perubahan_pct).toBe(-30)
  })

  it('Date object dan string ISO diperlakukan sama', () => {
    const h = susunRiwayatHarga([
      B({ material_id: 'm1', tanggal: new Date('2026-01-01T00:00:00Z'), unit_price: 100 }),
      B({ material_id: 'm1', tanggal: '2026-01-01', unit_price: 100 }),
    ])
    expect(h.material[0].titik).toHaveLength(1)
  })
})
