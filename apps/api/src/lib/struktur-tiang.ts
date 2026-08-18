// Daya dukung tiang pancang — kapasitas bahan + tanah (SPT / sondir).
//
// ══════════════════════════════════════════════════════════════════════════════
// Bagian dari mesin hitung struktur. Lihat `struktur-beton.ts` untuk alasan
// pola (pure, golden test vs workbook, verdict ber-angka).
//
// ── Dua batas yang HARUS dihitung keduanya
//
//     kapasitas BAHAN   berapa yang mampu ditahan betonnya sendiri
//     kapasitas TANAH   berapa yang mampu didukung tanah di sekitarnya
//
// Yang menentukan adalah yang TERKECIL. Tiang beton mutu tinggi di tanah
// lunak tetap dibatasi tanahnya; tiang pendek di tanah keras dibatasi
// bahannya. Menghitung satu saja menghasilkan angka yang bisa 3× lipat dari
// yang benar — dan arah kesalahannya tak bisa ditebak tanpa menghitung.
// ══════════════════════════════════════════════════════════════════════════════

import { RHO_BETON, type VolumeElemen } from './struktur-beton'

/** Satu lapisan data uji tanah sepanjang kedalaman tiang. */
export interface LapisanTanah {
  /** Tebal lapisan, m. */
  tebalM: number
  /** Nilai N-SPT (N/0.3m) — untuk metode SPT. */
  nSpt?: number
  /** Tahanan konus sondir, kg/cm² — untuk metode sondir. */
  qcKgCm2?: number
  /** Hambatan lekat sondir, kg/cm — untuk metode sondir. */
  jhpKgCm?: number
}

export interface InputTiang {
  /** Diameter tiang, m. */
  diameterM: number
  /** Panjang tiang tertanam, m. */
  panjangM: number
  /** Kuat tekan beton, MPa. */
  fcMpa: number
  /** Berat volume beton, kN/m³. */
  gammaBetonKnM3?: number
  /** Faktor reduksi kapasitas bahan. Workbook memakai 0.6. */
  faktorReduksiBahan?: number
  /** Faktor reduksi kapasitas tanah. Workbook memakai 0.6. */
  faktorReduksiTanah?: number
  /** Lapisan tanah dari muka sampai ujung tiang. */
  lapisan: LapisanTanah[]
  /** Beban rencana per tiang, kN — untuk verdict. Kosong = tak diperiksa. */
  bebanRencanaKn?: number
  jumlah?: number
}

export interface HasilTiang {
  /** Kapasitas ijin bahan, kN. */
  pIjinBahanKn: number
  /** Kapasitas ijin tanah per metode yang datanya ada. */
  tanah: { metode: 'SPT (Meyerhof)' | 'Sondir'; pUltKn: number; pIjinKn: number; antara: Record<string, number> }[]
  /** Yang MENENTUKAN — terkecil dari bahan & tanah. */
  pIjinKn: number
  /** Apa yang membatasi: 'bahan' atau nama metode tanah. */
  penentu: string
  periksa: { nama: string; nilai: number; syarat: number; satuan: string; aman: boolean; rasio: number; rumus: string }[]
  aman: boolean
  /**
   * Volume — berbentuk `VolumeElemen` yang SAMA dengan modul lain, plus dua
   * medan khas tiang.
   *
   * ⚠ Versi pertama hanya memuat `{ betonM3, jumlahTiang, totalPanjangM }`,
   * dan itu MEMUTUS jalur RAP: `rekapVolume` membaca `volume.besi` lalu crash
   * dengan "h.volume.besi is not iterable" begitu tiang ikut direkap bersama
   * elemen lain.
   *
   * TypeScript tak menangkapnya — `rekapVolume` menerima bentuk struktural
   * `{ volume: VolumeElemen }`, dan objek tiang yang kekurangan medan hanya
   * gagal saat dijalankan. Ditemukan lewat audit silang, bukan test.
   */
  volume: VolumeElemen & { jumlahTiang: number; totalPanjangM: number }
  antara: Record<string, number>
  catatan: string[]
}

/**
 * Kapasitas bahan tiang beton.
 *
 *     Pn = 0.30 · f'c · A − 1.2 · Wp
 *     Wp = A · L · γbeton              berat sendiri tiang
 *
 * Berat sendiri DIKURANGKAN, bukan diabaikan: tiang panjang menanggung
 * beratnya sendiri sebelum menanggung beban apa pun, dan pada L = 16 m itu
 * sudah ±48 kN — bukan angka yang bisa dibulatkan hilang.
 */
export function kapasitasBahanTiang(input: InputTiang) {
  const { diameterM, panjangM, fcMpa } = input
  const gammaBeton = input.gammaBetonKnM3 ?? 24
  const fr = input.faktorReduksiBahan ?? 0.6

  const aM2 = Math.PI / 4 * diameterM * diameterM
  const wpKn = aM2 * panjangM * gammaBeton
  const fcKpa = fcMpa * 1000
  const pnKn = 0.3 * aM2 * fcKpa - 1.2 * wpKn
  const pIjinKn = pnKn * fr

  return { aM2, wpKn, fcKpa, pnKn, pIjinKn, fr }
}

/**
 * Daya dukung tanah metode SPT (Meyerhof).
 *
 *     Qult = 40 · Nb · Ab + N̄ · As      [kN]
 *
 *     Nb = N di sekitar ujung tiang
 *     N̄  = rata-rata N sepanjang tiang (berbobot tebal lapisan)
 *     Ab = luas ujung · As = luas selimut
 *
 * Batas atas 380·N̄·Ab (workbook I57) IKUT diperiksa — tanpa itu, tiang di
 * tanah sangat keras menghasilkan kapasitas yang tak pernah terwujud di
 * lapangan karena tiangnya sendiri tak bisa dipancang sedalam itu.
 */
export function dayaDukungSpt(input: InputTiang) {
  const berN = input.lapisan.filter((l) => l.nSpt != null && l.tebalM > 0)
  if (berN.length === 0) throw new Error('dayaDukungSpt: tak ada lapisan ber-N-SPT')

  const totalTebal = berN.reduce((s, l) => s + l.tebalM, 0)
  const jumlahBerbobot = berN.reduce((s, l) => s + l.tebalM * (l.nSpt ?? 0), 0)
  const nRata = jumlahBerbobot / totalTebal
  // Nb = N lapisan TERAKHIR (di ujung tiang), bukan rata-rata.
  const nb = berN[berN.length - 1].nSpt ?? 0

  const abM2 = Math.PI / 4 * input.diameterM * input.diameterM
  const asM2 = Math.PI * input.diameterM * input.panjangM

  const qUltKn = 40 * nb * abM2 + nRata * asM2
  const batasAtasKn = 380 * nRata * abM2
  const qPakaiKn = Math.min(qUltKn, batasAtasKn)
  const fr = input.faktorReduksiTanah ?? 0.6

  return {
    metode: 'SPT (Meyerhof)' as const,
    pUltKn: qPakaiKn,
    pIjinKn: qPakaiKn * fr,
    antara: { nRata, nb, abM2, asM2, qUltKn, batasAtasKn, totalTebal, fr },
  }
}

/** Konversi kg/cm² → kPa (workbook memakai 98.0665). */
export const KGCM2_KE_KPA = 98.0665

/**
 * Daya dukung tanah metode sondir (CPT).
 *
 *     Qb = ω · Ab · qc          tahanan ujung
 *     Qs = Σ (JHP · keliling)   tahanan selimut dari hambatan lekat
 *     Qult = Qb + Qs
 */
export function dayaDukungSondir(input: InputTiang, omega = 1) {
  const berQc = input.lapisan.filter((l) => l.qcKgCm2 != null && l.tebalM > 0)
  if (berQc.length === 0) throw new Error('dayaDukungSondir: tak ada lapisan ber-qc')

  const abM2 = Math.PI / 4 * input.diameterM * input.diameterM
  const kelilingM = Math.PI * input.diameterM
  const qcUjungKgCm2 = berQc[berQc.length - 1].qcKgCm2 ?? 0
  const qcUjungKpa = qcUjungKgCm2 * KGCM2_KE_KPA

  const qbKn = omega * abM2 * qcUjungKpa
  // JHP kg/cm → kN/m: 1 kg/cm = 0.0980665 kN/cm = 9.80665 kN/m
  const qsKn = berQc.reduce(
    (s, l) => s + (l.jhpKgCm ?? 0) * 9.80665 * l.tebalM * kelilingM, 0)

  const qUltKn = qbKn + qsKn
  const fr = input.faktorReduksiTanah ?? 0.6

  return {
    metode: 'Sondir' as const,
    pUltKn: qUltKn,
    pIjinKn: qUltKn * fr,
    antara: { abM2, kelilingM, qcUjungKgCm2, qcUjungKpa, qbKn, qsKn, omega, fr },
  }
}

/** Analisa lengkap: bahan + seluruh metode tanah yang datanya ada. */
export function analisaTiang(input: InputTiang): HasilTiang {
  if (!(input.diameterM > 0)) throw new Error('Diameter tiang harus > 0')
  if (!(input.panjangM > 0)) throw new Error('Panjang tiang harus > 0')
  if (!(input.fcMpa > 0)) throw new Error("f'c harus > 0")

  const catatan: string[] = []
  const bahan = kapasitasBahanTiang(input)

  if (bahan.pnKn <= 0) {
    throw new Error('Kapasitas bahan ≤ 0 — berat sendiri tiang melebihi '
      + "kapasitas penampangnya. Periksa panjang, diameter, dan f'c.")
  }

  const tanah: HasilTiang['tanah'] = []
  const adaN = input.lapisan.some((l) => l.nSpt != null && l.tebalM > 0)
  const adaQc = input.lapisan.some((l) => l.qcKgCm2 != null && l.tebalM > 0)
  if (adaN) tanah.push(dayaDukungSpt(input))
  if (adaQc) tanah.push(dayaDukungSondir(input))

  if (tanah.length === 0) {
    catatan.push('Tak ada data uji tanah (N-SPT atau sondir) — hanya kapasitas '
      + 'BAHAN yang dihitung. Angka ini BUKAN daya dukung tiang: tanah yang '
      + 'menentukan pada hampir semua kasus.')
  }

  const kandidat: { nama: string; nilai: number }[] = [
    { nama: 'bahan', nilai: bahan.pIjinKn },
    ...tanah.map((t) => ({ nama: t.metode, nilai: t.pIjinKn })),
  ]
  const terkecil = kandidat.reduce((a, b) => (b.nilai < a.nilai ? b : a))

  const periksa: HasilTiang['periksa'] = []
  if (input.bebanRencanaKn != null) {
    periksa.push({
      nama: 'Daya dukung tiang', nilai: terkecil.nilai, syarat: input.bebanRencanaKn,
      satuan: 'kN', aman: terkecil.nilai >= input.bebanRencanaKn,
      rasio: input.bebanRencanaKn / terkecil.nilai,
      rumus: `P ijin = min(bahan, tanah) — yang menentukan: ${terkecil.nama}`,
    })
  }

  if (tanah.length > 1) {
    const nilai = tanah.map((t) => t.pIjinKn)
    const sebaran = (Math.max(...nilai) - Math.min(...nilai)) / Math.max(...nilai)
    if (sebaran > 0.5) {
      catatan.push(`SPT dan sondir berselisih ${(sebaran * 100).toFixed(0)}% — `
        + 'periksa data uji tanahnya; yang dipakai yang TERKECIL.')
    }
  }

  const jumlah = input.jumlah ?? 1
  return {
    pIjinBahanKn: bahan.pIjinKn,
    tanah,
    pIjinKn: terkecil.nilai,
    penentu: terkecil.nama,
    periksa,
    aman: periksa.length === 0 ? true : periksa.every((p) => p.aman),
    volume: {
      betonM3: bahan.aM2 * input.panjangM * jumlah,
      /*
        Tiang pancang PRACETAK: tak ada bekisting di proyek, dan tulangannya
        sudah terpasang dari pabrik. Keduanya NOL — dan itu jawaban yang
        benar, bukan data yang hilang.

        Dinyatakan eksplisit supaya `rekapVolume` bisa menjumlahkannya bersama
        elemen cor-di-tempat tanpa crash, dan supaya orang yang membaca rekap
        tahu bahwa nol di sini disengaja.
      */
      bekistingM2: 0,
      besi: [],
      besiTotalKg: 0,
      beratSendiriKg: bahan.aM2 * input.panjangM * jumlah * RHO_BETON,
      jumlahTiang: jumlah,
      totalPanjangM: input.panjangM * jumlah,
    },
    catatan,
    antara: { ...bahan, jumlah },
  }
}
