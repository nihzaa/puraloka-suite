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
    kunciKredensial: 'AI_PROVIDER_API_KEY',
    butuhBaseUrl: true,
  },
]

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

  return {
    ok: true,
    adaptor: new AdaptorOpenAICompatible(opsi.apiKey, opsi.baseUrl!, meta.id),
  }
}
