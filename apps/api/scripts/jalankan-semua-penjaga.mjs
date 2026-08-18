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
const KANDIDAT_CWD = ['.', 'apps/api', 'apps/web']

const perintah = new Set()
for (const m of yml.matchAll(/node\s+(-r\s+\S+\s+)?((?:\.\.\/)?[\w./-]+\.mjs)([^\n]*)/g)) {
  perintah.add(JSON.stringify({
    preload: (m[1] ?? '').trim(),
    skrip: m[2],
    argv: (m[3] ?? '').trim().replace(/[|>].*$/, '').trim(),
  }))
}

const hasil = { hijau: [], merah: [], hilang: [] }

for (const p of [...perintah].map((x) => JSON.parse(x))) {
  // Cari di mana berkasnya BENAR-BENAR ada, jangan tebak satu cwd.
  let dir = null
  for (const c of KANDIDAT_CWD) {
    if (existsSync(resolve(AKAR, c, p.skrip))) { dir = resolve(AKAR, c); break }
  }
  if (!dir) { hasil.hilang.push(p.skrip); continue }

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

console.log(`\n══ PENJAGA CI: ${hasil.hijau.length} hijau · ${hasil.merah.length} MERAH · ${hasil.hilang.length} tak ketemu\n`)
for (const m of hasil.merah) console.log(`❌ ${m.skrip}\n   ${m.pesan}\n`)
if (hasil.hilang.length) console.log('⚠ tak ketemu di 3 akar:', hasil.hilang.join(', '))
