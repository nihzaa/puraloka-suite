#!/usr/bin/env node
/**
 * PENJAGA — MIGRASI YANG IKUT DEPLOY TAPI TAK PERNAH DIJALANKAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — lubang yang tercatat terbuka, lalu dialami sendiri
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `infra/perbarui-vps.sh` melakukan: tarik → build → tunggu sehat →
 * buktikan. **Tak ada langkah migrasi sama sekali.**
 *
 * JOURNAL 2026-09-05 mencatatnya sebagai "yang TETAP belum ditutup":
 * rantai 376→543 ada di basis karena dijalankan MANUAL, bukan hasil deploy.
 *
 * Dan 2026-09-11 ia menggigit lagi — migrasi 568 harus diterapkan tangan.
 *
 * ── KENAPA TAK ADA GEJALA
 *
 * Deploy tetap HIJAU seluruhnya. Container sehat, `/health` 200, semua
 * situs 200. Yang gagal hanya kode yang menyentuh kolom baru — dan itu
 * baru terjadi saat ada yang membuka halamannya, dengan galat yang menuduh
 * KODE ("column does not exist"), bukan deploy yang melewatkan langkah.
 *
 * Jaraknya bisa berhari-hari, dan pada saat itu tak seorang pun
 * menghubungkannya dengan pembaruan yang sudah lama dinyatakan berhasil.
 *
 * ── KENAPA MELAPOR, BUKAN MENJALANKAN
 *
 * Keputusan sadar. Migrasi yang berjalan sendiri di produksi berarti satu
 * `git pull` bisa mengubah schema tanpa seorang pun menekan apa pun — dan
 * CHARTER menaruh buku migrasi di Gerbang Keras G-2 justru karena taruhannya
 * setinggi itu. RATIFIKASI R-024 mencatat rantai ini pernah rusak dan baru
 * ketahuan saat CI memutarnya dari nol.
 *
 * Yang ditutup penjaga ini bukan "migrasi tak berjalan" — melainkan
 * "migrasi tak berjalan TANPA ADA YANG TAHU". Itu beda yang menentukan:
 * pekerjaan manual yang terlihat masih bisa dikerjakan; yang tak terlihat
 * tidak.
 *
 * ── AMBANG NOL, tetapi TIDAK menggagalkan deploy
 *
 * Exit 1 di sini akan menggagalkan deploy yang SUDAH berhasil — container
 * hidup, situs melayani. Menyuruh operator mengulang deploy tak memperbaiki
 * apa pun, dan kegagalan yang tak bisa ditindaklanjuti mengajari orang
 * mengabaikan langkah verifikasi (pelajaran yang sama sudah tertulis di
 * `perbarui-vps.sh` langkah 5).
 *
 * Jadi: exit 0 dengan LAPORAN yang menyebut nomor migrasinya dan perintah
 * persis untuk menerapkannya. `--tegas` menaikkannya jadi exit 1, untuk
 * dipakai CI atau operator yang ingin gerbang keras.
 */
import { readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DIR_MIGRASI = join(AKAR_REPO, 'db', 'migrations')
const TEGAS = process.argv.includes('--tegas')

/*
  ⚠ `.env` dibaca dengan parser, bukan grep.

  Berkas `.env` di repo ini diawali BOM, nilainya berkutip, dan salah satunya
  pernah berakhiran CR SAJA — yang membuat `grep -E "^PORT"` memulangkan NOL
  pada berkas yang jelas memuat barisnya. Nol hasil bukan bukti ketiadaan
  (CLAUDE.md §7).
*/
function bacaEnv(p) {
  if (!existsSync(p)) return {}
  const { readFileSync } = createRequire(import.meta.url)('node:fs')
  return Object.fromEntries(
    readFileSync(p, 'utf8')
      .replace(/^﻿/, '')
      .split(/\r\n|\r|\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

const env = {
  ...bacaEnv(join(AKAR_REPO, '.env')),
  ...bacaEnv(join(AKAR_REPO, 'apps', 'api', '.env')),
  ...process.env,
}
const dsn = env.DIRECT_URL || env.DATABASE_URL

if (!existsSync(DIR_MIGRASI)) {
  console.log('⏭  migrasi tertinggal: DILEWATI (db/migrations tak ada)')
  process.exit(0)
}
if (!dsn) {
  console.log('⏭  migrasi tertinggal: DILEWATI (tak ada DIRECT_URL/DATABASE_URL)')
  process.exit(0)
}

const diDisk = readdirSync(DIR_MIGRASI)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .map((f) => ({ versi: String(parseInt(f, 10)), nama: f }))
  .sort((a, b) => Number(a.versi) - Number(b.versi))

const require = createRequire(import.meta.url)
const { Client } = require('pg')
const c = new Client({ connectionString: dsn })

let keluar = 0
try {
  await c.connect()

  const { rows } = await c.query(
    `SELECT version FROM supabase_migrations.schema_migrations`)
  const tercatat = new Set(rows.map((r) => String(parseInt(r.version, 10))))

  const belum = diDisk.filter((m) => !tercatat.has(m.versi))

  console.log('══ Migrasi: berkas vs buku ════════════════════════════════════')
  console.log(`  berkas di db/migrations : ${diDisk.length}`)
  console.log(`  tercatat di buku        : ${tercatat.size}`)
  console.log(`  BELUM dijalankan        : ${belum.length}`)

  if (belum.length === 0) {
    console.log('\n✅ Tiap migrasi di repo sudah tercatat dijalankan.')
  } else {
    console.log('\n⚠  MIGRASI IKUT TER-DEPLOY TETAPI BELUM DIJALANKAN:\n')
    for (const m of belum) console.log(`     ${m.nama}`)
    console.log(`
   Deploy ini TIDAK menjalankan migrasi — itu memang perilakunya, dan
   disengaja (buku migrasi ada di Gerbang Keras G-2).

   Yang berbahaya bukan pekerjaan manualnya, melainkan diamnya: container
   sehat, /health 200, semua situs 200 — dan kode yang menyentuh kolom baru
   gagal berhari-hari kemudian dengan galat yang menuduh KODE.

   Terapkan, lalu jalankan ulang penjaga ini:

       cd ${AKAR_REPO}
       # tiap berkas, di dalam transaksi, lalu catat ke buku migrasi
       node scripts/db/ledger-diff.mjs      # verdict yang bisa dipercaya`)
    if (TEGAS) keluar = 1
  }

  /*
    Arah sebaliknya — tercatat di buku tapi berkasnya TAK ADA.

    Ini kelas cacat G-2 yang berbeda dan lebih berbahaya: entri palsu berarti
    migrasi dilewati SENYAP selamanya di basis baru. Diukur 2026-09-11 pada
    branch deploy: `567_ci_seed_penanda` tercatat, tabelnya ada di schema,
    berkasnya tak ada di pohon kerja — ternyata belum ter-merge dari worktree
    lain.
  */
  const namaDisk = new Set(diDisk.map((m) => m.versi))
  const hantu = [...tercatat].filter((v) => !namaDisk.has(v))
  if (hantu.length > 0) {
    console.log(`\n⚠  Tercatat di buku tetapi BERKASNYA TAK ADA: ${hantu.join(', ')}`)
    console.log('   Di basis baru migrasi ini TIDAK akan pernah berjalan, dan')
    console.log('   ketiadaannya tak menimbulkan galat apa pun. Periksa apakah')
    console.log('   berkasnya ada di worktree/branch yang belum ter-merge.')
    if (TEGAS) keluar = 1
  }
} catch (e) {
  console.log(`⏭  migrasi tertinggal: DILEWATI (${e.message})`)
} finally {
  await c.end().catch(() => {})
}

process.exit(keluar)
