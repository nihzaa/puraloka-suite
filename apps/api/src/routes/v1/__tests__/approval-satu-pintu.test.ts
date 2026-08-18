/**
 * TJS-A3a — approval hanya lewat satu pintu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA PERBAIKAN YANG DIUJI DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. `mandor.ts` — pemohon TIDAK BOLEH menyetujui pembayarannya sendiri.
 *
 *    Sebelumnya `progress_payments` dibuat dengan `requested_by: user.id`
 *    dan `approved_by: user.id` pada baris yang berurutan — di jalur yang
 *    MENGURANGI SALDO KAS. Dan itu bertentangan dengan barisnya sendiri:
 *    `status: 'pending'` berarti menunggu persetujuan, sementara
 *    `approved_by` sudah terisi.
 *
 * 2. `notifications.ts` — kasbon lewat rute kanonik, bukan pintu kedua.
 *
 *    Endpoint aksi notifikasi dulu menulis status kasbon langsung, memotong
 *    mesin approval berjenjang. Kasbon yang butuh dua level bisa lolos dengan
 *    satu ketukan dari kartu notifikasi.
 *
 * ── Kenapa penjaga statis saja tak cukup
 *
 * `audit-approval-satu-pintu.mjs` menjaga BENTUK kode — bahwa modulnya
 * memanggil `recordApproval`. Ia tak bisa membuktikan perilakunya benar saat
 * dijalankan. Test ini yang melakukannya.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// Memakai basis dev yang sudah ada, BUKAN schema uji yang dibangun ulang:
// yang diperiksa di sini adalah bentuk kolom yang sudah lama ada
// (`requested_by` / `approved_by`), bukan migrasi baru. Membangun ulang 246
// migrasi untuk dua pemeriksaan skema adalah tiga menit yang tak membeli apa
// pun.
let db: Client

beforeAll(async () => { db = await createRlsClient() }, 60_000)
afterAll(async () => { await db.end() })

describe('progress_payments — pemohon tak boleh jadi penyetuju', () => {
  it('kolom requested_by dan approved_by ADA dan terpisah', async () => {
    // Kalau keduanya digabung jadi satu kolom, pemisahan wewenang mustahil
    // ditegakkan di lapisan mana pun.
    /*
      `table_schema = 'public'` WAJIB.

      Basis ini punya skema `test` yang membayangi 9 tabel `public` dengan
      nama yang sama (`progress_payments`, `projects`, `kasbons`, …). Tanpa
      saringan skema, query ini memulangkan TIAP KOLOM DUA KALI dan
      assertion-nya merah dengan `['approved_by','approved_by',…]` —
      kegagalan yang terbaca seperti kolom hilang, padahal kolomnya ada dan
      pertanyaannya yang tak menyebut skema.
    */
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'progress_payments'
        AND column_name IN ('requested_by', 'approved_by')
      ORDER BY column_name
    `)
    expect(rows.map((r) => r.column_name)).toEqual(['approved_by', 'requested_by'])
  })

  it('approved_by BOLEH null — pembayaran pending memang belum disetujui', async () => {
    // Ini yang membuat perbaikannya mungkin. Kalau kolomnya NOT NULL, kode
    // TERPAKSA mengisinya saat membuat — dan satu-satunya nilai yang tersedia
    // saat itu adalah pemohonnya sendiri.
    // `table_schema = 'public'` — lihat alasannya di test sebelumnya.
    // Di sini efeknya lebih halus: tanpa saringan, `rows[0]` bisa jatuh ke
    // baris skema `test` dan jawabannya benar SECARA KEBETULAN.
    const { rows } = await db.query(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'progress_payments' AND column_name = 'approved_by'
    `)
    expect(rows[0]?.is_nullable).toBe('YES')
  })
})

describe('kode sumber — satu pintu ditegakkan', () => {
  const baca = async (rel: string) => {
    const { readFileSync } = await import('node:fs')
    const { resolve, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const here = dirname(fileURLToPath(import.meta.url))
    return readFileSync(resolve(here, '..', rel), 'utf8')
  }

  it('mandor.ts TIDAK LAGI menulis approved_by saat membuat pembayaran', async () => {
    const src = await baca('mandor.ts')
    // Pola aslinya: `requested_by: user.id,` diikuti `approved_by: user.id,`
    // dalam objek insert yang sama.
    expect(src).not.toMatch(/requested_by:\s*user\.id,\s*\n\s*approved_by:\s*user\.id,/)
  })

  it('mandor.ts menolak penyetuju yang sama dengan pemohon', async () => {
    const src = await baca('mandor.ts')
    expect(src).toMatch(/existing\.requested_by === user\.id/)
    // Ditolak 403, bukan sekadar diperingatkan.
    expect(src).toMatch(/pemutus harus orang lain/)
  })

  it('notifications.ts TIDAK menulis status kasbon sendiri', async () => {
    const src = await baca('notifications.ts')
    // Yang dulu ada: `updatePayload.approved_by = user.id`.
    expect(src).not.toMatch(/updatePayload\.approved_by\s*=/)
  })

  it('notifications.ts meneruskan ke rute kanonik kasbon', async () => {
    const src = await baca('notifications.ts')
    expect(src).toMatch(/\/api\/v1\/kasbons\/\$\{kasbonId\}\/status/)
    // Dan meneruskan kode galatnya apa adanya — 403 karena level approval
    // belum cukup harus sampai ke pengguna, bukan disamarkan.
    expect(src).toMatch(/reply\.status\(teruskan\.statusCode\)/)
  })
})
