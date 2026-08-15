/**
 * AUTOMATION 5.7 + 9.2 — polis berakhir & proyek tanpa asuransi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI, DAN KENAPA BUKAN SEKADAR "RUTENYA JALAN"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Otomasi ini tak menghitung apa pun sendiri — ia memanggil
 * `hitungRegisterAsuransi()`, fungsi murni yang sama dengan yang dipakai layar
 * Register Asuransi. Pelajaran 3.18, diterapkan sebelum cacatnya sempat
 * terjadi.
 *
 * Maka yang perlu dibuktikan bukan rumusnya (itu punya test sendiri),
 * melainkan **sambungannya**:
 *
 *   1. polis yang statusnya `segera_berakhir`/`kadaluarsa` benar-benar
 *      menghasilkan notifikasi, dan yang `aktif` tidak
 *   2. proyek tanpa polis menghasilkan jenis notifikasi yang BERBEDA
 *   3. ambang yang dioper benar-benar sampai ke fungsinya
 *
 * Nomor 3 yang paling mudah rusak diam-diam: kalau ambangnya tak dioper,
 * pustaka memakai bawaannya sendiri (30) dan hasilnya tetap masuk akal —
 * hanya saja pengaturan tenant tak berpengaruh sama sekali, tanpa satu pun
 * gejala.
 *
 * ── Data uji dibuat DI SINI, dan dibersihkan
 *
 * `polis_asuransi` kosong di basis dev (diukur: 0 baris). Tanpa data buatan,
 * seluruh test ini akan hijau tanpa menyentuh satu pun cabang — persis
 * kegagalan yang harness EVM sempat alami.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import { AMBANG_SEGERA_HARI } from '../../../lib/register-asuransi.js'
import { AMBANG_OTOMASI } from '../../../lib/ambang-otomasi.js'

const TANDA = '[UJI-ASURANSI]'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/polis-berakhir${q}`,
    headers: { authorization: 'Bearer t' },
  })

/** Tanggal N hari dari hari ini, bentuk YYYY-MM-DD. */
function tanggal(selisihHari: number): string {
  const d = new Date()
  d.setDate(d.getDate() + selisihHari)
  /*
    Dirakit dari komponen LOKAL, bukan `toISOString()`.

    `toISOString` menggeser ke UTC, dan tanggal lokal pukul 00:00 WIB menjadi
    hari SEBELUMNYA pukul 17:00Z. Cacat yang sama pernah merusak data seed di
    repo ini (`berlaku_sejak` 2026-01-01 → 2025-12-30), dan di sini ia akan
    menggeser sisa-hari polis tepat satu — cukup untuk membuat test berpindah
    cabang tanpa alasan yang terlihat.
  */
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM polis_asuransi WHERE catatan = $1`, [TANDA])
  await db.query(
    `DELETE FROM notifications
      WHERE type IN ('polis_segera_berakhir', 'proyek_tanpa_asuransi')
        AND company_id = $1`,
    [companyId],
  )
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows: c } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`,
  )
  companyId = c[0].id

  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 AND status = 'active' LIMIT 1`,
    [companyId],
  )
  projectId = p[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

describe('5.7 — polis yang segera berakhir', () => {
  it('polis berakhir 10 hari lagi DITEGUR, yang setahun lagi TIDAK', async () => {
    await bersihkan()

    // Dua polis pada proyek yang sama, sengaja: kalau saringannya tak bekerja,
    // KEDUANYA memicu notifikasi dan selisihnya langsung terlihat.
    await db.query(
      `INSERT INTO polis_asuransi
         (project_id, jenis, nomor_polis, penerbit, nilai_pertanggungan,
          periode_mulai, periode_selesai, status, catatan)
       VALUES
         ($1, 'car', 'UJI-SEGERA-01', 'Asuransi Uji', 1000000000, $2, $3, 'aktif', $5),
         ($1, 'tpl', 'UJI-AMAN-01',   'Asuransi Uji', 500000000,  $2, $4, 'aktif', $5)`,
      [projectId, tanggal(-30), tanggal(10), tanggal(365), TANDA],
    )

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT action_data FROM notifications
        WHERE type = 'polis_segera_berakhir' AND company_id = $1`,
      [companyId],
    )

    const nomorTertegur = new Set<string>()
    for (const n of rows) {
      const ad = n.action_data as { record_id: string }
      const { rows: pol } = await db.query(
        `SELECT nomor_polis FROM polis_asuransi WHERE id = $1`, [ad.record_id],
      )
      if (pol[0]) nomorTertegur.add(pol[0].nomor_polis as string)
    }

    expect(nomorTertegur.has('UJI-SEGERA-01'),
      'polis yang berakhir 10 hari lagi TIDAK ditegur').toBe(true)
    expect(nomorTertegur.has('UJI-AMAN-01'),
      'polis yang masih setahun ikut ditegur — saringan ambang tak bekerja').toBe(false)
  }, 120_000)

  it('ambang dari query BENAR-BENAR dioper ke pustaka register', async () => {
    /*
      Cacat yang paling mudah lolos: kalau ambangnya tak dioper,
      `hitungRegisterAsuransi` memakai bawaannya sendiri (30) dan hasilnya
      tetap masuk akal. Pengaturan tenant lalu tak berpengaruh sama sekali,
      tanpa satu pun gejala.

      Polis yang berakhir 60 hari lagi berada DI LUAR bawaan 30 tetapi DI DALAM
      ambang 90. Kalau ia ditegur, ambangnya sampai; kalau tidak, tidak.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO polis_asuransi
         (project_id, jenis, nomor_polis, penerbit, periode_mulai,
          periode_selesai, status, catatan)
       VALUES ($1, 'car', 'UJI-60HARI', 'Asuransi Uji', $2, $3, 'aktif', $4)`,
      [projectId, tanggal(-30), tanggal(60), TANDA],
    )

    // Bawaan 30 — di luar jangkauan, tak boleh ditegur.
    await panggil()
    const { rows: bawaan } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type = 'polis_segera_berakhir' AND company_id = $1`,
      [companyId],
    )
    expect(bawaan[0].n, 'polis 60 hari ditegur pada ambang bawaan 30').toBe(0)

    // Ambang 90 — masuk jangkauan, wajib ditegur.
    await panggil('?hari=90')
    const { rows: lebar } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type = 'polis_segera_berakhir' AND company_id = $1`,
      [companyId],
    )
    expect(lebar[0].n,
      'ambang 90 tak berpengaruh — nilainya tak dioper ke hitungRegisterAsuransi')
      .toBeGreaterThan(0)
  }, 120_000)

  it('bawaan ambang SAMA dengan bawaan pustaka register', async () => {
    /*
      Kalau keduanya berbeda, layar Register Asuransi menandai polis "segera
      berakhir" pada hari yang BERBEDA dari hari notifikasinya dikirim — dan
      yang membuka layar sesudah menerima pesan menemukan status yang tak cocok
      dengan pesannya.

      Diperiksa sebagai konstanta, bukan sebagai perilaku: perbedaannya baru
      terlihat pada polis yang kebetulan jatuh di antara kedua angka, dan itu
      bisa berbulan-bulan tak terjadi.
    */
    expect(AMBANG_OTOMASI['otomasi.polis_berakhir.hari'].bawaan)
      .toBe(AMBANG_SEGERA_HARI)
  })
})

describe('9.2 — proyek tanpa asuransi', () => {
  it('jenis notifikasinya BERBEDA dari polis berakhir', async () => {
    /*
      Bukan detail penamaan. Dedup harian bekerja per (jenis, record):
      satu jenis untuk keduanya membuat proyek yang sudah dikirimi peringatan
      polis tak lagi bisa dikirimi peringatan "tak punya polis" di hari yang
      sama — padahal keduanya benar dan tindakannya berbeda.
    */
    await bersihkan()

    const r = await panggil()
    expect(r.statusCode).toBe(200)

    const c = (r.json() as {
      checked: { proyek: number; proyek_tanpa_polis: number }
    }).checked

    // Basis dev punya 11 proyek aktif dan `polis_asuransi` kosong, jadi
    // prasyaratnya terpenuhi tanpa data buatan. Diperiksa, bukan diandaikan.
    expect(c.proyek_tanpa_polis,
      'tak ada proyek tanpa polis — cabang 9.2 tak teruji').toBeGreaterThan(0)

    const { rows } = await db.query(
      `SELECT DISTINCT type FROM notifications
        WHERE type IN ('polis_segera_berakhir', 'proyek_tanpa_asuransi')
          AND company_id = $1`,
      [companyId],
    )
    const jenis = rows.map((x) => x.type as string)
    expect(jenis).toContain('proyek_tanpa_asuransi')
  }, 120_000)

  it('dedup harian menahan — panggilan kedua tak menambah notifikasi', async () => {
    /*
      ── Kenapa TIDAK ada polis uji di sini, dan kenapa itu penting

      Bentuk pertama test ini merah dengan selisih tepat 5: 80 → 85, lalu hijau
      pada run berikutnya. Dua tebakan saya berturut-turut salah, dan cara
      keduanya salah patut dicatat:

        "flaky karena berkas berjalan paralel"
          → `vitest.config.ts` menyetel `fileParallelism: false`

        "dedup gagal menahan"
          → diukur dengan memanggil rutenya dua kali langsung: 80 → 80,
            panggilan kedua nol notifikasi. Dedupnya bekerja sempurna.

      Penyebab sesungguhnya: SUITE PENUH sedang berjalan di latar terhadap
      basis yang sama, menyisipkan dan menghapus notifikasi di antara kedua
      panggilan test ini. Sesudah suite itu dihentikan, lima test lulus tiga
      run berturut-turut.

      Pelajarannya bukan tentang dedup melainkan tentang mengukur: angka yang
      berubah-ubah bukan bukti kode goyah, dan "flaky" adalah kesimpulan yang
      harus diukur — bukan label yang dipakai untuk berhenti mencari. Kalau
      saya menerimanya, test ini akan ditandai `retry` dan penyebab
      sesungguhnya (harness saya sendiri) tak pernah ketahuan.

      Panggilan pemanasan di bawah tetap dipertahankan: `bersihkan()` menghapus
      polis DAN notifikasi sekaligus, jadi keadaan basis berubah tepat sebelum
      perhitungan dimulai. Membandingkan dua panggilan SESUDAH keadaannya
      stabil lebih jujur daripada membandingkan yang pertama dengan yang
      kedua.
    */
    await bersihkan()

    /*
      Panggilan PEMANASAN, lalu hitung dari sana.

      `bersihkan()` menghapus polis DAN notifikasi sekaligus, jadi keadaan
      basis berubah tepat sebelum perhitungan dimulai. Menghitung dari
      panggilan pertama sesudah pembersihan berarti membandingkan dua keadaan
      yang berbeda.

      Panggilan pemanasan menstabilkan keadaannya lebih dulu; dua panggilan
      berikutnya baru dibandingkan satu sama lain.
    */
    await panggil()

    const { rows: a } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type IN ('polis_segera_berakhir', 'proyek_tanpa_asuransi')
          AND company_id = $1`,
      [companyId],
    )

    await panggil()
    const { rows: b } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type IN ('polis_segera_berakhir', 'proyek_tanpa_asuransi')
          AND company_id = $1`,
      [companyId],
    )

    expect(a[0].n).toBeGreaterThan(0)
    expect(b[0].n, 'panggilan kedua menambah notifikasi — dedup tak menahan')
      .toBe(a[0].n)
  }, 120_000)
})
