/**
 * PABRIK ADAPTOR — satu-satunya tempat penyedia dipilih.
 *
 * Pemanggil tak pernah menyebut nama kelas adaptor. Ia meminta adaptor untuk
 * konfigurasi tenant, dan mendapat sesuatu yang memenuhi `AdaptorPenyedia`.
 *
 * ── Kenapa penyedia divalidasi terhadap DAFTAR, bukan diterima apa adanya
 *
 * `ai_provider_config.penyedia` kolom TEXT, jadi salah ketik ("anthropc") akan
 * tersimpan tanpa keluhan. Kalau pabrik ini jatuh ke bawaan saat namanya tak
 * dikenal, tenant yang mengira sudah pindah penyedia diam-diam tetap memakai
 * yang lama — dan tagihannya datang dari tempat yang tak ia duga.
 */

import { AdaptorAnthropic } from './ai-penyedia-anthropic.js'
import { AdaptorOpenAICompatible } from './ai-penyedia-openai.js'
import type { AdaptorPenyedia } from './ai-penyedia.js'

export interface PenyediaTersedia {
  id: string
  label: string
  keterangan: string
  /** Nama kunci di `app_credentials` (katalog `lib/kredensial.ts`). */
  kunciKredensial: string
  /** Penyedia OpenAI-compatible menuntut alamat dasar; Anthropic tidak. */
  butuhBaseUrl: boolean
}

export const PENYEDIA: PenyediaTersedia[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    keterangan: 'Penyedia bawaan. Model Claude, harga sudah terdaftar di sistem.',
    kunciKredensial: 'ANTHROPIC_API_KEY',
    butuhBaseUrl: false,
  },
  {
    id: 'openai-compatible',
    label: 'Penyedia OpenAI-compatible',
    keterangan:
      'OpenRouter, Groq, Together, atau server lokal yang meniru API OpenAI. ' +
      'Butuh alamat dasar dan kunci sendiri; harga TIDAK diketahui sistem, jadi ' +
      'biayanya dicatat dengan tarif termahal yang terdaftar.',
    /*
     * `AI_CUSTOM_API_KEY`, BUKAN `AI_PROVIDER_API_KEY`.
     *
     * Sampai 2026-08-12 baris ini berbunyi `AI_PROVIDER_API_KEY` — nama yang
     * TIDAK ADA di `KATALOG_KREDENSIAL`. `ai-jalankan.ts:233` membaca nama itu
     * lewat `metaP?.kunciKredensial`, jadi memilih penyedia OpenAI-compatible
     * SELALU berakhir `kunci_tak_ada`: tak ada kotak untuk mengisinya, dan
     * kotak `AI_CUSTOM_API_KEY` yang ADA di halaman tak pernah dibaca siapa pun.
     *
     * Ini kembaran persis dari cacat `AI_PROVIDER_BASE_URL` yang sudah
     * diperbaiki dan didokumentasikan di `kredensial.ts:123-136` — hanya saja
     * yang ini luput, karena `audit-kredensial-punya-tempat.mjs` cuma
     * mengenali literal `ambilKredensial(x, 'KUNCI')` / `baca('KUNCI')`.
     * Di sini kuncinya dioper sebagai DATA, bukan literal di titik panggil,
     * sehingga penjaganya buta terhadap bentuk ini.
     *
     * Penjaganya diperluas bersama perbaikan ini (lihat skrip yang sama),
     * supaya bentuk tak-langsung ini pun ikut terjaring.
     */
    kunciKredensial: 'AI_CUSTOM_API_KEY',
    butuhBaseUrl: true,
  },
  {
    /*
     * OpenAI RESMI — dan kenapa ia terpisah dari `openai-compatible`.
     *
     * `OPENAI_API_KEY` sudah punya kotak di halaman Kredensial
     * (`kredensial.ts:110`) DAN tombol uji yang benar-benar memanggil
     * `api.openai.com/v1/models` (`routes/v1/kredensial.ts:308`). Tapi sampai
     * 2026-08-12 tak ada satu pun adaptor yang membacanya — kotak yang bisa
     * diisi, diuji, dan dinyatakan "sehat", lalu tak pernah dipakai apa pun.
     *
     * Itu kebalikan persis dari cacat `AI_CUSTOM_API_KEY` di atas: yang satu
     * dibaca tanpa kotak, yang ini berkotak tanpa pembaca. Keduanya berujung
     * sama — orang mengisi sesuatu yang tak berpengaruh, tanpa gejala.
     *
     * Dipisah dari `openai-compatible` karena base URL-nya TETAP dan sudah
     * diketahui. Menyuruh orang mengetik `https://api.openai.com/v1` untuk
     * memakai OpenAI adalah undangan salah ketik yang gagalnya baru terlihat
     * saat panggilan pertama — dan gagal itu tampak seperti "kunci salah".
     */
    id: 'openai',
    label: 'OpenAI (resmi)',
    keterangan:
      'GPT dari OpenAI langsung. Alamatnya sudah tetap — cukup isi kunci. ' +
      'Harga model OpenAI TIDAK terdaftar di sistem, jadi biayanya dicatat ' +
      'dengan tarif termahal yang dikenal (lihat ai-harga.ts).',
    kunciKredensial: 'OPENAI_API_KEY',
    butuhBaseUrl: false,
  },
]

/** Alamat tetap untuk penyedia yang base URL-nya tak perlu ditanyakan. */
const BASE_URL_TETAP: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
}

export function penyediaDikenal(id: string): boolean {
  return PENYEDIA.some((p) => p.id === id)
}

export function metaPenyedia(id: string): PenyediaTersedia | undefined {
  return PENYEDIA.find((p) => p.id === id)
}

export interface OpsiAdaptor {
  penyedia: string
  apiKey: string
  baseUrl?: string
}

export type HasilAdaptor =
  | { ok: true; adaptor: AdaptorPenyedia }
  | { ok: false; alasan: 'penyedia_tak_dikenal' | 'kunci_tak_ada' | 'base_url_tak_ada'; pesan: string }

/**
 * Mengembalikan hasil, bukan melempar — sama seperti `chat()`.
 *
 * Pemanggil `/ai/insight` menjawab kegagalan dengan jalur deterministik 200;
 * pemanggil lain mungkin 402. Melempar dari sini memaksa keduanya membungkus
 * try/catch dan menebak artinya.
 */
export function buatAdaptor(opsi: OpsiAdaptor): HasilAdaptor {
  const meta = metaPenyedia(opsi.penyedia)
  if (!meta) {
    return {
      ok: false,
      alasan: 'penyedia_tak_dikenal',
      pesan: `Penyedia '${opsi.penyedia}' tidak dikenal sistem. Yang tersedia: ${PENYEDIA.map((p) => p.id).join(', ')}.`,
    }
  }

  if (!opsi.apiKey?.trim()) {
    return {
      ok: false,
      alasan: 'kunci_tak_ada',
      pesan: `Kunci '${meta.kunciKredensial}' belum dipasang di halaman Kredensial.`,
    }
  }

  if (meta.butuhBaseUrl && !opsi.baseUrl?.trim()) {
    return {
      ok: false,
      alasan: 'base_url_tak_ada',
      pesan: `Penyedia '${meta.label}' butuh alamat dasar (base URL).`,
    }
  }

  if (opsi.penyedia === 'anthropic') {
    return { ok: true, adaptor: new AdaptorAnthropic(opsi.apiKey) }
  }

  // Penyedia beralamat tetap (OpenAI resmi) memakai alamatnya sendiri;
  // `opsi.baseUrl` tetap dihormati bila diisi, supaya proxy/gateway internal
  // masih mungkin tanpa menambah penyedia baru.
  const baseUrl = opsi.baseUrl?.trim() || BASE_URL_TETAP[meta.id]

  if (!baseUrl) {
    // Tak seharusnya tercapai — `butuhBaseUrl` sudah menjaringnya di atas.
    // Tetap dijawab sebagai hasil, bukan dilempar: kontrak berkas ini adalah
    // "kembalikan hasil, jangan melempar", dan satu pengecualian merusaknya.
    return {
      ok: false,
      alasan: 'base_url_tak_ada',
      pesan: `Penyedia '${meta.label}' tak punya alamat dasar.`,
    }
  }

  return {
    ok: true,
    adaptor: new AdaptorOpenAICompatible(opsi.apiKey, baseUrl, meta.id),
  }
}
