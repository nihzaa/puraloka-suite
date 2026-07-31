// Pemetaan Estimate (CECEP) → rab_items (RAB proyek). Fungsi MURNI, ber-test.
//
// ── Kenapa dua sistem ini perlu disambungkan
//
// `estimate_items` (Komposer: analisa AHSP × price book) dan `rab_items` (RAB
// proyek: hasil upload Excel) selama ini TIDAK punya FK maupun sinkronisasi.
// Akibatnya RAB yang disusun rapi di Komposer tak berpengaruh apa pun pada
// Kurva S, EVM, dan progress fisik — ketiganya membaca `rab_items`.
//
// Keputusan founder (2026-07-31): sambungkan lewat penyalinan eksplisit
// ("Terapkan ke Proyek"), BUKAN membuat pembaca membaca dua sumber. Alasannya
// Kurva S/EVM tak perlu diubah sama sekali — ia tetap membaca satu tabel — jadi
// angka yang sudah dipakai hari ini tidak berisiko bergeser.
//
// Upload Excel manual TETAP HIDUP sebagai jalur alternatif. Keduanya menulis ke
// tabel yang sama; yang terakhir dijalankan yang berlaku.

export interface ItemEstimasi {
  id: string
  /** Nama pekerjaan — dari assembly bila ada, jatuh ke cost code. */
  nama: string
  /** Kode cost code, dipakai sebagai `category_code`. */
  kode: string | null
  unit: string | null
  quantity: number | string | null
  amount: number | string | null
  sort_order?: number | null
  /** Komponen biaya dari hsp_snapshot.groupTotals bila tersedia. */
  group_totals?: { bahan?: number; tenaga?: number; alat?: number } | null
}

export interface BarisRab {
  level: 'category' | 'subcategory' | 'item'
  category_code: string | null
  name: string
  unit: string | null
  qty: number | null
  unit_price: number | null
  total_price: number | null
  weight_pct: number
  sort_order: number
  material_pct: number
  upah_pct: number
  alat_pct: number
  other_pct: number
}

function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Bulatkan ke 2 desimal tanpa galat float (0.1+0.2 → 0.3, bukan 0.30000000000000004). */
function bulat2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Ubah item estimasi menjadi baris `rab_items` level `item`.
 *
 * INVARIANT yang diuji:
 *  - Σ total_price = Σ amount estimasi (nol rupiah berubah saat disalin)
 *  - Σ weight_pct = 100 saat ada nilai; baris terakhir menyerap sisa pembulatan
 *  - unit_price = amount / quantity; quantity 0 → unit_price 0, BUKAN Infinity
 *  - komponen biaya dinormalisasi ke 100 bila groupTotals ada, 0 bila tidak
 *    (constraint DB `rab_items_pct_sum`: total 0 ATAU 99.9–100.1)
 */
export function petakanKeRab(items: ItemEstimasi[]): BarisRab[] {
  if (!items.length) return []

  const totalSemua = items.reduce((s, it) => s + angka(it.amount), 0)
  const hasil: BarisRab[] = []
  let bobotTerpakai = 0

  items.forEach((it, i) => {
    const qty = angka(it.quantity)
    const amount = angka(it.amount)

    // Pembagian dijaga: quantity 0 menghasilkan Infinity yang lolos ke DB
    // sebagai NaN/error, dan angka harga satuan yang tak masuk akal jauh lebih
    // sulit terdeteksi daripada nol.
    const unitPrice = qty > 0 ? bulat2(amount / qty) : 0

    // Baris TERAKHIR menyerap sisa pembulatan supaya Σ weight_pct persis 100.
    // Tanpa ini, bobot bisa berjumlah 99.97 dan progress proyek tak pernah
    // mencapai 100% meski semua pekerjaan selesai.
    const terakhir = i === items.length - 1
    let bobot = 0
    if (totalSemua > 0) {
      bobot = terakhir
        ? bulat2(100 - bobotTerpakai)
        : bulat2((amount / totalSemua) * 100)
      bobotTerpakai = bulat2(bobotTerpakai + bobot)
    }

    hasil.push({
      level: 'item',
      category_code: it.kode ?? null,
      name: it.nama,
      unit: it.unit ?? null,
      qty: qty || null,
      unit_price: unitPrice || null,
      total_price: amount || null,
      weight_pct: bobot,
      sort_order: it.sort_order ?? i,
      ...komponenBiaya(it.group_totals),
    })
  })

  return hasil
}

/**
 * Ubah `groupTotals` (rupiah per kelompok) menjadi persentase yang memenuhi
 * constraint DB: total 0 (belum diisi) ATAU 99.9–100.1 (sudah diset).
 *
 * Dikembalikan NOL semua bila groupTotals tak ada — bukan menebak proporsi.
 * Komponen biaya yang ditebak akan dipakai orang untuk mengambil keputusan
 * seolah ia hasil hitungan.
 */
function komponenBiaya(g: ItemEstimasi['group_totals']): Pick<
  BarisRab, 'material_pct' | 'upah_pct' | 'alat_pct' | 'other_pct'
> {
  const nol = { material_pct: 0, upah_pct: 0, alat_pct: 0, other_pct: 0 }
  if (!g) return nol

  const bahan = angka(g.bahan)
  const tenaga = angka(g.tenaga)
  const alat = angka(g.alat)
  const total = bahan + tenaga + alat
  if (total <= 0) return nol

  const material = bulat2((bahan / total) * 100)
  const upah = bulat2((tenaga / total) * 100)
  // `alat` menyerap sisa supaya totalnya persis 100 — constraint DB menolak
  // 99.87 maupun 100.02 dan penolakannya terjadi saat insert, bukan saat dibaca.
  const alatPct = bulat2(100 - material - upah)

  return { material_pct: material, upah_pct: upah, alat_pct: alatPct, other_pct: 0 }
}
