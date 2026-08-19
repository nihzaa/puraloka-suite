// Jembatan: volume hasil analisa struktur → item RAB ber-AHSP. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA — DAN KENAPA IA TUJUAN AWAL SELURUH MODUL STRUKTUR
// ══════════════════════════════════════════════════════════════════════════════
//
// Modul struktur menghitung volume beton, bekisting, besi, dan baja profil.
// Basis ini sudah punya 3.043 assembly AHSP lengkap dengan bahan, upah, dan
// alat (diukur, bukan ditaksir). Yang TIDAK ada di antara keduanya: apa pun
// yang menyambungkan.
//
// Akibatnya estimator MENGETIK ULANG angka dari layar analisa ke RAB. Dan
// begitu desainnya berubah — balok 300×500 jadi 300×520 — RAB tidak ikut
// berubah, tanpa satu pun galat yang memberi tahu. Itu persis masalah yang
// disebut di kepala `struktur-beton.ts` sebagai alasan modul ini dibangun:
//
//     "Yang kedua diketik ULANG dari yang pertama… Selisihnya baru ketahuan
//      saat besi di lapangan kurang, yaitu saat uangnya sudah keluar."
//
// Tanpa berkas ini, seluruh modul struktur berhenti di layar analisa dan
// masalah itu tetap utuh.
//
// ── Yang berkas ini TIDAK lakukan, dan itu disengaja
//
// Ia MENGUSULKAN, tidak MENERAPKAN. Keluarannya daftar usulan item RAB; yang
// memasukkannya ke `estimate_items` adalah manusia lewat tombol.
//
// Alasannya sama persis dengan yang sudah diputuskan untuk takeoff dimensi
// (lihat catatan `crm-boq` di peta-menu): menimpa `quantity` otomatis akan
// menggeser nilai kontrak dan progres lapangan yang tak bisa dibuat ulang,
// tanpa galat dan tanpa keputusan siapa pun.
//
// ── Kenapa pencocokan assembly berbasis POLA, bukan id yang dipaku
//
// Kode assembly berbeda antar edisi AHSP dan antar tenant (ada 3.043 baris,
// sebagian hasil impor pelanggan). Memaku id berarti jembatan ini rusak diam-
// diam begitu tenant memakai edisi lain — dan rusaknya berupa item RAB yang
// menunjuk pekerjaan yang salah, bukan galat.
//
// Yang dipakai: POLA PENCARIAN yang dinyatakan di sini, dicocokkan pemanggil
// ke tabel assembly milik tenantnya. Yang tak ketemu DILAPORKAN, bukan
// dilewati — item RAB yang hilang diam-diam adalah kekurangan anggaran.
// ══════════════════════════════════════════════════════════════════════════════

import type { VolumeElemen } from './struktur-beton'

/** Jenis pekerjaan yang bisa diturunkan dari volume struktur. */
export type JenisPekerjaan =
  | 'beton'
  | 'bekisting'
  | 'pembesian'
  | 'baja-profil'

/**
 * Satu usulan item RAB.
 *
 * `assemblyPola` bukan id: ia petunjuk pencarian untuk pemanggil. Lihat alasan
 * di kepala berkas.
 */
export interface UsulanItemRab {
  jenis: JenisPekerjaan
  /** Uraian yang dibaca manusia di layar usulan. */
  uraian: string
  /** Kuantitas hasil analisa struktur. */
  kuantitas: number
  /** Satuan RAB — HARUS cocok dengan `output_unit_code` assembly-nya. */
  satuan: 'm3' | 'm2' | 'kg'
  /**
   * Satuan & kuantitas PEMBELIAN untuk RAP — beda dari RAB, dan itu disengaja.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * RAB DIJUAL PER KG, RAP DIBELI PER BATANG
   *
   * AHSP menghitung baja dan besi per KILOGRAM, karena itu satuan yang dipakai
   * menyusun harga jual. Tetapi yang benar-benar dibeli adalah BATANG utuh:
   * baja profil 12 m, besi beton 12 m, pelat per LEMBAR.
   *
   * Balok 5 m berarti satu batang 12 m dipotong, dan sisa 7 m-nya belum tentu
   * terpakai di tempat lain. RAP yang memakai kilogram terpasang KEKURANGAN
   * uang untuk sisa itu — dan kekurangannya tak terlihat karena angkanya
   * "benar" menurut satuan yang dipakai.
   *
   * Keduanya dibawa BERSAMA, tak dipilih salah satu: RAB butuh kg untuk
   * dikalikan HSP, RAP butuh batang untuk dipesan. Menyimpan satu saja berarti
   * yang lain dihitung ulang oleh manusia — dan di situlah selisih lahir.
   * ══════════════════════════════════════════════════════════════════════════
   */
  beli?: {
    /** Berapa banyak yang dibeli. */
    kuantitas: number
    satuan: 'btg' | 'lbr'
    /** Panjang/ukuran satu satuan beli, untuk ditulis di RAP. */
    ukuranPerSatuan: string
    /**
     * Berat yang benar-benar TERPASANG, kg — lebih kecil dari yang dibeli.
     *
     * Dibawa supaya selisihnya bisa ditampilkan alih-alih ditemukan sendiri
     * oleh yang membandingkan RAB dan RAP.
     */
    terpasangKg: number
  }
  /**
   * Kata kunci untuk mencari assembly yang cocok, urut dari yang paling
   * spesifik. Pemanggil mencoba berurutan dan berhenti di yang pertama ketemu.
   */
  assemblyPola: string[]
  /** Dari elemen mana angka ini datang — supaya bisa ditelusuri balik. */
  asal: { kodeElemen: string; jenisElemen: string }
  /**
   * Batas yang HARUS ikut terbaca bersama angkanya.
   *
   * Diteruskan dari `catatan` modul analisa. Tanpa ini, usulan RAB kehilangan
   * keterangan bahwa volume besinya belum termasuk penyaluran — dan angka
   * yang 26% kurang tanpa keterangan adalah cara paling rapi membuat orang
   * salah.
   */
  catatan: string[]
}

/**
 * Pola pencarian assembly per jenis pekerjaan & jenis elemen.
 *
 * Ditulis sebagai DATA supaya bisa diperiksa tanpa membaca logika, dan supaya
 * menambah jenis elemen berarti menambah satu baris — bukan menyunting
 * rangkaian if yang tersebar.
 *
 * Bekisting dipisah per elemen karena AHSP-nya memang berbeda: bekisting
 * kolom, balok, pelat, dan pondasi telapak punya koefisien upah yang berbeda
 * (diukur di basis: `2.2.1.3.1` telapak, `.3` kolom, `.4` balok).
 */
const POLA_BEKISTING: Record<string, string[]> = {
  balok: ['bekisting untuk balok', 'bekisting balok', 'bekisting'],
  kolom: ['bekisting untuk kolom', 'bekisting kolom', 'bekisting'],
  kolom_bulat: ['bekisting untuk kolom', 'bekisting kolom', 'bekisting'],
  plat: ['bekisting untuk lantai', 'bekisting untuk plat', 'bekisting plat', 'bekisting'],
  footplat: ['bekisting untuk pondasi telapak', 'bekisting pondasi', 'bekisting'],
  pilecap: ['bekisting untuk pondasi telapak', 'bekisting pondasi', 'bekisting'],
  tiang: [],   // precast — tak ada bekisting di proyek
}

const POLA_BETON: string[] = [
  'beton mutu', 'beton fc', 'membuat 1 m3 beton', 'beton',
]

const POLA_PEMBESIAN: string[] = [
  'pembesian', 'tulangan beton dengan besi polos / ulir', 'tulangan beton', 'besi beton',
]

const POLA_BAJA_PROFIL: string[] = [
  'pabrikasi dan ereksi baja profil', 'baja profil', 'baja',
]

/** Bentuk minimum yang dibutuhkan dari hasil analisa mana pun. */
export interface ElemenTerhitung {
  kode: string
  /** balok · kolom · plat · footplat · pilecap · tiang · balok_baja · kolom_baja */
  jenis: string
  volume: VolumeElemen
  catatan?: string[]
}

/**
 * Ubah hasil analisa satu elemen jadi usulan item RAB.
 *
 * Baris berkuantitas NOL DILEWATI, bukan diusulkan dengan angka nol: item RAB
 * bervolume nol tetap muncul di dokumen penawaran dan membuat pembacanya
 * mengira ada pekerjaan yang belum diisi harganya.
 *
 * Yang TIDAK dilewati: elemen yang memang bervolume nol untuk alasan nyata —
 * tiang pancang precast tak punya bekisting, dan itu sudah dinyatakan di
 * `catatan` modulnya, bukan disembunyikan di sini.
 */
export function usulanDariElemen(el: ElemenTerhitung): UsulanItemRab[] {
  const usulan: UsulanItemRab[] = []
  const asal = { kodeElemen: el.kode, jenisElemen: el.jenis }
  const catatan = el.catatan ?? []

  if (el.volume.betonM3 > 0) {
    usulan.push({
      jenis: 'beton',
      uraian: `Beton ${namaElemen(el.jenis)} ${el.kode}`,
      kuantitas: el.volume.betonM3,
      satuan: 'm3',
      assemblyPola: POLA_BETON,
      asal,
      catatan,
    })
  }

  if (el.volume.bekistingM2 > 0) {
    const pola = POLA_BEKISTING[el.jenis] ?? POLA_BEKISTING.balok
    usulan.push({
      jenis: 'bekisting',
      uraian: `Bekisting ${namaElemen(el.jenis)} ${el.kode}`,
      kuantitas: el.volume.bekistingM2,
      satuan: 'm2',
      assemblyPola: pola,
      asal,
      catatan,
    })
  }

  /*
    BESI DIPECAH per baris, bukan dijumlahkan jadi satu angka kilogram.

    Alasannya bukan kerapian: tulangan beton (BjTS/BjTP) dan baja profil punya
    AHSP yang SAMA SEKALI BERBEDA — pembesian dihitung per kg dengan upah
    tukang besi, sementara baja profil butuh pabrikasi, pengelasan, dan crane.
    Menjumlahkannya berarti seluruh baja profil dihargai sebagai tulangan
    beton, dan selisihnya besar.

    Diameter juga dibawa: D16 dan D10 berbeda harganya, dan RAB yang menyebut
    "besi 500 kg" tanpa diameter tak bisa dipesan ke supplier.
  */
  for (const b of el.volume.besi) {
    if (b.totalKg <= 0) continue

    const profil = b.peran.startsWith('profil ')
    usulan.push({
      jenis: profil ? 'baja-profil' : 'pembesian',
      uraian: profil
        ? `${b.peran} — ${el.kode}`
        : `Pembesian ${b.tipe} Ø${b.diameterMm} (${b.peran}) — ${el.kode}`,
      kuantitas: b.totalKg,
      satuan: 'kg',
      assemblyPola: profil ? POLA_BAJA_PROFIL : POLA_PEMBESIAN,
      asal,
      catatan,
    })
  }

  return usulan
}

/**
 * Gabungkan usulan dari banyak elemen.
 *
 * DIGABUNG per (jenis pekerjaan, satuan, pola assembly, uraian dasar) — bukan
 * per elemen. Satu proyek dengan 40 balok tak boleh menghasilkan 40 baris
 * "beton balok" di RAB: yang dibeli beton, sekali, sejumlah totalnya.
 *
 * Yang TETAP terpisah: diameter besi yang berbeda, dan profil baja yang
 * berbeda. Keduanya barang berbeda yang dipesan terpisah.
 *
 * `asal` dikumpulkan jadi daftar supaya angka gabungan tetap bisa ditelusuri
 * balik ke elemen penyusunnya — tanpa itu, RAB berisi angka yang tak bisa
 * ditanya "dari mana?".
 */
export interface UsulanGabungan {
  jenis: JenisPekerjaan
  uraian: string
  kuantitas: number
  satuan: 'm3' | 'm2' | 'kg'
  assemblyPola: string[]
  /** Elemen penyusunnya — supaya angkanya bisa ditelusuri. */
  asal: { kodeElemen: string; jenisElemen: string }[]
  catatan: string[]
  /** Satuan pembelian untuk RAP — lihat `UsulanItemRab.beli`. */
  beli?: {
    kuantitas: number
    satuan: 'btg' | 'lbr'
    ukuranPerSatuan: string
    terpasangKg: number
  }
}

export function gabungUsulan(usulan: UsulanItemRab[]): UsulanGabungan[] {
  const peta = new Map<string, UsulanGabungan>()

  for (const u of usulan) {
    /*
      Kunci penggabungan menyertakan URAIAN TANPA kode elemen.

      "Beton balok B1" dan "Beton balok B2" harus tergabung; "Pembesian BjTS
      Ø16" dan "Pembesian BjTS Ø10" TIDAK boleh — keduanya barang berbeda.
      Karena itu yang dibuang dari kunci cuma bagian setelah tanda pisah.
    */
    const uraianDasar = u.uraian.split(' — ')[0].replace(/\s+\S+$/, (s) =>
      // Buang kode elemen di akhir untuk beton/bekisting ("Beton balok B1").
      (u.jenis === 'beton' || u.jenis === 'bekisting') ? '' : s)
    const kunci = `${u.jenis}|${u.satuan}|${uraianDasar}|${u.assemblyPola[0]}`

    const ada = peta.get(kunci)
    if (ada) {
      ada.kuantitas += u.kuantitas
      ada.asal.push(u.asal)
      for (const c of u.catatan) if (!ada.catatan.includes(c)) ada.catatan.push(c)
    } else {
      peta.set(kunci, {
        jenis: u.jenis,
        uraian: uraianDasar.trim(),
        kuantitas: u.kuantitas,
        satuan: u.satuan,
        assemblyPola: u.assemblyPola,
        asal: [u.asal],
        catatan: [...u.catatan],
      })
    }
  }

  // Urut: beton → bekisting → pembesian → baja, mengikuti urutan pengerjaan
  // di lapangan. RAB yang urutannya acak sulit diperiksa orang.
  const urutan: Record<JenisPekerjaan, number> = {
    beton: 1, bekisting: 2, pembesian: 3, 'baja-profil': 4,
  }
  return [...peta.values()].sort(
    (a, b) => urutan[a.jenis] - urutan[b.jenis] || a.uraian.localeCompare(b.uraian),
  )
}

/** Nama jenis elemen dalam bahasa lapangan. */
function namaElemen(jenis: string): string {
  const nama: Record<string, string> = {
    balok: 'balok', kolom: 'kolom', kolom_bulat: 'kolom bulat',
    plat: 'pelat lantai', footplat: 'pondasi footplat',
    pilecap: 'pilecap', tiang: 'tiang pancang',
    balok_baja: 'balok baja', kolom_baja: 'kolom baja',
  }
  return nama[jenis] ?? jenis
}
