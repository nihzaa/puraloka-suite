/**
 * GERBANG TUNGGAL KE MODEL AI — config, batas biaya, dan pencatatan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BATAS DIPERIKSA SEBELUM PANGGILAN, BUKAN SESUDAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS mencatat biaya setelah tiap panggilan dan menampilkannya di dashboard —
 * tapi tak ada yang MENGHENTIKAN panggilan berikutnya. Batas yang hanya
 * dilaporkan bukan batas; ia laporan kerusakan.
 *
 * Bahayanya nyata di sini: satu pesan WhatsApp bisa memicu 16 ronde
 * tool-calling. Kalau pemeriksaannya di akhir, tenant yang batasnya Rp 100 ribu
 * bisa tembus Rp 400 ribu dalam satu percakapan — dan barisnya baru terlihat
 * setelah uangnya keluar.
 *
 * `periksaGerbangAi()` dipanggil SEBELUM `messages.create()`. Penjaga
 * `audit-gerbang-biaya-ai.mjs` menegakkan urutannya, karena urutan yang benar
 * hari ini gampang terbalik saat seseorang menyisipkan panggilan kedua.
 *
 * ── Kenapa `blokir` bukan bawaan
 *
 * Bawaannya `peringatkan`. Tenant yang tiba-tiba kehilangan asistennya di
 * tengah hari kerja karena batas yang tak pernah ia sadari ada akan menganggap
 * sistemnya rusak — dan menghubungi dukungan, bukan membuka halaman batas.
 * Yang memilih `blokir` melakukannya sadar, dari UI.
 *
 * ── Pemakaian dihitung dari `ai_biaya_token`, bukan penghitung terpisah
 *
 * Satu sumber angka. Penghitung yang di-update terpisah bisa menyimpang dari
 * riwayatnya tanpa gejala — persis cacat C-7 yang `ai-harga.ts` cegah, hanya
 * pindah tempat.
 */

import type { TenantDb } from '../utils/tenant-db.js'
import { HARGA_MODEL, biayaIdr, biayaUsd, kursUsdIdr, type PemakaianToken } from './ai-harga.js'

/** Asisten yang dikenali. Sama persis dengan CHECK di migrasi 250. */
export const ASISTEN = ['insight', 'owner', 'staff', 'web'] as const
export type Asisten = (typeof ASISTEN)[number]

export const MODE_BATAS = ['blokir', 'peringatkan'] as const
export type ModeBatas = (typeof MODE_BATAS)[number]

export interface KonfigurasiAi {
  asisten: Asisten
  penyedia: string
  model: string
  maxToken: number
  aktif: boolean
  batasBulananIdr: number | null
  modeBatas: ModeBatas
  /**
   * Instruksi TAMBAHAN dari tenant, disambung di bawah prompt bawaan.
   *
   * Bukan pengganti: batas READ-ONLY dan aturan penanganan blok `<data>`
   * ditulis pengembang dan selalu ikut. Kalau prompt tenant bisa MENGGANTI
   * seluruhnya, satu kalimat ceroboh menghapus instruksi yang menahan injeksi.
   */
  promptSistem: string | null
  /** Batas ronde tool-calling. Dulu konstanta `MAKS_RONDE`. */
  maksRonde: number
  /**
   * Tool yang ditawarkan. NULL = semua yang izinnya dimiliki.
   *
   * Array KOSONG dibedakan dari NULL: `[]` adalah pilihan sadar "jangan baca
   * apa pun", NULL berarti belum diatur. Menyamakan keduanya membuat tenant
   * yang mematikan semua tool diam-diam mendapat semuanya kembali.
   */
  toolAktif: string[] | null
}

/**
 * Bawaan saat tenant belum punya baris config.
 *
 * Sengaja TIDAK melempar galat: tenant baru harus bisa memakai asisten sebelum
 * seseorang membuka halaman pengaturan. Yang belum dikonfigurasi mendapat
 * pilihan paling murah yang masuk akal, bukan kegagalan.
 */
export function konfigurasiBawaan(asisten: Asisten): KonfigurasiAi {
  return {
    asisten,
    penyedia: 'anthropic',
    model: 'claude-haiku-4-5',
    maxToken: 1024,
    aktif: true,
    batasBulananIdr: null,
    modeBatas: 'peringatkan',
    promptSistem: null,
    maksRonde: 4,
    toolAktif: null,
  }
}

interface BarisConfig {
  asisten: string
  penyedia: string
  model: string | null
  max_token: number
  aktif: boolean
  batas_bulanan_idr: string | number | null
  mode_batas: string
  prompt_sistem?: string | null
  maks_ronde?: number | null
  tool_aktif?: string[] | null
}

/** Angka dari Postgres `numeric` datang sebagai STRING lewat PostgREST. */
function keAngka(n: string | number | null | undefined): number | null {
  if (n === null || n === undefined) return null
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : null
}

export function bentukKonfigurasi(baris: BarisConfig, asisten: Asisten): KonfigurasiAi {
  const bawaan = konfigurasiBawaan(asisten)
  return {
    asisten,
    penyedia: baris.penyedia || bawaan.penyedia,
    // `model` boleh NULL di basis, artinya "pakai bawaan penyedia". Mengembalikan
    // null ke pemanggil memaksa tiap pemanggil menangani kasus itu sendiri, dan
    // satu di antaranya pasti lupa.
    model: baris.model?.trim() || bawaan.model,
    maxToken: baris.max_token ?? bawaan.maxToken,
    aktif: baris.aktif ?? true,
    batasBulananIdr: keAngka(baris.batas_bulanan_idr),
    modeBatas: (MODE_BATAS as readonly string[]).includes(baris.mode_batas)
      ? (baris.mode_batas as ModeBatas)
      : 'peringatkan',
    promptSistem: baris.prompt_sistem?.trim() || null,
    maksRonde: baris.maks_ronde ?? bawaan.maksRonde,
    // `?? null` BUKAN `|| null`: array kosong itu falsy, dan `||` akan
    // mengubah "nol tool" jadi "semua tool" — kebalikan dari yang dipilih.
    toolAktif: baris.tool_aktif ?? null,
  }
}

/** Awal bulan berjalan dalam UTC — batasnya per bulan kalender. */
export function awalBulan(sekarang: Date): string {
  return new Date(Date.UTC(sekarang.getUTCFullYear(), sekarang.getUTCMonth(), 1)).toISOString()
}

export type KeputusanGerbang =
  | { boleh: true; konfigurasi: KonfigurasiAi; terpakaiIdr: number; peringatan: string | null }
  | { boleh: false; alasan: 'nonaktif' | 'batas_terlampaui'; konfigurasi: KonfigurasiAi; terpakaiIdr: number }

/**
 * Berapa Rupiah yang sudah terpakai tenant ini bulan berjalan.
 *
 * Dijumlahkan di aplikasi, bukan lewat agregat PostgREST, karena `numeric`
 * datang sebagai string dan penjumlahan string diam-diam menggabungkan teks
 * alih-alih menambah angka — kegagalan yang menghasilkan total raksasa tanpa
 * galat apa pun.
 */
export async function pemakaianBulanIni(
  db: TenantDb,
  sekarang: Date,
): Promise<number> {
  const { data, error } = await db
    .from('ai_biaya_token')
    .select('biaya_idr')
    .gte('dibuat_pada', awalBulan(sekarang))

  if (error) throw new Error(`Gagal membaca pemakaian AI: ${error.message}`)

  let total = 0
  for (const b of (data ?? []) as Array<{ biaya_idr: string | number }>) {
    total += keAngka(b.biaya_idr) ?? 0
  }
  return Math.round(total * 100) / 100
}

/**
 * SATU-SATUNYA pintu sebelum memanggil model.
 *
 * Mengembalikan keputusan, bukan melempar: pemanggil yang tahu apakah kegagalan
 * AI berarti 200 dengan jalur deterministik (seperti `/ai/insight`) atau 402.
 * Melempar dari sini akan memaksa tiap pemanggil membungkusnya dengan try/catch
 * dan menebak sendiri artinya.
 */
export async function periksaGerbangAi(
  db: TenantDb,
  asisten: Asisten,
  sekarang: Date = new Date(),
): Promise<KeputusanGerbang> {
  const { data, error } = await db
    .from('ai_provider_config')
    .select('asisten, penyedia, model, max_token, aktif, batas_bulanan_idr, mode_batas, prompt_sistem, maks_ronde, tool_aktif')
    .eq('asisten', asisten)
    .maybeSingle()

  if (error) throw new Error(`Gagal membaca konfigurasi AI: ${error.message}`)

  const konfigurasi = data ? bentukKonfigurasi(data as BarisConfig, asisten) : konfigurasiBawaan(asisten)
  const terpakaiIdr = await pemakaianBulanIni(db, sekarang)

  if (!konfigurasi.aktif) {
    return { boleh: false, alasan: 'nonaktif', konfigurasi, terpakaiIdr }
  }

  const batas = konfigurasi.batasBulananIdr
  if (batas !== null && terpakaiIdr >= batas) {
    if (konfigurasi.modeBatas === 'blokir') {
      return { boleh: false, alasan: 'batas_terlampaui', konfigurasi, terpakaiIdr }
    }
    return {
      boleh: true,
      konfigurasi,
      terpakaiIdr,
      peringatan: `Batas biaya AI bulan ini terlampaui (Rp ${terpakaiIdr.toLocaleString('id-ID')} dari Rp ${batas.toLocaleString('id-ID')}).`,
    }
  }

  return { boleh: true, konfigurasi, terpakaiIdr, peringatan: null }
}

export interface RondeSelesai {
  asisten: Asisten
  penyedia: string
  model: string
  ronde?: number
  pakai: PemakaianToken
  correlationId?: string | null
}

/**
 * Catat SATU ronde.
 *
 * Harganya dihitung di sini dari `ai-harga.ts`, tak pernah diterima dari
 * pemanggil — angka biaya yang bisa dikirim pemanggil adalah angka biaya yang
 * bisa salah di satu tempat dan benar di tempat lain.
 */
export async function catatBiayaRonde(
  db: TenantDb,
  companyId: string,
  ronde: RondeSelesai,
): Promise<{ usd: number; idr: number; kurs: number }> {
  const kurs = kursUsdIdr()
  const usd = biayaUsd(ronde.model, ronde.pakai)
  const idr = biayaIdr(ronde.model, ronde.pakai, kurs)

  const { error } = await db.from('ai_biaya_token').insert({
    company_id: companyId,
    asisten: ronde.asisten,
    penyedia: ronde.penyedia,
    model: ronde.model,
    ronde: ronde.ronde ?? 1,
    token_masuk: ronde.pakai.masuk,
    token_keluar: ronde.pakai.keluar,
    token_cache_tulis: ronde.pakai.cacheTulis ?? 0,
    token_cache_baca: ronde.pakai.cacheBaca ?? 0,
    // Presisi basis 6 desimal; membulatkan di sini menghindari galat
    // `numeric field overflow` yang muncul dari sisa pecahan floating point.
    biaya_usd: usd.toFixed(6),
    biaya_idr: idr.toFixed(2),
    kurs_idr: kurs.toFixed(2),
    correlation_id: ronde.correlationId ?? null,
  })

  // Biaya yang gagal tercatat berarti batas bulanan menghitung terlalu rendah,
  // dan batas yang menghitung terlalu rendah tak pernah tercapai. Dilempar,
  // tidak ditelan.
  if (error) throw new Error(`Gagal mencatat biaya AI: ${error.message}`)

  return { usd, idr, kurs }
}

/**
 * Daftar model untuk UI — dibangun DARI `HARGA_MODEL`, tidak disalin.
 *
 * Menyalin daftarnya ke sini akan melahirkan kembali cacat C-7 dalam bentuk
 * lain: "pilihan yang muncul di UI tak sama dengan yang punya harga". Model
 * yang bisa dipilih tapi tak dikenal harga akan ditagih dengan tarif termahal
 * (`hargaModel` fallback) tanpa ada yang menduganya.
 */
export function daftarModel() {
  return Object.entries(HARGA_MODEL).map(([id, h]) => ({
    id,
    label: h.label,
    cocokUntuk: h.cocokUntuk,
    masukPerMTok: h.masuk,
    keluarPerMTok: h.keluar,
    /** Perkiraan satu panggilan tipikal, Rupiah — untuk UI, bukan penagihan. */
    perkiraanIdr: perkiraanPerPanggilan(id, 1024),
  }))
}

/**
 * Perkiraan biaya satu panggilan tipikal, Rupiah.
 *
 * Konservatif dengan sengaja: prompt ~1.500 token, jawaban sepenuh `maxToken`.
 * Angka perkiraan yang terlalu kecil membuat orang memilih batas bulanan yang
 * mustahil dipenuhi, lalu menyalahkan sistem saat asistennya berhenti.
 */
export function perkiraanPerPanggilan(model: string, maxToken: number): number {
  return biayaIdr(model, { masuk: 1500, keluar: maxToken })
}

export type { PemakaianToken }
