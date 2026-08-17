#!/usr/bin/env node
/**
 * PENJAGA KEGAGALAN SENYAP — `.data ?? []` tanpa memeriksa `error`.
 *
 * ── Kenapa ada
 *
 * 2026-08-01, `kurva-s.ts` ketahuan **kehilangan Rp 631,7 juta** dari AC selama
 * berbulan-bulan. Sebabnya bukan salah rumus: query-nya menyeleksi kolom
 * `amount` yang tak ada (kolomnya `total_amount`). PostgREST membalas error,
 * `data` jadi `null`, dan baris berikutnya menuliskannya begini:
 *
 *     for (const e of (expenseRes.data ?? [])) { … }
 *
 * `?? []` mengubah **KEGAGALAN** menjadi **HASIL KOSONG YANG TERLIHAT SAH.**
 * Tak ada error dilempar, tak ada log, tak ada gejala. Laporan tetap terbit,
 * angkanya saja yang salah — dan salah ke arah yang paling berbahaya: biaya
 * terlihat lebih kecil, sehingga proyek boros terlihat sehat.
 *
 * ── Yang diperiksa
 *
 * Destructuring `{ data }` TANPA `error` dari hasil query Supabase, lalu
 * dipakai dengan `?? []`. Kalau `error` ikut di-destructure, penulisnya
 * setidaknya PUNYA cara tahu — itu sudah cukup untuk keluar dari daftar ini.
 *
 * ── Kenapa ratchet, bukan larangan
 *
 * 116 pemakaian `?? []` tersebar di 9 modul. Sebagian besar aman (query
 * sederhana yang tak pernah gagal), dan memaksa semuanya sekarang = perubahan
 * besar tanpa uji. Yang dijaga: **jumlahnya tak boleh naik.** Kode baru harus
 * memeriksa `error`.
 *
 * Jalankan: node apps/api/scripts/audit-kegagalan-senyap.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = join(import.meta.dirname, '..', 'src', 'routes', 'v1')

/**
 * Ambang. HANYA BOLEH TURUN.
 *
 * Kalau CI merah karena angka ini naik, artinya ada query baru yang
 * kegagalannya bisa menyamar jadi "nol baris" — perbaiki kodenya dengan
 * memeriksa `error`, JANGAN naikkan ambangnya.
 */
const AMBANG = 185

function berkasRute(dir) {
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      hasil.push(...berkasRute(join(dir, e.name)))
    } else if (e.name.endsWith('.ts')) {
      hasil.push(join(dir, e.name))
    }
  }
  return hasil
}

const temuan = []

for (const f of berkasRute(AKAR)) {
  const isi = readFileSync(f, 'utf8')
  const baris = isi.split('\n')

  // Kumpulkan nama variabel yang di-destructure TANPA error.
  // `const { data: x } = await …`  → x rawan
  // `const { data: x, error } = …` → x aman (penulisnya punya cara tahu)
  const rawan = new Set()
  for (const m of isi.matchAll(/const\s*\{([^}]*)\}\s*=\s*await/g)) {
    const isiKurung = m[1]
    if (/\berror\b/.test(isiKurung)) continue
    for (const d of isiKurung.matchAll(/\bdata\s*:\s*(\w+)/g)) rawan.add(d[1])
  }

  baris.forEach((b, i) => {
    // `x.data ?? []` di mana x hasil query yang error-nya tak pernah dilihat.
    for (const m of b.matchAll(/(\w+)\.data\s*\?\?\s*\[\]/g)) {
      const v = m[1]
      // Variabel hasil `await Promise.all([...])` — error-nya ada di
      // `v.error` dan hanya aman bila benar-benar diperiksa di berkas ini.
      const diperiksa = new RegExp(`${v}\\.error`).test(isi)
      if (!diperiksa) {
        temuan.push({
          berkas: f.split(/[\\/]/).slice(-1)[0],
          baris: i + 1,
          variabel: v,
          kode: b.trim().slice(0, 92),
        })
      }
    }
    // Bentuk kedua: variabel hasil destructuring tanpa error, dipakai `?? []`.
    for (const m of b.matchAll(/\b(\w+)\s*\?\?\s*\[\]/g)) {
      if (rawan.has(m[1])) {
        temuan.push({
          berkas: f.split(/[\\/]/).slice(-1)[0],
          baris: i + 1,
          variabel: m[1],
          kode: b.trim().slice(0, 92),
        })
      }
    }
  })
}

const perBerkas = new Map()
for (const t of temuan) perBerkas.set(t.berkas, (perBerkas.get(t.berkas) ?? 0) + 1)

console.log(`Kegagalan yang bisa menyamar jadi "nol baris": ${temuan.length} (ambang ${AMBANG})`)
console.log('\nSebaran per berkas:')
for (const [b, n] of [...perBerkas.entries()].sort((a, b2) => b2[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${b}`)
}

if (temuan.length > AMBANG) {
  console.error(`\n❌ RATCHET GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   Query baru yang kegagalannya bisa menyamar jadi "nol baris":\n')
  temuan.slice(-12).forEach((t) => {
    console.error(`   ${t.berkas}:${t.baris}  ${t.kode}`)
  })
  console.error(
    '\n   Perbaiki dengan memeriksa `error` — bukan dengan menaikkan ambang:\n' +
    '     const { data, error } = await …\n' +
    '     if (error) { request.log.error({ err: error }, "…"); return reply.status(500)… }\n\n' +
    '   Kenapa ini ditegakkan: kurva-s.ts kehilangan Rp 631,7 juta dari AC selama\n' +
    '   berbulan-bulan karena `.select(\'amount\')` (kolomnya `total_amount`) gagal,\n' +
    '   lalu `?? []` mengubah kegagalan itu jadi nol baris yang terlihat sah.\n' +
    '   Tak ada error, tak ada log, tak ada gejala — hanya CPI yang terlalu optimis.\n',
  )
  process.exit(1)
}

console.log(`\n✅ Kegagalan senyap: ${temuan.length}/${AMBANG} — tidak bertambah.`)
