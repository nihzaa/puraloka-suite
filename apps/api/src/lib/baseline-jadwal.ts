/**
 * BASELINE JADWAL — membandingkan janji dengan kenyataan (G6b).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `rab_items.planned_start/planned_end` sudah dipakai Gantt, Kurva-S,
 * look-ahead, dan portal klien. Yang tak ada sampai migrasi 303: pembanding
 * yang TIDAK ikut bergeser.
 *
 * Akibatnya bukan angka yang salah, melainkan **angka yang selalu benar**:
 * `spi = ev / pv` (evm-calculation.ts:44), dan PV diturunkan dari tanggal
 * rencana. Setiap kali jadwal dimundurkan, PV ikut mundur dan SPI kembali
 * mendekati 1. Proyek yang terlambat tiga bulan menampilkan SPI 0,98.
 *
 * ── Yang dihitung di sini, dan yang TIDAK
 *
 * Pustaka ini menghitung PERGESERAN terhadap baseline — berapa hari mundur,
 * item mana, dan berapa bobot yang terdampak. Ia **tidak** memutuskan apakah
 * pergeseran itu wajar: keterlambatan karena hujan, karena adendum, dan
 * karena kelalaian punya angka yang sama persis dan konsekuensi hukum yang
 * sama sekali berbeda. Itu penilaian manusia.
 */

/** Satu item baseline sebagaimana tersimpan. */
export interface ItemBaseline {
  rab_item_id: string
  uraian: string | null
  planned_start: string | null
  planned_end: string | null
  weight_pct: number | string | null
}

/** Keadaan item sekarang. */
export interface ItemSekarang {
  id: string
  name: string | null
  planned_start: string | null
  planned_end: string | null
  weight_pct: number | string | null
  progress_pct?: number | string | null
}

export interface Pergeseran {
  rab_item_id: string
  uraian: string | null
  baseline_start: string | null
  baseline_end: string | null
  sekarang_start: string | null
  sekarang_end: string | null
  /** Positif = MUNDUR dari baseline. Negatif = maju. */
  geser_mulai_hari: number | null
  geser_selesai_hari: number | null
  bobot: number
  /** Item yang ada di baseline tetapi sudah tak ada sekarang. */
  hilang: boolean
  /** Item baru yang belum ada saat baseline ditetapkan. */
  baru: boolean
}

export interface RingkasPergeseran {
  total_item: number
  bergeser: number
  mundur: number
  maju: number
  hilang: number
  baru: number
  /** Pergeseran terparah dalam hari — angka yang dicari saat rapat. */
  mundur_terparah_hari: number | null
  /** Bobot pekerjaan yang mundur, dalam persen. */
  bobot_mundur_pct: number
  /**
   * Rata-rata TERTIMBANG bobot, bukan rata-rata biasa.
   *
   * Rata-rata biasa memperlakukan pemasangan kusen (bobot 0,4%) setara dengan
   * struktur (bobot 22%) — dan proyek dengan seratus item kecil tepat waktu
   * plus satu item besar mundur 60 hari akan terlihat nyaris sehat.
   */
  geser_tertimbang_hari: number | null
}

/** Angka dari basis. `Number('')` adalah 0, bukan NaN — lihat lib/markup.ts. */
export function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = v.trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const SAH = /^\d{4}-\d{2}-\d{2}$/

/**
 * Selisih hari antara dua tanggal `YYYY-MM-DD`.
 *
 * Memakai `Date.UTC` dan bukan `new Date(s)`: yang kedua menafsirkan string
 * tanggal sebagai UTC tengah malam, lalu operasi berikutnya di zona WIB
 * menggesernya ke tanggal SEBELUMNYA. Selisih satu hari pada laporan
 * keterlambatan bukan hal sepele — ia bisa menjadi selisih satu hari denda.
 */
export function selisihHari(dari: string | null, ke: string | null): number | null {
  if (!dari || !ke || !SAH.test(dari) || !SAH.test(ke)) return null
  const [ya, ma, da] = dari.split('-').map(Number)
  const [yb, mb, db] = ke.split('-').map(Number)
  const a = Date.UTC(ya, ma - 1, da)
  const b = Date.UTC(yb, mb - 1, db)
  return Math.round((b - a) / 86_400_000)
}

/**
 * Membandingkan keadaan sekarang dengan baseline.
 *
 * Item yang HILANG dan item BARU sengaja ikut dilaporkan, bukan dibuang.
 * Lingkup yang berubah adalah salah satu sebab keterlambatan yang paling
 * sering diperdebatkan, dan laporan yang hanya membandingkan item yang ada
 * di keduanya diam-diam menyembunyikan justru sebab itu.
 */
export function bandingkan(
  baseline: ItemBaseline[],
  sekarang: ItemSekarang[],
): Pergeseran[] {
  const petaSekarang = new Map(sekarang.map((s) => [s.id, s]))
  const petaBaseline = new Map(baseline.map((b) => [b.rab_item_id, b]))
  const hasil: Pergeseran[] = []

  for (const b of baseline) {
    const s = petaSekarang.get(b.rab_item_id)
    hasil.push({
      rab_item_id: b.rab_item_id,
      uraian: b.uraian ?? s?.name ?? null,
      baseline_start: b.planned_start,
      baseline_end: b.planned_end,
      sekarang_start: s?.planned_start ?? null,
      sekarang_end: s?.planned_end ?? null,
      geser_mulai_hari: s ? selisihHari(b.planned_start, s.planned_start) : null,
      geser_selesai_hari: s ? selisihHari(b.planned_end, s.planned_end) : null,
      bobot: angka(b.weight_pct) ?? 0,
      hilang: !s,
      baru: false,
    })
  }

  for (const s of sekarang) {
    if (petaBaseline.has(s.id)) continue
    // Item TANPA tanggal rencana bukan "item baru" — ia memang tak pernah
    // masuk baseline karena tak bisa dibandingkan (baseline hanya menyalin
    // yang ber-jadwal).
    //
    // Ditemukan di LAYAR, bukan oleh test: proyek dengan 285 item yang hanya
    // 14 berjadwal melaporkan "0 dari 285 pekerjaan" — dan 271 baris "baru"
    // itu menenggelamkan 14 yang sebenarnya dibandingkan. Angka yang benar
    // secara harfiah, menyesatkan secara praktis.
    if (!s.planned_start && !s.planned_end) continue
    hasil.push({
      rab_item_id: s.id,
      uraian: s.name,
      baseline_start: null,
      baseline_end: null,
      sekarang_start: s.planned_start,
      sekarang_end: s.planned_end,
      geser_mulai_hari: null,
      geser_selesai_hari: null,
      bobot: angka(s.weight_pct) ?? 0,
      hilang: false,
      baru: true,
    })
  }

  return hasil
}

/** Ringkasan yang dibaca lebih dulu sebelum daftar rincinya. */
export function ringkas(p: Pergeseran[]): RingkasPergeseran {
  let mundur = 0, maju = 0, hilang = 0, baru = 0, bergeser = 0
  let terparah: number | null = null
  let bobotMundur = 0
  let jumlahBobot = 0
  let jumlahTertimbang = 0

  for (const x of p) {
    if (x.hilang) { hilang++; continue }
    if (x.baru) { baru++; continue }

    const g = x.geser_selesai_hari
    if (g === null) continue

    if (g !== 0) bergeser++
    if (g > 0) {
      mundur++
      bobotMundur += x.bobot
      if (terparah === null || g > terparah) terparah = g
    } else if (g < 0) {
      maju++
    }

    // Bobot nol TIDAK menyumbang — dan itu benar: item tanpa bobot tak
    // memengaruhi progres proyek. Tetapi ia tetap dihitung di `mundur`,
    // karena keterlambatannya nyata bagi yang mengerjakannya.
    jumlahBobot += x.bobot
    jumlahTertimbang += g * x.bobot
  }

  return {
    total_item: p.length,
    bergeser, mundur, maju, hilang, baru,
    mundur_terparah_hari: terparah,
    bobot_mundur_pct: bobotMundur,
    // Pembagi nol → null, bukan 0: "tak bisa dihitung karena semua bobot
    // kosong" berbeda artinya dari "tidak bergeser sama sekali".
    geser_tertimbang_hari: jumlahBobot > 0
      ? Math.round((jumlahTertimbang / jumlahBobot) * 10) / 10
      : null,
  }
}

/**
 * Alasan sebuah baseline ditolak. `null` = sah.
 *
 * Baseline tanpa item adalah pernyataan kosong: ia terlihat sah di daftar,
 * dipakai sebagai pembanding, dan menghasilkan "nol pergeseran" untuk proyek
 * apa pun — kesimpulan yang selalu benar dan karena itu tak berguna.
 */
export function periksaBaseline(
  nama: string | undefined | null,
  alasan: string | undefined | null,
  jumlahItem: number,
): string | null {
  if (!nama || nama.trim() === '') return 'Nama baseline wajib diisi'
  if (!alasan || alasan.trim().length < 10) {
    return 'Alasan wajib diisi minimal 10 huruf — baseline tanpa sebab membuat '
      + '"kenapa jadwalnya berubah?" tak terjawab saat klaim keterlambatan dibahas'
  }
  if (jumlahItem === 0) {
    return 'Proyek ini belum punya satu pun item ber-jadwal. Baseline tanpa item '
      + 'menghasilkan "nol pergeseran" untuk apa pun — isi tanggal rencana di '
      + 'Gantt lebih dulu'
  }
  return null
}
