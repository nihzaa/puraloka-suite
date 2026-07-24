// Nilai sebuah Material Request untuk dasar syarat nominal rantai approval
// (ADR-007 / Phase 2 2A-5). Murni — tanpa DB, supaya aturannya bisa dikunci test.
//
// MR tidak menyimpan total; nilainya = Σ(qty × estimasi harga satuan), dan
// estimasi BOLEH kosong. Di situ letak jebakannya: kalau item tanpa estimasi
// dihitung NOL, "kosongkan harganya" jadi cara sepele melewati ambang
// "di atas Rp X harus naik ke direktur".
//
// Aturan: satu saja item tanpa estimasi → nilai MR TIDAK DIKETAHUI, dan
// diperlakukan melampaui semua ambang (fail-closed). Data yang hilang harus
// MENAMBAH pengawasan, bukan menguranginya.

export interface MrItemAmount {
  qty_requested: number | string | null
  unit_price_est: number | string | null
}

/** Nilai MR; `Infinity` berarti tak diketahui → melampaui semua ambang. */
export function computeMrAmount(items: MrItemAmount[]): number {
  if (items.length === 0) return 0
  if (items.some(i => i.unit_price_est === null || i.unit_price_est === undefined)) {
    return Number.POSITIVE_INFINITY
  }
  return items.reduce(
    (sum, i) => sum + Number(i.qty_requested ?? 0) * Number(i.unit_price_est),
    0,
  )
}
