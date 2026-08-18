// Kolom + diagram P-M penuh — penyambung yang MENUTUP batas Fase 1.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS PENYAMBUNG, bukan ditambahkan langsung ke modul kolomnya
// ══════════════════════════════════════════════════════════════════════════════
//
// `struktur-diagram-pm.ts` mengimpor `batangLingkaran` dari
// `struktur-kolom-bulat.ts`. Menambahkan pemakaian diagram ke dalam modul
// kolom akan membuat impor MELINGKAR — dan lingkaran impor di TypeScript tidak
// selalu gagal saat compile; ia bisa lolos lalu memulangkan `undefined` saat
// runtime, pada modul mana yang lebih dulu dimuat.
//
// Berkas ini memutusnya: arah impor tetap satu arah,
//
//     struktur-beton ─┬─> struktur-kolom-bulat ─┐
//                     └─> struktur-diagram-pm <─┘
//                              ↑
//                     struktur-kolom-lengkap  (di sini)
//
// ── Apa yang ditutup
//
// Sampai Fase 1, kedua modul kolom hanya memeriksa DUA titik (tekan sentris &
// balance) dan menyatakan batasnya di `catatan`. Kolom dengan momen besar pada
// aksial kecil bisa lolos dengan verdict "aman" padahal titik bebannya jauh di
// luar kurva.
//
// Fungsi di sini menggabungkan keduanya: pemeriksaan detail dari modul kolom
// (rasio tulangan, jarak sengkang, jumlah batang) DITAMBAH verdict P-M penuh
// yang menguji titik beban secara aljabar.
// ══════════════════════════════════════════════════════════════════════════════

import { analisaKolom, type InputKolom, type HasilElemen, type Periksa } from './struktur-beton'
import { analisaKolomBulat, FAKTOR_PN_MAX, PHI_TEKAN, type InputKolomBulat, type HasilKolomBulat } from './struktur-kolom-bulat'
import {
  diagramPM, cekTitikBeban, penampangPersegi, penampangLingkaran,
  type DiagramPM, type HasilCekTitik,
} from './struktur-diagram-pm'

export interface HasilKolomLengkap {
  /** Hasil pemeriksaan detail dari modul kolom. */
  dasar: HasilElemen | HasilKolomBulat
  /** Kurva kapasitas penuh. */
  diagram: DiagramPM
  /** Verdict titik beban terhadap kurva — ALJABAR, bukan visual. */
  titikBeban: HasilCekTitik
  /** Gabungan: aman hanya bila pemeriksaan dasar DAN titik beban lolos. */
  periksa: Periksa[]
  aman: boolean
  catatan: string[]
}

/**
 * Kolom persegi — pemeriksaan lengkap termasuk diagram P-M.
 *
 * `langkah` menentukan ketelitian kurva. 200 sudah jauh melebihi 170 baris
 * workbook; menaikkannya tak berbiaya sel, hanya waktu hitung (mikrodetik).
 */
export function analisaKolomLengkap(input: InputKolom, langkah = 200): HasilKolomLengkap {
  const dasar = analisaKolom(input)

  const penampang = penampangPersegi({
    bMm: input.bMm, hMm: input.hMm, selimutMm: input.selimutMm,
    dUtamaMm: input.dUtamaMm, dSengkangMm: input.dSengkangMm,
    nBarisTegakLurus: input.nBarisX, nBarisSearah: input.nBarisY,
    mutu: input.mutu,
  })

  return gabung(dasar, penampang, input.puKn, input.muKnm, langkah)
}

/**
 * Kolom lingkaran — pemeriksaan lengkap termasuk diagram P-M.
 *
 * ⚠ Kurva lingkaran memakai lebar ekuivalen Ag/D (lihat `penampangLingkaran`).
 * Batas itu diteruskan ke `catatan` hasil, bukan hilang di perjalanan.
 */
export function analisaKolomBulatLengkap(
  input: InputKolomBulat, langkah = 200,
): HasilKolomLengkap {
  const dasar = analisaKolomBulat(input)

  const penampang = penampangLingkaran({
    diameterMm: input.diameterMm, nTulangan: input.nTulangan,
    selimutMm: input.selimutMm, dUtamaMm: input.dUtamaMm,
    dPengekangMm: input.dPengekangMm, mutu: input.mutu,
    faktorPnMax: FAKTOR_PN_MAX[input.pengekang],
    phiTekan: PHI_TEKAN[input.pengekang],
  })

  const h = gabung(dasar, penampang, input.puKn, input.muKnm, langkah)
  h.catatan.push('Kurva P-M penampang lingkaran memakai lebar EKUIVALEN Ag/D; '
    + 'blok tekan sesungguhnya berbentuk tembereng. Kapasitas momen di ujung '
    + 'tarik kurva (Pu rendah) karena itu sedikit optimistis — verifikasi '
    + 'manual bila titik beban berada di daerah itu.')
  return h
}

function gabung(
  dasar: HasilElemen | HasilKolomBulat,
  penampang: Parameters<typeof diagramPM>[0],
  puKn: number, muKnm: number, langkah: number,
): HasilKolomLengkap {
  const diagram = diagramPM(penampang, langkah)
  const titikBeban = cekTitikBeban(diagram, puKn, muKnm)

  /*
    Verdict P-M ditambahkan sebagai pemeriksaan TERSENDIRI, bukan menimpa
    verdict aksial. Keduanya menjawab pertanyaan berbeda:

      "Kapasitas aksial"  cukupkah kolom menahan Pu bila TAK ADA momen?
      "Titik beban P-M"   cukupkah kolom menahan Pu DAN Mu bersamaan?

    Yang kedua selalu lebih ketat. Menggabungkannya jadi satu baris akan
    menyembunyikan mana yang menentukan — dan itu justru yang perlu diketahui
    saat mencari tahu apa yang harus diperbesar.
  */
  const periksaPM: Periksa = {
    nama: 'Titik beban pada diagram P-M',
    nilai: titikBeban.phiMnPadaPuKnm,
    syarat: muKnm,
    satuan: 'kNm',
    aman: titikBeban.aman,
    rasio: titikBeban.rasio,
    rumus: 'φMn pada tingkat Pu (interpolasi kurva) ≥ Mu',
  }

  const periksa = [...dasar.periksa, periksaPM]

  // `HasilElemen` (kolom persegi) tidak punya `catatan`; `HasilKolomBulat`
  // punya. Diakses lewat penjagaan alih-alih cast — cast akan memulangkan
  // undefined lalu menyebar sebagai crash di pemakainya.
  const catatanDasar = 'catatan' in dasar && Array.isArray(dasar.catatan)
    ? dasar.catatan : []

  const catatan = [
    // Catatan lama modul kolom menyatakan "BUKAN diagram P-M penuh" — di sini
    // batas itu SUDAH ditutup, jadi catatannya dibuang agar tak menyesatkan.
    ...catatanDasar.filter((c: string) => !/BUKAN diagram interaksi P-M penuh/i.test(c)),
    ...titikBeban.catatan,
  ]

  return {
    dasar, diagram, titikBeban, periksa,
    aman: periksa.every((p) => p.aman),
    catatan,
  }
}
