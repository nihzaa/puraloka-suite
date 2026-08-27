/**
 * HARGA MODEL AI — SATU SUMBER, dan itu bukan kerapian belaka.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT TJS YANG DICEGAH BERKAS INI (spec §5.1 C-7)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS punya DUA tabel harga hardcode yang tak sepakat:
 *
 *   `lib/owner-ai/model-pricing.ts`   Opus  $5 / $25 per MTok   <- dipakai MENCATAT biaya
 *   `lib/ai/providers/anthropic.ts`   Opus $15 / $75 per MTok   <- dipakai UI
 *
 * Biaya yang tercatat **3x lebih rendah** dari yang ditampilkan ke admin. Dan
 * tak ada yang salah secara teknis — keduanya "bekerja", hanya menjawab
 * pertanyaan berbeda dengan angka berbeda.
 *
 * Angka biaya yang salah lebih berbahaya daripada tak ada angka: ia dipercaya.
 * Admin yang melihat "Rp 200 ribu bulan ini" mengambil keputusan berdasarkan
 * itu, dan tagihannya datang tiga kali lipat.
 *
 * Berkas ini satu-satunya tempat harga boleh hidup. `audit-satu-sumber-harga`
 * menjaganya: harga per-MTok di luar berkas ini = CI merah.
 *
 * ── Kenapa harga dipaku di kode, bukan di basis
 *
 * Harga penyedia berubah beberapa kali setahun, dan perubahannya harus
 * ditinjau — bukan disunting diam-diam lewat UI oleh siapa pun yang punya
 * akses. Di kode, ia lewat review dan git blame; di basis, ia hilang begitu
 * seseorang salah ketik.
 *
 * ── Model tak dikenal → tarif TERMAHAL, bukan nol
 *
 * Diambil dari TJS, dan keputusan itu benar: lebih baik melebihkan perkiraan
 * biaya daripada diam-diam mencatat nol. Biaya nol pada model yang sebenarnya
 * mahal membuat batas bulanan tak pernah tercapai — dan batas yang tak pernah
 * tercapai sama saja dengan tak ada batas.
 */

export interface HargaModel {
  /** USD per 1 juta token masukan biasa. */
  masuk: number
  /** USD per 1 juta token keluaran. */
  keluar: number
  /** Penulisan cache — biasanya 1,25x masuk. */
  cacheTulis: number
  /** Pembacaan cache — biasanya 0,1x masuk. */
  cacheBaca: number
  label: string
  cocokUntuk: string
}

/**
 * Harga per 1 juta token, USD. Dikonfirmasi 2026-08-09.
 *
 * Rasio cache (tulis 1,25x · baca 0,1x) konsisten di seluruh lini Claude saat
 * ini. Kalau kelak berbeda per model, tulis angkanya apa adanya — jangan
 * menghitungnya dari `masuk`, karena rumus yang benar hari ini jadi kebohongan
 * senyap saat rasionya berubah.
 */
export const HARGA_MODEL: Record<string, HargaModel> = {
  'claude-opus-5': {
    masuk: 5.0, keluar: 25.0, cacheTulis: 6.25, cacheBaca: 0.5,
    label: 'Claude Opus 5',
    cocokUntuk: 'Penalaran rumit, keputusan berkonsekuensi, tool-calling bertingkat.',
  },
  'claude-sonnet-5': {
    masuk: 3.0, keluar: 15.0, cacheTulis: 3.75, cacheBaca: 0.3,
    label: 'Claude Sonnet 5',
    cocokUntuk: 'Keseimbangan biaya & kemampuan — pilihan harian yang wajar.',
  },
  'claude-haiku-4-5': {
    masuk: 1.0, keluar: 5.0, cacheTulis: 1.25, cacheBaca: 0.1,
    label: 'Claude Haiku 4.5',
    cocokUntuk: 'Tugas ringan: klasifikasi, ringkasan pendek, dua kalimat naratif.',
  },
}

/**
 * Tarif untuk model tak dikenal — sengaja yang TERMAHAL yang terdaftar.
 *
 * Dihitung, bukan dipaku: menuliskan angkanya berarti ia jadi basi diam-diam
 * begitu ada model yang lebih mahal ditambahkan di atas.
 */
const TERMAHAL: HargaModel = Object.values(HARGA_MODEL).reduce((a, b) =>
  b.keluar > a.keluar ? b : a,
)

export function hargaModel(model: string): HargaModel {
  return HARGA_MODEL[model] ?? TERMAHAL
}

/*
  `modelDikenal()` pernah ada di sini dan dibuang 2026-08-27 — nol pemanggil.

  Dibuang, bukan disambungkan, karena keberadaannya BERTENTANGAN dengan desain
  di atasnya. `hargaModel()` sengaja jatuh ke tarif TERMAHAL untuk model tak
  dikenal: biaya yang ditaksir terlalu tinggi menahan pemakaian, biaya yang
  ditaksir nol membiarkannya lewat. Fungsi boolean terpisah mengundang pola
  `if (!modelDikenal(m)) tolak` — menolak model baru yang sebenarnya sah,
  sekaligus melewatkan pagar biaya yang sudah bekerja tanpa perlu ditanya.
*/

export interface PemakaianToken {
  masuk: number
  keluar: number
  cacheTulis?: number
  cacheBaca?: number
}

/** Biaya satu ronde dalam USD. */
export function biayaUsd(model: string, pakai: PemakaianToken): number {
  const h = hargaModel(model)
  return (
    (pakai.masuk / 1_000_000) * h.masuk +
    (pakai.keluar / 1_000_000) * h.keluar +
    ((pakai.cacheTulis ?? 0) / 1_000_000) * h.cacheTulis +
    ((pakai.cacheBaca ?? 0) / 1_000_000) * h.cacheBaca
  )
}

/**
 * Kurs USD→IDR.
 *
 * Dari env supaya bisa disesuaikan tanpa deploy, dengan bawaan yang masuk akal.
 * TJS memaku `16000` di dalam komponen UI — dan kurs mati di komponen berarti
 * biaya historis ikut berubah tiap kali angkanya disunting.
 *
 * Di sini kursnya disimpan BERSAMA tiap baris biaya (`ai_biaya_token.kurs_idr`),
 * jadi mengubah nilai ini hanya memengaruhi pencatatan BERIKUTNYA — riwayat
 * tetap seperti saat ia dicatat.
 */
export function kursUsdIdr(): number {
  const dariEnv = Number(process.env.KURS_USD_IDR)
  return Number.isFinite(dariEnv) && dariEnv > 0 ? dariEnv : 16_000
}

/** Biaya satu ronde dalam Rupiah, dibulatkan ke sen. */
export function biayaIdr(model: string, pakai: PemakaianToken, kurs = kursUsdIdr()): number {
  return Math.round(biayaUsd(model, pakai) * kurs * 100) / 100
}