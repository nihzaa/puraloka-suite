#!/usr/bin/env node
/**
 * IKON MENU — dua arah, ambang NOL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder sudah memutuskan aturannya, dan keputusannya tertulis di DUA tempat
 * kode — tetapi hanya sebagai KOMENTAR, dan komentar tak menahan siapa pun:
 *
 *   apps/web/lib/ikon-menu.tsx
 *     "Sub-menu SENGAJA seragam: 202 ikon berbeda justru menghapus fungsi
 *      ikon sebagai penanda — saat semuanya bergambar, tak ada yang menonjol."
 *
 *   apps/web/components/sidebar.tsx
 *     "Submenu TETAP memakai titik, bukan ikon sendiri-sendiri. … ikonnya
 *      jadi tinta tanpa informasi."
 *
 * Diukur 2026-09-15, sesudah kedua komentar itu berumur lebih dari sebulan:
 * SEPULUH sub-menu aktif memakai ikon sendiri. Aturan yang hanya tertulis di
 * dokumen (atau di komentar) akan dilanggar oleh orang yang tak pernah membaca
 * dokumen itu — termasuk oleh generator migrasi menu.
 *
 * ── ARAH (b): yang sesungguhnya mahal
 *
 * Ketaksamaan gaya bisa dilihat. Yang tak bisa dilihat ini:
 *
 *     export function ikonMenu(nama) { return IKON_MENU[nama] ?? FolderKanban }
 *
 * Nama ikon yang TIDAK terdaftar di `IKON_MENU` tidak gagal — ia terender
 * sebagai FOLDER. Bukan ikon yang hilang (itu terlihat), melainkan penanda
 * yang KELIRU dan sepenuhnya masuk akal bagi yang belum pernah melihat yang
 * benar. Nol galat, nol test merah, `tsc` hijau: kolom `icon` bertipe `text`,
 * jadi TIAP string adalah nilai yang sah.
 *
 * Diukur pada hari yang sama: SEMBILAN nama ikon aktif tak terdaftar. Tujuh
 * pada sub-menu (diselesaikan migrasi 582 dengan menjadikannya `Dot`) dan
 * DUA pada INDUK — `g-akuntansi` (BookOpen) dan `g-alat-dokumen` (Wrench).
 * Yang dua itu tak punya jalan keluar `Dot`: ikon grup adalah satu-satunya
 * penanda visual sidebar sesudah sub-menu diseragamkan, jadi mereka HARUS
 * didaftarkan.
 *
 * Arah (a) saja tak akan pernah menemukan yang dua itu — mereka INDUK, dan
 * induk memang boleh berikon. Cacatnya hidup di CELAH antara "sub-menu wajib
 * Dot" dan "nama ikon wajib ada": ikon induk yang salah nama lolos keduanya
 * kalau hanya salah satu yang diperiksa.
 *
 * ── Arah KETIGA: nama yang terdaftar tapi bukan ikon lucide
 *
 * `IKON_MENU` dibaca sebagai TEKS di sini (mengimpor TSX dari Node menuntut
 * seluruh rantai build), jadi ia bisa memuat nama yang salah ketik dan tak
 * pernah ada di `lucide-react`. Itu tak akan tertangkap arah (b) — nama yang
 * sama salahnya ada di kedua sisi, dan dua daftar yang sama-sama salah cocok
 * dengan sempurna. Maka tiap kunci diadu dengan `lucide-react` sungguhan.
 *
 * ── Yang SENGAJA tidak diperiksa
 *
 * Baris NON-AKTIF. 216 di antaranya tak pernah tergambar di sidebar mana pun,
 * dan memerahkan penjaga atas ikon yang tak seorang pun lihat akan membuat
 * seluruh keluarannya diabaikan — lalu ia berhenti menjaga tanpa gejala.
 *
 * ── Batas
 *
 * ⚠ Yang dibaca KEPUTUSAN DI KODE & DI BASIS, bukan piksel. Penjaga ini tak
 * tahu apakah ikonnya COCOK dengan arti menunya (`Plane` untuk klaim
 * perjalanan masuk akal; `Hash` untuk penomoran juga) — hanya bahwa ia benar
 * ada dan sub-menu seragam. Yang begitu cuma ketahuan dari MEMOTRET.
 *
 * ⚠ DB tak terhubung → exit 0 dan MENGATAKANNYA. Arah (c) — kunci IKON_MENU
 * vs lucide — tetap dijalankan, sebab ia tak butuh basis sama sekali.
 *
 * Pakai (dari akar repo atau dari apps/api):
 *   node apps/api/scripts/audit-ikon-menu-benar.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { buatClient, adaKoneksi } from '../../../scripts/db/_koneksi.mjs'

/*
  Akar repo diturunkan dari LOKASI BERKAS INI, bukan dari `process.cwd()`.
  `jalankan-semua-penjaga.mjs` memanggil penjaga dari cwd `apps/api`, dan
  `audit-akhir-baris.mjs` sudah pernah BUTA total karena selisih itu —
  melewatkan berkasnya tanpa suara sambil melapor exit 0.
*/
const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const IKON_TSX = join(AKAR, 'apps', 'web', 'lib', 'ikon-menu.tsx')
const JATUHAN = 'FolderKanban'

console.log('── Ikon menu: sub-menu seragam + tiap nama terdaftar ──\n')

// ── Sisi TS: kunci tabel IKON_MENU ──────────────────────────────────────────
//
// Dibaca sebagai TEKS. Mengimpor TSX dari Node menuntut path alias `@/`,
// "use client", dan seluruh rantai build — ketergantungan yang membuat penjaga
// mati oleh perubahan yang tak ada hubungannya dengan apa yang dijaganya.
const sumber = readFileSync(IKON_TSX, 'utf8')
const mulai = sumber.indexOf('IKON_MENU')
const buka = mulai < 0 ? -1 : sumber.indexOf('{', mulai)
const tutup = buka < 0 ? -1 : sumber.indexOf('\n};', buka)
if (mulai < 0 || buka < 0 || tutup < 0) {
  console.error('MERAH: bentuk `IKON_MENU` di ikon-menu.tsx tak dikenali.')
  console.error('  Penjaga yang tak bisa membaca sasarannya WAJIB merah, bukan hijau —')
  console.error('  hijau di sini berarti "saya tak memeriksa apa pun".')
  process.exit(1)
}
const TERDAFTAR = new Set(
  sumber.slice(buka + 1, tutup)
    .replace(/\/\*[\s\S]*?\*\//g, '')   // komentar blok
    .replace(/\/\/[^\n]*/g, '')         // komentar baris — kalau tidak, kata di
    .split(/[,\n]/)                     // dalamnya terbaca sebagai nama ikon
    .map((s) => s.trim().replace(/:.*$/, ''))
    .filter((s) => /^[A-Z][A-Za-z0-9]*$/.test(s)),
)
console.log(`IKON_MENU memuat ${TERDAFTAR.size} nama.`)
if (TERDAFTAR.size < 10) {
  console.error(`\nMERAH: hanya ${TERDAFTAR.size} nama terbaca — pembacaan teksnya patah.`)
  process.exit(1)
}

let merah = false

// ── Arah (c): tiap kunci wajib benar-benar ada di lucide-react ──────────────
const require_ = createRequire(join(AKAR, 'apps', 'web', 'package.json'))
let lucide = null
try {
  lucide = require_('lucide-react')
} catch {
  console.log('⏭  `lucide-react` tak bisa dimuat — arah (c) DILEWATI, bukan LULUS.')
}
if (lucide) {
  const hantu = [...TERDAFTAR].filter((n) => !lucide[n]).sort()
  if (hantu.length) {
    console.error(`\nMERAH (c) — ${hantu.length} kunci IKON_MENU tak ada di lucide-react:`)
    for (const n of hantu) console.error(`   ${n}`)
    console.error('  Kunci yang tak pernah ada di lucide meneruskan `undefined` ke React.')
    merah = true
  } else {
    console.log(`✅ (c) ${TERDAFTAR.size} kunci semuanya ikon lucide sungguhan.`)
  }
}

// ── Sisi DB ─────────────────────────────────────────────────────────────────
//
// ⚠ `adaKoneksi()` DULU. `buatClient()` melakukan `process.exit(2)` saat DSN
// tak ada, dan `process.exit` TIDAK bisa ditangkap `try/catch` — enam penjaga
// di repo ini pernah menjanjikan "DILEWATI dengan jujur" di komentarnya dan
// mati keras exit 2 (lihat kepala `scripts/db/_koneksi.mjs`).
if (!adaKoneksi()) {
  console.log('\n⏭  DILEWATI arah (a)+(b) (tak ada DIRECT_URL/DATABASE_URL) — bukan LULUS.')
  process.exit(merah ? 1 : 0)
}

const db = buatClient()
await db.connect()
try {
  /*
    `public.` ditulis eksplisit bukan karena kehati-hatian berlebih: basis ini
    punya skema `test` dan `extensions` yang membayangi 14 tabel `public`
    bernama sama, dan pembacaan tanpa saringan bisa menjawab BENAR secara
    kebetulan dari baris skema yang salah.
  */
  const { rows } = await db.query(`
    SELECT key, label, icon, href, (parent_id IS NULL) AS induk
      FROM public.menu_items
     WHERE is_active
     ORDER BY induk DESC, key`)

  console.log(`\nBaris menu AKTIF: ${rows.length} `
    + `(${rows.filter((r) => r.induk).length} induk, `
    + `${rows.filter((r) => !r.induk).length} sub-menu)`)

  // ── Arah (a): sub-menu aktif wajib `Dot` ──────────────────────────────────
  const anakBeda = rows.filter((r) => !r.induk && r.icon !== 'Dot')
  if (anakBeda.length) {
    console.error(`\nMERAH (a) — ${anakBeda.length} sub-menu aktif berikon sendiri:`)
    for (const r of anakBeda) {
      console.error(`   ${String(r.key).padEnd(24)} icon=${String(r.icon).padEnd(16)} ${r.label}`)
    }
    console.error('  Aturan founder: sub-menu memakai titik (`Dot`).')
    console.error('  Saat semuanya bergambar, ikon berhenti jadi pembeda — lihat')
    console.error('  apps/web/components/sidebar.tsx & apps/web/lib/ikon-menu.tsx.')
    console.error("  Perbaikan: migrasi maju yang menyetel icon='Dot' (pola 582).")
    merah = true
  } else {
    console.log('✅ (a) seluruh sub-menu aktif memakai `Dot`.')
  }

  // ── Arah (b): tiap nama ikon wajib terdaftar ──────────────────────────────
  //
  // Inilah yang menangkap jatuhan diam `?? FolderKanban`. Diperiksa untuk
  // INDUK maupun ANAK: membatasinya ke sub-menu akan melewatkan persis dua
  // kasus yang melahirkan penjaga ini.
  const jatuh = rows.filter((r) => r.icon && !TERDAFTAR.has(r.icon))
  const kosong = rows.filter((r) => !r.icon)
  if (jatuh.length) {
    console.error(`\nMERAH (b) — ${jatuh.length} menu memakai nama ikon yang TAK TERDAFTAR:`)
    for (const r of jatuh) {
      console.error(`   ${(r.induk ? '[INDUK]' : '[anak]').padEnd(8)}`
        + `${String(r.key).padEnd(24)} icon=${String(r.icon).padEnd(16)} ${r.label}`)
    }
    console.error('')
    console.error(`  Semuanya terender sebagai ${JATUHAN} — ikon yang SAMA satu sama lain,`)
    console.error(`  tanpa satu pun galat. \`ikonMenu()\` berakhir \`?? ${JATUHAN}\`.`)
    console.error('  Perbaikan: daftarkan di apps/web/lib/ikon-menu.tsx (untuk INDUK),')
    console.error('  atau jadikan `Dot` lewat migrasi maju (untuk sub-menu).')
    merah = true
  } else {
    console.log('✅ (b) tiap nama ikon menu aktif terdaftar di IKON_MENU.')
  }
  if (kosong.length) {
    console.error(`\nMERAH (b) — ${kosong.length} menu aktif tanpa nama ikon sama sekali:`)
    for (const r of kosong) console.error(`   ${String(r.key).padEnd(24)} ${r.label}`)
    merah = true
  }
} finally {
  await db.end()
}

console.log()
if (merah) {
  console.error('AMBANG NOL — penjaga MERAH.\n')
  process.exit(1)
}
console.log('✅ Ikon menu benar di ketiga arah.\n')
process.exit(0)
