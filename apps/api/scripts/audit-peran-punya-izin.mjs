#!/usr/bin/env node
/**
 * PENJAGA — tiap peran wajib memegang minimal SATU izin.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * R-019 (2026-08-31): enam belas peran template yang dibuat migrasi 364
 * berakhir dengan **0 izin** — `akuntan`, `kasir`, `estimator`,
 * `manajer_keuangan`, dan dua belas lainnya.
 *
 * Yang membuatnya lebih dari kerapian: migrasi 364 **tercatat sukses** di
 * buku migrasi, dan ia diakhiri tuntutannya sendiri:
 *
 *     IF n_kosong > 0 THEN
 *       RAISE EXCEPTION '364 gagal: % role template tanpa satu pun izin';
 *
 * Diukur terhadap dev saat itu: `n_kosong = 16`. **Migrasi yang tercatat
 * sukses meninggalkan basis dalam keadaan yang ia sendiri nyatakan GAGAL** —
 * kelas yang sama dengan 111, 372, dan 374 (lihat migrasi 570-572).
 *
 * CI tetap hijau sepanjang itu, dan sebabnya masuk akal: CI memutar rantai
 * dari basis KOSONG, dan di sana 364 berjalan utuh. Yang menyimpang hanya
 * basis yang sudah berjalan lama.
 *
 * ── Kenapa penjaga, padahal keadaannya sudah pulih
 *
 * Diukur 2026-09-14: keenam belas peran kini berizin (6-34 masing-masing),
 * dan `n_kosong = 0` di SELURUH tenant. Seseorang memperbaikinya — dan
 * **tak ada apa pun yang mencegahnya kambuh**.
 *
 * Peran tanpa izin tak mengeluarkan galat. Ia hanya berarti siapa pun yang
 * memakainya ditolak di setiap pintu, dengan pesan yang menuduh otorisasi
 * alih-alih konfigurasi peran yang kosong. Persis bagaimana R-019 lahir dan
 * bertahan dua pekan.
 *
 * ── AMBANG NOL, dan kenapa bukan ratchet
 *
 * Tak ada alasan sah sebuah peran ada tanpa satu pun izin: ia tak bisa
 * dipakai untuk apa pun. Berbeda dengan menu tanpa izin (R-020) yang punya
 * kasus sah "tampilkan ke semua", di sini nol berarti nol guna.
 *
 * ⚠ BATAS: yang diperiksa ADANYA izin, bukan kecukupannya. Peran dengan satu
 * izin yang salah tetap lolos — itu wilayah keputusan kewenangan (R-017),
 * bukan invarian yang bisa dijaga skrip.
 *
 * Butuh basis, jadi TAK BOLEH ditabelkan di CLAUDE.md §6.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const c = buatClient()
await c.connect()

try {
  const { rows: kosong } = await c.query(`
    SELECT r.name,
           coalesce(co.name, '(template)') AS tenant,
           (SELECT count(*)::int FROM public.users u WHERE u.role_id = r.id) AS pengguna
      FROM public.roles r
      LEFT JOIN public.companies co ON co.id = r.company_id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id)
       AND (co.id IS NULL OR co.is_active)
     ORDER BY pengguna DESC, tenant, r.name`)

  const { rows: total } = await c.query(`
    SELECT count(*)::int semua,
           count(*) FILTER (WHERE company_id IS NULL)::int template
      FROM public.roles r
      LEFT JOIN public.companies co ON co.id = r.company_id
     WHERE co.id IS NULL OR co.is_active`)

  console.log('── peran punya izin ──')
  console.log(`  peran (tenant aktif + template) : ${total[0].semua}`)
  console.log(`     di antaranya template        : ${total[0].template}`)
  console.log(`  TANPA satu pun izin             : ${kosong.length}`)

  if (kosong.length > 0) {
    const dipakai = kosong.filter((r) => r.pengguna > 0)

    console.error(`\n❌ ${kosong.length} peran tanpa satu pun izin.`)
    if (dipakai.length) {
      console.error(`\n   ⚠ ${dipakai.length} DIPAKAI orang — mereka ditolak di SETIAP pintu:`)
      for (const r of dipakai) {
        console.error(`      ${r.name} @ ${r.tenant} — ${r.pengguna} pengguna`)
      }
    }
    console.error('\n   Seluruhnya:')
    for (const r of kosong.slice(0, 25)) {
      console.error(`      ${r.name} @ ${r.tenant}`)
    }
    if (kosong.length > 25) console.error(`      … dan ${kosong.length - 25} lagi`)

    console.error('\n   Peran tanpa izin TAK mengeluarkan galat — ia hanya menolak')
    console.error('   pemakainya di tiap pintu, dengan pesan yang menuduh otorisasi')
    console.error('   alih-alih konfigurasi peran yang kosong (R-019).')
    console.error('\n   Pulihkan lewat migrasi maju: salin izin dari peran template')
    console.error('   yang setara, jangan ditulis tangan satu per satu.')
    process.exit(1)
  }

  console.log('\n✅ Tiap peran memegang minimal satu izin.')
} finally {
  await c.end()
}
