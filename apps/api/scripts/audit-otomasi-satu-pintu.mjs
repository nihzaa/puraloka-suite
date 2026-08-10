#!/usr/bin/env node
/**
 * PENJAGA OTOMASI — n8n hanya disentuh lewat SATU PINTU, dan jejaknya wajib.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pola yang sama dengan `audit-satu-pintu-wa.mjs`, dan alasannya sudah
 * terbukti sekali di repo ini: 2026-08-10 `ujiKoneksi` memanggil
 * `api.fonnte.com` LANGSUNG dari route, dan penjaga satu-pintu WA menolaknya.
 * Yang ditolak bukan kerapian — pemanggilan yang tersebar berarti tiap tempat
 * punya versinya sendiri untuk timeout, penerjemahan galat, dan pencatatan
 * jejak. Yang lupa mencatat tak menghasilkan gejala apa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA AMBANG NOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O-1  Tak ada `fetch` ke n8n di luar `lib/otomasi-n8n.ts`.
 *
 * O-2  `jalankanAlur` MENULIS jejaknya sebelum memanggil, bukan sesudah.
 *      Kalau prosesnya mati di tengah panggilan, pola "tulis di akhir" tak
 *      meninggalkan apa pun — dan alur yang MUNGKIN sudah berjalan di n8n
 *      terlihat seperti tak pernah dipicu. Orang lalu memicunya lagi, dan
 *      pelanggan menerima pesan yang sama dua kali.
 *
 * O-3  Rute menjalankan WAJIB bergerbang `otomasi:alur:jalankan`, bukan
 *      `:lihat`. Alur di sini mengirim pesan KE PELANGGAN — satu pemicu yang
 *      salah terlihat oleh orang di luar perusahaan dan tak bisa ditarik.
 *
 * Jalankan: node apps/api/scripts/audit-otomasi-satu-pintu.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = join(import.meta.dirname, '..', 'src')
const PUSTAKA = join(AKAR, 'lib', 'otomasi-n8n.ts')
const RUTE = join(AKAR, 'routes', 'v1', 'otomasi-alur.ts')

const langgar = []

// ── O-1 — fetch ke n8n hanya dari pustaka ───────────────────────────────────
function berkasTs(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      h.push(...berkasTs(join(dir, e.name)))
      continue
    }
    if (e.name.endsWith('.ts')) h.push(join(dir, e.name))
  }
  return h
}

for (const f of berkasTs(AKAR)) {
  if (f === PUSTAKA) continue
  const rel = f.slice(f.indexOf('src')).replace(/\\/g, '/')
  const isi = readFileSync(f, 'utf8')
  // `fetch(` yang alamatnya menyebut n8n atau webhook n8n.
  for (const m of isi.matchAll(/fetch\s*\(\s*[`'"]([^`'"]*)/g)) {
    if (/n8n|\/webhook\//i.test(m[1])) {
      langgar.push(`O-1  ${rel}  memanggil n8n langsung: ${m[1].slice(0, 60)}`)
    }
  }
  /*
   * Atau MEMBACA kredensial n8n di luar pustaka.
   *
   * Yang dicari `ambilKredensial(..., 'N8N_...')`, BUKAN sekadar munculnya
   * nama kunci. Versi pertama memakai `/N8N_BASE_URL/` polos dan langsung
   * merah di `routes/v1/otomasi-alur.ts` — yang di sana hanyalah nama kunci
   * di dalam PESAN untuk pengguna ("N8N_BASE_URL belum diisi di halaman
   * Kredensial"). Penjaga yang melarang menyebut nama kunci akan memaksa
   * pesan galat jadi kabur, dan pesan kabur adalah cacat yang lebih mahal
   * daripada yang dijaganya.
   */
  if (/ambilKredensial\s*\([^)]*['"`]N8N_/.test(isi)) {
    langgar.push(`O-1  ${rel}  membaca kredensial n8n di luar lib/otomasi-n8n.ts`)
  }
}

// ── O-2 — jejak ditulis SEBELUM panggilan ───────────────────────────────────
if (!existsSync(PUSTAKA)) {
  langgar.push('O-2  lib/otomasi-n8n.ts hilang — pustaka satu-pintu tak ada')
} else {
  const isi = readFileSync(PUSTAKA, 'utf8')
  const fn = isi.slice(isi.indexOf('export async function jalankanAlur'))
  const iInsert = fn.indexOf(".from('otomasi_jalan')")
  const iPanggil = fn.search(/await panggil\(/)

  if (iInsert === -1) {
    langgar.push('O-2  jalankanAlur tak menulis jejak sama sekali')
  } else if (iPanggil === -1) {
    langgar.push('O-2  jalankanAlur tak memanggil n8n')
  } else if (iInsert > iPanggil) {
    langgar.push(
      'O-2  jejak ditulis SESUDAH panggilan — proses yang mati di tengah tak ' +
        'meninggalkan bukti bahwa alurnya mungkin sudah jalan',
    )
  }

  // Statusnya harus 'jalan', bukan langsung 'sukses': baris yang menyatakan
  // sukses sebelum hasilnya diketahui adalah kebohongan yang tertinggal
  // persis saat prosesnya mati.
  const blokInsert = fn.slice(iInsert, iInsert + 400)
  if (!/status:\s*'jalan'/.test(blokInsert)) {
    langgar.push("O-2  jejak awal tidak berstatus 'jalan'")
  }
}

// ── O-3 — gerbang izin rute menjalankan ─────────────────────────────────────
if (!existsSync(RUTE)) {
  langgar.push('O-3  routes/v1/otomasi-alur.ts hilang')
} else {
  const isi = readFileSync(RUTE, 'utf8')
  const i = isi.indexOf("/jalankan'")
  if (i === -1) {
    langgar.push('O-3  rute menjalankan tak ditemukan')
  } else {
    // Diperiksa pada BLOK RUTENYA, bukan seluruh berkas. Berkas ini memang
    // memuat `otomasi:alur:jalankan` di komentar kepala — memeriksa seluruh
    // berkas akan hijau bahkan kalau gerbangnya dicopot. Kekeliruan yang
    // persis sama sudah terjadi tiga kali sesi ini (G-5, G-3, E-6).
    const blok = isi.slice(i, i + 900)
    if (!/requirePermission\(\s*'otomasi:alur:jalankan'\s*\)/.test(blok)) {
      langgar.push(
        "O-3  rute /jalankan tak bergerbang 'otomasi:alur:jalankan' — yang " +
          'boleh MEMERIKSA jadi boleh MENGIRIM pesan ke pelanggan',
      )
    }
  }
}

console.log(`Pelanggaran otomasi: ${langgar.length}`)
if (langgar.length > 0) {
  console.error('\n❌ PENJAGA OTOMASI GAGAL (ambang NOL)\n')
  langgar.forEach((l) => console.error(`     ${l}`))
  console.error('')
  process.exit(1)
}
console.log('✓ n8n satu pintu · jejak ditulis lebih dulu · gerbang izin utuh')
