import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { fetchRoleStates } from '../role-guard.js'

// ============================================================================
// `fetchRoleStates` — PENGAMBILAN state, bukan keputusannya.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TEST INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `lib/__tests__/role-guard.test.ts` menguji `findLockout()` (fungsi murni),
// dan `routes/v1/__tests__/anti-lockout-wiring.test.ts` menguji bahwa endpoint
// benar-benar memanggil penjaganya. Di antara keduanya ada `fetchRoleStates` —
// yang menyiapkan bahan bagi keputusan itu — dan sampai 2026-08-27 ia **tak
// punya satu pun test**.
//
// Celahnya terbukti, bukan diduga. Mutasi sengaja pada hari itu:
//
//     buang `roleIdSedangDiubah` dari himpunan peran yang diambil
//        → 15 test anti-lockout & role-guard TETAP HIJAU
//
// Padahal akibatnya berat: `findLockout` mencari "adakah pemegang LAIN yang
// masih memegang izin ini", dan tanpa peran yang sedang diubah ikut, ia tak
// punya subjek untuk diperiksa sama sekali. Pencabutan izin kritikal lolos
// diam-diam — persis yang penjaga itu dibangun untuk cegah.
//
// Mutasi yang lebih kasar (state selalu kosong) memang merahkan 3 test, jadi
// penjaganya tidak mati total. Yang tak terjaga adalah BENTUK state-nya.
//
// ── Kenapa terhadap basis nyata
//
// Fungsi ini tak punya cabang keputusan; seluruh isinya pengambilan data.
// Mem-mock Supabase di sini berarti menguji mock, dan cacat yang hendak
// ditangkap justru cacat pengambilan (terpotong, salah saring, salah urutan).
// ============================================================================

let db: Client

beforeAll(async () => {
  db = await createRlsClient()
}, 60_000)

afterAll(async () => {
  await db?.end()
})

describe('fetchRoleStates — bahan bagi keputusan lockout', () => {
  it('hanya memulangkan peran yang PUNYA pengguna aktif', async () => {
    /*
      Peran kosong menjawab "ada pemegang lain" tanpa pernah bisa dipakai
      siapa pun, dan jawaban itulah yang mematikan penjaganya (catatan panjang
      di `role-guard.ts`, cacat 2026-08-14).
    */
    const states = await fetchRoleStates()
    expect(states.length).toBeGreaterThan(0)
    for (const s of states) {
      expect(s.activeUserCount, `role ${s.name} tak berpengguna tapi ikut`).toBeGreaterThan(0)
    }
  }, 60_000)

  it('peran YANG SEDANG DIUBAH tetap ikut meski tak berpengguna aktif', async () => {
    /*
      ⚠ INI yang lolos dari mutasi 2026-08-27.

      Ia subjek perubahannya. Tanpa ia di dalam state, `findLockout` tak punya
      apa pun untuk diperiksa dan pencabutan izin kritikal lolos tanpa gejala.

      Peran ujinya dibuat DI SINI tanpa satu pun pengguna — jadi satu-satunya
      alasan ia boleh muncul adalah karena id-nya dioper.
    */
    const nama = `__uji_state_${Date.now().toString(36)}`
    const { rows } = await db.query(
      `INSERT INTO roles (name, label, description, is_builtin)
       VALUES ($1, 'Uji State', 'role sementara test fetchRoleStates', false)
       RETURNING id`,
      [nama],
    )
    const id = rows[0].id as string

    try {
      const tanpa = await fetchRoleStates()
      expect(tanpa.some((s) => s.roleId === id),
        'role tanpa pengguna ikut padahal id-nya TIDAK dioper').toBe(false)

      const dengan = await fetchRoleStates(id)
      expect(dengan.some((s) => s.roleId === id),
        'role yang SEDANG DIUBAH tidak ikut — findLockout kehilangan subjeknya').toBe(true)
    } finally {
      await db.query('DELETE FROM role_permissions WHERE role_id = $1', [id])
      await db.query('DELETE FROM roles WHERE id = $1', [id])
    }
  }, 60_000)

  it('izin peran terbaca UTUH — tak terpotong batas 1.000 PostgREST', async () => {
    /*
      Cacat yang sudah terjadi DUA KALI di berkas ini (2026-08-14 pada
      `role_permissions`, 2026-08-27 pada `roles`): PostgREST memulangkan
      maksimal 1.000 baris tanpa galat dan tanpa penanda, sehingga peran
      terbaca `permissionKeys: []` dan penjaga menyimpulkan "tak ada yang
      kehilangan apa-apa".

      Diperiksa lewat perbandingan ke SQL langsung, bukan angka yang dipaku —
      angka yang dipaku jadi basi begitu katalog izin berubah.
    */
    const states = await fetchRoleStates()
    const terbanyak = states.reduce((a, b) =>
      b.permissionKeys.length > a.permissionKeys.length ? b : a)

    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM role_permissions WHERE role_id = $1',
      [terbanyak.roleId],
    )
    expect(terbanyak.permissionKeys.length,
      `role ${terbanyak.name}: state punya ${terbanyak.permissionKeys.length} izin, `
      + `basis punya ${rows[0].n} — selisihnya berarti pembacaan TERPOTONG`)
      .toBe(rows[0].n)
  }, 60_000)

  it('selesai jauh di bawah batas waktu — bukan sekadar benar', async () => {
    /*
      Ditambahkan 2026-08-27 sesudah perbaikan "jangan terpotong" membuat
      fungsi ini menarik SELURUH `roles` (5.754 baris) dan `role_permissions`
      (229.612) hanya untuk membuang hampir semuanya di akhir.

      Satu panggilan `assertNoCriticalLockout` lalu memakan **98 detik**, dan
      `roles-replace-all.test.ts` TIMEOUT — bukan gagal menghitung, melainkan
      tak pernah selesai. Sesudah urutannya dibalik (users dulu, lalu hanya
      peran & izin yang terpakai): 298 ms.

      Ambang 15 detik sengaja longgar — yang dijaga bukan milidetiknya,
      melainkan kembalinya pola "tarik seluruh tabel lalu buang".
    */
    const t0 = Date.now()
    await fetchRoleStates()
    const lama = Date.now() - t0
    expect(lama, `fetchRoleStates makan ${lama} ms — pola "tarik semua lalu buang" kembali?`)
      .toBeLessThan(15_000)
  }, 60_000)
})
