// A2 — Setup project Supabase CI (SETELAH A1 EMPTY + CI_DIRECT_URL port 5432 OK).
// Apply migration 001…116 (file nyata) BERURUTAN + seed data uji minimal. Dijalankan
// via workflow ci-isolation.yml (action=setup) karena CI_DIRECT_URL di GitHub Secrets.
//
// Migrasi = FATAL bila gagal (lapor file + berhenti). Seed = per-item try/catch
// (non-fatal) supaya semua isu tampak sekaligus. Idempoten: aman diulang.
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const url = process.env.CI_DIRECT_URL
if (!url) { console.error('FATAL: CI_DIRECT_URL kosong'); process.exit(1) }
try { console.log('Target host:', new URL(url.replace('postgresql://', 'http://')).host) } catch {}

const c = new pg.Client({ connectionString: url })
await c.connect()

// ── 0. (opsional) WIPE — replay BERSIH dari nol. HANYA bila WIPE=1 (project CI disposable).
if (process.env.WIPE === '1') {
  console.log('WIPE: DROP SCHEMA public CASCADE + reset schema_migrations …')
  await c.query(`DROP SCHEMA IF EXISTS public CASCADE`)
  await c.query(`CREATE SCHEMA public`)
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
  const tercatatSkip = rows.length > 0 && /\[SKIP:/.test(rows[0].name ?? '')
  if (rows.length && !tercatatSkip) { alreadyThere++; continue }
  if (tercatatSkip) {
    console.log(`  retry(bekas-skip) ${f} — dicoba ulang; perbaikan tak boleh terhalang catatannya sendiri`)
    await c.query(`DELETE FROM supabase_migrations.schema_migrations WHERE version=$1`, [version])
  }
  const sql = fs.readFileSync(path.join(dir, f), 'utf8')
  try {
    await c.query('BEGIN')
    await c.query(sql)
    await c.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [version, f])
    await c.query('COMMIT')
    applied++
    if (applied % 25 === 0) console.log(`  …applied ${applied} (terakhir ${f})`)
  } catch (e) {
    await c.query('ROLLBACK')
    const allow = SKIP_ALLOWLIST[version]
    if (allow) {
      await c.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [version, `${f} [SKIP:${allow.class}]`])
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
    yang semuanya sudah menyebut `company_id`. Dua yang tertinggal cuma
    `clients` dan `cost_codes`.
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
await seed('cost_code', async () => {
  await c.query(
    `INSERT INTO cost_codes (code, name, created_by)
     SELECT 'CC-CI-SEED', 'CI seed cost code', (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
     WHERE NOT EXISTS (SELECT 1 FROM cost_codes WHERE code='CC-CI-SEED')`)
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
    const { rows: pr } = await c.query(
      `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
       VALUES ($1,$2,'CI Seed Project','Bandung',CURRENT_DATE,CURRENT_DATE+30,$3) RETURNING id`,
      [clientId, pmId, adminId])
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
