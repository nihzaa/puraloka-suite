import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// PUNCH LIST — aturan yang menentukan modul ini berguna atau tidak.
//
// Yang diuji bukan CRUD-nya (itu akan hijau apa pun yang terjadi), melainkan
// empat hal yang kalau rusak membuat punch list berubah jadi daftar niat:
//
//   1. Nomor unik PER PROYEK, bukan global — proyek kedua harus bisa punya
//      PL-001 sendiri (cacat yang sama sudah menggigit 3× di repo ini:
//      asset_code/045, financial_config/145, feature_flags/146).
//   2. Ditutup HARUS punya jejak verifikator — tanpa itu "ditutup" cuma berarti
//      seseorang mengubah dropdown.
//   3. Ditolak HARUS beralasan — kalau tidak, ia tak bisa dibedakan dari
//      penghapusan diam-diam.
//   4. Pelaksana TIDAK boleh menutup perkaranya sendiri — di DB ini dijaga
//      lewat pemisahan capability; di API lewat cek pemilik. Keduanya diuji.
//
// Diuji terhadap DB NYATA (schema public, constraint sungguhan), dalam
// transaksi yang selalu ROLLBACK.
// ============================================================

let c: Client
let projectA: string
let projectB: string
let userId: string

const SUMBER_RUTE = join(import.meta.dirname, '..', 'punch-list.ts')

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  userId = (await c.query(
    `SELECT id FROM users WHERE is_active = true LIMIT 1`)).rows[0].id

  // Dua proyek — nomor per-proyek hanya bisa diuji dengan lebih dari satu.
  //
  // ⚠️ DIBUAT, bukan diambil dari yang kebetulan ada. Versi pertama mengambil
  // `LIMIT 2` dari data yang ada dan lulus di dev (5 proyek) tapi MERAH di CI,
  // yang basisnya bersih dan hanya punya satu proyek. Test yang bergantung
  // pada data yang kebetulan ada bukan test — ia lulus atau gagal menurut
  // isi basis data, bukan menurut benar-salahnya kode.
  projectA = (await c.query(
    `SELECT id FROM projects WHERE is_deleted = false ORDER BY created_at LIMIT 1`)).rows[0].id

  // Kolom wajib disalin dari proyek induk, bukan didaftar dari ingatan —
  // `location` & `end_date` juga NOT NULL (dicek ke `pg_attribute`), dan
  // melewatkannya membuat beforeAll gagal sehingga seluruh test SKIPPED,
  // bukan merah. Gejalanya "12 skipped", yang mudah dibaca sebagai lulus.
  projectB = (await c.query(
    `INSERT INTO projects (name, client_id, pm_id, company_id, location,
                           contract_value, start_date, end_date, status, created_by)
     SELECT '[UJI] proyek kedua punch', p.client_id, p.pm_id, p.company_id, p.location,
            0, p.start_date, p.end_date, 'active', $2
       FROM projects p WHERE p.id = $1
     RETURNING id`,
    [projectA, userId])).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

const buat = (projectId: string, nomor: string, extra = '') =>
  c.query(
    `INSERT INTO punch_items (project_id, nomor, judul, ditemukan_oleh${extra ? ', ' + extra.split('=')[0] : ''})
     VALUES ($1, $2, '[UJI] temuan', $3${extra ? ', ' + extra.split('=')[1] : ''}) RETURNING id`,
    [projectId, nomor, userId])

describe('Punch List — penomoran per proyek', () => {
  it('dua proyek boleh sama-sama punya PL-001', async () => {
    // Prasyarat dijaga, bukan diasumsikan: kalau keduanya proyek yang sama,
    // test ini lulus tanpa menguji apa pun.
    expect(projectB, 'proyek kedua tak terbentuk').not.toBe(projectA)
    await c.query('SAVEPOINT s1')
    await buat(projectA, 'PL-001')
    const kedua = await buat(projectB, 'PL-001')
    await c.query('ROLLBACK TO SAVEPOINT s1')

    expect(
      kedua.rows[0].id,
      'proyek kedua tak bisa memakai PL-001 — keunikannya global, jadi ' +
        'penomoran proyek baru melanjutkan nomor proyek lain'
    ).toBeTruthy()
  }, 60_000)

  it('nomor yang sama DALAM satu proyek ditolak', async () => {
    await c.query('SAVEPOINT s2')
    await buat(projectA, 'PL-042')
    let ditolak = false
    try {
      await buat(projectA, 'PL-042')
    } catch (e) {
      ditolak = (e as { code?: string }).code === '23505'
    }
    await c.query('ROLLBACK TO SAVEPOINT s2')

    expect(ditolak, 'nomor ganda dalam satu proyek diterima — dua perkara berbeda ' +
      'akan saling menimpa dalam laporan').toBe(true)
  }, 60_000)
})

describe('Punch List — constraint yang menjaga arti status', () => {
  it('`ditutup` tanpa verifikator DITOLAK', async () => {
    await c.query('SAVEPOINT s3')
    const { rows } = await buat(projectA, 'PL-101')
    let ditolak = false
    try {
      await c.query(`UPDATE punch_items SET status = 'ditutup' WHERE id = $1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s3')

    expect(
      ditolak,
      'temuan bisa ditutup tanpa siapa pun memverifikasi — "ditutup" jadi ' +
        'sekadar nilai dropdown, bukan pernyataan bahwa perbaikannya sah'
    ).toBe(true)
  }, 60_000)

  it('`ditutup` DENGAN verifikator + waktu diterima', async () => {
    // Sisi positifnya wajib diuji: constraint yang menolak SEMUANYA juga lulus
    // test di atas, dan modulnya jadi tak bisa dipakai sama sekali.
    await c.query('SAVEPOINT s4')
    const { rows } = await buat(projectA, 'PL-102')
    const ok = await c.query(
      `UPDATE punch_items SET status='ditutup', diverifikasi_oleh=$2,
              diverifikasi_pada=now(), ditutup_pada=now()
        WHERE id=$1 RETURNING id`, [rows[0].id, userId])
    await c.query('ROLLBACK TO SAVEPOINT s4')

    expect(ok.rowCount, 'temuan yang diverifikasi dengan benar TETAP ditolak — ' +
      'constraint-nya terlalu ketat dan modulnya tak bisa dipakai').toBe(1)
  }, 60_000)

  it('`ditolak` tanpa alasan DITOLAK', async () => {
    await c.query('SAVEPOINT s5')
    const { rows } = await buat(projectA, 'PL-103')
    let ditolak = false
    try {
      await c.query(`UPDATE punch_items SET status='ditolak' WHERE id=$1`, [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s5')

    expect(
      ditolak,
      'temuan bisa ditolak tanpa alasan — tak bisa dibedakan dari dihapus diam-diam'
    ).toBe(true)
  }, 60_000)

  it('alasan berisi spasi saja tetap DITOLAK', async () => {
    // `NOT NULL` saja tidak cukup: string kosong lolos, dan " " lolos juga.
    await c.query('SAVEPOINT s6')
    const { rows } = await buat(projectA, 'PL-104')
    let ditolak = false
    try {
      await c.query(
        `UPDATE punch_items SET status='ditolak', alasan_penolakan='   ' WHERE id=$1`,
        [rows[0].id])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s6')

    expect(ditolak, 'alasan berisi spasi diterima sebagai alasan').toBe(true)
  }, 60_000)
})

describe('Punch List — pemisahan pelaksana vs verifikator', () => {
  it('mandor punya punch:manage tapi TIDAK punch:verify', async () => {
    const q = await c.query(
      `SELECT p.key FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.name = 'mandor' AND p.key LIKE 'punch:%' ORDER BY p.key`)
    const keys = q.rows.map((r) => r.key)

    expect(keys, 'mandor tak bisa mencatat temuan — modul lahir tanpa penggunanya')
      .toContain('punch:manage')
    expect(
      keys,
      'mandor bisa memverifikasi perbaikannya sendiri — punch list jadi daftar niat'
    ).not.toContain('punch:verify')
  }, 60_000)

  it('client hanya boleh MELIHAT', async () => {
    /*
      `DISTINCT` — role `client` kini ada LEBIH DARI SATU baris.

      Sejak migrasi 363-365 role dimiliki per-tenant: satu baris template
      (`company_id NULL`) sebagai cetakan, dan satu salinan per tenant. Kueri
      `WHERE r.name = 'client'` mengenai keduanya, jadi hasilnya
      `['punch:view', 'punch:view']` — bukan karena izinnya bertambah,
      melainkan karena barisnya bertambah.

      Yang diuji di sini tetap sama dan tetap bermakna: KUNCI APA SAJA yang
      dipegang `client` untuk punch — jawabannya harus tepat satu,
      `punch:view`. Menghitung barisnya alih-alih kuncinya membuat test ini
      merah setiap kali tenant baru di-provision, dan merah itu tak menunjuk
      cacat apa pun.
    */
    const q = await c.query(
      `SELECT DISTINCT p.key FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.name = 'client' AND p.key LIKE 'punch:%'`)
    expect(q.rows.map((r) => r.key).sort()).toEqual(['punch:view'])
  }, 60_000)

  it('API menolak penutupan oleh orang yang ditugaskan — bukan hanya cek capability', async () => {
    // Capability menjawab "boleh apa", bukan "boleh atas perkara SIAPA".
    // Seorang PM yang kebetulan ditugaskan memperbaiki punya `punch:verify`,
    // jadi cek permission saja MELOLOSKANNYA. Yang menahannya adalah
    // perbandingan `ditugaskan_ke === currentUser.id` di rutenya.
    //
    // Diuji dari SUMBER karena aturan ini hidup di API, bukan di constraint DB —
    // dan test yang menulis ulang logikanya sudah terbukti meloloskan mutasi
    // (pelajaran t10/auth-peran-company).
    const src = readFileSync(SUMBER_RUTE, 'utf8')
    const blok = src.slice(src.indexOf("if (baru === 'ditutup')"))
      .slice(0, 1800)

    expect(
      blok,
      'rute tak lagi memeriksa punch:verify saat menutup — siapa pun yang bisa ' +
        'mengklaim "sudah diperbaiki" juga bisa menyatakannya sah'
    ).toContain("hasPermission(request, 'punch:verify')")
    expect(
      blok,
      'rute tak lagi menolak pelaksana menutup perkaranya sendiri'
    ).toContain('lama.ditugaskan_ke === request.currentUser!.id')
  }, 60_000)
})

describe('Punch List — isolasi tenant', () => {
  it('policy `tenant_isolation` ada dan RESTRICTIVE di kedua tabel', async () => {
    for (const t of ['punch_items', 'punch_item_photos']) {
      const q = await c.query(
        `SELECT permissive FROM pg_policies
          WHERE schemaname='public' AND tablename=$1 AND policyname='tenant_isolation'`, [t])
      expect(q.rowCount, `${t}: policy tenant_isolation hilang`).toBe(1)
      expect(q.rows[0].permissive, `${t}: tenant_isolation bukan RESTRICTIVE`).toBe('RESTRICTIVE')
    }
  }, 60_000)

  it('ada policy PERMISSIVE — kalau tidak, tabelnya MATI TOTAL', async () => {
    // Pelajaran migrasi 149: RESTRICTIVE tanpa PERMISSIVE membuat himpunan
    // permissive kosong, yang dievaluasi FALSE. Tabelnya lulus semua uji
    // "isolasi" dengan sempurna — karena tak ada yang bisa membacanya.
    for (const t of ['punch_items', 'punch_item_photos']) {
      const q = await c.query(
        `SELECT count(*) n FROM pg_policies
          WHERE schemaname='public' AND tablename=$1 AND permissive='PERMISSIVE'`, [t])
      expect(Number(q.rows[0].n), `${t}: nol policy permissive — tabel mati total`)
        .toBeGreaterThan(0)
    }
  }, 60_000)

  it('policy tenant memakai `(SELECT auth_company_id())`, bukan panggilan telanjang', async () => {
    // Tanpa bungkus SELECT, fungsinya dievaluasi PER BARIS, bukan sekali
    // per-query. Benar hasilnya, tapi biayanya naik linear terhadap jumlah baris.
    const q = await c.query(
      `SELECT qual FROM pg_policies
        WHERE schemaname='public' AND tablename='punch_items' AND policyname='tenant_isolation'`)
    expect(q.rows[0].qual).toContain('SELECT auth_company_id()')
  }, 60_000)
})
