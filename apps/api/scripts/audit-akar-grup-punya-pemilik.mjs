#!/usr/bin/env node
/**
 * PENJAGA — akar grup AKTIF wajib punya pemilik, dan teardown test tak boleh
 * memakai `DELETE` yang pasti ditolak.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-14 dari test merah `t9-kelola-badan-usaha`:
 *
 *     ada akar grup tanpa pemilik: expected 3 to be 0
 *
 * Berkas yang merah TIDAK PERNAH membuat satu pun dari ketiga tenant itu.
 * Pembuatnya tiga berkas LAIN (`kuota-penyimpanan`, `gerbang-modul`,
 * `baca-saja`), yang membongkar tenant ujinya begini:
 *
 *     await supabase.from('companies').delete().eq('id', companyId)
 *
 * ── Kenapa itu TAK PERNAH berhasil, dan tak seorang pun tahu
 *
 * Trigger `fn_company_no_casual_delete` (migrasi 126 §8) menolak penghapusan
 * company — dan ia BENAR: *"untuk tenant, penghapusan harus jadi keputusan
 * sadar, bukan efek samping"*.
 *
 * Galatnya DITELAN. `supabase-js` memulangkan `{ error }` alih-alih melempar,
 * dan ketiga pemanggilan itu tak memeriksanya. Jadi teardown "berhasil"
 * dengan tenang, tiap jalan suite menambah satu tenant AKTIF tanpa pemilik,
 * dan gejalanya muncul di berkas lain berbulan-bulan kemudian.
 *
 * Kelas yang dijaga `audit-catch-senyap.mjs` di kode produksi — hanya saja
 * ini di TEST, tempat penjaga itu tak melihat.
 *
 * ── Dua arah yang dijaga
 *
 * 1. **Keadaan**: nol akar grup AKTIF tanpa `owner_user_id`. Akar yatim
 *    membuat `t9` merah, dan lebih jauh: grup tanpa pemilik tak bisa
 *    ditambahi badan usaha oleh siapa pun lewat UI.
 *
 * 2. **Bentuk kode**: nol `from('companies').delete(` di berkas test.
 *    Menjaga keadaannya saja tak cukup — pola itu akan kembali, dan
 *    residunya baru terlihat sesudah menumpuk.
 *
 * ⚠ Yang dihitung hanya akar AKTIF. Company NONAKTIF sengaja dilewati, dan
 * alasannya tertulis di `t9` sendiri: ia tak bisa ditambahi badan usaha oleh
 * siapa pun, jadi menuntutnya punya pemilik berarti menuntut perbaikan atas
 * keadaan yang tak merugikan siapa pun — sambil menutupi kalau suatu saat ada
 * akar AKTIF yang benar-benar yatim.
 *
 * ⚠ BATAS: yang dibaca KEADAAN BASIS + BENTUK KODE. Ia tak tahu apakah
 * teardown-nya benar-benar dipanggil saat test gagal di tengah.
 *
 * Butuh basis, jadi TAK BOLEH ditabelkan di CLAUDE.md §6.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SRC = join(AKAR, 'apps', 'api', 'src')

/* ── 1. BENTUK KODE — `DELETE` company di test tak pernah berhasil ───────── */
const pelanggarKode = []

function sisir(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      sisir(p)
      continue
    }
    if (!e.endsWith('.test.ts')) continue
    const isi = readFileSync(p, 'utf8')
    isi.split('\n').forEach((baris, i) => {
      if (/from\(\s*['"]companies['"]\s*\)\s*\.delete\s*\(/.test(baris.replace(/\r/g, ''))) {
        pelanggarKode.push(`${p.slice(AKAR.length + 1)}:${i + 1}`)
      }
    })
  }
}
sisir(SRC)

/* ── 2. KEADAAN BASIS ─────────────────────────────────────────────────────── */
const c = buatClient()
await c.connect()

try {
  const { rows } = await c.query(`
    SELECT id, name, code FROM public.companies
     WHERE is_active AND parent_company_id IS NULL AND owner_user_id IS NULL
     ORDER BY name`)

  console.log('── akar grup punya pemilik ──')
  console.log(`  test ber-DELETE companies : ${pelanggarKode.length}`)
  console.log(`  akar AKTIF tanpa pemilik  : ${rows.length}`)

  let gagal = false

  if (pelanggarKode.length > 0) {
    gagal = true
    console.error('\n❌ Teardown test memakai `companies.delete()` — TAK PERNAH berhasil.')
    for (const p of pelanggarKode) console.error(`   ${p}`)
    console.error('\n   Trigger `fn_company_no_casual_delete` (migrasi 126 §8) menolaknya,')
    console.error('   dan `supabase-js` MEMULANGKAN galat alih-alih melempar — jadi')
    console.error('   teardown-nya "berhasil" dengan tenang sambil meninggalkan tenant.')
    console.error('\n   Pakai `bongkarCompanyUji()` dari src/test-utils/bongkar-company-uji.ts')
    console.error('   (menonaktifkan, dan MELEMPAR kalau gagal).')
  }

  if (rows.length > 0) {
    gagal = true
    console.error(`\n❌ ${rows.length} akar grup AKTIF tanpa pemilik:`)
    for (const r of rows) console.error(`   ${r.name}  (${r.code})`)
    console.error('\n   Grup tanpa pemilik tak bisa ditambahi badan usaha lewat UI, dan')
    console.error('   memerahkan `t9-kelola-badan-usaha` — berkas yang tak membuatnya.')
    console.error('\n   Kalau ini residu test: nonaktifkan barisnya.')
  }

  if (gagal) process.exit(1)
  console.log('\n✅ Nol akar grup yatim · nol teardown ber-DELETE company.')
} finally {
  await c.end()
}
