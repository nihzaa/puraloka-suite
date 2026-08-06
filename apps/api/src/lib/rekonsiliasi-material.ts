// F5 PEMBEDA — Rekonsiliasi material: teoritis vs beli vs pakai vs sisa.
//
// ── Kenapa modul ini ada
//
// `PETA-PRIORITAS-ERP.md` menilai rekonsiliasi material **1,5/5 — pembeda
// paling lemah**, dan menyebutnya "titik kebocoran terbesar kontraktor".
//
// Semua bahannya sudah ada di basis dan tak pernah diadu satu sama lain:
//
//   project_rab_materials.rab_quantity  → yang SEHARUSNYA dipakai (dari RAB)
//   goods_receipt_items.qty_received    → yang DIBELI dan sampai
//   stock_movements(type='usage')       → yang DIPAKAI di lapangan
//   project_stocks.qty_on_hand          → yang MASIH di gudang
//
// Selisihnya adalah susut. Tanpa perhitungan ini, semen yang hilang 8 sak
// terlihat sama dengan semen yang habis terpakai — dan tak ada satu pun
// layar yang bisa membedakannya.
//
// ── Kenapa fungsi MURNI dan ber-test
//
// Angka yang keluar dari sini menuduh orang. "Susut 12%" pada proyek yang
// sebenarnya normal akan membuat mandor dicurigai tanpa dasar; "susut 0%"
// pada proyek yang bocor membuat kebocoran berlanjut. Keduanya mahal, dan
// keduanya TIDAK akan melempar error.

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface BarisTeoritis {
  material_id: string
  material_name?: string
  unit?: string | null
  /** Kebutuhan menurut RAB. */
  rab_quantity: number | string
}

export interface BarisDibeli {
  material_id: string
  qty_received: number | string | null
}

export interface BarisDipakai {
  material_id: string
  /**
   * Kuantitas mutasi apa adanya dari `stock_movements`.
   *
   * ⚠️ TANDANYA NEGATIF untuk pemakaian. `procurement.ts` menulis
   * `movement_qty = -qty` saat `movement_type = 'usage'` — barang keluar
   * dicatat sebagai pengurangan.
   *
   * Diverifikasi ke data: `usage` berkisar −115 sampai +80, jadi basis ini
   * memuat KEDUA tanda (baris lama sebelum konvensinya ditetapkan). Karena
   * itu yang dipakai `Math.abs()`, bukan negasi: menegasikan akan mengubah
   * baris positif menjadi pemakaian negatif, dan "susut −90%" terbaca
   * sebagai kabar baik.
   */
  qty: number | string | null
}

export interface BarisSisa {
  material_id: string
  qty_on_hand: number | string | null
}

/** Seberapa jauh sebuah material menyimpang, dan ke arah mana. */
export type StatusRekonsiliasi =
  | 'wajar'          // susut dalam ambang
  | 'susut_tinggi'   // dibeli − dipakai − sisa melebihi ambang
  | 'lebih_beli'     // dibeli jauh melebihi kebutuhan RAB
  | 'belum_lengkap'  // ada komponen yang belum tercatat sama sekali
  /**
   * Belum ada transaksi apa pun: tak dibeli, tak dipakai, tak ada di gudang.
   *
   * Menampung DUA keadaan yang sama-sama "tak ada yang terjadi":
   *  1. ada di RAB tapi belum tersentuh — pekerjaannya belum mulai
   *  2. nol di keempat sumber — kartu stok kosong tanpa rencana, sisa data master
   *
   * Namanya `belum_dibeli` karena keadaan (1) yang melahirkannya; labelnya di UI
   * berbunyi "Belum ada transaksi" supaya tetap jujur untuk keadaan (2).
   *
   * Ini SENGAJA dipisahkan dari `wajar`. Sampai 2026-08-06 keadaan ini jatuh
   * ke `wajar` sebagai fall-through, sehingga material yang direncanakan 200 m³
   * dan tak pernah dibeli sebutir pun tampil hijau di samping material yang
   * memang habis terpakai rapi. Laporan yang gunanya memunculkan masalah malah
   * menyatakan "tidak ada masalah" untuk seluruh baris RAB yang belum digarap.
   *
   * Bukan berarti salah — bisa jadi pekerjaannya memang belum mulai. Yang salah
   * adalah menyamakannya dengan "sudah diperiksa dan beres".
   */
  | 'belum_dibeli'

export interface BarisRekonsiliasi {
  material_id: string
  material_name: string
  unit: string | null
  /** Kebutuhan RAB. 0 bila material ini tak ada di RAB. */
  teoritis: number
  dibeli: number
  dipakai: number
  sisa: number
  /**
   * dibeli − dipakai − sisa.
   *
   * Positif = material hilang: dibeli tapi tak terpakai dan tak ada di
   * gudang. Negatif = tercatat terpakai lebih banyak daripada yang dibeli —
   * itu bukan "susut negatif", itu tanda pencatatan yang tak konsisten
   * (mis. stok awal tak dicatat), dan ditandai `belum_lengkap`.
   */
  selisih: number
  /** `selisih / dibeli × 100`. null bila belum ada pembelian. */
  susut_pct: number | null
  /** `dibeli − teoritis`. Positif = beli melebihi kebutuhan RAB. */
  lebih_beli: number
  status: StatusRekonsiliasi
}

export interface HasilRekonsiliasi {
  baris: BarisRekonsiliasi[]
  /** Material yang bermasalah lebih dulu; sisanya menurut nama. */
  total_dibeli: number
  total_dipakai: number
  total_sisa: number
  total_selisih: number
  /** Rata-rata TERTIMBANG, bukan rata-rata dari persentase per baris. */
  susut_pct_keseluruhan: number | null
  jumlah_susut_tinggi: number
  jumlah_lebih_beli: number
  jumlah_belum_lengkap: number
  /** Baris RAB yang belum dibeli, belum dipakai, dan tak ada di gudang. */
  jumlah_belum_dibeli: number
}

/**
 * Ambang susut yang dianggap wajar, dalam persen.
 *
 * 5% dipilih sebagai bawaan karena itu angka yang lazim dipakai kontraktor
 * untuk material curah (semen, pasir, besi potong). Ia SENGAJA bisa
 * ditimpa per pemanggilan: keramik dan kaca punya susut yang berbeda jauh
 * dari besi beton, dan satu angka untuk semuanya akan menuduh yang salah.
 *
 * Angka ini BUKAN [C] — ia memang boleh dikonfigurasi.
 */
export const AMBANG_SUSUT_PCT = 5

/**
 * Ambang kelebihan pembelian terhadap RAB, dalam persen.
 *
 * Lebih longgar daripada ambang susut: RAB dihitung sebelum pekerjaan
 * dimulai dan pembulatan pembelian (satu truk, satu palet) memang sering
 * melebihi kebutuhan tanpa ada yang salah.
 */
export const AMBANG_LEBIH_BELI_PCT = 10

/**
 * Adu keempat sumber angka dan simpulkan susutnya.
 *
 * KEPUTUSAN DESAIN — material yang muncul di SALAH SATU sumber ikut masuk
 * laporan, bukan hanya yang ada di RAB.
 *
 * Material yang dibeli tapi tak ada di RAB adalah justru yang paling perlu
 * dilihat: itu pembelian di luar rencana. Menyaringnya keluar membuat
 * laporan ini hanya memeriksa yang sudah direncanakan — dan kebocoran
 * jarang terjadi pada yang direncanakan.
 *
 * INVARIANT yang diuji:
 *  - string NUMERIC dijumlahkan sebagai angka, bukan digabung sebagai teks
 *  - beberapa baris untuk material sama dijumlahkan dulu, baru dibandingkan
 *  - `dipakai + sisa > dibeli` → `belum_lengkap`, BUKAN susut negatif
 *  - `susut_pct` null saat belum ada pembelian (bukan 0, bukan Infinity)
 *  - total keseluruhan memakai rata-rata TERTIMBANG, bukan rata-rata persen
 */
export function hitungRekonsiliasi(
  teoritis: BarisTeoritis[],
  dibeli: BarisDibeli[],
  dipakai: BarisDipakai[],
  sisa: BarisSisa[],
  opsi?: { ambangSusutPct?: number; ambangLebihBeliPct?: number },
): HasilRekonsiliasi {
  const ambangSusut = opsi?.ambangSusutPct ?? AMBANG_SUSUT_PCT
  const ambangLebih = opsi?.ambangLebihBeliPct ?? AMBANG_LEBIH_BELI_PCT

  type Akumulator = {
    material_id: string
    material_name: string
    unit: string | null
    teoritis: number
    dibeli: number
    dipakai: number
    sisa: number
  }
  const peta = new Map<string, Akumulator>()

  const ambil = (id: string): Akumulator => {
    let e = peta.get(id)
    if (!e) {
      e = { material_id: id, material_name: '—', unit: null, teoritis: 0, dibeli: 0, dipakai: 0, sisa: 0 }
      peta.set(id, e)
    }
    return e
  }

  for (const t of teoritis) {
    const e = ambil(t.material_id)
    e.teoritis += angka(t.rab_quantity)
    // Nama & satuan hanya ada di sumber teoritis; sumber lain cuma id.
    if (t.material_name) e.material_name = t.material_name
    if (t.unit !== undefined) e.unit = t.unit ?? null
  }
  for (const d of dibeli) ambil(d.material_id).dibeli += angka(d.qty_received)
  // `Math.abs` — lihat catatan tanda di `BarisDipakai`. Pemakaian dicatat
  // negatif oleh `procurement.ts`, tapi basis ini memuat kedua tanda.
  for (const p of dipakai) ambil(p.material_id).dipakai += Math.abs(angka(p.qty))
  for (const s of sisa) ambil(s.material_id).sisa += angka(s.qty_on_hand)

  const baris: BarisRekonsiliasi[] = [...peta.values()].map((e) => {
    const selisih = e.dibeli - e.dipakai - e.sisa
    const susut_pct = e.dibeli > 0 ? (selisih / e.dibeli) * 100 : null
    const lebih_beli = e.dibeli - e.teoritis

    let status: StatusRekonsiliasi = 'wajar'
    if (e.teoritis === 0 && e.dibeli === 0 && e.dipakai === 0 && e.sisa === 0) {
      // NOL DI KEEMPAT SUMBER. Terjadi pada material yang punya kartu stok
      // kosong tanpa pernah dibeli atau dipakai — data sisa dari master
      // material, bukan temuan.
      //
      // Sebelum cabang ini ada, baris begini tampil "Wajar" — layar menyatakan
      // "sudah diperiksa, beres" untuk material yang TIDAK ADA datanya sama
      // sekali. Diperiksa PALING AWAL karena `belum_dibeli` di bawah menuntut
      // `teoritis > 0`, sehingga baris ini akan lolos ke sana dan jatuh ke
      // `wajar` lagi.
      //
      // Diuji-mutasi 2026-08-06. Dua dari empat syarat MEMBEDAKAN hasil dan
      // ada testnya (`sisa === 0`, `dipakai === 0`). Dua sisanya adalah mutan
      // SETARA — membuangnya tak mengubah keluaran apa pun, jadi tak ada test
      // yang bisa menangkapnya, dan ketiadaan testnya bukan lubang:
      //   `dibeli === 0`   → kalau dibeli>0 & sisanya nol, selisih>0 sehingga
      //                      baris jatuh ke `susut_tinggi` lewat cabang lain
      //   `teoritis === 0` → tanpa itu, cabang ini menelan cabang di bawahnya
      //                      yang hasilnya memang sama (`belum_dibeli`)
      // Keduanya tetap ditulis: syarat yang menyatakan maksud lebih murah
      // daripada syarat yang harus disimpulkan ulang tiap kali dibaca.
      status = 'belum_dibeli'
    } else if (e.teoritis > 0 && e.dibeli === 0 && e.dipakai === 0 && e.sisa === 0) {
      // Baris RAB yang belum tersentuh sama sekali. Diperiksa PALING AWAL:
      // dengan `dibeli === 0`, `susut_pct` bernilai null dan semua cabang di
      // bawah tak ada yang cocok — sehingga baris ini akan jatuh ke `wajar`
      // sebagai fall-through, dan menyatakan "beres" untuk pekerjaan yang
      // bahkan belum dimulai.
      status = 'belum_dibeli'
    } else if (selisih < 0) {
      // Terpakai + sisa MELEBIHI yang dibeli. Itu mustahil secara fisik, jadi
      // yang salah adalah pencatatannya — bukan angka susut yang negatif.
      status = 'belum_lengkap'
    } else if (susut_pct != null && susut_pct > ambangSusut) {
      status = 'susut_tinggi'
    } else if (e.teoritis > 0 && lebih_beli > 0 && (lebih_beli / e.teoritis) * 100 > ambangLebih) {
      status = 'lebih_beli'
    }

    return {
      material_id: e.material_id,
      material_name: e.material_name,
      unit: e.unit,
      teoritis: e.teoritis,
      dibeli: e.dibeli,
      dipakai: e.dipakai,
      sisa: e.sisa,
      selisih,
      susut_pct,
      lebih_beli,
      status,
    }
  })

  // Yang bermasalah lebih dulu — laporan yang mengubur temuan di baris ke-40
  // sama saja dengan tak punya laporan.
  // `belum_dibeli` di bawah `lebih_beli`: ia perlu terlihat, tapi ia kabar
  // "belum digarap", bukan kabar "ada yang hilang". Menaruhnya di atas akan
  // mendorong temuan susut yang sesungguhnya turun ke bawah layar pada proyek
  // baru — yang seluruh RAB-nya memang belum tersentuh.
  const urutan: Record<StatusRekonsiliasi, number> = {
    susut_tinggi: 0, belum_lengkap: 1, lebih_beli: 2, belum_dibeli: 3, wajar: 4,
  }
  baris.sort((a, b) =>
    urutan[a.status] - urutan[b.status] ||
    Math.abs(b.selisih) - Math.abs(a.selisih) ||
    a.material_name.localeCompare(b.material_name, 'id'))

  const total_dibeli = baris.reduce((s, b) => s + b.dibeli, 0)
  const total_dipakai = baris.reduce((s, b) => s + b.dipakai, 0)
  const total_sisa = baris.reduce((s, b) => s + b.sisa, 0)
  const total_selisih = total_dibeli - total_dipakai - total_sisa

  return {
    baris,
    total_dibeli,
    total_dipakai,
    total_sisa,
    total_selisih,
    // TERTIMBANG: rata-rata dari persentase per baris membuat satu material
    // kecil yang susut 90% menenggelamkan seratus material besar yang wajar.
    susut_pct_keseluruhan: total_dibeli > 0 ? (total_selisih / total_dibeli) * 100 : null,
    jumlah_susut_tinggi: baris.filter((b) => b.status === 'susut_tinggi').length,
    jumlah_lebih_beli: baris.filter((b) => b.status === 'lebih_beli').length,
    jumlah_belum_lengkap: baris.filter((b) => b.status === 'belum_lengkap').length,
    jumlah_belum_dibeli: baris.filter((b) => b.status === 'belum_dibeli').length,
  }
}
