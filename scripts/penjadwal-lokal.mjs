#!/usr/bin/env node
// ============================================================================
// PENJADWAL LOKAL — denyut yang selama ini tak pernah ada
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `POST /api/v1/jadwal/jalankan` sudah ada sejak lama, lengkap dengan
// pemilihan tugas jatuh tempo, klaim atomik, dan pencatatan hasil. Komentarnya
// berbunyi "Dipanggil cron."
//
// Diukur 2026-08-16: **tak ada satu pun cron, skrip, atau workflow yang
// memanggilnya.** Delapan belas tugas terjadwal, dan lima belas di antaranya
// nol eksekusi seumur hidup.
//
// Selama dua hari saya menulis sebabnya "menunggu deploy / SCHEDULER_URL".
// `SCHEDULER_URL` ternyata tidak dipakai satu baris kode pun — ia hanya muncul
// sebagai kalimat di skrip laporan buatan saya sendiri. Yang sesungguhnya
// hilang cuma ini: sesuatu yang berdetak.
//
// ── Kenapa Node, bukan Task Scheduler Windows atau n8n
//
// Ketiganya bisa. Yang ini dipilih karena tiga alasan terukur:
//
//   · Task Scheduler Windows menyimpan konfigurasinya di luar repo — tak ikut
//     ter-commit, tak terlihat di diff, dan mesin berikutnya mulai dari nol.
//   · n8n Puraloka (:5680) memang tujuan akhirnya, tetapi ia harus hidup
//     lebih dulu, dan sedang tidak hidup. Menjadikannya prasyarat berarti
//     delapan belas tugas menunggu satu proses lain.
//   · Berkas ini ikut repo, terbaca, dan bisa dijalankan siapa pun yang
//     sudah bisa menjalankan API-nya.
//
// n8n TETAP arah akhirnya untuk produksi. Ini bukan penggantinya melainkan
// yang membuat jalurnya bisa diuji hari ini, di mesin ini, tanpa deploy.
//
// ── Yang TIDAK dilakukan berkas ini
//
// Ia tak memutuskan tugas mana yang jatuh tempo — itu urusan endpoint-nya,
// dan menduplikasinya di sini berarti dua sumber untuk satu keputusan. Ia
// hanya berdetak dan melaporkan.
//
// Pakai:
//     node scripts/penjadwal-lokal.mjs                  # denyut 15 menit
//     node scripts/penjadwal-lokal.mjs --sekali         # satu kali, lalu keluar
//     node scripts/penjadwal-lokal.mjs --menit 5        # denyut lain
//     node scripts/penjadwal-lokal.mjs --sekali --paksa kasbon-outstanding
// ============================================================================

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')

/*
  `.env` dibaca dengan pelucut BOM dan tanda kutip.

  CLAUDE.md §7 menyebutnya jebakan yang sudah memakan waktu: berkas `.env` di
  repo ini diawali BOM dan nilainya dibungkus kutip. Parser buatan sendiri yang
  tak melucuti keduanya menghasilkan rahasia yang "terisi" tetapi tak pernah
  cocok — 401 yang terbaca seperti salah sandi.
*/
function bacaEnv(jalur) {
  let isi
  try {
    isi = readFileSync(jalur, 'utf8')
  } catch {
    return {}
  }
  if (isi.charCodeAt(0) === 0xfeff) isi = isi.slice(1)

  const hasil = {}
  for (const baris of isi.split(/\r?\n/)) {
    const t = baris.trim()
    if (!t || t.startsWith('#')) continue
    const p = t.indexOf('=')
    if (p < 0) continue
    const kunci = t.slice(0, p).trim()
    let nilai = t.slice(p + 1).trim()
    if (
      (nilai.startsWith('"') && nilai.endsWith('"')) ||
      (nilai.startsWith("'") && nilai.endsWith("'"))
    ) {
      nilai = nilai.slice(1, -1)
    }
    hasil[kunci] = nilai
  }
  return hasil
}

const env = { ...bacaEnv(join(AKAR, 'apps/api/.env')), ...process.env }

const arg = process.argv.slice(2)
const sekali = arg.includes('--sekali')
const iMenit = arg.indexOf('--menit')
const MENIT = iMenit >= 0 ? Number(arg[iMenit + 1]) : 15
const iPaksa = arg.indexOf('--paksa')
const paksa = iPaksa >= 0 ? arg[iPaksa + 1] : null

const RAHASIA = (env.SCHEDULER_SECRET ?? '').trim()
if (!RAHASIA) {
  console.error('✗ SCHEDULER_SECRET kosong di apps/api/.env — endpoint akan menolak 503.')
  process.exit(1)
}

/*
  Basis URL DIUKUR, tidak dipaku.

  CLAUDE.md §7 mencatat empat jam habis karena angka port yang ditulis di
  dokumen berbeda dari yang benar-benar dipakai. Yang menentukan ke mana WEB
  mengirim permintaan adalah `NEXT_PUBLIC_API_URL`, dan itulah instance yang
  benar-benar melayani orang.
*/
function ukurBasis() {
  const dariArg = arg.indexOf('--basis')
  if (dariArg >= 0) return arg[dariArg + 1]

  const web = bacaEnv(join(AKAR, 'apps/web/.env.local'))
  if (web.NEXT_PUBLIC_API_URL) return web.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')

  const port = env.PORT || '3001'
  return `http://127.0.0.1:${port}`
}

const BASIS = ukurBasis()

function jam() {
  return new Date().toLocaleTimeString('id-ID', { hour12: false })
}

async function denyut() {
  const url = `${BASIS}/api/v1/jadwal/jalankan`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-scheduler-secret': RAHASIA,
      },
      body: JSON.stringify(paksa ? { paksa } : {}),
    })
  } catch (e) {
    // API mati bukan alasan penjadwal ikut mati — ia akan hidup lagi.
    console.log(`[${jam()}] ✗ API tak terjangkau di ${BASIS} — ${e.message}`)
    return
  }

  let badan = null
  try { badan = await res.json() } catch { /* balasan tanpa badan bukan galat */ }

  if (res.status === 503) {
    console.log(`[${jam()}] ✗ 503 — SCHEDULER_SECRET belum disetel DI SISI API`)
    return
  }
  if (res.status === 401) {
    console.log(`[${jam()}] ✗ 401 — rahasia tak cocok. Periksa SCHEDULER_SECRET di apps/api/.env`)
    return
  }
  if (!res.ok) {
    console.log(`[${jam()}] ✗ ${res.status} — ${JSON.stringify(badan)?.slice(0, 200)}`)
    return
  }

  /*
    Bentuk respons DIUKUR, bukan ditebak.

    Versi pertama membaca `badan.dijalankan ?? badan.jalan` — dua nama yang
    tak satu pun ada. Akibatnya tiap denyut melaporkan "tak ada tugas jatuh
    tempo", termasuk denyut yang benar-benar menjalankan tugas dan gagal 71
    kali. Pelapor yang berbohong lebih buruk daripada tak ada pelapor.

    Bentuk sesungguhnya (dari `POST /api/v1/jadwal/jalankan`):

        { ok, waktu, diperiksa, sukses, gagal, dilewati, hasil: [...] }

    `hasil[]` berisi { tugas, company_id, status, alasan? }.
  */
  const hasil = Array.isArray(badan?.hasil) ? badan.hasil : []
  const sukses = Number(badan?.sukses ?? 0)
  const gagal = Number(badan?.gagal ?? 0)
  const dilewati = Number(badan?.dilewati ?? 0)

  if (sukses === 0 && gagal === 0) {
    // Semua dilewati = tak ada yang jatuh tempo. Wajar pada denyut 15 menit,
    // dan dilaporkan berbeda dari kegagalan supaya keduanya tetap terbedakan.
    console.log(`[${jam()}] · tak ada tugas jatuh tempo (${dilewati} dilewati)`)
    return
  }

  console.log(
    `[${jam()}] ${gagal > 0 ? '⚠' : '✓'} sukses ${sukses} · gagal ${gagal} · dilewati ${dilewati}`,
  )
  for (const t of hasil) {
    if (t.status === 'dilewati') continue
    const tambahan = t.alasan ? ` — ${t.alasan}` : ''
    console.log(`         ${t.status === 'sukses' ? '✓' : '✗'} ${t.tugas}${tambahan}`)
  }

  /*
    `diperiksa` dilaporkan mentah, dan itu disengaja.

    Angka ini yang membuka cacat pemotongan senyap 2026-08-16: `diperiksa:
    1000` dari 4.794 baris yang ada. Menyembunyikannya berarti membuang
    satu-satunya petunjuk yang muncul di permukaan.
  */
  if (Number(badan?.diperiksa ?? 0) >= 1000) {
    console.log(
      `         ⚠ diperiksa ${badan.diperiksa} — periksa apakah pembacaannya terpotong`,
    )
  }
}

console.log(`Penjadwal lokal → ${BASIS}`)
console.log(paksa ? `Memaksa tugas: ${paksa}` : `Denyut tiap ${MENIT} menit${sekali ? ' (sekali jalan)' : ''}`)
console.log('')

await denyut()

if (!sekali) {
  setInterval(() => { void denyut() }, MENIT * 60_000)
  console.log('')
  console.log('Ctrl+C untuk berhenti.')
}
