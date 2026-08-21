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
// `supabase` mentah DIPAKAI SENGAJA di `ambilKredensialTanpaRequest`:
// pemanggilnya tak punya `request.db`, jadi saringan tenant ditulis eksplisit
// (`.eq('company_id', ...)`) di kuerinya sendiri. Lihat catatan fungsi itu.
import { supabase } from '../utils/supabase.js'

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
    keterangan: 'Nama instance yang sudah memindai QR (Evolution), atau Phone Number ID dari WhatsApp Manager (Meta resmi).',
    env: 'WA_INSTANCE',
    grup: 'WhatsApp',
  },
  {
    /*
     * PEMILIH PENYEDIA — inilah yang membuat "tinggal ganti dari UI" benar.
     *
     * Sampai 2026-08-12 `konfigurasiKanal()` memaku `penyedia: 'evolution'`
     * sebagai literal. Akibatnya `AdaptorFonnte` yang sudah ditulis lengkap
     * DAN muncul sebagai pilihan di UI tak pernah bisa terpakai — apa pun
     * yang dipilih orang, yang dikirim tetap lewat Evolution.
     *
     * Kunci ini yang dibaca `konfigurasiKanal()`. Kosong = 'evolution',
     * supaya tenant yang sudah jalan tak berubah perilakunya.
     *
     * Bukan rahasia, tapi tinggal di sini karena ia bagian dari konfigurasi
     * kanal yang sama — memisahkannya ke tabel lain berarti dua tempat yang
     * harus sepakat, dan yang tak sepakat gagal senyap.
     */
    kunci: 'WA_PENYEDIA',
    label: 'WhatsApp — penyedia',
    keterangan: 'evolution (bawaan, gratis) · fonnte · meta-cloud (WhatsApp Business resmi). Kosong = evolution.',
    grup: 'WhatsApp',
  },
  {
    /*
     * ── NOMOR TUJUAN NOTIFIKASI — sebelumnya env build-time, sekarang kredensial tenant
     *
     * Sampai migrasi n8n shared (2026-08-22), nomor ini dipatok lewat
     * `WA_TUJUAN` di environment SAAT `scripts/n8n/bangun-alur.mjs`
     * dijalankan — bukan kredensial tenant sama sekali. Setiap tenant baru
     * akan butuh workflow n8n dibangun ulang dengan env berbeda, yang
     * bertentangan langsung dengan tujuan instance shared.
     *
     * Sekarang dibaca `terbitkanPeristiwa()` per-tenant lewat jalur
     * kredensial yang sama dengan WA_BASE_URL dkk, dan disertakan di
     * payload webhook ke n8n — bukan dipatok ke node workflow.
     */
    kunci: 'WA_NOMOR_NOTIFIKASI',
    label: 'WhatsApp — nomor tujuan notifikasi',
    keterangan: 'Nomor yang menerima notifikasi otomatis (kasbon diajukan, invoice dibayar, dst), format 62xxxxxxxxxx tanpa +. Kosong = notifikasi otomatis tidak terkirim.',
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
  /*
   * ── `EVOLUTION_API_KEY` / `EVOLUTION_API_URL` / `EVOLUTION_INSTANCE` DIHAPUS
   *   (2026-08-12)
   *
   * Ketiganya kembar persis `WA_API_KEY` / `WA_BASE_URL` / `WA_INSTANCE` di
   * atas — arti sama, grup sama, bahkan contoh di keterangannya sama
   * (`http://localhost:8081`, `puraloka-bot`). Bedanya cuma satu, dan itu
   * yang menentukan: **hanya `WA_*` yang dibaca kode.** `wa-kirim.ts`
   * memanggil `ambil('WA_BASE_URL')`, tak pernah `EVOLUTION_API_URL`.
   *
   * Jadi halaman Kredensial menampilkan SIX kotak untuk TIGA nilai, dan tiga
   * di antaranya tidak berpengaruh apa pun. Orang yang mengisi pasangan yang
   * salah melihat "tersimpan", melihat kotaknya terisi, lalu WhatsApp-nya
   * tetap mati — tanpa satu pun galat menyebut sebabnya.
   *
   * Itu kelas cacat yang sama dengan `AI_PROVIDER_API_KEY` (dibaca tanpa
   * kotak) dan `OPENAI_API_KEY` (berkotak tanpa pembaca), hanya bentuk
   * ketiganya: DUA kotak untuk satu nilai, satu di antaranya bohong.
   *
   * Dihapus, bukan disambungkan ke `WA_*`: dua nama untuk satu nilai berarti
   * pertanyaan "yang mana yang berlaku?" harus dijawab tiap kali seseorang
   * membaca kode ini, dan jawabannya akan berbeda-beda.
   *
   * ⚠ Nilai yang TERLANJUR tersimpan di `app_credentials` dengan kunci
   * `EVOLUTION_*` tidak ikut terhapus — menghapus data tenant butuh migrasi
   * dan konfirmasi. Ia hanya berhenti ditampilkan; `sumberKredensial()`
   * tetap bisa melaporkannya kalau ditanya. Dicatat di JOURNAL.
   */
  {
    kunci: 'RESEND_API_KEY',
    label: 'Resend (email)',
    keterangan: 'Pengiriman email notifikasi. Tanpa ini, email tak terkirim (dan itu senyap).',
    env: 'RESEND_API_KEY',
    tautan: 'https://resend.com/api-keys',
    grup: 'Email',
  },

  /*
   * ── Alamat pengirim, dan kenapa ia kredensial TENANT ────────────────────
   *
   * Ditambahkan 2026-08-19 sesudah founder bertanya *"perusahaan lain pake
   * api yang sama dengan yang ini juga?"*.
   *
   * Kunci Resend saja tidak cukup untuk multi-tenant. Kalau alamat
   * pengirimnya tetap milik operator, penerima surel PT Anu melihat domain
   * OPERATOR — dan itu terbaca seperti surel dari pihak ketiga yang tak ia
   * kenal. Untuk tagihan dan berita acara, itu masalah kepercayaan, bukan
   * kosmetik.
   *
   * ── TANPA `env:`, dan itu DISENGAJA
   *
   * Penjaga `audit-jatuhan-env-tak-bertambah.mjs` menolak versi pertama entri
   * ini yang punya `env: 'EMAIL_FROM'`, dan penjaganya BENAR.
   *
   * Jatuhan env untuk kunci API masih masuk akal: tenant yang belum punya
   * akun Resend tetap bisa berkirim surel, dan yang "bocor" cuma kuota
   * operator. Untuk ALAMAT PENGIRIM, jatuhannya justru cacat yang hendak
   * ditutup: tenant tanpa alamat sendiri akan mengirim tagihan dan berita
   * acara dari domain OPERATOR, dan penerimanya melihat pengirim yang tak
   * ia kenal.
   *
   * Jadi kunci ini murni per-tenant. `utils/email.ts` tetap punya
   * `FROM_BAWAAN` dari `process.env.EMAIL_FROM` sebagai jaring instalasi
   * satu-perusahaan — tapi itu keputusan OPERATOR di berkas env, bukan
   * sesuatu yang tenant warisi diam-diam lewat katalog ini.
   */
  {
    kunci: 'EMAIL_FROM',
    label: 'Alamat pengirim email',
    keterangan: 'Contoh: PT Anu <noreply@ptanu.co.id>. Domainnya harus sudah '
      + 'diverifikasi di Resend. Kosongkan untuk memakai alamat bawaan sistem — '
      + 'penerima akan melihat domain operator, bukan domain perusahaan ini.',
    tautan: 'https://resend.com/domains',
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
 * Lupakan SELURUH kredensial satu company.
 *
 * Dibutuhkan sejak warisan grup (migrasi 393): mengubah
 * `warisi_kredensial_induk` mengubah nilai yang berlaku untuk **semua** kunci
 * sekaligus, bukan satu kunci tertentu. Tanpa ini, saklar yang baru dimatikan
 * tetap memulangkan kunci induk sampai TTL habis — pemilik grup melihat
 * setelannya "tersimpan" sementara tagihannya masih berjalan.
 *
 * Menyapu seluruh cache (bukan hanya prefiks company ini) ditolak: cache
 * dipakai bersama semua tenant, dan mengosongkannya karena satu tenant
 * mengubah setelan membuat seluruh instalasi membaca ulang basis serentak.
 */
export function lupakanKredensialCompany(companyId: string): void {
  const awalan = `${companyId}::`
  for (const k of cache.keys()) {
    if (k.startsWith(awalan)) cache.delete(k)
  }
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
    /*
     * ── WARISAN GRUP — sebelum jatuhan `.env` (2026-08-14) ──────────────
     *
     * Founder: *"bisa di aktifkan jika ditanggung grup bisa juga anak grup
     * pake api sendiri"*. Jadi pewarisan punya saklar per anak
     * (`companies.warisi_kredensial_induk`, migrasi 393), bukan otomatis.
     *
     * Urutannya menentukan artinya:
     *
     *   1. kunci tenant sendiri   → sudah ditangani di cabang `if` di atas,
     *                               dan ia SELALU menang. Anak yang mengisi
     *                               kuncinya sendiri berhenti memakai kunci
     *                               induk tanpa saklar apa pun diubah.
     *   2. kunci INDUK            → di sini. Tagihan jatuh ke induk, dan itu
     *                               memang yang diminta untuk satu grup.
     *   3. jatuhan `.env`         → di bawah. Jaring satu-instalasi.
     *
     * ── Kenapa warisan HARUS di atas `.env`, bukan di bawahnya
     *
     * Keduanya sama-sama "kunci milik orang lain", tetapi bedanya tegas:
     * induk adalah pemilik yang SENGAJA menanggung anaknya, sementara `.env`
     * server dipakai bersama SEMUA tenant — termasuk perusahaan yang tak
     * punya hubungan apa pun dengan pemilik kuncinya.
     *
     * Hari ini keduanya kebetulan menunjuk kunci yang sama (founder), jadi
     * urutan ini belum terasa. Ia akan terasa persis saat tenant kedua yang
     * bukan anak grup masuk — dan saat itu terlambat memperbaikinya.
     *
     * ── Kenapa dibaca lewat `supabase`, bukan `request.db`
     *
     * `request.db` sadar-tenant: ia menyaring ke company yang sedang login,
     * jadi ia TIDAK BISA melihat baris milik induk — itulah gunanya. Membaca
     * warisan menuntut melihat melewati batas itu, dan karena itu ia dipagari
     * ketat: hanya `parent_company_id` milik tenant ini yang boleh dilihat,
     * hanya bila saklarnya menyala, dan hanya untuk kunci yang sama.
     */
    const { data: induk } = await supabase
      .from('companies')
      .select('parent_company_id, warisi_kredensial_induk')
      .eq('id', companyId)
      .maybeSingle()

    const indukId = (induk as { parent_company_id?: string | null } | null)?.parent_company_id
    const bolehWarisi = (induk as { warisi_kredensial_induk?: boolean } | null)?.warisi_kredensial_induk

    if (indukId && bolehWarisi) {
      const { data: barisInduk } = await supabase
        .from('app_credentials')
        .select('nilai_enc')
        .eq('company_id', indukId)
        .eq('kunci', kunci)
        .maybeSingle()

      if (barisInduk?.nilai_enc) {
        nilai = bukaNilai(barisInduk.nilai_enc as string)
        request.log.info(
          { kunci, companyId, indukId },
          'kredensial diwarisi dari induk grup — tagihan/pengiriman atas nama induk',
        )
      }
    }
  }

  if (nilai === null) {
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
    /*
     * ── PAGAR GRUP: jatuhan env HANYA untuk kunci AI (2026-08-14) ────────
     *
     * Komentar di atas sudah menyebut bahayanya sejak 2026-08-10 — *"tenant B
     * yang belum mengisi WA_* mengirim WhatsApp lewat NOMOR TENANT A"* —
     * tetapi kodenya tak pernah memagarinya. Peringatan yang tertulis dan tak
     * ditegakkan hanya menunda kejutannya.
     *
     * Ketahuan lewat `audit-kredensial-lintas-tenant.mjs`, yang dibuat saat
     * founder meminta: *"harus disiapkan kalo nanti banyak perusahaan"*.
     *
     * Bedanya tegas, dan itu yang menentukan pagarnya:
     *
     *   AI       salah kunci = tagihan jatuh ke pemilik env. Terlihat di
     *            dasbor biaya, bisa dihentikan, tak ada pihak ketiga yang
     *            terlanjur menerima apa pun.
     *
     *   WA/Email salah kunci = pesan TERKIRIM lewat identitas tenant lain.
     *            Pelanggan tenant B menerima pesan dari nomor tenant A, dan
     *            riwayat dua perusahaan bercampur. Tak bisa ditarik.
     *
     * `KREDENSIAL_TANPA_JATUHAN_ENV=1` tetap ada dan tetap mematikan
     * SEMUANYA termasuk AI — ia keputusan operator. Pagar ini lebih sempit
     * dan tak perlu diingat siapa pun.
     */
    const grupBolehJatuh = meta?.grup === 'AI'

    if (dariEnv && !grupBolehJatuh) {
      request.log.warn(
        { kunci, companyId, grup: meta?.grup },
        'kredensial ada di env server tetapi TIDAK dipakai — hanya kunci AI yang '
          + 'boleh jatuh ke env. Kunci pengiriman (WhatsApp/Email) wajib milik '
          + 'tenant sendiri, supaya tak ada pesan terkirim atas nama tenant lain.',
      )
      nilai = null
    } else if (dariEnv && process.env.KREDENSIAL_TANPA_JATUHAN_ENV === '1') {
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

/**
 * Kredensial untuk pemanggil yang TIDAK punya `request`.
 *
 * `ambilKredensial()` menuntut `FastifyRequest` — ia memakai `request.db`
 * (sadar tenant) dan `request.log`. Itu benar untuk rute, dan mustahil untuk
 * `createNotifications()`, yang dipanggil dari belasan tempat dan tak pernah
 * membawa request.
 *
 * ⚠ Karena tak lewat `request.db`, `companyId` WAJIB diberikan pemanggil dan
 * dipakai sebagai saringan eksplisit. Tanpa itu satu tenant bisa membaca
 * kredensial tenant lain — persis kebocoran yang dijaga seluruh lapisan
 * tenancy repo ini.
 *
 * ── Jatuhan `.env` SELEKTIF — hanya grup AI (diperbaiki 2026-08-14)
 *
 * Versi sebelumnya sengaja TIDAK punya jatuhan sama sekali, dengan alasan:
 * "satu-satunya pemakainya adalah penerbit peristiwa otomasi, dan otomasi
 * yang diam jauh lebih baik daripada otomasi yang diam-diam mengirim lewat
 * n8n milik tenant lain."
 *
 * Alasan itu BENAR, dan tetap berlaku untuk WA/n8n. Yang tidak benar lagi
 * adalah premisnya: pemakainya sudah dua, bukan satu. `sapa-proaktif.ts`
 * ikut memakainya — untuk KUNCI AI.
 *
 * Akibatnya terukur: founder memasang `ANTHROPIC_API_KEY` di `apps/api/.env`
 * (108 karakter, terbaca), tetapi `ambilKredensialTanpaRequest` memulangkan
 * `null` — jadi asisten proaktif MATI tanpa satu pun gejala. Kuncinya ada,
 * kodenya siap, dan tak ada yang menghubungkan keduanya.
 *
 * ── Kenapa AI boleh jatuh ke env, WA/n8n tidak
 *
 * Bedanya bukan soal kerahasiaan melainkan **apa yang tak bisa ditarik**:
 *
 *   WA/n8n  salah kunci = pesan terkirim lewat NOMOR TENANT LAIN.
 *           Pelanggan tenant B menerima pesan dari nomor tenant A, dan
 *           riwayat dua perusahaan bercampur. Tak bisa dibatalkan.
 *
 *   AI      salah kunci = tagihan jatuh ke pemilik kunci env. Itu kerugian
 *           uang yang terlihat di dasbor biaya dan bisa dihentikan — bukan
 *           kebocoran data antar-tenant, dan tak ada pihak ketiga yang
 *           terlanjur menerima apa pun.
 *
 * Pembedanya `grup === 'AI'` di `KATALOG_KREDENSIAL` — bukan daftar nama
 * kunci yang ditulis ulang di sini. Daftar kedua akan berselisih dengan
 * katalognya begitu penyedia AI baru ditambahkan.
 *
 * `KREDENSIAL_TANPA_JATUHAN_ENV=1` tetap mematikannya, sama seperti jalur
 * ber-request: operator instalasi multi-tenant yang menanggung tagihan
 * banyak perusahaan berhak menutup jaring ini seluruhnya.
 */
export async function ambilKredensialTanpaRequest(
  companyId: string,
  kunci: string,
): Promise<string | null> {
  if (!companyId) return null

  const ck = kunciCache(companyId, kunci)
  const tersimpan = cache.get(ck)
  if (tersimpan && tersimpan.kedaluwarsa > Date.now()) return tersimpan.nilai

  const { data, error } = await supabase
    .from('app_credentials')
    .select('nilai_enc')
    .eq('company_id', companyId)
    .eq('kunci', kunci)
    .maybeSingle()

  if (error) {
    // Dilempar, bukan dikembalikan null: "gagal baca" dan "belum disetel"
    // adalah dua keadaan berbeda, dan menyamakannya membuat gangguan basis
    // terbaca sebagai konfigurasi yang belum diisi.
    throw new Error(`Gagal membaca kredensial '${kunci}': ${error.message}`)
  }

  let nilai = data?.nilai_enc ? bukaNilai(data.nilai_enc as string) : null

  /*
    Warisan grup — urutan dan alasannya SAMA PERSIS dengan jalur ber-request
    (`ambilKredensial`). Ditulis dua kali karena kedua fungsi memang dua jalur
    berbeda, tetapi keduanya harus menjawab pertanyaan yang sama: "kunci siapa
    yang berlaku untuk tenant ini?".

    Kalau hanya salah satu yang mewarisi, asisten proaktif (jalur ini) dan
    asisten interaktif (jalur ber-request) akan memakai kunci BERBEDA untuk
    tenant yang sama — dan tagihannya jatuh ke dua pihak berbeda tanpa ada
    yang memutuskan begitu.
  */
  if (!nilai) {
    const { data: induk } = await supabase
      .from('companies')
      .select('parent_company_id, warisi_kredensial_induk')
      .eq('id', companyId)
      .maybeSingle()

    const indukId = (induk as { parent_company_id?: string | null } | null)?.parent_company_id
    const bolehWarisi = (induk as { warisi_kredensial_induk?: boolean } | null)?.warisi_kredensial_induk

    if (indukId && bolehWarisi) {
      const { data: barisInduk } = await supabase
        .from('app_credentials')
        .select('nilai_enc')
        .eq('company_id', indukId)
        .eq('kunci', kunci)
        .maybeSingle()
      if (barisInduk?.nilai_enc) nilai = bukaNilai(barisInduk.nilai_enc as string)
    }
  }

  /*
    Jatuhan env — HANYA grup AI, dan hanya bila tenant belum mengisinya
    sendiri MAUPUN mewarisi dari induk. Alasan lengkapnya di komentar fungsi
    ini.

    Urutannya penting: baris tenant SELALU menang, lalu induk, baru env.
    Memasang kunci di UI langsung menggantikan keduanya tanpa perlu apa pun
    dimatikan.
  */
  if (!nilai && process.env.KREDENSIAL_TANPA_JATUHAN_ENV !== '1') {
    const meta = metaKredensial(kunci)
    if (meta?.grup === 'AI' && meta.env) {
      nilai = process.env[meta.env]?.trim() || null
    }
  }

  cache.set(ck, { nilai, kedaluwarsa: Date.now() + TTL_MS })
  return nilai
}

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
