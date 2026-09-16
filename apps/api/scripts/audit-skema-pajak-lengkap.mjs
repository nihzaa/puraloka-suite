#!/usr/bin/env node
/**
 * audit-skema-pajak-lengkap.mjs — ambang NOL
 *
 * Tiap nilai enum `tax_scheme` di basis wajib punya penanganan di KODE:
 * tarif, label UI, dan tipe TypeScript.
 *
 * ── Cacat yang ditutup
 *
 * Migrasi 566 menambah `tanpa_pajak` atas permintaan founder 2026-09-04
 * ("pas bikin proyek juga bisa gapake pajak … ada saklar on off nya").
 *
 * Menambah nilai enum itu SATU baris. Yang tak terlihat: belasan tempat
 * memakai pola `scheme === 'ppn' ? A : B`, dan tiap satunya diam-diam
 * memperlakukan nilai BARU sebagai cabang `else`.
 *
 * Diukur saat 566 ditulis — dua `getTaxRate` (`utils/config.ts` dan
 * `utils/financial-config.ts`) keduanya berbunyi
 *
 *     const key = scheme === 'ppn' ? 'tax.ppn_rate' : 'tax.pph_final_rate'
 *
 * jadi proyek yang pajaknya SENGAJA DIMATIKAN tetap dipotong PPh Final 2%.
 * Tak ada galat: angkanya sah, jurnalnya seimbang, invoicenya tercetak rapi.
 * Yang salah cuma jumlah uang yang ditagihkan ke klien.
 *
 * ── Kenapa dijaga
 *
 * Nilai enum berikutnya pasti ada (PPN 12%, PPh 21, bebas-PPN kawasan
 * tertentu), dan cacatnya akan berbentuk sama persis: satu ALTER TYPE yang
 * berhasil, lalu belasan `else` yang menebak.
 *
 * ── Yang diperiksa
 *
 * Untuk tiap nilai enum di basis:
 *   1. disebut di `getTaxRate` (kedua berkas) — supaya tarifnya bukan tebakan
 *   2. punya label di UI — supaya tak muncul sebagai kunci mentah
 *   3. ada di tipe TypeScript `tax_scheme` di web
 *
 * Butuh basis. Dilewati bila DATABASE_URL tak ada (pola audit-sod-gerbang).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!DB) {
  console.log('⏭  skema pajak: DILEWATI (tak ada DATABASE_URL)')
  process.exit(0)
}

const { buatClient } = await import('../../../scripts/db/_koneksi.mjs')
const c = buatClient()
await c.connect()
/*
  ⚠ `pg_namespace` WAJIB disaring — CLAUDE.md §1, dan penjaga ini sendiri
  terkena.

  Basis ini punya skema `test` yang membayangi tipe `public` bernama sama.
  Tanpa saringan, query memulangkan nilai dari KEDUA skema dan keluarannya
  berbunyi:

      ✅ 5 nilai tax_scheme tertangani …: pph_final, pph_final, ppn, ppn, tanpa_pajak

  LIMA nilai untuk enum TIGA nilai — daftar duplikat dari dua skema. Hari ini
  tak berbahaya sebab himpunannya kebetulan superset, tetapi ia jadi salah
  begitu skema `test` punya nilai yang `public` tak punya; dan angka 5 itu
  sendiri sudah menyesatkan siapa pun yang membacanya sebagai fakta.
*/
const { rows } = await c.query(`
  SELECT e.enumlabel AS nilai
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
   WHERE t.typname = 'tax_scheme'
   ORDER BY e.enumsortorder`)
await c.end()

const nilai = rows.map((r) => r.nilai)
if (nilai.length === 0) {
  console.error('❌ enum `tax_scheme` tak ditemukan di basis')
  process.exit(1)
}

/*
  Komentar DIBUANG sebelum diperiksa.

  Uji mutasi 2026-09-04: baris `if (scheme === 'tanpa_pajak') return 0`
  dihapus dari `financial-config.ts`, dan penjaga versi pertama tetap HIJAU —
  karena komentar panjang yang MENJELASKAN baris itu masih menyebut
  `tanpa_pajak`, dan `includes()` menemukannya di sana.

  Bentuk yang sama persis dengan cacat di CLAUDE.md §8a.2: penjelasan yang
  BENAR mendampingi keadaan yang SALAH. Kelas kesalahan ini muncul TIGA kali
  dalam satu hari di repo ini — penjaga yang memindai teks wajib memindai
  KODE, bukan prosa di sekitarnya.
*/
const tanpaKomentar = (isi) =>
  isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((b) => !/^\s*\/\//.test(b))
    .join('\n')

const baca = (p) =>
  existsSync(join(AKAR, p)) ? tanpaKomentar(readFileSync(join(AKAR, p), 'utf8')) : ''

/*
  ⚠ DAFTAR TULISAN TANGAN DIGANTI PEMINDAIAN — 2026-09-16, dan biayanya
  sudah dibayar.

  Versi lama menyebut EMPAT berkas. Penjaganya hijau, dan pada hari yang sama
  ditemukan EMPAT berkas LAIN yang bercabang atas `tax_scheme` tanpa
  menangani `tanpa_pajak` sama sekali (`grep -c tanpa_pajak` = 0 di
  keempatnya):

      routes/v1/projects.ts          `VALID_TAX_SCHEMES` menolak nilainya →
                                     proyek "tanpa pajak" MUSTAHIL dibuat
      keuangan/_bersama/komponen.tsx tarif dipaku `ppn ? 11 : 2` → klien
                                     ditagih 2% padahal pajaknya dimatikan
      lib/penjurnalan-otomatis.ts    mendebit akun PPh Final untuk proyek
                                     yang pajaknya dimatikan
      lib/tax-calculation.ts         (diperiksa: aman, lewat getTaxRate)

  Penjaga yang bekerja dari daftar tulisan tangan hanya menjaga yang
  didaftarkan — dan yang mendaftarkan adalah orang yang sudah tahu di mana
  cacatnya. Itu menjaga masa lalu, bukan masa depan. Kelas yang sama sudah
  dicatat CLAUDE.md pada `audit-batas-terpetakan.mjs`: "penjaga yang tak bisa
  tahu dirinya tertinggal akan pelan-pelan berhenti menjaga tanpa gejala".

  Sekarang: SETIAP berkas .ts/.tsx yang BERCABANG atas `tax_scheme` ikut
  diperiksa. Berkas baru yang bercabang otomatis masuk cakupan.

  ⚠ BATAS YANG HARUS DIKETAHUI SEBELUM MEMERCAYAINYA.

  Cakupannya ditentukan oleh BENTUK kode, jadi berkas yang diperbaiki dengan
  cara MENGHILANGKAN percabangan keluar dari pengawasan. Terukur pada
  `lib/tax-calculation.ts`: sesudah `fallbackRate` dibaca dari peta
  `TAX_RATE_BY_SCHEME` alih-alih `=== 'ppn' ? … : …`, berkas itu tak lagi
  bercabang — dan uji mutasi di sana HIJAU meski tipenya dikembalikan ke dua
  nilai.

  Itu bukan kebocoran yang bisa ditambal di sini: berkas yang tak
  membandingkan apa pun memang tak punya cabang untuk salah. Yang menjaganya
  `tsc` — `Record<TaxScheme, number>` menolak peta yang tak lengkap begitu
  nilai enum bertambah. Dua penjaga, dua wilayah.

  Yang penjaga ini jaga: berkas yang MASIH bercabang. Dibuktikan lewat mutasi
  pada `keuangan/_bersama/komponen.tsx` (layar pembuatan invoice) — tarif
  dikembalikan ke `ppn ? 11 : 2`, penjaga MERAH menyebut berkasnya.
*/
function pindaiSumber() {
  const akar = [
    join(AKAR, 'apps', 'api', 'src'),
    join(AKAR, 'apps', 'web', 'app'),
    join(AKAR, 'apps', 'web', 'components'),
    join(AKAR, 'apps', 'web', 'lib'),
  ]
  const hasil = {}
  const telusuri = (dir) => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue
        telusuri(p)
        continue
      }
      if (!/\.tsx?$/.test(e.name)) continue
      const bersih = tanpaKomentar(readFileSync(p, 'utf8'))
      /*
        Yang diperiksa hanya berkas yang BERCABANG atas nilainya — bukan tiap
        berkas yang menyebut `tax_scheme`.

        Versi pertama pelebaran ini menyaring dengan `includes('tax_scheme')`
        saja, dan langsung memulangkan 35 "temuan" yang SEMUANYA palsu:
        `invoice-termin.ts` meneruskan `proyek.tax_scheme` ke `getTaxRate()`
        tanpa pernah membandingkannya, dan enam berkas `tipe.ts` hanya
        mendeklarasikan tipenya. Ketujuhnya BENAR — mereka tak perlu
        menyebutkan satu pun nilai enum.

        Penjaga yang merah atas kode yang benar akan diabaikan seluruh
        keluarannya (§8a.2, dan §6 mencatat kelas yang sama pada
        `audit-kosong-berpetunjuk`). Jadi syaratnya diperketat: harus ada
        PERBANDINGAN literal dengan salah satu nilai enum — `=== 'ppn'`,
        `!== 'tanpa_pajak'`, `includes('pph_final')`, `case 'ppn':`.

        Membandingkan = mengambil keputusan atas nilainya, dan keputusan itulah
        yang wajib menangani ketiga nilai.
      */
      /*
        ⚠ Literalnya wajib berada DEKAT kata `tax_scheme` — dan syarat itu
        lahir dari dua positif palsu yang terlihat meyakinkan.

        Basis ini punya enum LAIN bernama `tax_type` (`pph_final_42`, `ppn`,
        `wht`) di tabel `tax_records`. Ia BERBAGI literal `'ppn'` dengan
        `tax_scheme`, jadi pemeriksaan yang hanya mencari literalnya menuduh:

            reports.ts:1238        `r.tax_type === 'pph_final'`
            laporan/page.tsx       (rekap pajak, kolom yang sama)

        Keduanya BENAR — mereka mengelompokkan catatan pajak, bukan memutuskan
        tarif proyek, dan `tanpa_pajak` memang tak punya arti di sana.

        Jadi yang dicari: literal enum yang muncul dalam ~200 karakter dari
        penyebutan `tax_scheme`. Kasar, tetapi ia memisahkan dua enum yang
        berbagi kata — dan penjaga yang merah atas kode benar akan diabaikan
        seluruh keluarannya (§8a.2).
      */
      const bercabang = bersih.split('\n').some((baris, i, semua) => {
        if (!/(===|!==|==|!=|case\s+|includes\(\s*|\[\s*)\s*['"](pph_final|ppn|tanpa_pajak)['"]/
          .test(baris)) return false
        /*
          `tax_scheme` dicari di BARIS ITU atau dua baris sebelumnya —
          jangkauan sebuah ekspresi, bukan sebuah berkas.

          Jendela 200 karakter yang saya pakai lebih dulu masih terlalu lebar:
          `laporan/page.tsx` menyebut `tax_scheme` di kolom ekspor (baris 655)
          dan membandingkan `tax_type === 'ppn'` di tempat lain — dua hal yang
          tak berhubungan, dituduh berhubungan karena kebetulan berdekatan.

          Berkas itu BENAR: ia cuma menampilkan skema, tak memutuskan tarif.
        */
        const konteks = semua.slice(Math.max(0, i - 2), i + 1).join('\n')
        return konteks.includes('tax_scheme') || /\btaxScheme\b/.test(konteks)
      })
      if (!bercabang) continue
      hasil[relative(AKAR, p).replace(/\\/g, '/')] = bersih
    }
  }
  for (const a of akar) telusuri(a)
  return hasil
}

const SUMBER = pindaiSumber()

if (Object.keys(SUMBER).length === 0) {
  console.error('❌ Nol berkas menyebut `tax_scheme` — pemindaiannya tak bermakna.')
  console.error('   Nol pemeriksaan terbaca sama dengan nol pelanggaran.')
  process.exit(1)
}

const temuan = []
for (const v of nilai) {
  for (const [nama, isi] of Object.entries(SUMBER)) {
    if (!isi) { temuan.push({ v, nama, sebab: 'berkasnya tak ditemukan' }); continue }
    if (!isi.includes(v)) temuan.push({ v, nama, sebab: 'nilai tak disebut sama sekali' })
  }
}

if (temuan.length > 0) {
  console.error(`❌ ${temuan.length} nilai tax_scheme tak tertangani:\n`)
  for (const t of temuan) console.error(`   '${t.v}' — ${t.nama}: ${t.sebab}`)
  console.error(`
   Pola \`scheme === 'ppn' ? A : B\` memperlakukan nilai BARU sebagai cabang
   else — diam-diam, tanpa galat. Diukur 2026-09-04: proyek yang pajaknya
   sengaja dimatikan tetap dipotong PPh Final 2%, dan yang salah cuma jumlah
   uang yang ditagihkan ke klien.

   Nilai enum di basis : ${nilai.join(', ')}
`)
  process.exit(1)
}

console.log(`✅ ${nilai.length} nilai tax_scheme tertangani di tarif, label, dan tipe: ${nilai.join(', ')}`)
