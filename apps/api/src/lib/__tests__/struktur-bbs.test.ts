import { describe, it, expect } from 'vitest'
import { analisaBalok, analisaKolom } from '../struktur-beton'
import {
  beratPerMeter, panjangKaitM, panjangPenyaluranM, hitungBatang, susunBBS,
  bbsBalok, bbsKolom, gabungBBS, PANJANG_LONJOR_M,
  type InputBatang,
} from '../struktur-bbs'

/**
 * GOLDEN TEST BBS — workbook "4. Analisa Balok", sheet "Gambar Kerja".
 *
 * Parameter balok: b 300 · h 520 · ts 30 · D 16 · P 8 · L 7500 mm
 *   sengkang tumpuan @220 · lapangan @250
 *
 * Baris tabel BBS yang dipakai acuan (dihitung balik dari kg-nya):
 *   R64  6 batang D16 lurus     12.00 m/batang  → 113.640 kg
 *   R68  5 batang D16 tumpuan    4.49 m/batang  →  35.434 kg
 *   R70  9 sengkang P8           1.50 m/batang  →   5.327 kg
 *   AT86 total                                  → 353.113 kg
 */

/**
 * ── SELISIH BERAT terhadap workbook: 4e-6%, dan sengaja TIDAK disamakan.
 *
 * Workbook memakai bentuk fisika penuh `0.25·π·(d/1000)²·7850`.
 * Repo ini memakai `KOEF_BERAT_BESI = 0.0061654`, yang adalah pembulatan dari
 * `π/4 × 7850 × 1e-6 = 0.0061653756`.
 *
 * Diukur untuk tujuh diameter baku, keduanya cocok tabel SNI sampai 3 desimal:
 *
 *          repo        fisika      SNI
 *     D8   0.394586    0.394584    0.395
 *     D16  1.578342    1.578336    1.578
 *     D25  3.853375    3.853360    3.853
 *
 * Konstanta repo TIDAK diubah karena ia dipakai `rab-compute.ts` dan seluruh
 * modul Fase 1 — mengubahnya berarti menggeser tonase seluruh proyek yang
 * sudah tersimpan, demi selisih 4e-6%. Yang disesuaikan: toleransi test, dan
 * alasannya ditulis di sini alih-alih dibiarkan jadi misteri.
 */
const dekatPersen = (a: number, b: number, persen = 0.001) =>
  Math.abs(a - b) / Math.abs(b) * 100 <= persen

describe('berat & kait — rumus dasar vs workbook', () => {
  it('berat D16 ≈ 1.578336 kg/m (workbook AO64) — selisih 4e-6% dari pembulatan', () => {
    expect(dekatPersen(beratPerMeter(16), 0.25 * Math.PI * (16 / 1000) ** 2 * 7850)).toBe(true)
    // Cocok tabel SNI sampai 3 desimal — yang dipakai orang di lapangan.
    expect(Number(beratPerMeter(16).toFixed(3))).toBe(1.578)
  })

  it('berat P8 ≈ 0.394584 kg/m (workbook AO70)', () => {
    expect(dekatPersen(beratPerMeter(8), 0.394584)).toBe(true)
    expect(Number(beratPerMeter(8).toFixed(3))).toBe(0.395)
  })

  it('cocok tabel SNI untuk tujuh diameter baku', () => {
    const tabel: [number, number][] = [
      [8, 0.395], [10, 0.617], [13, 1.042], [16, 1.578],
      [19, 2.226], [22, 2.984], [25, 3.853],
    ]
    for (const [d, sni] of tabel) {
      expect(Number(beratPerMeter(d).toFixed(3)), `D${d}`).toBe(sni)
    }
  })

  it('kait 135° = ROUNDUP(max(6·db, 0.05), 2) — workbook AF70', () => {
    // P8: 6×8 = 48 mm < 50 → dipakai 0.05 m
    expect(panjangKaitM(8, 135)).toBeCloseTo(0.05, 10)
    // D16: 6×16 = 96 mm → 0.10 m (workbook W68 = 0.0999…, ROUNDUP 2 desimal)
    expect(panjangKaitM(16, 135)).toBeCloseTo(0.10, 10)
    // D19: 6×19 = 114 mm → dibulatkan ke atas jadi 0.12
    expect(panjangKaitM(19, 135)).toBeCloseTo(0.12, 10)
  })

  it('kait 90° = 12·db — dua kali kait 135°', () => {
    expect(panjangKaitM(16, 90)).toBeCloseTo(0.20, 10)
  })

  it('penyaluran 40·db (pendekatan estimasi)', () => {
    expect(panjangPenyaluranM(16)).toBeCloseTo(0.64, 10)
  })
})

describe('hitungBatang — panjang satuan termasuk kait', () => {
  it('sengkang P8 pada balok 300×520 ts30 = 1.50 m (workbook AJ70)', () => {
    // Inti 240 × 460 mm; keliling 2·(0.24+0.46) = 1.40 m, + 2 kait 0.05 = 1.50
    const b = hitungBatang({
      uraian: 'Sengkang', bentuk: 'sengkang', tipe: 'BjTP', diameterMm: 8,
      segmenM: [0.24, 0.46, 0.24, 0.46], jumlah: 9,
    }, 1)
    expect(b.panjangSatuanM).toBeCloseTo(1.50, 10)
    expect(dekatPersen(b.totalKg, 5.3268845034268528)).toBe(true)  // workbook AR70
  })

  /**
   * SATU KAIT, bukan dua — koreksi terhadap tebakan pertama saya.
   *
   * Workbook AD68 = `SUM(AA68:AJ69)` = 4.49 m. Ditelusuri isinya: segmen
   * 4.39 m (sel Z) + SATU kait 0.10 m (sel AB). Percobaan pertama saya
   * memakai dua kait dan menghasilkan 4.59 — melebihkan 2.2% per batang.
   *
   * Dan itu benar secara teknis: tulangan tumpuan balok MENERUS berkait di
   * ujung bebas saja; ujung satunya menyambung ke bentang berikutnya.
   */
  it('tulangan tumpuan D16 = 4.49 m dengan SATU kait (workbook AD68)', () => {
    // MIN(0.75·7.5, 2·1.875 + 40·0.016) = MIN(5.625, 4.39) = 4.39
    const panjang = Math.min(0.75 * 7.5, 2 * (7.5 / 4) + 40 * 16 / 1000)
    expect(panjang).toBeCloseTo(4.39, 10)

    const b = hitungBatang({
      uraian: 'Tumpuan', bentuk: 'kait-1', tipe: 'BjTS', diameterMm: 16,
      segmenM: [panjang], jumlah: 5, sudutKait: 135,
    }, 1)
    expect(b.jumlahKait).toBe(1)
    expect(b.panjangSatuanM).toBeCloseTo(4.49, 10)
    expect(dekatPersen(b.totalKg, 35.433646548720837)).toBe(true)  // workbook AR68
  })

  it('dua kait menghasilkan 4.59 — penjaga terhadap kekeliruan yang saya buat', () => {
    const panjang = Math.min(0.75 * 7.5, 2 * (7.5 / 4) + 40 * 16 / 1000)
    const dua = hitungBatang({
      uraian: 'Tumpuan', bentuk: 'kait-2', tipe: 'BjTS', diameterMm: 16,
      segmenM: [panjang], jumlah: 5, sudutKait: 135,
    }, 1)
    expect(dua.panjangSatuanM).toBeCloseTo(4.59, 10)
    // 2.2% lebih berat — kecil per batang, nyata pada tonase proyek.
    expect(dua.totalKg / 35.433646548720837).toBeCloseTo(4.59 / 4.49, 3)
  })

  it('batang lurus 12 m × 6 ≈ 113.640 kg (workbook AR64)', () => {
    const b = hitungBatang({
      uraian: 'Lurus', bentuk: 'lurus', tipe: 'BjTS', diameterMm: 16,
      segmenM: [12], jumlah: 6,
    }, 1)
    expect(b.jumlahKait).toBe(0)
    expect(dekatPersen(b.totalKg, 113.64020273977286)).toBe(true)
  })

  /**
   * JUMLAH KAIT DITURUNKAN DARI BENTUK, bukan diminta.
   *
   * Ini menutup kelas kesalahan "lupa mencentang kait" — yang membuat tonase
   * kurang ±8% pada sengkang tanpa satu pun gejala.
   */
  it('kait diturunkan dari bentuk — sengkang & kait-2 selalu 2, lurus 0', () => {
    const dasar = { tipe: 'BjTS' as const, diameterMm: 16, segmenM: [2], jumlah: 1 }
    expect(hitungBatang({ ...dasar, uraian: 'a', bentuk: 'lurus' }, 1).jumlahKait).toBe(0)
    expect(hitungBatang({ ...dasar, uraian: 'b', bentuk: 'kait-2' }, 2).jumlahKait).toBe(2)
    expect(hitungBatang({ ...dasar, uraian: 'c', bentuk: 'sengkang' }, 3).jumlahKait).toBe(2)
    expect(hitungBatang({ ...dasar, uraian: 'd', bentuk: 'sengkang-u' }, 4).jumlahKait).toBe(2)
  })

  it('sengkang memakai kait 135°, tulangan lain 90° — bawaan berbeda', () => {
    const sk = hitungBatang({
      uraian: 'sk', bentuk: 'sengkang', tipe: 'BjTP', diameterMm: 16,
      segmenM: [1], jumlah: 1,
    }, 1)
    const tl = hitungBatang({
      uraian: 'tl', bentuk: 'kait-2', tipe: 'BjTS', diameterMm: 16,
      segmenM: [1], jumlah: 1,
    }, 2)
    expect(sk.kaitM).toBeCloseTo(0.10, 10)   // 6·db
    expect(tl.kaitM).toBeCloseTo(0.20, 10)   // 12·db
  })

  it('menolak input mustahil', () => {
    const d = { uraian: 'x', bentuk: 'lurus' as const, tipe: 'BjTS' as const, diameterMm: 16 }
    expect(() => hitungBatang({ ...d, segmenM: [1], jumlah: 0 }, 1)).toThrow(/bulat > 0/)
    expect(() => hitungBatang({ ...d, segmenM: [1], jumlah: 2.5 }, 1)).toThrow(/bulat/)
    expect(() => hitungBatang({ ...d, segmenM: [], jumlah: 1 }, 1)).toThrow(/tak ada segmen/)
    expect(() => hitungBatang({ ...d, segmenM: [-1], jumlah: 1 }, 1)).toThrow(/harus > 0/)
    expect(() => hitungBatang({ ...d, diameterMm: 0, segmenM: [1], jumlah: 1 }, 1)).toThrow()
  })
})

describe('susunBBS — rekap pembelian', () => {
  const DAFTAR: InputBatang[] = [
    { uraian: 'A', bentuk: 'lurus', tipe: 'BjTS', diameterMm: 16, segmenM: [5], jumlah: 10 },
    { uraian: 'B', bentuk: 'kait-2', tipe: 'BjTS', diameterMm: 16, segmenM: [3], jumlah: 8 },
    { uraian: 'C', bentuk: 'sengkang', tipe: 'BjTP', diameterMm: 8, segmenM: [0.24, 0.46, 0.24, 0.46], jumlah: 40 },
  ]

  it('nomor batang berurutan mulai 1 — dipakai menandai gambar kerja', () => {
    const h = susunBBS(DAFTAR)
    expect(h.batang.map((b) => b.nomor)).toEqual([1, 2, 3])
  })

  it('rekap digabung per (tipe, diameter) — satuan yang dibeli', () => {
    const h = susunBBS(DAFTAR)
    expect(h.rekap).toHaveLength(2)   // D16 (A+B) dan P8 (C)
    const d16 = h.rekap.find((r) => r.diameterMm === 16)!
    expect(d16.panjangDibutuhkanM).toBeCloseTo(10 * 5 + 8 * (3 + 2 * 0.20), 9)
  })

  /**
   * TONASE BELI ≠ TONASE PASANG — dan selisihnya bukan nol.
   *
   * Besi dibeli per lonjor 12 m; sisa potongan tetap dibayar. RAP yang memakai
   * tonase terpasang akan SELALU kurang, dan kekurangan itu tak terlihat dari
   * angka mana pun sampai belanja nyata datang.
   */
  it('membedakan tonase TERPASANG dan tonase DIBELI', () => {
    const h = susunBBS(DAFTAR)
    expect(h.totalKgDibeli).toBeGreaterThan(h.totalKgTerpasang)
    for (const r of h.rekap) {
      expect(r.lonjorDibeli).toBe(Math.ceil(r.panjangDibutuhkanM / PANJANG_LONJOR_M))
      expect(r.panjangDibeliM).toBe(r.lonjorDibeli * PANJANG_LONJOR_M)
      expect(r.sisaM).toBeCloseTo(r.panjangDibeliM - r.panjangDibutuhkanM, 9)
      expect(r.sisaM).toBeGreaterThanOrEqual(0)
    }
  })

  it('batang lebih panjang dari lonjor → PERINGATAN sambungan lewatan', () => {
    // Ini kekurangan yang tak terlihat dari tonase: batang 15 m tak bisa
    // dipotong dari lonjor 12 m tanpa sambungan.
    const h = susunBBS([
      { uraian: 'Panjang', bentuk: 'lurus', tipe: 'BjTS', diameterMm: 16, segmenM: [15], jumlah: 4 },
    ])
    expect(h.catatan.some((c) => /SAMBUNGAN LEWATAN/i.test(c))).toBe(true)
    expect(h.catatan.some((c) => /15\.00 m/.test(c))).toBe(true)
  })

  it('sisa potongan besar → ditandai sebagai BATAS ATAS, bukan ramalan', () => {
    // Satu batang 1 m saja: butuh 1 lonjor, sisa 11 m = 91.7%.
    const h = susunBBS([
      { uraian: 'Pendek', bentuk: 'lurus', tipe: 'BjTS', diameterMm: 16, segmenM: [1], jumlah: 1 },
    ])
    expect(h.rekap[0].sisaPersen).toBeGreaterThan(15)
    expect(h.catatan.some((c) => /BATAS ATAS/.test(c))).toBe(true)
    expect(h.catatan.some((c) => /optimasi pola potong/i.test(c))).toBe(true)
  })

  it('catatan penyaluran SELALU ada — batas 40·db dinyatakan', () => {
    const h = susunBBS(DAFTAR)
    expect(h.catatan.some((c) => /40·db/.test(c))).toBe(true)
    expect(h.catatan.some((c) => /gambar kerja bertanda tangan/i.test(c))).toBe(true)
  })

  it('daftar kosong → nol bersih + catatan, bukan crash', () => {
    const h = susunBBS([])
    expect(h.batang).toEqual([])
    expect(h.totalKgTerpasang).toBe(0)
    expect(h.catatan.length).toBeGreaterThan(0)
  })
})

describe('bbsBalok — zona sengkang L/4 · L/2 · L/4', () => {
  const BALOK = {
    bMm: 300, hMm: 520, panjangM: 7.5, selimutMm: 30,
    dUtamaMm: 16, nBawah: 5, nAtas: 3,
    dSengkangMm: 8, jarakSengkangTumpuanMm: 220, jarakSengkangLapanganMm: 250,
  }

  it('lima jenis batang: bawah · atas kiri · atas kanan · sengkang tumpuan · lapangan', () => {
    const h = bbsBalok(BALOK)
    expect(h.batang).toHaveLength(5)
    expect(h.batang.map((b) => b.uraian.split(' ')[0]))
      .toEqual(['Tulangan', 'Tulangan', 'Tulangan', 'Sengkang', 'Sengkang'])
  })

  /**
   * Zona sengkang BERBEDA — dan ini bukan hiasan.
   *
   * Gaya geser terbesar di tumpuan, jadi sengkang di sana lebih rapat.
   * Menghitung satu jarak untuk seluruh bentang salah di KEDUA arah: terlalu
   * banyak di tengah, terlalu sedikit di ujung.
   */
  it('sengkang tumpuan @220 lebih banyak per meter daripada lapangan @250', () => {
    const h = bbsBalok(BALOK)
    const tumpuan = h.batang.find((b) => /tumpuan/.test(b.uraian) && b.tipe === 'BjTP')!
    const lapangan = h.batang.find((b) => /lapangan/.test(b.uraian))!
    // Tumpuan: ⌈1.875/0.22⌉ = 9 per zona × 2 zona = 18
    expect(tumpuan.jumlah).toBe(Math.ceil(7.5 / 4 * 1000 / 220) * 2)
    // Lapangan: ⌈3.75/0.25⌉ = 15
    expect(lapangan.jumlah).toBe(Math.ceil(7.5 / 2 * 1000 / 250))
  })

  it('tulangan tumpuan = MIN(0.75·L, 2·L/4 + 40db) — rumus workbook Z68', () => {
    const h = bbsBalok(BALOK)
    const atas = h.batang.find((b) => /atas tumpuan kiri/.test(b.uraian))!
    const harap = Math.min(0.75 * 7.5, 2 * (7.5 / 4) + 40 * 16 / 1000)
    expect(atas.segmenM[0]).toBeCloseTo(harap, 10)
    expect(harap).toBeCloseTo(4.39, 10)
  })

  it('tulangan bawah ikut penyaluran di kedua ujung', () => {
    const h = bbsBalok(BALOK)
    const bawah = h.batang.find((b) => /bawah/.test(b.uraian))!
    expect(bawah.segmenM[0]).toBeCloseTo(7.5 + 2 * 0.64, 10)
  })

  it('sengkang memakai sisi inti, bukan sisi luar', () => {
    const h = bbsBalok(BALOK)
    const sk = h.batang.find((b) => b.tipe === 'BjTP')!
    expect(sk.segmenM).toEqual([0.24, 0.46, 0.24, 0.46])
    expect(sk.panjangSatuanM).toBeCloseTo(1.50, 10)
  })

  it('jumlah balok mengalikan seluruh batang', () => {
    const satu = bbsBalok(BALOK)
    const sepuluh = bbsBalok({ ...BALOK, jumlahBalok: 10 })
    expect(sepuluh.totalKgTerpasang).toBeCloseTo(satu.totalKgTerpasang * 10, 6)
  })

  it('menolak selimut melebihi dimensi', () => {
    expect(() => bbsBalok({ ...BALOK, selimutMm: 200 })).toThrow(/Selimut melebihi/)
    expect(() => bbsBalok({ ...BALOK, panjangM: 0 })).toThrow()
  })
})

describe('bbsKolom', () => {
  const KOLOM = {
    bMm: 400, hMm: 400, tinggiM: 3.5, selimutMm: 40,
    dUtamaMm: 16, nTulangan: 12, dSengkangMm: 10, jarakSengkangMm: 150,
  }

  it('tulangan utama + penyaluran DUA ujung (balok atas & pondasi bawah)', () => {
    const h = bbsKolom(KOLOM)
    const utama = h.batang.find((b) => /utama/.test(b.uraian))!
    expect(utama.segmenM[0]).toBeCloseTo(3.5 + 2 * 0.64, 10)
    expect(utama.jumlah).toBe(12)
  })

  it('sengkang = ⌈tinggi/jarak⌉ + 1', () => {
    const h = bbsKolom(KOLOM)
    const sk = h.batang.find((b) => b.tipe === 'BjTP')!
    expect(sk.jumlah).toBe(Math.ceil(3500 / 150) + 1)
  })
})

describe('gabungBBS — rekap proyek', () => {
  const BALOK = bbsBalok({
    bMm: 300, hMm: 500, panjangM: 6, selimutMm: 30,
    dUtamaMm: 16, nBawah: 4, nAtas: 3,
    dSengkangMm: 8, jarakSengkangTumpuanMm: 150, jarakSengkangLapanganMm: 200,
    jumlahBalok: 12,
  })
  const KOLOM = bbsKolom({
    bMm: 400, hMm: 400, tinggiM: 3.5, selimutMm: 40,
    dUtamaMm: 16, nTulangan: 12, dSengkangMm: 10, jarakSengkangMm: 150,
    jumlahKolom: 8,
  })

  it('batang dinomori ulang berurutan', () => {
    const g = gabungBBS([BALOK, KOLOM])
    expect(g.batang.map((b) => b.nomor))
      .toEqual(Array.from({ length: BALOK.batang.length + KOLOM.batang.length }, (_, i) => i + 1))
  })

  /**
   * KEKEKALAN tonase — dan cacat yang ditemukannya.
   *
   * Test ini MERAH pada percobaan pertama: gabungan 2217.69 kg vs jumlah
   * bagian 2206.33 kg — bertambah 11.36 kg tanpa satu pun galat.
   *
   * Sebabnya: `gabungBBS` menyusun ulang batang lewat `hitungBatang` tetapi
   * TIDAK membawa `sudutKait`. Tulangan tumpuan yang aslinya berkait 135°
   * (0.10 m) tersusun ulang dengan bawaan 90° (0.20 m), dan tiap batang
   * bertambah 0.10 m.
   *
   * Kelas cacat yang khas: hasilnya tetap terlihat wajar, hanya lebih berat.
   * Yang menangkapnya adalah SIFAT (kekekalan), bukan angka acuan — dan itu
   * sebabnya test kekekalan layak ditulis meski terasa sepele.
   */
  it('tonase terpasang KEKAL — gabungan = jumlah bagiannya', () => {
    const g = gabungBBS([BALOK, KOLOM])
    expect(g.totalKgTerpasang)
      .toBeCloseTo(BALOK.totalKgTerpasang + KOLOM.totalKgTerpasang, 6)
  })

  it('sudut kait TERBAWA lewat penggabungan — tiap batang identik', () => {
    const g = gabungBBS([BALOK, KOLOM])
    const asal = [...BALOK.batang, ...KOLOM.batang]
    for (const [i, a] of asal.entries()) {
      expect(g.batang[i].sudutKait, a.uraian).toBe(a.sudutKait)
      expect(g.batang[i].panjangSatuanM, a.uraian).toBeCloseTo(a.panjangSatuanM, 9)
      expect(g.batang[i].jumlahKait, a.uraian).toBe(a.jumlahKait)
    }
  })

  /**
   * Rekap dihitung ULANG dari gabungan, bukan menjumlah rekap masing-masing.
   *
   * Kalau dijumlah, sisa potongan terhitung berkali-kali — padahal batang dari
   * elemen berbeda bisa dipotong dari lonjor yang SAMA. Menjumlah rekap akan
   * melebihkan tonase beli, dan RAP jadi mahal tanpa sebab.
   */
  it('tonase DIBELI gabungan ≤ jumlah tonase beli terpisah', () => {
    const g = gabungBBS([BALOK, KOLOM])
    expect(g.totalKgDibeli)
      .toBeLessThanOrEqual(BALOK.totalKgDibeli + KOLOM.totalKgDibeli + 1e-9)
  })

  it('D16 dari balok & kolom MENYATU jadi satu baris rekap', () => {
    const g = gabungBBS([BALOK, KOLOM])
    const d16 = g.rekap.filter((r) => r.diameterMm === 16 && r.tipe === 'BjTS')
    expect(d16).toHaveLength(1)
  })

  it('daftar kosong tetap aman', () => {
    expect(gabungBBS([]).batang).toEqual([])
  })
})

/**
 * AUDIT SILANG — BBS vs volume Fase 1.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TEMUAN YANG PENTING UNTUK RAP
 *
 * Volume besi Fase 1 menghitung batang SEPANJANG ELEMEN saja. BBS menambahkan
 * yang benar-benar dipotong: penyaluran, kait, dan tulangan atas tumpuan.
 * Selisihnya BESAR dan terarah:
 *
 *     balok  850.9 kg (Fase 1)  →  1428.8 kg (BBS)   1.68×
 *     kolom  526.2 kg           →   695.9 kg         1.32×
 *
 * Artinya RAP yang memakai volume Fase 1 KURANG 30–70% pada pos besi. Bukan
 * karena Fase 1 salah — ia menjawab pertanyaan berbeda ("berapa besi di dalam
 * elemen ini") — melainkan karena pertanyaan RAP adalah "berapa yang dibeli".
 *
 * Test ini mengunci arah hubungan itu supaya tak terbalik diam-diam, dan
 * mencatat angkanya supaya pemakai tahu mana yang dipakai untuk apa.
 * ══════════════════════════════════════════════════════════════════════════════
 */
describe('audit silang — BBS selalu ≥ volume Fase 1', () => {
  it('balok: BBS lebih besar, dan rasionya wajar (1.2–2.5×)', () => {
    const v = analisaBalok({
      bMm: 300, hMm: 500, panjangM: 6, selimutMm: 30, dUtamaMm: 16, nTarik: 5,
      dSengkangMm: 8, jarakSengkangMm: 150,
      mutu: { fcMpa: 30, fyMpa: 400 }, muKnm: 100, vuKn: 80, jumlah: 12,
    }).volume

    const bbs = bbsBalok({
      bMm: 300, hMm: 500, panjangM: 6, selimutMm: 30, dUtamaMm: 16,
      nBawah: 5, nAtas: 3, dSengkangMm: 8,
      jarakSengkangTumpuanMm: 150, jarakSengkangLapanganMm: 150, jumlahBalok: 12,
    })

    const rasio = bbs.totalKgTerpasang / v.besiTotalKg
    expect(rasio).toBeGreaterThan(1.2)
    expect(rasio).toBeLessThan(2.5)
  })

  it('kolom: BBS lebih besar karena penyaluran dua ujung', () => {
    const v = analisaKolom({
      hMm: 400, bMm: 400, tinggiM: 3.5, selimutMm: 40,
      dUtamaMm: 16, nBarisX: 3, nBarisY: 3,
      dSengkangMm: 10, jarakSengkangMm: 150,
      mutu: { fcMpa: 30, fyMpa: 400 }, puKn: 800, muKnm: 50, jumlah: 8,
    }).volume

    const bbs = bbsKolom({
      bMm: 400, hMm: 400, tinggiM: 3.5, selimutMm: 40, dUtamaMm: 16,
      nTulangan: 8, dSengkangMm: 10, jarakSengkangMm: 150, jumlahKolom: 8,
    })

    expect(bbs.totalKgTerpasang).toBeGreaterThan(v.besiTotalKg)
    expect(bbs.totalKgTerpasang / v.besiTotalKg).toBeLessThan(2)
  })

  it('tonase DIBELI ≥ TERPASANG, dan sisa < 10% pada proyek berukuran wajar', () => {
    const bbs = bbsBalok({
      bMm: 300, hMm: 500, panjangM: 6, selimutMm: 30, dUtamaMm: 16,
      nBawah: 5, nAtas: 3, dSengkangMm: 8,
      jarakSengkangTumpuanMm: 150, jarakSengkangLapanganMm: 150, jumlahBalok: 12,
    })
    expect(bbs.totalKgDibeli).toBeGreaterThanOrEqual(bbs.totalKgTerpasang)
    // Pada volume proyek nyata, pembulatan lonjor jadi tak berarti.
    for (const r of bbs.rekap) {
      expect(r.sisaPersen, `${r.tipe} Ø${r.diameterMm}`).toBeLessThan(10)
    }
  })
})
