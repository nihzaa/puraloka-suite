// ROADMAP #11 / Modul 9a — hard-guard kuota RAB pada Material Request.
//
// Rumus dari ERP_MASTER_PLAN §9a:
//     total_yang_sudah_di_MR + volume_MR_baru > volume_RAB  →  TOLAK
//
// Fungsi MURNI, ber-test. Ini keputusan tolak/terima atas pembelian: salah
// menghitung berarti entah memblokir pembelian yang sah (dan orang lapangan
// berhenti bekerja), atau meloloskan pembelian melebihi anggaran tanpa ada yang
// tahu. Keduanya mahal, dan keduanya tak akan melempar error.

export interface KuotaRab {
  material_id: string
  material_name?: string
  unit?: string | null
  /** Batas dari RAB. */
  rab_quantity: number | string
}

export interface PemakaianMr {
  material_id: string
  qty_requested: number | string | null
}

export interface BarisPelanggaran {
  material_id: string
  material_name: string
  unit: string | null
  rab_quantity: number
  /** Sudah dipesan lewat MR lain yang masih hidup (draft tidak dihitung). */
  sudah_di_mr: number
  /** Diminta oleh MR yang sedang diperiksa. */
  diminta: number
  /** sudah_di_mr + diminta. */
  total: number
  /** total − rab_quantity, selalu > 0 pada baris pelanggaran. */
  kelebihan: number
}

export interface HasilPeriksaKuota {
  lolos: boolean
  pelanggaran: BarisPelanggaran[]
  /** Material yang diminta tapi TIDAK punya baris kuota RAB sama sekali. */
  tanpa_kuota: string[]
}

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Periksa apakah permintaan MR melampaui kuota RAB.
 *
 * @param diminta     item MR yang sedang diperiksa
 * @param sudahDiMr   akumulasi qty dari MR LAIN yang masih hidup
 * @param kuota       baris kuota RAB per material
 *
 * KEPUTUSAN DESAIN — material tanpa baris kuota TIDAK diblokir.
 * Kuota RAB material diisi bertahap; memblokir semua material yang belum
 * terdaftar akan menghentikan seluruh procurement pada hari guard ini menyala,
 * termasuk pembelian yang sah. Guard ini menjaga yang PUNYA batas agar tak
 * dilampaui — bukan mewajibkan semua material punya batas. Yang tanpa kuota
 * tetap dilaporkan di `tanpa_kuota` supaya terlihat, tidak hilang diam-diam.
 *
 * INVARIANT yang diuji:
 *  - tepat di batas (total === rab_quantity) LOLOS; lewat 0.001 pun DITOLAK
 *  - beberapa baris MR untuk material sama dijumlahkan dulu, baru dibandingkan
 *  - string NUMERIC dijumlahkan sebagai angka, bukan digabung sebagai teks
 *  - material tanpa kuota tak pernah membuat `lolos` menjadi false
 */
export function periksaKuota(
  diminta: PemakaianMr[],
  sudahDiMr: Map<string, number>,
  kuota: KuotaRab[],
): HasilPeriksaKuota {
  const kuotaPer = new Map(kuota.map((k) => [k.material_id, k]))

  // Beberapa baris MR bisa menunjuk material yang sama. Menjumlahkannya DULU
  // penting: memeriksa baris per baris membuat 3 baris @40 lolos terhadap kuota
  // 100 padahal totalnya 120.
  const totalDiminta = new Map<string, number>()
  for (const d of diminta) {
    totalDiminta.set(d.material_id,
      (totalDiminta.get(d.material_id) ?? 0) + angka(d.qty_requested))
  }

  const pelanggaran: BarisPelanggaran[] = []
  const tanpaKuota: string[] = []

  for (const [materialId, qty] of totalDiminta) {
    const k = kuotaPer.get(materialId)
    if (!k) { tanpaKuota.push(materialId); continue }

    const batas = angka(k.rab_quantity)
    const sudah = sudahDiMr.get(materialId) ?? 0
    const total = sudah + qty

    // Tepat di batas LOLOS — rumusnya `>`, bukan `>=`. Memakai `>=` berarti
    // memesan persis sebanyak volume RAB ditolak, yang jelas keliru.
    if (total > batas) {
      pelanggaran.push({
        material_id: materialId,
        material_name: k.material_name ?? materialId,
        unit: k.unit ?? null,
        rab_quantity: batas,
        sudah_di_mr: sudah,
        diminta: qty,
        total,
        kelebihan: Number((total - batas).toFixed(3)),
      })
    }
  }

  return {
    lolos: pelanggaran.length === 0,
    pelanggaran: pelanggaran.sort((a, b) => b.kelebihan - a.kelebihan),
    tanpa_kuota: tanpaKuota,
  }
}
