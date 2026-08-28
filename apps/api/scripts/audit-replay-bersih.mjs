/**
 * PENJAGA: tiap migrasi HARUS benar-benar jalan di lingkungan baru.
 *
 * ── Kenapa penjaga ini ada
 *
 * `ci-project-setup.mjs` (baris 57-58) memakai PREFIKS ANGKA sebagai `version`,
 * dan `version` adalah PRIMARY KEY di `supabase_migrations.schema_migrations`.
 * Jadi kalau dua berkas berbagi nomor, yang kedua melihat versinya SUDAH ADA
 * lalu dilewati — tanpa satu pun galat, di setiap lingkungan baru selamanya.
 *
 * Diukur 2026-08-29 sebelum diperbaiki: 493 berkas, 13 DILEWATI SENYAP —
 * seluruh modul struktur (baja CNP/INP, sloof-tangga, balok T, pondasi
 * dinding, komposit atap, riwayat, sambungan ringan), take-off sektor,
 * take-off dimensional, mitra, impor pemasok, dan tujuh otomasi bertenggat.
 *
 * Di basis pengembangan semuanya tampak baik-baik saja karena tabelnya sudah
 * terlanjur ada. Yang rusak adalah SERVER BARU — dan itu justru yang dipakai
 * saat deploy. Kelas cacat yang sama dengan P0 047 vs 167.
 *
 * ── Kenapa TAK menyentuh basis
 *
 * Ia cuma perlu tahu apa yang AKAN terjadi, bukan apa yang sudah terjadi.
 * Karena itu ia jalan di CI tanpa kredensial apa pun, dan tak bisa merusak
 * apa pun saat dijalankan siapa pun.
 */
import { readdirSync } from 'fs'
import { MIGRATIONS_DIR } from '../../../scripts/db/_koneksi.mjs'

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
const buku = new Set()
const dijalankan = []
const DILEWATI = []

for (const f of files) {
  const m = f.match(/^(\d+)_/)
  if (!m) continue
  const version = m[1]
  if (buku.has(version)) {
    DILEWATI.push({ f, version, oleh: dijalankan.find((x) => x.version === version).f })
    continue
  }
  buku.add(version)
  dijalankan.push({ f, version })
}

console.log(`\n══ SIMULASI REPLAY DI BASIS KOSONG ═══════════════════════════`)
console.log(`  berkas migrasi   : ${files.length}`)
console.log(`  akan dijalankan  : ${dijalankan.length}`)
console.log(`  DILEWATI SENYAP  : ${DILEWATI.length}`)
console.log(`══════════════════════════════════════════════════════════════\n`)

for (const d of DILEWATI) {
  console.log(`  ✘ ${d.f}`)
  console.log(`      nomor ${d.version} sudah diklaim ${d.oleh} — TAK PERNAH JALAN`)
}

process.exit(DILEWATI.length ? 1 : 0)
