#!/usr/bin/env node
/**
 * TAB SERAGAM — satu bentuk visual untuk satu maksud.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-08: *"style tab nya konsisten ga yaa?"*
 *
 * Tidak. Diukur: **22 berkas merender tab dengan EMPAT pola berbeda**, dan tiga
 * di antaranya menghasilkan bentuk visual yang benar-benar berlainan:
 *
 *   /akuntansi         tombol berkotak, latar navy penuh, radius 10
 *   /estimasi          garis bawah, padding 8px 12px
 *   /dokumen/kendali   garis bawah, padding 8px 14px  (komponen bersama)
 *
 * Tak ada satu pun alasan di balik perbedaannya — ia lahir karena ketiga
 * halaman ditulis pada waktu berbeda, masing-masing menyalin dari tetangganya
 * yang kebetulan terdekat.
 *
 * ── Yang dijaga: `role="tab"` WAJIB lewat `TabBagian`
 *
 * Bukan "tab harus seragam" (tak bisa diperiksa mesin), melainkan aturan yang
 * bisa diukur: berkas yang menulis `role="tab"` sendiri berarti ia menggambar
 * tabnya sendiri — dan gaya yang ditulis sendiri akan menyimpang, cepat atau
 * lambat.
 *
 * Satu pengecualian sah: `components/tab-bagian.tsx` sendiri.
 *
 * ── Yang TIDAK dijaga, dan kenapa
 *
 * `aria-pressed` sengaja DIBIARKAN. Diperiksa satu per satu, dan sebelas
 * pemakainya bukan tab:
 *
 *   mandor/absensi        pemilih nilai kehadiran (Penuh · ½ hari · Absen)
 *   pengaturan/keuangan   saklar "Aktifkan denda"
 *   proyek                pengurutan "Tenggat Terdekat"
 *   proyek/keterlambatan  saringan status
 *
 * Memaksanya jadi `role="tab"` akan MENYESATKAN pembaca layar: ia mengumumkan
 * "tab 1 dari 3" untuk pilihan yang sebenarnya nilai, bukan bagian halaman.
 * Penjaga yang menuntut keseragaman buta menghasilkan a11y yang lebih buruk.
 *
 * Pakai (dari akar repo): node apps/web/scripts/audit-tab-seragam.mjs
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/*
  Komponen bersama itu sendiri — memang di sanalah `role="tab"` ditulis.

  ── Kenapa `SegmentedTab` ikut (ditambahkan 2026-08-27)

  Portal (admin/pm/mandor) punya shell sendiri: lebar 390px, tanpa sidebar.
  `<TabBagian>` dirancang untuk dashboard — pil bergaris bawah selebar
  halaman — dan di 390px ia memenuhi seluruh baris. Portal karena itu punya
  komponen bersamanya sendiri, `SegmentedTab`, berbentuk segmen pil.

  Yang penjaga ini jaga adalah SIFATNYA, bukan nama komponennya, dan
  `SegmentedTab` memenuhi seluruhnya — diperiksa ke kodenya, bukan
  diasumsikan:

    · `role="tablist"` pada wadahnya
    · `role="tab"` + `aria-selected` pada tiap tombol
    · `minHeight: 44` (WCAG 2.5.5)
    · penanda aktif TIGA LAPIS — latar, warna teks, DAN bobot 700 —
      jadi tak bergantung warna saja (WCAG 1.4.1)

  Empat halaman yang dilaporkan melanggar (`gl` dan `pengadaan-lanjutan` di
  dua portal) hanya MEMAKAI komponen ini. Menuruti laporannya berarti
  memindahkan portal ke `<TabBagian>` yang tak muat di layarnya — merusak
  tampilan demi menghijaukan penjaga.

  ⚠ Daftar ini menerima berkas berdasarkan JALURNYA, jadi ia hanya sah
  selama isinya masih memenuhi keempat sifat di atas. Kalau `SegmentedTab`
  kelak kehilangan `aria-selected` atau penanda non-warnanya, penjaga ini
  TIDAK akan berbunyi. Yang menjaganya di situ adalah `a11y-ratchet` dan
  audit a11y runtime (axe-core), bukan berkas ini.
*/
const SAH = new Set([
  'apps/web/components/tab-bagian.tsx',
  'apps/web/components/portal/SegmentedTab.tsx',
  /*
    ── Dua halaman pengadaan-lanjutan: ARIA-nya LEBIH LENGKAP dari komponen

    Keduanya menulis `role="tab"` sendiri, dan pemindahannya ke
    `SegmentedTab` akan MENURUNKAN aksesibilitasnya — bukan menaikkan:

        halaman ini      role=tablist + aria-label + id + aria-controls
        SegmentedTab     role=tablist + aria-selected  (tanpa aria-controls)

    `aria-controls` menautkan tiap tab ke panel isinya. Tanpa itu pembaca
    layar tahu ada tab terpilih tetapi tidak tahu bagian mana yang berubah.

    Yang benar-benar kurang di sini hanya sasaran sentuhnya (`minHeight: 32`,
    di bawah 44px WCAG 2.5.5) — dan ITU yang diperbaiki 2026-08-27, bukan
    polanya.

    Arah yang benar sebaliknya: `SegmentedTab` kelak menerima `aria-controls`,
    lalu keduanya pindah ke sana. Sampai itu terjadi, memaksa pindah berarti
    membuang ARIA yang sudah benar demi menghijaukan penjaga.
  */
  'apps/web/app/admin-portal/keuangan/pengadaan-lanjutan/page.tsx',
  'apps/web/app/pm-portal/keuangan/pengadaan-lanjutan/page.tsx',
])

const berkas = execSync(
  'find apps/web/app apps/web/components -name "*.tsx"',
  { cwd: AKAR, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)

const pelanggar = []
let pemakaiKomponen = 0

for (const f of berkas) {
  const isi = readFileSync(join(AKAR, f), 'utf8')
  const pakaiKomponen = /TabBagian/.test(isi)
  const tulisSendiri = /role="tab"/.test(isi)

  if (pakaiKomponen && !SAH.has(f)) pemakaiKomponen++
  if (!tulisSendiri || SAH.has(f)) continue

  // Menulis `role="tab"` sendiri DAN tak memakai komponen = menggambar tab
  // sendiri. Kalau ia memakai keduanya, kemungkinan sedang dipindahkan —
  // tetap dilaporkan supaya tak tertinggal setengah jalan.
  pelanggar.push({ f, jugaPakaiKomponen: pakaiKomponen })
}

console.log('\n══ Tab seragam ═══════════════════════════════════════════════')
console.log(`  berkas .tsx dipindai   : ${berkas.length}`)
console.log(`  memakai <TabBagian>    : ${pemakaiKomponen}`)
console.log(`  menulis role="tab" sendiri: ${pelanggar.length}`)

if (pelanggar.length) {
  console.error('\n❌ MERAH — tab digambar sendiri, tak lewat komponen bersama:')
  for (const p of pelanggar) {
    console.error(`     ${p.f}${p.jugaPakaiKomponen ? '  (setengah dipindahkan)' : ''}`)
  }
  console.error('\n   Pakai <TabBagian> dari @/components/tab-bagian.')
  console.error('   Ia sudah menangani role="tablist" + aria-selected + data-tab,')
  console.error('   dan tiga penanda aktif sekaligus (warna, tebal, garis bawah)')
  console.error('   supaya tak bergantung warna saja — WCAG 1.4.1.')
  console.error('')
  console.error('   Kalau yang Anda buat BUKAN tab melainkan saringan/saklar/')
  console.error('   pemilih nilai, jangan pakai role="tab" sama sekali:')
  console.error('   `aria-pressed` lebih tepat, dan itu tidak diperiksa di sini.')
  process.exit(1)
}

console.log('\n✅ Semua tab lewat komponen bersama.\n')
process.exit(0)
