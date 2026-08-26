#!/usr/bin/env node
/**
 * UJI ANTREAN OFFLINE — terhadap MODUL SUNGGUHAN, bukan salinan logikanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BEGINI, BUKAN VITEST
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `apps/mobile` tak punya test runner, dan memasangnya berarti `pnpm install`
 * di monorepo yang sedang dipakai sesi lain — perintah yang CLAUDE.md §8a.1
 * tandai bisa mengosongkan node_modules workspace lain di tengah jalan, dengan
 * galat yang menuduh KODE.
 *
 * Yang diuji di sini logika murni (urutan percobaan, kapan `percobaan` naik,
 * apakah kunci idempotensi ikut terkirim). Itu tak butuh React Native, tak
 * butuh perangkat, dan tak butuh runner: cukup `tsc` yang SUDAH terpasang
 * untuk mentranspil, lalu Node menjalankannya dengan modul native ditiru.
 *
 * ⚠ Yang diuji adalah `lib/antrean.ts` ITU SENDIRI — bukan salinan aturannya
 * yang ditulis ulang di berkas uji. Percobaan pertama menyalin logikanya, dan
 * itu menguji salinan yang bisa menyimpang dari aslinya tanpa ketahuan.
 *
 * Jalankan:  node apps/mobile/scripts/uji-antrean.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const MOBILE = join(DIR, '..')
const keluar = mkdtempSync(join(tmpdir(), 'uji-antrean-'))

try {
  /*
    Dipanggil lewat ENTRI JS typescript, bukan `.bin/tsc.cmd`.

    `execFileSync` di Windows tak menjalankan berkas .cmd lewat shell, dan
    gejalanya menyesatkan: exit code `null`, stdout kosong, tanpa satu pun
    pesan galat — terbaca seperti tsc berhasil tetapi tak menghasilkan apa
    pun. Entri JS-nya dijalankan Node langsung, jadi lintas-platform sekaligus
    bebas dari jebakan itu.
  */
  const tsc = join(MOBILE, 'node_modules', 'typescript', 'lib', 'tsc.js')

  /*
    Transpil SAJA — pemeriksaan tipe penuh dilakukan `npx tsc --noEmit` di
    tempat lain. Di sini `lib/api.ts` ikut tertarik dan mengeluh soal
    `__DEV__`/`process` yang memang hanya ada saat aplikasi berjalan; itu
    bukan kegagalan yang berarti bagi uji ini, jadi galatnya diabaikan
    SELAMA berkasnya tetap terbentuk (diperiksa di bawah lewat import).
  */
  try {
    execFileSync(process.execPath, [
      tsc,
      join(MOBILE, 'lib', 'antrean.ts'),
      '--outDir', keluar,
      '--module', 'esnext',
      '--target', 'es2022',
      '--moduleResolution', 'bundler',
      '--skipLibCheck',
    ], { stdio: 'pipe' })
  } catch {
    // lihat alasan di atas
  }

  /*
    Loader diberikan sebagai URL absolut, BUKAN jalur relatif: Node
    menyelesaikan `--experimental-loader` terhadap cwd, jadi jalur relatif
    bekerja saat dijalankan dari apps/mobile dan GAGAL dari akar repo — dan
    CI menjalankan dari akar.
  */
  execFileSync(
    process.execPath,
    [
      '--experimental-loader', pathToFileURL(join(DIR, 'uji', 'tiruan.mjs')).href,
      '--no-warnings',
      join(DIR, 'uji', 'kasus.mjs'),
    ],
    { stdio: 'inherit', env: { ...process.env, MODUL_ANTREAN: join(keluar, 'antrean.js') } },
  )
} catch (e) {
  // execFileSync melempar objek raksasa yang MENGUBUR pesan aslinya. Anak
  // sudah mencetak sendiri ke stdio 'inherit', jadi cukup teruskan kodenya.
  process.exit(typeof e?.status === 'number' ? e.status : 1)
} finally {
  rmSync(keluar, { recursive: true, force: true })
}
