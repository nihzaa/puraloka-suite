#!/usr/bin/env node
/**
 * PENJAGA — company uji tak boleh MENUMPUK dalam keadaan aktif.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Alat pembersihnya SUDAH ADA sejak 2026-09-12
 * (`bersihkan-company-uji-menumpuk.mjs`), dan ia bekerja: 1.149 baris
 * dibereskan, company aktif turun 42 → 3.
 *
 * Diukur lagi 2026-09-13 — SATU HARI kemudian:
 *
 *     company AKTIF          20   (3 nyata + 17 ber-awalan [UJI-…])
 *     total baris companies  2238
 *
 * Jadi yang kurang bukan alatnya, melainkan sesuatu yang MEMBERI TAHU
 * bahwa alat itu perlu dijalankan. Pembersihan sekali-jalan menyelesaikan
 * keadaan hari itu dan tak menyelesaikan apa pun tentang besok.
 *
 * ── Kenapa ini bukan sekadar kerapian
 *
 * Company uji yang AKTIF ikut terbaca oleh hal-hal yang menghitung tenant:
 *
 *   · papan pemantauan dan laporan lintas-tenant mencacahnya sebagai
 *     pelanggan — angka yang dibaca orang untuk mengambil keputusan;
 *   · penjadwal menyentuhnya tiap denyut; ketika belakangan dinonaktifkan
 *     tetapi jadwalnya tertinggal, tiap denyut gagal 403 (kelas cacat yang
 *     sudah punya penjaganya sendiri, `audit-jadwal-company-hidup.mjs`);
 *   · fixture test memilih baris lewat `LIMIT 1` — makin banyak company
 *     uji, makin besar peluang fixture mendarat di company yang salah.
 *     Itu persis bentuk `audit-fixture-akun-hidup.mjs`: test yang merah
 *     karena DATA berubah, bukan kode, dan `git bisect` menunjuk commit
 *     tak bersalah.
 *
 * ── Kenapa ambangnya bukan NOL
 *
 * Test yang sedang BERJALAN wajar meninggalkan beberapa baris hidup, dan
 * penjaga yang merah tiap kali seseorang menjalankan suite akan diabaikan
 * seluruh keluarannya — kelas cacat yang sudah dua kali tercatat di repo
 * ini (`audit-kosong-berpetunjuk`, `audit-fixture-akun-hidup`).
 *
 * Yang dijaga PENUMPUKAN, bukan keberadaan. Ambang 8 dipilih dari
 * pengamatan: satu jalan suite penuh meninggalkan ~4 company uji aktif
 * (UJI-ISOLASI · UJI-GERBANG · UJI-BACASAJA · UJI-KUOTA). Delapan berarti
 * "dua jalan suite tanpa pembersihan" — masih wajar. Tujuh belas, yang
 * terukur hari ini, berarti sudah berhari-hari menumpuk.
 *
 * ── Hubungannya dengan `audit-test-bersihkan-company.mjs` (BUKAN duplikat)
 *
 * Penjaga itu sudah ada dan menjaga SUMBERNYA: tiap berkas test yang
 * membuat perusahaan wajib membersihkannya. Ia ratchet, dan hari ini
 * HIJAU di lantai **23 berkas yang belum membersihkan**.
 *
 * Hijau itu jujur — jumlahnya memang tak bertambah. Tetapi 23 berkas yang
 * tak membersihkan tetap MENGHASILKAN baris tiap kali suite berjalan, dan
 * tak ada di dalam penjaga itu yang bisa melihat akibatnya menumpuk.
 *
 * Jadi keduanya mengukur hal berbeda:
 *
 *     audit-test-bersihkan-company   SUMBER   — berkas mana yang lalai
 *     penjaga ini                    AKIBAT   — berapa yang tertinggal
 *
 * Sumber yang tak memburuk masih bisa menghasilkan akibat yang memburuk.
 * Itulah kenapa hijau di satu sisi tak menjamin apa pun di sisi lain.
 *
 * ⚠ BATAS: ia membaca BASIS, jadi ia tak bisa jalan di CI tanpa kredensial
 * dan tak boleh ditabelkan di CLAUDE.md §6 (`audit-penjaga-tercatat-jalan.mjs`
 * mewajibkan yang tertabel benar-benar dijalankan `ci.yml`). Tempatnya
 * dijalankan tangan, atau sesudah suite penuh.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

/** Lihat catatan "Kenapa ambangnya bukan NOL" di kepala berkas. */
const AMBANG = 8

/*
  Awalan yang dipakai fixture test di repo ini. Dibaca dari AWALAN nama,
  bukan dari daftar nama lengkap: fixture baru akan memakai awalan yang
  sama tetapi nama yang berbeda, dan daftar nama lengkap akan diam-diam
  melewatkannya.
*/
const POLA_UJI = '[UJI-%'

const c = buatClient()
await c.connect()

try {
  const { rows: aktif } = await c.query(
    `SELECT co.name, count(*)::int AS n
       FROM public.companies co
      WHERE co.is_active AND co.name LIKE $1
      GROUP BY co.name ORDER BY n DESC`,
    [POLA_UJI],
  )
  /*
    ⚠ Skema `test` MEMBAYANGI `companies` (CLAUDE.md §1) — `is_active` ada
    di KEDUANYA. Tabelnya ditulis berkualifikasi `public.` supaya baris
    skema `test` tak pernah ikut terhitung; tanpa itu jawabannya bisa
    BENAR secara kebetulan, dan itu lebih buruk daripada salah.
  */
  const { rows: ringkas } = await c.query(
    `SELECT
       count(*) FILTER (WHERE co.is_active)                        ::int AS aktif_semua,
       count(*) FILTER (WHERE co.is_active AND co.name LIKE $1)    ::int AS aktif_uji,
       count(*)                                                    ::int AS total_baris
     FROM public.companies co`,
    [POLA_UJI],
  )
  const r = ringkas[0]
  const nyata = r.aktif_semua - r.aktif_uji

  console.log('── company uji tak menumpuk ──')
  console.log(`  company AKTIF        : ${r.aktif_semua}`)
  console.log(`     di antaranya uji  : ${r.aktif_uji}   (ambang ${AMBANG})`)
  console.log(`     nyata             : ${nyata}`)
  console.log(`  total baris companies: ${r.total_baris}`)

  if (aktif.length > 0) {
    console.log('\n  per nama:')
    for (const a of aktif) console.log(`     ${String(a.n).padStart(3)} × ${a.name}`)
  }

  /*
    Nol company NYATA berarti pengukurannya salah, bukan basisnya bersih —
    basis ini selalu punya minimal satu tenant sungguhan. Nol hasil bukan
    bukti ketiadaan (CLAUDE.md §7a).
  */
  if (nyata === 0) {
    console.error('\n❌ NOL company nyata terbaca — polanya meleset, bukan basisnya bersih.')
    process.exit(1)
  }

  if (r.aktif_uji > AMBANG) {
    console.error(`\n❌ Company uji AKTIF menumpuk: ${r.aktif_uji} (ambang ${AMBANG}).`)
    console.error('\n   Yang rusak bukan kerapian:')
    console.error('     · laporan lintas-tenant mencacahnya sebagai pelanggan;')
    console.error('     · fixture `LIMIT 1` makin sering mendarat di company salah,')
    console.error('       dan test lalu merah karena DATA, bukan kode.')
    /*
      ⚠ Skrip pembersihnya melakukan DUA hal berbeda, dan kalimat ini
      sudah salah DUA KALI sebelum akhirnya diukur:

          baris `companies`   UPDATE is_active = false   (baris 397)
          tabel TURUNAN       DELETE …                   (baris ~371)

      Jadi "menonaktifkan" benar untuk companies, "menghapus" benar untuk
      turunannya — dan menyebut salah satunya saja menyesatkan ke arah
      yang berlawanan.

      Yang menipu: laporannya sendiri mencetak "akan DIHAPUS: N" untuk
      baris yang sebenarnya cuma dinonaktifkan. Jalan nyata 2026-09-13:
      20 company dinonaktifkan, 0 baris turunan dihapus, total baris
      2.247 → 2.247 (tetap).

      Aturannya: BACA laporan uji-keringnya, jangan percaya ringkasan
      siapa pun — termasuk kalimat ini.
    */
    console.error('\n   Bersihkan — companies DINONAKTIFKAN (is_active=false),')
    console.error('   tetapi baris TURUNAN yang tak berpemilik benar-benar DIHAPUS.')
    console.error('   Uji-kering dulu (bawaan), BACA daftarnya, baru --terapkan:')
    console.error('     node apps/api/scripts/bersihkan-company-uji-menumpuk.mjs')
    console.error('     node apps/api/scripts/bersihkan-company-uji-menumpuk.mjs --terapkan')
    process.exit(1)
  }

  console.log('\n✅ company uji tidak menumpuk.')
} finally {
  await c.end()
}
