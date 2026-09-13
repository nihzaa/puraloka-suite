#!/usr/bin/env node
/**
 * PENJAGA — analisa AHSP wajib punya komponen yang BISA DIBACA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-13, saat menelusuri tiga test merah:
 *
 *     assemblies (analisa AHSP)      : 3.171
 *     assembly_components            : 18.533
 *     public.resources               :      8   ← seluruhnya CI-RES-* (uji CI)
 *     komponen yang resource-nya ADA :      0
 *
 * Jadi katalog AHSP — jantung estimasi biaya di aplikasi ini — berdiri
 * UTUH secara struktur dan KOSONG secara isi. Tiap analisa punya baris
 * komponennya, dan tiap komponen menunjuk sumber daya yang tak ada.
 *
 * ── Kenapa tak ada yang tahu
 *
 * Tak satu pun alat yang ada bisa melihatnya, dan tiap alat BENAR untuk
 * dirinya sendiri:
 *
 *   · `audit-harga-satuan-waras.mjs`  HIJAU — nol harga tak masuk akal,
 *     sebab tak ada harga untuk dibandingkan sama sekali;
 *   · `lapor-cakupan-struktur.mjs`    34/34 — ia menghitung JENIS elemen
 *     struktur, bukan isi katalog AHSP;
 *   · FK `assembly_components_resource_id_fkey` tercatat **convalidated
 *     = true**, jadi basis pun menyatakan dirinya konsisten.
 *
 * Yang terakhir paling menipu: FK yang divalidasi TETAP bisa punya baris
 * pelanggar kalau penghapusannya dilakukan dengan constraint dimatikan
 * (`session_replication_role = 'replica'` — dipakai beberapa berkas test
 * di repo ini untuk membersihkan fixture-nya).
 *
 * Gejalanya muncul jauh dari sebabnya: `cecep-adopt-analisa.test.ts`
 * merah dengan `Cannot read properties of undefined (reading 'code')` —
 * galat JavaScript yang menuduh TEST, bukan basis yang kehilangan isinya.
 *
 * ── Kenapa NOL BUKAN NOL PELANGGARAN
 *
 * Ini inti penjaga ini. Katalog kosong menghasilkan nol temuan di hampir
 * tiap pemeriksaan — dan nol temuan terbaca seperti "semuanya benar".
 * Penjaga ini membalik arahnya: yang diperiksa bukan adanya pelanggaran,
 * melainkan adanya ISI.
 *
 * ⚠ BATAS: ia menghitung keterhubungan baris, bukan kewajaran angkanya.
 * Koefisien yang salah nilai tetap lolos — itu wilayah
 * `audit-harga-satuan-waras.mjs`, dan penjaga itu baru berarti sesudah
 * katalognya berisi.
 *
 * Butuh basis, jadi ia tak bisa jalan di CI tanpa kredensial dan TAK
 * BOLEH ditabelkan di CLAUDE.md §6 (`audit-penjaga-tercatat-jalan.mjs`
 * mewajibkan yang tertabel benar-benar dijalankan `ci.yml`).
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

/*
  Ambang: berapa PERSEN analisa yang wajib punya minimal satu komponen
  terbaca. Tidak 100% — sebagian analisa memang lumpuh oleh sumber daya
  yang belum diseed, dan penjaga yang merah atas itu akan diabaikan
  seluruh keluarannya.

  50% dipilih sebagai garis "katalog ini masih berguna atau tidak".
  Di bawah itu, estimasi biaya tak bisa diandalkan.
*/
const AMBANG_PERSEN = 50

const c = buatClient()
await c.connect()

try {
  /*
    ⚠ SEMUA tabel berkualifikasi `public.` — `resources` DAN
    `assembly_components` sama-sama dibayangi skema `test` (CLAUDE.md §1).
    Tanpa kualifikasi, hitungannya bisa jatuh ke tabel yang salah dan
    menjawab BENAR secara kebetulan.
  */
  /*
    ⚠ Hanya analisa `active` yang dihitung, dan itu KOREKSI.

    Versi pertama menghitung SELURUH baris `assemblies`. Sesudah 2.620
    analisa rusak di-supersede (2026-09-13), angkanya justru TURUN ke 45%
    — sebab tiap perbaikan menambah satu baris `superseded` yang, MENURUT
    RANCANGAN, tak akan pernah punya komponen hidup.

    Jadi penjaga itu menghukum perbaikan: makin banyak dipulihkan, makin
    merah. Yang diukur seharusnya katalog yang BISA DIPAKAI, bukan seluruh
    riwayatnya.

    Terukur sesudah koreksi: 2.620 dari 2.747 analisa nasional aktif (95%).
  */
  const { rows } = await c.query(`
    SELECT
      (SELECT count(*) FROM public.assemblies WHERE status = 'active')::int AS analisa,
      (SELECT count(*) FROM public.assembly_components)::int           AS komponen,
      (SELECT count(*) FROM public.resources)::int                     AS sumberdaya,
      (SELECT count(*) FROM public.assembly_components ac
         WHERE EXISTS (SELECT 1 FROM public.resources r
                        WHERE r.id = ac.resource_id))::int             AS komponen_hidup,
      (SELECT count(*) FROM public.assemblies a
         WHERE a.status = 'active'
           AND EXISTS (SELECT 1 FROM public.assembly_components ac
                         JOIN public.resources r ON r.id = ac.resource_id
                        WHERE ac.assembly_id = a.id))::int             AS analisa_hidup`)

  const r = rows[0]
  const persen = r.analisa === 0 ? 0 : Math.round((r.analisa_hidup / r.analisa) * 100)

  console.log('── AHSP punya komponen ──')
  console.log(`  analisa AKTIF            : ${r.analisa}`)
  console.log(`     punya komponen hidup  : ${r.analisa_hidup}  (${persen}%)`)
  console.log(`  baris komponen           : ${r.komponen}`)
  console.log(`     resource-nya ADA      : ${r.komponen_hidup}`)
  console.log(`  sumber daya (resources)  : ${r.sumberdaya}`)

  /*
    Katalog KOSONG bukan "nol pelanggaran". Kalau tak ada analisa sama
    sekali, pengukurannya tak bermakna dan wajib bersuara.
  */
  if (r.analisa === 0) {
    console.error('\n❌ NOL analisa AHSP di basis — pengukurannya tak bermakna.')
    console.error('   Seed katalognya: node apps/api/scripts/seed-ahsp-full.mjs')
    process.exit(1)
  }

  if (persen < AMBANG_PERSEN) {
    console.error(`\n❌ Cuma ${persen}% analisa punya komponen terbaca (ambang ${AMBANG_PERSEN}%).`)
    console.error('\n   Katalog AHSP berdiri UTUH secara struktur dan KOSONG secara isi:')
    console.error(`   ${r.komponen} baris komponen menunjuk sumber daya, dan hanya`)
    console.error(`   ${r.komponen_hidup} di antaranya benar-benar ada.`)
    console.error('\n   Yang rusak karenanya: estimasi biaya. Analisa tanpa komponen')
    console.error('   menghitung Rp 0 tanpa satu pun galat — nol yang SALAH tak bisa')
    console.error('   dibedakan dari nol yang benar.')
    console.error('\n   ⚠ FK-nya tercatat valid. Baris pelanggar tetap bisa lahir kalau')
    console.error("   penghapusannya lewat session_replication_role = 'replica'.")
    console.error('\n   Pulihkan: node apps/api/scripts/seed-ahsp-full.mjs')
    process.exit(1)
  }

  console.log(`\n✅ ${persen}% analisa AHSP punya komponen yang bisa dibaca.`)
} finally {
  await c.end()
}
