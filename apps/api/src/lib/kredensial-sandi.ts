/**
 * ENKRIPSI KREDENSIAL — AES-256-GCM dengan kunci turunan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DI APLIKASI, BUKAN `pgcrypto`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `pgcrypto` aktif di basis ini sejak migrasi 001 dan menggoda dipakai —
 * `pgp_sym_encrypt(nilai, kunci)` satu baris. Tapi kunci itu dikirim sebagai
 * PARAMETER QUERY, dan parameter query mendarat di `pg_stat_statements`, di
 * log statement lambat, dan di jejak galat.
 *
 * Enkripsi di sini membuat kunci utamanya tak pernah menyeberang jaringan.
 *
 * ── Beda dari TJS: KDF, yang mereka lewatkan
 *
 * TJS memakai AES-256-GCM dengan master key = hasil base64-decode env, tanpa
 * KDF dan tanpa salt. Itu bekerja, tapi menuntut env-nya berisi 32 byte acak
 * sempurna — dan begitu seseorang menaruh frasa yang bisa diingat di sana,
 * kunci efektifnya runtuh tanpa gejala apa pun.
 *
 * Di sini env dilewatkan **scrypt**. Konsekuensinya: frasa pendek sekalipun
 * menghasilkan kunci 32 byte yang benar, dan menebaknya mahal.
 *
 * ── Kenapa formatnya berversi
 *
 * `v1:<iv>:<tag>:<ciphertext>` — semuanya base64url. Awalan versi itu yang
 * membuat algoritma bisa dirotasi kelak tanpa migrasi tabel: `buka()` melihat
 * awalannya dan memilih pembacanya. Migrasi 242 menegakkan bentuk ini lewat
 * CHECK, jadi plaintext yang lolos lewat jalur lain ditolak basis.
 *
 * ── Kenapa `iv` acak per nilai, bukan tetap
 *
 * GCM dengan IV berulang pada kunci yang sama BOCOR — bukan melemah, bocor.
 * Dua ciphertext dengan IV sama bisa di-XOR untuk menghapus keystream-nya.
 * 12 byte acak per operasi adalah ukuran yang direkomendasikan untuk GCM.
 */
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto'

const VERSI = 'v1'
const ALGO = 'aes-256-gcm'
const PANJANG_IV = 12          // ukuran nonce yang direkomendasikan untuk GCM
const NAMA_ENV = 'CREDENTIAL_ENCRYPTION_KEY'

/**
 * Salt scrypt yang tetap.
 *
 * Salt biasanya harus acak per nilai — di sini TIDAK, dan itu disengaja:
 * kita menurunkan SATU kunci utama dari SATU rahasia server, bukan meng-hash
 * kata sandi milik banyak orang. Salt acak berarti kunci berbeda tiap proses,
 * dan tak ada yang bisa didekripsi setelah restart.
 *
 * Yang melindungi tiap nilai dari nilai lain adalah IV acak per operasi,
 * bukan salt.
 */
const SALT = Buffer.from('puraloka-kredensial-v1')

let kunciCache: Buffer | null = null

/**
 * Turunkan kunci 32 byte dari env.
 *
 * Melempar bila env kosong. Itu disengaja dan penting: rute penyimpanan
 * menangkapnya dan membalas 503, sehingga sistem MENOLAK menyimpan alih-alih
 * diam-diam menyimpan sesuatu yang tak bisa dibuka lagi — atau lebih buruk,
 * plaintext.
 */
function kunci(): Buffer {
  if (kunciCache) return kunciCache
  const rahasia = process.env[NAMA_ENV]?.trim()
  if (!rahasia) {
    throw new Error(
      `${NAMA_ENV} belum disetel — kredensial tak bisa dienkripsi. ` +
      'Setel di apps/api/.env dengan nilai acak panjang.',
    )
  }
  if (rahasia.length < 16) {
    throw new Error(
      `${NAMA_ENV} terlalu pendek (${rahasia.length} karakter, minimal 16). ` +
      'Kunci pendek membuat seluruh enkripsi ini teater.',
    )
  }
  kunciCache = scryptSync(rahasia, SALT, 32)
  return kunciCache
}

/** Apakah enkripsi siap dipakai? Dipakai rute untuk membalas 503 lebih awal. */
export function sandiSiap(): boolean {
  try {
    kunci()
    return true
  } catch {
    return false
  }
}

/** Enkripsi nilai menjadi `v1:iv:tag:ciphertext` (semuanya base64url). */
export function kunciNilai(polos: string): string {
  const iv = randomBytes(PANJANG_IV)
  const c = createCipheriv(ALGO, kunci(), iv)
  const data = Buffer.concat([c.update(polos, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return [VERSI, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join(':')
}

/**
 * Buka nilai terenkripsi.
 *
 * Melempar bila formatnya asing, versinya tak dikenal, ATAU tag autentikasinya
 * tak cocok. Yang terakhir berarti ciphertext-nya diubah atau kunci utamanya
 * berganti — dan keduanya harus berisik, bukan mengembalikan sampah yang
 * kemudian dikirim ke penyedia sebagai "kunci API".
 */
export function bukaNilai(tersimpan: string): string {
  const bagian = tersimpan.split(':')
  if (bagian.length !== 4) {
    throw new Error('Bentuk kredensial tersimpan tidak dikenal')
  }
  const [versi, ivB64, tagB64, dataB64] = bagian
  if (versi !== VERSI) {
    throw new Error(`Versi enkripsi '${versi}' tidak dikenal`)
  }
  const d = createDecipheriv(ALGO, kunci(), Buffer.from(ivB64, 'base64url'))
  d.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(dataB64, 'base64url')), d.final()]).toString('utf8')
}

/**
 * Empat karakter terakhir, untuk ditampilkan sebagai `••••a1b2`.
 *
 * Inilah yang membuat admin bisa memastikan kunci yang BENAR terpasang tanpa
 * nilainya pernah dikirim ke browser. Nilai yang lebih pendek dari 8 karakter
 * mengembalikan null: menampilkan 4 dari 6 karakter bukan penyamaran, itu
 * membocorkan dua pertiganya.
 */
export function empatAkhir(polos: string): string | null {
  return polos.length >= 8 ? polos.slice(-4) : null
}

/** Hanya untuk test — melupakan kunci turunan supaya env bisa diganti. */
export function lupakanKunciUjiSaja(): void {
  kunciCache = null
}
