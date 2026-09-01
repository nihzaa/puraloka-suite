// apps/api/src/lib/rangka-ke-saran.ts
// Penyambung: hasil solver rangka 2D → rekomendasi pembesian tiap batang.
// PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════════
//
// `struktur-saran.ts` menutup sendiri di komentar pembukanya:
//
//     "Momen dan geser terfaktor (Mu, Vu) tetap MASUKAN. Menghitungnya butuh
//      analisa portal, dan itu pekerjaan lain yang belum ada di repo ini."
//
// Analisa portal itu SEKARANG ADA (`rangka-portal.ts`, lapis 3). Berkas ini
// menyambungkan keduanya, sehingga pemakainya cukup memberi geometri dan beban
// — bukan mengetik Mu/Vu/Pu yang harus ia hitung sendiri di tempat lain.
//
// Ini melengkapi tangga ketelitian yang sudah ada untuk satu pertanyaan yang
// sama ("besinya berapa?"):
//
//     `sarankanBalok`            ← Mu/Vu diketik pemakainya
//     `sarankanBalokDariBeban`   ← Mu/Vu dari koefisien PENDEKATAN (SNI 1727)
//     `sarankanDariRangka`       ← Mu/Vu/Pu dari solver kekakuan langsung
//
// ── NOL HITUNGAN STRUKTUR DI SINI, dan itu sengaja
//
// Tak ada satu pun rumus di berkas ini. Yang dilakukan hanya: panggil solver →
// pilah batang → teruskan angkanya ke mesin saran yang sudah ada. Alasannya
// sama dengan yang ditulis `struktur-saran.ts` dan `gayaLateralDariGempa`:
// rumus kedua untuk angka yang sama akan menyimpang suatu hari, dan dua rumus
// yang menyimpang TIDAK MELEMPAR APA PUN. Cara termurah menutupnya adalah
// tidak pernah membuat kembarannya.

import {
  analisaPortal,
  type InputPortal,
  type HasilPortal,
} from './rangka-portal.js'
import type { HasilBatang } from './rangka-model.js'
import {
  sarankanBalok,
  sarankanKolom,
  type HasilSaran,
  type UsulanBalok,
  type UsulanKolom,
} from './struktur-saran.js'
import type { MutuBahan } from './struktur-beton.js'

export interface InputSaranDariRangka {
  /** Geometri + beban portal — diteruskan APA ADANYA ke `analisaPortal`. */
  portal: InputPortal
  /** Selimut beton, mm — sama untuk balok dan kolom. */
  selimutMm: number
  /** Mutu bahan tulangan & beton untuk pemeriksaan pembesian. */
  mutu: MutuBahan
}

export interface SaranBatang {
  /** Nama batang dari solver — `K…` kolom, `B…` balok. */
  nama: string
  jenis: 'balok' | 'kolom'
  /** Momen terfaktor yang DIPAKAI memilih tulangan, kNm. */
  muKnm: number
  /** Geser terfaktor yang DIPAKAI memilih tulangan, kN. */
  vuKn: number
  /** Aksial terfaktor, kN. Nol untuk balok — baloknya memang tak dipikul aksial. */
  puKn: number
  saran: HasilSaran<UsulanBalok> | HasilSaran<UsulanKolom>
}

export interface HasilSaranDariRangka {
  batang: SaranBatang[]
  /**
   * Hasil solver UTUH — supaya diagram M/V/lendutan bisa digambar pemanggil,
   * DAN supaya `reaksi` tumpuannya sampai ke layar.
   *
   * ⚠ `reaksi` bukan hiasan tabel. Ia satu-satunya angka di seluruh keluaran
   * ini yang bisa DIPERIKSA SENDIRI oleh pembacanya di atas kertas:
   *
   *     Σ fyKn  =  total beban vertikal  =  q × L
   *
   * Tanpanya, memakai usulan tulangan di atas berarti mempercayai solver —
   * tak ada jalan lain. Versi pertama berkas ini membuangnya (Object.keys
   * memulangkan hanya [batang, catatan]) karena ditulis sebelum `reaksi` ada
   * di lapis bawah, dan hilangnya tak menimbulkan satu pun galat.
   */
  rangka: HasilPortal
  /** Batas solver + batas mesin tulangan, di-dedup. WAJIB ikut ditampilkan. */
  catatan: string[]
}

/**
 * Nilai rencana dari sepasang ekstrem solver.
 *
 * ⚠ TIDAK DIBULATKAN — dan itu keputusan, bukan kelalaian.
 *
 * Membulatkannya "biar rapi di layar" membuat angka yang TAMPIL berbeda dari
 * angka yang MEMILIH TULANGAN. Keduanya terlihat wajar, keduanya konsisten
 * sendiri, dan tak ada satu pun galat yang menunjuk selisihnya (pelajaran
 * 5b43d275). Pembulatan untuk tampilan adalah urusan lapisan tampilan,
 * bukan urusan lapisan yang menghitung.
 *
 * Dipakai `Math.abs` pada keduanya karena tanda momen menyatakan SISI SERAT
 * yang tertarik, bukan besar tuntutan: momen tumpuan −41,93 kNm menuntut
 * kapasitas yang sama besar dengan +41,93 kNm, hanya di sisi lain penampang.
 * Mesin saran ini mengusulkan tulangan tarik saja, jadi yang relevan besarnya.
 */
function ekstrem(maks: number, min: number): number {
  return Math.max(Math.abs(maks), Math.abs(min))
}

/**
 * Usulkan pembesian SELURUH batang portal dari geometri & bebannya.
 *
 * Satu panggilan solver, lalu satu usulan per batang. Kolom dan balok
 * dipilah dari NAMA batang — `analisaPortal` menamai kolom berawalan `K` dan
 * balok berawalan `B`, dan komentarnya sendiri menyatakan penamaan itu
 * "DIPAKAI PEMANGGIL untuk memilah". Berkas ini adalah pemanggil itu.
 *
 * @throws galat validasi dari `analisaPortal` / `sarankanBalok` /
 *   `sarankanKolom` — sengaja TIDAK ditangkap. Masukan yang tak masuk akal
 *   harus berhenti di sini, bukan diteruskan sebagai usulan yang terlihat sah.
 */
export function sarankanDariRangka(
  input: InputSaranDariRangka,
): HasilSaranDariRangka {
  const rangka = analisaPortal(input.portal)

  const batang: SaranBatang[] = rangka.batang.map((b: HasilBatang) => {
    const muKnm = ekstrem(b.momenKnm.maks, b.momenKnm.min)
    const vuKn = ekstrem(b.geserKn.maks, b.geserKn.min)

    if (b.nama.startsWith('K')) {
      /*
        Aksial kolom NEGATIF berarti TEKAN (konvensi `rangka-model.ts`), dan
        itulah keadaan lazim kolom gedung. `sarankanKolom` menuntut Pu ≥ 0
        sebagai BESAR beban tekan, jadi yang diteruskan besarnya.
      */
      const puKn = Math.abs(b.aksialKn)
      return {
        nama: b.nama,
        jenis: 'kolom' as const,
        muKnm,
        vuKn,
        puKn,
        saran: sarankanKolom({
          bMm: input.portal.kolom.bMm,
          hMm: input.portal.kolom.hMm,
          tinggiM: input.portal.tinggiM,
          selimutMm: input.selimutMm,
          mutu: input.mutu,
          puKn,
          muKnm,
        }),
      }
    }

    /*
      Balok: `puKn` sengaja 0 dan itu BUKAN "aksial yang diabaikan".
      `sarankanBalok` memang tak menerima aksial sama sekali — balok portal
      bidang ini dianggap lentur murni. Angka nol di sini hanya penanda bagi
      pembacanya, dan tak ikut ke perhitungan mana pun.
    */
    return {
      nama: b.nama,
      jenis: 'balok' as const,
      muKnm,
      vuKn,
      puKn: 0,
      saran: sarankanBalok({
        bMm: input.portal.balok.bMm,
        hMm: input.portal.balok.hMm,
        panjangM: input.portal.bentangM,
        selimutMm: input.selimutMm,
        mutu: input.mutu,
        muKnm,
        vuKn,
      }),
    }
  })

  /*
    Catatan solver LEBIH DULU: ia menjelaskan DARI MANA angkanya (elastis
    linier, tanpa P-Δ, satu bidang), dan itu yang perlu dibaca sebelum menilai
    usulan tulangannya. Pola yang sama dengan `sarankanBalokDariBeban`.

    Di-dedup karena tiga batang mewarisi batas mesin tulangan yang sama persis
    ("ESTIMASI AWAL…", "Berat besi belum termasuk…"): tanpa dedup, layar
    menampilkan kalimat identik berkali-kali, dan daftar batas yang bertele-tele
    justru berhenti dibaca — yang membuat batasnya hilang sama efektifnya
    dengan tidak menuliskannya.
  */
  const catatan = [
    ...new Set([...rangka.catatan, ...batang.flatMap((b) => b.saran.catatan)]),
  ]

  return { batang, rangka, catatan }
}
