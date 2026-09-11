#!/usr/bin/env node
/**
 * BERSIHKAN company sisa test yang menumpuk sejak 2026-08-10.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA — dan kenapa penjaga yang SUDAH ADA tak mencegahnya
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-12:
 *
 *     companies TOTAL            2.196
 *     companies bernama [UJI…    1.149
 *     companies AKTIF               42
 *     companies [UJI yang AKTIF     39   <- hanya TIGA yang nyata
 *
 * Tiga yang nyata: Puraloka Persada · PT Puraloka Nusantara ·
 * PT Puraloka Properti. Sisanya residu test.
 *
 * ── Akibat yang sudah terjadi, bukan yang mungkin terjadi
 *
 * 1. **158 berkas test merah dalam satu run**, sementara dijalankan
 *    SENDIRI-SENDIRI berkas yang sama lulus. Banyak fixture memilih
 *    barisnya lewat `LIMIT 1` atas company aktif — dan 39 dari 42 company
 *    aktif adalah sampah, jadi fixture praktis mengundi tenant acak.
 *
 *    Gejalanya menuduh RUTE ("expected 403 to be 200"), bukan data. Kelas
 *    yang sama persis dengan cacat akun penjadwal 2026-09-11.
 *
 * 2. `notification_rules` **1.012 baris** — sudah MELEWATI batas potong
 *    senyap PostgREST di 1.000. Halaman Aturan Notifikasi saat ini
 *    menampilkan sebagian, tanpa satu pun galat.
 *
 * ── Kenapa `audit-test-bersihkan-company.mjs` HIJAU selama ini
 *
 * Penjaga itu benar dan tidak bocor. Yang dijaganya: **jumlah BERKAS test
 * yang tak membersihkan diri tidak boleh bertambah** — ratchet di 23.
 *
 * Tetapi 23 berkas yang dibekukan itu tetap menambah ~27 baris tiap kali
 * suite dijalankan. Penjaganya menahan LAJU PERTUMBUHAN DAFTAR, bukan
 * pertumbuhan BARIS. Diukur di header penjaga itu sendiri: 597 baris pada
 * 2026-08-16; hari ini 1.149.
 *
 * Penjaga yang benar untuk hal yang salah tetap membiarkan masalahnya
 * tumbuh — dan hijaunya membuat orang berhenti memeriksa.
 *
 * ── Yang dihapus, dan yang TIDAK
 *
 * DIHAPUS: company berpola nama test YANG TAK PUNYA SATU PUN anggota
 * aktif. Dua syarat, dan syarat kedua yang menjaganya:
 *
 *   - nama cocok pola `[UJI…` / kode berawalan `uji-`
 *   - NOL `company_members` aktif
 *
 * TIDAK DIHAPUS: apa pun yang punya anggota aktif, termasuk bila namanya
 * kebetulan mengandung "uji" — `grup-uji-nusantara` dan
 * `grup-uji-properti` adalah tenant NYATA yang kodenya terlanjur begitu.
 * Menyaring lewat NAMA saja akan menghapus keduanya.
 *
 * ⚠ Itu bukan kehati-hatian teoretis: dua dari tiga company nyata
 * berkode `grup-uji-*`. Penyaring berbasis nama akan menghapus dua
 * pertiga tenant produksi.
 *
 * ── Idempoten & bisa diulang
 *
 * Uji-kering secara BAWAAN. `--terapkan` untuk benar-benar menulis.
 * Menjalankannya dua kali tak mengubah apa pun pada jalan kedua.
 *
 * ⚠ Basis ini berisi data dummy (CLAUDE.md §8a.5), tetapi penghapusan
 * tetap butuh konfirmasi — dan konfirmasinya turun 2026-09-12.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MENONAKTIFKAN, BUKAN MENGHAPUS — basis yang menolak, dan ia BENAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi pertama skrip ini MENGHAPUS baris `companies`. Ia ditolak trigger
 * `fn_company_no_casual_delete` (migrasi 126 §8), dan seluruh transaksi
 * ROLLBACK dengan benar:
 *
 *     Company "…" tidak boleh dihapus. Nonaktifkan (is_active=false) atau
 *     jalankan prosedur off-boarding tenant.
 *
 * Alasan yang tertulis di migrasinya: *"untuk tenant, penghapusan harus
 * jadi keputusan sadar, bukan efek samping"*. Skrip pembersih massal
 * adalah persis "efek samping" yang dimaksud.
 *
 * **Dan menonaktifkan sudah cukup untuk masalah yang sedang dipecahkan.**
 * Yang membuat 158 berkas test merah bukan JUMLAH baris melainkan fixture
 * `LIMIT 1` yang mendarat di tenant sampah — dan fixture itu menyaring
 * `is_active`. Tenant nonaktif tak bisa terpilih lagi.
 *
 * Yang TIDAK diselesaikan dengan menonaktifkan, dan itu jujur dicatat:
 * `notification_rules` tetap 1.012 baris. Kalau kelak benar-benar perlu
 * dihapus, jalurnya prosedur off-boarding tenant — bukan skrip ini.
 *
 * ⚠ Baris ANAK tetap dihapus (approval_chains, financial_config, dst).
 * Itu bukan tenant, dan itulah yang menekan jumlah baris tabel operasional.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const TERAPKAN = process.argv.includes('--terapkan')

const c = buatClient()
await c.connect()

/*
  Pola nama/kode test yang dipakai suite ini. Dikumpulkan dengan membaca
  `companies.name` yang benar-benar ada, bukan ditebak.

  `name LIKE '[UJI%'` menangkap mayoritas; `code LIKE 'uji-%'` menangkap
  yang dibuat lewat rute register (nama manusiawi, kode bertanda).
*/
const SARINGAN = `(co.name LIKE '[UJI%' OR co.code LIKE 'uji-%' OR co.code LIKE 'uji_%')`

/*
  Syarat KEDUA yang menyelamatkan tenant nyata: nol anggota aktif.

  Dinilai lewat `company_members`, bukan lewat nama — dua tenant produksi
  berkode `grup-uji-*` dan akan tersapu oleh penyaring nama.
*/
/*
  Syarat KEDUA yang menyelamatkan tenant nyata.

  Versi pertama: "nol anggota aktif". Itu benar untuk 1.140 baris, tetapi
  MELEWATKAN 10 company uji yang `afterAll`-nya tak sempat jalan — mereka
  punya anggota aktif, jadi terlindungi, dan justru merekalah yang terus
  dipungut fixture `LIMIT 1` (company aktif tinggal 13, sepuluh di
  antaranya sampah).

  Sekarang: aman bila NOL anggota aktif, ATAU seluruh anggota aktifnya
  adalah AKUN UJI.

  ⚠ Yang membuat ini tidak berbahaya: yang diubah cuma `companies.is_active`.
  Baris `company_members` dan `users` TIDAK disentuh — dan itu menentukan,
  sebab satu-satunya anggota kesepuluh company itu adalah
  `layar.admin@puraloka.test`, AKUN PENJADWAL. Menghapus keanggotaannya
  akan mengulang persis cacat yang baru ditutup migrasi 568 (194 tugas
  terjadwal gagal 403).

  Akun uji dikenali dari domain `.test` / pola `[UJI`, bukan dari daftar
  email yang dipaku — daftar dipaku akan basi pada akun uji berikutnya.
*/
const AMAN = `(
  NOT EXISTS (
    SELECT 1 FROM company_members cm
     WHERE cm.company_id = co.id AND cm.is_active
  )
  OR NOT EXISTS (
    SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
     WHERE cm.company_id = co.id AND cm.is_active
       AND u.email NOT LIKE '%.test'
       AND u.email NOT LIKE '%@ujicoba.test'
       AND u.name NOT LIKE '[UJI%'
  )
)`

const { rows: sasaran } = await c.query(`
  SELECT co.id, co.name, co.code, co.is_active
    FROM companies co
   WHERE ${SARINGAN} AND ${AMAN}
   ORDER BY co.name, co.created_at
`)

const { rows: [{ n: totalAwal }] } = await c.query('SELECT count(*)::int n FROM companies')
const { rows: dilindungi } = await c.query(`
  SELECT co.name, co.code
    FROM companies co
   WHERE ${SARINGAN} AND NOT (${AMAN})
   ORDER BY co.name
`)

console.log('══ Company sisa test yang menumpuk ════════════════════════')
console.log(`  companies TOTAL sekarang : ${totalAwal}`)
console.log(`  akan DIHAPUS             : ${sasaran.length}`)
console.log(`  berpola uji tapi DILINDUNGI (punya anggota aktif): ${dilindungi.length}`)
for (const d of dilindungi) console.log(`     • ${d.name}  [${d.code}]`)
console.log('')

/* Ringkas per nama — 1.149 baris mentah tak terbaca siapa pun. */
const perNama = new Map()
for (const s of sasaran) perNama.set(s.name, (perNama.get(s.name) ?? 0) + 1)
console.log('  yang dihapus, per nama:')
for (const [nama, n] of [...perNama].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${nama}`)
}
console.log('')

if (sasaran.length === 0) {
  console.log('✅ Tak ada yang perlu dihapus.')
  await c.end()
  process.exit(0)
}

if (!TERAPKAN) {
  console.log('UJI-KERING — tak ada yang ditulis. Pakai --terapkan untuk menghapus.')
  await c.end()
  process.exit(0)
}

/*
  Dihapus dalam SATU transaksi.

  Sebagian tabel turunan ber-ON DELETE CASCADE dan sebagian tidak; yang
  tidak, dihapus eksplisit lebih dulu. Menghapusnya di luar transaksi
  berisiko meninggalkan basis setengah bersih kalau satu perintah gagal —
  keadaan yang lebih sulit didiagnosis daripada keadaan awal.
*/
const idList = sasaran.map((s) => s.id)

await c.query('BEGIN')
try {
  /*
    Urutan penting: anak lebih dulu, induk terakhir. Tabel di bawah dipilih
    dari yang benar-benar ber-`company_id` dan BUKAN cascade — diukur lewat
    information_schema, bukan diingat.
  */
  /*
    `audit_logs` DIKECUALIKAN, dan ini bukan kompromi.

    Ia append-only lewat trigger — Ember [C] (CLAUDE.md §5.3), yang
    tak boleh bisa dikonfigurasi sekalipun diminta. Jalan pertama skrip
    ini menabraknya dan seluruh transaksi ROLLBACK dengan benar:

        ❌ audit_logs bersifat append-only: DELETE ditolak

    Yang benar bukan melemahkan trigger melainkan membiarkan jejaknya.
    Jejak audit atas tenant yang dihapus tetap sah — justru itu gunanya
    audit: mencatat bahwa sesuatu PERNAH ada.

    Barisnya menjadi yatim (company_id menunjuk baris yang tak ada lagi),
    dan itu diterima: `audit_logs` tak punya FK ke `companies` persis
    supaya riwayat selamat dari penghapusan.
  */
  const KECUALI = new Set(['audit_logs'])

  /*
    TABEL KATEGORI C ikut dihapus - dan melewatkannya adalah kesalahan
    yang sudah menggagalkan skrip ini sekali.

    Tak semua tabel punya `company_id`. Diukur 2026-09-12: 60 tabel
    mewarisi tenancy lewat `project_id` saja (`mandor_assignments`,
    `progress_logs`, `rab_items`, ...). Itu pola yang sudah tertulis di
    CLAUDE.md 5.2 sebagai `db.viaProject()`.

    Mengumpulkan tabel HANYA lewat `company_id` membuat mereka tak pernah
    masuk graf, sehingga `projects` dihapus sementara anaknya bertahan:

        update or delete on table "projects" violates foreign key
        constraint "mandor_assignments_project_id_fkey"

    Keduanya dikumpulkan sekarang, dan masing-masing dihapus dengan
    predikat yang sesuai perannya.
  */
  /*
    HANYA `BASE TABLE`. `information_schema.columns` ikut memuat VIEW, dan
    DELETE lewat view yang bisa diperbarui diteruskan ke tabel di baliknya.

    Diukur 2026-09-12: `v_situs_publik` lolos ke daftar, dan DELETE
    lewatnya memicu trigger anti-hapus di `companies` — galat yang menuduh
    penghapusan tenant, padahal skrip ini tak pernah menulis
    `DELETE FROM companies`. Butuh tiga putaran sebelum nama viewnya
    terlihat, karena pesannya menyebut AKIBAT, bukan pelakunya.
  */
  const { rows: tabelCompany } = await c.query(`
    SELECT DISTINCT tc.table_name
      FROM information_schema.columns tc
     WHERE tc.table_schema = 'public'
       AND tc.column_name = 'company_id'
       AND tc.table_name <> 'companies'
       AND EXISTS (
         SELECT 1 FROM information_schema.tables t
          WHERE t.table_schema = 'public'
            AND t.table_name = tc.table_name
            AND t.table_type = 'BASE TABLE')
     ORDER BY tc.table_name
  `)

  const { rows: tabelProyek } = await c.query(`
    SELECT DISTINCT tc.table_name
      FROM information_schema.columns tc
     WHERE tc.table_schema = 'public'
       AND tc.column_name = 'project_id'
       AND tc.table_name NOT IN (
         SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'company_id')
       AND EXISTS (
         SELECT 1 FROM information_schema.tables t
          WHERE t.table_schema = 'public'
            AND t.table_name = tc.table_name
            AND t.table_type = 'BASE TABLE')
     ORDER BY tc.table_name
  `)

  /* Peran tiap tabel - menentukan predikat DELETE-nya. */
  const peran = new Map()
  for (const { table_name } of tabelCompany) peran.set(table_name, 'company')
  for (const { table_name } of tabelProyek) peran.set(table_name, 'proyek')

  const tabelAnakSemua = [...peran.keys()].map((table_name) => ({ table_name }))
  const kandidat = tabelAnakSemua
    .map((t) => t.table_name)
    .filter((t) => !KECUALI.has(t))

  /*
    URUTAN HAPUS DIHITUNG dari graf foreign key, bukan diurutkan abjad.

    Jalan kedua skrip ini gagal karena urutan abjad menaruh `projects`
    sebelum `mandor_assignments`, dan yang kedua menunjuk yang pertama:

        ❌ update or delete on table "projects" violates foreign key
           constraint "mandor_assignments_project_id_fkey"

    Tak ada FK deferrable di basis ini (diukur: 869 non-deferrable, 0
    deferrable), jadi `SET CONSTRAINTS ALL DEFERRED` tak menolong.

    Yang dipakai: urutan topologis terbalik — tabel yang DITUNJUK orang
    lain dihapus BELAKANGAN. Dihitung dari `pg_constraint`, jadi ia ikut
    benar sendiri saat tabel baru ditambahkan; daftar urutan tulisan
    tangan akan basi pada migrasi berikutnya.
  */
  const { rows: fk } = await c.query(`
    SELECT src.relname AS anak, tgt.relname AS induk
      FROM pg_constraint k
      JOIN pg_class src ON src.oid = k.conrelid
      JOIN pg_class tgt ON tgt.oid = k.confrelid
      JOIN pg_namespace n ON n.oid = src.relnamespace
     WHERE k.contype = 'f' AND n.nspname = 'public'
       AND src.relname <> tgt.relname
  `)

  const himpunan = new Set(kandidat)
  /* induk -> daftar anak yang menunjuknya (hanya di antara kandidat) */
  const anakDari = new Map(kandidat.map((t) => [t, []]))
  for (const { anak, induk } of fk) {
    if (himpunan.has(anak) && himpunan.has(induk)) anakDari.get(induk).push(anak)
  }

  const urut = []
  const status = new Map() /* 1 = sedang dikunjungi, 2 = selesai */
  const kunjungi = (t) => {
    if (status.get(t) === 2) return
    /*
      Siklus FK (A->B->A) mungkin ada dan bukan kesalahan. Dibiarkan
      lewat: urutan di dalam siklus tak bisa diperbaiki, dan menabraknya
      akan ROLLBACK dengan pesan yang jelas — lebih baik daripada diam.
    */
    if (status.get(t) === 1) return
    status.set(t, 1)
    for (const a of anakDari.get(t) ?? []) kunjungi(a)
    status.set(t, 2)
    urut.push(t)
  }
  for (const t of kandidat) kunjungi(t)

  const tabelAnak = urut.map((table_name) => ({ table_name }))

  let totalAnak = 0
  for (const { table_name } of tabelAnak) {
    /*
      Dua predikat, sesuai bagaimana tabel itu mewarisi tenancy:

        company  -> `company_id = ANY(...)`
        proyek   -> `project_id IN (proyek milik company tsb)`

      Yang kedua memakai subquery, bukan daftar id proyek yang dihitung
      lebih dulu: proyeknya ikut terhapus di dalam transaksi yang sama,
      dan subquery membacanya pada keadaan yang tepat.
    */
    const sql =
      peran.get(table_name) === 'proyek'
        ? `DELETE FROM public.${table_name}
            WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1::uuid[]))`
        : `DELETE FROM public.${table_name} WHERE company_id = ANY($1::uuid[])`

    let r
    try {
      r = await c.query(sql, [idList])
    } catch (e) {
      /*
        Sebut NAMA TABELNYA. Tanpa ini pesannya cuma menyebut trigger yang
        menolak, dan orang berikutnya harus menebak DELETE mana yang
        memicunya di antara ~100 tabel — biaya yang dibayar orang lain.
      */
      throw new Error(`saat menghapus dari "${table_name}": ${e.message}`)
    }
    if (r.rowCount) {
      totalAnak += r.rowCount
      console.log(`    -${String(r.rowCount).padStart(6)}  ${table_name}`)
    }
  }

  /*
    Company DINONAKTIFKAN, bukan dihapus — lihat kepala berkas.
    `WHERE is_active` membuatnya idempoten: jalan kedua menyentuh 0 baris.
  */
  const rInduk = await c.query(
    'UPDATE companies SET is_active = false WHERE id = ANY($1::uuid[]) AND is_active',
    [idList],
  )
  await c.query('COMMIT')

  console.log('')
  console.log(`  baris turunan dihapus  : ${totalAnak}`)
  console.log(`  companies dinonaktifkan: ${rInduk.rowCount}`)
} catch (e) {
  await c.query('ROLLBACK')
  console.error('')
  console.error('❌ GAGAL — seluruh perubahan dibatalkan (ROLLBACK).')
  console.error(`   ${e.message}`)
  await c.end()
  process.exit(1)
}

/* ── Verifikasi SESUDAH, dua arah ───────────────────────────────────────── */
const { rows: [{ n: totalAkhir }] } = await c.query('SELECT count(*)::int n FROM companies')
const { rows: [{ n: nyataAktif }] } = await c.query(`
  SELECT count(*)::int n FROM companies co
   WHERE co.is_active AND EXISTS (
     SELECT 1 FROM company_members cm WHERE cm.company_id = co.id AND cm.is_active)
`)
const { rows: [{ n: aturan }] } = await c.query('SELECT count(*)::int n FROM notification_rules')

console.log('')
console.log('══ SESUDAH ════════════════════════════════════════════════')
console.log(`  companies TOTAL          : ${totalAwal} → ${totalAkhir}  (tetap — dinonaktifkan, bukan dihapus)`)
console.log(`  company aktif beranggota : ${nyataAktif}`)
console.log(`  notification_rules       : ${aturan}${aturan >= 1000 ? '  ⚠ MASIH ≥1000 (batas potong PostgREST)' : ''}`)

/*
  Arah kedua: pastikan tenant NYATA masih berdiri. Angka yang turun saja
  tak membuktikan apa pun — yang perlu dibuktikan adalah yang TIDAK ikut
  terhapus.
*/
/*
  Arah KETIGA: akun penjadwal wajib tetap punya keanggotaan aktif di tiap
  tenant yang masih hidup.

  Ini pagar langsung terhadap kekambuhan migrasi 568 — di sana satu akun
  yang kehilangan aksesnya memutus 194 tugas terjadwal, dan gejalanya nol
  sampai seseorang membuka `jadwal_tugas.terakhir_galat`.
*/
const { rows: [{ n: penjadwal }] } = await c.query(`
  SELECT count(*)::int n
    FROM company_members cm
    JOIN companies co ON co.id = cm.company_id
    JOIN users u ON u.id = cm.user_id
   WHERE cm.is_active AND co.is_active
     AND u.email = 'layar.admin@puraloka.test'
`)
console.log(`  keanggotaan penjadwal    : ${penjadwal} tenant hidup`)

if (penjadwal < 3) {
  console.error('')
  console.error(`BAHAYA: akun penjadwal hanya beranggota di ${penjadwal} tenant hidup (>=3).`)
  console.error('   Ini gejala migrasi 568 terulang. Periksa sebelum melanjutkan.')
  await c.end()
  process.exit(1)
}

if (nyataAktif < 3) {
  console.error('')
  console.error(`❌ BAHAYA: company aktif beranggota tinggal ${nyataAktif}, seharusnya ≥3.`)
  console.error('   Periksa segera — penyaring mungkin terlalu longgar.')
  await c.end()
  process.exit(1)
}

console.log('')
console.log('✅ Bersih. Tenant nyata utuh.')
await c.end()
