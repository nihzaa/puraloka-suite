#!/usr/bin/env node
/**
 * audit-hapus-cookie-cocok-pasang.mjs — ambang NOL
 *
 * Tiap `clearCookie` wajib memakai atribut yang SAMA dengan `setCookie`-nya.
 *
 * ── Cacat yang ditutup
 *
 * Dilaporkan founder 2026-09-04: `/dashboard` "reload terus".
 *
 * `/api/v1/auth/logout` memanggil `clearCookie(nama, { path: '/' })` — hanya
 * `path`. Cookie-nya dipasang dengan `COOKIE_OPTS` yang memuat `secure`,
 * `httpOnly`, dan `sameSite`. Peramban mencocokkan cookie yang dihapus lewat
 * ATRIBUTNYA; `Secure` yang hilang membuatnya menganggap itu cookie LAIN,
 * jadi penghapusannya tak mengenai sasaran.
 *
 * Terukur dari produksi:
 *
 *     dipasang : HttpOnly; Secure; SameSite=Lax; Path=/
 *     dihapus  :           ~~~~~~  SameSite=Lax; Path=/
 *
 * Balasannya `200 OK` dengan dua header `Set-Cookie` yang terlihat benar.
 * Nol galat, di klien maupun server.
 *
 * Akibatnya berantai: token akses kedaluwarsa (~1 jam) sementara cookie
 * berumur 7 hari → semua API 401 → refresh gagal → logout dipanggil tapi
 * cookie BERTAHAN → `middleware.ts` (yang hanya memeriksa cookie ADA atau
 * tidak) melempar /login balik ke home → /dashboard memuat ulang dirinya
 * ~3x per detik sampai tab ditutup.
 *
 * ── Kenapa perbaikan di klien saja tak cukup
 *
 * `clearAuthAndRedirect` sudah diperbaiki lebih dulu (menunggu logout,
 * menghapus `puraloka_role`, penahan alih-berulang). Diukur sesudah itu
 * tetapi sebelum baris logout dibetulkan: MASIH 80 navigasi dalam 12 detik.
 *
 * Cookie HttpOnly hanya bisa dihapus server. Klien yang sabar menunggu
 * balasan yang tak menghapus apa pun tetap kembali ke titik semula.
 *
 * ── Yang diperiksa
 *
 * Tiap berkas rute yang memanggil `clearCookie`: himpunan atribut yang
 * dipakai `clearCookie` wajib memuat semua atribut milik `setCookie` di
 * berkas yang sama, kecuali `maxAge`/`expires` (yang justru dibalik oleh
 * penghapusan itu sendiri).
 *
 * Membaca BENTUK kode — ia tak bisa tahu apakah peramban sungguhan menerima
 * penghapusannya. Untuk itu ukur headernya:
 *
 *     curl -s -i -X POST .../api/v1/auth/logout | grep -i set-cookie
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(AKAR, 'src')

const berkas = []
;(function jelajah(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) {
      if (n !== '__tests__' && n !== 'node_modules') jelajah(p)
    } else if (n.endsWith('.ts')) berkas.push(p)
  }
})(SRC)

// `maxAge`/`expires` justru DIBALIK oleh penghapusan — bukan bagian identitas.
const ABAIKAN = new Set(['maxAge', 'expires'])

/*
  Argumen kedua dicari lewat KURUNG BERIMBANG, bukan regex.

  Versi pertama penjaga ini memakai regex, dan ia HIJAU atas kode yang
  justru melahirkan cacat ini — `clearCookie('x', { path: '/' })` lolos
  karena regexnya menangkap `('puraloka_token'` sebagai "opsi", bahkan ikut
  menelan potongan komentar. Penjaga yang tak menangkap cacat aslinya adalah
  hiasan (CLAUDE.md §8a.2), jadi ini ditulis ulang.

  Membaca argumen kedua dengan menghitung kurung/kurawal menangani objek
  literal, konstanta, maupun sebaran — tanpa menebak bentuknya.
*/
function opsiTerakhir(isi, panggilan) {
  const hasil = []
  let i = 0
  while ((i = isi.indexOf(panggilan + '(', i)) !== -1) {
    let j = i + panggilan.length + 1
    let dalam = 1
    const koma = []
    while (j < isi.length && dalam > 0) {
      const c = isi[j]
      if (c === '(' || c === '{' || c === '[') dalam++
      else if (c === ')' || c === '}' || c === ']') dalam--
      else if (c === ',' && dalam === 1) koma.push(j)
      j++
    }
    /*
      Yang dibaca argumen TERAKHIR, bukan yang sesudah koma pertama.

      `setCookie(nama, nilai, OPSI)` punya tiga argumen; versi sebelumnya
      mengambil "semua sesudah koma pertama" dan menghasilkan
      `"data.session.access_token, COOKIE_OPTS"` — yang lalu tak dikenali
      sebagai konstanta maupun objek, jadi atributnya terbaca NOL dan
      pembandingan apa pun lolos.

      Itu sebabnya versi pertama penjaga ini HIJAU atas cacat yang
      melahirkannya. Penjaga yang tak menangkap cacat aslinya adalah hiasan
      (CLAUDE.md §8a.2).
    */
    hasil.push(koma.length > 0 ? isi.slice(koma[koma.length - 1] + 1, j - 1).trim() : null)
    i = j
  }
  return hasil
}

/** Pisahkan argumen opsi jadi { nama atribut, konstanta yang disebar }. */
function bedah(args) {
  const nama = new Set()
  const sebaran = new Set()
  for (const a of args) {
    if (!a) continue                       // tanpa opsi: nol atribut
    if (a.startsWith('{')) {
      for (const m of a.matchAll(/\.\.\.([A-Za-z_][A-Za-z0-9_]*)/g)) sebaran.add(m[1])
      const tanpaSebaran = a.replace(/\.\.\.[A-Za-z_][A-Za-z0-9_]*/g, '')
      for (const m of tanpaSebaran.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
        if (!ABAIKAN.has(m[1])) nama.add(m[1])
      }
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(a)) {
      sebaran.add(a)                       // konstanta bersama, mis. COOKIE_OPTS
    }
  }
  return { nama, sebaran }
}

const temuan = []
for (const p of berkas) {
  const isi = readFileSync(p, 'utf8')
  if (!isi.includes('clearCookie') || !isi.includes('setCookie')) continue

  const pasang = bedah(opsiTerakhir(isi, 'setCookie'))

  /*
    Dinilai PER-PANGGILAN, bukan per-berkas.

    Versi sebelumnya menggabung semua `clearCookie` dalam satu berkas jadi
    satu himpunan, lalu meloloskan berkasnya begitu SATU panggilan memakai
    konstanta yang benar. `auth.ts` punya dua jalur — `/auth/refresh` yang
    gagal dan `/auth/logout` — dan menambal satu saja membuat penjaga hijau
    atas yang lain.

    Itu terjadi sungguhan: `/auth/refresh` (baris 447 waktu itu) terlewat
    sepenuhnya dari perbaikan pertama, dan justru jalur ITU yang berjalan
    saat sesi habis.
  */
  const akar = (nama) => {
    if (pasang.sebaran.has(nama)) return true
    const re = /(?:const|let)\s*\{[^}]*\}\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g
    let m
    while ((m = re.exec(isi)) !== null) {
      if (m[0].includes(`...${nama}`) && pasang.sebaran.has(m[1])) return true
    }
    return false
  }

  for (const arg of opsiTerakhir(isi, 'clearCookie')) {
    const satu = bedah([arg])
    if ([...satu.sebaran].some(akar)) continue      // cocok menurut konstruksi

    const kurang = [...pasang.nama].filter((a) => !satu.nama.has(a))
    if (pasang.sebaran.size > 0 && satu.sebaran.size === 0) {
      temuan.push({
        berkas: relative(AKAR, p),
        pesan: `setCookie memakai ${[...pasang.sebaran].join('/')}, `
          + `clearCookie memakai ${arg ?? '(tanpa opsi)'}`,
      })
    } else if (kurang.length > 0) {
      temuan.push({ berkas: relative(AKAR, p), pesan: `clearCookie kehilangan: ${kurang.join(', ')}` })
    }
  }
}

if (temuan.length > 0) {
  console.error('❌ clearCookie tak cocok dengan setCookie-nya:\n')
  for (const t of temuan) console.error(`   ${t.berkas}\n     ${t.pesan}\n`)
  console.error('   Peramban mencocokkan cookie yang dihapus lewat ATRIBUTNYA.')
  console.error('   Satu atribut yang hilang (mis. `Secure`) membuatnya menganggap')
  console.error('   itu cookie LAIN — penghapusan tak mengenai sasaran, balasan')
  console.error('   tetap 200, dan tak ada satu pun galat.\n')
  console.error('   Terukur 2026-09-04: sesi yang tak pernah benar-benar berakhir')
  console.error('   membuat /dashboard memuat ulang dirinya ~3x per detik.\n')
  console.error('   Perbaikan: pakai konstanta yang sama untuk keduanya —')
  console.error('   `const { maxAge: _, ...OPSI_HAPUS } = COOKIE_OPTS`.')
  process.exit(1)
}

console.log('✅ semua clearCookie memakai atribut yang sama dengan setCookie-nya')
