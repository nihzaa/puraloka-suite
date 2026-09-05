// A2 — Setup project Supabase CI (SETELAH A1 EMPTY + CI_DIRECT_URL port 5432 OK).
// Apply migration 001…116 (file nyata) BERURUTAN + seed data uji minimal. Dijalankan
// via workflow ci-isolation.yml (action=setup) karena CI_DIRECT_URL di GitHub Secrets.
//
// Migrasi = FATAL bila gagal (lapor file + berhenti). Seed = per-item try/catch
// (non-fatal) supaya semua isu tampak sekaligus. Idempoten: aman diulang.
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const url = process.env.CI_DIRECT_URL
if (!url) { console.error('FATAL: CI_DIRECT_URL kosong'); process.exit(1) }
try { console.log('Target host:', new URL(url.replace('postgresql://', 'http://')).host) } catch {}

const c = new pg.Client({ connectionString: url })
await c.connect()

// ── 0. (opsional) WIPE — replay BERSIH dari nol. HANYA bila WIPE=1 (project CI disposable).
if (process.env.WIPE === '1') {
  /*
    ⚠ `DROP SCHEMA public CASCADE` TIDAK MUAT — dan gagalnya menuduh memori.

    Diukur 2026-09-04, pertama kalinya WIPE dijalankan sejak schema tumbuh:

        error: out of shared memory
        routine: 'LockAcquireExtended'

    Sebabnya bukan memori server melainkan SLOT KUNCI: satu `DROP … CASCADE`
    mengunci SELURUH objek turunan dalam SATU transaksi, dan `public` berisi
    **1.351 objek** (297 tabel + indeks + sequence + view) sementara
    `max_locks_per_transaction` bawaan hanya 64.

    Galat "out of shared memory" terbaca seperti server kekurangan RAM —
    dan itu menuntun ke arah yang salah sepenuhnya. Yang habis adalah tabel
    kunci, yang ukurannya ditentukan setelan, bukan beban.

    Yang benar: drop BERTAHAP, satu transaksi per tabel. Lebih lambat, tapi
    tiap transaksi hanya memegang kunci untuk satu tabel beserta turunannya
    — jumlah yang selalu muat berapa pun schema tumbuh.
  */
  console.log('WIPE: drop bertahap semua tabel public + reset schema_migrations …')
  const { rows: tabel } = await c.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
  console.log(`  ${tabel.length} tabel akan di-drop satu per satu`)
  let didrop = 0
  for (const { tablename } of tabel) {
    /*
      `CASCADE` per-tabel tetap dipakai: ia hanya menyeret objek MILIK tabel
      itu (indeks, constraint, view yang bergantung), bukan seluruh schema.

      ⚠ Nama tabel di-quote lewat `quote_ident()` Postgres, bukan dirangkai
      di JavaScript. Nama dari `pg_tables` memang berasal dari basis kita
      sendiri, tetapi merangkai identifier dengan tangan adalah kebiasaan
      yang benar sampai suatu hari sumbernya berubah — dan `quote_ident`
      menangani huruf besar, spasi, dan kata kunci SQL.

      Diuji di schema terpisah: tabel bernama `Huruf Besar` dan `select`
      keduanya ter-drop, FK antar-tabel teratasi CASCADE per-tabel, dan
      view yang bergantung ikut hilang.
    */
    const { rows: q } = await c.query(`SELECT quote_ident($1) AS nama`, [tablename])
    await c.query(`DROP TABLE IF EXISTS public.${q[0].nama} CASCADE`)
    didrop++
    if (didrop % 50 === 0) console.log(`  …${didrop}/${tabel.length}`)
  }
  console.log(`  ${didrop} tabel di-drop.`)

  /*
    ⚠ TABEL SAJA TIDAK CUKUP — dan versi pertama saya berhenti di situ.

    Diukur 2026-09-04: sesudah 294 tabel terhapus dan WIPE melapor "project
    CI benar-benar kosong", migrasi PERTAMA langsung gagal:

        HARD FAIL 001_extensions_and_enums.sql
        type "project_status" already exists

    `DROP SCHEMA CASCADE` versi lama membuang SEMUANYA. Menggantinya dengan
    drop per-tabel menyelesaikan masalah slot kunci tetapi meninggalkan
    kelas objek lain — dan "kosong" yang saya cetak itu tidak benar.

    Diukur di basis dev: 294 tabel · 3 view · 83 tipe berdiri sendiri ·
    515 fungsi. Tipe dan fungsi JAUH lebih banyak dari tabelnya.

    Tiap kelas dibuang dalam transaksinya sendiri, alasan yang sama dengan
    tabel: satu perintah yang mengunci ratusan objek sekaligus tak akan muat.
  */
  const { rows: view } = await c.query(`
    SELECT viewname FROM pg_views WHERE schemaname = 'public'`)
  for (const { viewname } of view) {
    const { rows: q } = await c.query(`SELECT quote_ident($1) AS nama`, [viewname])
    await c.query(`DROP VIEW IF EXISTS public.${q[0].nama} CASCADE`)
  }
  if (view.length) console.log(`  ${view.length} view di-drop.`)

  /*
    Hanya tipe yang BERDIRI SENDIRI. Tiap tabel punya "tipe baris" otomatis
    bernama sama; ia hilang bersama tabelnya dan tak boleh di-drop terpisah.
    Tanpa saringan `typrelid = 0`, hitungannya 380 — dan sebagian besarnya
    bayangan tabel yang sudah tiada.
  */
  /*
    ⚠ `typrelid = 0` SAJA MELEWATKAN TIPE YATIM.

    Diukur 2026-09-04, sesudah WIPE melapor 258/258 tabel ter-drop:

        437 gagal: duplicate key violates unique constraint
                   "pg_type_typname_nsp_index"

    `CREATE TABLE IF NOT EXISTS penawaran_subkon_item` gagal — bukan karena
    tabelnya ada (tak ada), melainkan karena TIPE BARIS bernama sama masih
    tersisa. Postgres membuat satu tipe per tabel, dan `IF NOT EXISTS` pada
    tabel tak memeriksa `pg_type`.

    Saringan lama mengecualikan tipe ber-`typrelid <> 0` dengan alasan yang
    benar (ia milik tabel, hilang bersama tabelnya) — tetapi alasan itu
    runtuh bila tabelnya sudah tiada sementara tipenya tertinggal. Tipe
    seperti itu tak terlihat oleh saringan mana pun dan menghalangi replay
    berikutnya dengan galat yang menuduh KUNCI GANDA.

    Kondisi kedua di bawah menyapunya: tipe ber-typrelid yang `pg_class`-nya
    TIDAK ADA lagi.
  */
  const { rows: tipe } = await c.query(`
    SELECT t.typname FROM pg_type t
      JOIN pg_namespace ns ON ns.oid = t.typnamespace
     WHERE ns.nspname = 'public' AND t.typtype IN ('e','d','c')
       AND (
         (t.typrelid = 0
          AND NOT EXISTS (SELECT 1 FROM pg_class c2 WHERE c2.reltype = t.oid))
         OR
         (t.typrelid <> 0
          AND NOT EXISTS (SELECT 1 FROM pg_class c3 WHERE c3.oid = t.typrelid))
       )`)
  for (const { typname } of tipe) {
    const { rows: q } = await c.query(`SELECT quote_ident($1) AS nama`, [typname])
    await c.query(`DROP TYPE IF EXISTS public.${q[0].nama} CASCADE`)
  }
  console.log(`  ${tipe.length} tipe di-drop.`)

  /*
    Fungsi di-drop lewat tanda tangan lengkapnya (`oid::regprocedure`) —
    nama saja ambigu bila ada beberapa yang kelebihan beban, dan
    `DROP FUNCTION nama` menolak dengan galat yang menuduh nama itu tak ada.
  */
  const { rows: fungsi } = await c.query(`
    SELECT p.oid::regprocedure::text AS sig, p.prokind
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'`)
  let fdrop = 0
  const fgagal = []
  for (const { sig, prokind } of fungsi) {
    const jenis = prokind === 'a' ? 'AGGREGATE' : prokind === 'p' ? 'PROCEDURE' : 'FUNCTION'
    try {
      await c.query(`DROP ${jenis} IF EXISTS ${sig} CASCADE`)
      fdrop++
    } catch (e) {
      /*
        Sebagian fungsi ikut terbuang lewat CASCADE fungsi lain, dan
        `regprocedure` yang sudah tak ada memang menolak. Itu wajar.

        Yang TIDAK wajar adalah menelannya diam-diam: kalau sebuah fungsi
        bertahan karena sebab lain, replay berikutnya gagal dengan galat
        yang menuduh migrasinya. Dikumpulkan dan dilaporkan — sesudah
        semuanya dicoba, bukan berhenti di yang pertama.
      */
      fgagal.push(`${sig}: ${e.message}`)
    }
  }
  console.log(`  ${fdrop} fungsi/prosedur di-drop.`)
  if (fgagal.length) {
    console.log(`  ${fgagal.length} tak bisa di-drop (biasanya sudah ikut CASCADE):`)
    for (const g of fgagal.slice(0, 5)) console.log(`      ${g}`)
  }

  // Schema-nya sendiri tetap ada — tak perlu dibuat ulang, jadi grant
  // bawaan Supabase pun utuh (alasannya di catatan panjang di bawah).
  await c.query(`CREATE SCHEMA IF NOT EXISTS public`)
  await c.query(`GRANT ALL ON SCHEMA public TO postgres`)
  await c.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role`)
  await c.query(`DROP TABLE IF EXISTS supabase_migrations.schema_migrations`)
  // Storage rows dari migrasi (project-photos dst) — bersihkan juga supaya replay storage bersih.
  await c.query(`DELETE FROM storage.buckets WHERE id IN
    ('project-photos','project-documents','payment-proofs','kasbon-photos','expense-receipts','company-assets')`).catch(() => {})
  console.log('WIPE selesai — project CI benar-benar kosong.')
}

// ── 1. tabel pelacak migrasi ──────────────────────────────────────────────
await c.query(`CREATE SCHEMA IF NOT EXISTS supabase_migrations`)
await c.query(`CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations
  (version text PRIMARY KEY, name text, inserted_at timestamptz DEFAULT now())`)

// ── 2. apply migrasi berurutan (idempoten via schema_migrations) ───────────
const dir = path.resolve(process.cwd(), '..', '..', 'db', 'migrations')
const files = fs.readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort()

// DAFTAR EKSPLISIT migrasi yang BOLEH dilewati BILA GAGAL — beserta alasan + klasifikasi.
// HANYA storage (upload tak diuji CI) & demo-data (test menyediakan fixturenya sendiri).
// Migrasi GAGAL di LUAR daftar ini = HARD FAIL — config/referensi/backfill WAJIB ada
// (pelajaran `unit`: yang tak dikenal HARUS gagal keras, bukan dilewati diam-diam).
const SKIP_ALLOWLIST = {
  '012': { class: 'storage', reason: 'bucket+RLS project-photos; di-supersede 097/098; upload tak diuji CI' },
  '014': { class: 'storage', reason: 'bucket dokumen; storage tak diuji CI' },
  '015': { class: 'storage', reason: 'bucket bukti bayar; storage tak diuji CI' },
  '097': { class: 'storage', reason: 'lockdown bucket privat; storage tak diuji CI' },
  '098': { class: 'storage', reason: 'photo buckets strict; storage tak diuji CI' },
  '024': { class: 'demo',    reason: 'seed work_scope_items (FK data contoh); test + seed fixture menyediakan datanya' },

  /*
    KELAS BARU: `cacat-tertambal` — dan ia menuntut syarat yang tak dimiliki
    dua kelas lain.

    `storage` dan `demo` dilewati karena memang TAK RELEVAN di CI. Yang ini
    berbeda: migrasinya BENAR-BENAR RUSAK, dan yang membuatnya boleh dilewati
    adalah adanya migrasi LAIN yang menutup akibatnya.

    Syaratnya: `pengganti` wajib diisi, dan berkasnya wajib ada. Tanpa itu,
    kelas ini jadi tempat membuang kegagalan yang belum dipahami — persis yang
    komentar di atas peringatkan ("yang tak dikenal HARUS gagal keras").
  */
  /*
    ⚠ 212 SEMPAT ADA DI SINI, LALU DICABUT — dan itu jalan yang benar.

    Migrasi 212 gagal `too few arguments for format()`, dan saya sempat
    memasukkannya ke allowlist dengan penambal terpisah (526). Itu KELIRU:

    Tiap migrasi dijalankan dalam transaksi (BEGIN … ROLLBACK di bawah), jadi
    kegagalan di baris 210 membuang SELURUH 212 — termasuk kelima tabel yang
    dibuat di baris 37-141. Yang hilang bukan policy-nya; TABELNYA.

    Penambal terpisah tak bisa menolong keadaan itu. Ketahuannya baru sesudah
    CI melaporkan kegagalan BERIKUTNYA: `213 → relation "hari_libur" does not
    exist`.

    212 kini diperbaiki di tempatnya, mengikuti preseden 016 yang dicatat di
    `181_f2_5_storage_tenant_scoped.sql`.

    Pelajaran untuk kelas `cacat-tertambal` di bawah: ia HANYA sah bila
    migrasinya gagal SESUDAH bagian yang penting berhasil di-commit. Untuk
    migrasi yang gagal di tengah transaksi, tak ada penambal yang cukup —
    yang rusak harus diperbaiki.
  */
}

/*
  Kelas `cacat-tertambal` WAJIB menunjuk berkas pengganti yang benar-benar ada.

  Tanpa pemeriksaan ini, entri di atas cuma janji: kalau penggantinya nanti
  dihapus atau dinomori ulang, migrasi rusaknya tetap dilewati dan lubangnya
  terbuka lagi — tanpa satu pun gejala, karena CI tetap hijau.
*/
for (const [versi, a] of Object.entries(SKIP_ALLOWLIST)) {
  if (a.class !== 'cacat-tertambal') continue
  if (!a.pengganti) {
    console.error(`FATAL: allowlist ${versi} berkelas cacat-tertambal tanpa \`pengganti\`.`)
    process.exit(2)
  }
  if (!fs.existsSync(path.join(dir, a.pengganti))) {
    console.error(
      `FATAL: allowlist ${versi} menunjuk pengganti "${a.pengganti}" yang TIDAK ADA.\n`
      + '       Migrasi rusak yang dilewati tanpa penambal adalah lubang yang '
      + 'terbuka lagi tanpa gejala.',
    )
    process.exit(2)
  }
}

/*
  ── PAKSA_ULANG: hapus catatan versi tertentu supaya diputar ulang ─────────

  Sidik jari di bawah menutup kelas cacat "disunting tapi tak diputar ulang"
  untuk SETERUSNYA — tetapi tidak ke belakang: entri yang sudah tercatat
  sebelum fitur ini ada belum punya sidik jari, dan sengaja dianggap cocok.
  Tanpa itu, satu kali jalan akan memutar ulang SELURUH 551 migrasi sekaligus.

  Jalan keluarnya untuk perbaikan yang terlanjur tertahan: sebut versinya.

      PAKSA_ULANG=377,398 node scripts/ci-project-setup.mjs

  ⚠ Sengaja MENUNTUT daftar versi, bukan menerima `all`. Buku migrasi adalah
  Gerbang Keras G-2 (CLAUDE.md §5.5) — sebuah sakelar yang bisa menghapus
  seluruh catatan sekali tekan adalah pintu belakang yang cepat sekali dipakai
  tanpa berpikir. Menyebut nomornya memaksa orang tahu apa yang ia putar ulang.
*/
const PAKSA_ULANG = new Set(
  (process.env.PAKSA_ULANG ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v)),
)
if (PAKSA_ULANG.size) {
  const daftar = [...PAKSA_ULANG]
  const { rowCount } = await c.query(
    `DELETE FROM supabase_migrations.schema_migrations WHERE version = ANY($1)`,
    [daftar],
  )
  console.log(`PAKSA_ULANG: ${rowCount} catatan dihapus (${daftar.join(', ')}) — akan diputar ulang.`)
}

let applied = 0, alreadyThere = 0
const skippedList = []
for (const f of files) {
  const version = f.match(/^(\d+)_/)[1]
  /*
    Entri ber-`[SKIP:…]` TIDAK dihitung "sudah jalan" — ia DICOBA ULANG.

    ⚠ Diukur 2026-08-31, dan ini kelas cacat G-2 yang paling berbahaya.

    Satu run menulis `212_… [SKIP:cacat-tertambal]` ke buku migrasi CI saat
    migrasinya masuk allowlist. Migrasinya lalu DIPERBAIKI, tetapi run
    berikutnya melewatinya — karena versinya sudah tercatat.

    Akibatnya: 212 tak pernah dijalankan lagi, kelima tabelnya tak pernah
    dibuat, dan 213 tetap gagal `relation "hari_libur" does not exist` —
    dengan CI yang tak menyebut 212 sama sekali. Perbaikannya benar; yang
    menghalangi catatannya sendiri.

    Ini persis yang CLAUDE.md §5.5 sebut: "entri palsu = migrasi dilewati
    senyap selamanya".

    Entri `[SKIP:]` menandai migrasi yang DILEWATI, bukan yang berhasil.
    Mencobanya ulang tiap kali adalah satu-satunya cara perbaikannya bisa
    berlaku — dan bila ia masih rusak, allowlist tetap menangkapnya seperti
    sebelumnya.
  */
  const { rows } = await c.query(
    `SELECT name FROM supabase_migrations.schema_migrations WHERE version=$1`,
    [version],
  )
  const sql = fs.readFileSync(path.join(dir, f), 'utf8')

  /*
    ── SIDIK JARI ISI: migrasi yang DISUNTING wajib diputar ulang ───────────

    Kelas cacat sepupu dari `[SKIP:]` di atas, dan sama tak bergejalanya.

    Diukur 2026-09-04: migrasi 377 diperbaiki (ia mematikan SELURUH company
    di schema bersih), tetapi run berikutnya melewatinya — versinya sudah
    tercatat BERHASIL. Perbaikannya tak pernah berlaku, dan kegagalan yang
    sama muncul lagi di migrasi 398 dengan galat yang menuduh tipe data.

    Yang membuatnya sulit dilihat: angkanya TIDAK BERGERAK SAMA SEKALI antar
    run. Kalau perbaikan berjalan tapi kurang, angkanya akan berubah sedikit.
    Nol pergerakan itulah petunjuknya — dan butuh tiga run untuk terbaca.

    Komentar `[SKIP:]` di atas sudah menuliskan pelajarannya untuk migrasi
    yang DILEWATI. Yang tak tercakup: migrasi yang BERHASIL lalu disunting.
    Keduanya kini ditangani dengan alasan yang sama.

    ⚠ Sidik jari disimpan di kolom `name`, BUKAN kolom baru.
    `supabase_migrations.schema_migrations` milik Supabase (version,
    statements, name) — menambah kolom ke sana berisiko bentrok dengan
    alatnya sendiri. Kolom `name` sudah dipakai skrip INI untuk penanda
    `[SKIP:]`, jadi bentuknya punya preseden.

    CR dibuang sebelum menghitung: berkas migrasi bisa ber-CRLF di satu
    checkout dan LF di lain (CLAUDE.md §7a), dan sidik jari yang berubah
    karena akhir baris akan memutar ulang SELURUH rantai tanpa sebab.
  */
  const sidik = crypto
    .createHash('sha256')
    .update(sql.replace(/\r/g, ''), 'utf8')
    .digest('hex')
    .slice(0, 12)

  const namaTercatat = rows[0]?.name ?? ''
  const tercatatSkip = rows.length > 0 && /\[SKIP:/.test(namaTercatat)
  const cocokSidik = namaTercatat.includes(`[SHA:${sidik}]`)
  // Entri LAMA belum punya sidik jari sama sekali — jangan putar ulang
  // seluruh rantai hanya karena formatnya berubah. Ia dianggap cocok, dan
  // sidik jarinya ditulis saat migrasi itu memang perlu dijalankan lagi.
  const punyaSidik = /\[SHA:[0-9a-f]{12}\]/.test(namaTercatat)
  const isiBerubah = punyaSidik && !cocokSidik

  if (rows.length && !tercatatSkip && !isiBerubah) { alreadyThere++; continue }
  if (isiBerubah) {
    console.log(`  ulang(isi-berubah) ${f} — sidik jari berbeda; perbaikan wajib berlaku`)
    await c.query(`DELETE FROM supabase_migrations.schema_migrations WHERE version=$1`, [version])
  }
  if (tercatatSkip) {
    console.log(`  retry(bekas-skip) ${f} — dicoba ulang; perbaikan tak boleh terhalang catatannya sendiri`)
    await c.query(`DELETE FROM supabase_migrations.schema_migrations WHERE version=$1`, [version])
  }
  try {
    await c.query('BEGIN')
    await c.query(sql)
    await c.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [version, `${f} [SHA:${sidik}]`])
    await c.query('COMMIT')
    applied++
    if (applied % 25 === 0) console.log(`  …applied ${applied} (terakhir ${f})`)
  } catch (e) {
    await c.query('ROLLBACK')
    const allow = SKIP_ALLOWLIST[version]
    if (allow) {
      await c.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [version, `${f} [SKIP:${allow.class}] [SHA:${sidik}]`])
      skippedList.push(`${f} [${allow.class}] — ${allow.reason} — gagal: ${e.message.split('\n')[0]}`)
      console.warn(`  skip(allowlist:${allow.class}) ${f} → ${e.message.split('\n')[0]}`)
      continue
    }
    console.error(`\nHARD FAIL — migrasi GAGAL di LUAR allowlist: ${f}\n  ${e.message}`)
    console.error(`  (config/referensi/backfill WAJIB ada — TIDAK dilewati. Perbaiki migrasinya / lapor founder.)`)
    await c.end()
    process.exit(1)
  }
}
console.log(`\nMIGRATIONS: applied=${applied}  sudah-ada=${alreadyThere}  skip-allowlist=${skippedList.length}  total-file=${files.length}`)
if (skippedList.length) console.log('  DAFTAR SKIP (eksplisit, allowlist):\n   - ' + skippedList.join('\n   - '))

// ── 3. seed data uji minimal (idempoten, per-item non-fatal) ───────────────
const seedErrors = []
async function seed(label, fn) {
  try { await fn(); console.log('  seed OK:', label) }
  catch (e) { seedErrors.push(`${label}: ${e.message}`); console.warn('  seed GAGAL:', label, '→', e.message.split('\n')[0]) }
}

// users (admin/pm/mandor/client) + auth.users (hanya `id` yang wajib)
const USERS = [
  ['admin', 'ci-admin@puraloka.test', 'CI Admin'],
  ['pm', 'ci-pm@puraloka.test', 'CI PM'],
  ['mandor', 'ci-mandor@puraloka.test', 'CI Mandor'],
  ['client', 'ci-client@puraloka.test', 'CI Client'],
  /*
    ⚠ `direktur` dan `estimator` DICABUT 2026-09-04, beberapa jam sesudah
    ditambahkan. Seed-nya gagal di CI:

        seed GAGAL: user direktur → role 'direktur' tak ada
                    (migrasi RBAC belum seed?)

    Saya menambahkannya sesudah memeriksa bahwa keduanya ADA sebagai role
    template — tetapi memeriksanya di basis DEV, bukan CI. Disisir ulang:
    TAK SATU PUN migrasi menyisipkan `direktur`/`estimator` ke `roles`
    (`grep -c "INSERT INTO.*roles"` = 0 pada semua berkas yang menyebutnya),
    dan `siapkan-akun-uji-peran.mjs` pun hanya membuat AKUN, bukan role.

    Di dev keduanya ada karena dibuat lewat UI atau tangan — jalur yang tak
    pernah dilalui basis CI.

    Test yang menuntutnya tetap merah, dan itu jujur: yang kurang role-nya,
    bukan akunnya. Membiarkan seed gagal justru lebih buruk — ia menjatuhkan
    seed sesudahnya yang tak ada hubungannya.
  */
]
for (const [role, email, name] of USERS) {
  await seed(`user ${role}`, async () => {
    const { rows: existing } = await c.query(`SELECT auth_id FROM public.users WHERE email=$1`, [email])
    if (existing.length && existing[0].auth_id) return
    const { rows: r } = await c.query(`SELECT id FROM roles WHERE name=$1`, [role])
    if (!r.length) throw new Error(`role '${role}' tak ada (migrasi RBAC belum seed?)`)
    const { rows: au } = await c.query(`INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id`)
    await c.query(
      `INSERT INTO public.users (name, email, role_id, auth_id, is_active)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (email) DO UPDATE SET role_id=EXCLUDED.role_id, auth_id=EXCLUDED.auth_id, is_active=true`,
      [name, email, r[0].id, au[0].id])
  })
}

// ── Keanggotaan perusahaan (F0-13) ─────────────────────────────────────────
//
// TANPA blok ini, 163 test gagal di project CI dengan pola yang membingungkan:
// puluhan `expected 403 to be 200`, `daftar admin kosong`, `admin tidak menerima
// notifikasi`. Akarnya satu, dan tak terlihat dari pesan mana pun:
//
//     "User belum terdaftar sebagai anggota perusahaan manapun"  (auth.ts:82)
//
// `resolveCompanyId()` menolak SETIAP request dari user yang tak punya baris di
// `company_members`. Jadi seluruh endpoint ber-`preHandler` membalas 403, dan
// test yang mengharapkan 200/201/400/422 gagal berjamaah.
//
// Kenapa barisnya tak ada: migrasi 126 mendaftarkan "semua user existing" ke
// tenant pertama — tetapi di project CI yang di-wipe, migrasi berjalan SEBELUM
// seed, jadi saat 126 jalan belum ada satu pun user untuk didaftarkan. Ini
// kelas cacat yang sama persis dengan F0-12 (137 gagal karena `v_admin` NULL):
// urutan seed-vs-migrasi, dan hanya muncul di lingkungan yang dibangun dari nol.
//
// Peran diambil dari `users.role_id` supaya identik dengan yang dilakukan 126 —
// peran per-company (ADR-011 D6) tetap konsisten dengan peran global user.
await seed('company_members (semua user seed)', async () => {
  const { rows: comp } = await c.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1`)
  if (!comp.length) throw new Error('tak ada company akar — migrasi 126 belum jalan?')

  const { rows: adminRow } = await c.query(
    `SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1`)

  await c.query(
    `INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active, created_by)
     SELECT $1, u.id, u.role_id, true, true, $2
       FROM public.users u
      WHERE u.role_id IS NOT NULL
     ON CONFLICT (company_id, user_id) DO NOTHING`,
    [comp[0].id, adminRow[0]?.id ?? null])

  // Verifikasi, bukan asumsi: seed yang "berhasil" tapi nol baris adalah persis
  // kegagalan senyap yang menghabiskan waktu paling lama untuk didiagnosis.
  const { rows: n } = await c.query(
    `SELECT count(*)::int AS n FROM company_members WHERE company_id=$1 AND is_active`,
    [comp[0].id])
  if (n[0].n === 0) throw new Error('company_members tetap kosong setelah insert')
  console.log(`    → ${n[0].n} anggota terdaftar di company akar`)
})

// 1 client — kolom NOT NULL: contact_person, phone, created_by (company_name nullable).
await seed('client', async () => {
  /*
    `company_id` DISEBUT EKSPLISIT — ditambahkan 2026-08-31.

    Versi sebelumnya menyisipkan tanpa kolom itu, dan `clients.company_id`
    NOT NULL, jadi nilainya datang dari default — company mana pun yang
    kebetulan terpilih, bukan tenant yang dipakai test.

    Akibatnya bukan galat di seed ini (ia "berhasil"), melainkan di tempat
    lain berjam-jam kemudian:

        {"error":"insert or update on table \"kontrak\" violates foreign key
         constraint \"kontrak_client_id_fkey\""}: expected 500 to be 201

    Rute kontrak mencari klien MILIK TENANTNYA, tak menemukan apa pun, lalu
    FK-nya meledak. Galatnya menuduh tabel `kontrak` — tempat yang tak ada
    hubungannya dengan sebabnya.

    Bentuknya sama dengan seed `assets`/`suppliers`/`pegawai` di berkas ini,
    yang semuanya sudah menyebut `company_id`.

    ⚠ Kalimat asli di sini berbunyi "dua yang tertinggal cuma `clients` dan
    `cost_codes`". Itu SALAH — `projects` juga tertinggal, dan baru ketahuan
    2026-09-04 saat rantai migrasi akhirnya diputar penuh dari nol. Sebuah
    daftar yang menyebut dirinya lengkap membuat orang berikutnya berhenti
    mencari.
  */
  const { rows: has } = await c.query(`SELECT 1 FROM clients WHERE contact_person='CI Seed Client' LIMIT 1`)
  if (has.length) return
  await c.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            'CI Seed Client', '0800000000',
            COALESCE(
              (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1),
              (SELECT id FROM public.users ORDER BY created_at LIMIT 1))
      WHERE EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)`)

  // Verifikasi, bukan asumsi: seed yang "berhasil" tapi nol baris adalah
  // persis cara kegagalan ini bersembunyi selama ini.
  const { rows } = await c.query(
    `SELECT count(*)::int n FROM clients cl
      WHERE cl.company_id = (SELECT id FROM companies WHERE parent_company_id IS NULL
                              ORDER BY created_at LIMIT 1)`)
  if (rows[0].n === 0) throw new Error('clients kosong untuk company akar sesudah seed')
})

// 1 cost_code (CECEP) — created_by admin.
/*
  Satu user yang jadi anggota DUA badan usaha — bahan uji portofolio grup.

  `ai-tool-portofolio-grup.test.ts` menolak berjalan tanpa ini, dengan pesan
  yang menyebut obatnya: "Jalankan: node scripts/seed-grup-usaha.mjs
  --execute". Skrip itu TAK PERNAH dijalankan CI, jadi test-nya selalu mati di
  `beforeAll` — dan selama ini tak terlihat karena suite API tak pernah sampai
  berjalan (ia mati lebih dulu di penyiapan basis).

  Yang disemai di sini MINIMAL: satu company kedua + keanggotaan admin di
  keduanya. `seed-grup-usaha.mjs` (289 baris) membuat jauh lebih banyak —
  induk-anak, proyek, RAB — dan memanggilnya dari sini menambah ketergantungan
  antar-skrip untuk kebutuhan yang cuma "user beranggota >1 company".

  Idempoten lewat `code` yang tetap + `ON CONFLICT DO NOTHING`.

  ⚠ `code` HURUF KECIL — CHECK `companies_code_format` menuntut
  `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`. Versi pertama memakai `CI-GRUP-2`
  dan ditolak basis.
*/
await seed('company kedua + keanggotaan ganda (bahan uji portofolio grup)', async () => {
  const adminId = (await c.query(
    `SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1`)).rows[0]?.id
  if (!adminId) throw new Error('admin CI belum ada')

  const roleId = (await c.query(
    `SELECT role_id FROM company_members WHERE user_id=$1 AND is_active LIMIT 1`,
    [adminId])).rows[0]?.role_id
  if (!roleId) throw new Error('admin CI belum punya keanggotaan pertama')

  await c.query(
    `INSERT INTO companies (code, name, legal_name, created_by, updated_by)
     SELECT 'ci-grup-2', 'CI Seed Badan Usaha 2', 'PT CI Seed Dua', $1, $1
      WHERE NOT EXISTS (SELECT 1 FROM companies WHERE code='ci-grup-2')`,
    [adminId])

  await c.query(
    `INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active, created_by)
     SELECT c2.id, $1, $2, false, true, $1
       FROM companies c2 WHERE c2.code='ci-grup-2'
     ON CONFLICT (company_id, user_id) DO NOTHING`,
    [adminId, roleId])

  const { rows: cek } = await c.query(
    `SELECT count(DISTINCT company_id)::int n FROM company_members
      WHERE user_id=$1 AND is_active`, [adminId])
  if (cek[0].n < 2) throw new Error(`admin CI masih anggota ${cek[0].n} company, butuh >=2`)
})

/*
  Role tenant + izinnya — disalin ULANG sesudah keanggotaan ada.

  Migrasi 365 menyalin role template ke tiap tenant, dengan syarat
  `JOIN company_members`. Di replay bersih syarat itu nol saat ia berjalan —
  company baru punya anggota BELAKANGAN, lewat seed di atas.

  Akibatnya admin CI tak memegang izin apa pun, dan rute yang berpagar
  `requirePermission` menolak dengan 403. Test menuntut 409 (aturan bisnis)
  tetapi tak pernah sampai ke sana:

      klaim-perjalanan "menolak WAJIB beralasan"      expected 403 to be 409
      klaim-perjalanan "menyetujui MELEBIHI ditolak"  expected 403 to be 409

  Pola yang SAMA PERSIS dengan config AI di bawah, dan dengan `jadwal_tugas`,
  `ai_provider_config`, `notification_rules` sebelumnya: seed migrasi bersyarat
  keanggotaan, sementara keanggotaan lahir belakangan.

  ⚠ Menjalankan MIGRASINYA, bukan menyalin statement-nya ke sini. Salinan akan
  menyimpang diam-diam begitu 365 disunting — dan penyimpangan seperti itu
  hanya ketahuan lewat test yang gagal berbulan-bulan kemudian.

  Kedua statement 365 idempoten (`ON CONFLICT DO NOTHING`), jadi menjalankannya
  ulang aman.
*/
await seed('role tenant + izin (salin ulang sesudah keanggotaan ada)', async () => {
  const sql = fs.readFileSync(path.join(dir, '365_salin_role_ke_tenant.sql'), 'utf8')
  await c.query(sql)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE r.company_id IS NOT NULL AND p.key = 'klaim:setujui'`)
  if (rows[0].n === 0) throw new Error('role tenant belum memegang klaim:setujui sesudah salin')
  console.log(`     ${rows[0].n} role tenant memegang klaim:setujui`)
})

/*
  Konfigurasi AI per tenant — bahan uji gerbang gratis.

  Migrasi 250 menyemai `ai_provider_config` dengan syarat
  `WHERE EXISTS (company_members)`. Di replay bersih, saat migrasi itu berjalan
  belum ada satu pun anggota — jadi NOL config. Company baru punya anggota
  BELAKANGAN, lewat seed ini, dan konfigurasinya tak pernah menyusul.

  Akibatnya di CI: `ai-chat`, `ai-ingatan`, dan `ai-isolasi-tenant` merah dengan

      expected 503 to be 402   ("AI dimatikan → 402 nonaktif")
      expected 503 to be 402   ("batas biaya terlampaui")

  Gerbang GRATIS (saklar mati per tenant, batas biaya) tak pernah tercapai
  karena kode berhenti lebih dulu di "kunci tak ada" — jadi yang diuji bukan
  gerbangnya, melainkan ketiadaan config.

  ⚠ Ini BUKAN soal kunci API. Komentar di `ai-chat.test.ts` mencatat
  kebalikannya: versi pertama test itu berasumsi lingkungan TAK punya
  `ANTHROPIC_API_KEY`, dan asumsinya salah — kuncinya ada, lalu terjadi
  panggilan berbayar sungguhan. Yang kurang di CI adalah BARIS CONFIG-nya.

  Keempat asisten disemai supaya test mana pun menemukan bahannya.
*/
/*
  Pengaturan AI per tenant — saklar `ai_aktif` dan plafon biaya.

  Disemai migrasi 252 dengan syarat `EXISTS (company_members)`, yang nol saat
  ia berjalan. Keenam kalinya bentuk yang sama muncul hari ini.

  Tanpa barisnya, `UPDATE ai_pengaturan_tenant SET ai_aktif = false` di test
  mengenai NOL baris — gerbang gratis tak menyala, dan kode jalan terus sampai
  memeriksa kunci:

      expected 503 to be 403   "AI dimatikan → 403"
      expected 503 to be 402   "asisten dinonaktifkan → 402"

  ⚠ Yang kurang BUKAN kunci API. Urutan gerbang di `ai-jalankan.ts` sudah
  benar — `ai_nonaktif` (baris 406) dan `nonaktif`/`batas_terlampaui` (417)
  dievaluasi SEBELUM `ambilKunci` (428). Gerbang gratis memang tak butuh
  kunci; ia hanya tak pernah tercapai karena barisnya tak ada.

  Diperiksa juga test `penyedia_tak_dikenal`: ia memakai penyedia salah ketik
  ('anthropc') yang ditolak sebelum kunci diperiksa. Jadi tak satu pun test
  yang gagal ini menuntut kunci sungguhan — dan `app_credentials` sengaja
  TIDAK disemai. Menyemai kunci ke CI berarti tiap run bisa memanggil API
  berbayar, persis yang komentar di `ai-chat.test.ts` peringatkan.
*/
await seed('pengaturan AI per tenant (saklar & plafon)', async () => {
  await c.query(
    `INSERT INTO ai_pengaturan_tenant (company_id, ai_aktif, retensi_hari)
     SELECT c2.id, true, 30
       FROM companies c2
      WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c2.id)
     ON CONFLICT (company_id) DO NOTHING`)

  const { rows } = await c.query(`SELECT count(*)::int n FROM ai_pengaturan_tenant`)
  if (rows[0].n === 0) throw new Error('nol pengaturan AI sesudah seed')
})

await seed('config AI per tenant (bahan uji gerbang gratis)', async () => {
  const { rowCount } = await c.query(
    `INSERT INTO ai_provider_config (company_id, asisten, penyedia, model, max_token, aktif)
     SELECT c2.id, a.asisten, 'anthropic', 'claude-haiku-4-5', 3000, true
       FROM companies c2
       CROSS JOIN (VALUES ('web'), ('owner'), ('staff'), ('insight')) AS a(asisten)
      WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c2.id)
     ON CONFLICT (company_id, asisten) DO NOTHING`)

  const { rows: cek } = await c.query(
    `SELECT count(*)::int n FROM ai_provider_config WHERE asisten = 'web'`)
  if (cek[0].n === 0) throw new Error('nol config asisten `web` sesudah seed')
  console.log(`     ${rowCount} baris config AI disemai`)
})

await seed('cost_code', async () => {
  await c.query(
    /*
      `company_id` DISEBUT EKSPLISIT — 2026-09-04.

      Komentar di seed `client` menyatakan `cost_codes` sudah diperbaiki;
      ternyata belum. Ia tak roboh seperti `projects` karena kolomnya
      menerima nilai dari default, dan itu justru cacat yang komentar itu
      sendiri peringatkan: barisnya lahir di tenant mana pun yang kebetulan
      terpilih, dan galatnya muncul jauh dari sini.
    */
    `INSERT INTO cost_codes (company_id, code, name, created_by)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            'CC-CI-SEED', 'CI seed cost code',
            (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
     WHERE NOT EXISTS (SELECT 1 FROM cost_codes WHERE code='CC-CI-SEED')
       AND EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)`)
})

// 1 asset (alat) — dibutuhkan `uji-invarian-alat.mjs`.
//
// Tanpa ini skrip invarian itu MELEWATI DIRI SENDIRI dengan pesan "butuh
// minimal 1 baris di assets — dilewati", lalu exit 0. Penjaga yang selalu
// hijau karena tak pernah punya bahan untuk diuji adalah hiasan, dan itu
// lebih buruk daripada tak ada penjaga: ia memberi rasa aman yang salah.
await seed('asset (bahan uji invarian alat)', async () => {
  await c.query(
    `INSERT INTO assets (company_id, asset_code, name, category, purchase_price,
                         residual_value, useful_life_months, created_by)
     SELECT (SELECT id FROM companies WHERE is_active ORDER BY created_at LIMIT 1),
            'CI-EXC-001', 'CI seed excavator', 'alat_berat', 1000000000, 100000000, 96,
            (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
     WHERE NOT EXISTS (SELECT 1 FROM assets WHERE asset_code='CI-EXC-001')
       AND EXISTS (SELECT 1 FROM companies WHERE is_active)`)

  // Verifikasi, bukan asumsi — seed "berhasil" tapi nol baris adalah persis
  // cara penjaga ini bisa mati diam-diam.
  const { rows } = await c.query(`SELECT count(*)::int n FROM assets`)
  if (rows[0].n === 0) throw new Error('assets tetap kosong sesudah seed')
})

// 2 milestone BELUM BERELASI — dibutuhkan `uji-invarian-jadwal.mjs`.
//
// Sama alasannya dengan seed `assets` di atas: tanpa bahan, skrip invarian itu
// melewati dirinya sendiri ("butuh minimal 2 milestone yang belum berelasi —
// dilewati") lalu exit 0. Penjaga yang selalu hijau karena tak pernah punya
// bahan uji memberi rasa aman yang salah.
//
// Keduanya di SATU proyek: pasangan lintas-proyek ditolak endpoint dengan
// alasan berbeda, dan itu akan mengaburkan invarian yang sedang diperiksa.
await seed('milestone x2 (bahan uji invarian jadwal)', async () => {
  const { rows: pr } = await c.query(
    `SELECT id FROM projects ORDER BY created_at LIMIT 1`)
  if (!pr.length) throw new Error('tak ada proyek untuk dipasangi milestone')

  /*
    Tipe parameter ditulis EKSPLISIT, dan created_by punya cadangan.

    Dua cacat diperbaiki 2026-08-31, keduanya membuat seed ini gagal DIAM:

    (a) `$2` dipakai sebagai nilai kolom `title` DAN sebagai pembanding di
        `WHERE NOT EXISTS`. Postgres menyimpulkan tipenya dari kedua
        pemakaian dan menyerah:

            inconsistent types deduced for parameter $2

    (b) `created_by` NOT NULL diisi subquery yang mencari akun CI. Subquery
        yang tak menemukan apa-apa memulangkan NULL, dan galatnya menuduh
        KOLOM alih-alih akun yang hilang.

    Seed yang gagal TIDAK menghentikan CI (per-item try/catch, sengaja),
    jadi kegagalannya lewat sebagai satu baris di antara sebelas 'seed OK'.
    Yang meledak kemudian test-test yang butuh milestone — jauh dari
    sebabnya, dan bunyinya seperti cacat kode.

    ⚠ Komentar penjelasan ini SENGAJA di luar template SQL. Percobaan
    pertama menaruhnya di dalam, dan backtick di dalamnya menutup template
    literal-nya — seluruh skrip mati SyntaxError, dan CI berhenti di
    'Prepare CI project' sebelum satu migrasi pun dijalankan.
  */
  for (const [judul, urut] of [['CI seed milestone A', 901], ['CI seed milestone B', 902]]) {
    await c.query(
      `INSERT INTO milestones (project_id, title, target_date, sort_order, created_by)
       SELECT $1::uuid, $2::text, CURRENT_DATE + ($3::int - 900) * 30, $3::int,
              COALESCE(
                (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1),
                (SELECT id FROM public.users ORDER BY created_at LIMIT 1))
       WHERE NOT EXISTS (SELECT 1 FROM milestones WHERE title = $2::text)`,
      [pr[0].id, judul, urut])
  }

  // Verifikasi, bukan asumsi — dan yang diperiksa persis syarat skripnya:
  // dua milestone SATU proyek yang belum punya dependensi.
  const { rows } = await c.query(`
    SELECT count(*)::int n FROM milestones m
     WHERE m.project_id = $1
       AND NOT EXISTS (SELECT 1 FROM milestone_dependencies d
                        WHERE d.milestone_id = m.id OR d.bergantung_pada = m.id)`,
    [pr[0].id])
  if (rows[0].n < 2) throw new Error(`hanya ${rows[0].n} milestone bebas-relasi`)
})

// 1 supplier — dibutuhkan `uji-invarian-pengadaan.mjs` (kontrak payung &
// nota kredit selalu berpemasok) dan `uji-invarian-kepatuhan.mjs`.
//
// Sama alasannya dengan seed `assets` dan `milestones` di atas: tanpa bahan,
// skrip invarian melewati dirinya sendiri lalu exit 0 — penjaga yang selalu
// hijau karena tak pernah punya bahan uji memberi rasa aman yang salah.
await seed('supplier (bahan uji invarian pengadaan)', async () => {
  await c.query(
    `INSERT INTO suppliers (company_id, code, name, contact_person, phone, created_by)
     SELECT (SELECT id FROM companies WHERE is_active ORDER BY created_at LIMIT 1),
            'SUP-CI-001', 'CI seed supplier', 'CI Contact', '0800000001',
            (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
     WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE code='SUP-CI-001')
       AND EXISTS (SELECT 1 FROM companies WHERE is_active)`)

  const { rows } = await c.query(`SELECT count(*)::int n FROM suppliers`)
  if (rows[0].n === 0) throw new Error('suppliers tetap kosong sesudah seed')
})

// 1 purchase_order — dibutuhkan uji `expediting` (satu catatan pelacakan per
// PO). Tanpa PO, seluruh blok expediting dilewati diam-diam.
await seed('purchase_order (bahan uji expediting)', async () => {
  const { rows: pr } = await c.query(`SELECT id FROM projects ORDER BY created_at LIMIT 1`)
  const { rows: sp } = await c.query(`SELECT id FROM suppliers ORDER BY created_at LIMIT 1`)
  if (!pr.length || !sp.length) throw new Error('butuh 1 proyek & 1 supplier lebih dulu')

  // `po_number` diisi trigger `generate_po_number` (BEFORE INSERT), jadi
  // dikirim kosong — sama seperti jalur produksi di `procurement.ts`.
  await c.query(
    `INSERT INTO purchase_orders (po_number, project_id, supplier_id, status,
                                  order_date, expected_delivery_date, total_amount, created_by)
     SELECT '', $1, $2, 'sent', CURRENT_DATE - 30, CURRENT_DATE - 10, 5000000,
            (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
     WHERE NOT EXISTS (SELECT 1 FROM purchase_orders WHERE project_id = $1)`,
    [pr[0].id, sp[0].id])

  const { rows } = await c.query(`SELECT count(*)::int n FROM purchase_orders`)
  if (rows[0].n === 0) throw new Error('purchase_orders tetap kosong sesudah seed')
})

// FIXTURE DEMO — dibutuhkan photo-attach-ownership.test.ts (progress_log milik mandor X +
// mandor Y yang JUGA ditugaskan di proyek yang sama) & recipient-resolution.test.ts
// (1 proyek ber-PM). Idempoten. Ini mengganti data demo yang di-skip (024) dgn yang minimal-lengkap.
await seed('fixture project+mandor2+assignments+log', async () => {
  const uid = async (email) => (await c.query(`SELECT id FROM public.users WHERE email=$1 LIMIT 1`, [email])).rows[0]?.id
  const adminId = await uid('ci-admin@puraloka.test')
  const pmId = await uid('ci-pm@puraloka.test')
  const mandor1Id = await uid('ci-mandor@puraloka.test')
  const { rows: cl } = await c.query(`SELECT id FROM clients WHERE contact_person='CI Seed Client' LIMIT 1`)
  const clientId = cl[0]?.id
  if (!adminId || !pmId || !mandor1Id || !clientId) throw new Error('prasyarat user/client belum lengkap')

  // mandor kedua (Y) — dibuat kalau belum ada
  let m2 = await uid('ci-mandor2@puraloka.test')
  if (!m2) {
    const { rows: mr } = await c.query(`SELECT id FROM roles WHERE name='mandor'`)
    const { rows: au } = await c.query(`INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id`)
    const { rows: nu } = await c.query(
      `INSERT INTO public.users (name,email,role_id,auth_id,is_active)
       VALUES ('CI Mandor 2','ci-mandor2@puraloka.test',$1,$2,true) RETURNING id`, [mr[0].id, au[0].id])
    m2 = nu[0].id
  }
  // project (idempoten by name)
  let projId = (await c.query(`SELECT id FROM projects WHERE name='CI Seed Project' LIMIT 1`)).rows[0]?.id
  if (!projId) {
    /*
      `company_id` DISEBUT EKSPLISIT — ditambahkan 2026-09-04, dan ini yang
      KETIGA sesudah `clients` dan `cost_codes` (lihat komentar di seed
      `client`, yang menyebut "dua yang tertinggal" — ternyata tiga).

      Dulu tak terlihat karena `projects.company_id` mengandalkan DEFAULT,
      dan defaultnya menjawab selama ada company yang bisa dipilih. Begitu
      rantai migrasi akhirnya diputar penuh dari nol, seed ini roboh:

          null value in column "company_id" of relation "projects"
          violates not-null constraint

      Dan robohnya beruntun — milestone, purchase_order, rab_items, kasbon,
      weekly_wage_reports, proyek kedua, semuanya butuh proyek ini lebih
      dulu. Satu kolom yang tak disebut menjatuhkan tujuh seed sesudahnya.

      Tenant diambil dengan cara yang SAMA seperti seed lain di berkas ini:
      company induk pertama. Menyalin dari sumber berbeda membuat fixture
      lintas-tenant yang galatnya muncul jauh dari sebabnya.
    */
    const { rows: pr } = await c.query(
      `INSERT INTO projects (company_id, client_id, pm_id, name, location,
                             start_date, end_date, created_by)
       SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL
                ORDER BY created_at LIMIT 1),
              $1,$2,'CI Seed Project','Bandung',CURRENT_DATE,CURRENT_DATE+30,$3
        WHERE EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)
       RETURNING id`,
      [clientId, pmId, adminId])
    if (!pr.length) throw new Error('tak ada company induk untuk memasangi proyek fixture')
    projId = pr[0].id
  }
  // mandor_assignments: X & Y di proyek yang sama (status default 'active' ≠ terminated)
  for (const mid of [mandor1Id, m2]) {
    const { rows: has } = await c.query(`SELECT 1 FROM mandor_assignments WHERE project_id=$1 AND mandor_id=$2 LIMIT 1`, [projId, mid])
    if (!has.length) await c.query(`INSERT INTO mandor_assignments (project_id, mandor_id, assigned_by) VALUES ($1,$2,$3)`, [projId, mid, adminId])
  }
  // progress_log milik mandor X (owner) di proyek itu
  const { rows: hasLog } = await c.query(`SELECT 1 FROM progress_logs WHERE project_id=$1 AND reported_by=$2 LIMIT 1`, [projId, mandor1Id])
  if (!hasLog.length) await c.query(`INSERT INTO progress_logs (project_id, reported_by, pct_overall) VALUES ($1,$2,10)`, [projId, mandor1Id])
})

console.log(`\nSEED: ${seedErrors.length ? 'ADA ISU (' + seedErrors.length + ') — lihat di atas' : 'BERSIH'}`)

// ── RESTORE GRANTS untuk PostgREST ─────────────────────────────────────────
// DROP SCHEMA public CASCADE (WIPE) menghapus grant default Supabase → objek yang
// dibuat migrasi TAK punya privilege utk service_role/anon/authenticated → PostgREST
// (dipakai handler) ditolak → 403 walau data benar (direct-pg jalan). Grant ulang.
try {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`)
    await c.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role}`)
    await c.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${role}`)
    await c.query(`GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${role}`)
    await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`)
    await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${role}`)
  }
  console.log('[grants] restore GRANT public → anon/authenticated/service_role OK')
} catch (e) { console.warn('[grants] gagal:', e.message.split('\n')[0]) }

// ── pegawai (bahan uji klaim perjalanan, sertifikat K3, timesheet) ─────────
//
// Sembilan test merah 2026-08-31 berbunyi "tak ada pegawai untuk diuji" —
// klaim-perjalanan (6), sertifikat-K3, dan turunannya. Tabel `pegawai`
// menyambungkan `users` ke modul SDM, dan tak ada satu pun seed yang
// membuatnya.
//
// DUA pegawai, bukan satu: `klaim-perjalanan.test.ts` menguji pemisahan tugas
// — pengaju tak boleh menyetujui klaimnya sendiri — dan itu butuh dua orang
// yang berbeda. Satu pegawai membuat test-nya lewat tanpa menguji apa pun.
await seed('pegawai x2 (bahan uji klaim & SDM)', async () => {
  const co = (await c.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)).rows[0]
  if (!co) throw new Error('tak ada company untuk dipasangi pegawai')

  for (const [email, jabatan] of [
    ['ci-admin@puraloka.test', 'CI seed pegawai A'],
    ['ci-pm@puraloka.test', 'CI seed pegawai B'],
  ]) {
    await c.query(
      `INSERT INTO pegawai (company_id, user_id, jabatan)
       SELECT $1::uuid, u.id, $2::text FROM public.users u
        WHERE u.email = $3::text
          AND NOT EXISTS (SELECT 1 FROM pegawai p WHERE p.user_id = u.id)`,
      [co.id, jabatan, email])
  }

  const { rows } = await c.query(`SELECT count(*)::int n FROM pegawai`)
  if (rows[0].n < 2) throw new Error(`hanya ${rows[0].n} pegawai — pemisahan tugas tak bisa diuji`)
})

// ── rab_items level `category` (bahan uji portofolio biaya) ────────────────
//
// `cost-control-portofolio.test.ts` menolak berjalan tanpa ini, dan
// penolakannya benar: "basis tak punya satu pun rab_items level category —
// test ini tak menguji apa pun". Test yang lewat tanpa bahan memberi rasa
// aman yang salah.
await seed('rab_items kategori (bahan uji portofolio biaya)', async () => {
  const pr = (await c.query(`SELECT id FROM projects ORDER BY created_at LIMIT 1`)).rows[0]
  if (!pr) throw new Error('tak ada proyek untuk dipasangi RAB')

  await c.query(
    `INSERT INTO rab_items (project_id, name, level)
     SELECT $1::uuid, $2::text, 'category'
      WHERE NOT EXISTS (SELECT 1 FROM rab_items WHERE name = $2::text)`,
    [pr.id, 'CI seed kategori RAB'])

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM rab_items WHERE level = 'category'`)
  if (rows[0].n < 1) throw new Error('nol rab_items level category')

  /*
    ANAK berbobot & berjadwal — menutup TIGA kegagalan sekaligus.

    Kategori tanpa anak membuat tiga test menolak berjalan:

        Error: Butuh satu kategori RAB beranak untuk test ini
        Error: tak ada proyek dengan rab_items ber-planned_start
        AssertionError: nol proyek ber-EVM (aktif 4, tak terhitung 4)

    Yang ketiga paling halus: EVM menandai proyek "tak terhitung" bila SPI dan
    CPI keduanya nol (`otomasi-terjadwal.ts:1495`), dan itu terjadi persis
    ketika RAB-nya tak punya `qty`/`unit_price`/`planned_start`. Seed lama
    hanya mengisi `name` dan `level`.

    `progress_pct` 50 dipilih supaya SPI dan CPI keduanya BUKAN nol —
    perbandingan EVM baru menguji sesuatu bila ada nilai untuk dibandingkan.
  */
  await c.query(
    `INSERT INTO rab_items (project_id, parent_id, name, level, qty, unit_price,
                            planned_start, planned_end, progress_pct)
     SELECT $1::uuid, k.id, 'CI seed item RAB', 'item',
            10, 150000, CURRENT_DATE - 30, CURRENT_DATE + 30, 50
       FROM rab_items k
      WHERE k.name = $2::text AND k.level = 'category'
        AND NOT EXISTS (SELECT 1 FROM rab_items WHERE name = 'CI seed item RAB')`,
    [pr.id, 'CI seed kategori RAB'])

  const { rows: anak } = await c.query(
    `SELECT count(*)::int n FROM rab_items WHERE parent_id IS NOT NULL`)
  if (anak[0].n < 1) throw new Error('nol rab_items beranak sesudah seed')
})

/*
  ── BAHAN UJI YANG SELAMA INI HILANG ──────────────────────────────────────
  Ditambahkan 2026-08-31, sesudah CI melaporkan 20 kegagalan berbentuk sama:

      tenant uji tak punya kasbon approved — test ini tak menguji apa pun
      basis tak punya rekening kas aktif
      basis tak punya tukang aktif — test tak menguji apa pun
      basis tak punya kasbon belum lunas — test ini tak menguji apa pun

  Kalimat-kalimat itu ditulis oleh test-nya sendiri, dan bunyinya tepat: yang
  gagal BUKAN kodenya melainkan ketiadaan bahan. Semua test ini HIJAU di dev,
  karena dev punya data yang lahir dari pemakaian. CI membangun dari nol.

  Itu perbedaan yang berbahaya: test yang lewat karena "tak ada bahan" akan
  hijau selamanya di lingkungan baru sambil tak menguji apa pun — kelas cacat
  yang sama dengan penjaga yang melewati dirinya sendiri (lihat seed `assets`).

  Bentuk kolom & enum di bawah DIUKUR dari basis, bukan ditebak:

      kasbon_fund_source  owner_advance | client_fund
      kasbon_status       pending | approved | rejected | settled
      cash_account_type   main | collector | petty_cash
*/
await seed('cash_account (bahan uji kas & alokasi dana)', async () => {
  await c.query(
    `INSERT INTO cash_accounts (company_id, name, type, is_active, created_by)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            'CI Seed Kas Utama', 'main', true,
            COALESCE((SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1),
                     (SELECT id FROM public.users ORDER BY created_at LIMIT 1))
      WHERE NOT EXISTS (SELECT 1 FROM cash_accounts WHERE name='CI Seed Kas Utama')
        AND EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM cash_accounts WHERE is_active`)
  if (rows[0].n === 0) throw new Error('nol rekening kas aktif sesudah seed')
})

/*
  `mandor_id` lewat COALESCE, BUKAN lewat JOIN — diperbaiki setelah diuji.

  Versi pertama mengambil mandor dengan `FROM (SELECT ... LIKE 'ci-mandor%') m`
  lalu CROSS JOIN. Diuji terhadap basis: **0 baris tersisip**, senyap, exit 0 —
  karena baris kiri kosong membuat CROSS JOIN kosong.

  Di CI user itu ADA, jadi cacat ini tak akan pernah merah di sana. Tapi seed
  yang bisa menghasilkan nol baris tanpa mengeluh adalah persis kelas cacat
  yang seluruh blok ini dibuat untuk menutup.
*/
await seed('worker x2 (bahan uji tukang & beban mandor)', async () => {
  await c.query(
    `INSERT INTO workers (company_id, mandor_id, name, phone, is_active, skills)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            COALESCE(
              (SELECT id FROM public.users WHERE email LIKE 'ci-mandor%' ORDER BY created_at LIMIT 1),
              (SELECT id FROM public.users ORDER BY created_at LIMIT 1)),
            v.nama, v.telp, v.aktif, v.keahlian
       FROM (VALUES
              -- AKTIF + BERKEAHLIAN: bahan skillTerbanyak; tanpa ini
              -- pencocokan keahlian tak punya apa pun untuk dicocokkan.
              ('CI Seed Tukang A', '0811000001', true,  ARRAY['tukang batu','tukang besi']),
              ('CI Seed Tukang B', '0811000002', true,  ARRAY['tukang batu']),
              -- AKTIF TANPA keahlian. Array KOSONG, bukan NULL: kolom skills
              -- NOT NULL (diukur — SQL-nya meledak saat diuji). Test memakai
              -- array_length(skills,1) IS NULL, dan itu benar untuk array kosong.
              ('CI Seed Tukang C', '0811000003', true,  ARRAY[]::text[]),
              -- NONAKTIF tapi berkeahlian: cabang "cocok tapi tak aktif"
              -- (baris 89 test) — tanpa ini cabang itu tak teruji.
              ('CI Seed Tukang D', '0811000004', false, ARRAY['tukang kayu'])
            ) AS v(nama, telp, aktif, keahlian)
      WHERE NOT EXISTS (SELECT 1 FROM workers w WHERE w.name = v.nama)
        AND EXISTS (SELECT 1 FROM public.users)`)

  /*
    Diperiksa TIGA golongan, bukan sekadar "ada tukang aktif".

    `ai-tool-tukang-cocok.test.ts` menuntut ketiganya sekaligus, dan seed
    yang memenuhi satu sambil mengosongkan yang lain MEMINDAHKAN kegagalan
    alih-alih menghilangkannya:

        aktif + berkeahlian    bahan pencocokan keahlian
        aktif tanpa keahlian   kalimat "N tukang aktif BELUM punya keahlian"
        nonaktif berkeahlian   cabang "cocok tapi tak aktif"
  */
  const { rows } = await c.query(
    `SELECT count(*) FILTER (WHERE is_active AND skills IS NOT NULL
                               AND array_length(skills,1) > 0)::int AS mahir,
            count(*) FILTER (WHERE is_active AND (skills IS NULL
                               OR array_length(skills,1) IS NULL))::int AS polos,
            count(*) FILTER (WHERE is_active = false AND skills IS NOT NULL
                               AND array_length(skills,1) > 0)::int AS rehat
       FROM workers`)
  const { mahir, polos, rehat } = rows[0]
  if (mahir === 0) throw new Error('nol tukang aktif BERKEAHLIAN')
  if (polos === 0) throw new Error('nol tukang aktif TANPA keahlian — cabang tak teruji')
  if (rehat === 0) throw new Error('nol tukang NONAKTIF berkeahlian — cabang tak teruji')
})

/*
  Rantai persetujuan SUBMITTAL untuk tiap company aktif.

      AssertionError: ada company tanpa rantai submittal —
                      pengajuannya tak bisa diputuskan

  Diukur di dev: 22 dari 25 company aktif tak punya rantai. Hampir semuanya
  company UJI sisa test lama (`[UJI-GERBANG]`, `PT Cek RPC`), tetapi test
  menuntut SEMUA yang aktif — dan alasannya sah: company aktif tanpa rantai
  berarti pengajuannya tak bisa diputuskan siapa pun.

  ⚠ DUA syarat, bukan satu. Test kedua menuntut rantai BERLANGKAH:
  `steps.length === 0` berarti nol orang bisa approve (ADR-007, fail-closed),
  dan gejalanya "403 Akses ditolak" untuk semua. Menyemai rantai KOSONG akan
  menukar satu merah dengan merah lain.

  ⚠ Di SEED CI, bukan migrasi. Komentar di `submittal-aturan.test.ts`
  mencatat: perbaikan lewat migrasi (2026-08-07) membuat test itu hijau dan
  MERUSAK dua test lain yang menghitung level lintas company dengan asumsi
  hanya ada satu rantai. Seed CI tak menyentuh produksi.

  Bentuk rantai & langkahnya ditiru dari baris yang SUDAH ADA di basis
  (`entity_type='submittal'`, `level=1`, `required_permission='submittal:decide'`),
  bukan dikarang.
*/
await seed('rantai submittal per company aktif', async () => {
  await c.query(
    `INSERT INTO approval_chains (company_id, entity_type, label, is_active)
     SELECT c2.id, 'submittal', 'Persetujuan Submittal', true
       FROM companies c2
      WHERE c2.is_active
        AND NOT EXISTS (
          SELECT 1 FROM approval_chains a
           WHERE a.company_id = c2.id AND a.entity_type = 'submittal')`)

  // Langkah: rantai tanpa langkah = fail-closed, nol orang bisa approve.
  await c.query(
    `INSERT INTO approval_steps (chain_id, company_id, level, required_permission, label)
     SELECT a.id, a.company_id, 1, 'submittal:decide', 'Keputusan konsultan/pemberi kerja'
       FROM approval_chains a
      WHERE a.entity_type = 'submittal'
        AND NOT EXISTS (SELECT 1 FROM approval_steps s WHERE s.chain_id = a.id)`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM companies c
      WHERE c.is_active
        AND NOT EXISTS (
          SELECT 1 FROM approval_chains a
            JOIN approval_steps s ON s.chain_id = a.id
           WHERE a.company_id = c.id AND a.entity_type = 'submittal')`)
  if (rows[0].n > 0) throw new Error(`masih ${rows[0].n} company aktif tanpa rantai submittal berlangkah`)
})

/*
  Temuan K3 BERAT yang MENGGANTUNG — bahan uji otomasi sertifikat/K3.

      AssertionError: temuan berat menggantung tak terbentuk

  Test menuntut otomasi menghasilkan notifikasi `k3_temuan_berat_menggantung`,
  dan itu hanya terjadi bila ada temuan yang memenuhi TIGA syarat sekaligus.
  Ketiganya dibaca dari kodenya, bukan ditebak:

      tingkat >= 3            `rekapTemuan` (k3-lapangan.ts:435) → berat
      status <> 'ditutup'     idem, baris 433
      tenggat sudah lewat     `rekap.lewat_tenggat > 0`
                              (otomasi-terjadwal.ts:2184)

  Fixture ini BERLAPIS: `temuan_k3` butuh `inspeksi_id`, jadi inspeksi dibuat
  lebih dulu. Menyisipkan temuan tanpa inspeksinya akan gagal FK dengan galat
  yang menuduh kolom, bukan urutan.

  `status` diisi 'terbuka' — salah satu dari tiga nilai yang benar-benar
  dipakai di basis (diukur `SELECT DISTINCT`: terbuka, diperbaiki, ditutup).
*/
await seed('temuan K3 berat menggantung (bahan uji otomasi K3)', async () => {
  await c.query(
    `INSERT INTO inspeksi_k3 (project_id, tanggal)
     SELECT p.id, CURRENT_DATE - 30
       FROM projects p
      WHERE p.name = 'CI Seed Project'
        AND NOT EXISTS (
          SELECT 1 FROM inspeksi_k3 i
           WHERE i.project_id = p.id AND i.tanggal = CURRENT_DATE - 30)`)

  await c.query(
    `INSERT INTO temuan_k3 (inspeksi_id, uraian, tingkat, status, tenggat)
     SELECT i.id, 'CI Seed temuan berat menggantung', 3, 'terbuka', CURRENT_DATE - 14
       FROM inspeksi_k3 i
       JOIN projects p ON p.id = i.project_id
      WHERE p.name = 'CI Seed Project'
        AND NOT EXISTS (
          SELECT 1 FROM temuan_k3 t
           WHERE t.uraian = 'CI Seed temuan berat menggantung')`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM temuan_k3
      WHERE tingkat >= 3 AND status <> 'ditutup' AND tenggat < CURRENT_DATE`)
  if (rows[0].n === 0) throw new Error('nol temuan berat menggantung sesudah seed')
})

/*
  Invoice bernilai > 2 juta — bahan uji tulis-pembayaran.

      Error: prasyarat gagal: nol invoice yang bisa dipinjam
             (butuh total > 2 juta …)

  Tak satu pun seed membuat invoice (diukur: 0 kemunculan `INTO invoices`).

  `invoice_type` diisi `commission_billing` — salah satu dari dua nilai yang
  BENAR-BENAR dipakai di basis (diukur `SELECT DISTINCT`). Enum-nya punya lima
  label; memilih yang tak pernah dipakai berarti menguji jalur yang tak ada
  di kenyataan.

  ⚠ `termin_billing` (nilai satunya) DITOLAK: CHECK
  `chk_invoice_termin_billing` menuntut `termin_schedule_id` terisi. Dibaca
  dari `pg_constraint` sesudah percobaan pertama ditolak — dan hanya tipe ITU
  yang punya syarat tambahan, jadi `commission_billing` bebas.

  Nilai 5 juta, di atas ambang 2 juta yang dituntut test, dan `amount_due`
  dibiarkan penuh — pembayaran belum terjadi, yang justru keadaan yang diuji.
*/
await seed('invoice > 2 juta (bahan uji tulis-pembayaran)', async () => {
  await c.query(
    `INSERT INTO invoices (project_id, invoice_number, invoice_type,
                           base_amount, total_amount, amount_due, due_date, created_by)
     SELECT p.id, 'CI-INV-1', 'commission_billing',
            5000000, 5000000, 5000000, CURRENT_DATE + 30,
            (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
       FROM projects p
      WHERE p.name = 'CI Seed Project'
        AND NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number = 'CI-INV-1')`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM invoices WHERE total_amount > 2000000`)
  if (rows[0].n === 0) throw new Error('nol invoice > 2 juta sesudah seed')
})

/*
  Gudang — bahan uji otomasi K3/stok/mutu.

      Error: tak ada gudang untuk diuji

  ⚠ Tabelnya bernama `gudang`, BUKAN `warehouses`. Dugaan nama Inggris salah
  dan `information_schema` memulangkan kosong — yang terbaca seperti "kolomnya
  tak ada" alih-alih "tabelnya bernama lain". Dicari lewat
  `table_name LIKE '%gudang%'`.
*/
await seed('gudang (bahan uji otomasi stok)', async () => {
  await c.query(
    `INSERT INTO gudang (company_id, kode, nama)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            'CI-GDG-1', 'CI Seed Gudang'
      WHERE NOT EXISTS (SELECT 1 FROM gudang WHERE kode = 'CI-GDG-1')
        AND EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)`)

  const { rows } = await c.query(`SELECT count(*)::int n FROM gudang`)
  if (rows[0].n === 0) throw new Error('nol gudang sesudah seed')
})

/*
  Punch item TERBUKA — bahan uji serah terima.

      Error: tak ada proyek ber-punch-item terbuka untuk diuji

  Status dibiarkan DEFAULT (terbuka). Dua CHECK di tabel ini menuntut kolom
  tambahan untuk status `ditolak` (alasan_penolakan) dan `ditutup`
  (diverifikasi_oleh + ditutup_pada) — dibaca dari `pg_constraint`, dan
  keduanya memang bukan yang dibutuhkan test ini.
*/
await seed('punch item terbuka (bahan uji serah terima)', async () => {
  await c.query(
    `INSERT INTO punch_items (project_id, nomor, judul, ditemukan_oleh)
     SELECT p.id, 'CI-PUNCH-1', 'CI Seed Punch Terbuka',
            (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
       FROM projects p
      WHERE p.name = 'CI Seed Project'
        AND NOT EXISTS (SELECT 1 FROM punch_items WHERE nomor = 'CI-PUNCH-1')`)

  const { rows } = await c.query(`SELECT count(*)::int n FROM punch_items`)
  if (rows[0].n === 0) throw new Error('nol punch item sesudah seed')
})

/*
  Material request berstatus `submitted` — bahan uji expediting.

      Error: tak ada MR berstatus submitted untuk diuji

  Seed `purchase_order` yang ada melapor GAGAL di replay bersih ("butuh 1
  proyek & 1 supplier lebih dulu") — keduanya kini ada, jadi MR ini bisa
  berdiri di atasnya.
*/
await seed('material request submitted (bahan uji expediting)', async () => {
  await c.query(
    `INSERT INTO material_requests (mr_number, project_id, requested_by, status)
     SELECT 'CI-MR-1', p.id,
            (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1),
            'submitted'
       FROM projects p
      WHERE p.name = 'CI Seed Project'
        AND NOT EXISTS (SELECT 1 FROM material_requests WHERE mr_number = 'CI-MR-1')`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM material_requests WHERE status = 'submitted'`)
  if (rows[0].n === 0) throw new Error('nol MR submitted sesudah seed')
})

/*
  Resource — bahan uji jembatan RAB↔material dan take-off.

  Beberapa test menolak berjalan tanpa satu baris:

      Error: tak ada resource — fixture tak terbentuk
      Error: basis tanpa resources — fixture tak bisa dibuat

  Tabelnya KOSONG bahkan di basis dev (diukur: 0 baris), jadi tak ada contoh
  untuk ditiru. Nilai `category` dibaca dari CHECK-nya sendiri —
  `labor|equipment|material|subcontract` — bukan ditebak dari nama kolom.
*/
await seed('resource (bahan uji jembatan RAB↔material)', async () => {
  await c.query(
    `INSERT INTO resources (code, name, category, unit_code)
     SELECT v.kode, v.nama, v.kategori, v.satuan
       FROM (VALUES
         ('CI-RES-MAT', 'CI Seed Semen',    'material',    'sak'),
         ('CI-RES-LAB', 'CI Seed Tukang',   'labor',       'OH'),
         ('CI-RES-MA2', 'CI Seed Pasir',    'material',    'm3'),
         ('CI-RES-MA3', 'CI Seed Besi',     'material',    'kg'),
         ('CI-RES-LA2', 'CI Seed Mandor',   'labor',       'OH'),
         ('CI-RES-EQ1', 'CI Seed Molen',    'equipment',   'hari'),
         ('CI-RES-EQ2', 'CI Seed Vibrator', 'equipment',   'hari'),
         ('CI-RES-SUB', 'CI Seed Subkon',   'subcontract', 'ls')
       ) AS v(kode, nama, kategori, satuan)
      WHERE NOT EXISTS (SELECT 1 FROM resources r WHERE r.code = v.kode)`)

  /*
    Yang diperiksa BUKAN 'ada resource', melainkan 'cukup resource yang BISA
    DIPINJAM' — dua hal yang mudah tertukar dan hanya yang kedua bermakna.

    `price-book-triase.test.ts` meminjam EMPAT kali dalam satu jalan
    (resSama, resBeda, resBaru, resJauh), tiap kali menolak resource yang
    sudah punya harga `active` atau `draft`. Seed dua baris membuat dua
    pinjaman pertama berhasil dan yang ketiga melempar 'fixture tak
    terbentuk' — pesan yang menuduh test, padahal seed-nya yang kurang.

    Harga `expired` sengaja TIDAK didiskualifikasi: itulah sisa yang
    ditinggalkan `bersihkan()`, dan trigger 104 melarang menghapusnya.
    Resource ber-`expired` adalah papan tulis bersih, bukan yang terpakai.
  */
  const { rows } = await c.query(`
    SELECT count(*)::int n FROM resources r
     WHERE r.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM price_book_entries p
                        WHERE p.resource_id = r.id
                          AND p.status IN ('active', 'draft'))`)
  if (rows[0].n < 4) {
    throw new Error(
      `hanya ${rows[0].n} resource bisa dipinjam sesudah seed — ` +
      `price-book-triase butuh 4 dalam satu jalan`)
  }
})

/*
  Pemasok KEDUA — beberapa test menuntut dua untuk membandingkan.

      Error: butuh dua pemasok untuk menguji

  Seed `supplier` yang ada hanya membuat satu. Yang kedua cukup beda `name`;
  `company_id` disebut eksplisit mengikuti pola seed lain di berkas ini —
  pelajaran `clients`/`projects`/`cost_codes` yang defaultnya memilih tenant
  mana pun yang kebetulan ada.
*/
await seed('pemasok kedua (bahan uji perbandingan)', async () => {
  await c.query(
    `INSERT INTO suppliers (company_id, name, created_by)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            'CI Seed Pemasok B',
            (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'CI Seed Pemasok B')
        AND EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM suppliers WHERE company_id IS NOT NULL`)
  if (rows[0].n < 2) throw new Error(`butuh >=2 pemasok, ada ${rows[0].n}`)
})

/*
  Material — bahan uji pencocokan GR (goods receipt).

  `otomasi-gr-matching` menolak berjalan tanpa satu material milik tenant uji:

      Error: company akun uji tak punya material

  Tak satu pun seed membuatnya (diukur: 0 kemunculan `INTO materials` di
  berkas ini). Kolom wajib lain (`min_stock`, `konversi_ke_resource`,
  `is_active`) punya DEFAULT — diperiksa lewat `column_default`, jadi cukup
  `company_id`, `name`, `unit`.

  Satuan `m³` mengikuti material nyata di basis, bukan ditebak: penjaga
  `audit-harga-satuan-waras` memeriksa kewajaran harga TERHADAP SATUANNYA,
  dan satuan karangan bisa membangunkannya tanpa sebab.
*/
await seed('material (bahan uji pencocokan GR)', async () => {
  await c.query(
    `INSERT INTO materials (company_id, name, unit)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            'CI Seed Pasir Cor', 'm³'
      WHERE NOT EXISTS (SELECT 1 FROM materials WHERE name = 'CI Seed Pasir Cor')
        AND EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM materials WHERE company_id IS NOT NULL`)
  if (rows[0].n === 0) throw new Error('nol material ber-company_id sesudah seed')
})

/*
  Kategori biaya proyek — bahan uji otomasi biaya.

  `otomasi-biaya-pola` dan `otomasi-biaya-pencilan` mati di `beforeAll`:

      TypeError: Cannot read properties of undefined (reading 'id')
      di `SELECT id FROM project_expense_categories LIMIT 1` -> rows[0].id

  Bentuk klasik `rows[0]` atas query nol baris. Tak satu pun seed membuat
  kategori ini (diukur: 0 kemunculan di berkas ini), dan tabelnya butuh
  `project_id` — jadi ia bergantung pada proyek fixture di atas.

  Galat `undefined (reading 'id')` tak menyebut tabel maupun query-nya. Yang
  membacanya harus menelusuri nomor baris test lebih dulu untuk tahu apa yang
  kurang — dan itu di berkas yang berbeda dari tempat kekurangannya.

  `type` diisi 'material' dan 'labor', dua nilai yang benar-benar dipakai di
  basis (diukur lewat SELECT DISTINCT, bukan ditebak dari nama kolom).

  ⚠ Cast `::expense_category_type` WAJIB. Kolomnya enum, dan `VALUES` memberi
  `text` — Postgres menolak dengan "column is of type expense_category_type
  but expression is of type text". Ketahuan karena diuji, bukan diasumsikan.
*/
await seed('kategori biaya proyek (bahan uji otomasi biaya)', async () => {
  await c.query(
    `INSERT INTO project_expense_categories (project_id, name, type, sort_order, is_active)
     SELECT p.id, v.nama, v.jenis::expense_category_type, v.urut, true
       FROM projects p
       CROSS JOIN (VALUES
         ('CI Seed Material', 'material', 1),
         ('CI Seed Upah',     'labor',    2)
       ) AS v(nama, jenis, urut)
      WHERE p.name = 'CI Seed Project'
        AND NOT EXISTS (
          SELECT 1 FROM project_expense_categories x
           WHERE x.project_id = p.id AND x.name = v.nama)`)

  const { rows } = await c.query(`SELECT count(*)::int n FROM project_expense_categories`)
  if (rows[0].n === 0) throw new Error('nol kategori biaya sesudah seed — proyek fixture ada?')
})

/*
  Mitra + satu tukang yang TERTAUT padanya.

  `mitra.test.ts` menolak berjalan tanpa itu, dengan pesan yang menuduh
  migrasi:

      nol tukang tertaut mitra — migrasi 461 belum jalan?

  Migrasi 461 SUDAH jalan (replay bersih lolos seluruh rantai). Yang tak ada
  adalah DATANYA — tak satu pun seed membuat `mitra`, dan seed `workers` di
  bawah tak pernah mengisi `mitra_id`.

  Pesan yang menuduh migrasi untuk keadaan yang sebenarnya kekurangan data
  mengirim pembacanya ke arah yang salah — dan saya sempat memeriksa migrasi
  461 lebih dulu karenanya.

  `bentuk = 'orang'` dipilih karena CHECK-nya paling sederhana: `badan_usaha`
  menuntut `bentuk_badan` terisi, sementara `orang` menuntut kolom itu NULL.
*/
await seed('mitra + tukang tertaut (bahan uji mitra)', async () => {
  await c.query(
    `INSERT INTO mitra (company_id, bentuk, nama, daftar_hitam, aktif)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            'orang', 'CI Seed Mitra', false, true
      WHERE NOT EXISTS (SELECT 1 FROM mitra WHERE nama = 'CI Seed Mitra')
        AND EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)`)

  // Tautkan SATU tukang yang sudah ada. Kalau seed worker di bawah belum
  // jalan, ini tak menautkan apa pun — dan pemeriksaannya menangkap itu.
  await c.query(
    `UPDATE workers SET mitra_id = (SELECT id FROM mitra WHERE nama = 'CI Seed Mitra' LIMIT 1)
      WHERE name = 'CI Seed Tukang A' AND mitra_id IS NULL`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM workers WHERE mitra_id IS NOT NULL`)
  if (rows[0].n === 0) throw new Error('nol tukang tertaut mitra sesudah seed')
})

/*
  Kasbon DUA STATUS, sengaja.

  Satu test menuntut "kasbon approved" dan test LAIN menuntut "tak semua
  kasbon approved — saringan status tak teruji". Menyeed satu status saja
  memperbaiki yang satu dan merahkan yang lain; keduanya benar, dan yang
  dibutuhkan memang dua-duanya.
*/
await seed('kasbon x2 (approved + pending, bahan uji saringan status)', async () => {
  await c.query(
    `INSERT INTO kasbons (company_id, project_id, amount, fund_source, purpose,
                          status, requested_by)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            (SELECT id FROM projects ORDER BY created_at LIMIT 1),
            v.jml, 'owner_advance', v.tujuan, v.st::kasbon_status,
            COALESCE((SELECT id FROM public.users WHERE email LIKE 'ci-mandor%' ORDER BY created_at LIMIT 1),
                     (SELECT id FROM public.users ORDER BY created_at LIMIT 1))
       FROM (VALUES (2500000, 'CI Seed kasbon disetujui', 'approved'),
                    (1500000, 'CI Seed kasbon menunggu',  'pending')) AS v(jml, tujuan, st)
      WHERE NOT EXISTS (SELECT 1 FROM kasbons k WHERE k.purpose = v.tujuan)
        AND EXISTS (SELECT 1 FROM projects)`)

  // Kedua cabang harus benar-benar ada — bukan cuma "seed jalan".
  const { rows } = await c.query(
    `SELECT count(*) FILTER (WHERE status='approved')::int a,
            count(*) FILTER (WHERE status <> 'approved')::int b
       FROM kasbons`)
  if (rows[0].a === 0) throw new Error('nol kasbon approved sesudah seed')
  if (rows[0].b === 0) throw new Error('SEMUA kasbon approved — saringan status tak akan teruji')
})

/*
  Laporan upah mingguan — rantai FK TIGA lapis, diukur dari basis:

      mandor_assignments  →  work_scopes  →  weekly_wage_reports
      (sudah di-seed)        (perlu)         (yang dibutuhkan test)

  Test `otomasi-rab-upah-klien` mencari laporan berstatus `submitted` untuk
  membandingkan upah terhadap median historis. Tanpa satu pun baris, ia
  menyatakan dirinya tak menguji apa pun:

      tak ada laporan `submitted` sama sekali — test ini tak menguji apa pun

  TIGA laporan, bukan satu: pembandingnya memakai `percentile_cont(0.5)` atas
  riwayat, dan median dari satu titik tak membedakan apa pun. Nominalnya
  sengaja berjauhan supaya median dan pencilan benar-benar berbeda.
*/
await seed('work_scope + weekly_wage_reports x3 (bahan uji upah menyimpang)', async () => {
  await c.query(
    `INSERT INTO work_scopes (assignment_id, scope_name, payment_system, status)
     SELECT ma.id, 'CI Seed Lingkup Upah', 'harian', 'active'
       FROM mandor_assignments ma
      ORDER BY ma.created_at LIMIT 1`)

  await c.query(
    `INSERT INTO weekly_wage_reports (assignment_id, scope_id, week_start, week_end,
                                      status, subtotal, total_deduction, net_amount,
                                      submitted_at)
     SELECT ws.assignment_id, ws.id,
            (CURRENT_DATE - v.geser)::date,
            (CURRENT_DATE - v.geser + 6)::date,
            'submitted', v.jml, 0, v.jml, now()
       FROM work_scopes ws
       CROSS JOIN (VALUES (21, 3000000), (14, 3200000), (7, 3100000)) AS v(geser, jml)
      WHERE ws.scope_name = 'CI Seed Lingkup Upah'
        AND NOT EXISTS (
          SELECT 1 FROM weekly_wage_reports w
           WHERE w.scope_id = ws.id AND w.week_start = (CURRENT_DATE - v.geser)::date)`)

  const { rows } = await c.query(
    `SELECT count(*)::int n FROM weekly_wage_reports WHERE status='submitted'`)
  if (rows[0].n === 0) throw new Error('nol weekly_wage_reports submitted sesudah seed')
})

/*
  Alat MODAL-MATI — alat kedua, plus satu baris penyusutan.

      tak ada alat modal-mati — test tak menguji apa pun

  Test `ai-tool-investasi-alat` menuntut DUA golongan sekaligus, dan menulis
  alasannya: tanpa keduanya "test ini tak bisa membedakan kode yang benar dari
  kode yang menyamakan keduanya".

      modal-mati       biayaMemiliki > 0  DAN  hariPakai = 0
      belum-tercatat   biayaMemiliki = 0

  Seed `assets` yang sudah ada memberi golongan KEDUA (alat tanpa biaya apa
  pun). Yang kurang golongan pertama — dan itu butuh alat TERPISAH: menaruh
  penyusutan pada `CI-EXC-001` akan MEMINDAHKANNYA keluar dari golongan
  belum-tercatat, memperbaiki satu tuntutan sambil merahkan tuntutan lain.

  `biayaMemiliki` diukur dari kode, bukan ditebak: penyusutan + biaya
  operasional (`ai-tool-investasi-alat.ts:217`). Satu baris penyusutan cukup,
  dan `pemakaian_alat` sengaja DIBIARKAN KOSONG untuk alat ini — itulah yang
  membuat `hariPakai = 0`.
*/
await seed('asset modal-mati + penyusutan (bahan uji investasi alat)', async () => {
  await c.query(
    `INSERT INTO assets (company_id, asset_code, name, category, purchase_price,
                         residual_value, useful_life_months, created_by)
     SELECT (SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
            'CI-IDLE-001', 'CI seed alat menganggur', 'alat_berat', 500000000, 50000000, 96,
            COALESCE((SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1),
                     (SELECT id FROM public.users ORDER BY created_at LIMIT 1))
      WHERE NOT EXISTS (SELECT 1 FROM assets WHERE asset_code='CI-IDLE-001')
        AND EXISTS (SELECT 1 FROM companies WHERE parent_company_id IS NULL)`)

  await c.query(
    `INSERT INTO penyusutan_alat (asset_id, company_id, periode, nilai, akumulasi, created_by)
     SELECT a.id, a.company_id, date_trunc('month', CURRENT_DATE)::date, 4687500, 4687500,
            COALESCE((SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1),
                     (SELECT id FROM public.users ORDER BY created_at LIMIT 1))
       FROM assets a
      WHERE a.asset_code = 'CI-IDLE-001'
        AND NOT EXISTS (SELECT 1 FROM penyusutan_alat p WHERE p.asset_id = a.id)`)

  /*
    Kedua golongan diperiksa, bukan cuma yang baru. Seed yang memperbaiki satu
    tuntutan sambil merahkan tuntutan saudaranya adalah cara kegagalan ini
    berpindah, bukan hilang.
  */
  const { rows } = await c.query(
    `SELECT count(*) FILTER (WHERE ada_biaya)::int mati,
            count(*) FILTER (WHERE NOT ada_biaya)::int belum
       FROM (SELECT a.id,
                    EXISTS (SELECT 1 FROM penyusutan_alat p WHERE p.asset_id = a.id)
                 OR EXISTS (SELECT 1 FROM biaya_operasional_alat b WHERE b.asset_id = a.id)
                      AS ada_biaya
               FROM assets a) x`)
  if (rows[0].mati === 0) throw new Error('nol alat berbiaya — golongan modal-mati kosong')
  if (rows[0].belum === 0) throw new Error('nol alat tanpa biaya — golongan belum-tercatat kosong')
})

/*
  Proyek KEDUA berklien — dituntut `kontrak.test.ts`, dan ketiadaannya
  memunculkan galat yang menuduh tabel yang salah.

      {"error":"insert or update on table \"kontrak\" violates foreign key
       constraint \"kontrak_client_id_fkey\""}: expected 500 to be 201

  Test itu memilih proyeknya menurut SYARAT, bukan menurut nama:

      WHERE p.company_id = $1 AND p.client_id IS NOT NULL
        AND NOT EXISTS (... kontrak induk berlaku ...)
      LIMIT 2
      if (p.length < 2) throw new Error('butuh dua proyek berklien ...')

  Seed ini hanya membuat SATU (`CI Seed Project`). Yang kedua terambil dari
  proyek lain yang kebetulan ada — dan `client_id`-nya bisa milik company
  lain, sehingga FK-nya meledak. Galatnya menyebut `kontrak`; sebabnya di
  sini, ratusan baris dan satu berkas jauhnya.

  Klien yang dipakai SAMA dengan proyek pertama — sengaja. Klien berbeda
  akan lolos FK tapi mengaburkan test lain yang membandingkan
  `kontrak.client_id` dengan `projects.client_id`.

  ⚠ `company_id` DISALIN EKSPLISIT. Versi pertama seed ini tak menyebutnya,
  dan menguji SQL-nya ke basis langsung meledak:

      null value in column "company_id" of relation "projects"
      violates not-null constraint

  Di CI kolom itu mungkin terisi default — dan default yang MEMILIH company
  yang salah adalah persis cacat `clients` yang sedang diperbaiki di berkas
  ini: seed melapor berhasil, galatnya muncul di tempat lain berjam-jam
  kemudian. Menyalin dari proyek induknya membuat keduanya pasti se-tenant.
*/
await seed('proyek kedua berklien (bahan uji kontrak)', async () => {
  await c.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location,
                           start_date, end_date, created_by)
     SELECT p.company_id, p.client_id, p.pm_id, 'CI Seed Project 2', 'Bandung',
            CURRENT_DATE, CURRENT_DATE + 30, p.created_by
       FROM projects p
      WHERE p.name = 'CI Seed Project'
        AND NOT EXISTS (SELECT 1 FROM projects x WHERE x.name = 'CI Seed Project 2')`)

  /*
    Yang diperiksa BUKAN "proyek kedua ada", melainkan syarat yang test-nya
    pakai — dua proyek berklien TANPA kontrak induk berlaku. Seed yang
    memenuhi namanya tapi bukan syaratnya tetap membuat test merah.
  */
  const { rows } = await c.query(
    `SELECT count(*)::int n FROM projects p
      WHERE p.client_id IS NOT NULL
        AND p.company_id = (SELECT id FROM companies WHERE parent_company_id IS NULL
                             ORDER BY created_at LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM kontrak k
                         WHERE k.project_id = p.id AND k.jenis = 'induk'
                           AND k.status = 'berlaku')`)
  if (rows[0].n < 2) {
    throw new Error(`butuh >=2 proyek berklien tanpa kontrak induk berlaku, ada ${rows[0].n}`)
  }
})

/*
  Proyek BERSIFAT — sembilan keluhan CI yang ternyata satu sebab.

  Kesembilan kalimat ini ditulis test-nya sendiri, dan semuanya menyebut
  PROYEK dengan sifat tertentu:

      nol proyek ber-EVM (aktif 0, tak terhitung 0)
      basis tak punya proyek beretensi — test ini tak menguji apa pun
      nol notifikasi — tak ada proyek mendekati akhir
      tak satu pun proyek yang SUDAH berakhir ikut disapa
      SEMUA proyek berpagu nol — tanda ketiga query gagal dan errornya ditelan
      tak ada proyek aktif ber-RAB
      nol proyek terperiksa · nol proyek tertegur
      melebarkan jendela tak menambah proyek — ambangnya tak dipakai

  Yang kurang BUKAN sembilan hal berbeda, melainkan proyek dengan sifat
  berbeda-beda. Seed ini membuat empat, masing-masing menutup satu sifat
  yang tak dimiliki `CI Seed Project`:

      AKHIR-DEKAT   berakhir 7 hari lagi   -> "mendekati akhir"
      LEWAT         berakhir 10 hari lalu  -> "SUDAH berakhir"
      RETENSI       retention_pct 5%       -> "proyek beretensi"
      PAGU          contract_value besar   -> "berpagu bukan nol"

  Bentuk kolom DIUKUR dari basis, bukan ditebak:

      contract_value  numeric  NOT NULL     retention_pct   numeric NOT NULL
      start_date      date     NOT NULL     end_date        date    NOT NULL
      status project_status NOT NULL: draft|active|on_hold|completed|cancelled

  `company_id` dan `client_id` DISALIN dari proyek induk — pelajaran seed
  `clients` dan `CI Seed Project 2`: default yang memilih company SALAH
  membuat galat muncul di tempat lain berjam-jam kemudian.
*/
await seed('proyek bersifat x4 (bahan uji otomasi & EVM)', async () => {
  await c.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location,
                           start_date, end_date, status, contract_value,
                           retention_pct, created_by)
     SELECT p.company_id, p.client_id, p.pm_id, v.nama, 'Bandung',
            CURRENT_DATE - v.mulai, CURRENT_DATE + v.selesai,
            'active'::project_status, v.nilai, v.retensi, p.created_by
       FROM projects p
       CROSS JOIN (VALUES
              ('CI Seed Proyek Akhir-Dekat', 90, 7,   2000000000, 0),
              ('CI Seed Proyek Lewat',      120, -10, 1500000000, 0),
              ('CI Seed Proyek Retensi',     60, 45,  3000000000, 5),
              ('CI Seed Proyek Pagu',        30, 120, 5000000000, 0)
            ) AS v(nama, mulai, selesai, nilai, retensi)
      WHERE p.name = 'CI Seed Project'
        AND NOT EXISTS (SELECT 1 FROM projects x WHERE x.name = v.nama)`)

  /*
    Diperiksa per-SIFAT, bukan "empat proyek ada". Seed yang menambah baris
    tanpa sifat yang dituntut tetap membuat test merah, dan pesan galatnya
    akan menunjuk test — bukan seed ini.
  */
  const { rows } = await c.query(
    `SELECT count(*) FILTER (WHERE end_date BETWEEN CURRENT_DATE
                               AND CURRENT_DATE + 30)::int AS dekat,
            count(*) FILTER (WHERE end_date < CURRENT_DATE)::int AS lewat,
            count(*) FILTER (WHERE retention_pct > 0)::int AS retensi,
            count(*) FILTER (WHERE contract_value > 0)::int AS berpagu,
            count(*) FILTER (WHERE status = 'active')::int AS aktif
       FROM projects WHERE is_deleted = false`)
  const { dekat, lewat, retensi, berpagu, aktif } = rows[0]
  if (dekat === 0)   throw new Error('nol proyek MENDEKATI akhir')
  if (lewat === 0)   throw new Error('nol proyek yang SUDAH berakhir')
  if (retensi === 0) throw new Error('nol proyek BERETENSI')
  if (berpagu === 0) throw new Error('nol proyek BERPAGU — semua contract_value nol')
  if (aktif === 0)   throw new Error('nol proyek AKTIF')
})

// ── DIAGNOSTIK state (evidence, bukan tebakan) ─────────────────────────────
const one = async (q) => { try { return JSON.stringify((await c.query(q)).rows) } catch (e) { return 'ERR ' + e.message.split('\n')[0] } }
console.log('\n[DIAG] roles:', await one(`SELECT count(*)::int n FROM roles`))
console.log('[DIAG] role_permissions total:', await one(`SELECT count(*)::int n FROM role_permissions`))
console.log('[DIAG] permissions admin (via join):', await one(`SELECT count(*)::int n FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.name='admin'`))
console.log('[DIAG] admin users aktif:', await one(`SELECT count(*)::int n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.is_active=true AND u.auth_id IS NOT NULL`))
console.log('[DIAG] get_role_permissions(admin):', await one(`SELECT count(*)::int n FROM get_role_permissions('admin')`))

// ── PostgREST reload schema — DROP SCHEMA public bisa menyisakan cache stale ──
await c.query(`NOTIFY pgrst, 'reload schema'`).catch(() => {})
console.log('[pgrst] NOTIFY reload schema dikirim')

await c.end()
// Seed non-fatal: exit 0 supaya migrasi tetap tercatat; isu seed dilaporkan utk ditindak.
