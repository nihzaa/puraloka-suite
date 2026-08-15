/**
 * Penyusutan alat (10.8) dan perawatan & sertifikasi (10.7).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI, DAN KENAPA JUSTRU YANG INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "rutenya membalas 200" — itu terlalu murah. Yang diuji empat hal yang
 * masing-masing punya cara gagal TANPA GEJALA:
 *
 *   1. Periode yang ditagih adalah bulan LALU. Kalau ia menagih bulan
 *      berjalan, ia menagih buku yang memang belum bisa ditutup — tiap hari,
 *      selamanya, dan hasilnya tetap "masuk akal".
 *
 *   2. "Belum dihitung" dan "belum dijurnal" adalah DUA hal. Yang kedua lebih
 *      berbahaya: angkanya sudah terlihat di halaman Aset, jadi laporan
 *      TERLIHAT benar sementara neraca tak pernah menerimanya.
 *
 *   3. Angka yang dilaporkan adalah angka yang MEMICU. Cacat ini sungguh
 *      terjadi dan tertangkap di basis nyata — lihat komentar di test-nya.
 *
 *   4. Aset di luar masa manfaat TIDAK ditagih. Menagihnya membuat daftar
 *      tak pernah bisa dikosongkan, dan daftar yang tak pernah kosong berhenti
 *      dibaca.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-ASET'

let app: FastifyInstance
let db: Client
let companyId: string

const panggil = (rute: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${rute}${q}`,
    headers: { authorization: 'Bearer t' },
  })

/** Bulan sebelum bulan berjalan, `YYYY-MM-01`. */
function periodeLalu(): string {
  const d = new Date()
  const th = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
  const bl = d.getMonth() === 0 ? 12 : d.getMonth()
  return `${th}-${String(bl).padStart(2, '0')}-01`
}

function tanggal(selisih: number): string {
  const d = new Date()
  d.setDate(d.getDate() + selisih)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM penyusutan_alat WHERE asset_id IN
                    (SELECT id FROM assets WHERE asset_code LIKE $1)`, [`${TANDA}%`])
  await db.query(`DELETE FROM jadwal_perawatan WHERE nama LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM assets WHERE asset_code LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE company_id = $1
        AND type IN ('penyusutan_belum_dihitung', 'penyusutan_belum_dijurnal',
                     'perawatan_alat_jatuh_tempo', 'alat_tanpa_jadwal_perawatan')`,
    [companyId])
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

// ── Alat uji ────────────────────────────────────────────────────────────────

async function buatAset(kode: string, opsi: {
  perolehan: string; harga: number; umur: number
  status?: string; ownership?: string
}) {
  const { rows } = await db.query(
    `INSERT INTO assets (company_id, asset_code, name, category, ownership,
                         purchase_date, purchase_price, residual_value,
                         useful_life_months, depreciation_method, status)
     VALUES ($1,$2,$3,'alat_berat',$4,$5,$6,0,$7,'garis_lurus',$8)
     RETURNING id`,
    [companyId, kode, `Alat ${kode}`, opsi.ownership ?? 'milik',
     opsi.perolehan, opsi.harga, opsi.umur, opsi.status ?? 'tersedia'])
  return rows[0].id as string
}

describe('10.8 — penyusutan belum ditutup', () => {
  it('menagih periode BULAN LALU, dan berhenti begitu barisnya ada', async () => {
    /*
      Kalau ia menagih bulan BERJALAN, ia menagih pekerjaan yang memang belum
      bisa dikerjakan — tiap hari, selamanya. Tak ada galat, tak ada gejala,
      hanya notifikasi yang lama-lama diabaikan.

      Diuji dengan mengisi baris untuk BULAN LALU: kalau periodenya benar,
      aset ini berhenti ditagih. Kalau yang ditagih bulan berjalan, ia tetap
      muncul karena baris yang barusan diisi tak ada hubungannya.
    */
    await bersihkan()
    const id = await buatAset(`${TANDA}-A`, {
      perolehan: '2025-01-15', harga: 120_000_000, umur: 60,
    })

    const hitung = async () => {
      const r = await panggil('penyusutan-belum-ditutup')
      expect(r.statusCode, r.body).toBe(200)
      const c = (r.json() as {
        checked: { aset_belum_dihitung: number; periode_ditagih: string }
      }).checked

      /*
        Periodenya diperiksa LANGSUNG, bukan disimpulkan dari jumlah.

        Mutasi membuktikan kenapa: menggeser periode yang dihitung bebannya ke
        bulan BERJALAN tetap membuat jumlahnya turun satu — karena baris yang
        dicari masih dicocokkan ke bulan lalu. Dua periode berbeda hidup di
        satu rute tanpa satu pun gejala.
      */
      expect(c.periode_ditagih,
        'periode yang ditagih bukan bulan lalu')
        .toBe(periodeLalu().slice(0, 7))

      return c.aset_belum_dihitung
    }

    const sebelum = await hitung()
    expect(sebelum, 'aset uji tak terhitung sebagai belum dihitung')
      .toBeGreaterThan(0)

    await db.query(
      `INSERT INTO penyusutan_alat (asset_id, company_id, periode, nilai, akumulasi)
       VALUES ($1,$2,$3,2000000,2000000)`,
      [id, companyId, periodeLalu()])

    expect(await hitung(),
      'mengisi baris BULAN LALU tak mengurangi tagihan — periode yang '
      + 'diperiksa bukan bulan lalu')
      .toBe(sebelum - 1)
  }, 120_000)

  it('aset di LUAR masa manfaat tidak ditagih', async () => {
    /*
      Aset berumur 12 bulan yang dibeli lima tahun lalu sudah habis disusutkan.
      Menagih barisnya berarti menagih baris yang halaman Aset sendiri tak mau
      membuatnya — dan daftar itu tak akan pernah bisa dikosongkan.

      Syaratnya sengaja TIDAK ditulis ulang di rute; ia memakai `bebanPeriode()`
      yang sama dengan halaman Aset. Test ini menjaga keputusan itu.
    */
    await bersihkan()
    const dasar = await panggil('penyusutan-belum-ditutup')
    const awal = (dasar.json() as { checked: { aset_belum_dihitung: number } })
      .checked.aset_belum_dihitung

    await buatAset(`${TANDA}-HABIS`, {
      perolehan: '2019-01-15', harga: 50_000_000, umur: 12,
    })

    const r = await panggil('penyusutan-belum-ditutup')
    expect((r.json() as { checked: { aset_belum_dihitung: number } })
      .checked.aset_belum_dihitung,
      'aset yang umur ekonomisnya sudah habis ikut ditagih')
      .toBe(awal)
  }, 120_000)

  it('"belum dijurnal" hidup terpisah dari "belum dihitung"', async () => {
    /*
      Keduanya terlihat mirip di layar dan berbeda total dalam tindakan.

      Yang kedua lebih berbahaya: bebannya sudah terlihat di halaman Aset,
      jadi laba-rugi TERLIHAT benar sementara neraca tak pernah menerimanya.
      Kalau keduanya dihitung dari saringan yang sama, menjurnalkan semuanya
      akan ikut mengosongkan yang pertama — dan sebaliknya.
    */
    await bersihkan()
    const id = await buatAset(`${TANDA}-J`, {
      perolehan: '2025-01-15', harga: 90_000_000, umur: 60,
    })

    // Barisnya ADA (jadi tak "belum dihitung") tetapi TANPA jurnal.
    await db.query(
      `INSERT INTO penyusutan_alat (asset_id, company_id, periode, nilai, akumulasi)
       VALUES ($1,$2,$3,1500000,1500000)`,
      [id, companyId, periodeLalu()])

    const r = await panggil('penyusutan-belum-ditutup')
    const c = (r.json() as {
      checked: { baris_belum_dijurnal: number; nilai_belum_dijurnal: number }
    }).checked

    expect(c.baris_belum_dijurnal,
      'baris tanpa journal_entry_id tak terhitung')
      .toBeGreaterThan(0)
    expect(c.nilai_belum_dijurnal,
      'nilai belum-terjurnal nol padahal barisnya ada')
      .toBeGreaterThan(0)

    // Dijurnalkan → temuan kedua berkurang.
    const { rows: je } = await db.query(
      `SELECT id FROM journal_entries WHERE company_id = $1 LIMIT 1`, [companyId])
    if (je[0]) {
      await db.query(
        // `penyusutan_jurnal_lengkap` menuntut keduanya: id jurnal tanpa
        // stempel waktu adalah baris yang mengklaim sudah dijurnalkan tanpa
        // bisa menyebut kapan.
        `UPDATE penyusutan_alat
            SET journal_entry_id = $1, dijurnal_pada = now()
          WHERE asset_id = $2`,
        [je[0].id, id])

      const r2 = await panggil('penyusutan-belum-ditutup')
      const c2 = (r2.json() as { checked: { baris_belum_dijurnal: number } }).checked
      expect(c2.baris_belum_dijurnal,
        'menjurnalkan baris tak mengurangi temuan — journal_entry_id tak diperiksa')
        .toBe(c.baris_belum_dijurnal - 1)
    }
  }, 120_000)
})

describe('10.7 — perawatan & sertifikasi alat', () => {
  it('melaporkan angka yang MEMICU, bukan angka yang kebetulan ada', async () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      CACAT INI SUNGGUH TERJADI, DAN TERTANGKAP DI BASIS NYATA
      ══════════════════════════════════════════════════════════════════════

      Versi pertama memeriksa jam DAN hari lalu selalu menulis sisa HARI:

        [URGENT] Perawatan Alat Jatuh Tempo
        Excavator 20 Ton — "Ganti oli mesin & filter" 154 hari lagi.

      Yang memicu adalah meter jam yang sudah melewati 1.250 (terukur 1.268 —
      lewat 18 jam), dan itu BENAR. Tetapi yang membacanya melihat "154 hari
      lagi" berlabel URGENT dan menyimpulkan sistemnya rusak — lalu berhenti
      mempercayai seluruh peringatan perawatan, termasuk yang benar.

      Test ini memasang jadwal yang jam-nya sudah lewat sementara kalendernya
      masih jauh, lalu menuntut pesannya menyebut JAM.
    */
    await bersihkan()
    const id = await buatAset(`${TANDA}-M`, {
      perolehan: '2025-01-15', harga: 200_000_000, umur: 60, status: 'dipakai',
    })

    await db.query(
      `INSERT INTO jadwal_perawatan
         (asset_id, company_id, nama, jenis, setiap_jam, setiap_hari,
          jam_terakhir, tanggal_terakhir, aktif)
       VALUES ($1,$2,$3,'berkala',100,3650,50,$4,true)`,
      [id, companyId, `${TANDA} ganti oli`, tanggal(-1)])

    // Meter 200 → jatuh tempo jam di 150, jadi lewat 50 jam.
    // Kalendernya 3.650 hari lagi — jauh di luar ambang.
    await db.query(
      `INSERT INTO pemakaian_alat
         (asset_id, company_id, tanggal, jam_mulai, jam_selesai, keperluan)
       VALUES ($1,$2,CURRENT_DATE,190,200,'uji')`,
      [id, companyId])

    const r = await panggil('perawatan-alat')
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT message FROM notifications
        WHERE type = 'perawatan_alat_jatuh_tempo' AND company_id = $1
          AND message LIKE $2`,
      [companyId, `%${TANDA} ganti oli%`])

    expect(rows.length,
      'jadwal yang jam-nya sudah lewat tak ditegur sama sekali')
      .toBeGreaterThan(0)
    expect(rows[0].message,
      'pesan menyebut HARI padahal yang memicu JAM — pembacanya akan '
      + 'menyimpulkan sistemnya rusak')
      .toMatch(/jam operasi/)
    expect(rows[0].message, 'pesan menyebut sisa hari yang bukan pemicunya')
      .not.toMatch(/hari lagi/)
  }, 120_000)

  it('sertifikasi punya kalimatnya sendiri — bukan sekadar servis', async () => {
    /*
      "Servis terlambat" berarti alatnya makin aus. "Sertifikat kedaluwarsa"
      berarti alatnya ILEGAL dioperasikan, dan yang menanggung akibatnya bukan
      bengkel melainkan proyek.

      Menyamakan keduanya membuat yang kedua terbaca seperti urusan
      pemeliharaan biasa, dan ditunda seperti urusan pemeliharaan biasa.
    */
    await bersihkan()
    const id = await buatAset(`${TANDA}-S`, {
      perolehan: '2025-01-15', harga: 300_000_000, umur: 60, status: 'dipakai',
    })

    await db.query(
      `INSERT INTO jadwal_perawatan
         (asset_id, company_id, nama, jenis, setiap_hari, tanggal_terakhir, aktif)
       VALUES ($1,$2,$3,'sertifikasi',365,$4,true)`,
      [id, companyId, `${TANDA} Sertifikasi SILO`, tanggal(-360)])

    await panggil('perawatan-alat')

    const { rows } = await db.query(
      `SELECT title, message FROM notifications
        WHERE type = 'perawatan_alat_jatuh_tempo' AND company_id = $1
          AND message LIKE $2`,
      [companyId, `%${TANDA} Sertifikasi SILO%`])

    expect(rows.length, 'sertifikasi 5 hari lagi tak ditegur').toBeGreaterThan(0)
    expect(rows[0].title, 'judulnya sama dengan servis biasa')
      .toMatch(/Sertifikasi/)
    expect(rows[0].message,
      'pesan tak menyatakan bahwa alatnya berhenti boleh dioperasikan')
      .toMatch(/tidak boleh dioperasikan/)
  }, 120_000)

  it('alat TANPA jadwal dilaporkan — diam pada kasus ini terlihat seperti sehat', async () => {
    /*
      Otomasi yang hanya membaca jadwal akan melaporkan alat tanpa jadwal
      SEHAT selamanya — bukan karena terawat, melainkan karena tak ada yang
      pernah menuliskan kapan ia harus dirawat.

      Itu kegagalan yang paling mahal: ia terlihat persis seperti keberhasilan.
    */
    await bersihkan()
    const dasar = await panggil('perawatan-alat')
    const awal = (dasar.json() as { checked: { alat_tanpa_jadwal: number } })
      .checked.alat_tanpa_jadwal

    await buatAset(`${TANDA}-KOSONG`, {
      perolehan: '2025-06-01', harga: 40_000_000, umur: 48, status: 'tersedia',
    })
    // Alat SEWAAN tak boleh ikut terhitung — dirawat pemiliknya.
    await buatAset(`${TANDA}-SEWA`, {
      perolehan: '2025-06-01', harga: 40_000_000, umur: 48,
      status: 'tersedia', ownership: 'sewa',
    })

    const r = await panggil('perawatan-alat')
    expect((r.json() as { checked: { alat_tanpa_jadwal: number } })
      .checked.alat_tanpa_jadwal,
      'alat milik sendiri tanpa jadwal tak terhitung, atau alat SEWAAN ikut '
      + 'terhitung padahal dirawat pemiliknya')
      .toBe(awal + 1)
  }, 120_000)
})
