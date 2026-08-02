import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, closeTestClient } from '../../../test-utils/test-db'

// ═════════════════════════════════════════════════════════════════════════════
// FUNGSI TRIGGER TANPA TRIGGER — "berhasil tanpa melakukan apa-apa".
//
// ── Kelas cacat yang sudah menggigit TIGA KALI
//
// Fungsi `RETURNS trigger` lengkap dan benar di `pg_proc`, tapi tak ada
// `pg_trigger` yang memanggilnya. Ia tak pernah dieksekusi sekali pun.
//
// Tak ada gejala apa pun: request tetap 200, data tetap tersimpan, laporan
// tetap terbit — hanya angkanya diam. Grep pada kode aplikasi tak menemukannya
// karena tak ada kode aplikasi yang terlibat.
//
//   migrasi 161  fn_update_main_cash_on_expense        — belum menggigit
//   migrasi 162  fn_update_cash_balance_on_payment     — Rp 627.075.000
//   migrasi 164  4 fungsi uang mandor sekaligus        — Rp  67.600.000
//
// ── Kenapa test, bukan skrip statis
//
// Pertanyaannya bukan "apakah `CREATE TRIGGER` tertulis di suatu migrasi" —
// untuk keempat kasus di atas jawabannya YA, dan tetap saja tak terpasang.
// Yang harus dijawab: apakah setiap fungsi trigger benar-benar punya pemanggil
// DI DATABASE YANG DIPAKAI. Hanya database sungguhan yang bisa menjawab itu.
//
// ── Kenapa schema `public`, bukan schema test
//
// Yang diperiksa keadaan NYATA database, bukan hasil menjalankan ulang rantai
// migrasi. Membangun ulang seluruh rantai di schema test tak mungkin: sebagian
// migrasi memverifikasi keadaan RLS yang menurut desain hanya benar di
// `public` (132 menolak jalan di luar sana), dan sebagian lain menyentuh
// `storage.objects` yang global.
//
// Lagi pula "rantai migrasi menghasilkan struktur yang benar" BUKAN
// pertanyaannya — untuk keempat cacat di atas rantainya memang benar. Yang
// salah adalah apa yang benar-benar ada di database. Itu yang diperiksa di
// sini: di CI schema `public` milik project Supabase CI, di lokal schema
// `public` milik dev.
//
// ── Ambang
//
// NOL di luar daftar kecuali. Setiap pengecualian menyebutkan alasannya, jadi
// fungsi yatim yang baru tak bisa masuk diam-diam.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Fungsi `RETURNS trigger` yang memang TIDAK dipasang sebagai trigger,
 * beserta alasannya.
 */
const DIKECUALIKAN = new Map([
  ['protect_created_at',
   'dipasang selektif per-tabel oleh migrasi lain; di subset mana pun bisa saja ' +
   'belum ada tabel yang memakainya'],
  ['protect_assets_created_at',
   'sama seperti protect_created_at, untuk tabel aset'],
  ['set_assets_updated_at',
   'sama — helper updated_at untuk tabel aset'],
])

let client: Client

beforeAll(async () => {
  // TANPA `resetTestSchema()` — yang diperiksa `public`, bukan schema test.
  client = await createTestClient()
})

afterAll(async () => { await closeTestClient(client) })

describe('Fungsi trigger wajib punya pemanggil', () => {
  it('nol fungsi `RETURNS trigger` tanpa trigger yang memakainya', async () => {
    const { rows } = await client.query(`
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prorettype = 'trigger'::regtype
         AND NOT EXISTS (
           SELECT 1 FROM pg_trigger t
            WHERE t.tgfoid = p.oid AND NOT t.tgisinternal
         )
       ORDER BY p.proname
    `)

    const yatim = rows
      .map(r => r.proname as string)
      .filter(nama => !DIKECUALIKAN.has(nama))

    expect(
      yatim,
      `Fungsi trigger tanpa pemanggil: ${yatim.join(', ')}\n\n` +
        'Fungsi ini tak akan pernah dieksekusi — dan tak ada gejala apa pun ' +
        'saat itu terjadi: request tetap 200, data tetap tersimpan, hanya ' +
        'efeknya yang tak ada. Tiga kali kelas cacat ini menggigit repo ini ' +
        '(migrasi 161, 162, 164), dua di antaranya menahan uang sungguhan.\n\n' +
        'Kalau memang disengaja, tambahkan ke DIKECUALIKAN di file ini beserta ' +
        'alasannya.',
    ).toEqual([])
  })

  it('daftar kecuali tak memuat fungsi yang menyentuh uang', async () => {
    // Penjaga untuk penjaganya sendiri: cara termudah membuat test di atas
    // hijau adalah menambahkan nama ke DIKECUALIKAN. Itu sah untuk helper
    // seperti `protect_created_at`, tapi TIDAK untuk apa pun yang menyentuh
    // saldo — dan justru itu yang paling menggoda saat sedang buru-buru.
    const mencurigakan = [...DIKECUALIKAN.keys()].filter(n =>
      /cash|saldo|balance|payment|kasbon|expense|invoice|settle/i.test(n),
    )

    expect(
      mencurigakan,
      `Fungsi yang menyentuh uang ada di daftar kecuali: ${mencurigakan.join(', ')}. ` +
        'Fungsi uang tak boleh dikecualikan — pasang trigger-nya.',
    ).toEqual([])
  })
})
