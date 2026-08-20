#!/usr/bin/env node
/**
 * JALANKAN AUDIT A11Y DENGAN CAKUPAN PENUH — termasuk rute dinamis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-a11y-runtime.mjs` sudah bisa memindai rute `[id]` sejak 2026-08-07:
 * ia membaca `LAYAR_ID_PROYEK`, `LAYAR_ID_MANDOR`, dan tiga env lain.
 *
 * Dan selama enam hari, ketujuh rute itu TETAP dilaporkan "TERLEWAT" di
 * setiap jalan — bukan karena mekanismenya rusak, tapi karena siapa pun yang
 * menjalankannya tak tahu id apa yang harus diisikan. Termasuk saya:
 * 2026-08-13 saya melaporkan "129 halaman, 0 pelanggaran" dua kali berturut
 * sambil melewati `/proyek/[id]` — halaman terkaya di aplikasi ini.
 *
 * Mekanisme yang benar tapi tak terpakai sama tak bergunanya dengan yang
 * tak ada. Skrip ini mengambil id-nya SENDIRI dari basis, jadi menjalankan
 * audit lengkap tak lagi menuntut siapa pun mengingat empat nama env dan
 * cara mendapatkan nilainya.
 *
 * ── Kenapa tidak digabung ke `audit-a11y-runtime.mjs` saja
 *
 * Berkas itu tak boleh menyentuh basis data. Ia dijalankan terhadap SEBUAH
 * URL — bisa staging, bisa mesin lain — dan basis yang tersambung belum
 * tentu basis yang melayani URL itu. Id dari basis yang salah menghasilkan
 * 404 yang dipindai sambil tampak berhasil, persis kegagalan yang
 * diperingatkan komentar `CONTOH_ID` di sana.
 *
 * Pemisahan ini membuat asumsinya eksplisit: skrip INI mengasumsikan basis
 * dan web menunjuk lingkungan yang sama; `audit-a11y-runtime.mjs` tidak
 * mengasumsikan apa pun.
 *
 * ── BATAS YANG TERSISA: tiga rute butuh PERAN LAIN
 *
 * Diukur 2026-08-13 dengan akun admin, id nyata terisi semua:
 *
 *     /portal/proyek/[id]      -> /dashboard   (halaman khusus klien)
 *     /pm-portal/proyek/[id]   -> /dashboard   (khusus PM)
 *     /verify/invoice/[id]     -> /dashboard
 *
 * Ketiganya BUKAN dilewati skrip — mereka dicoba, lalu dialihkan karena
 * perannya tak cocok. Hasilnya sama saja: tak teraudit. Untuk menutupnya
 * perlu satu akun uji per peran (klien, PM), dan itu keputusan data uji,
 * bukan perubahan skrip.
 *
 * Sampai itu ada: **angka "N halaman, 0 pelanggaran" dari skrip ini TIDAK
 * mencakup portal klien maupun portal PM.** Menyebut angkanya tanpa kalimat
 * ini membuat cakupan terbaca lebih luas daripada kenyataannya.
 *
 * Pakai:
 *   LAYAR_EMAIL=… LAYAR_SANDI=… node apps/web/scripts/jalankan-a11y-lengkap.mjs
 *   LAYAR_BASIS=http://localhost:3098 … (bila web tak di :3000)
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')

if (!process.env.LAYAR_EMAIL || !process.env.LAYAR_SANDI) {
  console.error(
    '\n❌ LAYAR_EMAIL / LAYAR_SANDI belum diisi.\n\n' +
    '   Tanpa sesi ber-login, audit hanya melihat halaman publik dan keluar 0 —\n' +
    '   hijau yang tak membuktikan apa pun.\n',
  )
  process.exit(2)
}

/**
 * Satu query per rute dinamis. Kalau salah satu gagal, rutenya tetap
 * terlewat — dan itu DILAPORKAN, bukan dibiarkan senyap.
 */
const PERTANYAAN = [
  ['LAYAR_ID_PROYEK', 'select id from projects order by created_at desc limit 1'],
  ['LAYAR_ID_INVOICE', 'select id from invoices order by created_at desc limit 1'],
  // TIDAK ADA tabel `mandors`: mandor adalah pengguna berperan mandor, dan
  // id yang dipakai `/mandor/[id]` hidup di tabel penugasan.
  ['LAYAR_ID_MANDOR', 'select mandor_id from mandor_assignments limit 1'],
  ['LAYAR_KUNCI_MENU', "select key from menu_items where is_active and href is not null limit 1"],
  // Portal PM Lengkap Tahap 3, Task 19 — detail RAB (`/pm-portal/cecep/rab/[id]`).
  ['LAYAR_ID_RAB', 'select id from estimate_versions order by created_at desc limit 1'],
  // Portal PM Lengkap Tahap 3, Task 20 — detail RAP (`/pm-portal/cecep/rap/[id]`).
  ['LAYAR_ID_RAP', 'select id from rap_budget order by created_at desc limit 1'],
  // Portal PM Lengkap Tahap 4, Task 24 — detail MR/PO
  // (`/pm-portal/procurement/mr/[id]`, `/pm-portal/procurement/po/[id]`).
  ['LAYAR_ID_MR', 'select id from material_requests order by created_at desc limit 1'],
  ['LAYAR_ID_PO', 'select id from purchase_orders order by created_at desc limit 1'],
]

const env = { ...process.env }
const gagal = []

// `pathToFileURL`, bukan jalur mentah: di Windows `E:\…` bukan URL sah untuk
// `import()` dan Node menolaknya dengan ERR_UNSUPPORTED_ESM_URL_SCHEME —
// mengira `E:` sebagai nama protokol.
const { buatClient } = await import(pathToFileURL(join(AKAR, 'scripts', 'db', '_koneksi.mjs')).href)
const db = buatClient()
await db.connect()
for (const [nama, sql] of PERTANYAAN) {
  if (env[nama]) continue          // nilai dari luar menang — untuk staging
  try {
    const r = await db.query(sql)
    const nilai = Object.values(r.rows[0] ?? {})[0]
    if (nilai) { env[nama] = String(nilai); console.log(`  ${nama} = ${nilai}`) }
    else gagal.push(`${nama} — query tak mengembalikan baris (basis kosong?)`)
  } catch (e) {
    gagal.push(`${nama} — ${e.message.slice(0, 70)}`)
  }
}
await db.end()

if (gagal.length) {
  console.log(`\n⚠ ${gagal.length} id tak didapat; rutenya akan tetap TERLEWAT:`)
  for (const g of gagal) console.log(`   ${g}`)
}

console.log('')
const hasil = spawnSync(
  process.execPath,
  [join(__dirname, 'audit-a11y-runtime.mjs')],
  { cwd: AKAR, env, stdio: 'inherit' },
)
process.exit(hasil.status ?? 1)
