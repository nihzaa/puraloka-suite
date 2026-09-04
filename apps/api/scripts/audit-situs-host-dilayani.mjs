#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// PENJAGA — host `bawaan` yang menyala WAJIB benar-benar bisa dibuka
// ═══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-09-04, sebelum deploy multi-tenant pertama:
//
//     persada.puraloka-suite.duckdns.org   200
//     porto.puraloka-suite.duckdns.org     000   ← exit curl 60
//
// `porto.` terdaftar di `situs_domain` dengan `aktif = true` DAN
// `terverifikasi = true` — dua kolom yang artinya "boleh menyajikan konten" —
// padahal nginx tak punya server block untuknya dan certbot tak pernah
// menerbitkan sertifikatnya. Yang disajikan sertifikat `admin.`, nama yang
// tak cocok, jadi TLS ditolak sebelum satu byte HTTP pun terkirim.
//
// ── Kenapa ini tak terlihat
//
// Tak ada yang gagal. Basis menjawab benar (barisnya memang ada), aplikasi
// menjawab benar (ia tak pernah ditanya), nginx menjawab benar (host tak
// dikenal → server block bawaan). Tiap lapisan benar untuk dirinya sendiri —
// keluarga yang sama dengan `curl` 200 tapi browser 500 di CLAUDE.md §7a.
//
// Yang membayar: pelanggan yang diberi alamat lalu mendapati alamatnya mati,
// dan tak ada di sistem kita yang bisa memberi tahu itu terjadi.
//
// ── Kenapa hanya `bawaan`
//
// Domain `kustom` dibawa pelanggan; DNS-nya di luar kendali kita dan bisa
// belum diarahkan saat baris dibuat. Yang `bawaan` subdomain MILIK KITA —
// kalau ia mati, itu kelalaian kita, bukan keadaan yang wajar.
//
// ── Kenapa `000` saja tak cukup dilaporkan
//
// `curl -w '%{http_code}'` memulangkan `000` untuk SEMUA kegagalan koneksi:
// DNS tak ketemu, port tertutup, TLS ditolak, waktu habis. Empat sebab yang
// perbaikannya berbeda-beda, satu angka yang sama. Penjaga ini ikut membaca
// EXIT CODE curl dan menerjemahkannya — laporan yang tak menyebut sebab
// memaksa orang berikutnya mendiagnosis ulang dari nol.
//
// Ambang: NOL.
//
// ⚠ Butuh jaringan + basis. Di CI tanpa keduanya ia MELEWATI dengan pesan
// yang menyebutkan alasannya — bukan diam-diam hijau.
// ═══════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process'
import { buatClient, adaKoneksi } from '../../../scripts/db/_koneksi.mjs'

/**
 * Arti exit code curl yang benar-benar kita temui. Angka telanjang tak
 * memberi tahu apa yang harus diperbaiki; kalimatnya memberi tahu.
 */
const ARTI_EXIT = {
  6: 'DNS tak bisa diselesaikan — host belum terdaftar di penyedia DNS',
  7: 'koneksi ditolak — nginx tak mendengarkan, atau firewall menutup port',
  28: 'waktu habis — server tak menjawab dalam batas waktu',
  23: 'GALAT ALAT UKUR, bukan jaringan — curl tak bisa menulis ke tempat buangan. Periksa BUANGAN di berkas ini, bukan hostnya',
  35: 'jabat tangan TLS gagal',
  60: 'sertifikat TLS tak sah untuk nama ini — certbot belum menerbitkannya',
}

/**
 * Tempat membuang badan respons — kita hanya butuh kodenya.
 *
 * ⚠ `/dev/null` TIDAK ADA di Windows, dan curl-nya gagal dengan exit 23
 * ("write error") — yang penjaga ini terjemahkan sebagai kegagalan JARINGAN.
 *
 * Diukur 2026-09-04 pada jalan pertamanya: `persada.` dilaporkan MERAH
 * padahal `curl` manual di terminal yang sama memulangkan 200 beberapa menit
 * sebelumnya. Merah palsu, dari alat ukurnya sendiri.
 *
 * Itu cacat yang lebih mahal daripada tak punya penjaga sama sekali: penjaga
 * yang merah tanpa sebab melatih orang mengabaikan hasilnya, dan yang
 * diabaikan tak menjaga apa pun (alasan yang sama ditulis panjang di
 * `infra/perbarui-vps.sh` langkah 5).
 */
const BUANGAN = process.platform === 'win32' ? 'NUL' : '/dev/null'

function ukurHost(host) {
  try {
    const keluaran = execFileSync(
      'curl',
      ['-s', '-o', BUANGAN, '-w', '%{http_code}', '--max-time', '20', `https://${host}/`],
      { encoding: 'utf8' }
    )
    return { kode: keluaran.trim(), exit: 0 }
  } catch (galat) {
    return {
      kode: '000',
      exit: galat.status ?? -1,
      sebab: ARTI_EXIT[galat.status] ?? `curl keluar dengan kode ${galat.status}`,
    }
  }
}

async function utama() {
  if (!adaKoneksi()) {
    console.log('LEWAT: tak ada koneksi basis (butuh .env). Ini BUKAN lulus.')
    process.exit(0)
  }

  const klien = buatClient()
  await klien.connect()

  let baris
  try {
    const hasil = await klien.query(`
      SELECT host, utama
        FROM situs_domain
       WHERE jenis = 'bawaan' AND aktif AND terverifikasi
       ORDER BY utama DESC, host
    `)
    baris = hasil.rows
  } catch (galat) {
    // Tabel belum ada = migrasi 564 belum jalan di lingkungan ini. Itu
    // keadaan yang sah, bukan pelanggaran.
    if (galat.code === '42P01') {
      console.log('LEWAT: tabel situs_domain belum ada (migrasi 564 belum jalan).')
      await klien.end()
      process.exit(0)
    }
    throw galat
  } finally {
    await klien.end().catch(() => {})
  }

  if (baris.length === 0) {
    console.log('LEWAT: belum ada host `bawaan` yang menyala. Tak ada yang bisa diperiksa.')
    process.exit(0)
  }

  console.log(`Memeriksa ${baris.length} host \`bawaan\` yang aktif + terverifikasi:\n`)

  const mati = []
  for (const { host, utama: adalahUtama } of baris) {
    const hasil = ukurHost(host)
    const tanda = adalahUtama ? '★' : ' '
    const sehat = hasil.kode === '200'
    console.log(
      `  ${tanda} ${host.padEnd(46)} ${hasil.kode}` +
        (sehat ? '' : `   ← ${hasil.sebab ?? 'bukan 200'}`)
    )
    if (!sehat) mati.push({ host, ...hasil })
  }

  console.log('')
  if (mati.length > 0) {
    console.log(`MERAH: ${mati.length} host menyala di basis tetapi TAK BISA DIBUKA.\n`)
    for (const m of mati) {
      console.log(`  ${m.host}`)
      console.log(`    ${m.sebab ?? `memulangkan ${m.kode}, bukan 200`}`)
      console.log(
        `    Perbaikan: tambahkan server block nginx + terbitkan sertifikat,`
      )
      console.log(
        `               ATAU setel aktif = false kalau host ini memang belum siap.\n`
      )
    }
    process.exit(1)
  }

  console.log(`HIJAU: ${baris.length} host semuanya menjawab 200.`)
}

utama().catch((galat) => {
  console.error('GAGAL menjalankan penjaga:', galat.message)
  process.exit(1)
})
