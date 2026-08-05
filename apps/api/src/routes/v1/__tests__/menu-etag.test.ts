import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import menuRoutes from '../menu.js'

// ============================================================
// ETAG MENU — 57 KB yang tak perlu dikirim ulang, dan bahaya
// yang muncul kalau caranya salah.
//
// Katalog menu (249 baris ≈ 57 KB JSON) adalah muatan terbesar di seluruh
// aplikasi — lebih besar dari data bisnis mana pun — dan sidebar
// mengambilnya ulang di SETIAP halaman untuk merevalidasi cache
// localStorage-nya. Isinya berubah saat rilis menambah menu, bukan saat
// orang bekerja.
//
// ── Kenapa ini diuji, bukan sekadar dipasang
//
// ETag yang di-hash dari katalog MENTAH akan terlihat bekerja sempurna di
// lingkungan pengembangan (satu perusahaan) dan lulus setiap pemeriksaan
// yang menghitung byte. Cacatnya baru muncul saat perusahaan kedua ada:
// dua tenant menerima ETag yang sama, tenant kedua dibalas 304, dan
// peramban menyajikan menu tenant PERTAMA dari cache-nya.
//
// Tak ada pesan galat. Tak ada baris log. Yang terjadi hanya satu
// perusahaan melihat struktur menu perusahaan lain.
//
// Karena itu test yang penting di berkas ini bukan "304 menghemat byte",
// melainkan "dua tenant dengan pengecualian berbeda TIDAK PERNAH berbagi
// ETag". Yang pertama soal kecepatan; yang kedua soal isolasi tenant, dan
// isolasi tenant ada di ember [C] — tak boleh dikompromikan demi kecepatan.
// ============================================================

let app: FastifyInstance
let c: Client
let userA: string
let userB: string
let companyB: string
let kunciDisembunyikan: string

const actAs = (authId: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: authId } }, error: null } as never)

const ambil = (headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: '/api/v1/menu', headers: { authorization: 'Bearer t', ...headers } })

/** Fixture yang dibuat berkas ini dan wajib dibersihkan sendiri. */
let userBuatan: string | null = null
let anggotaBuatan: string | null = null

beforeAll(async () => {
  c = await createRlsClient()

  // Syarat kelayakan diambil dari `resolveCompanyId()`, bukan ditebak:
  // ia menyaring `is_active = true`, dan `authenticate()` menuntut
  // `users.role_id` terisi. Kandidat yang hanya "punya baris di
  // company_members" dibalas 403 — pernah terjadi di berkas ini.
  const a = await c.query(
    `SELECT u.auth_id, cm.company_id, cm.role_id
       FROM company_members cm JOIN users u ON u.id = cm.user_id
      WHERE u.auth_id IS NOT NULL AND cm.is_active AND u.role_id IS NOT NULL
      LIMIT 1`)
  userA = a.rows[0].auth_id
  const companyA = a.rows[0].company_id

  // Perusahaan kedua dengan anggotanya sendiri.
  //
  // Basis dev punya SATU perusahaan beranggota, jadi test yang menunggu
  // tenant kedua muncul sendiri akan melewati pemeriksaan terpentingnya
  // selamanya — hijau tanpa menguji apa pun. Fixture-nya dibuat di sini,
  // lalu dibongkar di `afterAll`.
  const adaB = await c.query(
    `SELECT u.auth_id, cm.company_id
       FROM company_members cm JOIN users u ON u.id = cm.user_id
      WHERE u.auth_id IS NOT NULL AND cm.is_active AND u.role_id IS NOT NULL
        AND cm.company_id <> $1 LIMIT 1`, [companyA])

  if (adaB.rows[0]) {
    userB = adaB.rows[0].auth_id
    companyB = adaB.rows[0].company_id
  } else {
    // Sengaja TANPA `ON CONFLICT DO UPDATE`: kalau run sebelumnya mati sebelum
    // teardown, `DO UPDATE` akan memungut perusahaan lama itu tanpa mengisi
    // `userBuatan` — dan cleanup di `afterAll` dilewati karena bergantung
    // padanya. Fixture jadi permanen, persis kegagalan yang sudah terjadi.
    // Sisa dari run yang mati dibongkar dulu, lalu dibuat baru.
    const lama = await c.query(`SELECT id FROM companies WHERE code = 'uji-etag-menu'`)
    if (lama.rows[0]) {
      const idLama = lama.rows[0].id
      await c.query(`DELETE FROM company_menu_settings WHERE company_id = $1`, [idLama])
      await c.query(`DELETE FROM company_members WHERE company_id = $1`, [idLama])
      await c.query(`DELETE FROM users WHERE email LIKE 'uji-etag-%@example.test'`)
      await c.query(`SET session_replication_role = 'replica'`)
      await c.query(`DELETE FROM companies WHERE id = $1`, [idLama])
      await c.query(`SET session_replication_role = 'origin'`)
    }

    companyB = (await c.query(
      `INSERT INTO companies (code, name) VALUES ('uji-etag-menu', '[TEST] Tenant ETag')
       RETURNING id`)).rows[0].id

    const authB = (await c.query(`SELECT gen_random_uuid() id`)).rows[0].id

    // Peran NON-ADMIN, sengaja.
    //
    // Versi pertama menyalin `role_id` kandidat pertama — yang kebetulan
    // admin. Akibatnya `recipient-resolution` MERAH di CI: ia menghitung
    // admin secara GLOBAL lalu membandingkannya dengan penerima yang
    // dibatasi satu company. User admin di company kedua masuk hitungan
    // pertama, tidak masuk yang kedua → "expected 1 to be 2".
    //
    // Peran user ini tak relevan bagi test ETag — ia hanya perlu melewati
    // `authenticate`. Jadi diambil peran yang paling tak berdampak.
    const roleId = (await c.query(
      `SELECT id FROM roles WHERE name <> 'admin' ORDER BY name LIMIT 1`)).rows[0]?.id
      ?? a.rows[0].role_id
    userBuatan = (await c.query(
      `INSERT INTO users (auth_id, name, email, role_id)
       VALUES ($1, '[TEST] ETag', $2, $3) RETURNING id`,
      [authB, `uji-etag-${authB}@example.test`, roleId])).rows[0].id

    anggotaBuatan = (await c.query(
      `INSERT INTO company_members (company_id, user_id, role_id, is_active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [companyB, userBuatan, roleId])).rows[0].id

    userB = authB
  }

  app = Fastify()
  await app.register(menuRoutes)
  await app.ready()
}, 180_000)

afterAll(async () => {
  if (companyB && kunciDisembunyikan) {
    await c?.query(
      `DELETE FROM company_menu_settings WHERE company_id = $1 AND menu_key = $2`,
      [companyB, kunciDisembunyikan]).catch(() => {})
  }
  // Urutan terbalik dari pembuatan — anggota lebih dulu, lalu user, lalu
  // perusahaan.
  //
  // Fixture yang tertinggal BUKAN gangguan kecil: sudah terbukti membuat
  // `submittal-aturan` dan `t9-kelola-badan-usaha` merah, karena keduanya
  // memeriksa integritas per-company dan tiba-tiba melihat tenant yang tak
  // punya rantai approval maupun pemilik grup. Dua test merah karena sebab
  // yang sama sekali tak berhubungan dengan yang mereka uji.
  if (anggotaBuatan) await c?.query(`DELETE FROM company_members WHERE id = $1`, [anggotaBuatan]).catch(() => {})
  if (userBuatan) await c?.query(`DELETE FROM users WHERE id = $1`, [userBuatan]).catch(() => {})
  if (userBuatan && companyB) {
    // `companies` dilindungi trigger off-boarding — penghapusan tenant lewat
    // aplikasi memang HARUS ditolak (kehilangan data lintas puluhan tabel,
    // tak bisa di-rollback). Untuk membongkar fixture uji, trigger dimatikan
    // HANYA di sesi ini; perilaku produksi tak tersentuh. Pola yang sama
    // dipakai `ahsp-endpoint.test.ts`.
    await c?.query(`SET session_replication_role = 'replica'`).catch(() => {})
    await c?.query(`DELETE FROM companies WHERE id = $1`, [companyB]).catch(() => {})
    await c?.query(`SET session_replication_role = 'origin'`).catch(() => {})
  }
  await app?.close()
  await c?.end()
})

describe('ETag menu', () => {
  it('permintaan pertama membalas 200 + ETag', async () => {
    actAs(userA)
    const r = await ambil()
    expect(r.statusCode).toBe(200)
    expect(r.headers.etag).toMatch(/^W\/"/)
  })

  it('If-None-Match yang cocok membalas 304 dengan badan kosong', async () => {
    actAs(userA)
    const pertama = await ambil()
    const kedua = await ambil({ 'if-none-match': pertama.headers.etag as string })

    expect(kedua.statusCode).toBe(304)
    // Inti penghematannya: 304 harus benar-benar TANPA badan. 304 yang tetap
    // mengirim 57 KB adalah header yang lebih sopan, bukan optimasi.
    expect(kedua.body).toBe('')
    expect(pertama.body.length).toBeGreaterThan(1000)
  })

  it('ETag yang tak cocok membalas 200 penuh, bukan 304', async () => {
    actAs(userA)
    const r = await ambil({ 'if-none-match': 'W/"basi"' })
    expect(r.statusCode).toBe(200)
    expect(JSON.parse(r.body).menu.length).toBeGreaterThan(0)
  })

  it('Cache-Control private — proxy bersama tak boleh menyimpan menu tenant', async () => {
    actAs(userA)
    const r = await ambil()
    // Tanpa `private`, CDN atau proxy perusahaan boleh menyimpan balasan satu
    // tenant dan menyajikannya ke tenant lain. Isolasi tenant hilang di lapis
    // yang tak terlihat sama sekali dari kode aplikasi.
    expect(r.headers['cache-control']).toContain('private')
  })

  it('dua tenant dengan menu berbeda TIDAK berbagi ETag', async () => {
    // Tak ada cabang "dilewati" di sini. `beforeAll` MEMBUAT tenant kedua bila
    // basisnya belum punya, justru supaya pemeriksaan ini tak pernah bisa
    // hijau tanpa benar-benar berjalan.
    actAs(userA)
    const a1 = await ambil()

    // Sembunyikan satu menu HANYA untuk perusahaan B. Muatan keduanya kini
    // berbeda, jadi ETag-nya wajib berbeda.
    kunciDisembunyikan = JSON.parse(a1.body).menu[0].key
    await c.query(
      `INSERT INTO company_menu_settings (company_id, menu_key, is_hidden)
       VALUES ($1, $2, true)
       ON CONFLICT (company_id, menu_key) DO UPDATE SET is_hidden = true`,
      [companyB, kunciDisembunyikan])

    actAs(userB)
    const b1 = await ambil()

    expect(b1.headers.etag).not.toBe(a1.headers.etag)

    // Dan yang paling menentukan: ETag milik A disodorkan sebagai user B
    // harus tetap membalas 200 penuh. Kalau ini 304, peramban B akan memakai
    // menu A dari cache-nya — bocornya tenant lewat cache, tanpa satu pun
    // galat yang bisa dilihat siapa pun.
    const b2 = await ambil({ 'if-none-match': a1.headers.etag as string })
    expect(b2.statusCode).toBe(200)

    const kunciB = JSON.parse(b2.body).menu.map((m: { key: string }) => m.key)
    expect(kunciB).not.toContain(kunciDisembunyikan)
  })
})
