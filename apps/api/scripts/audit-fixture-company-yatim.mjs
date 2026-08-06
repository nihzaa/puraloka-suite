#!/usr/bin/env node
/**
 * PENJAGA FIXTURE COMPANY YATIM — perusahaan uji tanpa pemilik.
 *
 * ── Bug yang melahirkannya
 *
 * `t9-kelola-badan-usaha.test.ts` menegakkan satu invariant produksi:
 *
 *     setiap akar grup (parent_company_id IS NULL) WAJIB punya owner_user_id
 *
 * Akar tanpa pemilik adalah grup yang tak seorang pun bisa menambah badan
 * usaha di dalamnya, tanpa jalan perbaikan dari UI. Invariantnya benar dan
 * tak boleh dilonggarkan.
 *
 * Tapi ia memeriksa SELURUH tabel `companies` — termasuk baris yang dibuat
 * berkas test lain. CI menjalankan enam shard paralel terhadap SATU basis,
 * jadi fixture berkas A menjatuhkan test berkas B, dengan pesan yang tak ada
 * hubungannya sama sekali dengan apa yang B uji:
 *
 *     × setiap akar grup punya pemilik (tak ada grup yatim)
 *       ada akar grup tanpa pemilik: expected 1 to be +0
 *
 * Terjadi TIGA KALI dalam satu hari, dari fixture yang berbeda-beda. Tiap
 * kali "perbaikannya" hanya membersihkan fixture yang itu — lalu fixture
 * berikutnya melakukan hal yang sama.
 *
 * ── Kenapa membersihkan fixture BUKAN perbaikannya
 *
 * `afterAll` tidak berjalan kalau prosesnya mati, timeout, atau shard-nya
 * dibunuh. Selama ada satu berkas yang membuat perusahaan tanpa pemilik,
 * kegagalan yang sama menunggu jadwal.
 *
 * Yang benar: fixture harus SAH menurut invariant sejak lahir. Perusahaan
 * uji ber-`owner_user_id` tak menjatuhkan siapa pun meski tertinggal.
 *
 * ── Yang diperiksa
 *
 * `INSERT INTO companies` di berkas test yang TIDAK menyertakan
 * `owner_user_id`, kecuali yang berjalan di schema `test` terisolasi
 * (`resetTestSchema()`) — di sana `companies` bukan tabel yang sama.
 *
 * Pakai: node scripts/audit-fixture-company-yatim.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = ['src/routes/v1/__tests__', 'src/utils/__tests__', 'src/lib/__tests__']

function berkasTest(dir) {
  const hasil = []
  let isi
  try { isi = readdirSync(dir, { withFileTypes: true }) } catch { return hasil }
  for (const f of isi) {
    const p = join(dir, f.name)
    if (f.isDirectory()) hasil.push(...berkasTest(p))
    else if (f.name.endsWith('.test.ts')) hasil.push(p)
  }
  return hasil
}

const temuan = []
let diperiksa = 0
let dilewatiSchemaTest = 0

for (const akar of AKAR) {
  for (const f of berkasTest(akar)) {
    const teks = readFileSync(f, 'utf8')
    if (!/INSERT\s+INTO\s+companies/i.test(teks)) continue
    diperiksa++

    // Schema `test` terisolasi: `companies` di sana bukan tabel yang dilihat
    // `t9`, jadi fixture-nya tak bisa menjatuhkan siapa pun.
    if (/resetTestSchema\s*\(/.test(teks)) { dilewatiSchemaTest++; continue }

    const baris = teks.split(/\r?\n/)
    for (let i = 0; i < baris.length; i++) {
      if (!/INSERT\s+INTO\s+companies/i.test(baris[i])) continue
      // Komentar, bukan kode.
      if (/^\s*(\/\/|\*|\/\*)/.test(baris[i])) continue

      // Pernyataan bisa memanjang beberapa baris — lihat sampai penutupnya.
      const jendela = baris.slice(i, i + 6).join(' ')
      if (/owner_user_id/i.test(jendela)) continue

      // Perusahaan ANAK (`parent_company_id` terisi) bukan akar grup, jadi
      // invariant "akar wajib berpemilik" tidak berlaku padanya — pemiliknya
      // diwarisi dari akar. Menuntut `owner_user_id` di sini adalah temuan
      // palsu, dan penjaga yang berisik akan dimatikan orang.
      if (/parent_company_id/i.test(jendela)) continue

      // INSERT yang memang MENGUJI penolakan (kode huruf besar, kode kembar)
      // sengaja tak diberi pemilik — ia diharapkan GAGAL, jadi tak pernah
      // menghasilkan baris. Ditandai `expect(...).rejects` di sekitarnya.
      const sekitar = baris.slice(Math.max(0, i - 3), i + 4).join(' ')
      if (/rejects|toThrow|expect\(\s*(async|\(\)|c\.query)/.test(sekitar)) continue

      temuan.push({ di: `${f}:${i + 1}`, isi: baris[i].trim().slice(0, 96) })
    }
  }
}

console.log('')
if (temuan.length === 0) {
  console.log(`✅ Fixture company: ${diperiksa} berkas membuat companies · nol yang yatim` +
    (dilewatiSchemaTest ? ` (${dilewatiSchemaTest} pakai schema test terisolasi)` : ''))
  process.exit(0)
}

console.log(`❌ ${temuan.length} fixture company TANPA owner_user_id.\n`)
console.log('   Akar grup tanpa pemilik melanggar invariant yang ditegakkan')
console.log('   `t9-kelola-badan-usaha`. Karena CI menjalankan enam shard atas')
console.log('   SATU basis, fixture ini menjatuhkan test berkas LAIN dengan')
console.log('   pesan yang tak berhubungan — sudah terjadi tiga kali.\n')
console.log('   Perbaikan: sertakan `owner_user_id` saat membuatnya.\n')
console.log('       INSERT INTO companies (code, name, owner_user_id)')
console.log('       VALUES ($1, $2, (SELECT id FROM users LIMIT 1))\n')
for (const t of temuan) {
  console.log(`   ${t.di}`)
  console.log(`      ${t.isi}\n`)
}
process.exit(1)
