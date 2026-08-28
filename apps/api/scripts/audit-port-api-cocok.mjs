#!/usr/bin/env node
/**
 * PENJAGA — port API yang dilayani wajib sama dengan yang dituju web.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * CLAUDE.md §7 mencatat empat jam habis pada 2026-08-10 mengejar gejala
 * "Not Found" di obrolan asisten: API di 3001 sehat dan rutenya ada, tetapi
 * web bicara ke instance LAIN di 3007 yang menjalankan kode lama.
 *
 * **Terulang 2026-08-16**, dengan nilai yang sama persis: `.env` 3001,
 * `NEXT_PUBLIC_API_URL` 3007.
 *
 * ── Dan alat ukur saya sendiri berbohong saat memeriksanya
 *
 * `grep -E "^PORT" apps/api/.env` memulangkan NOL, dan saya menyimpulkan
 * barisnya tak ada — lalu menulis di dua tempat bahwa CLAUDE.md basi soal ini.
 * Keduanya salah. `PORT=3001` ada sejak awal.
 *
 * Sebabnya: `.env` berakhiran **CR saja** (bukan CRLF maupun LF), sehingga
 * grep melihat seluruh berkas sebagai SATU baris raksasa dan jangkar `^` tak
 * pernah cocok setelah baris pertama.
 *
 * Pelajarannya melampaui port: **alat ukur pun punya cara gagal sendiri, dan
 * nol hasil bukan bukti ketiadaan.** Penjaga ini karenanya membaca `.env`
 * dengan parser yang menangani BOM, kutip, DAN ketiga jenis akhiran baris —
 * bukan dengan grep.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TAK ADA GALAT SATU PUN SAAT INI TERJADI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap lapisan menjawab benar untuk dirinya sendiri:
 *
 *   API di 3001   → 200 untuk tiap rute yang dimilikinya
 *   Web ke 3007   → 404/ECONNREFUSED, dan menampilkannya sebagai galat biasa
 *   .env          → sah, cuma tak menyebut PORT
 *
 * Tak ada satu pun yang menunjuk ketidakcocokannya. Itu sebabnya ia butuh
 * penjaga, bukan komentar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * AMBANG NOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tak ada nilai parsial: dua port yang berbeda berarti aplikasi tak jalan,
 * atau lebih buruk — jalan dengan kode yang salah.
 *
 * ⚠ Penjaga ini membaca `.env` yang TIDAK ikut ter-commit, jadi di CI ia
 * memeriksa `.env.example`. Itu justru yang diinginkan: contoh yang tak
 * konsisten adalah cara jebakan ini menyebar ke mesin berikutnya.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Bawaan di `src/index.ts` — DIBACA, bukan diingat. */
function bawaanKode() {
  const isi = readFileSync(join(AKAR_REPO, 'apps/api/src/index.ts'), 'utf8')
  const m = isi.match(/const\s+PORT\s*=\s*Number\(process\.env\.PORT\)\s*\|\|\s*(\d+)/)
  return m ? Number(m[1]) : null
}

/*
  `.env` diawali BOM dan nilainya kadang dibungkus kutip (CLAUDE.md §7).
  Parser yang tak melucuti keduanya menghasilkan nilai yang "terbaca" tetapi
  tak pernah cocok — persis kelas kegagalan yang penjaga ini kejar.
*/
function bacaEnv(jalur) {
  if (!existsSync(jalur)) return null
  let isi = readFileSync(jalur, 'utf8')
  if (isi.charCodeAt(0) === 0xfeff) isi = isi.slice(1)
  const hasil = {}
  /*
    Ketiga jenis akhiran baris — CRLF, LF, DAN CR-saja.

    `\r?\n` (bentuk yang lazim, dan yang saya tulis pertama) TIDAK memisah
    berkas berakhiran CR-saja: ia jadi satu baris raksasa, dan hanya pasangan
    pertama yang terbaca. Persis cara `grep -E "^PORT"` berbohong kepada saya
    pada 2026-08-16 — lihat komentar kepala berkas.
  */
  for (const baris of isi.split(/\r\n|\r|\n/)) {
    const t = baris.trim()
    if (!t || t.startsWith('#')) continue
    const p = t.indexOf('=')
    if (p < 0) continue
    let v = t.slice(p + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    hasil[t.slice(0, p).trim()] = v
  }
  return hasil
}

function portDariUrl(url) {
  if (!url) return null
  const m = url.match(/:(\d{2,5})(?:\/|$)/)
  if (m) return Number(m[1])
  // URL tanpa port eksplisit — http = 80, https = 443.
  if (/^https:/i.test(url)) return 443
  if (/^http:/i.test(url)) return 80
  return null
}

const bawaan = bawaanKode()
const masalah = []

const PASANGAN = [
  {
    label: 'nyata (.env)',
    api: join(AKAR_REPO, 'apps/api/.env'),
    web: join(AKAR_REPO, 'apps/web/.env.local'),
    mobile: join(AKAR_REPO, 'apps/mobile/.env'),
    /*
      Berkas nyata tak ikut ter-commit, jadi ketidakhadirannya di CI WAJAR dan
      bukan pelanggaran. Yang tak wajar: ada tetapi tak cocok.
    */
    wajibAda: false,
  },
  {
    label: 'contoh (.env.example)',
    api: join(AKAR_REPO, 'apps/api/.env.example'),
    web: join(AKAR_REPO, 'apps/web/.env.example'),
    mobile: join(AKAR_REPO, 'apps/mobile/.env.example'),
    // Contoh WAJIB ada dan WAJIB konsisten — dari sinilah mesin berikutnya
    // menyalin, dan contoh yang tak konsisten menyebarkan jebakannya.
    wajibAda: true,
  },
]

console.log('══ Port API yang dilayani vs yang dituju web & mobile ══════')
console.log(`  bawaan di src/index.ts : ${bawaan ?? '(tak terbaca)'}`)

if (bawaan === null) {
  masalah.push(
    'Bawaan PORT tak terbaca dari src/index.ts — bentuk `Number(process.env.PORT) || N` berubah.\n'
    + '     Penjaga ini kehilangan acuannya; perbarui polanya.',
  )
}

for (const p of PASANGAN) {
  const envApi = bacaEnv(p.api)
  const envWeb = bacaEnv(p.web)

  if (!envApi || !envWeb) {
    if (p.wajibAda) {
      masalah.push(`${p.label}: berkas contoh tak ada — mesin berikutnya menyalin dari mana?`)
    } else {
      console.log(`  ${p.label.padEnd(22)}: dilewati (berkas tak ada — wajar di CI)`)
    }
    continue
  }

  const portApi = envApi.PORT ? Number(envApi.PORT) : bawaan
  const sumberApi = envApi.PORT ? 'PORT di .env' : `BAWAAN kode (${bawaan}) — PORT tak ditulis`
  const portWeb = portDariUrl(envWeb.NEXT_PUBLIC_API_URL)

  const cocok = portApi !== null && portApi === portWeb
  console.log(
    `  ${p.label.padEnd(22)}: api ${String(portApi).padEnd(5)} (${sumberApi})`
    + `  ·  web ${portWeb}  ${cocok ? '✓' : '✗'}`,
  )

  if (!cocok) {
    masalah.push(
      `${p.label}: API melayani ${portApi} tetapi web menuju ${portWeb}.\n`
      + `     Sumber nilai API: ${sumberApi}\n`
      + `     Web: NEXT_PUBLIC_API_URL=${envWeb.NEXT_PUBLIC_API_URL}`,
    )
  }

  /*
    ── MOBILE ikut diperiksa (ditambahkan 2026-08-27)

    Penjaga ini semula hanya membandingkan api↔web, dan `apps/mobile/.env`
    lolos begitu saja. Diukur hari itu: mobile menunjuk **3001** sementara
    API melayani **3007** — persis jebakan yang berkas ini dibuat untuk
    mencegah, hanya di aplikasi yang tak ia lihat.

    Gejalanya di HP lebih buruk daripada di web: tak ada konsol peramban
    untuk melihat 404-nya. Yang terlihat pengguna hanya layar yang tak
    pernah selesai memuat.
  */
  const envMobile = bacaEnv(p.mobile)
  if (envMobile) {
    const urlMobile = envMobile.EXPO_PUBLIC_API_URL ?? ''
    const portMobile = portDariUrl(urlMobile)
    const cocokMobile = portApi !== null && portApi === portMobile
    console.log(
      `  ${'  └ mobile'.padEnd(22)}: ${urlMobile || '(kosong)'}`
      + `  ${cocokMobile ? '✓' : '✗'}`,
    )
    if (!cocokMobile) {
      masalah.push(
        `${p.label} (mobile): API melayani ${portApi} tetapi mobile menuju ${portMobile}.\n`
        + `     EXPO_PUBLIC_API_URL=${urlMobile}`,
      )
    }

    /*
      `localhost` di aplikasi HP TIDAK PERNAH benar — ia menunjuk ponselnya
      sendiri, bukan komputer yang melayani API. Berbeda dari web, yang
      berjalan di peramban komputer yang sama.

      Ini kesalahan yang tak berbunyi: aplikasi terpasang, login gagal, dan
      tak ada pesan yang menyebut alamat.
    */
    if (/\/\/(localhost|127\.0\.0\.1)/.test(urlMobile)) {
      masalah.push(
        `${p.label} (mobile): EXPO_PUBLIC_API_URL menunjuk localhost.\n`
        + `     HP tak bisa menjangkau localhost komputer — pakai alamat LAN\n`
        + `     (mis. http://192.168.x.x:PORT) atau host yang benar-benar terjangkau.\n`
        + `     Nilai sekarang: ${urlMobile}`,
      )
    }
  } else if (p.wajibAda) {
    masalah.push(`${p.label}: apps/mobile/.env.example tak ada — mesin berikutnya menyalin dari mana?`)
  }

  /*
    PORT yang tak ditulis eksplisit DITANDAI meski kebetulan cocok.

    Justru itu bentuk jebakan aslinya: `.env` tanpa `PORT` terlihat sah, dan
    nilainya datang dari tempat yang tak dilihat siapa pun saat membandingkan
    dua berkas env.
  */
  if (!envApi.PORT) {
    masalah.push(
      `${p.label}: PORT tidak ditulis di ${p.api.replace(AKAR_REPO, '.')} — nilainya\n`
      + `     datang dari bawaan kode. Tulis eksplisit, sekalipun nilainya sama.`,
    )
  }
}

if (masalah.length > 0) {
  console.error('')
  console.error('❌ Port API tak konsisten:')
  console.error('')
  for (const m of masalah) console.error(`   · ${m}\n`)
  console.error('   Kenapa ini ditegakkan: tak ada satu pun galat yang menunjuk')
  console.error('   ketidakcocokan ini. API menjawab 200 untuk dirinya sendiri,')
  console.error('   web menampilkan 404 sebagai galat biasa, dan `.env` sah-sah')
  console.error('   saja. Empat jam habis karenanya pada 2026-08-10, dan ia')
  console.error('   terulang pada 2026-08-16.')
  process.exit(1)
}

console.log('')
console.log('✅ Port API dan tujuan web cocok, dan ditulis eksplisit.')
