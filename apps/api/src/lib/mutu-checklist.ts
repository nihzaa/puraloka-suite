// CHECKLIST INSPEKSI + HASIL UJI MATERIAL (G1d).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder mencabut seluruh larangan bangun 2026-08-11 (RATIFIKASI R-011).
// Dari 7 sub-item Mutu, dua ini benar-benar NOL TABEL — dibangun migrasi 279.
//
// ── Tiga keadaan, bukan dua
//
// `lolos` bertipe `boolean NULL`, dan ketiganya berarti hal berbeda:
//
//   null   belum diperiksa   → butuh orang datang memeriksa
//   true   lolos             → selesai
//   false  tidak lolos       → butuh perbaikan, dan WAJIB beralasan
//
// Menyamakan `null` dengan `false` membuat inspeksi yang baru separuh jalan
// terbaca sebagai "banyak yang gagal", memicu tindakan yang belum perlu.
// Menyamakannya dengan `true` jauh lebih berbahaya: pekerjaan yang belum
// diperiksa terhitung lolos.
//
// ── Kenapa kesimpulan uji TIDAK diturunkan dari angka
//
// Godaan terbesarnya satu baris: `nilai >= syarat ? 'memenuhi' : 'tidak'`.
// Itu salah untuk sebagian besar uji nyata:
//
//   • sebagian tak punya ambang tunggal (gradasi, visual, kimia)
//   • sebagian punya toleransi yang butuh penilaian ahli
//   • sebagian dibaca TERBALIK — kadar lumpur pasir: makin kecil makin baik
//
// Menurunkannya otomatis akan menyatakan "tidak memenuhi" untuk hasil yang
// masih dalam toleransi, dan pernyataan itu masuk sertifikat mutu.
//
// Yang dilakukan modul ini: **membandingkan angka, lalu MELAPORKAN bila ia
// tak sejalan dengan kesimpulan manusia** — tanpa mengubah kesimpulannya.
// Selisih pendapat antara angka dan ahli adalah informasi, bukan kesalahan.

export interface ButirChecklist {
  id: string
  urutan: number
  butir: string
  acuan: string | null
  /** `null` = belum diperiksa. Lihat "tiga keadaan" di kepala berkas. */
  lolos: boolean | null
  catatan: string | null
}

export interface RingkasanChecklist {
  total: number
  lolos: number
  gagal: number
  /** Belum diperiksa — DIBEDAKAN dari gagal. */
  belum: number
  /** Persen lolos dari yang SUDAH diperiksa. `null` bila belum ada. */
  pct_lolos: number | null
  /** Persen butir yang sudah diperiksa dari total. */
  pct_selesai: number
  /** Seluruh butir sudah diperiksa. */
  selesai: boolean
  /** Butir gagal dibawa keluar supaya bisa langsung ditindaklanjuti. */
  yang_gagal: ButirChecklist[]
}

/**
 * Ringkas butir-butir satu inspeksi.
 *
 * INVARIAN yang diuji (`__tests__/mutu-checklist.test.ts`):
 *  1. `null` tidak terhitung lolos maupun gagal
 *  2. `pct_lolos` dihitung dari yang SUDAH diperiksa, bukan dari total —
 *     2 dari 10 butir yang keduanya lolos adalah "100% dari yang diperiksa",
 *     bukan "20% lolos" yang terbaca seperti kegagalan
 *  3. `pct_lolos` = `null` saat belum ada yang diperiksa, BUKAN 0 (yang
 *     berarti "semua gagal")
 *  4. `selesai` hanya bila nol butir tersisa
 */
export function ringkasChecklist(butir: ButirChecklist[]): RingkasanChecklist {
  const lolos = butir.filter((b) => b.lolos === true).length
  const gagal = butir.filter((b) => b.lolos === false).length
  const belum = butir.filter((b) => b.lolos === null || b.lolos === undefined).length
  const diperiksa = lolos + gagal

  return {
    total: butir.length,
    lolos,
    gagal,
    belum,
    // `null`, bukan 0: nol persen berarti "semua gagal", dan itu klaim yang
    // tak dimiliki datanya saat penyebutnya nol.
    pct_lolos: diperiksa > 0 ? (lolos / diperiksa) * 100 : null,
    pct_selesai: butir.length > 0 ? (diperiksa / butir.length) * 100 : 0,
    selesai: butir.length > 0 && belum === 0,
    yang_gagal: butir
      .filter((b) => b.lolos === false)
      .sort((a, b) => a.urutan - b.urutan),
  }
}

export type KesimpulanUji = 'memenuhi' | 'tidak_memenuhi' | 'perlu_uji_ulang'

export interface BarisUji {
  id: string
  nomor: string
  objek: string
  jenis_uji: string
  /** `numeric` dari Postgres tiba sebagai string, dan bisa berisi NaN. */
  nilai_hasil: number | string | null
  nilai_syarat: number | string | null
  satuan: string | null
  kesimpulan: KesimpulanUji | null
  tanggal_uji: string
  ncr_id: string | null
}

export interface HasilNilaiUji extends BarisUji {
  /** `nilai_hasil − nilai_syarat`. `null` bila salah satunya tak terbaca. */
  selisih: number | null
  /** Apakah ANGKANYA memadai. `null` bila tak bisa dibandingkan. */
  angka_memadai: boolean | null
  /**
   * Angka dan kesimpulan manusia tidak sejalan.
   *
   * BUKAN berarti salah: uji terbalik (kadar lumpur), toleransi, dan
   * penilaian ahli semuanya sah. Yang penting selisih pendapat itu TERLIHAT
   * supaya bisa ditanyakan.
   */
  bertentangan: boolean
  /** Ada angka tapi belum disimpulkan manusia. */
  perlu_kesimpulan: boolean
}

/**
 * Angka dari Postgres. NaN dan yang tak terbaca jadi `null`.
 *
 * Postgres `numeric` MENERIMA NaN — terbukti di repo ini — dan satu baris
 * NaN meracuni seluruh perbandingan.
 */
function angka(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Bandingkan angka uji dengan syaratnya — TANPA mengubah kesimpulan manusia.
 *
 * INVARIAN yang diuji:
 *  1. kesimpulan diteruskan apa adanya, TIDAK PERNAH ditebak dari angka
 *  2. angka vs kesimpulan yang bertentangan DITANDAI, bukan diperbaiki
 *  3. `perlu_uji_ulang` tak pernah dianggap bertentangan — ia menyatakan
 *     hasilnya belum bisa dipakai, bukan lolos/gagal
 *  4. tanpa syarat, tak ada yang bisa dibandingkan → semuanya `null`
 *  5. NaN tak menghasilkan NaN di keluaran
 */
export function nilaiUji(u: BarisUji): HasilNilaiUji {
  const hasil = angka(u.nilai_hasil)
  const syarat = angka(u.nilai_syarat)

  const bisaDibandingkan = hasil !== null && syarat !== null
  const selisih = bisaDibandingkan ? hasil - syarat : null
  const angkaMemadai = bisaDibandingkan ? hasil >= syarat : null

  // `perlu_uji_ulang` dikeluarkan dari pemeriksaan pertentangan: ia bukan
  // penilaian lolos/gagal, melainkan pernyataan bahwa hasilnya belum bisa
  // dipakai sama sekali.
  const bertentangan =
    angkaMemadai !== null &&
    (u.kesimpulan === 'memenuhi' || u.kesimpulan === 'tidak_memenuhi') &&
    angkaMemadai !== (u.kesimpulan === 'memenuhi')

  return {
    ...u,
    selisih,
    angka_memadai: angkaMemadai,
    bertentangan,
    perlu_kesimpulan: hasil !== null && u.kesimpulan === null,
  }
}

export interface RingkasanUji {
  baris: HasilNilaiUji[]
  memenuhi: number
  tidak_memenuhi: number
  perlu_uji_ulang: number
  belum_disimpulkan: number
  /** Berapa baris yang angkanya tak sejalan dengan kesimpulan manusia. */
  bertentangan: number
}

/** Urutan tampil: yang menuntut tindakan lebih dulu. */
const URUTAN: Record<string, number> = {
  tidak_memenuhi: 0,
  perlu_uji_ulang: 1,
  belum: 2,
  memenuhi: 3,
}

/**
 * Ringkas hasil uji satu proyek.
 *
 * Yang TIDAK MEMENUHI naik ke atas — itu satu-satunya yang menuntut
 * tindakan, dan daftar yang menaruhnya di bawah membuatnya tak pernah dibaca.
 */
export function ringkasUji(daftar: BarisUji[]): RingkasanUji {
  const baris = daftar.map(nilaiUji).sort((a, b) => {
    const ua = URUTAN[a.kesimpulan ?? 'belum'] ?? 9
    const ub = URUTAN[b.kesimpulan ?? 'belum'] ?? 9
    // Dalam kelompok yang sama: yang terbaru lebih dulu — uji lama sudah
    // ditindaklanjuti atau sudah tak relevan.
    return ua - ub || b.tanggal_uji.localeCompare(a.tanggal_uji)
  })

  return {
    baris,
    memenuhi: baris.filter((x) => x.kesimpulan === 'memenuhi').length,
    tidak_memenuhi: baris.filter((x) => x.kesimpulan === 'tidak_memenuhi').length,
    perlu_uji_ulang: baris.filter((x) => x.kesimpulan === 'perlu_uji_ulang').length,
    belum_disimpulkan: baris.filter((x) => x.kesimpulan === null).length,
    bertentangan: baris.filter((x) => x.bertentangan).length,
  }
}
