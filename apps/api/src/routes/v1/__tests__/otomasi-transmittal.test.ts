/**
 * AUTOMATION 5.11 — transmittal yang tak pernah dikonfirmasi diterima.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiga keadaan yang harus dibedakan, dan hanya satu yang boleh ditegur:
 *
 *   draft     → belum dikirim. Bukan urusan siapa pun di luar pembuatnya.
 *   diterima  → sudah selesai. Menegur ini merusak kepercayaan pesannya.
 *   dikirim   → menggantung. INILAH yang ditegur, dan hanya setelah lewat
 *               batas hari.
 *
 * Yang keempat lebih halus dan lebih mudah rusak: transmittal berstatus
 * `dikirim` yang BARU SAJA dikirim tak boleh ditegur. Kalau saringan waktunya
 * hilang, otomasinya menegur setiap transmittal pada hari yang sama ia
 * dikirim — dan pesan yang datang sebelum orang sempat membalas adalah cara
 * tercepat membuat notifikasi diabaikan.
 *
 * ── Basis sudah punya contohnya, dan itu tidak cukup
 *
 * `transmittal` berisi 3 baris: satu `draft`, satu `dikirim`, satu `diterima`
 * (diukur). Menguji dengan itu saja berarti bergantung pada data yang bisa
 * berubah kapan saja tanpa test ini merah. Data uji dibuat sendiri, ditandai,
 * dan dibersihkan.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-TR-5-11'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let userId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/transmittal-menggantung${q}`,
    headers: { authorization: 'Bearer t' },
  })

/** Stempel waktu N hari lalu. */
function hariLalu(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

async function bersihkan() {
  await db.query(`DELETE FROM transmittal_item WHERE transmittal_id IN
                    (SELECT id FROM transmittal WHERE nomor LIKE $1)`, [`${TANDA}%`])
  await db.query(`DELETE FROM transmittal WHERE nomor LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE type = 'transmittal_menggantung' AND company_id = $1`,
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
    `SELECT id FROM projects WHERE company_id = $1 LIMIT 1`, [companyId])
  projectId = p[0].id

  const { rows: u } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
  userId = u[0].user_id

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

describe('5.11 — transmittal menggantung', () => {
  it('hanya yang DIKIRIM dan lewat batas yang ditegur', async () => {
    await bersihkan()

    /*
      Empat baris yang sengaja berbeda satu variabel saja, supaya kegagalan
      menunjuk penyebabnya sendiri:

        MENGGANTUNG  dikirim 30 hari lalu, belum diterima   → DITEGUR
        BARU         dikirim hari ini, belum diterima       → tidak
        SELESAI      dikirim 30 hari lalu, sudah diterima   → tidak
        DRAFT        belum dikirim sama sekali              → tidak

      `status = 'draft' OR dikirim_pada IS NOT NULL` ditegakkan CHECK di basis,
      jadi baris DRAFT memang tak boleh punya `dikirim_pada`.
    */
    await db.query(
      `INSERT INTO transmittal
         (company_id, project_id, nomor, perihal, tujuan_nama, tujuan_organisasi,
          maksud, status, dikirim_pada, diterima_pada, created_by)
       VALUES
         ($1,$2,$3,'Gambar revisi 3','Budi','PT Konsultan X','untuk_persetujuan',
          'dikirim', $7, NULL, $6),
         ($1,$2,$4,'Gambar revisi 4','Budi','PT Konsultan X','untuk_informasi',
          'dikirim', $8, NULL, $6),
         ($1,$2,$5,'Spesifikasi',   'Budi','PT Konsultan X','untuk_informasi',
          'diterima', $7, $8, $6)`,
      [companyId, projectId,
       `${TANDA}-MENGGANTUNG`, `${TANDA}-BARU`, `${TANDA}-SELESAI`,
       userId, hariLalu(30), hariLalu(0)],
    )

    await db.query(
      `INSERT INTO transmittal
         (company_id, project_id, nomor, perihal, tujuan_nama, maksud,
          status, created_by)
       VALUES ($1,$2,$3,'Belum dikirim','Budi','untuk_informasi','draft',$4)`,
      [companyId, projectId, `${TANDA}-DRAFT`, userId],
    )

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT t.nomor
         FROM notifications n
         JOIN transmittal t ON t.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'transmittal_menggantung' AND n.company_id = $1`,
      [companyId],
    )
    const ditegur = new Set(rows.map((x) => x.nomor as string))

    expect(ditegur.has(`${TANDA}-MENGGANTUNG`),
      'transmittal menggantung 30 hari TIDAK ditegur').toBe(true)
    expect(ditegur.has(`${TANDA}-BARU`),
      'transmittal yang baru dikirim ikut ditegur — saringan waktu tak bekerja').toBe(false)
    expect(ditegur.has(`${TANDA}-SELESAI`),
      'transmittal yang SUDAH diterima ikut ditegur').toBe(false)
    expect(ditegur.has(`${TANDA}-DRAFT`),
      'transmittal draft ikut ditegur — padahal belum dikirim ke siapa pun').toBe(false)
  }, 120_000)

  it('status DITOLAK tidak ditegur — dan ini yang menguji saringan statusnya', async () => {
    /*
      ── Kenapa test ini ada, dan kenapa yang di atas TIDAK cukup

      Mutasi membuktikan lubangnya: membuang `.eq('status','dikirim')` dari
      rute TIDAK memerahkan test di atas. Ketiga kasusnya tersaring oleh hal
      LAIN, bukan oleh status:

        DRAFT     tak punya `dikirim_pada` → tersaring `.lt(dikirim_pada, …)`
        SELESAI   punya `diterima_pada`    → tersaring `.is(diterima_pada, null)`

      Jadi test itu lulus karena kebetulan, dan saringan status bisa dibuang
      tanpa ada yang tahu.

      `ditolak` menutupnya: ia PUNYA `dikirim_pada` yang lama DAN `diterima_pada`
      kosong — persis bentuk yang lolos kedua saringan lain. Satu-satunya yang
      menahannya adalah `.eq('status','dikirim')`.

      Dan ia bukan kasus karangan: transmittal yang ditolak memang sudah selesai
      urusannya. Menagih konfirmasi terima untuk dokumen yang ditolak adalah
      pesan yang tak bisa ditindaklanjuti siapa pun.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO transmittal
         (company_id, project_id, nomor, perihal, tujuan_nama, maksud,
          status, dikirim_pada, diterima_pada, created_by)
       VALUES ($1,$2,$3,'Gambar ditolak','Budi','untuk_persetujuan',
               'ditolak', $4, NULL, $5)`,
      [companyId, projectId, `${TANDA}-DITOLAK`, hariLalu(30), userId],
    )

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT t.nomor
         FROM notifications n
         JOIN transmittal t ON t.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'transmittal_menggantung' AND n.company_id = $1
          AND t.nomor = $2`,
      [companyId, `${TANDA}-DITOLAK`],
    )

    expect(rows.length,
      'transmittal DITOLAK ikut ditegur — saringan status tak bekerja').toBe(0)
  }, 120_000)

  it('yang menunggu PERSETUJUAN ditandai lebih mendesak', async () => {
    /*
      Bukan detail kosmetik. `untuk_persetujuan` berarti ada pekerjaan yang
      tertahan menunggu balasan; `untuk_informasi` tidak. Menyamakan keduanya
      membuat yang menahan pekerjaan tenggelam di antara yang tidak.

      ── Datanya dibuat DI SINI, tidak diwarisi dari test sebelumnya

      Bentuk pertama test ini membaca notifikasi sisa test pertama, dan merah
      begitu test `DITOLAK` disisipkan di antaranya — `bersihkan()` di test itu
      menghapus yang diandalkan.

      Test yang bergantung pada urutan bukan sekadar rapuh: ia merah untuk
      alasan yang tak ada hubungannya dengan apa yang diuji, dan yang
      memperbaikinya akan tergoda mengubah urutan alih-alih kemandiriannya.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO transmittal
         (company_id, project_id, nomor, perihal, tujuan_nama, maksud,
          status, dikirim_pada, created_by)
       VALUES
         ($1,$2,$3,'Perlu disetujui','Budi','untuk_persetujuan','dikirim',$5,$6),
         ($1,$2,$4,'Sekadar info',   'Budi','untuk_informasi',  'dikirim',$5,$6)`,
      [companyId, projectId,
       `${TANDA}-SETUJU`, `${TANDA}-INFO`, hariLalu(30), userId],
    )

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT t.maksud, n.priority
         FROM notifications n
         JOIN transmittal t ON t.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'transmittal_menggantung' AND n.company_id = $1
          AND t.nomor LIKE $2`,
      [companyId, `${TANDA}%`],
    )

    /*
      KEDUA maksud wajib terwakili. Tanpa pemeriksaan ini, test lulus bahkan
      bila hanya baris `untuk_informasi` yang menghasilkan notifikasi — dan
      perbandingan prioritasnya jadi tak menguji apa pun.
    */
    const maksudAda = new Set(rows.map((x) => x.maksud as string))
    expect(maksudAda.has('untuk_persetujuan'),
      'notifikasi untuk_persetujuan tak terbentuk').toBe(true)
    expect(maksudAda.has('untuk_informasi'),
      'notifikasi untuk_informasi tak terbentuk — perbandingan tak berarti').toBe(true)

    for (const x of rows) {
      if (x.maksud === 'untuk_persetujuan') {
        expect(x.priority, 'yang menunggu persetujuan tak ditandai urgent').toBe('urgent')
      } else {
        expect(x.priority, 'yang sekadar informasi ikut ditandai urgent').toBe('high')
      }
    }
  }, 120_000)

  it('ambang dari query mengubah cakupannya', async () => {
    /*
      Membuktikan ambangnya benar-benar dipakai menyaring, bukan sekadar
      dilaporkan di respons — cacat yang sudah terjadi sekali di 5.7, di mana
      nilainya tak dioper ke pustakanya dan hasilnya tetap masuk akal.

      `${TANDA}-BARU` dikirim hari ini. Pada ambang bawaan (7) ia di luar
      jangkauan; pada ambang 0 hari ia masuk.
    */
    await db.query(
      `DELETE FROM notifications WHERE type = 'transmittal_menggantung' AND company_id = $1`,
      [companyId])

    const r = await panggil('?hari=1')
    expect(r.statusCode).toBe(200)

    const c = (r.json() as {
      checked: { transmittal_menggantung: number; ambang_hari: number }
    }).checked

    expect(c.ambang_hari, 'ambang dari query tak sampai ke respons').toBe(1)

    const { rows } = await db.query(
      `SELECT t.nomor
         FROM notifications n
         JOIN transmittal t ON t.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'transmittal_menggantung' AND n.company_id = $1
          AND t.nomor = $2`,
      [companyId, `${TANDA}-BARU`],
    )
    // Ambang 1 hari: yang dikirim HARI INI masih di dalam batas, tak ditegur.
    expect(rows.length,
      'transmittal hari ini ditegur pada ambang 1 hari').toBe(0)
  }, 120_000)

  it('dedup harian menahan', async () => {
    await db.query(
      `DELETE FROM notifications WHERE type = 'transmittal_menggantung' AND company_id = $1`,
      [companyId])

    // Pemanasan — menstabilkan keadaan sesudah penghapusan (pelajaran 5.7).
    await panggil()

    const { rows: a } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type = 'transmittal_menggantung' AND company_id = $1`, [companyId])

    await panggil()
    const { rows: b } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type = 'transmittal_menggantung' AND company_id = $1`, [companyId])

    expect(a[0].n).toBeGreaterThan(0)
    expect(b[0].n, 'panggilan kedua menambah notifikasi — dedup tak menahan')
      .toBe(a[0].n)
  }, 120_000)
})
