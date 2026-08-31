/**
 * Menjalankan SELURUH penjaga yang dijalankan CI, dibaca dari `ci.yml` sendiri.
 *
 * ⚠ Versi pertama menebak cwd-nya `apps/api` untuk semua langkah, dan
 * melaporkan 59 "berkas tak ditemukan" yang seluruhnya PALSU — jalurnya
 * relatif terhadap `working-directory` langkah itu, atau terhadap akar repo.
 *
 * Nol hasil / berkas hilang bukan bukti ketiadaan. Sekarang jalurnya dicari
 * di beberapa akar sebelum dinyatakan hilang.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import { dirname, resolve as res } from 'node:path'
import { fileURLToPath } from 'node:url'
const AKAR = res(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const yml = readFileSync(join(AKAR, '.github/workflows/ci.yml'), 'utf8')

/*
 * Urutan pencarian cwd — AKAR REPO LEBIH DULU.
 *
 * `ci.yml` memanggil sebagian penjaga dengan jalur ber-awalan `apps/api/…`
 * dari akar repo. Kalau `apps/api` dicoba lebih dulu, jalur seperti
 * `apps/api/scripts/x.mjs` ikut cocok sebagai `apps/api/apps/api/scripts/x.mjs`
 * — tidak, ia TIDAK cocok, tapi jalur POLOS seperti `scripts/x.mjs` cocok di
 * KEDUANYA, dan yang terpilih belum tentu yang dipakai CI.
 *
 * Diukur 2026-08-18: `audit-akhir-baris.mjs` dilaporkan MERAH oleh versi
 * pertama berkas ini, padahal `exit=0`. Sebabnya cwd-nya salah — dan penjaga
 * yang dilaporkan merah padahal hijau sama berbahayanya dengan sebaliknya:
 * yang membacanya akan memperbaiki hal yang tak rusak.
 */
const KANDIDAT_CWD = ['.', 'apps/api', 'apps/web', 'apps/web-publik']

/*
  `apps/web-publik` ditambahkan 2026-08-31. Tanpa itu, DUA penjaga sungguhan
  dilaporkan "tak ketemu" dan tak pernah dijalankan:

      scripts/kontras-situs.mjs   apps/web-publik/scripts/kontras-situs.mjs
      scripts/audit-em-dash.mjs   apps/web-publik/scripts/audit-em-dash.mjs

  Keduanya ADA di repo dan dijalankan CI dengan `working-directory:
  apps/web-publik`. Berkas ini hanya mencari di tiga akar, jadi ia melapor
  "199 hijau" atas 197 yang benar-benar dijalankan.

  Bentuk cacatnya yang berbahaya: laporan ini dipakai untuk menyatakan
  "semua penjaga hijau" sebelum push. Penjaga yang hilang dari hitungan tak
  menjaga apa pun, dan ketiadaannya terbaca sebagai baris peringatan kecil
  di kaki laporan — tempat yang paling mudah dilewati mata.

  Ditaruh di AKHIR, sesudah akar: penjaga berjalur polos (`scripts/x.mjs`)
  cocok di beberapa cwd sekaligus, dan yang pertama cocok yang menang.
  Menaruhnya di depan akan mengubah cwd penjaga lain yang sudah benar.
*/

const perintah = new Set()
for (const m of yml.matchAll(/node\s+(-r\s+\S+\s+)?((?:\.\.\/)?[\w./-]+\.mjs)([^\n]*)/g)) {
  perintah.add(JSON.stringify({
    preload: (m[1] ?? '').trim(),
    skrip: m[2],
    argv: (m[3] ?? '').trim().replace(/[|>].*$/, '').trim(),
  }))
}

/**
 * Penjaga yang TAK BISA dijalankan di luar CI — dan kenapa membedakannya
 * penting.
 *
 * Kelimanya menuntut lingkungan CI: rahasia yang hanya ada di runner, atau
 * artefak yang dibuat langkah CI sebelumnya. Di laptop mereka SELALU merah,
 * apa pun keadaan kodenya.
 *
 * Melaporkannya bersama penjaga yang benar-benar merah melatih mata untuk
 * mengabaikan baris merah — dan begitu itu terjadi, penjaga sungguhan ikut
 * terabaikan. Diukur 2026-08-31: dari yang tampak merah, yang nyata cuma
 * SATU (audit-akhir-baris buta karena cwd), dan ia tenggelam di antara
 * kegagalan lingkungan.
 *
 * ⚠ BUKAN daftar pengecualian yang boleh tumbuh. Yang masuk sini harus
 * benar-benar mustahil dijalankan lokal — bukan sekadar merepotkan. Tiap
 * tambahan mengurangi apa yang diperiksa perintah ini.
 */
const BUTUH_CI = new Map([
  ["scripts/ci-project-setup.mjs", "butuh CI_DIRECT_URL (rahasia CI)"],
  ["scripts/gabung-coverage.mjs", "butuh artefak coverage-shards dari langkah CI"],
  ["scripts/coverage-ratchet.mjs", "butuh coverage-summary.json dari vitest --coverage"],
  ["scripts/audit-route-coverage-nol.mjs", "butuh coverage-summary.json dari vitest --coverage"],
  ["scripts/schema-fingerprint.mjs", "butuh basis CI; di CI pun continue-on-error: true"],
])

const hasil = { hijau: [], merah: [], hilang: [], lewat: [] }

for (const p of [...perintah].map((x) => JSON.parse(x))) {
  // Cari di mana berkasnya BENAR-BENAR ada, jangan tebak satu cwd.
  let dir = null
  for (const c of KANDIDAT_CWD) {
    if (existsSync(resolve(AKAR, c, p.skrip))) { dir = resolve(AKAR, c); break }
  }
  /*
    Skrip yang DIBUAT CI sendiri (heredoc ke /tmp) memang tak ada di repo —
    melaporkannya sebagai "hilang" menaruh temuan palsu di tempat yang sama
    dengan penjaga yang benar-benar hilang, dan itu melatih mata untuk
    mengabaikan baris itu. `situs-tiruan.mjs` dibuat di langkah sebelumnya
    lewat `cat > /tmp/… <<'EOF'`.
  */
  if (!dir && p.skrip.startsWith('/tmp/')) continue
  if (!dir) { hasil.hilang.push(p.skrip); continue }

  // Dilewati SEBELUM dijalankan, dan DISEBUT — bukan didiamkan. Perintah yang
  // diam-diam melewati sesuatu tak bisa dibedakan dari yang memeriksanya.
  if (BUTUH_CI.has(p.skrip)) {
    hasil.lewat.push({ skrip: p.skrip, alasan: BUTUH_CI.get(p.skrip) })
    continue
  }

  const args = []
  if (p.preload) args.push(...p.preload.split(/\s+/))
  args.push(p.skrip)
  if (p.argv) args.push(...p.argv.split(/\s+/).filter((a) => a && !a.startsWith('#')))

  try {
    execFileSync('node', args, { cwd: dir, stdio: 'pipe', timeout: 240000 })
    hasil.hijau.push(p.skrip)
  } catch (e) {
    const keluaran = String(e.stdout ?? '') + String(e.stderr ?? '')
    hasil.merah.push({
      skrip: p.skrip,
      pesan: keluaran.split('\n').map((s) => s.trim()).filter(Boolean)
        .filter((s) => /❌|FATAL|gagal|GAGAL|melebihi|bertambah|NAIK/.test(s))
        .slice(0, 2).join(' | ').slice(0, 200)
        || keluaran.split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 200),
    })
  }
}

console.log(`\n══ PENJAGA CI: ${hasil.hijau.length} hijau · ${hasil.merah.length} MERAH · ${hasil.lewat.length} dilewati (butuh CI) · ${hasil.hilang.length} tak ketemu\n`)
for (const m of hasil.merah) console.log(`❌ ${m.skrip}\n   ${m.pesan}\n`)
if (hasil.lewat.length) {
  console.log("⊘ Dilewati — tak bisa dijalankan di luar CI:")
  for (const l of hasil.lewat) console.log(`     ${l.skrip} — ${l.alasan}`)
  console.log("  Ini BUKAN lulus. Semuanya tetap berjalan di CI.")
}

// Exit code mengikuti yang MERAH saja. Yang dilewati tak menghijaukan maupun
// memerahkan — ia bukan hasil pemeriksaan.
if (hasil.merah.length) process.exitCode = 1

if (hasil.hilang.length) console.log('⚠ tak ketemu di 3 akar:', hasil.hilang.join(', '))
