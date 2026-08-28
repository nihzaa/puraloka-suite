import { Client } from 'pg'
import { connectWithRetry } from './connect-with-retry.js'

// ─────────────────────────────────────────────────────────────────────────────
// RLS Test Harness (Epic 4)
//
// Test suite utama (test-db.ts) sengaja menjalankan tabel di schema `test` TANPA
// RLS — konsisten produksi di mana API pakai service_role yang bypass RLS. Itu
// tepat untuk menguji logika bisnis, tapi TIDAK BISA memverifikasi RLS policy.
//
// Harness ini menutup gap itu: ia menguji RLS policy NYATA di schema `public`
// dengan mengimpersonasi user (role `authenticated` + request.jwt.claims → sub),
// sehingga auth.uid()/auth_role()/has_permission() dievaluasi persis seperti
// request browser sungguhan.
//
// ⚠️ KOREKSI 2026-08-04 — "read-safe" HANYA berlaku untuk `asUser()`
//
// Versi lama komentar ini berbunyi: *"Semua dalam transaksi yang SELALU
// di-ROLLBACK — harness ini read-safe, tidak pernah mengubah data public."*
//
// Bagian pertama benar; kesimpulannya tidak. `asUser()` memang selalu ROLLBACK,
// tetapi `createRlsClient()` di bawah mengembalikan client MENTAH — dan
// **42 berkas test menulis lewatnya di luar transaksi mana pun** (diukur
// 2026-08-04). Tulisan itu mendarat di schema `public` bersama dan BERTAHAN.
//
// Klaim yang tak akurat itu bukan sekadar salah tulis: ia dipakai sebagai dasar
// mengubah `concurrency.group` CI jadi per-ref, dengan anggapan run paralel
// aman. Akibatnya empat PR yang terbuka bersamaan saling merusak fixture, dan
// satu branch berubah dari hijau jadi merah TANPA satu baris pun berubah.
// Riwayat lengkap + jalan keluarnya: `RATIFIKASI.md` R-009.
//
// Jadi: pakai `asUser()` bila hanya MEMBACA. Bila test Anda MENULIS, sadari
// tulisannya bertahan di `public`, dan bersihkan sendiri (pola `purge()` +
// prefiks `[TEST-…]` yang dipakai berkas-berkas test rute).
//
// Dipakai lintas Epic 4 (semua kelompok tabel RLS) dan seterusnya.
// ─────────────────────────────────────────────────────────────────────────────

function getDirectUrl(): string {
  const url = process.env.DIRECT_URL
  if (!url) {
    throw new Error(
      'DIRECT_URL tidak ditemukan. RLS harness butuh koneksi Postgres langsung ke ' +
        'project Supabase dev (schema public, tempat RLS + auth.uid() hidup).'
    )
  }
  return url
}

export async function createRlsClient(): Promise<Client> {
  // Tahan blip pooler transient di connect() (lihat connect-with-retry.ts) —
  // dulu satu blip di beforeAll menggugurkan seluruh file test.
  return connectWithRetry({ connectionString: getDirectUrl() })
}

/**
 * Jalankan `fn` di dalam transaksi yang mengimpersonasi user dengan `authId`
 * (auth.users.id / users.auth_id) sebagai role `authenticated`. Transaksi
 * SELALU di-ROLLBACK setelahnya — tidak ada perubahan data yang bertahan.
 *
 * `authId = null` → simulasi anon (tidak login): role `anon`, tanpa claims.
 */
export async function asUser<T>(
  client: Client,
  authId: string | null,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  await client.query('BEGIN')
  try {
    if (authId === null) {
      await client.query("SELECT set_config('role', 'anon', true)")
      await client.query("SELECT set_config('request.jwt.claims', '', true)")
    } else {
      await client.query("SELECT set_config('role', 'authenticated', true)")
      // set_config value harus string; klaim minimal yang dibaca auth.uid() = sub
      await client.query(
        "SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
        [authId]
      )
    }
    return await fn(client)
  } finally {
    await client.query('ROLLBACK')
  }
}

/**
 * Ambil satu `users.auth_id` untuk role built-in tertentu (admin/pm/mandor/client)
 * dari data dev — dipakai test untuk mengimpersonasi user nyata per role.
 * Mengembalikan null jika tidak ada user aktif dengan role itu yang punya auth_id.
 * (Catatan: di dev, tidak semua seed user punya auth_id — test SKIP jika null.)
 */
export async function authIdForRole(client: Client, role: string): Promise<string | null> {
  // Sub-Fase 1B.4 CONTRACT: role via FK (roles.name), kolom enum di-drop.
  //
  // ── Kenapa keanggotaan WAJIB, ditemukan 2026-08-16
  //
  // Versi sebelumnya hanya menuntut peran + aktif. Itu cukup selama tiap
  // pengguna beperan admin punya company — dan berhenti cukup begitu sebuah
  // test isolasi meninggalkan pengguna admin ber-NOL `company_members`
  // (`isolasi-…@ujicoba.test`, tertinggal dari agent lain).
  //
  // Akibatnya bukan galat yang menunjuk sebabnya. Harness memilih pengguna
  // yatim itu, lalu baris berikutnya di TIAP berkas test —
  //
  //     SELECT company_id FROM company_members WHERE user_id = $1
  //
  // — memulangkan NOL baris, dan `beforeAll` mati dengan
  // "Cannot read properties of undefined (reading 'company_id')". Diukur:
  // 16 test `tender-subkon` DILEWATI seluruhnya, di berkas yang tak seorang
  // pun menyentuhnya.
  //
  // Yang diperbaiki di sini HARNESS-nya, bukan datanya. Menghapus barisnya
  // memang membuat hijau hari ini, tapi pengguna yatim berikutnya akan
  // mematikan seluruh suite dengan cara yang sama — dan basis ini dipakai
  // bersama beberapa worktree yang saling tak tahu.
  //
  // `ORDER BY created_at` membuat pilihannya STABIL: pengguna seed yang lama
  // menang atas pengguna uji yang baru lahir, jadi hasil test tak berubah-ubah
  // menurut siapa yang kebetulan membuat akun terakhir.
  const { rows } = await client.query(
    `SELECT u.auth_id FROM public.users u
       JOIN public.roles r ON r.id = u.role_id
      WHERE r.name = $1
        AND u.auth_id IS NOT NULL
        AND u.is_active = true
        AND EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = u.id)
      ORDER BY u.created_at
      LIMIT 1`,
    [role]
  )
  return rows[0]?.auth_id ?? null
}

/**
 * Company yang BENAR-BENAR dipakai rute untuk pengguna ini — yaitu nilai
 * `auth_company_id()`, bukan baris pertama `company_members`.
 *
 * ── Kenapa helper ini ada, ditemukan 2026-08-28
 *
 * Pola yang tersebar di banyak berkas test:
 *
 *     SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1
 *
 * `LIMIT 1` tanpa `ORDER BY` memulangkan baris SEMBARANG. Untuk pengguna yang
 * anggota satu company itu tak apa-apa — dan seluruh suite hijau selama
 * pengguna seed admin memang begitu.
 *
 * Diukur: pengguna admin yang dipilih `authIdForRole` anggota TIGA company.
 * `LIMIT 1` memberi `8e7e65b0…`, sementara `auth_company_id()` — yang dipakai
 * rute — memberi `48befb54…`. Fixture menulis seri ke tenant A, rute
 * mencarinya di tenant B, dan jawabannya 404 "belum ada seri".
 *
 * Selama RLS belum di-FORCE (migrasi 510), kebocoran lintas tenant menutupi
 * ketidakcocokan ini: baris tenant A tetap terbaca dari konteks tenant B, jadi
 * test hijau KARENA ada lubang keamanan. Menutup lubangnya membuat enam test
 * `penomoran` merah — bukan regresi, melainkan cacat fixture yang selama ini
 * tersembunyi.
 *
 * Pakai helper ini di mana pun fixture menyisipkan baris ber-`company_id` yang
 * nanti dibaca lewat rute. Kalau nilainya beda, gejalanya bukan galat izin —
 * melainkan "data tidak ditemukan", yang menuduh rute atau query, bukan setup.
 *
 * Melempar bila NULL: pengguna tanpa konteks company berarti pilihan
 * `authIdForRole` salah, dan diam-diam memakai company lain hanya memindahkan
 * kegagalan ke tempat yang lebih jauh dari sebabnya.
 */
export async function companyRute(client: Client, authId: string): Promise<string> {
  /*
    Bentuknya SENGAJA menyalin `auth_company_id()` — `is_default AND is_active`,
    bukan "baris pertama". Kalau fungsi SQL-nya berubah, helper ini harus ikut;
    menebak bentuk sendiri akan memulangkan company yang berbeda tanpa galat.

    `app.company_id` (cabang pertama fungsi itu) sengaja TIDAK ditiru: ia
    disetel per-permintaan oleh lapis tenancy, sementara fixture berjalan
    sebelum permintaan mana pun ada.
  */
  const { rows } = await client.query(
    `SELECT cm.company_id FROM public.company_members cm
       JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_id = $1 AND cm.is_default = true AND cm.is_active = true
      LIMIT 1`,
    [authId]
  )
  const id = rows[0]?.company_id
  if (!id) {
    throw new Error(
      `companyRute: pengguna ${authId} tak punya keanggotaan DEFAULT yang aktif. ` +
        '`auth_company_id()` akan memulangkan NULL, jadi rute tak akan pernah ' +
        'menemukan baris yang ditulis fixture. Perbaiki datanya, jangan ' +
        'memilih company lain — itu memindahkan kegagalan menjauh dari sebabnya.'
    )
  }
  return id as string
}

/**
 * Pengguna LAIN yang bukan `bukanUserId` — dipakai sebagai PENGAJU di fixture
 * approval.
 *
 * ── Kenapa ini perlu, sejak 2026-08-12
 *
 * TJS-P4 memasang gerbang Segregation of Duties: pengaju tak boleh menyetujui
 * pengajuannya sendiri. Fixture lama membuat entitas dengan `created_by =
 * adminUserId` lalu approve sebagai admin yang sama, dan sesudah gerbang
 * terpasang kelimanya balas 403.
 *
 * Test-test itu TIDAK salah maksudnya — komentar di
 * `approval-chain-berjenjang.test.ts` menyatakan sendiri "yang diuji mekanika
 * BERJENJANG-nya, bukan pemisahan orang". Yang salah cuma fixture-nya:
 * memakai satu orang untuk dua peran yang di dunia nyata memang dua orang.
 *
 * Jadi helper ini, bukan `alasan_override` di tiap test. Memakai override
 * akan membuat kelima test itu menempuh jalur ISTIMEWA — dan yang diuji
 * berubah diam-diam dari "approval berjenjang bekerja" jadi "override
 * bekerja", sementara jalur normalnya tak teruji sama sekali.
 *
 * Mengembalikan null bila basis hanya punya satu pengguna aktif; pemanggil
 * WAJIB gagal keras, bukan diam-diam memakai orang yang sama lagi.
 */
export async function penggunaLain(
  client: Client,
  bukanUserId: string,
): Promise<{ userId: string; authId: string | null } | null> {
  const { rows } = await client.query(
    `SELECT u.id, u.auth_id FROM public.users u
      WHERE u.id <> $1 AND u.is_active = true
      ORDER BY (u.auth_id IS NOT NULL) DESC
      LIMIT 1`,
    [bukanUserId],
  )
  if (!rows.length) return null
  return { userId: rows[0].id, authId: rows[0].auth_id ?? null }
}

/**
 * Mandor ber-`auth_id` yang PUNYA minimal satu assignment aktif — dipakai test
 * ownership isolation (mandor tanpa assignment tidak membuktikan apa-apa).
 * Return { authId, userId, assignedProjectCount } atau null.
 */
export async function assignedMandor(
  client: Client
): Promise<{ authId: string; userId: string; assignedProjectCount: number } | null> {
  const { rows } = await client.query(`
    SELECT u.id AS user_id, u.auth_id,
           count(DISTINCT ma.project_id)::int AS n
    FROM public.users u
    JOIN public.roles r ON r.id = u.role_id
    JOIN public.mandor_assignments ma ON ma.mandor_id = u.id
    WHERE r.name = 'mandor' AND u.auth_id IS NOT NULL AND u.is_active = true
    GROUP BY u.id, u.auth_id
    ORDER BY n DESC
    LIMIT 1
  `)
  if (!rows[0]) return null
  return { authId: rows[0].auth_id, userId: rows[0].user_id, assignedProjectCount: rows[0].n }
}

/**
 * Pastikan prasyarat test ADA — kalau tidak, GAGALKAN dengan penjelasan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test RLS di repo ini memakai pola `if (!m) return` sebanyak **17 kali**:
 * kalau prasyaratnya tak ada (mandor ter-assign, client ber-auth, pm), test
 * BERHENTI DIAM-DIAM dan dilaporkan **lulus**.
 *
 * Niatnya bisa dimengerti — test tak boleh merah karena basis data kebetulan
 * kosong. Tapi akibatnya: seluruh 42 test isolasi RLS bisa hijau tanpa menguji
 * satu pun kebocoran, dan tak ada yang tahu. Persis kelas cacat yang sudah
 * menggigit dua kali di repo ini:
 *   · 24 integration test yang TAK PERNAH berjalan (`to_regclass` menembus schema)
 *   · test paritas golden yang lulus karena berkasnya tak ada
 *
 * Bedanya dengan `describe.skipIf`: skip TERLIHAT di keluaran ("1 skipped"),
 * sementara `return` diam-diam terhitung sebagai lulus.
 *
 * Yang ditegakkan di sini: prasyarat yang HILANG adalah kegagalan, dan
 * pesannya menyebutkan apa yang harus di-seed. Seed CI sudah menyediakan
 * client, project, mandor + assignments — jadi kalau ini merah, seed-nya yang
 * rusak, dan itu justru yang perlu diketahui.
 */
export function wajibAda<T>(nilai: T | null | undefined, apa: string): T {
  if (nilai === null || nilai === undefined) {
    throw new Error(
      `Prasyarat test tak terpenuhi: ${apa} tidak ada di basis data.\n` +
      `  Test ini TIDAK dilewati diam-diam — prasyarat yang hilang berarti\n` +
      `  isolasi RLS tak teruji sama sekali, dan itu harus terlihat.\n` +
      `  Seed CI (ci-project-setup.mjs) menyediakan client, project, dan\n` +
      `  mandor+assignments; kalau ini gagal, seed-nya yang perlu diperiksa.`
    )
  }
  return nilai
}

/**
 * Company AKTIF untuk sebuah pengguna uji — yang benar-benar BERISI data.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN `LIMIT 1` BEGITU SAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pola yang tersebar di 19 berkas test (diukur 2026-08-16):
 *
 *     SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1
 *
 * `LIMIT 1` TANPA `ORDER BY` menyerahkan pilihannya ke Postgres. Selama
 * pengguna uji hanya punya satu company, itu tak pernah terlihat salah.
 *
 * Ia berhenti benar begitu akun uji jadi anggota BEBERAPA company — dan itu
 * yang terjadi: akun founder punya 3 keanggotaan, sementara SELURUH 60
 * `workers` ada di satu company saja. Harness memilih company yang kosong,
 * lalu `siapkanTender` mati dengan "butuh tiga worker di company ini" —
 * pesan yang menuduh SEED, padahal seed-nya baik-baik saja dan yang salah
 * pilihan company-nya.
 *
 * Kegagalan seperti ini paling mahal justru karena terbaca masuk akal.
 *
 * ── Kenapa "yang berisi", bukan sekadar berurutan
 *
 * Mengurutkan `company_members.created_at` membuat pilihannya STABIL tapi
 * belum tentu BERGUNA — company pertama bisa saja yang kosong. Yang dicari
 * test adalah company yang punya bahan untuk fixture-nya.
 *
 * `tabelBerisi` menyebut tabel apa yang harus ada isinya. Kalau tak satu pun
 * company memenuhinya, yang dikembalikan tetap keanggotaan pertama (urut
 * stabil) supaya pesan galat test tetap menunjuk prasyarat yang kurang —
 * bukan berubah jadi "tak punya company", yang menyesatkan ke arah lain.
 */
export async function companyBerisi(
  client: Client,
  authId: string,
  tabelBerisi: string[] = [],
): Promise<string> {
  const { rows: u } = await client.query(
    'SELECT id FROM public.users WHERE auth_id = $1', [authId],
  )
  if (!u.length) throw new Error(`Pengguna dengan auth_id ${authId} tak ada`)

  const { rows: anggota } = await client.query(
    `SELECT company_id FROM public.company_members
      WHERE user_id = $1 ORDER BY created_at, company_id`,
    [u[0].id],
  )
  if (!anggota.length) {
    throw new Error(
      `Pengguna ${authId} tak punya keanggotaan company sama sekali.\n` +
      `  RLS akan menyaring HABIS seluruh query-nya, jadi test apa pun di\n` +
      `  atasnya tak menguji apa-apa. Periksa seed / pengguna uji yatim.`,
    )
  }

  for (const co of anggota.map((r) => r.company_id as string)) {
    let cocok = true
    for (const t of tabelBerisi) {
      // Nama tabel dari KODE test, bukan dari masukan pengguna — tapi tetap
      // disaring supaya tak pernah jadi jalan masuk SQL injection.
      if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`Nama tabel tak wajar: ${t}`)

      /*
        Tabel bisa ber-tenancy LANGSUNG (`company_id`) atau LEWAT PROYEK
        (`project_id`) — dan yang lewat proyek jumlahnya banyak
        (kategori C di peta tenancy).

        Versi pertama hanya tahu `company_id`, jadi
        `companyBerisi(db, auth, ['rab_items'])` melempar
        `column "company_id" does not exist` — galat yang menuduh HARNESS,
        bukan pemanggilnya, dan yang membacanya akan mengira tabelnya salah
        nama.

        Diukur 2026-08-18: `rab_items` dan `punch_items` keduanya hanya
        punya `project_id`.
      */
      const { rows: kol } = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
            AND column_name IN ('company_id', 'project_id')`,
        [t],
      )
      const punya = new Set(kol.map((r) => r.column_name as string))

      let sql: string
      if (punya.has('company_id')) {
        sql = `SELECT 1 FROM public.${t} WHERE company_id = $1 LIMIT 1`
      } else if (punya.has('project_id')) {
        sql = `SELECT 1 FROM public.${t} x
                 JOIN public.projects p ON p.id = x.project_id
                WHERE p.company_id = $1 LIMIT 1`
      } else {
        throw new Error(
          `Tabel '${t}' tak punya company_id MAUPUN project_id — ` +
          'ia tak bisa dipakai sebagai syarat "company yang berisi".',
        )
      }

      const { rows } = await client.query(sql, [co])
      if (!rows.length) { cocok = false; break }
    }
    if (cocok) return co
  }

  return anggota[0].company_id as string
}

/**
 * Company yang punya PENGGUNA KEDUA berizin `kunciIzin` — bukan sekadar
 * company pertama yang ditemukan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — cacat yang berulang EMPAT KALI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pola `SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1`
 * muncul di 16 berkas test. Tanpa `ORDER BY`, pilihannya diserahkan ke
 * Postgres — dan begitu akun uji jadi anggota beberapa company, yang terpilih
 * belum tentu yang punya data/pengguna yang dibutuhkan.
 *
 * Gejalanya SELALU menuduh seed:
 *
 *   "butuh pengguna kedua berizin backcharge:setujui"      back-charge
 *   "butuh pengguna kedua di company ini untuk memenuhi SoD" co-billing-mode
 *   "butuh pengguna kedua ber-auth_id dan berizin opname:verifikasi"
 *   "tak ada anggota ber-peran client di company uji"      wa-webhook
 *
 * Diukur 2026-08-18: keempat izin itu ADA di basis (2–4 pengguna masing-
 * masing). Yang salah bukan seednya — melainkan company yang diundi.
 *
 * ── Kenapa lewat `company_members.role_id`, bukan `users.role_id`
 *
 * Peran EFEKTIF seseorang ditentukan keanggotaannya di company itu (ADR-004:
 * peran adalah data konfigurasi per-tenant). `users.role_id` masih ada dan
 * masih terisi, jadi menjoin lewatnya TIDAK melempar galat — ia hanya
 * menjawab pertanyaan yang berbeda dari yang dipakai `authenticate`.
 *
 * Test yang memakai jalur berbeda dari kode produksi bisa hijau untuk
 * keadaan yang tak pernah terjadi.
 */
export async function companyDenganIzinKedua(
  client: Client,
  authId: string,
  kunciIzin: string,
): Promise<{ companyId: string; userId: string; authId: string } | null> {
  const { rows: u } = await client.query(
    'SELECT id FROM public.users WHERE auth_id = $1', [authId],
  )
  if (!u.length) throw new Error(`Pengguna dengan auth_id ${authId} tak ada`)
  const akuId = u[0].id as string

  const { rows } = await client.query(
    `SELECT m.company_id, u2.id AS user_id, u2.auth_id
       FROM public.company_members m
       JOIN public.company_members m2 ON m2.company_id = m.company_id
       JOIN public.users u2 ON u2.id = m2.user_id
       JOIN public.role_permissions rp ON rp.role_id = m2.role_id
       JOIN public.permissions p ON p.id = rp.permission_id
      WHERE m.user_id = $1
        AND u2.id <> $1
        AND u2.auth_id IS NOT NULL
        AND u2.is_active
        AND p.key = $2
      ORDER BY m.created_at, m.company_id, u2.id
      LIMIT 1`,
    [akuId, kunciIzin],
  )

  if (!rows.length) return null
  return {
    companyId: rows[0].company_id as string,
    userId: rows[0].user_id as string,
    authId: rows[0].auth_id as string,
  }
}
