/**
 * ANTARMUKA ADAPTOR PENYEDIA AI — satu jalan ke model.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA CACAT TJS YANG DICEGAH BENTUK ANTARMUKA INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * C-6  `isError` hanya diteruskan adaptor Anthropic; adaptor lain menelannya.
 *      Akibatnya model tak pernah tahu tool-nya gagal, lalu melanjutkan
 *      seolah berhasil — dan menulis kalimat meyakinkan di atas kegagalan.
 *      Di sini `isError` ada di tipe `HasilTool`, jadi adaptor yang tak
 *      membawanya tidak bisa dikompilasi.
 *
 * TIMEOUT  TJS tak punya timeout sama sekali. Bawaan SDK Anthropic 10 menit,
 *      dikali 16 ronde tool-calling = 160 menit satu permintaan menggantung.
 *      Di sini timeout ada DI KONTRAK (`OpsiChat.timeoutMs`, ada bawaannya),
 *      bukan diserahkan ke tiap pemanggil untuk diingat.
 *
 * MELEMPAR  TJS melempar dari lapisan penyedia, jadi tiap pemanggil harus
 *      membungkusnya dengan try/catch dan menebak sendiri artinya. `chat()`
 *      di sini TAK PERNAH melempar — ia mengembalikan `ok: false` dengan
 *      alasan yang bisa dibedakan. Pemanggil memilih tindakan dari alasan,
 *      bukan dari mengurai pesan galat.
 *
 * ── Kenapa `alasan` sebuah union, bukan string
 *
 * Pemanggil bertindak berbeda untuk tiap sebab: `kunci_tak_ada` berarti minta
 * admin memasang kredensial, `kuota_habis` berarti tunggu, `timeout` berarti
 * boleh dicoba ulang, `ditolak_model` berarti JANGAN dicoba ulang karena
 * hasilnya akan sama. String bebas memaksa tiap pemanggil mencocokkan teks —
 * dan cocok-teks itu diam-diam rusak saat pesannya diperbaiki.
 */

/** Kemampuan dinyatakan PER MODEL, bukan per penyedia. */
export interface KemampuanModel {
  /** Sebagian model menolak `thinking` — mengirimkannya berakhir 400. */
  penalaranAdaptif: boolean
  toolCalling: boolean
  /** Keluaran berstruktur (JSON schema) didukung asli. */
  keluaranBerstruktur: boolean
  /** Jendela konteks, token. Dipakai pemangkasan riwayat. */
  jendelaToken: number
}

export interface PesanChat {
  peran: 'user' | 'assistant'
  isi: string
  /**
   * Panggilan tool yang dibuat asisten pada pesan ini.
   *
   * WAJIB dibawa kalau ronde berikutnya mengirim `hasilTool`. Diukur, bukan
   * ditebak — Anthropic menolak dengan 400:
   *
   *   "Each `tool_result` block must have a corresponding `tool_use` block in
   *    the previous message."
   *
   * Versi pertama loop mengirim teks datar `"(memanggil tool)"` sebagai
   * pengganti, dan ronde 1 berhasil sementara ronde 2 gagal — bentuk kegagalan
   * yang gampang disalahartikan sebagai penyedia bermasalah.
   *
   * Ini C-5 dalam bentuk lain: riwayat yang kehilangan blok tool bukan sekadar
   * kehilangan konteks, ia jadi TIDAK SAH.
   */
  panggilanTool?: PanggilanTool[]
  /**
   * Hasil tool yang dibawa pesan `user` ini.
   *
   * Ada di PESAN, bukan hanya di `OpsiChat.hasilTool`, karena urutannya
   * menentukan. `OpsiChat.hasilTool` selalu ditambahkan adaptor sebagai pesan
   * TERAKHIR — benar untuk satu putaran, salah begitu ada putaran ketiga:
   * dua `tool_use` berturut tanpa `tool_result` di antaranya, dan penyedia
   * menolak 400.
   */
  hasilTool?: HasilTool[]
}

export interface DefinisiTool {
  nama: string
  keterangan: string
  /** JSON Schema. Dinormalkan tiap adaptor ke bentuk yang penyedianya mau. */
  skema: Record<string, unknown>
}

export interface PanggilanTool {
  id: string
  nama: string
  /**
   * Argumen SELALU objek di sisi ini.
   *
   * Penyedia bergaya OpenAI mengirim `arguments` sebagai STRING JSON,
   * Anthropic mengirim objek. Membiarkan perbedaan itu bocor ke pemanggil
   * berarti tiap tool harus tahu penyedianya — dan satu di antaranya pasti
   * lupa, lalu `args.qty` bernilai `undefined` tanpa galat apa pun.
   */
  argumen: Record<string, unknown>
}

export interface HasilTool {
  id: string
  isi: string
  /**
   * C-6: WAJIB dibawa tiap adaptor.
   *
   * Kalau tool gagal dan model tak diberi tahu, model melanjutkan seolah
   * berhasil. Untuk ERP ini artinya kalimat percaya diri di atas data yang
   * tak pernah terbaca.
   */
  isError: boolean
}

export interface PemakaianAdaptor {
  masuk: number
  keluar: number
  cacheTulis: number
  cacheBaca: number
}

export type AlasanGagal =
  | 'kunci_tak_ada'
  | 'kunci_ditolak'
  | 'kuota_habis'
  | 'timeout'
  | 'model_tak_dikenal'
  | 'ditolak_model'
  | 'jaringan'
  | 'jawaban_tak_terbaca'
  | 'tak_didukung'

/** Alasan yang PANTAS dicoba ulang. Sisanya akan gagal dengan cara yang sama. */
export const ALASAN_BOLEH_ULANG: ReadonlySet<AlasanGagal> = new Set<AlasanGagal>([
  'timeout',
  'jaringan',
  'kuota_habis',
])

export type HasilChat =
  | {
      ok: true
      teks: string
      panggilanTool: PanggilanTool[]
      pemakaian: PemakaianAdaptor
      model: string
      /** `end_turn` | `tool_use` | `max_tokens` — dinormalkan tiap adaptor. */
      berhentiKarena: 'selesai' | 'butuh_tool' | 'kehabisan_token'
    }
  | {
      ok: false
      alasan: AlasanGagal
      /** Untuk log, BUKAN untuk dicocokkan pemanggil. */
      pesan: string
      bolehUlang: boolean
    }

export interface OpsiChat {
  model: string
  maxToken: number
  sistem?: string
  pesan: PesanChat[]
  tools?: DefinisiTool[]
  hasilTool?: HasilTool[]
  /** JSON Schema untuk keluaran berstruktur. */
  skemaJawaban?: Record<string, unknown>
  /**
   * Timeout SATU panggilan. Bawaannya di kontrak, bukan di pemanggil —
   * TJS menyerahkannya ke SDK (10 menit) dan tak seorang pun menyadarinya
   * sampai 16 ronde menggantung berjam-jam.
   */
  timeoutMs?: number
}

export const TIMEOUT_BAWAAN_MS = 30_000

/** Kontrak yang wajib dipenuhi tiap penyedia. */
export interface AdaptorPenyedia {
  readonly nama: string
  kemampuan(model: string): KemampuanModel
  /** TIDAK PERNAH melempar. Kegagalan datang sebagai `ok: false`. */
  chat(opsi: OpsiChat): Promise<HasilChat>
}

/**
 * Perkiraan token sebuah teks.
 *
 * Kasar dengan sengaja — 4 karakter per token adalah rasio yang lazim untuk
 * teks Latin, dan pemangkasan riwayat tak menuntut ketepatan tokenizer. Yang
 * dituntut adalah TIDAK MELEBIHI jendela, jadi perkiraan yang cenderung
 * melebihkan lebih aman daripada yang tepat tapi kadang kurang.
 */
export function perkiraanToken(teks: string): number {
  return Math.ceil(teks.length / 4) + 4
}

/**
 * Memangkas riwayat berdasarkan TOKEN, bukan jumlah pesan.
 *
 * TJS memangkas pada N pesan terakhir. Satu keluaran tool yang besar — daftar
 * 500 material, misalnya — bisa sendirian melampaui jendela konteks meski
 * "hanya satu pesan". Batas berbasis jumlah pesan tidak melihatnya, dan
 * panggilannya gagal dengan galat yang menyalahkan modelnya.
 *
 * Yang TERBARU dipertahankan: percakapan kehilangan awalnya, bukan akhirnya.
 * Kehilangan pesan terakhir berarti model menjawab pertanyaan yang bukan
 * pertanyaan terakhir penggunanya.
 */
export function pangkasRiwayat(pesan: PesanChat[], batasToken: number): PesanChat[] {
  const disimpan: PesanChat[] = []
  let total = 0
  for (let i = pesan.length - 1; i >= 0; i--) {
    const t = perkiraanToken(pesan[i].isi)
    if (total + t > batasToken && disimpan.length > 0) break
    disimpan.unshift(pesan[i])
    total += t
  }
  return disimpan
}

/**
 * Menjalankan `fn` dengan batas waktu.
 *
 * Dipakai adaptor yang SDK-nya tak punya timeout sendiri. Sinyal abort
 * diteruskan supaya permintaannya benar-benar dibatalkan — `Promise.race`
 * saja hanya berhenti MENUNGGU, sementara panggilannya jalan terus dan tetap
 * ditagih.
 */
export async function denganTimeout<T>(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<{ ok: true; nilai: T } | { ok: false; timeout: true }> {
  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), timeoutMs)
  try {
    return { ok: true, nilai: await fn(kendali.signal) }
  } catch (err) {
    if (kendali.signal.aborted) return { ok: false, timeout: true }
    throw err
  } finally {
    clearTimeout(jam)
  }
}

/**
 * Menerjemahkan galat penyedia jadi `AlasanGagal`.
 *
 * Dipakai bersama oleh SEMUA adaptor, dan itu disengaja: kalau tiap adaptor
 * memetakan sendiri, `kuota_habis` di satu penyedia bisa jadi `jaringan` di
 * penyedia lain — dan pemanggil yang memutuskan "boleh diulang" dari alasan
 * akan bertindak berbeda untuk kegagalan yang sama.
 */
export function alasanDariGalat(err: unknown): { alasan: AlasanGagal; pesan: string } {
  const e = err as { status?: number; message?: string; name?: string; code?: string }
  const pesan = e?.message ?? String(err)

  if (e?.name === 'AbortError' || e?.code === 'ETIMEDOUT') return { alasan: 'timeout', pesan }
  if (e?.status === 401 || e?.status === 403) return { alasan: 'kunci_ditolak', pesan }
  if (e?.status === 429) return { alasan: 'kuota_habis', pesan }
  if (e?.status === 404) return { alasan: 'model_tak_dikenal', pesan }
  // 5xx dan galat jaringan sama-sama pantas diulang, dan membedakannya di sini
  // tak mengubah tindakan pemanggil.
  if (e?.status && e.status >= 500) return { alasan: 'jaringan', pesan }
  if (e?.code === 'ECONNREFUSED' || e?.code === 'ENOTFOUND') return { alasan: 'jaringan', pesan }

  return { alasan: 'jaringan', pesan }
}

/** Bentuk kegagalan yang seragam — `bolehUlang` tak pernah ditebak pemanggil. */
export function gagal(alasan: AlasanGagal, pesan: string): HasilChat {
  return { ok: false, alasan, pesan, bolehUlang: ALASAN_BOLEH_ULANG.has(alasan) }
}
