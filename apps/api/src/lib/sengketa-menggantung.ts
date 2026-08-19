/**
 * SENGKETA YANG MENGGANTUNG — klaim yang berhenti bergerak.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SENGKETA BERBEDA DARI SELURUH OTOMASI LAIN DI REPO INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hampir semua otomasi di sini menjaga sesuatu yang MEMBURUK bila didiamkan:
 * stok habis, polis kedaluwarsa, alat rusak. Sengketa tidak memburuk — ia
 * KEDALUWARSA.
 *
 * Klaim konstruksi punya tenggat yang lahir dari kontrak dan dari hukum:
 * pemberitahuan dalam sekian hari, somasi sebelum arbitrase, dan daluwarsa
 * gugatan. Klaim yang benar secara isi bisa GUGUR total karena berhenti
 * bergerak, dan tak ada satu pun gejala di sepanjang jalan.
 *
 * Diukur 2026-08-16:
 *
 *   SKT-01  Perbedaan volume galian tanah keras
 *           Rp 420.000.000 · negosiasi · TANPA FORUM · 97 hari
 *   SKT-02  Klaim perpanjangan waktu akibat keterlambatan lahan
 *           mediasi BANI Bandung · 170 hari · nilai tak dicantumkan
 *   (tanpa nomor)  Batas lahan sisi utara tak sesuai sertifikat
 *           dicatat · 22 hari · belum diberi nomor
 *
 * SKT-01 itu yang paling mahal sekaligus paling sunyi: hampir setengah miliar,
 * masih "negosiasi" sesudah tiga bulan, dan `forum` NULL — artinya belum ada
 * jalur formal apa pun bila negosiasinya buntu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA KEADAAN, DAN AMBANGNYA BERBEDA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   BELUM BERNOMOR   sengketa yang tercatat tetapi tak diberi nomor perkara.
 *                    Tanpa nomor ia tak bisa dirujuk di surat-menyurat, dan
 *                    praktis tak ada dalam arsip. Ambangnya paling PENDEK.
 *   TANPA FORUM      sudah lama berjalan tanpa jalur formal yang ditetapkan.
 *                    Selama negosiasi berjalan itu wajar; sesudah berbulan-
 *                    bulan itu berarti tak ada rencana bila gagal.
 *   LAMA DIAM        umurnya melewati ambang, apa pun statusnya.
 *
 * Ketiganya diperiksa berurutan, dan yang PERTAMA menang — bukan karena paling
 * mahal, melainkan karena paling mudah diperbaiki. Memberi nomor perkara
 * pekerjaan lima menit; memilih forum arbitrase keputusan direksi.
 */

export interface Sengketa {
  nomor: string | null
  /** `dicatat` · `negosiasi` · `mediasi` · `arbitrase` · `selesai` · … */
  status: string
  forum: string | null
  nilaiTuntutan: number | null
  /** Hari sejak `tanggal_mulai`. */
  umurHari: number
}

export interface HasilSengketa {
  umurHari: number
  perlu: boolean
  sebab: 'bergerak' | 'selesai' | 'belum_bernomor' | 'tanpa_forum' | 'lama_diam'
}

/** Status yang berarti perkaranya sudah tak berjalan. */
const SELESAI = new Set(['selesai', 'ditutup', 'dicabut', 'batal'])

/**
 * @param ambangNomor hari sebelum sengketa tanpa nomor dianggap terlantar
 * @param ambangForum hari sebelum sengketa tanpa forum dianggap tanpa rencana
 * @param ambangDiam  hari sebelum sengketa apa pun dianggap berhenti bergerak
 */
export function nilaiSengketa(
  s: Sengketa,
  ambangNomor: number,
  ambangForum: number,
  ambangDiam: number,
): HasilSengketa {
  const umurHari = Number(s.umurHari)
  const status = (s.status ?? '').trim().toLowerCase()

  /*
    Perkara yang sudah SELESAI tak ditegur, berapa pun umurnya.

    Tanpa penjagaan ini, sengketa yang tuntas setahun lalu akan terus muncul
    sebagai "lama diam" selamanya — dan peringatan yang menyebut perkara
    tertutup membuat orang berhenti mempercayai seluruh peringatan sengketa.
  */
  if (SELESAI.has(status)) {
    return { umurHari, perlu: false, sebab: 'selesai' }
  }

  if (!Number.isFinite(umurHari) || umurHari < 0) {
    /*
      Umur tak terbaca diperlakukan sebagai BERGERAK, bukan menggantung.

      Berbeda dari `kabar-klien.ts`, yang memperlakukan tanggal rusak sebagai
      "belum pernah". Alasannya berbeda: di sana ketiadaan tanggal ADALAH
      gejalanya. Di sini menuduh perkara yang tanggalnya salah ketik berarti
      mengirim peringatan hukum atas dasar yang keliru — dan pesan sengketa
      yang salah lebih berbahaya daripada yang terlambat.
    */
    return { umurHari: 0, perlu: false, sebab: 'bergerak' }
  }

  const bernomor = (s.nomor ?? '').trim().length > 0
  if (!bernomor && umurHari >= ambangNomor) {
    return { umurHari, perlu: true, sebab: 'belum_bernomor' }
  }

  const berforum = (s.forum ?? '').trim().length > 0
  if (!berforum && umurHari >= ambangForum) {
    return { umurHari, perlu: true, sebab: 'tanpa_forum' }
  }

  if (umurHari >= ambangDiam) {
    return { umurHari, perlu: true, sebab: 'lama_diam' }
  }

  return { umurHari, perlu: false, sebab: 'bergerak' }
}
