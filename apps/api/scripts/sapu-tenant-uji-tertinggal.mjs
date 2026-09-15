#!/usr/bin/env node
/**
 * PENYAPU — menonaktifkan tenant uji `[UJI-*]` yang tertinggal AKTIF.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `bongkarCompanyUji()` sudah benar dan dipakai setiap berkas yang membuat
 * tenant uji — diverifikasi 2026-09-15: enam pemanggilan, dan tiga berkas
 * lain yang menyebut nama `[UJI-*]` ternyata hanya menyebutnya di KOMENTAR.
 *
 * Yang tak bisa ditangani helper itu: run yang **mati sebelum `afterAll`**.
 * Migrasi yang HARD FAIL, tripwire yang exit 1, runner yang dibatalkan —
 * semuanya meninggalkan tenant AKTIF tanpa pemilik, dan gejalanya muncul di
 * berkas yang tak pernah membuatnya:
 *
 *     ❌ 3 akar grup AKTIF tanpa pemilik:
 *        [UJI-BACASAJA] PT Uji Baca Saja
 *        [UJI-GERBANG] PT Uji Gerbang Modul
 *        [UJI-KUOTA] PT Uji Kuota Simpan
 *
 * Diukur di basis CI 2026-09-15, tepat sesudah dua run saya sendiri gagal
 * (migrasi 579, lalu tripwire FORCE RLS). Residunya bertahan, lalu
 * memerahkan ENAM shard pada run berikutnya — kegagalan yang menuduh
 * penjaga, padahal yang salah sisa run sebelumnya.
 *
 * ── Kenapa MENYAPU, bukan melonggarkan penjaganya
 *
 * `audit-akar-grup-punya-pemilik.mjs` sengaja TIDAK punya pengecualian
 * `[UJI-*]`: akar grup yatim yang NYATA adalah cacat produk (grup tanpa
 * pemilik tak bisa ditambahi badan usaha lewat UI). Menambahkan pengecualian
 * nama di sana berarti penjaga itu berhenti melihat kelas yang sama begitu
 * seseorang menamai tenant nyata dengan awalan yang mirip.
 *
 * Jadi yang dibersihkan RESIDUNYA, dan penjaganya tetap ambang NOL.
 *
 * ── Batas yang DIPAKU, dan kenapa
 *
 * Hanya menyentuh baris yang MEMENUHI KETIGANYA:
 *
 *   1. `name` diawali `[UJI-`         — penamaan yang hanya dipakai fixture
 *   2. `owner_user_id IS NULL`        — tenant nyata SELALU punya pemilik
 *   3. `parent_company_id IS NULL`    — hanya akar; anak tak pernah yatim
 *
 * Tenant nyata tak mungkin lolos ketiganya sekaligus. Dan yang dilakukan
 * cuma `is_active = false` — sama persis dengan `bongkarCompanyUji`, bukan
 * DELETE (trigger `fn_company_no_casual_delete` menolaknya, dan itu benar).
 *
 * ⚠ Mencetak yang disapu, bukan diam. Penyapu yang bekerja senyap membuat
 * residu yang MENUMPUK tak pernah terlihat — dan kalau suatu saat angkanya
 * melonjak, itu temuan (test yang rutin mati sebelum teardown), bukan
 * kerapian.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

/*
  ⚠ Prasyarat diperiksa DI DEPAN, dan ini bukan kerapian.

  Jalan pertamanya di CI mati `exit 2` **tanpa satu baris keluaran** — sebab
  langkahnya dipasang tanpa `env: DIRECT_URL`, dan skripnya jatuh sebelum
  sempat mencetak apa pun. Yang terlihat cuma kode keluar, dan itu terbaca
  seperti SKRIPNYA rusak, bukan seperti prasyaratnya kurang.

  Kelas yang sama dengan jebakan pemantau EAS di CLAUDE.md §7: nol keluaran
  bukan bukti ketiadaan. Sekarang ia menyebut apa yang kurang.
*/
/*
  ⚠ Koneksi dibungkus try/catch yang MENYEBUT prasyaratnya.

  Jalan pertamanya di CI mati `exit 2` **tanpa satu baris keluaran** — sebab
  langkahnya dipasang tanpa `env: DIRECT_URL`, dan skripnya jatuh sebelum
  sempat mencetak apa pun. Yang terlihat cuma kode keluar, dan itu terbaca
  seperti SKRIPNYA rusak, bukan seperti prasyaratnya kurang.

  Kelas yang sama dengan jebakan pemantau EAS di CLAUDE.md §7: nol keluaran
  bukan bukti ketiadaan.

  ⚠ TIDAK memeriksa `process.env` sendiri: di mesin lokal kredensialnya datang
  dari `apps/api/.env` lewat `_koneksi.mjs`, bukan dari environment. Versi
  pertama saya memeriksanya begitu dan MENOLAK JALAN di lokal — penjaga yang
  merah atas keadaan yang benar.
*/
const c = buatClient()
try {
  await c.connect()
} catch (e) {
  console.error('❌ sapu-tenant-uji-tertinggal: tak bisa menyambung ke basis.')
  console.error(`   ${e.message}`)
  console.error('   Di CI, langkah ini WAJIB punya env DIRECT_URL (rahasia CI_DIRECT_URL).')
  process.exit(1)
}


try {
  const { rows } = await c.query(`
    UPDATE public.companies
       SET is_active = false
     WHERE is_active
       AND name LIKE '[UJI-%'
       AND owner_user_id IS NULL
       AND parent_company_id IS NULL
    RETURNING name, code`)

  console.log('── sapu tenant uji tertinggal ──')
  console.log(`  dinonaktifkan : ${rows.length}`)
  for (const r of rows) console.log(`     ${r.name}  (${r.code})`)

  if (rows.length === 0) {
    console.log('\n✅ Nol residu — teardown test bekerja utuh di run sebelumnya.')
  } else {
    console.log(
      '\n⚠ Residu ini berarti run SEBELUMNYA mati sebelum `afterAll`.\n' +
      '  Itu normal sesudah CI gagal, TAPI kalau berulang tanpa kegagalan,\n' +
      '  ada teardown yang tak pernah jalan — periksa, jangan cuma disapu.')
  }
} finally {
  await c.end()
}
