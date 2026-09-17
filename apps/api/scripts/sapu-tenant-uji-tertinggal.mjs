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
 *   1. `name` diawali `[UJI-` ATAU `ZZISO` — penamaan yang hanya dipakai fixture
 *   2. `owner_user_id IS NULL`        — tenant nyata SELALU punya pemilik
 *   3. `parent_company_id IS NULL`    — hanya akar; anak tak pernah yatim
 *
 * ⚠ `ZZISO` DITAMBAHKAN 2026-09-16, DAN syarat pemiliknya dilonggarkan
 * KHUSUS untuk pola itu — dua perubahan, bukan satu, dan yang kedua baru
 * ketahuan sesudah yang pertama gagal di CI.
 *
 * `search-tenant-isolation.test.ts` menamai tenantnya `ZZISO<6 digit acak>`,
 * di luar pola `[UJI-`. Residunya karena itu lolos penyapu ini, dan
 * `audit-rantai-approval-lengkap.mjs` (migrasi 580) memerahkan ENAM shard CI
 * dengan keluhan yang menuduh RANTAI APPROVAL:
 *
 *     ❌ 12 (company × jenis) tanpa rantai approval:
 *        ZZISO308548 Tenant B — back_charge
 *        ZZISO308548 Tenant B — change_order
 *        … 10 jenis lagi
 *
 * Rantainya tak pernah kurang. Yang tertinggal companynya — tenant mati yang
 * masih `is_active`, dari run yang berhenti sebelum `afterAll`. Penjaga yang
 * BENAR, menunjuk ke arah yang salah, karena penyapunya tak mengenali satu
 * pola penamaan.
 *
 * Menambahkan polanya saja TIDAK CUKUP, dan jalan CI berikutnya membuktikannya:
 * penyapu melapor `dinonaktifkan: 0` lalu penjaga langsung merah lagi atas
 * tenant yang SAMA (`ZZISO308548`). Sebabnya syarat kedua —
 * `owner_user_id IS NULL` — dan test itu SENGAJA mengisi pemiliknya:
 *
 *     "`owner_user_id` WAJIB diisi, bukan opsional. … Tanpa pemilik, ia
 *      menjadi akar grup yatim yang terlihat SELURUH test lain, dan
 *      `t9-kelola-badan-usaha` punya asersi global 'setiap akar grup punya
 *      pemilik' yang langsung merah karenanya."
 *
 * Jadi residunya BERPEMILIK, dan syarat yang melindungi tenant nyata di
 * `[UJI-` justru membutakan penyapu terhadap `ZZISO`.
 *
 * Yang menggantikan syarat itu untuk pola `ZZISO`: `code = 'iso-test-b'` —
 * kode DIPAKU di berkas test itu (baris 135), bukan acak seperti namanya.
 * Tenant nyata tak mungkin memakai kode itu, dan pemeriksaannya tak
 * bergantung pada kepemilikan.
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
       AND parent_company_id IS NULL
       AND (
         -- [UJI-*]: yatim (tanpa pemilik) — bentuk aslinya.
         (name LIKE '[UJI-%' AND owner_user_id IS NULL)
         -- ZZISO*: BERPEMILIK secara sengaja, jadi dikenali lewat kode
         -- yang dipaku fixture-nya (backtick DILARANG di sini: isi query
         -- ini template literal JS, dan backtick menutupnya di tengah SQL).
         OR (name LIKE 'ZZISO%' AND code = 'iso-test-b')
       )
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

  /*
    ── Residu KEDUA: hibah izin yang tertinggal terpasang ──────────────────

    `mitra.test.ts` MEMBERIKAN `mitra:daftar_hitam` secara sadar — itu inti
    ujinya, membuktikan migrasi 462 sengaja TIDAK mewariskannya. Ia mencabut
    lagi di `afterAll`, dan komentarnya bahkan MERAMALKAN kegagalan ini:

        "Dicabut lagi: test yang meninggalkan izin terpasang membuat penjaga
         'daftar_hitam tak diwariskan' merah di jalan berikutnya — dan
         merahnya menuduh migrasi, bukan test ini."

    Ramalannya terjadi. `afterAll` tak berjalan bila suite mati lebih dulu,
    dan `audit-peran-tak-kelebihan.mjs` (ambang NOL) lalu merah di jalan
    BERIKUTNYA — menuduh migrasi yang tak bersalah.

    Riwayatnya panjang: 539 mencabut, 540 memulihkan peta, 543 mencabut lagi
    berjudul "daftar_hitam KEMBALI sesudah 540". Kepala 543 mengaku "SUMBER
    PEMBERINYA BELUM DIKETAHUI" dan mendaftar empat tempat yang sudah
    diperiksa — keempatnya BENAR, sebab sumbernya bukan migrasi maupun seed,
    melainkan TEST yang mati sebelum teardown.

    Migrasi tak bisa menutupnya: pencabutan yang sudah tercatat tak berlaku
    surut (G-2), jadi tiap kekambuhan menuntut nomor migrasi baru. Yang
    menutupnya penyapu ini — tempat residu lintas-run memang ditangani.

    ⚠ TANPA pengecualian peran, dan versi pertama saya SALAH di sini.

    Saya sempat mengecualikan `admin`/`direktur` dengan alasan "kalau founder
    memberikannya lewat layar Peran, itu keputusan sadar". Alasannya masuk
    akal DAN bertentangan dengan penjaganya: `audit-peran-tak-kelebihan.mjs`
    menaruh kedua kunci ini di daftar KOSONG — ambangnya NOL untuk peran mana
    pun, termasuk admin, termasuk template.

    Penyapu yang menyisakan sesuatu yang penjaganya tolak = penyapu yang
    melapor "0 dicabut" lalu penjaga langsung merah. Persis yang terjadi di
    CI: `hibah izin residu dicabut : 0` diikuti `dipegang 1 peran`.

    Jadi cakupannya disamakan dengan penjaganya. Kalau founder memang ingin
    memberikannya, tempatnya mengubah penjaga itu (keputusan sadar, tercatat),
    bukan membiarkan penyapu dan penjaga berselisih diam-diam.
  */
  /*
    ⚠ TANPA batas umur — dan batas umur itu kesalahan SAYA, sudah diukur.

    Versi sebelumnya menyaring `granted_at < now() - interval '2 hours'`,
    dengan alasan yang terdengar masuk akal: hibah yang SEDANG dipakai test
    selalu baru, residu dari run yang mati selalu lama. Salah.

    Diukur pada PR #152: run jatuh pukul 17:19, run SEBELUMNYA pukul 17:18 —
    selisih SATU MENIT. Residunya jauh di dalam jendela dua jam, jadi penyapu
    melapor `dicabut 0` dan penjaga langsung merah atas
    `admin [(template)]` + `admin [Puraloka Persada]`.

    Umur tak bisa memisahkan keduanya: di CI yang menjalankan ulang tiap
    beberapa menit, "residu run sebelumnya" dan "hibah run ini" SAMA-SAMA
    baru. Sumbunya memang bukan waktu.

    ── Yang memisahkannya: URUTAN LANGKAH, dan itu sudah dijamin

    Penyapu berjalan di langkah ~131 dari 207, `mitra.test.ts` di fase test
    (~langkah 200+). Jadi saat penyapu ini jalan, test belum menyentuh
    apa pun — hibah yang ada PASTI residu, tak mungkin milik run ini.

    Balapan antar-shard yang dulu saya khawatirkan tak berlaku di sini: SEMUA
    shard menyapu di langkah yang sama, sebelum SEMUA shard masuk fase test.
    Yang dulu merusak `mitra.test.ts` adalah penyapu yang berjalan SESUDAH
    penjaga (urutan v1), bukan ketiadaan batas umur.
  */
  /*
    `company` ikut dipulangkan — basis ini punya baris peran TEMPLATE
    (company_id NULL) dan salinan per-tenant BERNAMA SAMA. Tanpa itu,
    keluarannya berbunyi `admin / mitra:daftar_hitam` DUA KALI dan pembacanya
    tak bisa tahu apakah itu dua baris berbeda atau satu yang tercetak ganda.
  */
  const { rows: izin } = await c.query(`
    DELETE FROM role_permissions rp
     USING permissions p, roles r
     WHERE rp.permission_id = p.id
       AND r.id = rp.role_id
       AND p.key IN ('mitra:daftar_hitam', 'approval:override_sod')
    RETURNING r.name AS peran, p.key,
              COALESCE(
                (SELECT co.name FROM companies co WHERE co.id = r.company_id),
                '(template)') AS company`)

  console.log(`\n  hibah izin residu dicabut : ${izin.length}`)
  for (const i of izin) console.log(`     ${i.peran} [${i.company}] / ${i.key}`)
  if (izin.length > 0) {
    console.log(
      '  ⚠ Sisa test yang mati sebelum `afterAll` (mitra.test.ts).\n' +
      '    Tanpa disapu, `audit-peran-tak-kelebihan` merah di jalan\n' +
      '    berikutnya, dan merahnya MENUDUH MIGRASI — bukan testnya.')
  }
} finally {
  await c.end()
}
