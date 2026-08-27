#!/usr/bin/env node
// ============================================================================
// PEMBACAAN PENUH TAK BOLEH TERPOTONG DIAM-DIAM DI 1.000 BARIS
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `utils/role-guard.ts` membaca SELURUH `role_permissions` untuk memutuskan
// apakah sebuah pencabutan izin akan mengunci sistem. Ia menulisnya begitu
// saja, tanpa paging:
//
//     const { data: rp } = await supabase
//       .from('role_permissions')
//       .select('role_id, permissions:permission_id ( key )')
//
// PostgREST memulangkan **maksimal 1.000 baris**. Tanpa galat. Tanpa penanda
// bahwa hasilnya terpotong. `data` terisi, `error` null, kodenya jalan terus.
//
// Tabel itu sudah 1.640 baris sejak katalog role konstruksi (migrasi 364),
// jadi 640 baris terakhir tak pernah terbaca. Role yang sebenarnya memegang
// izin kritikal terbaca `permissionKeys: []`, penjaga anti-lockout
// menyimpulkan "tak ada yang kehilangan apa-apa", dan **pencabutan yang
// seharusnya ditolak diloloskan** — persis lockout yang ia dirancang cegah.
//
// ── Kenapa ini nyaris lolos sebagai "test flaky"
//
// Gejalanya berselang-seling: merah, hijau, merah pada run berturut-turut
// dengan keadaan basis yang IDENTIK (sudah diukur — 217/217 izin sebelum dan
// sesudah tiap run). Yang bergeser bukan datanya melainkan baris mana yang
// kebetulan masuk 1.000 pertama; urutan fisik itu berubah tiap ada tulisan
// ke tabel.
//
// Test yang merah-hijau bergantian nyaris selalu dibaca sebagai cacat test.
// Di sini ia laporan jujur tentang penjaga yang bocor.
//
// ── Yang dijaga, dan kenapa BUKAN pemindai teks
//
// Memindai `.from(...).select(...)` tanpa `.range()` menghasilkan ratusan
// positif palsu: sebagian besar pembacaan memang disaring ke satu baris atau
// satu proyek, dan tak akan pernah mendekati 1.000.
//
// Yang diukur di sini adalah KENYATAAN: untuk tiap tabel yang dibaca UTUH
// oleh kode (tanpa `.range`, `.limit`, `.single`, atau saringan), berapa
// baris yang benar-benar ada di basis. Kalau jumlahnya mendekati 1.000,
// pembacaan itu sudah terpotong hari ini atau akan terpotong sebentar lagi.
//
// Ambang PERINGATAN di 800 disengaja: cacat ini tak berbunyi saat terjadi,
// jadi ia harus tertangkap SEBELUM garisnya terlewati, bukan sesudah.
//
// Butuh basis. Dilewati bila DATABASE_URL tak ada (pola `audit-sod-gerbang`).
// ============================================================================

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { globSync } from 'node:fs'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireDari = createRequire(join(AKAR_API, 'package.json'))

/*
  ══════════════════════════════════════════════════════════════════════════
  `.env` DIMUAT SENDIRI — dan kenapa itu bukan kenyamanan, melainkan syarat
  ══════════════════════════════════════════════════════════════════════════

  Sampai 2026-08-27 penjaga ini TIDAK memuat `.env`. `DATABASE_URL` ADA di
  `apps/api/.env`, tetapi tak pernah masuk ke `process.env` — jadi tiap kali
  ia dijalankan (termasuk lewat `jalankan-semua-penjaga.mjs`) ia mencetak
  "DILEWATI" lalu keluar dengan exit 0.

  Hijau karena tak memeriksa apa pun. Dan yang lolos di baliknya bukan
  kemungkinan teoretis: begitu env-nya dimuat, ia langsung MERAH —
  `roles` 5.754 baris, PostgREST memulangkan 1.000, 4.754 tak pernah terbaca.

  Akibatnya nyata sampai ke pengguna: penerima notifikasi dicari lewat
  `role_permissions`, daftarnya terpotong di 1.000, dan peran yang benar-benar
  dipakai orang (`mandor`, `pm`, `admin`) berada DI LUAR potongan. Notifikasi
  `stok_menipis` tak pernah punya penerima — tanpa satu pun galat.

  Pelajaran yang sama dengan `audit-ekspor-tanpa-pemanggil`: penjaga yang
  hijau karena tak membaca apa pun lebih buruk daripada tak ada, karena ia
  menempati baris di daftar CI dan membuat orang mengira kelasnya terjaga.
*/
try {
  requireDari('dotenv').config({ path: join(AKAR_API, '.env') })
} catch { /* di CI env datang dari luar; ketiadaan dotenv bukan galat */ }

const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!DB) {
  /*
    Tetap boleh dilewati — di sebagian lingkungan basis memang tak tersedia.
    Tetapi pesannya sekarang menyebut ke mana ia sudah mencari, supaya
    "DILEWATI" tak terbaca sebagai "tak ada yang perlu diperiksa".
  */
  console.log('  ⏭  baca tak terpotong: DILEWATI — DATABASE_URL/DIRECT_URL tak ada')
  console.log(`     (sudah dicoba dari ${join(AKAR_API, '.env')})`)
  process.exit(0)
}
let pg = null
try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }
if (!pg) {
  console.log('  ⏭  baca tak terpotong: DILEWATI (pg tak ter-resolve)')
  process.exit(0)
}

const BATAS_POSTGREST = 1000
const AMBANG_PERINGATAN = 800

/*
  ── Menemukan pembacaan UTUH

  Sebuah pembacaan dianggap utuh bila rantai `.from('x').select(...)` tidak
  diikuti salah satu pembatas berikut sebelum rantainya berakhir:

    .range(  .limit(  .single(  .maybeSingle(  .eq(  .in(  .filter(  .match(

  `.eq`/`.in`/`.match` ikut dihitung sebagai pembatas karena pembacaan yang
  disaring ke satu entitas (satu proyek, satu user) tak pernah mendekati
  1.000 — memasukkannya hanya akan membanjiri laporan ini dengan derau
  sampai tak ada yang membacanya lagi.

  Yang TIDAK dianggap pembatas: `.order()` dan `.select()` sendiri. Keduanya
  tak mengurangi jumlah baris, dan `.order()` justru sering menipu pembaca
  menjadi merasa hasilnya sudah lengkap.
*/
const PEMBATAS = /\.(range|limit|single|maybeSingle|eq|in|filter|match|neq|gt|gte|lt|lte|contains|overlaps|textSearch)\s*\(/

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter(f => !f.includes('__tests__') && !f.includes('test-utils'))

/** tabel → [ {berkas, baris} ] */
const bacaanUtuh = new Map()

for (const rel of berkas) {
  const isi = readFileSync(join(AKAR_API, rel), 'utf8')
  const baris = isi.split(/\r?\n/)

  for (let i = 0; i < baris.length; i++) {
    const m = baris[i].match(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/)
    if (!m) continue
    const tabel = m[1]

    /*
      ── Kenapa jendelanya LEBAR, bukan sekadar rantai titik-bersambung

      Percobaan pertama hanya membaca rantai `.a().b().c()` sampai baris yang
      tak diawali titik. Itu menghasilkan dua positif palsu langsung:

          let q = request.db!.from('notifications').select(...)
                   .eq('user_id', user.id).range(off, off + lim - 1)
          if (is_read === 'true') q = q.eq('is_read', true)     ← DI LUAR rantai

          let q = ...from('price_book_entries').select(...).limit(limit)
          if (request.query.status) q = q.eq('status', ...)     ← DI LUAR rantai

      Query Supabase di repo ini dibangun BERTAHAP: rantai awal disimpan ke
      variabel, lalu pembatasnya ditambahkan lewat `q = q.eq(...)` di baris
      berikutnya. Membaca rantai saja berarti melewatkan justru pembatas yang
      dicari.

      Jadi yang diperiksa adalah blok 25 baris sesudah `.from(` — cukup untuk
      seluruh pola bertahap di repo ini. Positif palsu ke arah "terlalu
      longgar" jauh lebih murah daripada ke arah sebaliknya: penjaga yang
      meneriaki kode yang benar akan berhenti dibaca, dan penjaga yang tak
      dibaca sama saja dengan tak ada.
    */
    const AKHIR = Math.min(i + 25, baris.length)
    let rantai = baris[i].slice(baris[i].indexOf('.from('))
    for (let j = i + 1; j < AKHIR; j++) {
      // Berhenti bila jelas sudah masuk query LAIN — supaya pembatas milik
      // query berikutnya tak salah dikreditkan ke query ini.
      if (/\.from\(\s*['"`]/.test(baris[j])) break
      rantai += '\n' + baris[j]
    }

    if (!/\.select\s*\(/.test(rantai)) continue   // insert/update/delete — bukan pembacaan
    if (PEMBATAS.test(rantai)) continue           // sudah dibatasi

    if (!bacaanUtuh.has(tabel)) bacaanUtuh.set(tabel, [])
    bacaanUtuh.get(tabel).push({ berkas: rel.replace(/\\/g, '/'), baris: i + 1 })
  }
}

if (bacaanUtuh.size === 0) {
  console.log('✅ Baca tak terpotong: tak ada pembacaan tabel penuh tanpa pembatas')
  process.exit(0)
}

const c = new pg.Client({ connectionString: DB })
await c.connect()

const pelanggaran = []
const peringatan = []

for (const [tabel, tempat] of [...bacaanUtuh].sort()) {
  let jml
  try {
    const { rows } = await c.query(`SELECT count(*)::int n FROM public.${tabel}`)
    jml = rows[0].n
  } catch {
    continue   // bukan tabel public (view, atau nama dari string lain) — abaikan
  }
  if (jml >= BATAS_POSTGREST) pelanggaran.push({ tabel, jml, tempat })
  else if (jml >= AMBANG_PERINGATAN) peringatan.push({ tabel, jml, tempat })
}

await c.end()

for (const p of peringatan) {
  console.log(`  ⚠  ${p.tabel}: ${p.jml} baris — mendekati batas ${BATAS_POSTGREST}.`)
  for (const t of p.tempat) console.log(`     ${t.berkas}:${t.baris}`)
}

if (pelanggaran.length > 0) {
  console.error('\n❌ Pembacaan tabel penuh yang SUDAH terpotong diam-diam:\n')
  for (const p of pelanggaran) {
    console.error(`   ${p.tabel} — ${p.jml} baris, PostgREST memulangkan ${BATAS_POSTGREST}`)
    console.error(`   ${p.jml - BATAS_POSTGREST} baris tak pernah terbaca oleh:`)
    for (const t of p.tempat) console.error(`      ${t.berkas}:${t.baris}`)
    console.error('')
  }
  console.error('   PostgREST memotong TANPA galat dan TANPA penanda: `data` terisi,')
  console.error('   `error` null, kode jalan terus dengan data yang tak lengkap.\n')
  console.error('   Perbaikannya: ambil berhalaman dengan `.range(dari, dari+999)`')
  console.error('   sampai satu halaman memulangkan kurang dari ukuran halaman.')
  console.error('   JANGAN sekadar menaikkan `.limit()` — itu memindahkan ambangnya,')
  console.error('   dan cacat yang sama kembali diam-diam saat tabelnya tumbuh lagi.\n')
  console.error('   Contoh yang benar: `src/utils/role-guard.ts` (fetchRoleStates).\n')
  process.exit(1)
}

const totalTempat = [...bacaanUtuh.values()].reduce((a, v) => a + v.length, 0)
console.log(
  `✅ Baca tak terpotong: ${totalTempat} pembacaan penuh atas ${bacaanUtuh.size} tabel, semuanya di bawah ${BATAS_POSTGREST} baris`,
)
