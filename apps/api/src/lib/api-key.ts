/**
 * API KEY — jalan masuk bagi sistem luar (G6c).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PUSTAKA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12: satu-satunya cara masuk ke API adalah token Supabase
 * Auth — yaitu **sesi manusia yang login lewat peramban**. Tiap integrasi
 * karena itu menuntut seseorang menaruh kredensial login MANUSIA di sistem
 * lain: kewenangannya penuh, tak bisa dicabut tanpa mengunci orangnya, dan
 * jejaknya di audit log tertulis sebagai perbuatan orang itu — bukan mesin.
 *
 * ── HASH satu arah, bukan enkripsi
 *
 * Repo ini sudah punya `lib/kredensial-sandi.ts` (AES-256-GCM), dan memakai
 * ulangnya di sini akan SALAH: enkripsi bisa dibalik, jadi siapa pun yang
 * memegang server bisa membaca kembali kunci setiap pelanggan.
 *
 * Konsekuensi hash disengaja: kunci ditampilkan **sekali** saat dibuat, dan
 * sesudah itu tak ada yang bisa memulihkannya — termasuk kami.
 *
 * ── Kenapa SHA-256 dan bukan bcrypt/scrypt
 *
 * API key adalah 32 byte ACAK, bukan frasa yang bisa ditebak. KDF lambat
 * melindungi dari serangan kamus yang tak berlaku di sini, sementara biayanya
 * dibayar pada SETIAP permintaan — dan integrasi berarti banyak permintaan.
 *
 * Untuk kata sandi manusia, kesimpulannya akan terbalik.
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

/**
 * Awalan yang membuat kunci bisa dikenali saat bocor.
 *
 * Kunci yang tak bertanda apa-apa, begitu tertempel di repo publik atau
 * riwayat chat, tak bisa dikenali siapa pun sebagai kredensial — termasuk
 * oleh pemindai rahasia yang mencari pola. `plk_` membuatnya bisa dicari.
 */
export const AWALAN_KUNCI = 'plk_'

/** Panjang bagian acak dalam byte. 32 byte = 256 bit. */
const PANJANG_ACAK = 32

export interface KunciBaru {
  /** Kunci penuh — HANYA ada di memori sekali, tak pernah tersimpan. */
  kunci: string
  /** SHA-256 heksadesimal, inilah yang disimpan. */
  hash: string
  /** 8 karakter pertama, disimpan terang untuk pengenalan. */
  awalan: string
}

/**
 * Membuat kunci baru.
 *
 * `randomBytes` (CSPRNG), bukan `Math.random()`. Itu bukan kehati-hatian
 * berlebihan: `Math.random()` di V8 memakai xorshift128+ yang keadaannya
 * bisa dipulihkan dari beberapa keluaran, sehingga kunci berikutnya dapat
 * diramalkan. Kunci yang bisa diramalkan sama saja dengan tak ada kunci.
 */
export function buatKunci(): KunciBaru {
  const acak = randomBytes(PANJANG_ACAK).toString('base64url')
  const kunci = `${AWALAN_KUNCI}${acak}`
  return {
    kunci,
    hash: hashKunci(kunci),
    awalan: kunci.slice(0, 8),
  }
}

/** SHA-256 heksadesimal — bentuk yang ditegakkan `chk_api_key_hash`. */
export function hashKunci(kunci: string): string {
  return createHash('sha256').update(kunci, 'utf8').digest('hex')
}

/**
 * Membandingkan dua hash dalam waktu TETAP.
 *
 * Perbandingan `===` biasa berhenti pada byte pertama yang berbeda, sehingga
 * lamanya perbandingan membocorkan berapa banyak awalan yang sudah benar.
 * Dengan cukup banyak percobaan, penyerang bisa menyusun hash byte demi byte.
 *
 * Di sini yang dibandingkan hash (bukan kunci mentah), dan pencariannya lewat
 * indeks basis — jadi risikonya kecil. Tetap dipakai karena "kecil" bukan
 * "tak ada", dan biayanya nol.
 *
 * ⚠ TIDAK TERTUTUP MUTATION TEST — dinyatakan, bukan disembunyikan.
 *
 * Mengganti `timingSafeEqual` dengan `===` tidak membuat satu test pun merah,
 * dan itu benar secara logis: keduanya menghasilkan jawaban yang SAMA. Yang
 * berbeda hanya berapa lama jawabannya keluar, dan test fungsional tak bisa
 * melihat waktu tanpa menjadi rapuh (mesin sibuk membuat pengukuran waktu
 * meleset jauh lebih besar daripada selisih yang diukur).
 *
 * Ini kelas jaminan yang memang tak bisa dikunci test unit. Yang menjaganya:
 * catatan ini, dan tinjauan kode.
 */
export function hashSama(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    // Bukan heksadesimal sah — bukan hash kami.
    return false
  }
}

/** Bentuk kunci sah? Dipakai untuk menolak lebih awal, bukan sebagai jaminan. */
export function bentukSah(kunci: string | undefined | null): boolean {
  if (!kunci) return false
  if (!kunci.startsWith(AWALAN_KUNCI)) return false
  // base64url dari 32 byte = 43 karakter.
  const sisa = kunci.slice(AWALAN_KUNCI.length)
  return /^[A-Za-z0-9_-]{43}$/.test(sisa)
}

export interface KunciTersimpan {
  id: string
  company_id: string
  izin: string[] | null
  kedaluwarsa_pada: string | null
  dicabut_pada: string | null
}

export type HasilPeriksa =
  | { sah: true; kunci: KunciTersimpan }
  | { sah: false; alasan: string; kode: 'bentuk' | 'tak_dikenal' | 'dicabut' | 'kedaluwarsa' }

/**
 * Memeriksa kunci yang ditemukan di basis.
 *
 * ── Kenapa alasan penolakan DIBEDAKAN di sini tetapi TIDAK di balasan HTTP
 *
 * Yang memanggil butuh tahu bedanya untuk log dan untuk layar pemilik kunci
 * ("kunci Anda kedaluwarsa" vs "kunci tak dikenal" adalah dua tindakan yang
 * berbeda). Tetapi balasan ke pemanggil TIDAK boleh membedakannya: memberi
 * tahu penyerang bahwa sebuah kunci "dikenal tetapi kedaluwarsa" sudah
 * mengkonfirmasi kunci itu pernah ada.
 */
export function periksaKunci(
  k: KunciTersimpan | null | undefined,
  sekarang: Date = new Date(),
): HasilPeriksa {
  if (!k) {
    return { sah: false, kode: 'tak_dikenal', alasan: 'Kunci tidak dikenal' }
  }
  if (k.dicabut_pada) {
    return { sah: false, kode: 'dicabut', alasan: 'Kunci sudah dicabut' }
  }
  if (!k.kedaluwarsa_pada) {
    // Kolomnya NOT NULL di basis, jadi ini seharusnya mustahil. Kalau tetap
    // terjadi, yang benar adalah MENOLAK — kunci tanpa masa berlaku adalah
    // keadaan yang tak seorang pun putuskan.
    return { sah: false, kode: 'kedaluwarsa', alasan: 'Kunci tanpa masa berlaku' }
  }
  if (new Date(k.kedaluwarsa_pada).getTime() <= sekarang.getTime()) {
    return { sah: false, kode: 'kedaluwarsa', alasan: 'Kunci sudah kedaluwarsa' }
  }
  return { sah: true, kunci: k }
}

/**
 * Apakah kunci punya izin tertentu.
 *
 * Kunci TANPA izin tak bisa apa-apa — dan itu bawaan yang benar. Kunci yang
 * lahir dengan seluruh izin adalah cara paling cepat kehilangan kendali:
 * yang membuatnya tak pernah menyempitkannya kemudian, karena tak ada yang
 * rusak saat izinnya berlebih.
 *
 * Tidak ada wildcard. `'*'` di daftar izin diperlakukan sebagai izin bernama
 * `'*'` yang tak cocok dengan apa pun — bukan "semua izin". Membiarkan
 * wildcard berarti satu salah ketik memberi akses penuh.
 */
export function punyaIzin(izin: string[] | null | undefined, perlu: string): boolean {
  if (!izin || izin.length === 0) return false
  return izin.includes(perlu)
}

/** Alasan sebuah permintaan pembuatan kunci ditolak. `null` = sah. */
export function periksaPermintaan(
  nama: string | undefined | null,
  keperluan: string | undefined | null,
  hariBerlaku: number | undefined | null,
): string | null {
  if (!nama || nama.trim() === '') return 'Nama kunci wajib diisi'
  if (!keperluan || keperluan.trim().length < 10) {
    return 'Keperluan wajib diisi minimal 10 huruf — kunci tanpa keterangan '
      + 'tak bisa dinilai saat audit, dan yang terjadi kemudian selalu sama: '
      + 'tak ada yang berani mencabutnya'
  }
  const h = Number(hariBerlaku)
  // `Number('')` adalah 0, bukan NaN — tanpa pemeriksaan ini, masa berlaku
  // yang dikosongkan menjadi "0 hari" dan kuncinya mati saat itu juga.
  if (hariBerlaku === undefined || hariBerlaku === null || String(hariBerlaku).trim() === '') {
    return 'Masa berlaku wajib diisi'
  }
  if (!Number.isFinite(h) || h < 1) return 'Masa berlaku minimal 1 hari'
  // Dua tahun. Kunci yang berlaku lebih lama dari itu tak pernah
  // dipertanyakan lagi oleh siapa pun.
  if (h > 730) return 'Masa berlaku maksimal 730 hari (2 tahun)'
  return null
}

/** Tanggal kedaluwarsa dari jumlah hari. */
export function kedaluwarsaDari(hari: number, mulai: Date = new Date()): string {
  return new Date(mulai.getTime() + hari * 86_400_000).toISOString()
}
