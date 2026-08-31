import { supabase } from './supabase.js'

/**
 * BATAS PAKET — apa yang boleh dipakai sebuah tenant menurut langganannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KEPUTUSAN PALING PENTING DI BERKAS INI: TANPA LANGGANAN = TAK DIBATASI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-31, sebelum berkas ini ada:
 *
 *     companies                  1878 baris
 *     subscriptions                 0 baris
 *     plans                         0 baris
 *     plan_features                 0 baris
 *     plan_feature_values           0 baris
 *     tenant_feature_overrides      0 baris
 *
 * Skemanya lengkap dan rapi — bahkan `reason` pada override NOT NULL dan bisa
 * kedaluwarsa. Yang tak ada: satu baris pun, dan satu pembaca pun.
 *
 * Kalau berkas ini gagal-TERTUTUP saat langganan tak ditemukan, maka pada
 * detik ia dipasang, **1878 perusahaan kehilangan akses sekaligus** — semuanya,
 * termasuk Puraloka Persada sendiri. Itu bukan penegakan batas; itu pemadaman.
 *
 * Jadi aturannya:
 *
 *     tak ada langganan     → TAK DIBATASI (semua boleh)
 *     ada, tanpa paket      → TAK DIBATASI
 *     ada + paket           → batas paket berlaku
 *     ada override tenant   → override MENANG atas paket
 *
 * ⚠ Ini SATU-SATUNYA tempat di repo yang gagal-terbuka dengan sengaja, dan
 * pengecualiannya harus tetap sempit. Gerbang IZIN (`requirePermission`) dan
 * gerbang TENANCY tetap gagal-tertutup — keduanya menjawab "boleh atau tidak",
 * sementara berkas ini menjawab "sudah bayar untuk berapa". Yang pertama soal
 * keamanan; yang kedua soal komersial.
 *
 * Menyamakan keduanya adalah kesalahan yang mahal ke dua arah: gerbang izin
 * yang gagal-terbuka membocorkan data, dan gerbang paket yang gagal-tertutup
 * mematikan pelanggan yang sudah membayar karena satu baris langganan yang
 * belum sempat dibuat.
 *
 * ── Kenapa TIDAK ada cache di sini
 *
 * Batas paket berubah saat orang membeli — dan yang baru membayar mengharapkan
 * batasnya naik SEKARANG, bukan lima menit lagi. Cache lima menit di sini
 * berarti tiket dukungan "sudah bayar tapi masih tak bisa". Kuerinya satu
 * baris ber-indeks; harganya jauh lebih murah daripada tiket itu.
 */

/**
 * Bentuk baris yang dipulangkan embed PostgREST.
 *
 * Ditulis eksplisit alih-alih `as any` karena `any` mematikan pemeriksaan
 * DI SELURUH ekspresi yang menyentuhnya — termasuk salah eja nama kolom, yang
 * lalu memulangkan `undefined` dan diam-diam terbaca sebagai "fitur ini tak
 * dibatasi". Gerbang yang membuka karena salah ketik tak mengeluarkan galat.
 *
 * Relasi embed bisa NULL: baris yang fitur katalognya sudah dihapus tetap ada
 * di tabel nilai. Itu sebabnya `plan_features` opsional di sini, dan tiap
 * pembacanya memeriksa.
 */
interface BarisFiturKatalog {
  key?: string | null
  label?: string | null
  value_type?: string | null
}

interface BarisNilaiPaket {
  value_boolean: boolean | null
  value_integer: number | null
  value_text: string | null
  plan_features: BarisFiturKatalog | null
}

interface BarisOverride extends BarisNilaiPaket {
  expires_at: string | null
}

interface BarisLangganan {
  id: string
  plan_id: string | null
  status: string
  plans: { code: string | null; name: string | null } | null
}

/** Jenis nilai sebuah fitur — mengikuti `plan_features.value_type`. */
export type JenisNilai = 'boolean' | 'integer' | 'text'

export interface BatasFitur {
  kunci: string
  label: string
  jenis: JenisNilai
  /** Untuk `integer`: batasnya. NULL = TAK TERBATAS, bukan nol. */
  angka: number | null
  /** Untuk `boolean`: boleh atau tidak. */
  boleh: boolean | null
  teks: string | null
  /** true = nilainya datang dari `tenant_feature_overrides`, bukan dari paket. */
  dariOverride: boolean
}

export interface BatasPaket {
  /** false = tenant ini tak punya langganan berpaket; TAK ADA batas berlaku. */
  dibatasi: boolean
  paketKode: string | null
  paketNama: string | null
  /** Status langganan apa adanya (`active`, `trialing`, …). NULL bila tak ada. */
  status: string | null
  fitur: Map<string, BatasFitur>
}

const TAK_DIBATASI: BatasPaket = Object.freeze({
  dibatasi: false,
  paketKode: null,
  paketNama: null,
  status: null,
  fitur: new Map(),
})

/**
 * Status langganan yang MASIH memberi hak pakai.
 *
 * `trialing` ikut: orang yang sedang mencoba harus bisa memakai produknya —
 * kalau tidak, trial-nya tak membuktikan apa pun.
 *
 * `past_due` juga ikut, dan itu keputusan komersial yang disengaja: tagihan
 * telat beberapa hari tak boleh mematikan proyek yang sedang berjalan di
 * lapangan. Penagihannya urusan alur tagihan, bukan urusan gerbang ini.
 *
 * Yang TIDAK ikut: `canceled` dan `expired` — di situ hubungannya memang sudah
 * selesai.
 */
const STATUS_BERLAKU = new Set(['active', 'trialing', 'past_due'])

/**
 * Membaca batas yang berlaku untuk satu perusahaan.
 *
 * Memakai `supabase` (service-role) dengan sengaja, BUKAN `request.db`:
 * `plans` dan `plan_features` adalah katalog VENDOR (kategori D di
 * tenant-map) — sama untuk semua pelanggan, dan tak punya `company_id`.
 * Yang disaring per-tenant justru `subscriptions` dan
 * `tenant_feature_overrides`, dan keduanya disaring EKSPLISIT di bawah.
 */
export async function bacaBatasPaket(companyId: string): Promise<BatasPaket> {
  if (!companyId) return TAK_DIBATASI

  const { data: langganan, error: galatLangganan } = await supabase
    .from('subscriptions')
    .select('id, plan_id, status, plans ( code, name )')
    .eq('company_id', companyId)
    // Satu perusahaan bisa punya riwayat langganan. Yang berlaku adalah yang
    // TERBARU — tanpa ORDER BY, `limit(1)` memulangkan baris sembarang, dan
    // tenant yang baru naik paket bisa terkunci di batas paket lamanya.
    .order('created_at', { ascending: false })
    .limit(1)

  if (galatLangganan) {
    // ⚠ Galat kueri TIDAK didiamkan jadi "tak dibatasi".
    //
    // Basis yang tak terjangkau bukan bukti bahwa tenant ini tak berlangganan.
    // Menyamakannya berarti satu gangguan jaringan membuka seluruh batas untuk
    // semua orang, tanpa satu pun jejak.
    throw new Error(`Gagal membaca langganan perusahaan: ${galatLangganan.message}`)
  }

  const baris = langganan?.[0] as unknown as BarisLangganan | undefined
  if (!baris || !baris.plan_id || !STATUS_BERLAKU.has(baris.status)) {
    return TAK_DIBATASI
  }

  const { data: nilai, error: galatNilai } = await supabase
    .from('plan_feature_values')
    .select('value_boolean, value_integer, value_text, plan_features ( key, label, value_type )')
    .eq('plan_id', baris.plan_id)
    .limit(500)

  if (galatNilai) {
    throw new Error(`Gagal membaca batas paket: ${galatNilai.message}`)
  }

  const fitur = new Map<string, BatasFitur>()
  for (const n of (nilai ?? []) as unknown as BarisNilaiPaket[]) {
    const f = n.plan_features
    // Baris yang fiturnya sudah dihapus dari katalog memulangkan null lewat
    // embed. Dilewati: batas tanpa nama tak bisa ditegakkan oleh siapa pun.
    if (!f?.key) continue
    fitur.set(f.key, {
      kunci: f.key,
      label: f.label ?? f.key,
      jenis: (f.value_type ?? 'boolean') as JenisNilai,
      angka: n.value_integer ?? null,
      boleh: n.value_boolean ?? null,
      teks: n.value_text ?? null,
      dariOverride: false,
    })
  }

  // ── Override per-tenant MENANG atas paket ────────────────────────────────
  //
  // Ini yang membuat "aturannya tak kaku": satu pelanggan bisa diberi batas
  // berbeda tanpa membuat paket baru untuknya sendiri.
  //
  // `expires_at` dihormati. Override yang sudah lewat tanggalnya TIDAK berlaku
  // — kalau tidak, kelonggaran sementara yang diberikan sekali jadi permanen
  // tanpa ada yang memutuskannya.
  const sekarang = new Date().toISOString()
  const { data: override, error: galatOverride } = await supabase
    .from('tenant_feature_overrides')
    .select('value_boolean, value_integer, value_text, expires_at, plan_features ( key, label, value_type )')
    .eq('company_id', companyId)
    .or(`expires_at.is.null,expires_at.gt.${sekarang}`)
    .limit(500)

  if (galatOverride) {
    throw new Error(`Gagal membaca kelonggaran tenant: ${galatOverride.message}`)
  }

  for (const o of (override ?? []) as unknown as BarisOverride[]) {
    const f = o.plan_features
    if (!f?.key) continue
    fitur.set(f.key, {
      kunci: f.key,
      label: f.label ?? f.key,
      jenis: (f.value_type ?? 'boolean') as JenisNilai,
      angka: o.value_integer ?? null,
      boleh: o.value_boolean ?? null,
      teks: o.value_text ?? null,
      dariOverride: true,
    })
  }

  return {
    dibatasi: true,
    paketKode: baris.plans?.code ?? null,
    paketNama: baris.plans?.name ?? null,
    status: baris.status,
    fitur,
  }
}

export interface HasilPeriksa {
  boleh: boolean
  /** Kalimat yang bisa ditampilkan ke pengguna. NULL bila boleh. */
  alasan: string | null
  /** Batas yang berlaku, untuk ditampilkan. NULL = tak terbatas. */
  batas: number | null
  terpakai: number | null
}

const BOLEH: HasilPeriksa = Object.freeze({
  boleh: true,
  alasan: null,
  batas: null,
  terpakai: null,
})

/**
 * Apakah sebuah fitur BOOLEAN terbuka untuk perusahaan ini.
 *
 * Fitur yang TIDAK terdaftar di paket dianggap TERBUKA, bukan tertutup.
 *
 * Alasannya sama dengan alasan gagal-terbuka di atas, dan lebih tajam: katalog
 * fitur akan selalu tertinggal dari kode. Modul ke-23 yang ditambahkan besok
 * belum punya barisnya di `plan_feature_values`, dan kalau "tak terdaftar"
 * berarti "tertutup", tiap fitur baru lahir dalam keadaan mati untuk SEMUA
 * pelanggan — termasuk yang membayar paling mahal.
 *
 * Menutup sebuah fitur karena itu harus jadi tindakan yang DISENGAJA: ada
 * barisnya, dan nilainya false.
 */
export function bolehPakaiFitur(batas: BatasPaket, kunciFitur: string): HasilPeriksa {
  if (!batas.dibatasi) return BOLEH

  const f = batas.fitur.get(kunciFitur)
  if (!f) return BOLEH
  if (f.jenis !== 'boolean') return BOLEH
  if (f.boleh !== false) return BOLEH

  return {
    boleh: false,
    alasan: `${f.label} tidak termasuk dalam paket ${batas.paketNama ?? batas.paketKode ?? 'Anda'}.`,
    batas: null,
    terpakai: null,
  }
}

/**
 * Apakah masih ada ruang untuk menambah satu lagi (proyek, pengguna, …).
 *
 * `terpakai` dihitung PEMANGGIL, bukan di sini: yang tahu cara mencacah proyek
 * aktif adalah modul proyek, dan menaruh semua cara mencacah di berkas ini
 * membuatnya tahu terlalu banyak.
 *
 * ⚠ NULL pada `angka` berarti TAK TERBATAS, bukan nol. Membalik artinya membuat
 * paket termahal jadi paket paling terbatas — dan angka 0 yang terbaca "tanpa
 * batas" jauh lebih mudah lolos tinjauan daripada kebalikannya.
 */
export function masihMuat(
  batas: BatasPaket,
  kunciFitur: string,
  terpakai: number
): HasilPeriksa {
  if (!batas.dibatasi) return BOLEH

  const f = batas.fitur.get(kunciFitur)
  if (!f) return BOLEH
  if (f.jenis !== 'integer') return BOLEH
  if (f.angka === null) return BOLEH // tak terbatas

  if (terpakai < f.angka) {
    return { boleh: true, alasan: null, batas: f.angka, terpakai }
  }

  return {
    boleh: false,
    // Kalimatnya menyebut ANGKANYA. "Batas paket tercapai" memaksa penggunanya
    // menebak berapa batasnya dan berapa yang sudah dipakai — dua hal yang
    // sudah kita ketahui saat menolak.
    alasan:
      `${f.label} sudah mencapai batas paket ${batas.paketNama ?? batas.paketKode ?? ''}`.trim() +
      ` (${terpakai} dari ${f.angka}). Naikkan paket, atau nonaktifkan yang lama.`,
    batas: f.angka,
    terpakai,
  }
}
