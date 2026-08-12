/**
 * SURAT PERINTAH KERJA (E1) — perintah kerja resmi ke subkontraktor.
 *
 * ── Rantai yang putus, diukur 2026-08-12
 *
 *     tender_subkon        3 tender, 1 penawaran MENANG      ADA
 *     ────────────────────────────────────────────────────────────
 *     SPK                  perintah kerja resmi              TAK ADA
 *     ────────────────────────────────────────────────────────────
 *     work_scopes          20 lingkup + pembayaran           ADA
 *
 * NOL dari 3 tender punya `work_scope_id`. Satu penawaran menang, dan tak ada
 * apa pun yang menghubungkannya ke lingkup kerja yang dikerjakan.
 *
 * Dan `work_scopes` sudah punya LIMA kolom kontrak sejak 2024 yang tak pernah
 * dibaca satu baris kode pun — 20 dari 20 berstatus `unsigned`, termasuk yang
 * bernilai Rp 280 juta.
 */

export type StatusSpk = 'draf' | 'diterbitkan' | 'ditandatangani' | 'dibatalkan'

export interface MasukanSpk {
  lingkupKerja?: string
  nilaiKontrak?: number | string | null
  tanggalMulai?: string
  tanggalSelesai?: string
  dendaPerHari?: number | string | null
  dendaMaksPct?: number | string | null
}

export type HasilValidasiSpk =
  | { ok: true; nilai: { nilaiKontrak: number; dendaPerHari: number | null; dendaMaksPct: number | null } }
  | { ok: false; galat: string }

const TGL = /^\d{4}-\d{2}-\d{2}$/

/**
 * Baca nominal yang boleh KOSONG.
 *
 * `Number('')` bernilai 0, bukan NaN — kelas cacat yang berulang di repo ini.
 * Kosong ditangani SEBELUM konversi supaya "belum diputuskan" (null) tak
 * berubah jadi "tak ada denda" (0). Bedanya nyata: yang pertama menunggu
 * keputusan, yang kedua sudah diputuskan bahwa sanksinya nihil.
 */
function nominalOpsional(v: number | string | null | undefined): number | null | 'rusak' {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : 'rusak'
}

export function validasiSpk(m: MasukanSpk): HasilValidasiSpk {
  if (!m.lingkupKerja?.trim()) {
    return { ok: false, galat: 'Lingkup kerja wajib diisi — SPK tanpa lingkup tak memerintahkan apa pun.' }
  }

  if (m.nilaiKontrak === null || m.nilaiKontrak === undefined || m.nilaiKontrak === '') {
    return { ok: false, galat: 'Nilai kontrak wajib diisi' }
  }
  const nilai = Number(m.nilaiKontrak)
  if (!Number.isFinite(nilai) || nilai <= 0) {
    return { ok: false, galat: 'Nilai kontrak harus lebih dari nol' }
  }

  if (!m.tanggalMulai || !TGL.test(m.tanggalMulai)) {
    return { ok: false, galat: 'tanggal_mulai wajib, bentuk YYYY-MM-DD' }
  }
  if (!m.tanggalSelesai || !TGL.test(m.tanggalSelesai)) {
    return { ok: false, galat: 'tanggal_selesai wajib, bentuk YYYY-MM-DD' }
  }
  if (m.tanggalSelesai < m.tanggalMulai) {
    // Perbandingan STRING pada bentuk YYYY-MM-DD sudah benar secara leksikal,
    // dan menghindari pergeseran zona waktu yang muncul saat mem-parse Date.
    return {
      ok: false,
      galat: `Tanggal selesai (${m.tanggalSelesai}) mendahului mulai (${m.tanggalMulai}). `
        + 'Jangka waktu negatif membuat denda keterlambatan terhitung sejak hari pertama.',
    }
  }

  const denda = nominalOpsional(m.dendaPerHari)
  if (denda === 'rusak') return { ok: false, galat: 'Denda per hari tak terbaca sebagai angka' }
  if (denda !== null && denda < 0) return { ok: false, galat: 'Denda per hari tak boleh negatif' }

  const maks = nominalOpsional(m.dendaMaksPct)
  if (maks === 'rusak') return { ok: false, galat: 'Batas denda tak terbaca sebagai angka' }
  if (maks !== null && (maks < 0 || maks > 100)) {
    return { ok: false, galat: 'Batas denda harus 0–100 persen' }
  }

  // Denda tanpa batas atas DIIZINKAN, tetapi kombinasi terbalik ditolak:
  // batas atas tanpa tarif harian adalah aturan yang tak bisa dihitung.
  if (denda === null && maks !== null) {
    return {
      ok: false,
      galat: 'Batas denda diisi tanpa tarif per hari — tak ada yang bisa dihitung darinya.',
    }
  }

  return { ok: true, nilai: { nilaiKontrak: nilai, dendaPerHari: denda, dendaMaksPct: maks } }
}

export interface HasilDenda {
  hariTerlambat: number
  dendaKotor: number
  dendaTerbatas: number
  terkenaBatas: boolean
}

/**
 * Denda keterlambatan pada tanggal acuan.
 *
 * ── Kenapa batas atas dihitung dari NILAI KONTRAK
 *
 * `denda_maks_pct` adalah persen dari nilai SPK, bukan dari denda kotor.
 * Menghitungnya dari denda kotor membuat batasnya bergerak mengikuti
 * keterlambatan — dan "maksimum 5%" jadi tak berarti apa-apa.
 *
 * ── Kenapa selesai lebih awal TIDAK menghasilkan denda negatif
 *
 * Hari terlambat dipagari nol. Denda negatif akan MENAMBAH pembayaran, dan
 * bonus penyelesaian dini adalah kesepakatan terpisah yang tak pernah
 * dituliskan di sini.
 */
export function hitungDendaKeterlambatan(m: {
  tanggalSelesai: string
  tanggalAcuan: string
  nilaiKontrak: number
  dendaPerHari: number | null
  dendaMaksPct: number | null
}): HasilDenda {
  const kosong = { hariTerlambat: 0, dendaKotor: 0, dendaTerbatas: 0, terkenaBatas: false }
  if (!m.dendaPerHari || m.dendaPerHari <= 0) return kosong

  const selesai = Date.parse(m.tanggalSelesai)
  const acuan = Date.parse(m.tanggalAcuan)
  if (!Number.isFinite(selesai) || !Number.isFinite(acuan)) return kosong

  const hari = Math.floor((acuan - selesai) / 86_400_000)
  if (hari <= 0) return kosong

  const kotor = Math.round(hari * m.dendaPerHari * 100) / 100
  if (m.dendaMaksPct === null) {
    return { hariTerlambat: hari, dendaKotor: kotor, dendaTerbatas: kotor, terkenaBatas: false }
  }

  const batas = Math.round(m.nilaiKontrak * m.dendaMaksPct / 100 * 100) / 100
  const terbatas = Math.min(kotor, batas)
  return {
    hariTerlambat: hari,
    dendaKotor: kotor,
    dendaTerbatas: terbatas,
    terkenaBatas: kotor > batas,
  }
}

export type HasilTerbit =
  | { boleh: true }
  | { boleh: false; sebab: string }

/**
 * Bolehkah SPK berpindah ke status berikutnya?
 *
 * Alurnya searah: draf → diterbitkan → ditandatangani. Pembatalan boleh dari
 * mana pun kecuali yang sudah dibatalkan.
 *
 * ── Kenapa `ditandatangani` menuntut kedua tanda tangan
 *
 * SPK yang hanya ditandatangani penerbit bukan perintah yang disepakati; ia
 * pemberitahuan. Yang membuatnya mengikat adalah penerimaan pelaksana — dan
 * itulah yang dicari saat terjadi sengketa lingkup.
 */
export function periksaTransisiSpk(m: {
  statusSekarang: StatusSpk
  statusTujuan: StatusSpk
  adaTtdPenerbit: boolean
  adaTtdPelaksana: boolean
  alasanBatal?: string | null
}): HasilTerbit {
  const { statusSekarang: dari, statusTujuan: ke } = m

  if (dari === 'dibatalkan') {
    return { boleh: false, sebab: 'SPK sudah dibatalkan dan tak bisa diubah lagi.' }
  }
  if (dari === ke) {
    return { boleh: false, sebab: `SPK sudah berstatus ${ke}.` }
  }

  if (ke === 'dibatalkan') {
    if (!m.alasanBatal?.trim()) {
      return {
        boleh: false,
        sebab: 'Pembatalan wajib beralasan — pelaksana berhak tahu kenapa perintahnya ditarik.',
      }
    }
    return { boleh: true }
  }

  if (ke === 'diterbitkan') {
    if (dari !== 'draf') {
      return { boleh: false, sebab: `Hanya draf yang bisa diterbitkan; ini berstatus ${dari}.` }
    }
    return { boleh: true }
  }

  if (ke === 'ditandatangani') {
    if (dari !== 'diterbitkan') {
      return {
        boleh: false,
        sebab: `SPK harus diterbitkan lebih dulu; ini berstatus ${dari}.`,
      }
    }
    if (!m.adaTtdPenerbit || !m.adaTtdPelaksana) {
      const kurang = !m.adaTtdPenerbit && !m.adaTtdPelaksana
        ? 'kedua tanda tangan'
        : !m.adaTtdPenerbit ? 'tanda tangan penerbit' : 'tanda tangan pelaksana'
      return {
        boleh: false,
        sebab: `Belum ada ${kurang}. SPK bertanda tangan satu pihak adalah pemberitahuan, `
          + 'bukan kesepakatan.',
      }
    }
    return { boleh: true }
  }

  return { boleh: false, sebab: `Perpindahan ${dari} → ${ke} tak dikenal.` }
}
