#!/usr/bin/env node
/**
 * PENJAGA: jatuhan `.env` pada kredensial TAK BOLEH BERTAMBAH.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA JATUHAN ITU BERBAHAYA DI SERVER BANYAK-PERUSAHAAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `process.env` SATU untuk seluruh proses. Kunci yang punya `env:` di katalog
 * akan dipakai oleh SETIAP tenant yang belum mengisi kuncinya sendiri:
 *
 *   ANTHROPIC_API_KEY  tenant B memakai kunci pemilik server — tagihannya
 *                      jatuh ke pemilik server, dan tak ada yang memberitahu
 *   WA_*               tenant B mengirim WhatsApp lewat NOMOR TENANT A
 *
 * Yang kedua tak bisa ditarik kembali: pesannya sudah sampai ke ponsel orang,
 * atas nama perusahaan yang salah.
 *
 * ── Kenapa RATCHET, bukan larangan
 *
 * Lima jatuhan yang ada hari ini adalah jaring pengaman satu-instalasi —
 * mencabutnya akan mematikan asisten dan notifikasi yang jalan sekarang.
 * Saklarnya sudah ada (`KREDENSIAL_TANPA_JATUHAN_ENV=1`) untuk operator yang
 * melayani banyak perusahaan.
 *
 * Yang ditegakkan: jumlahnya TAK BOLEH NAIK. Tiap `env:` baru adalah satu
 * kunci lagi yang diam-diam dibagi antar-tenant, dan penambahannya selalu
 * terlihat wajar saat ditulis ("biar gampang di lokal").
 *
 * Jalankan: node apps/api/scripts/audit-jatuhan-env-tak-bertambah.mjs
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KATALOG = join(import.meta.dirname, '..', 'src', 'lib', 'kredensial.ts')
const LANTAI = join(import.meta.dirname, 'lantai-jatuhan-env.json')

const isi = readFileSync(KATALOG, 'utf8')

/*
 * Tiap entri katalog dipotong dari `kunci:` sampai `grup:` — batas yang pasti
 * karena `grup` wajib ada di tiap entri. Mencari `env:` di seluruh berkas akan
 * ikut menghitung `process.env` di kode pembacanya.
 */
const entri = [...isi.matchAll(/kunci:\s*'([A-Z0-9_]+)'([\s\S]*?)grup:/g)]
const berjatuhan = entri.filter(([, , badan]) => /\benv:\s*'/.test(badan)).map(([, k]) => k)

console.log(`Kredensial berjatuhan env: ${berjatuhan.length} dari ${entri.length}`)

const lantai = existsSync(LANTAI) ? JSON.parse(readFileSync(LANTAI, 'utf8')) : null

if (!lantai) {
  writeFileSync(
    LANTAI,
    JSON.stringify(
      {
        _catatan: 'Kunci kredensial yang punya jatuhan `env:`. Boleh TURUN, tidak boleh NAIK.',
        _kenapa:
          'process.env satu untuk seluruh proses — tiap jatuhan adalah satu kunci ' +
          'yang diam-diam dibagi antar-tenant. WA_* yang jatuh berarti tenant B ' +
          'mengirim WhatsApp lewat nomor tenant A.',
        _saklar: 'KREDENSIAL_TANPA_JATUHAN_ENV=1 mematikan seluruh jatuhan.',
        jumlah: berjatuhan.length,
        kunci: berjatuhan,
      },
      null,
      2,
    ) + '\n',
  )
  console.log('Lantai dibuat pertama kali.')
  process.exit(0)
}

if (berjatuhan.length > lantai.jumlah) {
  const baru = berjatuhan.filter((k) => !(lantai.kunci ?? []).includes(k))
  console.error(`\n❌ BERTAMBAH: ${berjatuhan.length} > lantai ${lantai.jumlah}\n`)
  console.error('   Kunci baru ini akan dipakai SETIAP tenant yang belum mengisinya')
  console.error('   sendiri — memakai nilai milik server, bukan miliknya.\n')
  baru.forEach((k) => console.error(`     ${k}`))
  console.error('\n   Kalau kunci ini memang per-tenant, buang `env:` dari entrinya.')
  console.error('   Kalau memang harus dibagi, turunkan keputusannya ke founder dulu.\n')
  process.exit(1)
}

if (berjatuhan.length < lantai.jumlah) {
  console.log(`\n📉 Turun (${berjatuhan.length} < ${lantai.jumlah}) — kencangkan angkanya.`)
}
console.log('✓ Tidak bertambah.')
