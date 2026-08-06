// SERTIFIKAT IPC — perhitungan nilai yang boleh ditagih. PURE, tanpa I/O.
//
// ════════════════════════════════════════════════════════════════════════════
// APA YANG DIHITUNG DI SINI, DAN KENAPA URUTANNYA MENGIKAT
// ════════════════════════════════════════════════════════════════════════════
//
// IPC menjawab satu pertanyaan: **berapa yang boleh ditagih periode ini?**
//
//   nilai prestasi   = nilai kontrak × progres yang diakui
//   nilai periode    = nilai prestasi − yang sudah ditagih sebelumnya
//   retensi          = retensi% × nilai periode
//   nilai bersih     = nilai periode − retensi − potongan DP − potongan lain
//
// Urutannya bukan selera. **Retensi dihitung dari nilai PERIODE, bukan dari
// nilai prestasi kumulatif** — kalau dari kumulatif, retensi yang sudah
// ditahan pada IPC-IPC sebelumnya akan ditahan lagi setiap periode, dan
// kontraktor kehilangan uang yang sebenarnya sudah pernah dipotong.
//
// ── Yang ditolak jadi kabar baik
//
// 1. **Nilai periode NEGATIF bukan "tidak apa-apa".** Ia berarti progres yang
//    diakui sekarang LEBIH RENDAH daripada yang sudah ditagih — entah progres
//    dikoreksi turun, entah ada penagihan ganda. Ditandai, bukan dibulatkan
//    ke nol: membulatkannya menghapus satu-satunya gejala.
//
// 2. **Nilai bersih negatif setelah potongan** berarti potongannya melebihi
//    hak tagih periode ini. Tetap dihitung apa adanya dan ditandai —
//    memaksanya ke nol membuat kelebihan potongan hilang tanpa jejak, padahal
//    itu uang yang harus dibawa ke periode berikutnya.
//
// 3. **Progres 100% bukan berarti seluruh nilai kontrak cair.** Retensi tetap
//    ditahan sampai masa pemeliharaan lewat. IPC yang menampilkan "100% →
//    Rp X penuh" membuat orang mengira uangnya sudah boleh diminta.
//
// ── NUMERIC datang sebagai STRING
//
// Postgres mengirim NUMERIC sebagai string. `"1" + "1"` menghasilkan `"11"`,
// bukan `2` — dan pada angka rupiah, kesalahan itu tak terlihat sampai
// nominalnya ganjil. Seluruh masukan dilewatkan `angka()`.

/** Ubah NUMERIC-dari-Postgres (string) atau number jadi number. */
function angka(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Bulatkan ke rupiah penuh — sen tak dipakai dalam penagihan konstruksi. */
const rupiah = (n: number) => Math.round(n)

export interface MasukanIpc {
  /** Nilai kontrak yang DIBEKUKAN di sertifikat, bukan dibaca ulang. */
  nilai_kontrak: number | string
  /** Progres yang DIAKUI saat sertifikat terbit (0–100). */
  progres_diakui_pct: number | string
  /** Persentase retensi menurut kontrak (0–100). */
  retensi_pct?: number | string | null
  /** Nilai yang sudah ditagih pada sertifikat-sertifikat sebelumnya. */
  kumulatif_sebelumnya?: number | string | null
  potongan_dp?: number | string | null
  potongan_lain?: number | string | null
}

export type PeringatanIpc =
  /** Progres yang diakui lebih rendah dari yang sudah ditagih. */
  | 'periode_negatif'
  /** Potongan melebihi hak tagih periode ini. */
  | 'potongan_melebihi_hak'
  /** Progres 100% — sisa yang tertahan hanya retensi. */
  | 'prestasi_penuh'
  /** Tak ada yang bisa ditagih periode ini (nilai periode nol). */
  | 'tak_ada_yang_ditagih'

export interface HasilIpc {
  /** nilai kontrak × progres diakui. */
  nilai_prestasi: number
  /** Nilai prestasi − yang sudah ditagih sebelumnya. Boleh NEGATIF. */
  nilai_periode: number
  /** Retensi periode ini — dari nilai PERIODE, bukan kumulatif. */
  retensi: number
  potongan_dp: number
  potongan_lain: number
  /** Yang boleh ditagih. Boleh negatif — lihat catatan kepala berkas. */
  nilai_bersih: number
  /** Total yang tertahan sebagai retensi setelah IPC ini terbit. */
  retensi_kumulatif_estimasi: number
  peringatan: PeringatanIpc[]
  /**
   * `true` bila sertifikat ini layak diajukan apa adanya.
   *
   * Bukan sekadar "tidak ada galat": sertifikat dengan nilai periode nol atau
   * negatif secara teknis sah dihitung, tapi mengajukannya berarti menagih
   * sesuatu yang tak ada.
   */
  layak_diajukan: boolean
}

/**
 * Susun perhitungan sebuah sertifikat IPC.
 *
 * INVARIANT yang diuji:
 *  - retensi dihitung dari nilai PERIODE, bukan prestasi kumulatif
 *  - nilai periode negatif DITANDAI, bukan dibulatkan ke nol
 *  - string NUMERIC dihitung sebagai ANGKA, bukan digabung sebagai teks
 *  - progres 100% tidak membuat retensi hilang
 *  - potongan yang melebihi hak tagih ditandai, bukan disembunyikan
 */
export function hitungIpc(m: MasukanIpc): HasilIpc {
  const kontrak = angka(m.nilai_kontrak) ?? 0
  const progres = angka(m.progres_diakui_pct) ?? 0
  const retPct = angka(m.retensi_pct) ?? 0
  const sebelumnya = angka(m.kumulatif_sebelumnya) ?? 0
  const dp = angka(m.potongan_dp) ?? 0
  const lain = angka(m.potongan_lain) ?? 0

  const nilai_prestasi = rupiah((kontrak * progres) / 100)
  const nilai_periode = rupiah(nilai_prestasi - sebelumnya)

  // Retensi dari nilai PERIODE. Dari kumulatif, retensi yang sudah ditahan
  // periode-periode lalu akan ditahan berulang kali.
  //
  // Pada periode negatif retensi ikut negatif — itu benar: ia MENGEMBALIKAN
  // retensi yang terlanjur ditahan atas prestasi yang ternyata dikoreksi
  // turun. Memaksanya ke nol membuat kontraktor kehilangan uang itu diam-diam.
  const retensi = rupiah((nilai_periode * retPct) / 100)

  const nilai_bersih = rupiah(nilai_periode - retensi - dp - lain)

  // Estimasi, bukan angka pasti: retensi periode-periode sebelumnya tidak
  // diketahui dari masukan ini. Dinamai `_estimasi` supaya pemakainya tak
  // memperlakukannya sebagai saldo retensi yang sebenarnya.
  const retensi_kumulatif_estimasi = rupiah((nilai_prestasi * retPct) / 100)

  const peringatan: PeringatanIpc[] = []
  if (nilai_periode < 0) peringatan.push('periode_negatif')
  else if (nilai_periode === 0) peringatan.push('tak_ada_yang_ditagih')
  // Diperiksa hanya saat periodenya positif: pada periode negatif, "potongan
  // melebihi hak" adalah akibat, bukan sebab, dan menampilkan keduanya
  // membuat sebab aslinya tenggelam.
  if (nilai_periode > 0 && nilai_bersih < 0) peringatan.push('potongan_melebihi_hak')
  if (progres >= 100) peringatan.push('prestasi_penuh')

  return {
    nilai_prestasi,
    nilai_periode,
    retensi,
    potongan_dp: rupiah(dp),
    potongan_lain: rupiah(lain),
    nilai_bersih,
    retensi_kumulatif_estimasi,
    peringatan,
    layak_diajukan: nilai_periode > 0 && nilai_bersih > 0,
  }
}
