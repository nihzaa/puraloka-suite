// F5 PEMBEDA — Menyalin BOQ penawaran PEMENANG ke `work_scope_items`.
//
// ── Kenapa modul ini ada
//
// Diukur 2026-08-16, sebelum menulis satu baris pun:
//
//   • `work_scope_items` (023:63-94) sudah punya BOQ berharga-satuan lengkap:
//     `unit`, `volume`, `unit_price`, `subtotal` generated, `pct_done` generated
//   • …tetapi ia lahir SESUDAH award, dan TIDAK PUNYA satu pun rute POST di
//     `apps/api/src/routes/v1/` — tabel BOQ itu tak punya jalan tulis
//   • migrasi 347:48-52 menyatakan menutup tender TIDAK membuat `work_scopes`;
//     `tender_subkon.work_scope_id` diisi manual sesudahnya
//
// Jadi rincian harga yang dipakai MEMILIH pemenang selama ini berhenti di
// tender, lalu BOQ pelaksanaannya diketik ulang dari nol — atau tidak diketik
// sama sekali. Rantai "harga yang disepakati → harga yang dikerjakan" putus di
// titik paling mahal: tepat sesudah uang dijanjikan.
//
// ══════════════════════════════════════════════════════════════════════════
// YANG PALING PENTING DI BERKAS INI: apa yang TIDAK boleh ditimpa
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur pada basis dev: **25 dari 27 baris `work_scope_items` sudah
// ber-`volume_done` > 0.** Progres lapangan adalah satu-satunya data di
// modul ini yang TAK BISA dibuat ulang dari mana pun — ia hasil orang
// mengukur di lokasi, bukan turunan perhitungan.
//
// Karena itu penyalinan ini ADITIF dan tak pernah destruktif:
//
//   • item yang cocok dan SUDAH berprogres  → DILEWATI, tak disentuh
//   • item yang cocok dan belum berprogres  → harga/volume diperbarui
//   • item yang belum ada                   → disisipkan
//   • item lama yang tak ada di penawaran   → DIBIARKAN, tak dihapus
//
// Yang terakhir sengaja: BOQ pelaksanaan boleh memuat pos yang tak ditender
// (pekerjaan tambah yang sudah disepakati terpisah). Menghapusnya karena "tak
// ada di penawaran pemenang" membuang kesepakatan lain tanpa ada yang meminta.

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Satuan yang dikenal `work_item_unit` — diukur dari pg_enum 2026-08-16. */
export const SATUAN_BOQ = [
  'm2', 'm3', 'm', 'm_linear', 'kg', 'ton', 'unit', 'buah',
  'titik', 'batang', 'lembar', 'set', 'ls', 'hari', 'minggu',
] as const

export type SatuanBoq = (typeof SATUAN_BOQ)[number]

/**
 * Satuan bebas dari penawaran → enum `work_item_unit`.
 *
 * Yang tak dikenal jatuh ke `ls` (lump sum), BUKAN ditolak: menggagalkan
 * seluruh penyalinan karena satu baris bersatuan "m³" (dengan superskrip)
 * atau "titik lampu" berarti pemenang yang sudah sah ditetapkan tak punya
 * BOQ sama sekali. `ls` jujur — ia berarti "satu paket, satuannya tak
 * dipetakan" — dan volumenya tetap tersalin apa adanya.
 */
export function petakanSatuan(raw: string | null | undefined): SatuanBoq {
  const s = String(raw ?? '').toLowerCase().trim()
    // m³/m² dan superskrip Unicode ditulis begitu di banyak surat penawaran.
    .replace(/³/g, '3').replace(/²/g, '2')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!s) return 'ls'
  if ((SATUAN_BOQ as readonly string[]).includes(s)) return s as SatuanBoq

  const sinonim: Record<string, SatuanBoq> = {
    m1: 'm', meter: 'm', meter_lari: 'm_linear', mlari: 'm_linear', m_lari: 'm_linear',
    m_persegi: 'm2', meter_persegi: 'm2', m_kubik: 'm3', meter_kubik: 'm3',
    kilogram: 'kg', kilo: 'kg', pcs: 'buah', pc: 'buah', bh: 'buah', biji: 'buah',
    ttk: 'titik', titik_lampu: 'titik', btg: 'batang', lbr: 'lembar',
    lot: 'ls', paket: 'ls', pkt: 'ls', lumpsum: 'ls', lump_sum: 'ls',
    hr: 'hari', mgg: 'minggu', minggu_orang: 'minggu', org_hari: 'hari',
  }
  return sinonim[s] ?? 'ls'
}

export interface ItemPenawaranMenang {
  kode_item?: string | null
  uraian: string
  satuan?: string | null
  volume: number | string
  harga_satuan: number | string
}

export interface ItemBoqAda {
  id: string
  item_name: string
  /** > 0 berarti sudah ada pengukuran lapangan — TIDAK boleh ditimpa. */
  volume_done: number | string
}

export type TindakanBoq =
  | { jenis: 'sisip'; item_name: string; unit: SatuanBoq; volume: number; unit_price: number; sort_order: number }
  | { jenis: 'perbarui'; id: string; item_name: string; unit: SatuanBoq; volume: number; unit_price: number; sort_order: number }
  | { jenis: 'lewati'; id: string; item_name: string; sebab: 'berprogres' }

export interface RencanaSalin {
  tindakan: TindakanBoq[]
  jumlah_sisip: number
  jumlah_perbarui: number
  /**
   * Item yang DILEWATI karena sudah berprogres.
   *
   * Dilaporkan, bukan didiamkan: pengguna menekan "tetapkan pemenang" dan
   * berhak tahu bahwa tiga pos BOQ-nya tidak ikut berubah — kalau tidak, ia
   * akan mengira harganya sudah tersalin padahal yang berlaku masih harga
   * lama, dan selisihnya baru ketahuan saat pembayaran.
   */
  dilewati_berprogres: string[]
}

/**
 * Cocokkan nama untuk menentukan "item yang sama".
 *
 * Dinormalkan karena BOQ lama diketik manusia: "Galian Tanah" vs
 * "galian tanah" vs "Galian  tanah" adalah pos yang sama, dan
 * memperlakukannya berbeda akan MENGGANDAKAN barisnya di BOQ pelaksanaan —
 * lalu volume terkontraknya terhitung dua kali.
 */
export function kunciNama(s: string): string {
  return String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Susun rencana penyalinan BOQ pemenang ke `work_scope_items`.
 *
 * Fungsi MURNI — tak menyentuh basis. Rencananya diperiksa test, lalu
 * dijalankan pemanggil. Memisahkannya begini yang membuat aturan "jangan
 * timpa progres" bisa diuji tanpa perlu membuat progres palsu di basis.
 *
 * INVARIANT yang diuji:
 *  - item ber-`volume_done` > 0 TIDAK PERNAH masuk sebagai 'perbarui'
 *  - item BOQ yang tak ada di penawaran tak pernah muncul sebagai penghapusan
 *  - pencocokan nama tahan beda huruf besar/kecil dan spasi ganda
 *  - satuan tak dikenal jadi `ls`, tidak menggagalkan seluruh rencana
 *  - volume 0 tetap disalin (pos yang dinyatakan tak dikerjakan)
 */
export function rencanakanSalinBoq(
  itemPemenang: readonly ItemPenawaranMenang[],
  boqAda: readonly ItemBoqAda[],
): RencanaSalin {
  const peta = new Map<string, ItemBoqAda>()
  for (const b of boqAda) peta.set(kunciNama(b.item_name), b)

  const tindakan: TindakanBoq[] = []
  const dilewati: string[] = []

  // `sort_order` melanjutkan dari yang tertinggi supaya pos lama tak berpindah
  // tempat di layar mandor yang sudah terbiasa dengan urutannya.
  let urut = boqAda.length

  itemPemenang.forEach((it, i) => {
    const nama = it.uraian?.trim() || it.kode_item?.trim() || `Item ${i + 1}`
    const cocok = peta.get(kunciNama(nama))
    const unit = petakanSatuan(it.satuan)
    const volume = angka(it.volume)
    const unit_price = angka(it.harga_satuan)

    if (!cocok) {
      tindakan.push({ jenis: 'sisip', item_name: nama, unit, volume, unit_price, sort_order: urut++ })
      return
    }

    if (angka(cocok.volume_done) > 0) {
      // ⚠ Titik paling penting di modul ini. Menimpa `volume` di sini akan
      // mengubah `pct_done` — kolom GENERATED (023:80) — sehingga pekerjaan
      // yang terukur 100% selesai bisa mendadak jadi 40% tanpa ada yang
      // menyentuh lapangan. Itu lalu mengalir ke pembayaran dan ke EVM.
      tindakan.push({ jenis: 'lewati', id: cocok.id, item_name: nama, sebab: 'berprogres' })
      dilewati.push(nama)
      return
    }

    tindakan.push({
      jenis: 'perbarui', id: cocok.id, item_name: nama, unit, volume, unit_price,
      sort_order: urut++,
    })
  })

  return {
    tindakan,
    jumlah_sisip: tindakan.filter((t) => t.jenis === 'sisip').length,
    jumlah_perbarui: tindakan.filter((t) => t.jenis === 'perbarui').length,
    dilewati_berprogres: dilewati,
  }
}
