/**
 * WIP / PENGAKUAN PENDAPATAN — PSAK 72 (ROADMAP #15).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MASALAH YANG DIPECAHKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tanpa ini, laba-rugi kontraktor **tidak bermakna**. Alasannya:
 *
 * Proyek berjalan lintas periode. Uang masuk lewat termin — yang jadwalnya
 * ditentukan negosiasi, bukan kemajuan pekerjaan. Uang keluar mengikuti
 * lapangan. Kalau pendapatan diakui saat invoice terbit, laporan bulanan jadi
 * bergerigi tanpa arti: bulan dengan termin besar terlihat sangat untung,
 * bulan berikutnya terlihat rugi besar — padahal pekerjaannya berjalan sama.
 *
 * PSAK 72 (dan PSAK 34 sebelumnya) menjawabnya dengan **metode persentase
 * penyelesaian**: pendapatan diakui sebanding kemajuan pekerjaan, bukan sesuai
 * jadwal tagihan. Selisih antara keduanya jadi dua pos neraca:
 *
 *   **CIE** (Cost In Excess of Billings) — pekerjaan mendahului tagihan.
 *          Aset: kita berhak menagih tapi belum menagihnya.
 *   **BIE** (Billings In Excess of Cost) — tagihan mendahului pekerjaan.
 *          Liabilitas: sudah menerima uang untuk pekerjaan yang belum ada.
 *
 * BIE yang besar terlihat seperti "kas melimpah" padahal itu **utang
 * pekerjaan**. Kontraktor yang tak membedakan keduanya merasa kaya di tengah
 * proyek lalu kehabisan uang di akhir — kegagalan paling khas di industri ini.
 *
 * ── Dua cara mengukur persentase, dan kenapa keduanya dipertahankan
 *
 * **cost-to-cost** (§B PSAK 72): biaya terjadi ÷ estimasi total biaya. Ini
 * metode standar audit karena berbasis angka yang terekam, bukan penilaian.
 *
 * **progres fisik**: dari `projects.progress_pct` yang dilaporkan lapangan.
 * Lebih dekat kenyataan, tapi berbasis penilaian manusia.
 *
 * Keduanya dilaporkan berdampingan. Kalau berbeda jauh, itu SINYAL: entah
 * biayanya membengkak (fisik tertinggal dari uang) atau ada pekerjaan yang
 * belum tercatat biayanya. Memilih salah satu diam-diam menyembunyikan sinyal
 * itu — dan menyembunyikannya persis pada proyek yang paling perlu diperiksa.
 *
 * ── Yang SENGAJA tidak dilakukan
 *
 * Tidak menulis jurnal. GL (Modul 10) belum ada; ini **laporan**, bukan
 * pembukuan. Saat GL dibangun, angka di sini yang jadi sumber jurnalnya —
 * karena itu tiap komponen dipisah eksplisit, bukan digabung jadi satu total.
 */

export interface InputWIP {
  projectId: string
  nama: string
  status: string
  /** Nilai kontrak sesudah change order disetujui. */
  nilaiKontrak: number
  /** Biaya yang SUDAH TERJADI (semua sumber, definisi AC yang sama dengan kurva-S). */
  biayaTerjadi: number
  /**
   * Estimasi TOTAL biaya sampai selesai. Idealnya pagu RAP terkunci;
   * `null` bila belum ada — dan itu membuat cost-to-cost tak bisa dihitung.
   */
  estimasiTotalBiaya: number | null
  /** Progres fisik 0..100 dari laporan lapangan. */
  progressPct: number
  /** Total yang sudah ditagihkan ke klien (invoice terbit, lunas atau belum). */
  totalDitagih: number
}

export type MetodePersen = 'cost_to_cost' | 'fisik' | 'tak_terhitung'

export interface HasilWIP {
  projectId: string
  nama: string
  status: string
  nilaiKontrak: number
  biayaTerjadi: number
  totalDitagih: number

  /** Persen penyelesaian menurut cost-to-cost. `null` bila estimasi biaya tak ada. */
  persenCostToCost: number | null
  /** Persen penyelesaian menurut laporan fisik. */
  persenFisik: number
  /** Metode yang DIPAKAI untuk mengakui pendapatan. */
  metode: MetodePersen
  /** Persen yang benar-benar dipakai. `null` bila tak terhitung. */
  persenDipakai: number | null

  /** Pendapatan diakui = persen × nilai kontrak. */
  pendapatanDiakui: number | null
  /** Laba kotor diakui = pendapatan diakui − biaya terjadi. */
  labaDiakui: number | null
  /** Margin diakui dalam persen. */
  marginPct: number | null

  /** Cost In Excess of Billings — ASET (pekerjaan mendahului tagihan). */
  cie: number
  /** Billings In Excess of Cost — LIABILITAS (tagihan mendahului pekerjaan). */
  bie: number

  /**
   * Selisih dua metode dalam poin persen. Nilai besar = sinyal, bukan bug.
   * `null` bila cost-to-cost tak bisa dihitung.
   */
  selisihMetodePoin: number | null
  /** Peringatan yang WAJIB ditampilkan bersama angkanya. */
  peringatan: string[]
}

const bulat2 = (n: number) => Math.round(n * 100) / 100
const num = (v: number | null | undefined) => Number(v ?? 0) || 0

/** Ambang selisih dua metode yang dianggap layak diperiksa (poin persen). */
const AMBANG_SELISIH = 15

export function hitungWIP(input: InputWIP): HasilWIP {
  const kontrak = num(input.nilaiKontrak)
  const biaya = num(input.biayaTerjadi)
  const ditagih = num(input.totalDitagih)
  const estimasi = input.estimasiTotalBiaya == null ? null : num(input.estimasiTotalBiaya)
  const peringatan: string[] = []

  // Fisik dijepit 0..100: nilai di luar itu menghasilkan pendapatan diakui
  // melebihi nilai kontrak, atau negatif.
  const persenFisik = bulat2(Math.min(100, Math.max(0, num(input.progressPct))))

  // Cost-to-cost. Dijepit di 100: biaya yang melampaui estimasi TIDAK berarti
  // pekerjaan >100% selesai — ia berarti estimasinya yang meleset, dan itu
  // dilaporkan sebagai peringatan, bukan diakui sebagai pendapatan ekstra.
  let persenCTC: number | null = null
  if (estimasi != null && estimasi > 0) {
    const mentah = (biaya / estimasi) * 100
    persenCTC = bulat2(Math.min(100, Math.max(0, mentah)))
    if (mentah > 100) {
      peringatan.push(
        `Biaya terjadi sudah ${bulat2(mentah)}% dari estimasi total — estimasi ` +
        'biayanya meleset. Pendapatan tetap diakui maksimum 100%; selisihnya ' +
        'adalah KERUGIAN yang perlu diakui, bukan pendapatan tambahan.',
      )
    }
  } else {
    peringatan.push(
      'Estimasi total biaya (pagu RAP) belum ada, jadi persentase cost-to-cost ' +
      'tak bisa dihitung. Pengakuan memakai progres FISIK — berbasis penilaian ' +
      'lapangan, bukan angka terekam, dan itu lebih lemah di mata auditor.',
    )
  }

  // Metode: cost-to-cost bila memungkinkan (standar audit), fisik bila tidak.
  const metode: MetodePersen = persenCTC != null ? 'cost_to_cost'
    : kontrak > 0 ? 'fisik'
    : 'tak_terhitung'
  const persenDipakai = metode === 'cost_to_cost' ? persenCTC
    : metode === 'fisik' ? persenFisik
    : null

  if (kontrak <= 0) {
    peringatan.push('Nilai kontrak nol/kosong — pendapatan tak bisa diakui.')
  }

  const pendapatan = persenDipakai == null || kontrak <= 0
    ? null
    : bulat2(kontrak * persenDipakai / 100)
  const laba = pendapatan == null ? null : bulat2(pendapatan - biaya)
  const margin = pendapatan == null || pendapatan === 0
    ? null
    : bulat2((laba! / pendapatan) * 100)

  if (laba != null && laba < 0) {
    peringatan.push(
      `Rugi diakui ${Math.abs(laba).toLocaleString('id-ID')} — biaya terjadi ` +
      'melampaui pendapatan yang bisa diakui. PSAK mewajibkan kerugian diakui ' +
      'SEKARANG, bukan ditunda ke akhir proyek.',
    )
  }

  // CIE/BIE dari pendapatan diakui vs yang ditagih.
  // Keduanya tak pernah negatif: satu proyek berada di salah satu sisi, dan
  // "CIE negatif" hanyalah cara lain menulis BIE — menampilkan keduanya
  // sebagai angka bertanda membuat penjumlahan portofolio saling menghapus.
  const selisih = pendapatan == null ? 0 : pendapatan - ditagih
  const cie = selisih > 0 ? bulat2(selisih) : 0
  const bie = selisih < 0 ? bulat2(-selisih) : 0

  const selisihMetode = persenCTC == null ? null : bulat2(persenCTC - persenFisik)
  if (selisihMetode != null && Math.abs(selisihMetode) > AMBANG_SELISIH) {
    peringatan.push(
      selisihMetode > 0
        ? `Biaya sudah ${persenCTC}% tapi fisik baru ${persenFisik}% — selisih ` +
          `${bulat2(Math.abs(selisihMetode))} poin. Uang mendahului pekerjaan: ` +
          'periksa pemborosan, atau progres fisik yang belum dilaporkan.'
        : `Fisik ${persenFisik}% tapi biaya baru ${persenCTC}% — selisih ` +
          `${bulat2(Math.abs(selisihMetode))} poin. Ada pekerjaan yang biayanya ` +
          'belum tercatat, atau estimasi biayanya terlalu tinggi.',
    )
  }

  return {
    projectId: input.projectId,
    nama: input.nama,
    status: input.status,
    nilaiKontrak: kontrak,
    biayaTerjadi: biaya,
    totalDitagih: ditagih,
    persenCostToCost: persenCTC,
    persenFisik,
    metode,
    persenDipakai,
    pendapatanDiakui: pendapatan,
    labaDiakui: laba,
    marginPct: margin,
    cie,
    bie,
    selisihMetodePoin: selisihMetode,
    peringatan,
  }
}

export interface RingkasWIP {
  jumlahProyek: number
  totalKontrak: number
  totalPendapatanDiakui: number
  totalBiaya: number
  totalLaba: number
  /** Total CIE — ASET di neraca. */
  totalCIE: number
  /** Total BIE — LIABILITAS di neraca. */
  totalBIE: number
  /** Proyek yang labanya negatif — kerugian wajib diakui sekarang. */
  proyekRugi: number
  /** Proyek yang pengakuannya memakai fisik (lebih lemah di mata auditor). */
  proyekTanpaEstimasiBiaya: number
  keterbatasan: string[]
}

export function ringkasWIP(hasil: HasilWIP[]): RingkasWIP {
  const tanpaEstimasi = hasil.filter((h) => h.persenCostToCost == null).length
  const rugi = hasil.filter((h) => h.labaDiakui != null && h.labaDiakui < 0).length

  const keterbatasan: string[] = [
    // Batas yang WAJIB dinyatakan: ini laporan, bukan pembukuan.
    'Ini LAPORAN pengakuan pendapatan, bukan jurnal akuntansi. Angkanya belum ' +
    'masuk buku besar (GL/Modul 10 belum dibangun) dan belum diaudit. Untuk ' +
    'laporan keuangan resmi, angka ini adalah BAHAN, bukan hasil akhir.',
  ]
  if (tanpaEstimasi > 0) {
    keterbatasan.push(
      `${tanpaEstimasi} proyek belum punya estimasi total biaya (pagu RAP), ` +
      'jadi pengakuannya memakai progres FISIK — berbasis penilaian lapangan, ' +
      'bukan angka terekam. Auditor umumnya meminta cost-to-cost.',
    )
  }
  if (rugi > 0) {
    keterbatasan.push(
      `${rugi} proyek sudah rugi menurut pengakuan ini. PSAK mewajibkan seluruh ` +
      'kerugian diakui SEKARANG, tak boleh ditunda ke akhir proyek.',
    )
  }

  return {
    jumlahProyek: hasil.length,
    totalKontrak: bulat2(hasil.reduce((s, h) => s + h.nilaiKontrak, 0)),
    totalPendapatanDiakui: bulat2(hasil.reduce((s, h) => s + (h.pendapatanDiakui ?? 0), 0)),
    totalBiaya: bulat2(hasil.reduce((s, h) => s + h.biayaTerjadi, 0)),
    totalLaba: bulat2(hasil.reduce((s, h) => s + (h.labaDiakui ?? 0), 0)),
    // CIE & BIE dijumlahkan TERPISAH, tak boleh saling menghapus: di neraca
    // yang satu aset dan yang lain liabilitas, dan menyalinghapuskannya
    // menyembunyikan kedua-duanya.
    totalCIE: bulat2(hasil.reduce((s, h) => s + h.cie, 0)),
    totalBIE: bulat2(hasil.reduce((s, h) => s + h.bie, 0)),
    proyekRugi: rugi,
    proyekTanpaEstimasiBiaya: tanpaEstimasi,
    keterbatasan,
  }
}
