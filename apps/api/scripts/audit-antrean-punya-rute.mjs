#!/usr/bin/env node
/**
 * Tiap kiriman antrean mobile wajib menunjuk rute API yang ADA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Antrean offline mobile menjanjikan satu hal: apa pun yang mandor simpan
 * akan sampai ke server, cepat atau lambat. Janji itu batal diam-diam kalau
 * `jalur` yang diantrekan tak menunjuk rute yang ada.
 *
 * Gejalanya paling buruk dari semua kelas cacat di aplikasi ini, karena
 * antrean dirancang untuk MENAHAN kegagalan:
 *
 *   1. mandor mengisi laporan di lokasi, menekan simpan
 *   2. layar berkata "tersimpan" — dan itu benar, ia memang tersimpan di HP
 *   3. antrean mengirim, server menjawab 404
 *   4. antrean menandainya "perlu diperiksa" sesudah 5 percobaan
 *   5. mandor tak pernah membuka layar antrean, karena tak ada alasan
 *
 * Laporannya ada di HP selamanya, dan tak seorang pun tahu.
 *
 * ── Yang ditemukan hari ini, dan kenapa penjaga ini lahir
 *
 * Diukur 2026-09-01: rute progres menerima `body.photos` sebagai array JSON
 * berisi `{ url }`, sementara antrean mengirim multipart (`FormData`, field
 * `photos`). Dua bentuk yang tak cocok, dan hasilnya:
 *
 *     JSON tanpa foto   -> 201  tersimpan
 *     multipart + foto  -> 500  Internal Server Error
 *
 *     project_photos    36 baris, NOL dalam 30 hari terakhir
 *
 * Foto dari mobile tak pernah sampai sekali pun. Tak ada galat yang
 * menyebutnya, karena setiap lapisan menjawab benar untuk dirinya sendiri.
 *
 * ── Apa yang DIJAGA, dan apa yang TIDAK
 *
 * DIJAGA: jalur yang diantrekan punya `app.post` yang cocok. Itu menangkap
 * salah ketik, rute yang dipindah, dan rute yang dihapus.
 *
 * TIDAK DIJAGA: bentuk muatannya. Penjaga ini tak bisa tahu bahwa rute
 * mengharapkan JSON sementara antrean mengirim multipart — yang tadi
 * ketahuan hanya dengan MEMANGGIL rutenya sungguhan. Batas itu disebutkan
 * supaya hijaunya tak dibaca sebagai "kontraknya cocok".
 *
 * Yang bisa dilakukan tanpa memanggil server: menandai kiriman ber-foto,
 * karena itulah bentuk yang terbukti bermasalah. Kalau `fotoUri` muncul
 * lagi, penjaga MEMPERINGATKAN (bukan merah) supaya orangnya memeriksa
 * rutenya menerima multipart sebelum melepasnya ke lapangan.
 *
 * ── Ambang NOL
 *
 * Kiriman yang menuju rute tak ada tak punya keadaan "boleh sedikit". Satu
 * saja berarti ada laporan lapangan yang hilang tanpa jejak.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const AMBANG = Number(process.env.AMBANG_ANTREAN_RUTE ?? 0)

function jelajah(d, filter, hasil = []) {
  let isi
  try { isi = readdirSync(d, { withFileTypes: true }) } catch { return hasil }
  for (const e of isi) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const f = join(d, e.name)
    if (e.isDirectory()) jelajah(f, filter, hasil)
    else if (filter(f)) hasil.push(f)
  }
  return hasil
}

/** Normalkan `:projectId` / `${x}` jadi `:id` supaya bisa dibandingkan. */
const normal = (s) => s.replace(/\$\{[^}]*\}/g, ':id').replace(/:[a-zA-Z]\w*/g, ':id')

// ── Kiriman yang diantrekan mobile
const layar = jelajah(join(AKAR, 'apps', 'mobile', 'app'), (f) => f.endsWith('.tsx'))
const kiriman = []
for (const f of layar) {
  const isi = readFileSync(f, 'utf8')
  for (const m of isi.matchAll(/antrekan\(\{([\s\S]{0,900}?)\}\)/g)) {
    const blok = m[1]
    const jalur = (blok.match(/jalur:\s*[`'"]([^`'"]+)/) ?? [])[1]
    if (!jalur) continue
    kiriman.push({
      berkas: f.replace(/\\/g, '/').replace(AKAR.replace(/\\/g, '/') + '/', ''),
      baris: isi.slice(0, m.index).split('\n').length,
      jalur: normal(jalur),
      berfoto: /fotoUri:/.test(blok),
    })
  }
}

// ── Rute POST yang benar-benar ada
const rute = jelajah(join(AKAR, 'apps', 'api', 'src', 'routes', 'v1'),
  (f) => f.endsWith('.ts') && !f.includes('__tests__'))
const adaPost = new Set()
for (const f of rute) {
  const isi = readFileSync(f, 'utf8')
  for (const m of isi.matchAll(/app\.post[^(]*\(\s*[`'"]([^`'"]+)/g)) adaPost.add(normal(m[1]))
}

/*
  Korpus kosong = jalurnya meleset, BUKAN repo yang bersih. Cacat yang sudah
  menggigit dua penjaga lain di repo ini.
*/
if (kiriman.length < 3) {
  console.error(`❌ Cuma ${kiriman.length} kiriman terbaca dari mobile — polanya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}
if (adaPost.size < 50) {
  console.error(`❌ Cuma ${adaPost.size} rute POST terbaca — polanya meleset.`)
  process.exit(1)
}

const hilang = kiriman.filter((k) => !adaPost.has(k.jalur))
const berfoto = kiriman.filter((k) => k.berfoto)

console.log('══ Kiriman antrean mobile menunjuk rute nyata ═════════════════')
console.log(`  kiriman diantrekan : ${kiriman.length}`)
console.log(`  rute POST di API   : ${adaPost.size}`)
console.log(`  rute TAK ADA       : ${hilang.length}`)
console.log(`  ambang             : ${AMBANG}`)

if (berfoto.length > 0) {
  console.log('')
  console.log(`  ⚠ ${berfoto.length} kiriman membawa fotoUri — PERIKSA rutenya menerima`)
  console.log('    multipart. Diukur 2026-09-01: rute progres membaca body.photos')
  console.log('    sebagai JSON, dan kiriman multipart dijawab 500. Ini peringatan,')
  console.log('    bukan kegagalan — penjaga ini tak bisa memastikannya dari kode.')
  for (const k of berfoto) console.log(`      ${k.berkas}:${k.baris}  ${k.jalur}`)
}

if (hilang.length > AMBANG) {
  console.log('')
  for (const k of hilang) console.log(`  ❌ ${k.berkas}:${k.baris}  ${k.jalur}`)
  console.log('')
  console.log('  Mandor menyimpan laporan, layar berkata "tersimpan", lalu server')
  console.log('  menjawab 404. Antrean menahannya — dan tak seorang pun tahu, karena')
  console.log('  tak ada alasan membuka layar antrean.')
  console.log('')
  console.log(`❌ ${hilang.length} kiriman menuju rute yang tak ada (ambang ${AMBANG}).`)
  process.exit(1)
}

console.log('')
console.log(`✅ ${kiriman.length} kiriman, semuanya menunjuk rute POST yang ada.`)
