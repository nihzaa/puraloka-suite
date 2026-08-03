import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'

// ============================================================================
// F1-1 — IDEMPOTENCY: jaminan tingkat DATABASE, bukan sekadar kode.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA DIUJI DI LEVEL DB, BUKAN LEWAT HTTP
// ══════════════════════════════════════════════════════════════════════════
//
// Yang benar-benar mencegah pembayaran ganda bukan `if` di handler, melainkan
// constraint `idempotency_unik (company_id, operasi, kunci)`. Kode bisa
// direfaktor, urutan pemeriksaan bisa bergeser, `await` bisa hilang — dan
// semuanya lolos test HTTP yang hanya memanggil endpoint sekali.
//
// Yang TIDAK bisa bergeser adalah constraint. Menguji di sini berarti menguji
// hal yang benar-benar menjaga.
//
// Uji HTTP-nya tetap ada nilainya (wiring), tetapi ia butuh invoice+kas nyata
// dan multipart — fixture yang mahal, dan kegagalannya akan menyamar sebagai
// kegagalan idempotensi. Wiring dijaga terpisah oleh pembacaan kode + tsc.
//
// ── Yang dibuktikan
//
//   1. Kunci yang sama untuk operasi & company yang sama → DITOLAK (23505)
//   2. Kunci sama di company LAIN → diterima (isolasi tenant benar)
//   3. Kunci sama untuk operasi LAIN → diterima (tak salah tolak)
//   4. Hasil respons pertama tersimpan utuh & bisa dibalas ulang
//
// Poin 2 dan 3 sama pentingnya dengan poin 1: mekanisme yang menolak terlalu
// banyak akan menolak transaksi sah, dan itu kerusakan — bukan keamanan.
//
// Seluruhnya di dalam transaksi yang di-ROLLBACK. Berkas ini menulis ke schema
// `public` bersama, dan empat kali dalam sesi ini cacat isolasi antar-shard
// berakar pada test yang meninggalkan jejak (F0-14, F0-16, iso-test-b, purge).
// ============================================================================

let c: Client
let companyA: string
let companyB: string

/** INSERT ber-savepoint: galat constraint tak boleh menggugurkan transaksi induk. */
async function coba(companyId: string, operasi: string, kunci: string): Promise<string> {
  await c.query('SAVEPOINT s')
  try {
    await c.query(
      `INSERT INTO idempotency_keys (company_id, operasi, kunci, status_http, hasil)
       VALUES ($1, $2, $3, 201, '{"ok":true}'::jsonb)`,
      [companyId, operasi, kunci],
    )
    await c.query('RELEASE SAVEPOINT s')
    return 'OK'
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT s')
    return (e as { code?: string }).code ?? 'ERR'
  }
}

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  companyA = (await c.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1`,
  )).rows[0].id

  // Company kedua dibuat DI DALAM transaksi — tak pernah terlihat sesi lain,
  // jadi tak bisa memicu benturan lintas-shard seperti yang terjadi empat kali
  // sebelumnya.
  companyB = (await c.query(
    `INSERT INTO companies (code, name, owner_user_id, created_by)
     VALUES ('uji-idem-b', '[UJI-F1-1] Tenant B',
             (SELECT owner_user_id FROM companies WHERE id = $1),
             (SELECT owner_user_id FROM companies WHERE id = $1))
     RETURNING id`, [companyA],
  )).rows[0].id
}, 120_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

describe('F1-1 — idempotency_keys mencegah operasi uang terjadi dua kali', () => {
  it('kunci pertama diterima', async () => {
    expect(await coba(companyA, 'finance:invoice:pay', 'KUNCI-1')).toBe('OK')
  }, 30_000)

  it('KUNCI YANG SAMA ditolak — inilah yang mencegah pembayaran ganda', async () => {
    // 23505 = unique_violation. Kalau ini pernah berubah jadi 'OK', satu tombol
    // yang ditekan dua kali kembali menghasilkan dua pembayaran + dua
    // pergerakan kas, tanpa galat dan tanpa gejala.
    expect(await coba(companyA, 'finance:invoice:pay', 'KUNCI-1'),
      'DUPLIKAT LOLOS — jaminan idempotensi tidak aktif').toBe('23505')
  }, 30_000)

  it('kunci sama di company LAIN diterima (isolasi tenant)', async () => {
    // Dua perusahaan boleh memakai kunci yang sama; mereka tak saling kenal.
    // Kalau ini ditolak, tenant kedua akan gagal membayar hanya karena tenant
    // pertama kebetulan memakai kunci bernama sama.
    expect(await coba(companyB, 'finance:invoice:pay', 'KUNCI-1')).toBe('OK')
  }, 30_000)

  it('kunci sama untuk OPERASI lain diterima (tak salah tolak)', async () => {
    // Kunci yang sama untuk aksi berbeda bukan pengulangan.
    expect(await coba(companyA, 'finance:invoice:refund', 'KUNCI-1')).toBe('OK')
  }, 30_000)

  it('hasil respons pertama tersimpan utuh — bisa dibalas ulang', async () => {
    // Idempotensi bukan sekadar "tolak yang kedua". Pemanggil yang kehilangan
    // respons pertama (timeout, koneksi putus) HARUS bisa mendapatkannya lagi —
    // kalau tidak, ia akan mencoba lagi dengan kunci baru, dan itu justru
    // menggandakan.
    const { rows } = await c.query(
      `SELECT status_http, hasil FROM idempotency_keys
        WHERE company_id=$1 AND operasi='finance:invoice:pay' AND kunci='KUNCI-1'`,
      [companyA],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].status_http).toBe(201)
    expect(rows[0].hasil).toEqual({ ok: true })
  }, 30_000)

  it('constraint-nya benar-benar ada di katalog (bukan hanya perilaku kebetulan)', async () => {
    // Menguji perilakunya saja tak cukup: kalau constraint hilang tapi kebetulan
    // tak ada yang menabraknya saat test berjalan, semua kasus di atas tetap
    // hijau. Ini memeriksa penyebabnya, bukan gejalanya.
    const { rows } = await c.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'idempotency_unik'
          AND conrelid = to_regclass(current_schema() || '.idempotency_keys')`)
    expect(rows, 'constraint idempotency_unik HILANG').toHaveLength(1)
    expect(rows[0].def).toMatch(/UNIQUE.*company_id.*operasi.*kunci/i)
  }, 30_000)
})
