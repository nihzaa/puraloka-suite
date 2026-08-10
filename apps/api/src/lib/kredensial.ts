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
    /*
     * `AI_PROVIDER_BASE_URL`, BUKAN `AI_CUSTOM_BASE_URL`.
     *
     * Katalog ini menawarkan nama yang kedua sampai 2026-08-10, sementara
     * kode membaca yang pertama (`ai.ts:203`, `ai-jalankan.ts:237` — nol
     * pembaca untuk nama yang ditawarkan). Akibatnya: kotak yang diisi orang
     * TIDAK PERNAH TERPAKAI, dan asisten diam-diam tetap memanggil alamat
     * bawaan.
     *
     * Tak ada gejala sama sekali — nilainya tersimpan rapi di basis, halaman
     * menampilkannya sebagai "terisi", dan yang mengisinya tak punya cara
     * tahu. Ditemukan oleh `audit-kredensial-punya-tempat.mjs` pada
     * jalannya yang PERTAMA.
     */
    kunci: 'AI_PROVIDER_BASE_URL',
    label: 'Alamat penyedia AI lain',
    keterangan: 'Biasanya berakhiran /v1. Bukan rahasia, tapi disimpan bersama kuncinya agar satu tempat.',
    grup: 'AI',
  },
  {
    kunci: 'EVOLUTION_API_KEY',
    label: 'Evolution API (WhatsApp)',
    keterangan: 'Kunci global gateway WhatsApp Anda (AUTHENTICATION_API_KEY di server Evolution).',
    grup: 'WhatsApp',
  },
  {
    kunci: 'EVOLUTION_API_URL',
    label: 'Alamat Evolution API',
    keterangan: 'Alamat server Evolution Anda, mis. http://localhost:8081. Tanpa garis miring di akhir.',
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

  /*
   * ── n8n (S7) ────────────────────────────────────────────────────────────
   *
   * ⚠ KETERANGAN DI BAWAH DIBACA PENYEWA, bukan developer.
   *
   * Versi pertama menulis "instance Puraloka, TERPISAH dari TJS di :5678" dan
   * menyebut `scripts\jalankan-n8n.cmd`. Founder menolaknya, dan ia benar:
   * TJS adalah proyek LAIN di mesin developer. Penyewa yang membuka halaman
   * ini tak tahu apa itu, tak punya skrip itu, dan port 5678 di mesinnya
   * berisi hal yang sama sekali berbeda.
   *
   * Catatan tentang mesin developer tempatnya DI SINI, di komentar kode:
   * n8n TJS memakai :5678 (+ :5679 sebagai Task Broker internal), jadi
   * instance Puraloka di mesin ini dijalankan pada :5680 (+ :5681) lewat
   * `scripts/jalankan-n8n.cmd`. Itu fakta mesin, bukan fakta produk.
   *
   * DITAMBAHKAN 2026-08-10, dan keterlambatannya pantas dicatat.
   *
   * `lib/otomasi-n8n.ts` sudah membaca kedua kunci ini sejak S7, dan halaman
   * Alur Otomasi berkali-kali menampilkan "N8N_BASE_URL belum diisi di
   * halaman Kredensial" — padahal DI HALAMAN ITU TAK ADA TEMPATNYA. Katalog
   * ini yang menentukan apa yang muncul di layar, dan n8n tak pernah masuk.
   *
   * Founder yang menemukannya: "cuma ada wa, ai, sama email disana."
   *
   * Bentuknya sama persis dengan izin yatim migrasi 271 — fitur utuh,
   * teruji, dan tak bisa dicapai siapa pun. Bedanya, yang ini menyuruh orang
   * pergi ke tempat yang tak punya pintunya.
   */
  {
    kunci: 'N8N_BASE_URL',
    label: 'n8n — alamat server',
    keterangan:
      'Alamat server n8n Anda, mis. http://localhost:5680. Tanpa garis miring di akhir.',
    grup: 'Otomasi (n8n)',
  },
  {
    kunci: 'N8N_API_KEY',
    label: 'n8n — kunci API',
    keterangan:
      'Dari n8n: Settings → n8n API → Create an API key. Boleh dikosongkan bila ' +
      'instance-nya tak menuntut autentikasi API.',
    grup: 'Otomasi (n8n)',
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
    const dariEnv = meta?.env ? (process.env[meta.env]?.trim() || null) : null

    /*
     * ── SAKLAR MULTI-TENANT ─────────────────────────────────────────────
     *
     * Jatuhan `.env` adalah jaring pengaman satu-instalasi: tanpa itu,
     * `/ai/insight` mati begitu lapisan kredensial dipasang. Tapi env
     * server SATU untuk seluruh proses — jadi begitu ada tenant kedua,
     * jaring itu berubah jadi kebocoran:
     *
     *   · tenant B yang belum mengisi ANTHROPIC_API_KEY memakai kunci
     *     Anda — dan tagihannya jatuh ke Anda
     *   · tenant B yang belum mengisi WA_* mengirim WhatsApp lewat
     *     NOMOR TENANT A
     *
     * Diukur 2026-08-10: lima kunci punya jatuhan (ANTHROPIC_API_KEY,
     * RESEND_API_KEY, WA_API_KEY, WA_BASE_URL, WA_INSTANCE), dan tak satu
     * pun tersimpan per-tenant — artinya SEMUANYA sedang lewat env.
     *
     * `KREDENSIAL_TANPA_JATUHAN_ENV=1` mematikannya. Dipilih sebagai
     * saklar env, BUKAN kolom basis: ia keputusan operator instalasi
     * ("server ini melayani banyak perusahaan"), bukan pengaturan yang
     * boleh diubah salah satu tenant untuk dirinya sendiri.
     */
    if (dariEnv && process.env.KREDENSIAL_TANPA_JATUHAN_ENV === '1') {
      request.log.warn(
        { kunci, companyId },
        'kredensial jatuh ke env server tetapi jatuhan DIMATIKAN — tenant ini ' +
          'belum mengisi kuncinya sendiri',
      )
      nilai = null
    } else {
      if (dariEnv) {
        /*
         * Jatuhan yang TERPAKAI dicatat, bukan diam.
         *
         * Tanpa baris ini, satu-satunya cara tahu bahwa tenant memakai kunci
         * milik server adalah membaca kode. Dan yang tak terlihat tak pernah
         * diperbaiki — persis kelas cacat yang sudah tiga kali muncul hari
         * ini (izin yatim, izin tanpa pembaca, kunci tanpa tempat isi).
         */
        request.log.info(
          { kunci, companyId },
          'kredensial diambil dari env server, bukan milik tenant',
        )
      }
      nilai = dariEnv
    }
  }

  cache.set(ck, { nilai, kedaluwarsa: kini + TTL_MS })
  return nilai
}

/** Dari mana nilai yang berlaku berasal — untuk ditampilkan di UI. */
export type SumberKredensial = 'tenant' | 'env' | 'tidak-ada'

export function sumberKredensial(adaBarisTenant: boolean, kunci: string): SumberKredensial {
  if (adaBarisTenant) return 'tenant'
  const meta = metaKredensial(kunci)
  // Saat jatuhan dimatikan, env yang terisi TIDAK berlaku — dan UI tak boleh
  // melaporkannya sebagai sumber. Layar yang berkata "dari env server" untuk
  // nilai yang sebenarnya tak terpakai membuat orang mengira integrasinya
  // hidup, lalu bingung kenapa tak ada yang terkirim.
  if (process.env.KREDENSIAL_TANPA_JATUHAN_ENV === '1') return 'tidak-ada'
  if (meta?.env && process.env[meta.env]?.trim()) return 'env'
  return 'tidak-ada'
}
