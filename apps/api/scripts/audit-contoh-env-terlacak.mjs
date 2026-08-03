#!/usr/bin/env node
// ============================================================================
// PENJAGA — setiap `.env.example` WAJIB ter-track git.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `apps/web/.gitignore` berisi `.env*`. Pola itu benar untuk `.env.local`,
// tetapi ia juga menelan `.env.example` — dan hasilnya adalah kegagalan yang
// TAK TERLIHAT dari mesin siapa pun yang sudah punya berkasnya:
//
//   • Di mesin pengembang lama: berkasnya ADA (tertinggal sejak dulu). Semua
//     hijau. Tak ada gejala sedikit pun.
//   • Di klon bersih: berkasnya TIDAK ADA. Orang baru tak punya petunjuk
//     konfigurasi apa pun, dan `pnpm bootstrap` mati dengan ENOENT mentah.
//
// Ini kelas cacat yang sama dengan yang berulang kali muncul di repo ini:
// benar di lingkungan yang sudah berjalan, rusak di lingkungan bersih.
// Ditemukan 2026-08-03 hanya karena F1-5 mengharuskan waktu klon→siap
// DIUKUR pada klon sungguhan, bukan diperkirakan.
//
// Penjaga ini bertanya pada GIT, bukan pada filesystem — karena justru
// filesystem-lah yang berbohong dalam kasus ini.
// ============================================================================

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// Setiap berkas contoh yang HARUS sampai ke tangan orang yang mengklon.
const WAJIB = ['apps/api/.env.example', 'apps/web/.env.example']

let gagal = 0
for (const p of WAJIB) {
  const adaDiDisk = existsSync(resolve(ROOT, p))
  let terlacak = true
  try {
    execSync(`git ls-files --error-unmatch "${p}"`, { cwd: ROOT, stdio: 'ignore' })
  } catch {
    terlacak = false
  }

  if (terlacak) {
    console.log(`  ✅ ${p}`)
  } else {
    gagal++
    console.error(`  ❌ ${p} — TIDAK ter-track git`)
    console.error(
      adaDiDisk
        ? '     Ada di disk ini, jadi tak bergejala lokal — tapi HILANG di klon bersih.'
        : '     Tidak ada sama sekali.',
    )
    try {
      const aturan = execSync(`git check-ignore -v "${p}"`, { cwd: ROOT, encoding: 'utf8' }).trim()
      console.error(`     Diabaikan oleh: ${aturan}`)
      console.error(`     Perbaiki dengan menambah pengecualian: !.env.example`)
    } catch {
      console.error(`     Tidak diabaikan .gitignore — cukup: git add ${p}`)
    }
  }
}

if (gagal) {
  console.error(`\n❌ ${gagal} berkas contoh env tak akan sampai ke orang yang mengklon repo ini.`)
  process.exit(1)
}
console.log(`\n✅ ${WAJIB.length} berkas contoh env ter-track — klon bersih akan menerimanya.`)
