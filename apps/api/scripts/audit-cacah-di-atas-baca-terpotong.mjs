#!/usr/bin/env node
// ============================================================================
// MENCACAH DI ATAS PEMBACAAN YANG BISA TERPOTONG
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `GET /api/v1/cecep/editions` menghitung jumlah analisa per edisi begini:
//
//     const { data: asm } = await request.db!
//       .from('assemblies').select('edition_id').eq('status','active').limit(10000)
//     const per = new Map()
//     for (const a of asm ?? []) {
//       if (a.edition_id) per.set(a.edition_id, (per.get(a.edition_id) ?? 0) + 1)
//     }
//
// Tiap barisnya benar sendiri. Yang salah gabungannya: PostgREST memulangkan
// **maksimal 1.000 baris**, dan `.limit(10000)` tidak menembusnya — batas itu
// keras, ditegakkan server, dan pemotongannya TIDAK mengeluarkan galat.
// `data` terisi, `error` null, loop berjalan mulus atas seribu baris.
//
// Diukur ke produksi 2026-09-15:
//
//     endpoint melaporkan SE-47-2026 =   580 analisa
//     kebenaran di basis (SQL)       = 2.747 analisa
//
//     SELECT count(*) FILTER (WHERE edition_id IS NOT NULL)
//       FROM (SELECT edition_id FROM public.assemblies
//              WHERE status='active' LIMIT 1000) x;      →  580
//
// Angka 580 itu persis jumlah baris ber-`edition_id` di dalam seribu baris
// pertama. Salah 4,7 kali lipat.
//
// ── Kenapa cacat ini bertahan, dan kenapa ia butuh penjaganya sendiri
//
// 580 TERLIHAT MASUK AKAL. Ia bukan nol, bukan angka bulat mencurigakan, dan
// ia bergerak kalau katalog berubah. Tak ada di layar — maupun di tsc, test,
// atau penjaga mana pun — yang bisa membedakannya dari jumlah yang benar.
// Dan angka inilah yang dipakai orang untuk memutuskan apakah sebuah edisi
// layak dipilih saat menyusun RAB.
//
// ⚠ BUKAN duplikat `audit-baca-tak-terpotong.mjs`. Penjaga itu mencari
// pembacaan TANPA pembatas sama sekali, dan justru karena itu ia BUTA di
// sini: `.eq('status','active')` dan `.limit(10000)` KEDUANYA terdaftar
// sebagai pembatas di `PEMBATAS`-nya, jadi baris ini dilewati tanpa suara.
// Sudah diverifikasi dengan menjalankannya — ia hijau atas kode yang salah
// 4,7 kali lipat.
//
// Cacatnya hidup di CELAH: pembacaan yang PUNYA `.limit()`, tetapi limitnya
// DI ATAS 1.000 — jadi penulisnya jelas-jelas MENGHARAPKAN lebih dari seribu
// baris, sementara servernya tak akan pernah memberikannya.
//
// ── Yang dijaga
//
// Sebuah pelanggaran butuh KETIGA hal ini sekaligus:
//
//   1. `.from(tabel).select(...)` dengan `.limit(N)` di mana **N > 1.000**,
//      atau `.range(a, b)` dengan **b - a + 1 > 1.000**.
//      Limit di bawah 1.000 tak pernah terpotong — itu keputusan sadar untuk
//      mengambil sebagian, bukan harapan yang tak terpenuhi.
//
//   2. Hasilnya MENGALIR KE AGREGAT: di-`for`-kan, di-`reduce`, dihitung
//      `.length`-nya, di-`Set`/`Map`-kan, atau dijumlahkan.
//      Ini yang memisahkan cacat dari sekadar daftar panjang. Daftar yang
//      terpotong masih menampilkan barisnya — pemakainya melihat sebagian
//      dan (kalau rutenya jujur) diberi tahu. Sebuah ANGKA yang terpotong
//      tak punya sisa yang bisa dilihat: ia SATU nilai, dan nilai itu salah
//      tanpa jejak.
//
//   3. Tabelnya ada di basis dan jumlah barisnya sudah >= 1.000 — atau,
//      bila basis tak tersedia, poin 1+2 saja sudah cukup untuk MERAH.
//      Yang terakhir disengaja: menjadikan basis syarat berarti penjaga ini
//      diam-diam hijau di lingkungan tanpa `DATABASE_URL`, dan penjaga yang
//      hijau karena tak memeriksa apa pun lebih buruk daripada tak ada
//      (pelajaran `audit-ekspor-tanpa-pemanggil`, dikutip di
//      `audit-baca-tak-terpotong.mjs`).
//
// ── Cara memperbaikinya
//
// Minta BASIS yang menghitung, bukan menarik baris lalu mencacah di JS:
//
//     const { count } = await request.db!.from('assemblies')
//       .select('id', { count: 'exact', head: true })
//       .eq('status','active').eq('edition_id', id)
//
// `head: true` berarti nol baris melewati kabel — tak ada yang bisa
// terpotong. Kalau agregatnya memang menuntut seluruh barisnya (bukan cuma
// jumlahnya), ambil BERTAHAP per 1.000 sampai habis, seperti yang sudah
// dilakukan handler daftar katalog di berkas yang sama.
//
// ══════════════════════════════════════════════════════════════════════════
// BENTUK KEDUA, ditambahkan 2026-09-15 — DE-DUP tanpa pembatas sama sekali
// ══════════════════════════════════════════════════════════════════════════
//
// `GET /api/v1/audit/meta` mengisi dropdown saringan halaman Audit Trail:
//
//     supabase.from('audit_logs').select('table_name')
//       .eq('company_id', cid).order('table_name')          ← tanpa .limit()
//     const tables = [...new Set(data.map(r => r.table_name))]
//
// Diukur di basis dev 2026-09-15 (tenant 48befb54…, 102.089 baris):
//
//     DISTINCT table_name yang sebenarnya ada  :  95
//     yang ditawarkan dropdown                 :   3
//
// Auditor membuka dropdown, melihat tiga tabel, dan menyimpulkan tak ada
// modul lain yang pernah terjejak. Nol galat, nol penanda pemotongan.
//
// ⚠ Cacat ini lolos KEDUA penjaga yang sudah ada, dan bukan kebetulan:
//
//   • bagian PERTAMA berkas ini menuntut `.limit(N)` dengan N > 1.000 —
//     di sini `.limit()` tak ada sama sekali, jadi ia dilewati;
//   • `audit-baca-tak-terpotong.mjs` mendaftarkan `.eq(` sebagai pembatas
//     (alasannya masih benar), jadi `.eq('company_id', …)` membuatnya diam.
//
// Sudah diverifikasi dengan menjalankan keduanya atas kode yang salah: dua
// penjaga hijau di atas dropdown yang menyembunyikan 92 dari 95 pilihan.
// Cacatnya hidup di CELAH antara keduanya — sama seperti bentuk pertama.
//
// Detail pemisahan derau vs cacat ada di komentar `POLA_DEDUP` di bawah.
//
// AMBANG NOL.
// ============================================================================

import { readFileSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireDari = createRequire(join(AKAR_API, 'package.json'))

// `.env` dimuat sendiri — alasannya sama persis dengan
// `audit-baca-tak-terpotong.mjs`: `DATABASE_URL` ADA di `apps/api/.env` tapi
// tak pernah masuk ke `process.env` lewat pelari CI, sehingga penjaga yang
// mengandalkannya akan hijau tanpa memeriksa apa pun.
try {
  requireDari('dotenv').config({ path: join(AKAR_API, '.env') })
} catch { /* di CI env datang dari luar; ketiadaan dotenv bukan galat */ }

const BATAS_POSTGREST = 1000

/*
  ── Menemukan agregasi

  Yang dicari BUKAN "variabel ini dipakai", melainkan "variabel ini diperas
  jadi SATU nilai". Membaca `data.map(...)` lalu mengirimkannya sebagai daftar
  bukan pelanggaran kelas ini — barisnya sampai ke pemakai, dan pemotongannya
  dijaga penjaga lain.

  Pola yang dihitung agregasi:

      for (const x of NAMA)        · for (… NAMA …)
      NAMA.reduce(                 · NAMA.length
      NAMA.filter(…).length        · new Set(NAMA)  · new Map(NAMA)
      NAMA.forEach(                · NAMA.some( / .every( / .find(

  `.some`/`.every`/`.find` ikut: ketiganya juga memeras seluruh himpunan jadi
  satu jawaban, dan jawaban dari seribu baris pertama atas sebuah tabel
  berisi lima ribu adalah tebakan yang menyamar sebagai fakta.
*/
function polaAgregasi(nama) {
  const n = nama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `for\\s*\\([^)]*\\b${n}\\b` +
    `|\\b${n}\\s*(?:\\?\\?\\s*\\[\\])?\\s*\\)?\\s*\\.(?:reduce|forEach|some|every|find)\\s*\\(` +
    `|\\b${n}\\b[^\\n]{0,80}\\.length\\b` +
    `|new\\s+(?:Set|Map)\\s*\\(\\s*\\(?\\s*${n}\\b`
  )
}

/** Limit yang DIMINTA sebuah rantai, atau null bila tak ada/tak terbaca. */
function limitDiminta(rantai) {
  const mLimit = rantai.match(/\.limit\(\s*(\d+)\s*\)/)
  if (mLimit) return Number(mLimit[1])
  const mRange = rantai.match(/\.range\(\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (mRange) return Number(mRange[2]) - Number(mRange[1]) + 1
  return null
}

/*
  ══════════════════════════════════════════════════════════════════════════
  BENTUK KEDUA — DE-DUP di atas pembacaan yang TAK BERBATAS sama sekali
  ══════════════════════════════════════════════════════════════════════════

  Ditambahkan 2026-09-15, sesudah `GET /api/v1/audit/meta` terbukti hanya
  menawarkan TIGA pilihan saringan dari 95 yang ada.

      supabase.from('audit_logs').select('table_name')
        .eq('company_id', cid).order('table_name')          ← tanpa .limit()
      ...
      const tables = [...new Set(data.map(r => r.table_name))]

  Cacatnya SEKELAS dengan yang di kepala berkas ini — pemotongan senyap di
  1.000 baris yang meracuni sebuah hasil agregat — tetapi bentuknya lolos
  KEDUA penjaga yang sudah ada, dan itu bukan kebetulan:

    • `audit-cacah-di-atas-baca-terpotong` (bagian atas berkas ini) menuntut
      `.limit(N)` dengan N > 1.000. Di sini `.limit()` TAK ADA sama sekali,
      jadi `limitDiminta()` memulangkan null dan barisnya dilewati.

    • `audit-baca-tak-terpotong.mjs` mencari pembacaan TANPA pembatas — dan
      ia mendaftarkan `.eq(` sebagai pembatas, dengan alasan yang masih
      benar (pembacaan yang disaring ke SATU entitas tak pernah mendekati
      1.000). `.eq('company_id', cid)` karenanya membuatnya diam.

  Sudah diverifikasi dengan menjalankan keduanya atas kode yang salah: dua
  penjaga hijau di atas dropdown yang menyembunyikan 92 dari 95 pilihan.

  ── Kenapa DE-DUP, dan bukan "agregasi" seperti bagian pertama

  Menuduh setiap pembacaan ber-`.eq()` tanpa limit akan membanjiri laporan
  ini dengan ratusan positif palsu sampai tak ada yang membacanya lagi —
  persis alasan `audit-baca-tak-terpotong` mendaftarkan `.eq(` sebagai
  pembatas sejak awal.

  Yang memisahkan cacat dari derau adalah BENTUK agregasinya. `new Set(...)`
  / `[...new Set(...)]` di atas hasil query adalah pernyataan niat yang tak
  ambigu: penulisnya ingin DAFTAR NILAI UNIK — yang hanya bermakna kalau
  SELURUH baris terbaca. Sebuah himpunan unik dari seribu baris pertama
  bukan sebagian jawaban, melainkan jawaban yang SALAH dan tak punya sisa
  yang bisa dilihat: pemakainya menerima daftar pendek yang terlihat lengkap.

  Dan `.order()` memperparahnya secara diam-diam — ia tak mengurangi baris,
  tapi ia memastikan seribu yang terbaca BUKAN sampel acak melainkan ujung
  alfabet. Itulah kenapa 95 nilai menyusut jadi 3, bukan jadi ~90.

  ── Cara memperbaikinya

  Minta BASIS yang menyusun himpunan distinct-nya (fungsi/RPC yang
  `GROUP BY` kolomnya), lalu ambil hasilnya. Yang melewati kabel jadi
  puluhan nilai alih-alih ratusan ribu baris — tak ada yang bisa terpotong,
  dan ongkosnya TURUN. Pola nyatanya: `audit_saringan_tersedia` (migrasi
  589), dipakai `GET /api/v1/audit/meta`.
*/
const POLA_DEDUP = /new\s+Set\s*\(/

/**
 * Apakah rantai ini punya pembatas jumlah baris yang SUNGGUHAN?
 *
 * ⚠ `.eq`/`.in`/`.gte` DAN `.order` sengaja TIDAK dihitung. Menyaring per
 * tenant tidak membatasi jumlah baris — tenant utama basis ini memegang
 * 102.089 baris `audit_logs` sendirian — dan mengurutkan tidak membuang
 * satu baris pun. Keduanya justru yang membuat cacat ini terlihat wajar.
 */
function punyaBatasBaris(rantai) {
  return /\.(range|limit|single|maybeSingle)\s*\(/.test(rantai)
}

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter((f) => !f.includes('__tests__') && !f.includes('test-utils'))

const temuan = []

for (const rel of berkas) {
  const isi = readFileSync(join(AKAR_API, rel), 'utf8')
  // ⚠ CR dibuang lebih dulu. Berkas di repo ini bisa berakhiran CRLF, dan
  //   perbandingan baris yang diam-diam membawa CR memulangkan NOL —
  //   yang terbaca seperti "tak ada", bukan "tak terdeteksi" (CLAUDE.md §7a).
  const baris = isi.split('\n').map((b) => b.replace(/\r/g, ''))

  for (let i = 0; i < baris.length; i++) {
    const m = baris[i].match(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/)
    if (!m) continue
    const tabel = m[1]

    // Jendela 25 baris — query di repo ini dibangun bertahap (`q = q.eq(...)`),
    // jadi membaca rantai titik-bersambung saja melewatkan pembatasnya.
    const AKHIR = Math.min(i + 25, baris.length)
    let rantai = baris[i].slice(baris[i].indexOf('.from('))
    for (let j = i + 1; j < AKHIR; j++) {
      if (/\.from\(\s*['"`]/.test(baris[j])) break
      rantai += '\n' + baris[j]
    }
    if (!/\.select\s*\(/.test(rantai)) continue           // bukan pembacaan
    if (/count:\s*['"]exact['"]/.test(rantai)) continue   // sudah dihitung di basis

    const diminta = limitDiminta(rantai)

    /*
      Dua bentuk pelanggaran, dipisahkan di sini supaya laporannya bisa
      menyebut yang MANA — "limit 10.000 atas tabel 5.000 baris" dan
      "tanpa limit sama sekali" butuh perbaikan yang berbeda bunyinya.

        BENTUK 'limit'  → `.limit(N)` dengan N > 1.000 (cacat asli berkas ini)
        BENTUK 'dedup'  → tanpa pembatas baris APA PUN, hasilnya di-`new Set`
    */
    let bentuk = null
    if (diminta !== null && diminta > BATAS_POSTGREST) {
      bentuk = 'limit'
    } else if (diminta === null && !punyaBatasBaris(rantai)) {
      bentuk = 'dedup'   // masih harus lolos uji de-dup di bawah
    }
    if (bentuk === null) continue

    /*
      Nama variabel penampung hasilnya. Dua bentuk yang dipakai di repo ini:

          const { data: asm } = await …          → asm
          const { data } = await …               → data

      Tanpa nama, tak ada yang bisa ditelusuri ke agregasi — dan menuduh
      tanpa bisa menyebut variabelnya membuat orang berikutnya menyisir
      berkas sendiri (§8a.2: "merah tanpa menyebut namanya").
    */
    const awal = Math.max(0, i - 6)
    const kepala = baris.slice(awal, i + 1).join('\n')
    let mNama = kepala.match(/\{\s*data\s*:\s*(\w+)/) || kepala.match(/\{\s*(data)\b/)

    /*
      ⚠ Bentuk KETIGA penampung, dan ketiadaannya sempat membuat penjaga ini
      HIJAU atas cacat yang melahirkannya.

          const [tablesRes, actionsRes] = await Promise.all([
            supabase.from('audit_logs').select('table_name').eq(...),
            supabase.from('audit_logs').select('action').eq(...),
          ])
          const tables = [...new Set((tablesRes.data ?? []).map(...))]

      Hasilnya TIDAK di-destructure jadi `{ data }` — ia sebuah larik hasil
      `Promise.all`, dan nilainya dibaca belakangan lewat `.data` pada
      `tablesRes`. Kedua pola di atas memulangkan null, `continue` berjalan,
      dan rute yang menyembunyikan 92 dari 95 pilihan lolos tanpa suara.

      Ini persis kelas yang diperingatkan CLAUDE.md §8a.2: mutasi yang
      HIJAU terbaca seperti "penjaganya bocor" — dan di sini memang bocor.
      Ketahuan hanya karena mutasinya dijalankan; tanpa itu penjaga ini akan
      lahir sudah buta terhadap contoh yang jadi alasan keberadaannya.

      Jadi bila dua pola pertama gagal, nama diambil dari elemen larik
      destructuring pada posisi yang SAMA dengan urutan query di dalam
      `Promise.all` — elemen ke-0 untuk `.from()` pertama, dst.
    */
    if (!mNama) {
      const mLarik = kepala.match(/(?:const|let)\s*\[([^\]]+)\]\s*=\s*await\s+Promise\.all/)
      if (mLarik) {
        const nama2 = mLarik[1].split(',').map((s) => s.trim()).filter(Boolean)
        // Query keberapa di dalam Promise.all ini? Dihitung dari jumlah
        // `.from(` yang sudah lewat sejak baris destructuring-nya.
        const barisLarik = baris.slice(awal, i).findIndex((b) => /await\s+Promise\.all/.test(b))
        if (barisLarik >= 0) {
          const antara = baris.slice(awal + barisLarik, i)
          const ke = antara.filter((b) => /\.from\(\s*['"`]/.test(b)).length
          if (nama2[ke]) mNama = [null, nama2[ke]]
        }
      }
    }

    if (!mNama) continue
    const nama = mNama[1]

    /*
      Agregasi dicari SESUDAH pembacaannya, dalam 40 baris — cukup untuk
      seluruh pola di repo ini tanpa menyeberang ke handler berikutnya.

      ⚠ Tapi 40 baris SAJA tidak cukup, dan itu terbukti mahal. Jalan
      pertama bentuk `dedup` menuduh `utils/approval.ts:141`, tempat
      `new Set(` memang muncul 13 baris di bawahnya — DI DALAM FUNGSI LAIN
      (`loadUserPermissions`), memakan hasil `.rpc()` yang sama sekali bukan
      pembacaan tabel ini. Pembacaan yang dituduh sendiri sudah disaring ke
      SATU entitas lewat `.eq('entity_id', …)` dan tak akan pernah mendekati
      1.000 baris.

      Jadi jendelanya berhenti di penutup fungsi: sebuah `}` di kolom NOL,
      bentuk yang dipakai seluruh deklarasi tingkat-atas di repo ini. Tanpa
      batas itu penjaga ini menuduh kode yang benar, dan tuduhan yang salah
      membuat seluruh keluarannya berhenti dibaca (§8a.2).
    */
    let EKOR = Math.min(i + 40, baris.length)
    for (let j = i + 1; j < EKOR; j++) {
      if (/^\}/.test(baris[j])) { EKOR = j; break }
    }
    const sesudah = baris.slice(i, EKOR).join('\n')

    /*
      Uji agregasinya BERBEDA per bentuk, dan itu disengaja.

      Bentuk 'limit' memakai `polaAgregasi()` yang luas: penulisnya sudah
      menyatakan mengharapkan >1.000 baris, jadi pemerasan apa pun jadi satu
      nilai sudah cukup untuk merah.

      Bentuk 'dedup' menuntut `new Set(` DI ATAS variabel hasilnya —
      SEMPIT, dengan sengaja. Pembacaan tanpa limit yang di-`for`-kan atau
      dihitung `.length`-nya sudah wilayah `audit-baca-tak-terpotong.mjs`,
      dan menuduhnya lagi di sini cuma menghasilkan dua penjaga yang
      meneriaki baris yang sama. Yang unik di sini: himpunan NILAI UNIK,
      yang tak punya sisa terlihat saat terpotong.
    */
    let pola
    if (bentuk === 'limit') {
      pola = polaAgregasi(nama)
      if (!pola.test(sesudah)) continue
    } else {
      // `new Set(` harus benar-benar memakan variabel hasilnya — bukan
      // sekadar muncul di dekatnya. Tanpa pengikatan ke `nama`, sebuah
      // `new Set()` milik query LAIN di bawahnya akan menuduh baris ini.
      //
      // `(?:\.data)?` — penampung `Promise.all` dibaca sebagai `x.data`,
      // bukan `x` telanjang. Tanpa cabang ini penjaga hijau atas cacat
      // `audit/meta` yang melahirkannya (lihat catatan bentuk KETIGA di atas).
      const n = nama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      pola = new RegExp(`new\\s+Set\\s*\\(\\s*\\(?\\s*(?:\\.\\.\\.)?\\s*${n}\\b(?:\\.data)?`)
      if (!POLA_DEDUP.test(sesudah) || !pola.test(sesudah)) continue
    }

    const cocok = sesudah.match(pola)
    temuan.push({
      berkas: rel.replace(/\\/g, '/'), baris: i + 1, tabel, diminta, nama, bentuk,
      buktiAgregasi: (cocok?.[0] ?? '').split('\n')[0].trim().slice(0, 90),
    })
  }
}

// ── Berapa baris yang sungguh ada di tabel-tabel itu ────────────────────────
//
// Untuk bentuk `limit`, basis TIDAK jadi syarat memerahkan (lihat kepala
// berkas) — ia hanya memperkaya laporan dengan angka nyata: "5.791 baris,
// 1.000 yang terbaca" jauh lebih sulit diabaikan daripada "berpotensi
// terpotong".
//
// ⚠ Untuk bentuk `dedup` angka ini JADI SYARAT, dan alasannya mahal.
//
// Jalan pertama penjaga ini (2026-09-15) memerahkan SEMBILAN tempat, dan
// delapan di antaranya BENAR apa adanya: `users` 51 baris, `permissions`
// 231, `goods_receipt_items` 8. Tak satu pun akan mendekati 1.000, dan
// beberapa bahkan disaring ke SATU entitas lebih dulu
// (`approval.ts:141` — `.eq('entity_id', …)`, yang `new Set`-nya bahkan
// milik fungsi lain beberapa baris di bawahnya).
//
// Memerahkan kesembilannya berarti menuntut orang membongkar delapan
// pembacaan yang sudah benar. Penjaga yang begitu akan diabaikan SELURUH
// keluarannya, lalu berhenti menjaga tanpa gejala — persis pelajaran
// `audit-kosong-berpetunjuk.mjs` (CLAUDE.md §6) dan §8a.2.
//
// Jadi bentuk `dedup` hanya merah bila tabelnya SUNGGUH sudah besar.
// Ambangnya 800, sama dengan ambang PERINGATAN `audit-baca-tak-terpotong`:
// cacat ini tak berbunyi saat terjadi, jadi ia harus tertangkap SEBELUM
// garis 1.000 terlewati, bukan sesudah.
const AMBANG_DEDUP = 800
const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
const jumlahTabel = new Map()
if (DB && temuan.length > 0) {
  let pg = null
  try { pg = requireDari('pg') } catch { /* dilaporkan sebagai ketiadaan angka */ }
  if (pg) {
    const c = new pg.Client({ connectionString: DB })
    try {
      await c.connect()
      for (const t of new Set(temuan.map((x) => x.tabel))) {
        try {
          const { rows } = await c.query(`SELECT count(*)::int n FROM public.${t}`)
          jumlahTabel.set(t, rows[0].n)
        } catch { /* bukan tabel public — biarkan tanpa angka */ }
      }
    } catch { /* basis tak bisa dihubungi — laporan tetap jalan tanpa angka */ }
    finally { try { await c.end() } catch { /* sudah tertutup */ } }
  }
}

/*
  Saringan bentuk `dedup` terhadap ukuran tabel yang SUNGGUHAN.

  ⚠ Tanpa basis, bentuk `dedup` DILEWATI seluruhnya — dan itu keputusan
  sadar, bukan kelalaian. Memerahkannya tanpa angka berarti mengulang
  banjir delapan positif palsu di lingkungan yang justru tak bisa
  memeriksanya. Bentuk `limit` tetap merah tanpa basis, seperti sebelumnya:
  ia tak butuh angka, sebab `.limit(10000)` sudah menyatakan harapan
  penulisnya sendiri.

  Yang dilewati DILAPORKAN, bukan didiamkan — penjaga yang diam-diam
  memeriksa lebih sedikit daripada namanya menjanjikan adalah bentuk
  kebusukan yang paling sulit dilihat (CLAUDE.md §6).
*/
const dilewatiTanpaAngka = []
const temuanTersaring = temuan.filter((t) => {
  if (t.bentuk !== 'dedup') return true
  const n = jumlahTabel.get(t.tabel)
  if (n == null) { dilewatiTanpaAngka.push(t); return false }
  return n >= AMBANG_DEDUP
})

if (dilewatiTanpaAngka.length > 0) {
  console.log(
    `  ⏭  ${dilewatiTanpaAngka.length} calon bentuk \`dedup\` dilewati — jumlah baris tabelnya ` +
    `tak terukur\n     (basis tak terhubung; bentuk \`limit\` tetap diperiksa penuh)`
  )
}

if (temuanTersaring.length === 0) {
  console.log(
    '✅ Cacah di atas baca terpotong: nol — tak ada agregasi di atas pembacaan >1.000 baris,\n' +
    `   dan tak ada de-dup (\`new Set\`) di atas pembacaan tanpa pembatas atas tabel >= ${AMBANG_DEDUP} baris`
  )
  process.exit(0)
}
temuan.length = 0
temuan.push(...temuanTersaring)

console.error('\n❌ Agregasi di atas pembacaan yang DIPOTONG diam-diam di 1.000 baris:\n')
for (const t of temuan) {
  const n = jumlahTabel.get(t.tabel)
  console.error(`   ${t.berkas}:${t.baris}`)
  console.error(`     tabel        : ${t.tabel}${n != null ? ` (${n.toLocaleString('id-ID')} baris di basis)` : ''}`)

  if (t.bentuk === 'limit') {
    console.error(`     limit diminta: ${t.diminta.toLocaleString('id-ID')} — PostgREST memulangkan ${BATAS_POSTGREST.toLocaleString('id-ID')}`)
    console.error(`     hasil "${t.nama}" lalu diperas jadi satu nilai oleh:`)
  } else {
    console.error(`     limit diminta: TAK ADA — pembacaan tanpa .limit/.range/.single`)
    console.error(`                    (.eq/.order TIDAK membatasi jumlah baris)`)
    console.error(`     hasil "${t.nama}" lalu dijadikan himpunan NILAI UNIK oleh:`)
  }
  console.error(`       ${t.buktiAgregasi}`)

  if (n != null && n > BATAS_POSTGREST) {
    if (t.bentuk === 'limit') {
      console.error(`     ⇒ ${(n - BATAS_POSTGREST).toLocaleString('id-ID')} baris TAK PERNAH ikut terhitung, tanpa satu pun galat.`)
    } else {
      console.error(
        `     ⇒ ${(n - BATAS_POSTGREST).toLocaleString('id-ID')} baris tak pernah terbaca, jadi nilai unik yang hanya\n` +
        `       muncul di sana HILANG dari daftar — dan daftar pendek itu terlihat LENGKAP.`
      )
    }
  }
  console.error('')
}

if (temuan.some((t) => t.bentuk === 'limit')) {
  console.error('   Bentuk `limit` — minta BASIS yang menghitung:')
  console.error("     .select('id', { count: 'exact', head: true })   ← nol baris melewati kabel")
  console.error('   atau, bila seluruh barisnya memang dibutuhkan, ambil bertahap per 1.000')
  console.error('   sampai habis (pola `HALAMAN` di GET /cecep/assemblies).\n')
}
if (temuan.some((t) => t.bentuk === 'dedup')) {
  console.error('   Bentuk `dedup` — minta BASIS yang menyusun himpunan distinct-nya, lewat')
  console.error('   fungsi/RPC ber-`GROUP BY`. Yang melewati kabel jadi puluhan NILAI alih-alih')
  console.error('   ratusan ribu BARIS: tak ada yang bisa terpotong, dan ongkosnya turun.')
  console.error('   Pola nyatanya: `audit_saringan_tersedia` (migrasi 589), dipakai')
  console.error('   GET /api/v1/audit/meta.\n')
}
console.error(`   Ambang NOL. Ditemukan: ${temuan.length}.\n`)
process.exit(1)
