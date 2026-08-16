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
      const { rows } = await client.query(
        `SELECT 1 FROM public.${t} WHERE company_id = $1 LIMIT 1`, [co],
      )
      if (!rows.length) { cocok = false; break }
    }
    if (cocok) return co
  }

  return anggota[0].company_id as string
}
