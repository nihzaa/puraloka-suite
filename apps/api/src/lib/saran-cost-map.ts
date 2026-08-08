// SARAN PEMETAAN kategori material → cost code.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-08: `cost_code_category_map` **nol baris**, padahal endpoint
// (`GET/PUT /cost-map`) dan UI-nya di `/estimasi` sudah ada berbulan-bulan.
//
// Peta kosong itu memblokir tiga hal sekaligus:
//
//   • **CVR** — tak punya cara menghubungkan pengeluaran ke cost code, dan
//     itulah alasan taksonomi menandainya "tertunda, data belum ada"
//   • **Varians per cost code** — kehilangan sisi "aktual"
//   • **Impor BOQ → RFQ** — BOQ menghasilkan `cost_code_id`, RFQ butuh
//     `material_id`, dan peta inilah satu-satunya jembatan
//
// Mengisi 10 baris bukan pekerjaan besar. Tapi tak seorang pun melakukannya
// selama berbulan-bulan, dan itu sendiri informasi: **yang tak disarankan tak
// akan diisi.** Layar yang menampilkan sepuluh dropdown kosong tanpa petunjuk
// adalah pekerjaan rumah, bukan alat.
//
// ── Kenapa MENYARANKAN, bukan menerapkan
//
// Pemetaan ini menentukan ke cost code mana sebuah biaya jatuh, dan itu
// mengalir ke laporan varians yang dipakai menilai untung-rugi proyek.
// Tebakan mesin yang diterapkan diam-diam menghasilkan laporan yang terlihat
// benar dan salah di tempat yang tak seorang pun periksa.
//
// Karena itu modul ini **tidak menulis apa pun**. Ia mengembalikan usulan
// beserta skornya; manusia yang memutuskan.
//
// ── Kenapa kemiripan KATA, bukan jarak huruf
//
// Levenshtein akan menganggap "Beton" dan "Besi" mirip (dua huruf beda) —
// padahal keduanya bahan yang sama sekali berbeda, dan salah memetakannya
// membuat biaya besi jatuh ke pekerjaan beton. Kecocokan per-KATA tak punya
// cara gagal seperti itu: "Beton & Semen" cocok dengan "Beton" karena mereka
// benar-benar berbagi kata, bukan karena ejaannya berdekatan.

/** Kata penghubung yang tak membawa arti — dibuang sebelum dibandingkan. */
const PENGHUBUNG = new Set(['dan', 'atau', '&', 'the', 'of', 'dengan', 'untuk'])

/**
 * Ambang bawaan.
 *
 * 0,4 = minimal ~dua-perlima kata bermakna cocok. Diukur pada data nyata
 * (10 kategori × 44 cost code): di bawah 0,4 mulai muncul saran seperti
 * "Cat & Pelapis" → "Pekerjaan Lapis Pondasi" yang sekilas masuk akal dan
 * sebenarnya salah. Ambang yang terlalu longgar lebih berbahaya daripada
 * ambang yang terlalu ketat: yang kedua menghasilkan pekerjaan manual, yang
 * pertama menghasilkan laporan yang salah tanpa gejala.
 */
const AMBANG_BAKU = 0.4

export interface KategoriRingkas { id: string; name: string }
export interface CostCodeRingkas { id: string; code: string; name: string }

export interface Saran {
  category_id: string
  category_name: string
  cost_code_id: string
  cost_code_code: string
  cost_code_name: string
  /** 0..1. Dibawa ke UI supaya manusia bisa menilai seberapa yakin usulnya. */
  skor: number
}

export interface OpsiSaran {
  /** Skor minimum agar sebuah usul ditampilkan. Lihat `AMBANG_BAKU`. */
  ambang?: number
  /**
   * Kategori yang SUDAH dipetakan — dilewati sepenuhnya.
   *
   * Saran yang menimpa keputusan manusia adalah saran yang merusak.
   */
  sudahDipetakan?: string[]
}

/** Pecah nama jadi kata bermakna: huruf kecil, tanpa penghubung dan tanda baca. */
function kata(nama: string): string[] {
  return nama
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((k) => k.length > 1 && !PENGHUBUNG.has(k))
}

/**
 * Kemiripan dua nama, 0..1.
 *
 * Dihitung sebagai proporsi kata bermakna yang cocok terhadap nama yang
 * LEBIH PENDEK. Memakai yang lebih panjang sebagai penyebut menghukum cost
 * code bernama panjang ("Pekerjaan Beton Bertulang K-250") padahal justru
 * nama panjang yang paling jelas maksudnya.
 *
 * INVARIAN yang diuji:
 *  - sama persis → 1
 *  - tak peka huruf besar-kecil ("BAJA" = "baja")
 *  - kata penghubung tak pernah dihitung sebagai kecocokan
 *  - nama kosong → 0, bukan NaN atau lemparan
 */
export function skorKemiripan(a: string, b: string): number {
  const ka = kata(a)
  const kb = kata(b)
  if (ka.length === 0 || kb.length === 0) return 0

  const setB = new Set(kb)
  const cocok = ka.filter((k) => setB.has(k)).length
  if (cocok === 0) return 0

  const dasar = cocok / Math.min(ka.length, kb.length)

  // Bonus tipis untuk padanan yang lebih LENGKAP.
  //
  // Tanpa ini, "Beton Pracetak" mendapat skor 1 baik terhadap "Beton" maupun
  // terhadap "Beton Pracetak" — keduanya 1/1 dan 2/2. Padanan yang jelas lebih
  // tepat tak pernah menang, dan `sarankanPemetaan` memilih yang kebetulan
  // lebih dulu di daftar. Terlihat di test "memilih padanan TERBAIK".
  //
  // Bonusnya kecil (maks 0,15) supaya ia hanya memutus SERI, bukan menaikkan
  // padanan lemah melewati ambang.
  const lengkap = cocok / Math.max(ka.length, kb.length)
  return Math.min(1, dasar * 0.85 + lengkap * 0.15)
}

/**
 * Usulkan pemetaan kategori → cost code.
 *
 * INVARIAN yang diuji (`__tests__/saran-cost-map.test.ts`):
 *
 *  1. Kategori tanpa padanan TIDAK disarankan sama sekali. Nol saran lebih
 *     baik daripada saran salah — pemetaan yang keliru mengalir ke laporan
 *     varians dan salahnya terlihat rapi.
 *  2. Tiap kategori muncul paling banyak sekali (constraint UNIQUE di basis).
 *  3. Cost code yang sama BOLEH disarankan untuk beberapa kategori — migrasi
 *     112 menyebutnya "rollup beberapa kategori ke satu pekerjaan generik".
 *  4. Yang sudah dipetakan dilewati.
 *  5. Saat beberapa cost code cocok, yang skornya tertinggi yang dipilih.
 */
export function sarankanPemetaan(
  kategori: KategoriRingkas[],
  costCode: CostCodeRingkas[],
  opsi: OpsiSaran = {},
): Saran[] {
  const ambang = opsi.ambang ?? AMBANG_BAKU
  const lewati = new Set(opsi.sudahDipetakan ?? [])

  const hasil: Saran[] = []
  for (const k of kategori) {
    if (lewati.has(k.id)) continue

    let terbaik: { cc: CostCodeRingkas; skor: number } | null = null
    for (const cc of costCode) {
      // Nama cost code DAN kodenya sama-sama diperiksa: sebagian kode
      // memuat kata yang tak ada di namanya (`CC-SE47-beton-pracetak` vs
      // nama "Beton Pracetak" — di sini sama, tapi tak selalu).
      const skor = Math.max(
        skorKemiripan(k.name, cc.name),
        skorKemiripan(k.name, cc.code),
      )
      if (!terbaik || skor > terbaik.skor) terbaik = { cc, skor }
    }

    if (!terbaik || terbaik.skor < ambang) continue

    hasil.push({
      category_id: k.id,
      category_name: k.name,
      cost_code_id: terbaik.cc.id,
      cost_code_code: terbaik.cc.code,
      cost_code_name: terbaik.cc.name,
      // Dibulatkan 2 desimal: angka seperti 0,6666666666666666 di layar
      // menyiratkan ketelitian yang tak dimiliki heuristik ini.
      skor: Math.round(terbaik.skor * 100) / 100,
    })
  }

  // Yang paling yakin lebih dulu — itu yang paling cepat bisa disetujui.
  return hasil.sort((a, b) => b.skor - a.skor || a.category_name.localeCompare(b.category_name, 'id'))
}
