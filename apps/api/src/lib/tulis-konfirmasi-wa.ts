/**
 * MEMBACA "YA" DARI WHATSAPP — dan alasan ia sengaja PELIT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MASALAHNYA BUKAN MENGENALI "YA". MASALAHNYA "YA" UNTUK APA.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Di web, tombol konfirmasi menempel pada usulan tertentu: yang diklik adalah
 * yang tampil. Di WhatsApp tak ada tempelan itu — yang datang cuma kata "ya",
 * dan sistem harus menebak untuk apa.
 *
 * Tebakan itu punya cara gagal yang mahal:
 *
 *   asisten : "Kasbon Rp 5jt untuk beli solar — konfirmasi?"
 *   (orangnya tak menjawab, pergi rapat)
 *   ... 12 menit kemudian ...
 *   orang   : "ya"          ← maksudnya menjawab pertanyaan LAIN,
 *                             atau meneruskan obrolan yang sudah lupa
 *
 * Kalau "ya" itu mengklaim token yang masih hidup, kasbon Rp 5 juta tercatat
 * atas namanya tanpa ia sadar. Ia baru tahu saat approver bertanya.
 *
 * Karena itu tiga pengetatan, semuanya sengaja MENGURANGI kenyamanan:
 *
 *  1. **Jendela pendek.** Token hidup 15 menit untuk klik di layar. Untuk
 *     kalimat WhatsApp hanya `JENDELA_KONFIRMASI_MS` (3 menit) sejak token
 *     terbit. Lewat itu, "ya" tak lagi mengklaim apa pun dan asisten meminta
 *     ulang. Menyiapkan ulang ongkosnya satu pesan; kasbon yang salah catat
 *     ongkosnya kepercayaan.
 *
 *  2. **Hanya token TERAKHIR.** Kalau ada dua usulan hidup, "ya" tidak memilih
 *     salah satunya — semuanya ditolak dan asisten bertanya mana yang dimaksud.
 *     Menebak "yang terbaru" di sini terasa masuk akal dan justru berbahaya:
 *     yang terbaru belum tentu yang ia baca terakhir.
 *
 *  3. **Frasa yang PELIT.** Hanya kata yang tak punya arti lain. "ok" masuk;
 *     "oke deh nanti" TIDAK — kalimat panjang yang kebetulan memuat "ok"
 *     hampir selalu bukan konfirmasi. Yang ragu diperlakukan sebagai BUKAN
 *     konfirmasi, bukan sebaliknya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA "BATAL" IKUT DIKENALI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tanpa itu, satu-satunya cara membatalkan adalah DIAM tiga menit. Diam
 * sebagai pembatalan buruk karena tak memberi kepastian: orangnya tak tahu
 * apakah ia sudah aman, dan sebagian akan mengetik "jangan" yang — tanpa
 * penanganan — dijawab model sebagai obrolan biasa sementara tokennya masih
 * hidup.
 */

import { randomBytes } from 'node:crypto'
import type { TenantDb } from '../utils/tenant-db.js'
import { entitasTulis, persenSah } from './ai-tool-siapkan.js'
import type { UsulTulis } from './usul-tulis.js'

/**
 * Jendela konfirmasi lewat kalimat. SENGAJA jauh lebih pendek dari umur token.
 *
 * 15 menit aman untuk tombol karena tombolnya menempel pada usulan yang
 * terlihat. Kalimat tak menempel pada apa pun — lihat kepala berkas.
 */
export const JENDELA_KONFIRMASI_MS = 3 * 60_000

/*
 * Daftar frasa, bukan pencocokan longgar.
 *
 * Ditulis sebagai kata UTUH yang dibandingkan dengan seluruh pesan (sesudah
 * dinormalkan), bukan `includes()`. "ya" di dalam "yang penting jangan dulu"
 * adalah kebalikan persis dari konfirmasi, dan `includes()` akan menyetujuinya.
 */
const YA = new Set([
  'ya', 'iya', 'y', 'yes', 'ok', 'oke', 'okey', 'okay', 'sip', 'siap',
  'betul', 'benar', 'setuju', 'lanjut', 'gas', 'boleh', 'yoi', 'yup',
  'simpan', 'catat', 'kirim', 'ya benar', 'ya betul', 'iya benar',
  'ok sip', 'oke sip', 'ya simpan', 'iya simpan', 'ya catat', 'benar simpan',
])

const BATAL = new Set([
  'batal', 'batalkan', 'tidak', 'tdk', 'ga', 'gak', 'nggak', 'engga', 'enggak',
  'no', 'n', 'jangan', 'salah', 'bukan', 'stop', 'cancel', 'skip',
  'ga jadi', 'gajadi', 'gak jadi', 'nggak jadi', 'tidak jadi', 'batal dulu',
  'jangan dulu', 'nanti dulu', 'bukan itu', 'salah itu',
])

export type NiatKonfirmasi = 'ya' | 'batal' | 'bukan'

/**
 * Menormalkan pesan sebelum dicocokkan.
 *
 * Emoji & tanda baca dibuang karena "ya!" dan "ya 👍" adalah konfirmasi yang
 * sama, dan menuntut orang lapangan mengetik tanpa tanda seru adalah menuntut
 * yang tak akan terjadi.
 */
function normalkan(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Apakah pesan ini konfirmasi, pembatalan, atau bukan keduanya.
 *
 * Bawaannya `'bukan'`. Kalimat yang tak persis cocok TIDAK menyimpan apa pun —
 * ia diteruskan ke model sebagai obrolan biasa, persis seperti sebelum fitur
 * ini ada.
 */
export function niatKonfirmasi(teks: string): NiatKonfirmasi {
  const n = normalkan(teks ?? '')
  if (!n) return 'bukan'

  /*
   * Batal diperiksa LEBIH DULU.
   *
   * "ya jangan" memuat keduanya, dan dalam bahasa sehari-hari yang menang
   * adalah penolakannya. Saat ragu, arah yang aman adalah TIDAK menyimpan.
   */
  if (BATAL.has(n)) return 'batal'
  if (YA.has(n)) return 'ya'

  return 'bukan'
}

/** Umur token — sama dengan rute web. Satu kebiasaan, bukan dua. */
const UMUR_TOKEN_MS = 15 * 60_000

/** Batas yang sama persis dengan `POST /ai/siapkan-tulis`. */
const BATAS_PENGELUARAN = 10_000_000
const BATAS_KASBON = 50_000_000

export type HasilTerbit =
  | { ok: true; ringkasan: string; jenis: string }
  | { ok: false; pesan: string }

/**
 * Menerbitkan token dari usulan model — jalur WhatsApp.
 *
 * ── Kenapa TIDAK lewat `POST /ai/siapkan-tulis`
 *
 * Rute itu menuntut sesi login, dan webhook tak punya satu pun (lihat kepala
 * `lib/tulis-klaim.ts`). `server.inject` juga tak menolong: yang kurang bukan
 * jalurnya melainkan tokennya.
 *
 * ── Kenapa validasinya DIULANG di sini, bukan dipercayakan ke model
 *
 * Argumen datang dari model, dan model bisa didorong lewat injeksi dokumen.
 * Yang menahannya bukan kalimat di prompt melainkan pemeriksaan ini —
 * termasuk batas nominal, yang sengaja sama persis dengan rute web supaya
 * WhatsApp tak jadi pintu yang lebih longgar.
 *
 * Proyek DIRESOLUSI dari nama lewat `db` milik tenant, tak pernah diterima
 * sebagai id: model mengarang UUID, dan UUID karangan yang kebetulan cocok
 * adalah pintu ke proyek tenant lain.
 */
export async function terbitkanTokenWa(
  db: TenantDb,
  companyId: string,
  userId: string,
  usul: UsulTulis,
  catatGalat: (pesan: string, err: unknown) => void,
): Promise<HasilTerbit> {
  const meta = entitasTulis(usul.jenis)
  if (!meta) return { ok: false, pesan: `Jenis '${usul.jenis}' tak bisa dicatat lewat asisten.` }

  const a = usul.argumen
  const cari = typeof a.proyek === 'string' ? a.proyek.trim().toLowerCase() : ''
  if (!cari) return { ok: false, pesan: 'Sebutkan proyeknya dulu, ya.' }

  const { data, error } = await db.from('projects').select('id, name')
  if (error) {
    catatGalat('tulis-konfirmasi: gagal membaca proyek', error)
    return { ok: false, pesan: 'Gagal memeriksa proyek. Coba lagi sebentar lagi.' }
  }

  const semua = (data ?? []) as unknown as Array<{ id: string; name: string }>
  const cocok = semua.filter((p) => (p.name ?? '').toLowerCase().includes(cari))
  if (cocok.length === 0) return { ok: false, pesan: `Tak ada proyek yang cocok dengan '${a.proyek}'.` }
  if (cocok.length > 1) {
    // AMBIGU dinyatakan, bukan ditebak — menulis ke proyek yang salah karena
    // namanya mirip baru ketahuan berminggu kemudian.
    return {
      ok: false,
      pesan: `Ada ${cocok.length} proyek yang cocok: ${cocok.map((p) => p.name).join(', ')}. Sebut yang mana, ya.`,
    }
  }

  const proyek = cocok[0]
  const teks = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  let muatan: Record<string, unknown>
  let ringkasan: string

  switch (usul.jenis) {
    case 'catatan_progres': {
      if (!persenSah(a.persen)) return { ok: false, pesan: 'Persen progres harus angka 0–100.' }
      const catatan = teks(a.catatan)
      muatan = { pct_overall: Number(a.persen), notes: catatan || null }
      ringkasan = `Catatan progres ${proyek.name}: ${Number(a.persen)}%${catatan ? ` — ${catatan}` : ''}`
      break
    }
    case 'temuan_punch': {
      const judul = teks(a.judul)
      if (judul.length < 5) return { ok: false, pesan: 'Jelaskan temuannya sedikit lebih lengkap.' }
      const SEV = ['ringan', 'sedang', 'berat', 'kritis']
      const sev = teks(a.severity)
      if (sev && !SEV.includes(sev)) return { ok: false, pesan: `Tingkat harus salah satu: ${SEV.join(', ')}.` }
      const lokasi = teks(a.lokasi)
      muatan = { judul, lokasi: lokasi || null, severity: sev || 'sedang' }
      ringkasan = `Temuan punch ${proyek.name}: ${judul}${lokasi ? ` (${lokasi})` : ''}`
      break
    }
    case 'pengeluaran': {
      const jumlah = Number(a.jumlah)
      if (!Number.isFinite(jumlah) || jumlah <= 0) return { ok: false, pesan: 'Nominalnya berapa, ya?' }
      if (jumlah > BATAS_PENGELUARAN) {
        return {
          ok: false,
          pesan: `Pengeluaran di atas Rp ${BATAS_PENGELUARAN.toLocaleString('id-ID')} diajukan lewat halaman Pengeluaran, bukan lewat chat.`,
        }
      }
      const keperluan = teks(a.keperluan)
      if (keperluan.length < 5) return { ok: false, pesan: 'Untuk keperluan apa, ya?' }
      muatan = { amount: jumlah, description: keperluan }
      ringkasan = `Pengeluaran ${proyek.name}: Rp ${jumlah.toLocaleString('id-ID')} — ${keperluan}`
      break
    }
    case 'permintaan_material': {
      const kebutuhan = teks(a.kebutuhan)
      if (kebutuhan.length < 10) {
        return { ok: false, pesan: 'Sebutkan jumlah dan keperluannya — mis. "50 sak semen untuk cor lantai 2".' }
      }
      const tgl = teks(a.dibutuhkan_tanggal)
      if (tgl && (!/^\d{4}-\d{2}-\d{2}$/.test(tgl) || Number.isNaN(Date.parse(tgl)))) {
        return { ok: false, pesan: 'Tanggalnya pakai format YYYY-MM-DD, ya.' }
      }
      muatan = { notes: kebutuhan, ...(tgl ? { needed_date: tgl } : {}) }
      ringkasan = `Permintaan material ${proyek.name}: ${kebutuhan}${tgl ? ` (dibutuhkan ${tgl})` : ''}`
      break
    }
    case 'kasbon': {
      const jumlah = Number(a.jumlah)
      if (!Number.isFinite(jumlah) || jumlah <= 0) return { ok: false, pesan: 'Nominal kasbonnya berapa, ya?' }
      if (jumlah > BATAS_KASBON) {
        return {
          ok: false,
          pesan: `Kasbon di atas Rp ${BATAS_KASBON.toLocaleString('id-ID')} diajukan lewat halaman Kasbon, bukan lewat chat.`,
        }
      }
      const keperluan = teks(a.keperluan)
      if (keperluan.length < 5) return { ok: false, pesan: 'Untuk keperluan apa, ya?' }
      const SUMBER = ['owner_advance', 'client_fund']
      const sumber = teks(a.sumber_dana)
      if (sumber && !SUMBER.includes(sumber)) return { ok: false, pesan: `Sumber dana harus: ${SUMBER.join(' atau ')}.` }
      muatan = { jumlah, keperluan, sumber_dana: sumber || 'owner_advance' }
      ringkasan = `Kasbon ${proyek.name}: Rp ${jumlah.toLocaleString('id-ID')} — ${keperluan}`
      break
    }
    default:
      return { ok: false, pesan: `Jenis '${usul.jenis}' belum bisa lewat WhatsApp.` }
  }

  const { error: errSimpan } = await db
    .from('ai_token_tulis')
    .insert({
      company_id: companyId,
      token: randomBytes(32).toString('base64url'),
      user_id: userId,
      jenis: usul.jenis,
      aksi: 'buat',
      project_id: proyek.id,
      muatan,
      ringkasan,
      kanal: 'ai_whatsapp',
      kedaluwarsa: new Date(Date.now() + UMUR_TOKEN_MS).toISOString(),
    })
    .select('id')

  if (errSimpan) {
    catatGalat('tulis-konfirmasi: gagal menerbitkan token', errSimpan)
    return { ok: false, pesan: 'Gagal menyiapkan catatan. Coba lagi sebentar lagi.' }
  }

  return { ok: true, ringkasan, jenis: usul.jenis }
}

/** Token yang menunggu konfirmasi kalimat. */
export interface TokenMenunggu {
  token: string
  jenis: string
  ringkasan: string
}

export interface HasilMenunggu {
  /** Tepat satu token hidup — satu-satunya keadaan yang boleh diklaim. */
  token: TokenMenunggu | null
  /** Lebih dari satu; "ya" jadi ambigu dan HARUS ditanyakan ulang. */
  ambigu: boolean
}

/**
 * Mencari token yang sedang menunggu konfirmasi milik SATU orang.
 *
 * Disaring di basis, bukan di memori: `user_id` ikut di WHERE supaya token
 * orang lain tak pernah terbaca, sekalipun satu tenant.
 */
export async function tokenMenunggu(
  db: TenantDb,
  userId: string,
  catatGalat: (pesan: string, err: unknown) => void,
): Promise<HasilMenunggu> {
  const sejak = new Date(Date.now() - JENDELA_KONFIRMASI_MS).toISOString()

  const { data, error } = await db
    .from('ai_token_tulis')
    .select('token, jenis, ringkasan, dibuat_pada')
    .eq('user_id', userId)
    .eq('kanal', 'ai_whatsapp')
    .is('dipakai_pada', null)
    .gte('dibuat_pada', sejak)
    .order('dibuat_pada', { ascending: false })
    .limit(5)

  if (error) {
    // Gagal-tertutup: kalau daftar token tak terbaca, "ya" TIDAK menyimpan
    // apa pun. Menganggapnya kosong sama dengan menganggapnya "tak ada yang
    // menunggu", dan itu justru jawaban yang benar untuk keadaan ini.
    catatGalat('tulis-konfirmasi: gagal membaca token menunggu', error)
    return { token: null, ambigu: false }
  }

  const baris = (data ?? []) as Array<{ token: string; jenis: string; ringkasan: string }>

  if (baris.length === 0) return { token: null, ambigu: false }
  if (baris.length > 1) return { token: null, ambigu: true }

  return {
    token: { token: baris[0].token, jenis: baris[0].jenis, ringkasan: baris[0].ringkasan },
    ambigu: false,
  }
}

/**
 * Membatalkan token dengan MEMAKAINYA, bukan menghapusnya.
 *
 * `dipakai_pada` diisi meski tak ada baris yang ditulis. Terdengar keliru —
 * ia tak "dipakai" — tapi kolom itu artinya "tak bisa dipakai lagi", dan
 * itulah yang harus terjadi. Menghapus barisnya akan menghilangkan jejak
 * bahwa sebuah usulan pernah diajukan lalu ditolak, padahal justru penolakan
 * yang paling menarik saat ada yang bertanya "kenapa kasbon saya tak masuk?".
 */
export async function batalkanToken(
  db: TenantDb,
  token: string,
  catatGalat: (pesan: string, err: unknown) => void,
): Promise<boolean> {
  const { data, error } = await db
    .from('ai_token_tulis')
    .update({ dipakai_pada: new Date().toISOString() })
    .eq('token', token)
    .is('dipakai_pada', null)
    .select('id')

  if (error) {
    catatGalat('tulis-konfirmasi: gagal membatalkan token', error)
    return false
  }
  return Array.isArray(data) && data.length > 0
}
