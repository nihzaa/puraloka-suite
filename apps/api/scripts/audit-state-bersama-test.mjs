#!/usr/bin/env node
/**
 * PENJAGA STATE BERSAMA DI TEST — nama tetap yang dihapus di setup.
 *
 * ── Bug yang melahirkannya
 *
 * `notification-rules.test.ts` memakai `TEST_EVENT = '__test_event__'`
 * — string TETAP — lalu `beforeAll` menjalankan:
 *
 *     DELETE FROM notification_rules WHERE event_type = $1
 *     INSERT INTO notification_rules (...) VALUES (..., $1, ...)
 *
 * CI menjalankan ENAM SHARD PARALEL terhadap satu database. Shard yang
 * satu menghapus aturan yang sedang dipakai shard lain, dan yang kalah
 * balapan mendapat 403 atau 404 dari endpoint yang seharusnya
 * melayaninya.
 *
 * Gejalanya menyesatkan justru karena galatnya masuk akal: "expected 403
 * to be 200" terbaca sebagai bug permission, bukan sebagai state yang
 * dihapus orang lain. Dan test yang merah BERPINDAH tiap jalan, jadi
 * mudah sekali disimpulkan "CI-nya rewel" lalu di-retry sampai hijau.
 *
 * `approval-chains.test.ts` punya pola yang persis sama — bom waktu yang
 * belum meledak.
 *
 * ── Perbaikannya
 *
 *     const TEST_EVENT = `__test_event_${process.pid}__`
 *
 * Tiap shard proses terpisah, jadi `afterAll` hanya menghapus miliknya
 * sendiri.
 *
 * ── Yang dicari penjaga ini
 *
 * Konstanta berawalan `TEST_` atau `UJI_` yang nilainya literal tetap DAN
 * dipakai di `DELETE FROM` pada berkas yang sama. Dua-duanya harus ada:
 * nama tetap yang cuma dibaca tidak berbahaya, dan DELETE dengan nama
 * unik juga tidak.
 *
 * Pakai: node scripts/audit-state-bersama-test.mjs
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const berkas = execSync('grep -rl "DELETE FROM" src --include=*.test.ts || true', {
  encoding: 'utf8',
}).trim().split('\n').filter(Boolean)

const temuan = []

for (const f of berkas) {
  const teks = readFileSync(f, 'utf8')
  const baris = teks.split(/\r?\n/)

  for (let i = 0; i < baris.length; i++) {
    // `const TEST_X = '...'` atau `const UJI_X = "..."` — literal tetap.
    const m = baris[i].match(/^\s*const\s+((?:TEST|UJI)_\w+)\s*=\s*['"]([^'"]+)['"]/)
    if (!m) continue
    const [, nama] = m

    // Dipakai di DELETE? Kalau tidak, nama tetap tak berbahaya.
    const dipakaiDiDelete = new RegExp(
      `DELETE FROM[\\s\\S]{0,160}\\[\\s*${nama}\\b|DELETE FROM[^\\n]*\\$\\{${nama}\\}`,
    ).test(teks)
    if (!dipakaiDiDelete) continue

    temuan.push({ di: `${f}:${i + 1}`, nama, isi: baris[i].trim().slice(0, 84) })
  }
}

if (temuan.length) {
  console.error(`\n❌ ${temuan.length} konstanta uji bernama TETAP yang dihapus di setup.\n`)
  console.error('   Enam shard CI berbagi satu database. Nama tetap membuat shard')
  console.error('   saling menghapus state masing-masing, dan yang kalah balapan')
  console.error('   gagal dengan galat yang MENYAMAR sebagai bug permission')
  console.error('   ("expected 403 to be 200") — bukan sebagai state yang hilang.\n')
  console.error('   Perbaikan:  const TEST_X = `__test_x_${process.pid}__`\n')
  for (const t of temuan) console.error(`   ${t.di}\n      ${t.isi}\n`)
  process.exit(1)
}

console.log(`✅ State bersama uji: nol nama tetap yang dihapus di setup (${berkas.length} berkas dipindai)`)
