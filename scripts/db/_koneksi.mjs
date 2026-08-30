// ============================================================================
// KONEKSI DB BERSAMA — dipakai SEMUA alat di scripts/db/.
// ============================================================================
//
// ── Kenapa modul ini ada
//
// Cacat C-1 (audit 2026-08-02) berakar pada tiga alat yang masing-masing menulis
// ulang logika "cari root repo → baca .env → bikin client". Tiap salinan punya
// bug sendiri, sehingga alat yang berbeda melaporkan hasil berbeda atas database
// yang SAMA — lalu kesimpulannya dibalik empat kali.
//
// Contoh nyata yang ditemukan saat membangun Fase 0: `introspect.mjs` melucuti
// tanda kutip pembungkus nilai `.env`, `ledger-diff.mjs` tidak. Karena nilai
// `DIRECT_URL` di repo ini memang ditulis dengan tanda kutip (`"postgresql://…"`),
// alat kedua meneruskan string berawalan `"` ke driver `pg`, yang lalu gagal
// mem-parsingnya sebagai URL dan jatuh ke variabel lingkungan — menghasilkan
// galat menyesatkan `getaddrinfo ENOTFOUND base`.
//
// Pelajarannya bukan "perbaiki parser kedua", melainkan "jangan punya parser
// kedua". Sejak modul ini ada, penambahan alat baru di scripts/db/ WAJIB
// memakainya dan dilarang membaca `.env` sendiri.
//
// ── Yang dijamin modul ini
//
//   • Root repo diturunkan dari lokasi berkas ini, bukan dari `process.cwd()`.
//   • `.env` diurai satu kali, dengan pelucutan kutip dan BOM.
//   • Client `pg` dibuat HANYA dengan `connectionString` eksplisit sehingga
//     variabel lingkungan seperti `HOST`/`PGHOST` tidak pernah ikut campur.
// ============================================================================

import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Root repo, diturunkan dari lokasi berkas ini — kebal terhadap cwd. */
export const REPO_ROOT = resolve(__dirname, '..', '..')
export const MIGRATIONS_DIR = join(REPO_ROOT, 'db', 'migrations')
export const SEEDS_DIR = join(REPO_ROOT, 'db', 'seeds')

const requireDari = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'))
export const pg = requireDari('pg')

/**
 * Menolak jalan bila cwd bukan root repo.
 *
 * Sengaja keras: seluruh ketidakstabilan angka pada audit sebelumnya berakar
 * pada cwd yang melayang tanpa disadari. Hasil yang benar-secara-kebetulan
 * lebih berbahaya daripada perintah yang menolak jalan.
 */
export function pastikanCwdRootRepo(argvSisa = '') {
  if (resolve(process.cwd()) !== REPO_ROOT) {
    console.error(
      `FATAL: alat ini wajib dijalankan dari root repo.\n` +
      `  cwd sekarang : ${process.cwd()}\n` +
      `  root repo    : ${REPO_ROOT}\n` +
      `Jalankan ulang: cd "${REPO_ROOT}" && node ${argvSisa}`,
    )
    process.exit(2)
  }
}

/** Melucuti BOM, spasi, dan tanda kutip pembungkus (penyebab galat ENOTFOUND). */
function bersihkanNilai(v) {
  let s = v.replace(/^﻿/, '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  return s
}

/** Membaca .env dari path absolut. Berkas pertama menang. */
export function bacaEnv() {
  const env = {}
  for (const p of [join(REPO_ROOT, 'apps', 'api', '.env'), join(REPO_ROOT, '.env')]) {
    if (!existsSync(p)) continue
    for (const baris of readFileSync(p, 'utf8').split('\n')) {
      const t = baris.replace(/^﻿/, '').trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).replace(/^﻿/, '').trim()
      if (!(k in env)) env[k] = bersihkanNilai(t.slice(i + 1))
    }
  }
  return env
}

/**
 * Membuat client `pg` yang terhubung ke DB dev.
 *
 * Hanya `connectionString` yang diteruskan — tidak ada host/user/password
 * terpisah — supaya variabel lingkungan tak bisa menyusup diam-diam.
 */
/**
 * Adakah connection string yang bisa dipakai? — TANPA mematikan proses.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — cacat nyata di ENAM penjaga sekaligus, diukur 2026-08-31
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `buatClient()` memanggil `process.exit(2)` saat DSN tak ada. Itu benar untuk
 * skrip yang memang menuntut basis — mati keras lebih baik daripada berjalan
 * setengah.
 *
 * Tetapi PENJAGA CI berbeda: sebagian dijalankan di job yang sengaja tak
 * diberi kredensial, dan mereka semua menulis pola yang sama —
 *
 *     try { c = buatClient(); await c.connect() }
 *     catch { console.log('DILEWATI'); process.exit(0) }
 *
 * — yang TIDAK PERNAH BEKERJA. `process.exit` tak bisa ditangkap `catch`;
 * prosesnya mati sebelum blok penangkap sempat berjalan.
 *
 * Diukur dengan menyembunyikan `apps/api/.env` lalu menjalankan tiap penjaga:
 *
 *     exit 2  audit-menu-berbagi-href · audit-nav-yatim · audit-peta-menu-vs-db
 *     exit 2  audit-rute-terkunci · audit-sidebar-urutan · uji-menu-halaman-hidup
 *     exit 0  audit-replay-bersih   (memang tak menyentuh basis)
 *
 * Keenamnya menulis komentar yang menjanjikan "DILEWATI dengan jujur", dan
 * keenamnya gagal keras. Komentar yang menjanjikan perilaku tanpa kodenya
 * lebih buruk daripada tak ada komentar: yang membacanya berhenti memeriksa.
 *
 * ⚠ `buatClient()` SENGAJA TIDAK DIUBAH. Melunakkannya jadi memulangkan
 * `null` akan membuat SETIAP pemanggil lama diam-diam berjalan tanpa basis —
 * termasuk skrip migrasi. Yang ditambahkan cuma cara BERTANYA lebih dulu.
 */
export function adaKoneksi(namaEnv = null) {
  const env = bacaEnv()
  return Boolean(
    (namaEnv && env[namaEnv])
    || env.DIRECT_URL
    || env.DATABASE_URL
    || process.env.DIRECT_URL
    || process.env.DATABASE_URL,
  )
}

export function buatClient(namaEnv = null) {
  const env = bacaEnv()
  const conn =
    (namaEnv && env[namaEnv]) ||
    env.DIRECT_URL ||
    env.DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL
  if (!conn) {
    console.error('FATAL: DIRECT_URL/DATABASE_URL tidak ditemukan di apps/api/.env maupun environment.')
    console.error('       Penjaga CI yang boleh dilewati: pakai `adaKoneksi()` SEBELUM memanggil ini —')
    console.error('       `try/catch` tak menangkap `process.exit`.')
    process.exit(2)
  }
  if (!/^postgres(ql)?:\/\//.test(conn)) {
    console.error(`FATAL: connection string tidak berbentuk URL postgres (mulai dengan: ${conn.slice(0, 12)}…).`)
    process.exit(2)
  }
  return new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
}
