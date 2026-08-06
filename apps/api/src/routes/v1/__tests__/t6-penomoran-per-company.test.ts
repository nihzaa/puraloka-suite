import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// T6 — PENOMORAN DOKUMEN PER COMPANY (migration 135).
//
// Mengganti `COUNT(*) + 1` (migrasi 041) dengan counter transaksional.
// Empat cacat yang dijaga di sini, semuanya PERNAH NYATA dan terbukti di dev:
//
//   1. Nomor berlanjut lintas company — company A dapat MR-2026-006, company B
//      berikutnya MR-2026-007. Selain salah secara akuntansi, dari lompatan
//      nomor itu tenant B bisa menyimpulkan volume dokumen tenant A.
//   2. Nomor dipakai ulang setelah penghapusan — COUNT(*) menghitung yang ADA,
//      bukan yang PERNAH ada. Untuk PO ke supplier / invoice ke klien, nomor
//      kembar adalah cacat audit.
//   3. Balapan — dua INSERT bersamaan membaca COUNT yang sama.
//   4. UNIQUE global pada nomor — membuat penomoran per-company mustahil,
//      karena dua tenant WAJIB boleh sama-sama punya MR-2026-001.
//
// Semua di dalam satu transaksi yang di-ROLLBACK; dev tidak berubah.
// ============================================================

let c: Client
let userId: string
let companyA: string
let companyB: string
let proyekA: string
let proyekB: string

const nomorUrut = (s: string) => Number(s.split('-').pop())

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  userId = (await c.query(`SELECT id FROM users LIMIT 1`)).rows[0].id
  companyA = (await c.query(
    `SELECT id FROM companies ORDER BY created_at LIMIT 1`)).rows[0].id
  proyekA = (await c.query(
    `SELECT id FROM projects WHERE company_id = $1 LIMIT 1`, [companyA])).rows[0].id

  companyB = (await c.query(
    `INSERT INTO companies (code, name, owner_user_id) VALUES ('uji-t6-nomor', 'Tenant B (T6)', (SELECT id FROM users ORDER BY created_at LIMIT 1))
     RETURNING id`)).rows[0].id
  const klienB = (await c.query(
    `INSERT INTO clients (contact_person, phone, created_by, company_id)
     VALUES ('[UJI-T6] Klien B', '08', $1, $2) RETURNING id`, [userId, companyB]
  )).rows[0].id
  proyekB = (await c.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date,
                           created_by, company_id)
     VALUES ($1, $2, '[UJI-T6] Proyek B', 'Jakarta', '2026-01-01', '2026-12-31', $2, $3)
     RETURNING id`, [klienB, userId, companyB]
  )).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

const buatMR = async (projectId: string): Promise<{ id: string; mr_number: string }> =>
  (await c.query(
    `INSERT INTO material_requests (project_id, requested_by, status)
     VALUES ($1, $2, 'draft') RETURNING id, mr_number`, [projectId, userId]
  )).rows[0]

describe('T6 — nomor terpisah per company', () => {
  it('tenant baru mulai dari 001, tidak melanjutkan hitungan tenant lain', async () => {
    // Inti T6. Kalau ini gagal, nomor dokumen tenant B membocorkan berapa
    // banyak dokumen yang sudah dibuat tenant A.
    const b1 = await buatMR(proyekB)
    expect(
      nomorUrut(b1.mr_number),
      `tenant baru mendapat ${b1.mr_number} — melanjutkan hitungan tenant lain`
    ).toBe(1)
  }, 60_000)

  it('nomor kedua tenant berjalan independen', async () => {
    const a1 = await buatMR(proyekA)
    const b1 = await buatMR(proyekB)
    const a2 = await buatMR(proyekA)
    const b2 = await buatMR(proyekB)

    // Masing-masing naik satu terhadap dirinya sendiri, bukan terhadap yang lain.
    expect(nomorUrut(a2.mr_number)).toBe(nomorUrut(a1.mr_number) + 1)
    expect(nomorUrut(b2.mr_number)).toBe(nomorUrut(b1.mr_number) + 1)
  }, 60_000)

  it('dua tenant BOLEH punya nomor dokumen yang sama', async () => {
    // Cacat #4: `UNIQUE (mr_number)` global membuat ini mustahil, dan karenanya
    // membuat penomoran per-company mustahil juga. Diuji langsung, bukan lewat
    // membaca definisi constraint — yang diuji adalah apakah INSERT-nya lolos.
    //
    // ⚠️ Versi sebelumnya hanya MEMBANDINGKAN nomor yang KEBETULAN sudah ada,
    // lalu menuntut ada yang beririsan. Itu membuat hasilnya bergantung isi
    // database: hijau di dev (banyak data, irisan tak terhindarkan), MERAH di
    // CI yang datanya bersih — dan merahnya menuduh constraint, padahal
    // testnya yang tak berdaya.
    //
    // Sekarang test MEMBUAT SENDIRI kondisi yang diuji: kedua tenant didorong
    // sampai punya nomor yang sama persis. Kalau constraint global masih ada,
    // INSERT-nya yang gagal — dan itulah kegagalan yang benar.
    const kejarSampaiSama = async (): Promise<string> => {
      // Naikkan yang tertinggal sampai keduanya bertemu di nomor yang sama.
      for (let i = 0; i < 40; i++) {
        const a = await buatMR(proyekA)
        const b = await buatMR(proyekB)
        if (a.mr_number === b.mr_number) return a.mr_number
        // Kejar yang lebih kecil supaya keduanya bertemu, bukan makin jauh.
        while (nomorUrut(a.mr_number) < nomorUrut(b.mr_number)) {
          const lagi = await buatMR(proyekA)
          if (lagi.mr_number === b.mr_number) return lagi.mr_number
          a.mr_number = lagi.mr_number
        }
        while (nomorUrut(b.mr_number) < nomorUrut(a.mr_number)) {
          const lagi = await buatMR(proyekB)
          if (lagi.mr_number === a.mr_number) return lagi.mr_number
          b.mr_number = lagi.mr_number
        }
      }
      return ''
    }

    const sama = await kejarSampaiSama()
    expect(sama,
      'kedua tenant tak pernah mencapai nomor yang sama dalam 40 percobaan — ' +
      'kemungkinan constraint global masih memaksa nomor unik lintas tenant, ' +
      'atau format nomornya memuat pembeda yang membuat tabrakan mustahil'
    ).not.toBe('')

    // Buktikan keduanya benar-benar ADA dengan nomor itu — di tenant berbeda.
    const { rows } = await c.query(
      `SELECT count(DISTINCT project_id)::int n FROM material_requests
        WHERE mr_number = $1 AND project_id IN ($2, $3)`, [sama, proyekA, proyekB])
    expect(rows[0].n,
      `nomor ${sama} tak dimiliki kedua tenant sekaligus`).toBe(2)
  }, 120_000)
})

describe('T6 — nomor tak pernah dipakai ulang', () => {
  it('menghapus dokumen TIDAK membuat nomornya lahir kembali', async () => {
    // Cacat #2. Lubang pada urutan nomor adalah perilaku yang BENAR: dokumen
    // resmi yang sudah terbit tak boleh punya kembaran, bahkan bila dibatalkan.
    const dihapus = await buatMR(proyekA)
    await c.query(`DELETE FROM material_requests WHERE id = $1`, [dihapus.id])
    const berikutnya = await buatMR(proyekA)

    expect(
      berikutnya.mr_number,
      `nomor ${dihapus.mr_number} dipakai ulang setelah dokumennya dihapus`
    ).not.toBe(dihapus.mr_number)
    expect(nomorUrut(berikutnya.mr_number)).toBeGreaterThan(nomorUrut(dihapus.mr_number))
  }, 60_000)
})

describe('T6 — fail-loud, tidak menebak', () => {
  it('next_document_number() menolak company_id NULL', async () => {
    // Menomori dokumen tanpa tahu pemiliknya = menaruhnya di urutan milik tenant
    // lain, persis masalah yang T6 tutup. Harus gagal keras, bukan diam-diam
    // memakai urutan sembarang.
    await c.query('SAVEPOINT t6null')
    await expect(
      c.query(`SELECT next_document_number(NULL, 'mr', '2026')`)
    ).rejects.toThrow()
    await c.query('ROLLBACK TO SAVEPOINT t6null')
  }, 60_000)
})

describe('T6 — invoice: counter tak boleh tabrakan dgn nomor yang sudah beredar', () => {
  it('counter invoice >= nomor tertinggi yang sudah ada di tahun itu', async () => {
    // Invoice punya kerumitan yang MR/PO/GR tidak punya: formatnya pernah
    // berubah. Data lama di dev seluruhnya `INV/PRL/YYYY/NNN` (tahunan),
    // sementara kode sekarang menghasilkan `INV/YYYY/MM/NNN` (bulanan).
    //
    // Kalau sinkronisasi hanya mengenali format baru, counter bulan mana pun
    // mulai dari 0 → invoice berikutnya bernomor 001, bertabrakan dengan nomor
    // lama yang SUDAH TERKIRIM ke klien. Ini menangkap persis itu.
    const tertinggiLama = (await c.query(
      `SELECT max(NULLIF(regexp_replace(invoice_number, '^.*/', ''), '')::BIGINT) n
         FROM invoices
        WHERE project_company_id(project_id) = $1
          AND invoice_number ~ '/2026/'`, [companyA]
    )).rows[0].n
    if (tertinggiLama === null) return // lingkungan tanpa invoice 2026

    const { rows } = await c.query(
      `SELECT period, last_number FROM document_number_series
        WHERE company_id = $1 AND doc_type = 'invoice' AND period LIKE '2026-%'`,
      [companyA]
    )
    expect(rows.length, 'counter invoice 2026 tidak tersinkron sama sekali').toBeGreaterThan(0)
    for (const r of rows) {
      expect(
        Number(r.last_number),
        `counter ${r.period} = ${r.last_number}, sementara invoice ${tertinggiLama} ` +
          'sudah beredar — invoice berikutnya akan bernomor kembar'
      ).toBeGreaterThanOrEqual(Number(tertinggiLama))
    }
  }, 60_000)
})

describe('T6 — counter tersinkron dengan dokumen lama', () => {
  it('counter >= nomor tertinggi yang sudah ada, per company', async () => {
    // Kalau counter mulai dari nol sementara dokumen lama sudah memakai 001-00N,
    // dokumen berikutnya bertabrakan dengan yang lama. Migrasi menyelaraskannya
    // dari MAX (bukan COUNT) supaya nomor yang pernah terpakai lalu dihapus
    // tidak lahir kembali.
    const { rows } = await c.query(
      `SELECT s.company_id, s.last_number,
              (SELECT max(NULLIF(regexp_replace(m.mr_number, '^.*-', ''), '')::BIGINT)
                 FROM material_requests m
                WHERE project_company_id(m.project_id) = s.company_id
                  AND m.mr_number ~ '^MR-[0-9]{4}-[0-9]+$') AS tertinggi
         FROM document_number_series s
        WHERE s.doc_type = 'mr'`
    )
    for (const r of rows) {
      if (r.tertinggi === null) continue
      expect(
        Number(r.last_number),
        `counter (${r.last_number}) tertinggal di belakang nomor dokumen yang ` +
          `sudah ada (${r.tertinggi}) — dokumen berikutnya akan bertabrakan`
      ).toBeGreaterThanOrEqual(Number(r.tertinggi))
    }
  }, 60_000)
})
