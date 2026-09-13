import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, wajibAda } from '../../../test-utils/rls-harness.js'

// ============================================================
// PENJAGA PERMANEN — helper RLS harus jadi InitPlan, bukan panggilan per-baris.
//
// Kelas bug yang dijaga di sini tidak menimbulkan error, tidak mengubah hasil,
// dan tidak terlihat di code review: menulis `has_permission('x')` alih-alih
// `(SELECT has_permission('x'))` di dalam policy. Keduanya bernilai sama.
// Bedanya hanya BERAPA KALI Postgres menghitungnya.
//
// Terukur di dev sebelum migration 132:
//   assembly_components (17.853 baris)   3.521 ms
//   assemblies          ( 3.038 baris)     604 ms
// Sesudah dibungkus `(SELECT ...)`:            5 ms  dan  2 ms.
//
// Tiap `has_permission()` menjalankan join 3 tabel plus `auth_role()` yang
// sendirinya menembak `users`. Dikali jumlah baris, itulah selisihnya.
//
// Kenapa ini butuh penjaga permanen dan bukan sekadar migrasi sekali jalan:
// policy BARU akan terus ditulis, dan bentuk yang salah adalah bentuk yang
// paling natural diketik. Tanpa test ini, satu policy baru sudah cukup untuk
// membuat satu tabel besar melambat ratusan kali — dan CI tetap hijau.
//
// PENGECUALIAN yang SAH: helper yang menerima KOLOM sebagai argumen
// (mis. `mandor_owns_kasbon_scope(work_scope_id)`, `project_company_id(project_id)`)
// memang HARUS dievaluasi per baris — jawabannya berbeda untuk tiap baris, jadi
// tak mungkin diangkat jadi InitPlan. Yang dijaga di sini hanya helper tanpa
// argumen kolom, yang hasilnya sama untuk seluruh statement.
// ============================================================

let c: Client

/** Helper yang hasilnya konstan sepanjang satu statement → wajib InitPlan. */
const HELPER_KONSTAN = ['has_permission', 'auth_role', 'auth_user_id', 'auth_client_id', 'auth_company_id']

beforeAll(async () => {
  c = await createRlsClient()
}, 120_000)

afterAll(async () => {
  await c?.end()
})

describe('RLS — helper konstan selalu dibungkus (SELECT ...)', () => {
  it('tak ada policy yang memanggil helper konstan secara telanjang', async () => {
    const { rows } = await c.query(
      `SELECT tablename, policyname, qual, with_check
         FROM pg_policies WHERE schemaname = 'public'`
    )

    // Buang dulu bagian yang SUDAH berbentuk (SELECT helper(...)), lalu lihat
    // apakah masih tersisa panggilan helper. Yang tersisa = per-baris.
    const sudahInitPlan = new RegExp(
      `\\(\\s*SELECT\\s+(${HELPER_KONSTAN.join('|')})\\s*\\([^()]*\\)[^()]*\\)`,
      'gi'
    )
    const telanjang = new RegExp(`(?<![.\\w])(${HELPER_KONSTAN.join('|')})\\s*\\(`, 'i')

    const pelanggar: string[] = []
    for (const r of rows) {
      for (const ekspresi of [r.qual, r.with_check]) {
        if (!ekspresi) continue
        if (telanjang.test(String(ekspresi).replace(sudahInitPlan, 'INITPLAN'))) {
          pelanggar.push(`${r.tablename}.${r.policyname}`)
          break
        }
      }
    }

    expect(
      [...new Set(pelanggar)],
      'Policy ini memanggil helper sekali PER BARIS. Bungkus dengan (SELECT ...) ' +
        'agar jadi InitPlan — lihat migration 132 untuk polanya dan angkanya.'
    ).toEqual([])
  }, 60_000)

  it('rencana query nyata benar-benar memakai InitPlan (bukan sekadar bentuk teks)', async () => {
    // Menguji bentuk teks saja bisa menipu: yang menentukan biaya adalah
    // rencana eksekusi, bukan bagaimana policy-nya ditulis. Jadi diperiksa
    // langsung ke EXPLAIN pada tabel terbesar yang punya policy tenant.
    const { rows: adaTabel } = await c.query(
      `SELECT count(*)::int n FROM assembly_components`)
    if (adaTabel[0].n === 0) return // lingkungan tanpa seed CECEP

    const authId = (await c.query(
      `SELECT u.auth_id FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'admin' AND u.auth_id IS NOT NULL AND u.is_active = true LIMIT 1`
    )).rows[0]?.auth_id
    wajibAda(authId, "user ber-auth_id")

    await c.query('BEGIN')
    try {
      await c.query("SELECT set_config('role', 'authenticated', true)")
      await c.query(
        `SELECT set_config('request.jwt.claims',
           json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
        [authId]
      )
      const plan = (await c.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM assembly_components`
      )).rows[0]['QUERY PLAN'][0]

      const teks = JSON.stringify(plan)
      expect(teks, 'rencana query tidak memakai InitPlan → helper dievaluasi per baris')
        .toContain('InitPlan')

      /*
        Ambang longgar dengan sengaja: yang ditangkap regresi kelas
        RATUSAN-KALI (~3.500 ms), bukan fluktuasi wajar mesin CI.

        WARN 1000 -> 2200 pada 2026-09-14, dan ini BUKAN pelemahan penjaga.

        Test ini merah di suite penuh (1.138 ms) lalu HIJAU 3/3 saat
        dijalankan sendiri. Diukur langsung ke basis dalam keadaan senggang,
        lima kali berturut-turut:

            658 - 657 - 657 - 656 - 658 ms

        Jadi biaya normalnya ~657 ms dan ambang lama cuma memberi jarak
        1,5x — sementara regresi yang hendak ditangkap ~5x di atas normal.
        Di bawah beban suite penuh (satu basis, ratusan berkas), 657 ms
        wajar melewati 1.000 ms tanpa ada yang rusak.

        Penjaga yang merah atas hal yang BENAR akan diabaikan seluruh
        keluarannya, lalu berhenti menjaga tanpa gejala (CLAUDE.md 8a.2).

        2.200 ms dipilih supaya tetap JAUH di bawah ~3.500 ms: regresi
        InitPlan tetap tertangkap, fluktuasi beban tidak.

        WARN DAN SATU HAL YANG JUJUR HARUS DITULIS: angka ini TIDAK
        terbukti bisa merah. Saya mencoba dua kali membuat regresinya
        dengan sengaja — melepas bungkus `(SELECT ...)` dari policy, lalu
        memakai helper VOLATILE — dan Postgres tetap membungkusnya sendiri
        (InitPlan tetap ada, 909 ms dan 1.417 ms). Jadi mutasinya TIDAK
        MENDARAT, dan hijaunya tak membuktikan apa pun.

        Yang TERBUKTI menjaga: assertion `InitPlan` di atas — struktural,
        tak terpengaruh beban, dan itulah jaring yang sesungguhnya. Angka di
        bawah jaring kedua yang batasnya diakui di sini, bukan diklaim.
      */
      expect(
        plan['Execution Time'],
        `assembly_components ${adaTabel[0].n} baris terlalu lambat — ` +
          'gejala helper RLS kembali dievaluasi per baris'
      ).toBeLessThan(2200)
    } finally {
      await c.query('ROLLBACK')
    }
  }, 120_000)
})
