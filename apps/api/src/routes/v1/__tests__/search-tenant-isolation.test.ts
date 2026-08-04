import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import searchRoutes from '../search.js'

// ============================================================
// T4b — ISOLASI TENANT DI SEARCH GLOBAL (fixture P2, ADR-011 §9.5)
//
// Kenapa search yang diuji lebih dulu: ia satu-satunya endpoint yang menyentuh
// 6 tabel lintas modul dalam satu request (projects, clients, invoices,
// kasbons, users, milestones). Satu query lolos scope di sini = nama proyek,
// klien, dan nomor invoice perusahaan lain muncul di kotak pencarian.
//
// P2 menuntut isolasi DIBUKTIKAN sebelum pelanggan kedua nyata. Karena itu test
// ini MEMBUAT tenant kedua betulan berisi data, lalu menyatakan yang NEGATIF:
// hasil pencarian tenant A tidak pernah memuat id milik tenant B.
//
// Assertion by-ID, bukan by-count: dua tenant bisa kebetulan punya jumlah baris
// sama, dan count yang cocok akan menyembunyikan kebocoran.
//
// ⚠️ STATUS JUJUR (2026-07-29): 2 dari 5 assertion HIJAU — keduanya yang
// menyatakan hal NEGATIF (data tenant B tidak muncul). 3 yang menyatakan hal
// POSITIF (data tenant A MUNCUL) masih merah karena search mengembalikan nol
// hasil di dalam harness ini, PADAHAL:
//   · fixture terbukti ada (sanity check di beforeAll lolos),
//   · query yang sama lewat wrapper mengembalikan baris saat diuji langsung
//     (probe: raw supabase 3 baris, wrapper 3 baris, wrapper+ilike 3 baris).
// Artinya penyebabnya ada di HARNESS test ini (dugaan: interaksi vi.mock
// supabaseAuth dengan client nyata), BUKAN di search.ts maupun wrapper.
//
// Konsekuensi yang harus dibaca apa adanya: test ini BELUM membuktikan isolasi
// secara meyakinkan. Yang hijau bisa hijau karena hasilnya memang kosong —
// "tidak ada data B" trivially benar saat tidak ada data apa pun. Karena itu
// jangan hitung file ini sebagai bukti P2 sampai 3 assertion positif hijau.
//
// CAKUPAN — jujur soal batasnya: kategori C diwakili `milestones`. `invoices`
// TIDAK ikut difixture karena constraint bisnisnya (chk_invoice_termin_billing
// mensyaratkan termin_schedule_id) menuntut rantai fixture panjang yang tak
// menambah nilai uji — keduanya melewati jalur scoping yang SAMA (saringan
// daftar project milik tenant di search.ts). Kalau jalur itu bocor, milestone
// yang menangkapnya.
// ============================================================

let app: FastifyInstance
let c: Client
// ⚠️ TAG harus UNIK PER-RUN, bukan tetap.
//
// Pencarian membatasi hasil 8 per jenis (`search.ts:29`, cap dari `limit=8`).
// Dengan TAG tetap, baris bertanda sama dari shard LAIN yang berjalan
// bersamaan ikut cocok — dan bila jumlahnya melewati 8, klien milik tenant A
// terdorong keluar dari hasil. Testnya lalu merah dengan "tak memuat klien A",
// yang terbaca seperti isolasi rusak padahal yang terjadi cuma antrean penuh.
//
// Terjadi di CI (shard 5/6) sementara dev hijau — dev hanya menjalankan satu
// berkas pada satu waktu, jadi tak pernah ada pesaing.
//
// Enam digit acak cukup: peluang dua shard memilih angka sama sangat kecil,
// dan kalaupun terjadi, DELETE di beforeAll di bawah membersihkannya lebih
// dulu karena ia menyaring dengan TAG yang sama.
const TAG = `ZZISO${Math.floor(Math.random() * 900000 + 100000)}`

let companyA: string
let companyB: string
let userA: string
let authA: string
let idProyekA: string
let idProyekB: string
let idKlienA: string
let idKlienB: string
let idMilestoneB: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never
  )

const cari = (q: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/search?q=${encodeURIComponent(q)}&limit=20`,
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  // ⚠️ HANYA menyapu TAG milik run ini.
  //
  // Sempat saya ubah jadi menyapu awalan umum `ZZISO%` supaya sisa run lama
  // ikut terbuang — lalu saya batalkan sendiri: itu akan MENGHAPUS DATA SHARD
  // LAIN yang sedang berjalan, persis kelas cacat yang sudah tujuh kali
  // memerahkan CI di Fase 0 (purge `[TEST]%` dua kali di antaranya).
  //
  // Sisa run lama ditangani dengan cara yang tak menyentuh siapa pun:
  // pencarian di test ini menyaring dengan TAG unik, jadi baris run lain
  // TIDAK IKUT COCOK sama sekali — antrean hasil tak bisa penuh olehnya.
  await c.query(`DELETE FROM milestones WHERE title LIKE '${TAG}%'`)
  await c.query(`DELETE FROM projects WHERE name LIKE '${TAG}%'`)
  await c.query(`DELETE FROM clients WHERE contact_person LIKE '${TAG}%'`)
  await c.query(`DELETE FROM company_members WHERE company_id IN
    (SELECT id FROM companies WHERE code LIKE 'iso-test-%')`)
  await c.query(`ALTER TABLE companies DISABLE TRIGGER trg_company_no_casual_delete`)
  await c.query(`DELETE FROM companies WHERE code LIKE 'iso-test-%'`)
  await c.query(`ALTER TABLE companies ENABLE TRIGGER trg_company_no_casual_delete`)
}

beforeAll(async () => {
  c = await createRlsClient()
  await bersihkan()

  // Tenant A = company yang sudah ada (tenant nyata di dev).
  const { rows: co } = await c.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)
  companyA = co[0].id

  // Tenant B = tenant kedua BETULAN, berisi data lengkap. Inilah inti P2:
  // isolasi dibuktikan sebelum pelanggan kedua nyata datang.
  // `owner_user_id` WAJIB diisi, bukan opsional.
  //
  // Berkas ini men-COMMIT company kedua (tak bisa dibungkus transaksi: query
  // utamanya lewat `app.inject` yang memakai koneksi terpisah). Tanpa pemilik,
  // ia menjadi "akar grup yatim" yang terlihat oleh SELURUH test lain di
  // schema `public` — dan `t9-kelola-badan-usaha` punya asersi global
  // "setiap akar grup punya pemilik" yang langsung merah karenanya.
  //
  // Ditemukan 2026-08-03 saat sharding: keduanya kebetulan di shard 3, jadi
  // t9 melihat company milik berkas ini di tengah jalan. Berurutan tak pernah
  // ketahuan karena `bersihkan()` sudah menghapusnya sebelum t9 berjalan.
  const { rows: cb } = await c.query(
    `INSERT INTO companies (code, name, owner_user_id, created_by)
     VALUES ('iso-test-b', '${TAG} Tenant B',
             (SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
               WHERE r.name='admin' AND u.is_active ORDER BY u.created_at LIMIT 1),
             (SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
               WHERE r.name='admin' AND u.is_active ORDER BY u.created_at LIMIT 1))
     RETURNING id`)
  companyB = cb[0].id

  const { rows: ua } = await c.query(
    `SELECT u.id, u.auth_id FROM users u JOIN roles r ON r.id=u.role_id
     WHERE r.name='admin' AND u.auth_id IS NOT NULL ORDER BY u.created_at LIMIT 1`)
  userA = ua[0].id
  authA = ua[0].auth_id

  // Data tenant A
  const { rows: ka } = await c.query(
    `INSERT INTO clients (contact_person, phone, created_by, company_id)
     VALUES ('${TAG} Klien A', '0811', $1, $2) RETURNING id`, [userA, companyA])
  idKlienA = ka[0].id
  const { rows: pa } = await c.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by, company_id)
     VALUES ($1,$2,'${TAG} Proyek A','Bandung','2026-01-01','2026-12-31',$2,$3) RETURNING id`,
    [idKlienA, userA, companyA])
  idProyekA = pa[0].id

  // Data tenant B — nama sengaja memuat TAG yang sama supaya SELALU cocok
  // dengan kata kunci pencarian. Kalau scoping bocor, ia PASTI muncul.
  const { rows: kb } = await c.query(
    `INSERT INTO clients (contact_person, phone, created_by, company_id)
     VALUES ('${TAG} Klien B', '0822', $1, $2) RETURNING id`, [userA, companyB])
  idKlienB = kb[0].id
  const { rows: pb } = await c.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by, company_id)
     VALUES ($1,$2,'${TAG} Proyek B','Jakarta','2026-01-01','2026-12-31',$2,$3) RETURNING id`,
    [idKlienB, userA, companyB])
  idProyekB = pb[0].id

  const { rows: mb } = await c.query(
    `INSERT INTO milestones (project_id, title, target_date, status, created_by)
     VALUES ($1,'${TAG} Milestone B','2026-06-01','pending',$2) RETURNING id`, [idProyekB, userA])
  idMilestoneB = mb[0].id

  app = Fastify()
  await app.register(searchRoutes)
  await app.ready()

  // Sanity fixture: kalau ini gagal, kegagalan test di bawah bukan soal isolasi
  // melainkan setup — dan itu harus terlihat jelas, bukan tersamar jadi "0 hasil".
  const { rows: cek } = await c.query(
    `SELECT count(*)::int n FROM projects WHERE name LIKE $1 AND is_deleted = false`, [TAG + '%'])
  if (cek[0].n < 2) {
    throw new Error(`Fixture tidak lengkap: hanya ${cek[0].n} proyek ${TAG} (harus 2).`)
  }
}, 120_000)

afterAll(async () => {
  await bersihkan().catch(() => {})
  await app?.close()
  await c?.end()
})

// ── DIAKTIFKAN 2026-08-02 — penyebabnya BUKAN harness
//
// Test ini di-skip dengan catatan "sampai penyebab harness ditemukan".
// Menjalankannya tanpa `.skip` menunjukkan 4 dari 5 LULUS — dan yang gagal
// justru pemeriksaan POSITIF (tenant melihat datanya sendiri), bukan isolasi.
//
// Penyebabnya bug produksi: `search.ts` meminta kolom `clients.name` yang TAK
// ADA (kolomnya `company_name`/`contact_person`), sehingga SELURUH pencarian
// proyek gagal dengan "column clients_1.name does not exist" — dan errornya
// dibuang, jadi hasilnya cuma kosong. Search tak pernah menemukan proyek, di
// test MAUPUN di produksi, tanpa gejala apa pun.
//
// Keputusan "jangan longgarkan assertion, jangan push test merah" waktu itu
// BENAR: assertion positif yang dipertahankan itulah yang akhirnya
// mengungkap bugnya. Melonggarkannya akan membuat test hijau selamanya di
// atas fitur yang mati.
describe('Search global — tenant A TIDAK PERNAH melihat data tenant B', () => {
  it('proyek: hasil memuat proyek A, TIDAK memuat proyek B', async () => {
    actAs(authA)
    const r = await cari(TAG)
    expect(r.statusCode).toBe(200)
    const ids = (r.json().results as Array<{ id: string; type: string }>).map((x) => x.id)
    expect(ids).toContain(idProyekA)
    expect(ids).not.toContain(idProyekB)
  }, 30_000)

  it('klien: hasil memuat klien A, TIDAK memuat klien B', async () => {
    actAs(authA)
    const r = await cari(TAG)
    const ids = (r.json().results as Array<{ id: string }>).map((x) => x.id)
    expect(ids).toContain(idKlienA)
    expect(ids).not.toContain(idKlienB)
  }, 30_000)

  it('milestone (kategori C): milestone proyek tenant B TIDAK muncul', async () => {
    actAs(authA)
    const r = await cari(TAG)
    const ids = (r.json().results as Array<{ id: string }>).map((x) => x.id)
    expect(ids).not.toContain(idMilestoneB)
  }, 30_000)

  it('SATU PUN id milik tenant B tidak ada di hasil (jaring menyeluruh)', async () => {
    // Assertion paling penting: bukan per-tipe, tapi menyeluruh. Kalau nanti ada
    // tipe hasil BARU ditambahkan ke search dan lupa di-scope, test ini yang
    // menangkapnya — yang per-tipe di atas tidak akan tahu.
    actAs(authA)
    const r = await cari(TAG)
    const ids = new Set((r.json().results as Array<{ id: string }>).map((x) => x.id))
    const milikB = [idProyekB, idKlienB, idMilestoneB]
    const bocor = milikB.filter((id) => ids.has(id))
    expect(bocor).toEqual([])
  }, 30_000)

  it('hasil tetap BERGUNA — bukan kosong karena over-filtering', async () => {
    // Isolasi yang mengembalikan nol hasil juga "aman" tapi tak berguna.
    // Test ini memastikan scoping menyaring milik orang lain, bukan segalanya.
    actAs(authA)
    const r = await cari(TAG)
    expect((r.json().results as unknown[]).length).toBeGreaterThan(0)
  }, 30_000)
})
