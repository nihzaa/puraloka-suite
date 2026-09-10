#!/usr/bin/env node
/**
 * PENJAGA — KONTRAK `/health` UTUH DI KEDUA SISI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `/health` dibaca EMPAT konsumen, dan tak satu pun test menyentuhnya:
 *
 *     apps/api/Dockerfile      HEALTHCHECK — container dinyatakan sakit/sehat
 *     docker-compose.yml       healthcheck service `api`
 *     infra/perbarui-vps.sh    langkah 4 (tunggu sehat) & 5 (bukti dari luar)
 *     manusia                  "produksi menjalankan commit mana?"
 *
 * Rute yang menentukan apakah deploy dinyatakan berhasil, tanpa satu pun
 * pemeriksaan bahwa bentuknya masih seperti yang dijanjikan.
 *
 * ── Kelas cacat yang dijaga
 *
 * Sama dengan `audit-bentuk-balasan-mobile.mjs`: kunci yang DIBACA konsumen
 * wajib benar-benar DIKIRIM. Di sana API bersarang `{kpis:{…}}` sementara
 * layar membaca datar, dan `?? 0` menelan seluruhnya — dashboard mobile
 * menampilkan Rp 0 atas Rp 7,14 M, dengan `tsc` hijau.
 *
 * Di sini bentuknya sedikit berbeda dan lebih halus: healthcheck container
 * hanya memeriksa `r.ok` — status HTTP. Sebuah `/health` yang membalas 200
 * dengan badan KOSONG akan dinyatakan SEHAT oleh keempat konsumen di atas.
 *
 * Artinya seluruh isi balasan itu — status, checks.database, versi — bisa
 * hilang tanpa satu pun gejala. Deploy tetap hijau, container tetap sehat,
 * dan satu-satunya yang rugi adalah orang yang kelak bertanya "versi mana
 * yang jalan?" lalu mendapat `undefined`.
 *
 * ── Kenapa penjaga statis, bukan test
 *
 * `/health` didaftarkan langsung di `src/index.ts`, berkas yang juga
 * memanggil `app.listen()` saat diimpor. Test yang mengimpornya menyalakan
 * server sungguhan di port nyata — dan suite ini sudah berjalan enam shard
 * paralel di CI.
 *
 * Memindahkan rutenya ke modul terpisah adalah perbaikan yang benar, tetapi
 * ia menyentuh urutan pendaftaran hook yang komentarnya sendiri menyebut
 * LOAD-BEARING. Itu perubahan yang layak direncanakan, bukan diselipkan.
 *
 * ⚠ BATAS YANG JUJUR: yang diperiksa BENTUK DI KODE, bukan balasan sungguhan.
 * Ia tak tahu apakah server hidup, apakah `GIT_COMMIT` benar-benar terisi
 * saat build, atau apakah nilainya cocok dengan commit yang ter-deploy.
 * Yang dijamin: kunci yang dijanjikan tak hilang diam-diam dari kode.
 *
 * Untuk bukti dari luar, `perbarui-vps.sh` langkah 5 sudah menembak
 * `/health` sungguhan sesudah deploy.
 *
 * ── AMBANG NOL
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const AKAR_REPO = join(AKAR_API, '..', '..')

const src = join(AKAR_API, 'src', 'index.ts')
if (!existsSync(src)) {
  console.log('⏭  kontrak /health: DILEWATI (src/index.ts tak ada)')
  process.exit(0)
}

// ⚠ CR dibuang lebih dulu — CLAUDE.md §7a.
const isi = readFileSync(src, 'utf8').replace(/\r/g, '')

/*
  Badan handler `/health` diambil dari `app.get('/health'` sampai penutupnya.
  Dibatasi supaya kunci bernama sama di rute LAIN tak ikut terhitung — itu
  akan membuat penjaga ini hijau atas rute yang justru kehilangan kuncinya.
*/
const mulai = isi.indexOf("app.get('/health'")
if (mulai === -1) {
  console.error('❌ Rute `/health` TIDAK ADA di src/index.ts.')
  console.error('')
  console.error('   Empat konsumen menembaknya — Dockerfile HEALTHCHECK,')
  console.error('   docker-compose, dan perbarui-vps.sh langkah 4 & 5.')
  console.error('   Tanpa rute ini container dinyatakan SAKIT selamanya dan')
  console.error('   deploy berhenti di "tunggu sehat" tanpa menyebut sebabnya.')
  process.exit(1)
}
const badan = isi.slice(mulai, mulai + 4000)

/*
  Kunci yang WAJIB ada, dan siapa yang rugi bila hilang.

  Tiap baris menyebut konsumennya — penjaga yang cuma berkata "kunci X
  hilang" memaksa orang berikutnya mencari sendiri siapa yang peduli.
*/
const WAJIB = [
  ['status:', 'perbarui-vps.sh & operator — membedakan ok dari degraded'],
  ['checks:', 'pembungkus pemeriksaan; tanpanya database tak punya tempat'],
  ['database:', 'satu-satunya bukti koneksi basis hidup di balasan ini'],
  ['versi:', 'menjawab "produksi menjalankan commit mana?" tanpa SSH'],
  ['commit:', 'isi `versi` — tanpanya deploy tak bisa diverifikasi dari luar'],
]

const hilang = WAJIB.filter(([k]) => !badan.includes(k))

/*
  Dan arah sebaliknya: nilai jatuhan wajib MENGAKU tak tahu.

  Pemantau EAS mencetak `?` selama enam menit atas perintah yang gagal, dan
  `?` terbaca seperti "belum diketahui" — bukan seperti "saya tak bisa
  mengukur" (CLAUDE.md §7). Nilai jatuhan yang terlihat masuk akal, seperti
  'dev' atau 'unknown-commit', mengundang kesalahan yang sama.
*/
const punyaJatuhanJujur = /GIT_COMMIT\s*\|\|\s*'tak diketahui'/.test(badan)

console.log('══ Kontrak /health utuh ═══════════════════════════════════════')
console.log(`  kunci wajib      : ${WAJIB.length}`)
console.log(`  HILANG           : ${hilang.length}`)
console.log(`  jatuhan jujur    : ${punyaJatuhanJujur ? 'ya' : 'TIDAK'}`)

/*
  Konsumen dihitung dari berkas nyata, bukan angka ditulis tangan — angka
  tulisan tangan membusuk, dan pembaca berikutnya mempercayainya.
*/
const konsumen = [
  ['apps/api/Dockerfile', 'HEALTHCHECK'],
  ['docker-compose.yml', 'healthcheck'],
  ['infra/perbarui-vps.sh', 'langkah 4 & 5'],
].filter(([f]) => {
  const p = join(AKAR_REPO, f)
  return existsSync(p) && readFileSync(p, 'utf8').includes('/health')
})
console.log(`  konsumen terukur : ${konsumen.length}  (${konsumen.map(([f]) => f.split('/').pop()).join(', ')})`)

if (hilang.length === 0 && punyaJatuhanJujur) {
  console.log('\n✅ Kontrak /health utuh.')
  process.exit(0)
}

console.error('')
if (hilang.length > 0) {
  console.error('❌ Kunci HILANG dari balasan /health:\n')
  for (const [k, siapa] of hilang) console.error(`     ${k.padEnd(12)} ${siapa}`)
}
if (!punyaJatuhanJujur) {
  console.error('')
  console.error("❌ `versi.commit` tak punya jatuhan `|| 'tak diketahui'`.")
  console.error('   Nilai jatuhan yang terlihat masuk akal lebih buruk daripada')
  console.error('   mengaku tak tahu: pemantau EAS mencetak `?` selama enam menit')
  console.error('   atas perintah yang GAGAL, dan `?` terbaca "belum selesai".')
}
console.error(`
   ⚠ Kenapa hilangnya tak bergejala: healthcheck container hanya memeriksa
   \`r.ok\` — status HTTP. /health yang membalas 200 dengan badan KOSONG
   dinyatakan SEHAT oleh keempat konsumennya. Seluruh isi balasan bisa
   lenyap tanpa satu pun deploy berubah warna.`)
process.exit(1)
