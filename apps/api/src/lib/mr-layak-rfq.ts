// MR mana yang layak dimintakan penawaran — dan BERAPA.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-08:
//
//   • `rfq.mr_id` ADA di schema
//   • `POST /api/v1/rfq` sudah menerima `mr_id` (`rfq.ts:223`)
//   • **3 dari 3 RFQ punya `mr_id` NULL**
//
// Sebabnya: UI tak punya satu pun cara mengisinya — nol rujukan `mr_id` di
// seluruh halaman procurement. Kelas cacat yang sama dengan `po_id` yang
// dibaca-tapi-tak-pernah-ditulis, dan dengan endpoint penawaran yang tak
// punya tombol: tiap bagian ada dan ber-test sendiri-sendiri, hanya
// sambungannya yang tidak.
//
// Akibatnya "RFQ ini untuk kebutuhan apa?" tak terjawab selamanya, dan
// tabulasi penawaran — yang seluruh gunanya adalah menjadi bukti pemilihan
// vendor — kehilangan pangkalnya.
//
// ── Kenapa SISA, bukan qty yang diminta
//
// Diukur pada data nyata: MR-2026-003 `partially_ordered`, 115 diminta, 85
// sudah dipesan. RFQ dengan qty penuh meminta vendor menghargai 85 unit yang
// sudah dibeli. Vendor menjawab dengan benar, angkanya salah, dan tak ada
// yang menyadarinya karena RFQ-nya sendiri terlihat rapi.
//
// Ini bentuk cacat yang paling mahal di repo ini: yang salah sambil terlihat
// benar.
//
// ── Kenapa hanya yang SUDAH disetujui
//
// `draft`/`submitted` belum disetujui. Meminta harga untuk kebutuhan yang
// belum tentu jadi membuang waktu vendor — dan vendor yang merasa waktunya
// dibuang berhenti menjawab. Hubungan dengan vendor adalah aset yang tak
// muncul di neraca.

/**
 * Status MR yang boleh dimintakan penawaran.
 *
 * Daftar PUTIH, bukan daftar hitam. Status baru yang belum dipertimbangkan
 * otomatis tidak layak — gagal-tertutup, sesuai Ember [C] (CLAUDE.md §5.3).
 * Daftar hitam akan meloloskan apa pun yang lupa ditambahkan, dan yang lolos
 * di sini adalah permintaan harga untuk kebutuhan yang belum tentu sah.
 */
const STATUS_BOLEH = new Set(['approved', 'partially_ordered'])

export interface ItemMr {
  id?: string
  qty_requested: number | string
  qty_ordered?: number | string | null
  unit?: string | null
  material?: { id: string; name: string; unit?: string | null } | null
}

export interface MrRingkas {
  id: string
  mr_number: string
  status: string
  needed_date?: string | null
  items?: ItemMr[] | null
}

export interface ItemLayak {
  material_id: string
  material_name: string
  unit: string | null
  /** SISA yang masih perlu dicarikan harga. Ini yang masuk RFQ. */
  qty: number
  /** Yang semula diminta — dibawa supaya selisihnya bisa dijelaskan di layar. */
  qty_diminta: number
}

export interface Kelayakan {
  id: string
  mr_number: string
  status: string
  layak: boolean
  /** Alasan TIDAK layak, dalam bahasa yang bisa ditampilkan apa adanya. */
  sebab: string | null
  item: ItemLayak[]
  total_sisa: number
  /**
   * Item yang punya sisa tapi tak punya material.
   *
   * `rfq_penawaran.material_id` NOT NULL, jadi item begini tak bisa jadi baris
   * penawaran. Dilewati diam-diam membuat RFQ kekurangan baris tanpa gejala;
   * dihitung membuatnya terlihat.
   */
  tanpa_material: number
}

/**
 * Angka dari Postgres tiba sebagai STRING (`numeric`).
 *
 * `100 - "85"` kebetulan bekerja di JS, tapi `"100" + "85"` menyambung jadi
 * "10085" — dan sekali satu jalur memakai string, sisanya ikut. Dipaksa jadi
 * angka di SATU tempat, dan yang tak terbaca jadi 0, bukan NaN.
 *
 * NaN penting dihindari bukan karena tampilannya: Postgres `numeric` MENERIMA
 * NaN, dan satu baris NaN meracuni `SUM()` seluruh laporan.
 */
function angka(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Berapa yang masih perlu dicarikan harga untuk satu item.
 *
 * INVARIAN yang diuji:
 *  - `qty_ordered` NULL/undefined → dianggap nol (belum ada yang dipesan)
 *  - dipesan melebihi diminta → nol, BUKAN negatif (pembulatan ke kelipatan
 *    kemasan membuat ini nyata terjadi; RFQ ber-qty negatif tak punya arti)
 *  - nilai tak terbaca → nol, bukan NaN
 */
export function sisaKebutuhan(item: Pick<ItemMr, 'qty_requested' | 'qty_ordered'>): number {
  return Math.max(0, angka(item.qty_requested) - angka(item.qty_ordered))
}

/**
 * Apakah satu MR layak dimintakan penawaran, dan item mana saja yang ikut.
 *
 * Urutan pemeriksaannya disengaja: status lebih dulu, karena MR yang belum
 * disetujui tak perlu dihitung sisanya sama sekali.
 */
export function mrLayakRfq(mr: MrRingkas): Kelayakan {
  const dasar = { id: mr.id, mr_number: mr.mr_number, status: mr.status }
  const kosong = { item: [] as ItemLayak[], total_sisa: 0, tanpa_material: 0 }

  if (!STATUS_BOLEH.has(mr.status)) {
    return {
      ...dasar, ...kosong, layak: false,
      // `fully_ordered` juga di luar daftar putih, tapi sebabnya BUKAN "belum
      // disetujui" — ia justru sudah tuntas dibeli. Memberi pesan yang sama
      // untuk dua keadaan berlawanan membuat orang mencari persetujuan yang
      // sebenarnya sudah lama turun. Test menemukan ini.
      sebab: mr.status === 'fully_ordered'
        ? 'Seluruh item sudah dipesan'
        : 'Belum disetujui — penawaran hanya diminta untuk kebutuhan yang sudah disetujui',
    }
  }

  const semua = mr.items ?? []
  const bersisa = semua.filter((i) => sisaKebutuhan(i) > 0)

  if (bersisa.length === 0) {
    return {
      ...dasar, ...kosong, layak: false,
      // Dua sebab berbeda, dibedakan: MR tanpa item sama sekali adalah MR yang
      // belum selesai ditulis, bukan MR yang sudah tuntas dibeli.
      sebab: semua.length === 0
        ? 'Belum ada item — tak ada yang bisa ditawarkan'
        : 'Seluruh item sudah dipesan',
    }
  }

  const item: ItemLayak[] = []
  let tanpaMaterial = 0
  for (const i of bersisa) {
    if (!i.material?.id) { tanpaMaterial++; continue }
    item.push({
      material_id: i.material.id,
      material_name: i.material.name,
      unit: i.unit ?? i.material.unit ?? null,
      qty: sisaKebutuhan(i),
      qty_diminta: angka(i.qty_requested),
    })
  }

  if (item.length === 0) {
    return {
      ...dasar, ...kosong, layak: false, tanpa_material: tanpaMaterial,
      sebab: 'Item yang tersisa tak punya material — tak bisa jadi baris penawaran',
    }
  }

  return {
    ...dasar, layak: true, sebab: null, item, tanpa_material: tanpaMaterial,
    total_sisa: item.reduce((s, x) => s + x.qty, 0),
  }
}

/**
 * Ringkas satu daftar MR jadi "yang bisa dipilih" + "berapa yang tidak".
 *
 * Yang tidak layak TIDAK dihilangkan diam-diam, hanya dihitung. Daftar yang
 * menyusut tanpa penjelasan membuat orang bertanya "MR saya ke mana" dan tak
 * menemukan jawabannya di layar mana pun.
 */
export function ringkasKelayakan(daftar: MrRingkas[]): {
  layak: Kelayakan[]
  tak_layak: number
} {
  const nilai = daftar.map(mrLayakRfq)
  return {
    // Sisa terbesar lebih dulu: itu yang paling mendesak dicarikan harga, dan
    // yang paling besar dampaknya bila salah.
    layak: nilai.filter((k) => k.layak).sort((a, b) => b.total_sisa - a.total_sisa),
    tak_layak: nilai.filter((k) => !k.layak).length,
  }
}
