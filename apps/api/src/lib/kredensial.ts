/**
 * PEMBACA KREDENSIAL TERPUSAT — satu-satunya tempat nilai dibuka.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HARUS SATU TEMPAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mendekripsi kredensial itu SAH — memang begitu cara kunci dipakai saat
 * memanggil penyedia. Yang berbahaya adalah mendekripsinya di rute yang
 * membalas ke browser: dari sana jaraknya ke `reply.send` cuma satu baris,
 * dan kebocorannya tak menimbulkan error apa pun.
 *
 * Jadi `bukaNilai()` hanya boleh dipanggil dari berkas ini, dan penjaga
 * `audit-kredensial-tak-bocor.mjs` (aturan K-4) menegakkannya.
 *
 * ── Urutan sumber, dan kenapa urutannya begitu
 *
 *   1. kredensial tenant  (app_credentials)
 *   2. env server         (process.env)
 *   3. tidak ada          → null
 *
 * Tenant lebih dulu supaya pelanggan yang memasang kuncinya sendiri memakai
 * kuncinya sendiri — itu inti multi-tenant. Env jadi jaring pengaman supaya
 * satu instalasi bisa jalan tanpa tiap tenant wajib punya kunci, dan supaya
 * `/ai/insight` yang sudah ada hari ini tak mendadak mati saat lapisan ini
 * dipasang.
 *
 * Urutan sebaliknya (env menang) akan membuat kunci tenant DIAM-DIAM
 * diabaikan di server yang env-nya terisi — kelas kegagalan yang paling
 * membingungkan: konfigurasi terlihat tersimpan tapi tak berpengaruh.
 *
 * ── Kenapa ada cache, dan kenapa hanya 60 detik
 *
 * Kredensial dibaca tiap kali penyedia dipanggil. Tanpa cache, satu percakapan
 * AI 16 ronde berarti 16 query. Enam puluh detik cukup untuk menghapus beban
 * itu, dan cukup pendek supaya penggantian kunci dari UI terasa dalam satu
 * menit — bukan setelah restart.
 *
 * Cache dikunci per (tenant, kunci) dan DIBERSIHKAN eksplisit saat nilainya
 * ditulis, jadi jalur normal tak pernah menunggu 60 detik itu.
 */
import type { FastifyRequest } from 'fastify'
import { bukaNilai } from './kredensial-sandi.js'

const TTL_MS = 60_000

type Entri = { nilai: string | null; kedaluwarsa: number }
const cache = new Map<string, Entri>()

function kunciCache(companyId: string, kunci: string): string {
  return `${companyId}::${kunci}`
}

/**
 * Katalog kunci yang dikenal sistem.
 *
 * Sengaja daftar, bukan kolom bebas: UI pengaturan menampilkan apa yang
 * SEHARUSNYA disetel (termasuk yang belum), bukan hanya yang kebetulan sudah
 * ada barisnya. Tanpa katalog, admin tak punya cara tahu kunci apa yang
 * dibutuhkan sistem sampai sesuatu gagal.
 */
export interface MetaKredensial {
  kunci: string
  label: string
  keterangan: string
  /** Nama env yang dipakai sebagai jatuhan bila tenant belum menyetel. */
  env?: string
  /** Tautan dokumentasi cara memperolehnya. */
  tautan?: string
  grup: string
}

export const KATALOG_KREDENSIAL: MetaKredensial[] = [
  // ── WhatsApp (TJS-D1) ──────────────────────────────────────────────────
  //
  // Tiga bagian, bukan satu: Evolution menuntut alamat, kunci, DAN nama
  // instance. Menggabungkannya jadi satu string berformat akan membuat salah
  // ketik terbaca sebagai "kanal belum dikonfigurasi" alih-alih menunjuk
  // bagian mana yang salah.
  {
    kunci: 'WA_BASE_URL',
    label: 'WhatsApp — alamat server',
    keterangan: 'Alamat Evolution API, mis. http://localhost:8081. Tanpa garis miring di akhir.',
    env: 'WA_BASE_URL',
    grup: 'WhatsApp',
  },
  {
    kunci: 'WA_API_KEY',
    label: 'WhatsApp — kunci API',
    keterangan: 'Kunci global Evolution (AUTHENTICATION_API_KEY di server-nya).',
    env: 'WA_API_KEY',
    grup: 'WhatsApp',
  },
  {
    kunci: 'WA_INSTANCE',
    label: 'WhatsApp — nama instance',
    keterangan: 'Nama instance yang sudah memindai QR, mis. puraloka-bot.',
    env: 'WA_INSTANCE',
    grup: 'WhatsApp',
  },
  {
    kunci: 'ANTHROPIC_API_KEY',
    label: 'Anthropic (Claude)',
    keterangan: 'Dipakai asisten AI dan ringkasan dasbor.',
    env: 'ANTHROPIC_API_KEY',
    tautan: 'https://console.anthropic.com/settings/keys',
    grup: 'AI',
  },
  {
    kunci: 'OPENAI_API_KEY',
    label: 'OpenAI',
    keterangan: 'Alternatif penyedia AI. Kosongkan bila tak dipakai.',
    tautan: 'https://platform.openai.com/api-keys',
    grup: 'AI',
  },
  {
    kunci: 'AI_CUSTOM_API_KEY',
    label: 'Penyedia AI lain (OpenAI-compatible)',
    keterangan: 'Untuk penyedia yang memakai protokol OpenAI — OpenRouter, Groq, atau server sendiri.',
    grup: 'AI',
  },
  {
    kunci: 'AI_CUSTOM_BASE_URL',
    label: 'Alamat penyedia AI lain',
    keterangan: 'Biasanya berakhiran /v1. Bukan rahasia, tapi disimpan bersama kuncinya agar satu tempat.',
    grup: 'AI',
  },
  {
    kunci: 'EVOLUTION_API_KEY',
    label: 'Evolution API (WhatsApp)',
    keterangan: 'Kunci gateway WhatsApp. Lihat E:/Project/puraloka-wa/.env',
    grup: 'WhatsApp',
  },
  {
    kunci: 'EVOLUTION_API_URL',
    label: 'Alamat Evolution API',
    keterangan: 'Bawaan http://localhost:8081 — instalasi Puraloka, terpisah dari TJS.',
    grup: 'WhatsApp',
  },
  {
    kunci: 'EVOLUTION_INSTANCE',
    label: 'Nama instance WhatsApp',
    keterangan: 'Instance yang dipakai tenant ini, mis. puraloka-bot.',
    grup: 'WhatsApp',
  },
  {
    kunci: 'RESEND_API_KEY',
    label: 'Resend (email)',
    keterangan: 'Pengiriman email notifikasi. Tanpa ini, email tak terkirim (dan itu senyap).',
    env: 'RESEND_API_KEY',
    tautan: 'https://resend.com/api-keys',
    grup: 'Email',
  },
]

export function metaKredensial(kunci: string): MetaKredensial | undefined {
  return KATALOG_KREDENSIAL.find((m) => m.kunci === kunci)
}

/** Buang entri cache untuk satu kunci. Dipanggil sesudah tulis/hapus. */
export function lupakanKredensial(companyId: string, kunci: string): void {
  cache.delete(kunciCache(companyId, kunci))
}

/**
 * Ambil nilai kredensial yang BERLAKU untuk tenant ini.
 *
 * Mengembalikan `null` bila tak ada di mana pun — pemanggil yang memutuskan
 * apakah itu fatal. Fungsi ini sengaja TIDAK melempar untuk kasus "belum
 * disetel", karena banyak kunci memang opsional.
 *
 * TAPI ia melempar bila nilainya ADA namun tak bisa dibuka: itu berarti kunci
 * enkripsi berganti atau datanya rusak, dan mengembalikan `null` di situ akan
 * menyamarkannya jadi "belum disetel" — lalu orang memasang ulang kuncinya
 * tanpa pernah tahu yang lama masih ada dan tak terbaca.
 */
export async function ambilKredensial(
  request: FastifyRequest,
  kunci: string,
): Promise<string | null> {
  const companyId = request.companyId
  if (!companyId) return null

  const ck = kunciCache(companyId, kunci)
  const kini = Date.now()
  const tersimpan = cache.get(ck)
  if (tersimpan && tersimpan.kedaluwarsa > kini) return tersimpan.nilai

  let nilai: string | null = null

  const { data, error } = await request.db!
    .from('app_credentials')
    .select('nilai_enc')
    .eq('kunci', kunci)
    .maybeSingle()

  if (error) {
    // Kegagalan baca TIDAK boleh menyamar jadi "belum disetel" — kalau
    // dibiarkan, sistem diam-diam jatuh ke env milik tenant lain.
    request.log.error({ err: error, kunci }, 'gagal membaca kredensial tenant')
    throw new Error(`Gagal membaca kredensial '${kunci}': ${error.message}`)
  }

  if (data?.nilai_enc) {
    // Satu-satunya pemanggilan `bukaNilai` di luar berkas sandi (penjaga K-4).
    nilai = bukaNilai(data.nilai_enc as string)
  } else {
    const meta = metaKredensial(kunci)
    nilai = meta?.env ? (process.env[meta.env]?.trim() || null) : null
  }

  cache.set(ck, { nilai, kedaluwarsa: kini + TTL_MS })
  return nilai
}

/** Dari mana nilai yang berlaku berasal — untuk ditampilkan di UI. */
export type SumberKredensial = 'tenant' | 'env' | 'tidak-ada'

export function sumberKredensial(adaBarisTenant: boolean, kunci: string): SumberKredensial {
  if (adaBarisTenant) return 'tenant'
  const meta = metaKredensial(kunci)
  if (meta?.env && process.env[meta.env]?.trim()) return 'env'
  return 'tidak-ada'
}
