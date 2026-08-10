/**
 * SATU PINTU KELUAR WHATSAPP — dan idempotensi yang TJS tak punya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PELAJARAN TJS: KETERSEBARAN MEMBUAT KEGAGALAN JADI SENYAP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS baru merapikan ini SETELAH pengiriman tersebar ke 10 titik di aplikasi +
 * 30 di n8n. Akibatnya nyata, dan tercatat di header `lib/wa/send.ts` mereka:
 *
 *   "Bentuk payload sudah menyimpang antar titik. `alert-notifier.ts`
 *    mengirim `{ number, textMessage: { text } }`, padahal Evolution
 *    mewajibkan `{ number, text }`. Alert kedaluwarsa stok dan pemantauan
 *    sintetis TIDAK PERNAH terkirim, dan gagalnya senyap."
 *
 * Struktur satu-pintu + registry adaptor mereka ditiru. Dua hal ditambahkan
 * karena TJS tak punya:
 *
 *   IDEMPOTENSI KELUAR   TJS punya dedup MASUK (`providerMessageId`) tetapi
 *                        tak ada apa pun yang mencegah pesan KELUAR terkirim
 *                        dua kali. Webhook yang diulang penyedia — hal biasa,
 *                        bukan kelainan — menghasilkan notifikasi ganda ke
 *                        mandor, dan yang kedua terbaca sebagai kejadian baru
 *                        ("ada DUA invoice jatuh tempo?").
 *
 *   NOMOR → user_id      TJS mengikatnya ke daftar kontak terpisah
 *                        (`ownerAiContact`), jadi orang yang dicabut aksesnya
 *                        di ERP tetap bisa dihubungi/bertanya lewat WhatsApp
 *                        sampai seseorang ingat menghapusnya dari daftar kedua.
 *
 * ── TIDAK PERNAH melempar
 *
 * Diambil dari TJS, dan alasannya benar: notifikasi yang gagal tak boleh
 * menjatuhkan proses bisnis yang memicunya. Invoice tetap tersimpan meski
 * WhatsApp-nya mati.
 *
 * Konsekuensinya `kirimWa` mengembalikan hasil, bukan melempar — dan
 * pemanggil yang mengabaikan hasilnya kehilangan satu-satunya tanda kegagalan.
 * Itu sebabnya `wa_pesan_log` selalu ditulis, bahkan untuk yang gagal.
 */

import type { TenantDb } from '../utils/tenant-db.js'

export type HasilKirim =
  | { ok: true; pesanId: string | null; dilewati: boolean }
  | { ok: false; alasan: AlasanGagalWa; pesan: string }

export type AlasanGagalWa =
  | 'kanal_mati'
  | 'kredensial_tak_ada'
  | 'nomor_tak_sah'
  | 'penyedia_menolak'
  | 'jaringan'
  | 'penyedia_tak_dikenal'

/**
 * Normalisasi nomor ke bentuk yang disimpan basis: digit saja, kode negara di
 * depan, tanpa `+` dan tanpa `0` awal.
 *
 * `+62 812-3456-7890`, `62812 3456 7890`, dan `0812-3456-7890` adalah nomor
 * yang SAMA. Menyimpannya apa adanya membuat pencarian gagal untuk bentuk yang
 * tak persis — dan gagalnya senyap: pesannya masuk `ai_akses_ditolak` seolah
 * pengirimnya orang asing.
 *
 * Mengembalikan `null` untuk yang tak bisa dinormalkan, bukan menebak.
 */
export function normalkanNomor(mentah: string, kodeNegara = '62'): string | null {
  const digit = (mentah ?? '').replace(/\D/g, '')
  if (!digit) return null

  // `0812…` → `62812…`. Hanya untuk yang benar-benar berawalan nol tunggal;
  // `00…` adalah awalan panggilan internasional, bukan nomor lokal.
  let hasil = digit
  if (hasil.startsWith('0') && !hasil.startsWith('00')) {
    hasil = kodeNegara + hasil.slice(1)
  } else if (hasil.startsWith('00')) {
    hasil = hasil.slice(2)
  }

  // Sama dengan CHECK `wa_nomor_bentuk` di migrasi 256. Dua tempat harus
  // sepakat — kalau tidak, aplikasi menerima nomor yang basis tolak, dan
  // galatnya muncul jauh dari tempat nomornya diketik.
  if (!/^[1-9][0-9]{7,14}$/.test(hasil)) return null
  return hasil
}

// ══════════════════════════════════════════════════════════════════════════
// REGISTRY ADAPTOR — sejak awal, bukan ditambahkan belakangan
// ══════════════════════════════════════════════════════════════════════════

export interface AdaptorWa {
  readonly nama: string
  /** TIDAK PERNAH melempar. */
  kirimTeks(nomor: string, teks: string): Promise<HasilKirim>
}

export interface KonfigurasiWa {
  penyedia: string
  baseUrl: string
  apiKey: string
  instance: string
}

/**
 * Memuat konfigurasi kanal dari kredensial tenant.
 *
 * Tinggal di sini, bukan di route, karena ada DUA route yang mengirim WA
 * (verifikasi nomor dan balasan webhook) dan konfigurasi yang dimuat dua cara
 * akan berbeda pada akhirnya — biasanya saat kunci ketiga ditambahkan dan
 * hanya satu tempat yang ikut diperbarui. Gejalanya: satu jalur mengirim,
 * satunya diam, keduanya tanpa galat.
 *
 * `null` berarti kanal BELUM SIAP, bukan galat. Ketiga nilainya wajib —
 * `baseUrl` tanpa `instance` menghasilkan URL yang bentuknya benar tapi
 * menunjuk ke ketiadaan, dan Evolution menjawabnya 404 yang terbaca seperti
 * gangguan jaringan.
 */
export async function konfigurasiKanal(
  ambil: (kunci: string) => Promise<string | null>,
): Promise<KonfigurasiWa | null> {
  const [baseUrl, apiKey, instance] = await Promise.all([
    ambil('WA_BASE_URL'),
    ambil('WA_API_KEY'),
    ambil('WA_INSTANCE'),
  ])
  if (!baseUrl?.trim() || !apiKey?.trim() || !instance?.trim()) return null
  return { penyedia: 'evolution', baseUrl, apiKey, instance }
}

/**
 * Evolution API — penyedia pertama.
 *
 * Bentuk muatannya `{ number, text }`. Itu ditulis di SATU tempat justru
 * karena TJS membuktikan apa yang terjadi kalau tersebar: satu titik memakai
 * `{ number, textMessage: { text } }`, Evolution menolaknya, dan alert-nya tak
 * pernah terkirim tanpa ada yang menyadari.
 */
class AdaptorEvolution implements AdaptorWa {
  readonly nama = 'evolution'
  constructor(private cfg: KonfigurasiWa) {}

  async kirimTeks(nomor: string, teks: string): Promise<HasilKirim> {
    const kendali = new AbortController()
    const jam = setTimeout(() => kendali.abort(), 15_000)
    try {
      const r = await fetch(
        `${this.cfg.baseUrl.replace(/\/$/, '')}/message/sendText/${this.cfg.instance}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: this.cfg.apiKey },
          body: JSON.stringify({ number: nomor, text: teks }),
          signal: kendali.signal,
        },
      )

      if (!r.ok) {
        const detail = await r.text().catch(() => '')
        return {
          ok: false,
          alasan: 'penyedia_menolak',
          pesan: `Evolution ${r.status}: ${detail.slice(0, 200)}`,
        }
      }

      const badan = (await r.json().catch(() => ({}))) as { key?: { id?: string } }
      return { ok: true, pesanId: badan?.key?.id ?? null, dilewati: false }
    } catch (err) {
      const e = err as { name?: string; message?: string }
      return {
        ok: false,
        alasan: e?.name === 'AbortError' ? 'jaringan' : 'jaringan',
        pesan: e?.message ?? String(err),
      }
    } finally {
      clearTimeout(jam)
    }
  }
}

/**
 * Membuat adaptor dari konfigurasi.
 *
 * Registry ada SEJAK AWAL meski penyedianya baru satu. Menambahkannya
 * belakangan berarti menyentuh tiap pemanggil untuk kedua kalinya — persis
 * biaya yang TJS bayar saat merapikan 40 titik.
 */
export function buatAdaptorWa(cfg: KonfigurasiWa): AdaptorWa | null {
  if (cfg.penyedia === 'evolution') return new AdaptorEvolution(cfg)
  if (cfg.penyedia === 'fonnte') return new AdaptorFonnte(cfg)
  return null
}

/** Penyedia yang dikenali — dipakai UI supaya pilihannya tak ditebak. */
export const ADAPTOR_WA_DIKENAL = [
  {
    kunci: 'evolution',
    label: 'Evolution API',
    keterangan: 'Self-hosted, gratis. Butuh instance dan pemindaian QR.',
    /** Field non-rahasia yang WAJIB diisi di UI. */
    butuh: ['baseUrl', 'instance'] as const,
  },
  {
    kunci: 'fonnte',
    label: 'Fonnte',
    keterangan: 'Layanan berbayar Indonesia. Cukup token — tanpa instance.',
    butuh: [] as const,
  },
] as const

/**
 * Fonnte — penyedia kedua, dan alasannya bukan kelengkapan.
 *
 * Evolution self-hosted: kalau server-nya mati atau sesi WhatsApp-nya keluar,
 * SELURUH notifikasi berhenti dan tak ada jalan lain. Penyedia kedua membuat
 * pemulihannya sejauh mengganti pilihan di UI, bukan menunggu server pulih.
 *
 * Bentuk muatannya BERBEDA dari Evolution — `target`/`message`, bukan
 * `number`/`text`, dan kuncinya di header `Authorization` tanpa skema. Itulah
 * sebabnya penyedia baru butuh adaptor (kode) meski konfigurasinya data:
 * bentuk HTTP tak bisa dikarang dari UI.
 */
class AdaptorFonnte implements AdaptorWa {
  readonly nama = 'fonnte'
  constructor(private cfg: KonfigurasiWa) {}

  async kirimTeks(nomor: string, teks: string): Promise<HasilKirim> {
    const kendali = new AbortController()
    const jam = setTimeout(() => kendali.abort(), 15_000)
    try {
      const r = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        // Fonnte memakai token TELANJANG di Authorization — tanpa `Bearer`.
        // Menambahkan skema membuatnya menolak dengan pesan yang tak
        // menyebut sebabnya.
        headers: { 'content-type': 'application/json', Authorization: this.cfg.apiKey },
        body: JSON.stringify({ target: nomor, message: teks }),
        signal: kendali.signal,
      })

      if (!r.ok) {
        const detail = await r.text().catch(() => '')
        return {
          ok: false,
          alasan: 'penyedia_menolak',
          pesan: `Fonnte ${r.status}: ${detail.slice(0, 200)}`,
        }
      }

      /*
       * Fonnte membalas 200 SEKALIPUN gagal — `{"status": false, ...}`.
       *
       * Ini bentuk kegagalan senyap yang persis dijaga `audit-satu-pintu-wa`:
       * memeriksa `r.ok` saja membuat pesan yang tak pernah terkirim tercatat
       * sebagai terkirim.
       */
      const badan = (await r.json().catch(() => ({}))) as {
        status?: boolean
        reason?: string
        id?: string[] | string
      }
      if (badan?.status === false) {
        return {
          ok: false,
          alasan: 'penyedia_menolak',
          pesan: `Fonnte menolak: ${badan.reason ?? 'tanpa alasan'}`,
        }
      }

      const id = Array.isArray(badan?.id) ? badan.id[0] : badan?.id
      return { ok: true, pesanId: id ?? null, dilewati: false }
    } catch (err) {
      const e = err as { message?: string }
      return { ok: false, alasan: 'jaringan', pesan: e?.message ?? String(err) }
    } finally {
      clearTimeout(jam)
    }
  }
}

export interface OpsiKirim {
  db: TenantDb
  companyId: string
  nomor: string
  teks: string
  /**
   * Kunci idempotensi — ditentukan PEMANGGIL dari peristiwa yang memicunya,
   * mis. `invoice:<id>:jatuh-tempo`.
   *
   * BUKAN dari isi pesan: teks yang sama untuk dua peristiwa berbeda memang
   * harus terkirim dua kali. Kunci berbasis isi akan menelan yang kedua.
   *
   * Boleh dikosongkan untuk pesan yang memang tak punya peristiwa (mis.
   * balasan percakapan) — tapi kalau kosong, TAK ADA perlindungan ganda.
   */
  kunciIdempotensi?: string
  userId?: string | null
  konfigurasi: KonfigurasiWa | null
}

/**
 * SATU-SATUNYA jalan mengirim WhatsApp.
 *
 * Penjaga `audit-satu-pintu-wa.mjs` menegakkannya: nol `fetch` ke penyedia WA
 * di luar berkas ini.
 */
export async function kirimWa(opsi: OpsiKirim): Promise<HasilKirim> {
  const nomor = normalkanNomor(opsi.nomor)
  if (!nomor) {
    await catatLog(opsi, null, 'gagal', `nomor tak sah: ${opsi.nomor}`)
    return { ok: false, alasan: 'nomor_tak_sah', pesan: `Nomor '${opsi.nomor}' tidak sah` }
  }

  /*
   * ── IDEMPOTENSI DULU, konfigurasi belakangan ──────────────────────────
   *
   * Urutannya menentukan, dan versi pertama saya salah: konfigurasi diperiksa
   * lebih dulu, jadi pemanggil yang kanalnya belum siap TIDAK PERNAH sampai
   * ke klaim kunci. Akibatnya idempotensi tak berlaku sama sekali di jalur
   * itu — dan begitu kanalnya dinyalakan, seluruh notifikasi tertunda
   * terkirim ulang karena tak ada satu pun kunci yang tercatat.
   *
   * Klaim DULU juga yang menutup balapan: mengirim lalu mencatat berarti dua
   * permintaan bersamaan sama-sama lolos pemeriksaan dan sama-sama mengirim.
   * INSERT yang gagal karena kunci ganda adalah penanda "sudah pernah", dan
   * ia atomik.
   *
   * Konsekuensi yang diterima sadar: kunci yang diklaim lalu gagal karena
   * konfigurasi TIDAK akan dicoba lagi otomatis. Itu benar — pengiriman ulang
   * massal saat kanal dinyalakan jauh lebih berbahaya daripada satu notifikasi
   * yang hilang, dan barisnya bertanda `berhasil = false` sehingga bisa
   * ditelusuri.
   */
  if (opsi.kunciIdempotensi) {
    const { error } = await opsi.db.from('wa_kirim_idempotensi').insert({
      kunci: opsi.kunciIdempotensi,
      company_id: opsi.companyId,
      nomor,
      berhasil: false,
    }).select('kunci')

    if (error) {
      // Kode 23505 = unique_violation → sudah pernah dikirim. Itu SUKSES dari
      // sudut pandang pemanggil: yang diinginkan "pesan ini terkirim sekali",
      // dan itu sudah terpenuhi.
      if ((error as { code?: string }).code === '23505') {
        return { ok: true, pesanId: null, dilewati: true }
      }
      // Galat lain TIDAK menghentikan pengiriman: kehilangan perlindungan
      // ganda lebih ringan daripada notifikasi jatuh tempo yang tak terkirim.
      // Tapi ia dicatat, bukan ditelan.
      await catatLog(opsi, nomor, 'gagal', `idempotensi gagal: ${error.message}`)
    }
  }

  if (!opsi.konfigurasi) {
    await catatLog(opsi, nomor, 'gagal', 'kanal WhatsApp belum dikonfigurasi')
    return {
      ok: false,
      alasan: 'kredensial_tak_ada',
      pesan: 'Kanal WhatsApp belum dikonfigurasi (base URL, kunci, atau instance kosong).',
    }
  }

  const adaptor = buatAdaptorWa(opsi.konfigurasi)
  if (!adaptor) {
    await catatLog(opsi, nomor, 'gagal', `penyedia '${opsi.konfigurasi.penyedia}' tak dikenal`)
    return {
      ok: false,
      alasan: 'penyedia_tak_dikenal',
      pesan: `Penyedia WhatsApp '${opsi.konfigurasi.penyedia}' tidak dikenal.`,
    }
  }

  const hasil = await adaptor.kirimTeks(nomor, opsi.teks)

  if (opsi.kunciIdempotensi && hasil.ok) {
    // Ditandai berhasil supaya percobaan berikutnya bisa membedakan "pernah
    // dicoba dan gagal" dari "pernah terkirim".
    await opsi.db.from('wa_kirim_idempotensi')
      .update({ berhasil: true, pesan_id_penyedia: hasil.pesanId })
      .eq('kunci', opsi.kunciIdempotensi)
      .select('kunci')
  }

  await catatLog(
    opsi,
    nomor,
    hasil.ok ? 'terkirim' : 'gagal',
    hasil.ok ? null : hasil.pesan,
    hasil.ok ? hasil.pesanId : null,
  )

  return hasil
}

/**
 * Log SELALU ditulis, termasuk untuk yang gagal.
 *
 * `kirimWa` tak pernah melempar, jadi pemanggil yang mengabaikan hasilnya
 * kehilangan satu-satunya tanda kegagalan. Log ini yang membuat "kenapa
 * mandor tak dapat notifikasi" punya jawaban.
 *
 * Isi pesan TIDAK disimpan — hanya panjangnya. Log yang menyimpan isi jadi
 * salinan kedua data operasional yang retensinya tak pernah ikut diatur.
 */
async function catatLog(
  opsi: OpsiKirim,
  nomor: string | null,
  status: 'terkirim' | 'gagal',
  galat: string | null,
  pesanId: string | null = null,
): Promise<void> {
  const { error } = await opsi.db.from('wa_pesan_log').insert({
    company_id: opsi.companyId,
    arah: 'keluar',
    nomor: nomor ?? opsi.nomor.slice(0, 20),
    user_id: opsi.userId ?? null,
    panjang: opsi.teks.length,
    status,
    galat,
    pesan_id_penyedia: pesanId,
  }).select('id')

  // Gagal mencatat tak boleh menjatuhkan pengiriman — tapi juga tak boleh
  // hilang tanpa jejak. Dilempar ke konsol, bukan ditelan.
  if (error) console.error('[wa] gagal menulis log:', error.message)
}

/**
 * UJI SAMBUNGAN — tanpa mengirim pesan ke siapa pun.
 *
 * Tinggal DI SINI, bukan di route, karena `audit-satu-pintu-wa` melarang
 * endpoint WhatsApp disentuh di luar berkas ini — dan larangan itu benar.
 * Versi pertama saya menaruh `fetch('https://api.fonnte.com/device')` di
 * `routes/v1/penyedia.ts`, dan penjaga menolaknya dengan tepat: begitu satu
 * titik di luar pintu dibiarkan, titik kedua selalu menyusul, lalu bentuk
 * muatannya menyimpang dan pesannya berhenti terkirim tanpa satu pun galat.
 *
 * Yang diperiksa: endpoint menjawab DAN kredensialnya diterima. Bukan
 * mengirim pesan — tombol "Uji" yang mengganggu orang adalah tombol yang tak
 * pernah ditekan.
 */
export interface HasilUjiWa {
  ok: boolean
  pesan: string
}

/**
 * Uji sambungan WA dari SEBUAH PEMBACA KREDENSIAL, bukan dari konfigurasi jadi.
 *
 * ── Kenapa pembungkus ini ada, dan kenapa ia tinggal DI SINI
 *
 * Halaman Kredensial butuh menguji WhatsApp, dan itu menuntut TIGA kunci
 * sekaligus (alamat, kunci, instance). Versi pertama menyusunnya di
 * `routes/v1/kredensial.ts` — dan penjaga `audit-satu-pintu-wa` menolaknya
 * dengan alasan yang tepat: *"kredensial di dua tempat berarti dua jalur
 * kirim, dan yang kedua tak terjaga."*
 *
 * Jadi yang berpindah bukan penjaganya, melainkan kodenya. Rute cukup
 * menyerahkan cara membaca kunci; bentuk konfigurasinya tetap urusan berkas
 * ini, satu-satunya tempat yang tahu apa arti "lengkap" untuk tiap penyedia.
 */
export async function ujiSambunganWaDariKredensial(
  baca: (kunci: string) => Promise<string | null>,
): Promise<HasilUjiWa> {
  const cfg = await konfigurasiKanal(baca)
  // `null` berarti ada bagian yang belum diisi — jawaban yang BERGUNA, bukan
  // galat. Pesannya menyebut apa yang kurang, bukan "gagal".
  if (!cfg) {
    return {
      ok: false,
      pesan: 'Belum lengkap — alamat, kunci, dan nama instance ketiganya wajib terisi.',
    }
  }
  return ujiSambunganWa(cfg)
}

export async function ujiSambunganWa(
  cfg: KonfigurasiWa,
  timeoutMs = 12_000,
): Promise<HasilUjiWa> {
  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), timeoutMs)
  try {
    if (cfg.penyedia === 'evolution') {
      if (!cfg.baseUrl?.trim() || !cfg.instance?.trim()) {
        return { ok: false, pesan: 'baseUrl dan instance wajib diisi.' }
      }
      const r = await fetch(
        `${cfg.baseUrl.replace(/\/$/, '')}/instance/connectionState/${cfg.instance}`,
        { headers: { apikey: cfg.apiKey }, signal: kendali.signal },
      )
      if (!r.ok) return { ok: false, pesan: `Evolution ${r.status}` }
      const b = (await r.json().catch(() => ({}))) as { instance?: { state?: string } }
      const state = b?.instance?.state ?? 'tak diketahui'
      // `open` = sesi WhatsApp hidup. State lain berarti QR belum dipindai
      // atau sesinya keluar — keadaan yang paling sering terjadi TANPA ada
      // yang menyadarinya.
      return state === 'open'
        ? { ok: true, pesan: 'Terhubung, sesi aktif.' }
        : { ok: false, pesan: `Instance ada, tapi sesi '${state}' — pindai QR.` }
    }

    if (cfg.penyedia === 'fonnte') {
      const r = await fetch('https://api.fonnte.com/device', {
        method: 'POST',
        headers: { Authorization: cfg.apiKey },
        signal: kendali.signal,
      })
      if (!r.ok) return { ok: false, pesan: `Fonnte ${r.status}` }
      // Fonnte membalas 200 sekalipun gagal — lihat `AdaptorFonnte`.
      const b = (await r.json().catch(() => ({}))) as { status?: boolean; reason?: string }
      return b?.status === false
        ? { ok: false, pesan: b.reason ?? 'Token ditolak.' }
        : { ok: true, pesan: 'Token diterima.' }
    }

    return { ok: false, pesan: `Uji untuk penyedia '${cfg.penyedia}' belum tersedia.` }
  } catch (e) {
    const err = e as { name?: string; message?: string }
    return {
      ok: false,
      pesan: err?.name === 'AbortError' ? 'Tak menjawab dalam 12 detik.' : (err?.message ?? 'Gagal'),
    }
  } finally {
    clearTimeout(jam)
  }
}
