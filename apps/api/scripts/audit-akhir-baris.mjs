#!/usr/bin/env node
/**
 * PENJAGA: berkas sumber tak boleh berubah akhir barisnya (LF → CRLF).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Terjadi DUA KALI pada 2026-08-07, dalam satu sesi:
 *
 *   1. Delapan berkas rute berubah LF → CRLF karena skrip penyunting memakai
 *      `io.open(f, 'w')` — yang menulis dengan akhir baris platform.
 *   2. Tiga dokumen (JOURNAL, QUEUE, ci.yml) menyusul dengan sebab sama.
 *
 * Dua akibatnya, dan yang kedua lebih berbahaya:
 *
 *   • `submittal-aturan.test.ts` MERAH. Ia memeriksa teks sumber dengan
 *     `toContain("...(request, {\n        entityType: 'submittal'")` — pola
 *     ber-`\n`. Pada berkas CRLF, pola itu tak akan pernah cocok lagi, dan
 *     pesan gagalnya menunjuk ke tempat yang salah sama sekali.
 *
 *   • Diff berubah jadi "5.764 baris" untuk perubahan yang sebenarnya 70
 *     baris. Perubahan nyata tenggelam di antara ribuan baris palsu, dan
 *     peninjau tak punya cara melihat apa yang benar-benar berubah.
 *
 * Yang menyelamatkan keduanya adalah peringatan git "CRLF will be replaced by
 * LF" — yang selama ini terbaca sebagai kebisingan dan dilewati.
 *
 * ── Yang dibandingkan
 *
 * Berkas di pohon kerja vs versi yang sama di HEAD. Berkas BARU tak diperiksa
 * (belum punya pembanding), dan berkas yang memang CRLF di HEAD dibiarkan.
 *
 * Pakai (dari akar repo): node apps/api/scripts/audit-akhir-baris.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

/** Ekstensi yang isinya dibaca sebagai teks oleh test/alat. */
const DIPERIKSA = /\.(ts|tsx|mjs|js|json|md|yaml|yml|sql|css)$/

function git(...arg) {
  return execFileSync('git', arg, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
}

let berubah
try {
  berubah = git('diff', '--name-only', 'HEAD')
    .toString('utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && DIPERIKSA.test(s))
} catch {
  console.log('')
  console.log('⚠️  Bukan repo git atau HEAD tak terbaca — pemeriksaan dilewati.')
  console.log('')
  process.exit(0)
}

const temuan = []

for (const f of berubah) {
  if (!existsSync(f)) continue                    // dihapus
  const kerja = readFileSync(f)
  if (!kerja.includes('\r\n')) continue           // pohon kerja LF → aman

  let head
  try { head = git('show', `HEAD:${f}`) } catch { continue }  // berkas baru
  if (head.includes('\r\n')) continue             // memang CRLF di HEAD

  temuan.push(f)
}

console.log('')
console.log('══ Akhir baris: LF tetap LF ══════════════════════════════════')
console.log(`  berkas teks berubah : ${berubah.length}`)
console.log(`  LF -> CRLF          : ${temuan.length}`)
console.log('')

if (temuan.length === 0) {
  console.log('✅ Tak ada berkas yang berubah akhir barisnya.')
  console.log('')
  process.exit(0)
}

console.error('❌ Berkas ini LF di HEAD tapi CRLF di pohon kerja:')
for (const f of temuan) console.error(`     ${f}`)
console.error('')
console.error('   Pulihkan tanpa membatalkan perubahan isinya:')
console.error('')
console.error("     python -c \"import io,sys")
console.error("     f=sys.argv[1]; b=io.open(f,'rb').read()")
console.error("     io.open(f,'wb').write(b.replace(b'\\r\\n', b'\\n'))\" <berkas>")
console.error('')
console.error('   Dan saat menyunting lewat skrip, tulis BINER:')
console.error("     io.open(f, 'wb').write(s.encode('utf-8'))")
console.error("     — bukan io.open(f, 'w'), yang memakai akhir baris platform.")
console.error('')
console.error('   Kenapa ini ditegakkan: test yang membaca teks sumber dengan')
console.error('   pola ber-`\\n` jadi merah dengan pesan yang menunjuk ke tempat')
console.error('   salah, dan diff 70 baris membengkak jadi 5.764 — perubahan')
console.error('   nyata tenggelam. Terjadi dua kali pada 2026-08-07.')
console.error('')
process.exit(1)
