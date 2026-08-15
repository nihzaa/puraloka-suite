/**
 * AUTOMATION 6.9 (sertifikat pegawai) + 9.8 (kepatuhan K3).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI — DAN KENAPA BUKAN "RUTENYA JALAN"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keduanya memanggil pustaka murni yang sudah punya test sendiri
 * (`kompetensi-sdm.ts` 33 test, `k3-lapangan.ts`). Menguji ulang rumusnya di
 * sini sia-sia. Yang perlu dibuktikan **sambungannya** — dan sambungan itu
 * punya cara gagal yang tak terlihat dari kode:
 *
 *   6.9  ijazah (tak berjangka) TIDAK boleh ditegur meski `berlaku_sampai`
 *        NULL. Otomasi yang membaca NULL sebagai "sudah lewat" akan menegur
 *        orang soal ijazahnya — 3 dari 8 sertifikat nyata berbentuk begitu.
 *
 *   9.8  tiga jenis notifikasi TERPISAH. Dedup harian bekerja per
 *        (jenis, record) — satu jenis untuk ketiganya membuat dua di
 *        antaranya tertahan keliru pada hari yang sama.
 *
 * ── Satu cacat yang sudah tertangkap SEBELUM test ini ada
 *
 * Jalan pertama lewat penjadwal membalas 500: `column pegawai.nama does not
 * exist`. Tabel `pegawai` memang tak punya kolom nama — namanya di `users`
 * lewat `user_id`. Nama kolom PostgREST hanyalah string, jadi typecheck tak
 * bisa menangkapnya; hanya menjalankannya sungguhan yang bisa.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import { AMBANG_OTOMASI } from '../../../lib/ambang-otomasi.js'

const TANDA = 'UJI-SER-69'

let app: FastifyInstance
let db: Client
let companyId: string
let pegawaiId: string

const panggilSertifikat = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/sertifikat-berakhir${q}`,
    headers: { authorization: 'Bearer t' },
  })

const panggilK3 = () =>
  app.inject({
    method: 'GET',
    url: '/api/v1/otomasi/jalankan/k3-kepatuhan',
    headers: { authorization: 'Bearer t' },
  })

/** Tanggal N hari dari hari ini, dari komponen LOKAL (bukan toISOString). */
function tanggal(selisih: number): string {
  const d = new Date()
  d.setDate(d.getDate() + selisih)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM sertifikat_pegawai WHERE nama LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE type IN ('sertifikat_berakhir', 'k3_temuan_berat_menggantung',
                     'k3_temuan_berulang', 'k3_induksi_kedaluwarsa')
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
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id

  const { rows: p } = await db.query(
    `SELECT id FROM pegawai WHERE company_id = $1 LIMIT 1`, [companyId])
  if (!p[0]) throw new Error('tak ada pegawai untuk diuji')
  pegawaiId = p[0].id

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

describe('6.9 — sertifikat pegawai', () => {
  it('IJAZAH tak ditegur — dua bentuk NULL yang berbeda arti', async () => {
    /*
      Inti seluruh otomasi ini, dan satu-satunya bagian yang tak bisa
      disimpulkan dari membaca kode.

      Dua baris di bawah sama-sama sah, dan hanya satu yang boleh ditegur:

        IJAZAH   berjangka=false, tanggal NULL  → seumur hidup, JANGAN tegur
        DEKAT    berjangka=true,  30 hari lagi  → TEGUR

      ⚠ Baris KETIGA sempat ada di sini: `berjangka = true` dengan tanggal
      NULL, yang menurut `nilaiSertifikat()` berstatus `kedaluwarsa`. Insert-nya
      DITOLAK basis:

          CHECK (NOT berjangka OR berlaku_sampai IS NOT NULL)
          -- sertifikat_berjangka_bertanggal

      Jadi cabang itu tak bisa dicapai lewat basis ini sama sekali. Pustakanya
      tetap benar mempertahankannya — ia fungsi murni yang bisa dipanggil dari
      mana saja — tetapi otomasi ini tak mengklaim menjaganya. Klaim yang lebih
      besar dari yang bisa diuji adalah klaim yang tak berdasar.

      Diukur di basis dev: 3 dari 8 sertifikat nyata ber-`berlaku_sampai` NULL,
      ketiganya `berjangka=false` — dua ijazah S1 dan satu pelatihan. Otomasi
      yang menyamakan kedua bentuk NULL akan menegur orang soal ijazahnya.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO sertifikat_pegawai (pegawai_id, jenis, nama, berjangka, berlaku_sampai)
       VALUES ($1,'ijazah',   $2, false, NULL),
              ($1,'keahlian', $3, true,  $4)`,
      [pegawaiId, `${TANDA}-IJAZAH`, `${TANDA}-DEKAT`, tanggal(30)],
    )

    const r = await panggilSertifikat()
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT s.nama
         FROM notifications n
         JOIN sertifikat_pegawai s ON s.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'sertifikat_berakhir' AND n.company_id = $1`,
      [companyId],
    )
    const ditegur = new Set(rows.map((x) => x.nama as string))

    expect(ditegur.has(`${TANDA}-IJAZAH`),
      'IJAZAH ikut ditegur — otomasi menyamakan dua bentuk NULL yang berbeda arti')
      .toBe(false)
    expect(ditegur.has(`${TANDA}-DEKAT`),
      'sertifikat yang berakhir 30 hari lagi TIDAK ditegur').toBe(true)
  }, 120_000)

  it('yang kedaluwarsa TERLALU lama berhenti ditegur', async () => {
    /*
      Diukur di basis dev: satu sertifikat kedaluwarsa sejak 2025-05-31 —
      empat belas bulan. Dedup harian menahan kembar DALAM satu hari, bukan
      lintas hari, jadi tanpa batas bawah otomasi ini menagih dokumen yang sama
      tiap pagi selamanya. Yang ditegur tiap hari berhenti dibaca.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO sertifikat_pegawai (pegawai_id, jenis, nama, berjangka, berlaku_sampai)
       VALUES ($1,'keahlian',$2,true,$3),
              ($1,'keahlian',$4,true,$5)`,
      [pegawaiId, `${TANDA}-BARU-LEWAT`, tanggal(-10), `${TANDA}-LAMA-LEWAT`, tanggal(-400)],
    )

    const r = await panggilSertifikat()
    expect(r.statusCode).toBe(200)

    const c = (r.json() as { checked: { dilewati_terlalu_lama: number } }).checked
    expect(c.dilewati_terlalu_lama,
      'tak ada yang dilewati — batas bawah tak bekerja').toBeGreaterThan(0)

    const { rows } = await db.query(
      `SELECT s.nama
         FROM notifications n
         JOIN sertifikat_pegawai s ON s.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'sertifikat_berakhir' AND n.company_id = $1`,
      [companyId],
    )
    const ditegur = new Set(rows.map((x) => x.nama as string))

    expect(ditegur.has(`${TANDA}-BARU-LEWAT`),
      'yang lewat 10 hari TIDAK ditegur').toBe(true)
    expect(ditegur.has(`${TANDA}-LAMA-LEWAT`),
      'yang lewat 400 hari masih ditegur — akan menagih selamanya').toBe(false)
  }, 120_000)

  it('ambang BAWAAN sama dengan bawaan pustaka penilai', async () => {
    /*
      Kalau berbeda, layar Kompetensi SDM menandai "akan habis" pada hari yang
      BERBEDA dari hari notifikasinya dikirim — dan yang membuka layar sesudah
      menerima pesan menemukan status yang tak cocok dengan pesannya.

      Diperiksa sebagai konstanta: perbedaannya baru terlihat pada sertifikat
      yang kebetulan jatuh di antara kedua angka, dan itu bisa berbulan-bulan
      tak terjadi.
    */
    const { nilaiSertifikat } = await import('../../../lib/kompetensi-sdm.js')
    const acuan = tanggal(0)
    const bawaanOtomasi = AMBANG_OTOMASI['otomasi.sertifikat_berakhir.hari'].bawaan

    // Sertifikat yang berakhir TEPAT pada ambang bawaan otomasi harus sudah
    // berstatus `akan_habis` menurut pustakanya — kalau bawaannya berbeda,
    // salah satu dari keduanya akan menyebutnya masih `berlaku`.
    const dinilai = nilaiSertifikat(
      {
        id: 'x', jenis: 'keahlian', nama: 'x', nomor: null, penerbit: null,
        klasifikasi: null, kualifikasi: null, tanggal_terbit: null,
        berlaku_sampai: tanggal(bawaanOtomasi - 1), berjangka: true,
      },
      acuan,
    )
    expect(dinilai.status,
      'bawaan ambang otomasi tak sejalan dengan bawaan nilaiSertifikat()')
      .toBe('akan_habis')
  })

  it('ambang dari query BENAR-BENAR dioper ke pustaka', async () => {
    /*
      Cacat yang paling mudah lolos: kalau ambangnya tak dioper,
      `nilaiSertifikat` memakai bawaannya sendiri (60) dan hasilnya tetap masuk
      akal. Pengaturan tenant lalu tak berpengaruh sama sekali, tanpa gejala.

      Sudah terjadi sekali di 5.7, dan ditangkap test yang persis seperti ini.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO sertifikat_pegawai (pegawai_id, jenis, nama, berjangka, berlaku_sampai)
       VALUES ($1,'keahlian',$2,true,$3)`,
      [pegawaiId, `${TANDA}-120HARI`, tanggal(120)],
    )

    /*
      Dihitung HANYA untuk baris uji, bukan seluruh notifikasi jenis ini.

      Bentuk pertama menghitung semuanya dan merah: basis dev punya delapan
      sertifikat NYATA yang juga memicu notifikasi, jadi angkanya tak pernah nol
      terlepas dari ambangnya. Test yang mengukur latar belakang alih-alih
      perubahan tak menguji apa pun.
    */
    const hitungUji = async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int n
           FROM notifications n
           JOIN sertifikat_pegawai s ON s.id = (n.action_data->>'record_id')::uuid
          WHERE n.type = 'sertifikat_berakhir' AND n.company_id = $1
            AND s.nama = $2`,
        [companyId, `${TANDA}-120HARI`],
      )
      return rows[0].n as number
    }

    // Bawaan 60 — 120 hari di luar jangkauan.
    await panggilSertifikat()
    expect(await hitungUji(), 'sertifikat 120 hari ditegur pada ambang bawaan 60').toBe(0)

    // Ambang 180 — masuk jangkauan.
    await panggilSertifikat('?hari=180')
    expect(await hitungUji(),
      'ambang 180 tak berpengaruh — nilainya tak dioper ke nilaiSertifikat')
      .toBeGreaterThan(0)
  }, 120_000)
})

describe('9.8 — kepatuhan K3', () => {
  it('mengirim TIGA jenis terpisah, bukan satu skor', async () => {
    /*
      Bukan detail penamaan. Dedup harian bekerja per (jenis, record): satu
      jenis untuk ketiganya membuat proyek yang sudah dikirimi peringatan
      temuan tak lagi bisa dikirimi peringatan induksi di hari yang sama —
      padahal tindakannya berbeda (menutup temuan vs menginduksi pekerja).

      Basis dev sudah punya datanya: 2 temuan berat lewat tenggat, 2 kategori
      berulang, 2 induksi kedaluwarsa + 6 pekerja belum diinduksi. Prasyaratnya
      DIPERIKSA di bawah, bukan diandaikan.
    */
    await bersihkan()

    const r = await panggilK3()
    expect(r.statusCode, r.body).toBe(200)

    const c = (r.json() as {
      checked: { proyek_aktif: number; diperiksa: number; tak_terhitung: number }
    }).checked

    expect(c.diperiksa,
      'nol proyek terperiksa — test ini tak menguji apa pun').toBeGreaterThan(0)

    const { rows } = await db.query(
      `SELECT DISTINCT type FROM notifications
        WHERE type LIKE 'k3_%' AND company_id = $1 ORDER BY type`,
      [companyId],
    )
    const jenis = rows.map((x) => x.type as string)

    expect(jenis, 'temuan berat menggantung tak terbentuk')
      .toContain('k3_temuan_berat_menggantung')
    expect(jenis, 'temuan berulang tak terbentuk').toContain('k3_temuan_berulang')
    expect(jenis, 'induksi kedaluwarsa tak terbentuk').toContain('k3_induksi_kedaluwarsa')
  }, 180_000)

  it('tiap proyek aktif masuk tepat satu ember', async () => {
    /*
      Kalau `diperiksa + tak_terhitung` tak sama dengan `proyek_aktif`, ada
      proyek yang hilang tanpa jejak di antaranya — dan "0 notifikasi" lalu tak
      bisa dibedakan dari "semua patuh". Pelajaran 3.18.
    */
    const r = await panggilK3()
    const c = (r.json() as {
      checked: { proyek_aktif: number; diperiksa: number; tak_terhitung: number }
    }).checked

    expect(c.diperiksa + c.tak_terhitung,
      'ada proyek aktif yang tak masuk ember mana pun').toBe(c.proyek_aktif)
  }, 180_000)

  it('dedup harian menahan ketiga jenisnya', async () => {
    await bersihkan()

    // Pemanasan — menstabilkan keadaan sesudah penghapusan (pelajaran 5.7).
    await panggilK3()

    const { rows: a } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type LIKE 'k3_%' AND company_id = $1`, [companyId])

    await panggilK3()
    const { rows: b } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type LIKE 'k3_%' AND company_id = $1`, [companyId])

    expect(a[0].n).toBeGreaterThan(0)
    expect(b[0].n, 'panggilan kedua menambah notifikasi — dedup tak menahan')
      .toBe(a[0].n)
  }, 180_000)
})
