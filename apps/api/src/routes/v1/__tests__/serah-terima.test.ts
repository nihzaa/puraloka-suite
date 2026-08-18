/**
 * E2 — Serah Terima PHO/FHO, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test lib membuktikan aturannya benar; ia hijau meski rutenya tak terdaftar.
 *
 *   • trigger FHO-butuh-PHO benar-benar menolak lewat rute, dan pesannya
 *     sampai ke pemanggil sebagai 422 — bukan 500 yang tak bisa dibaca
 *   • jumlah punch terbuka BENAR-BENAR terhitung dari basis dan tersimpan
 *   • satu PHO per proyek ditegakkan index parsial, dan pembatalan
 *     membebaskannya kembali
 *   • berita acara bertanda tangan TAK BISA diubah tanggalnya
 *   • pencairan retensi DITOLAK tanpa PHO — inti seluruh E2
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole , companyBerisi } from "../../../test-utils/rls-harness.js"
import { supabaseAuth } from '../../../utils/supabase.js'
import serahTerimaRoutes from '../serah-terima.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let scopeAsing: string | null = null
let asgAsing: string | null = null
let scopeAsingDibuat: string | null = null
const dibuat: string[] = []

const TANDA = '[TEST-ST]'

const buat = (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST', url: '/api/v1/serah-terima',
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const ubah = (id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH', url: `/api/v1/serah-terima/${id}/status`,
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const isiSah = (o: Record<string, unknown> = {}) => ({
  project_id: projectId,
  jenis: 'pho',
  tanggal: '2026-08-01',
  lingkup_serah: `${TANDA} Seluruh pekerjaan struktur & arsitektur`,
  ...o,
})

/** Terbitkan lalu tandatangani — pintasan yang dipakai beberapa test. */
async function terbitDanTtd(o: Record<string, unknown> = {}) {
  const r = await buat(isiSah(o))
  expect(r.statusCode, r.body).toBe(201)
  const id = r.json().serah_terima.id as string
  dibuat.push(id)
  await ubah(id, { ttd_url: 'penyerah.png', pihak: 'penyerah' })
  await ubah(id, { ttd_url: 'penerima.png', pihak: 'penerima' })
  const t = await ubah(id, { status: 'ditandatangani' })
  expect(t.statusCode, t.body).toBe(200)
  return id
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  // Company dipilih yang BENAR-BENAR berisi data yang dibutuhkan.
  //
  // Menuntut proyek yang punya punch item.
  // `LIMIT 1` tanpa ORDER BY menyerahkan pilihannya ke Postgres, dan yang
  // terpilih salah membuat test membalas "tidak ditemukan" — pesan yang
  // menuduh RUTE, padahal rutenya benar dan fixture-nya yang menunjuk
  // company kosong.
  companyId = await companyBerisi(db, auth, ['projects', 'punch_items'])

  // Proyek dipilih menurut SYARAT, bukan LIMIT 1: test ini menghitung punch
  // item, jadi proyeknya harus punya. Migrasi 328 sempat melewatkan seluruh
  // verifikasinya karena memilih fixture tanpa memeriksa syaratnya.
  const { rows: p } = await db.query(
    `SELECT p.id, count(pi.id)::int n
       FROM projects p
       JOIN punch_items pi ON pi.project_id = p.id
      WHERE p.company_id = $1
      GROUP BY p.id
      HAVING count(*) FILTER (WHERE pi.status IN ('terbuka','dikerjakan','menunggu_cek')) > 0
      ORDER BY 2 DESC LIMIT 1`, [companyId])
  if (!p.length) throw new Error('tak ada proyek ber-punch-item terbuka untuk diuji')
  projectId = p[0].id

  // Lingkup kerja milik company LAIN — untuk menguji saringan tenant dengan
  // id yang BENAR-BENAR ADA. UUID acak tak cukup: `maybeSingle()` mengembalikan
  // null dengan atau tanpa saringan, dan testnya tetap hijau saat saringannya
  // dibuang. Terbukti lewat mutasi di E1.
  const { rows: wsAsing } = await db.query(
    `SELECT ws.id FROM work_scopes ws
       JOIN mandor_assignments ma ON ma.id = ws.assignment_id
       JOIN projects p ON p.id = ma.project_id
      WHERE p.company_id <> $1 LIMIT 1`, [companyId])

  if (wsAsing.length) {
    scopeAsing = wsAsing[0].id
  } else {
    // Company lain ADA tetapi belum punya lingkup kerja sama sekali (diukur
    // 2026-08-12: 20 scope di satu company, 0 di yang lain). Fixture-nya
    // dibuat di sini, bukan test-nya dilewati — test yang di-skip karena data
    // kebetulan tak ada adalah test yang tak pernah menjaga apa pun.
    const { rows: pa } = await db.query(
      'SELECT id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
    if (pa.length) {
      // `mandor_id` menunjuk `users`, BUKAN `workers` — diukur ke pg_constraint
      // sesudah tebakan pertama ditolak FK. Nama kolomnya menyesatkan.
      const { rows: pengguna } = await db.query('SELECT id FROM users LIMIT 1')
      if (pengguna.length) {
        // `(project_id, mandor_id)` UNIK, dan penugasan bisa sudah ada dari
        // run sebelumnya. `ON CONFLICT ... DO UPDATE` supaya RETURNING tetap
        // memberi barisnya — `DO NOTHING` mengembalikan nol baris, dan itu
        // membuat fixture gagal karena alasan yang menyesatkan.
        const { rows: asg } = await db.query(
          `INSERT INTO mandor_assignments (project_id, mandor_id, status, assigned_by)
           VALUES ($1, $2, 'active', $2)
           ON CONFLICT (project_id, mandor_id) DO UPDATE SET updated_at = now()
           RETURNING id, (xmax = 0) AS baru`,
          [pa[0].id, pengguna[0].id])
        const { rows: ws } = await db.query(
          // `borongan` menuntut `borongan_value` (chk_work_scope_borongan_req),
          // diukur ke pg_constraint sesudah insert pertama ditolak.
          `INSERT INTO work_scopes (assignment_id, scope_name, payment_system, status, borongan_value)
           VALUES ($1, $2, 'borongan', 'active', 1000000) RETURNING id`,
          [asg[0].id, `${TANDA} scope tenant lain`])
        scopeAsing = ws[0].id
        // Penugasan HANYA dihapus bila test ini yang membuatnya. Menghapus
        // penugasan yang sudah ada sebelumnya berarti test merusak data yang
        // bukan miliknya.
        if (asg[0].baru) asgAsing = asg[0].id
        scopeAsingDibuat = ws[0].id
      }
    }
  }

  // Berita acara lain pada proyek ini akan menabrak index "satu per jenis".
  // Dibersihkan lebih dulu — dan dicatat, karena data dummy boleh dihapus
  // hanya bila ia memang milik test.
  await db.query(`DELETE FROM serah_terima WHERE project_id = $1 AND lingkup_serah LIKE '${TANDA}%'`,
    [projectId])

  app = Fastify({ logger: false })
  await app.register(serahTerimaRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  for (const id of dibuat) {
    await db.query('DELETE FROM serah_terima WHERE id = $1', [id])
  }
  await db.query(`DELETE FROM serah_terima WHERE lingkup_serah LIKE '${TANDA}%'`)
  // Fixture tenant lain dibersihkan — data dummy boleh dibuat test, tapi tak
  // boleh ditinggalkan.
  if (scopeAsingDibuat) {
    await db.query('DELETE FROM work_scopes WHERE id = $1', [scopeAsingDibuat])
  }
  if (asgAsing) {
    await db.query('DELETE FROM mandor_assignments WHERE id = $1', [asgAsing])
  }
  vi.restoreAllMocks()
  // `app` bisa undefined bila beforeAll gagal — dan afterAll yang melempar
  // di situ MENYEMBUNYIKAN galat aslinya di balik "cannot read close".
  if (app) await app.close()
  await db.end()
})

describe('validasi masukan', () => {
  it('menolak jenis di luar pho/fho', async () => {
    const r = await buat(isiSah({ jenis: 'sho' }))
    expect(r.statusCode).toBe(400)
  })

  it('menolak lingkup serah kosong', async () => {
    const r = await buat(isiSah({ lingkup_serah: '   ' }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak menyerahkan apa pun/i)
  })

  it('menolak proyek milik tenant lain', async () => {
    const { rows } = await db.query(
      'SELECT id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!rows.length) return
    const r = await buat(isiSah({ project_id: rows[0].id }))
    expect(r.statusCode, r.body).toBe(404)
  })

  it('menolak lingkup kerja milik tenant lain', async () => {
    if (!scopeAsing) throw new Error('fixture scope asing tak terbentuk')
    const r = await buat(isiSah({ work_scope_id: scopeAsing }))
    expect(r.statusCode, r.body).toBe(404)
    expect(r.json().error).toMatch(/lingkup kerja tidak ditemukan/i)
  })

  it('menolak masa pemeliharaan negatif', async () => {
    const r = await buat(isiSah({ masa_pemeliharaan_hari: -1 }))
    expect(r.statusCode).toBe(400)
  })

  it('menolak masa pemeliharaan pada FHO', async () => {
    const r = await buat(isiSah({ jenis: 'fho', masa_pemeliharaan_hari: 30 }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/hanya berlaku pada PHO/i)
  })

  it('masa kosong ("") jadi null, BUKAN nol hari', async () => {
    // `Number('') === 0` — kalau kosong lolos jadi 0, masa pemeliharaan
    // berakhir di hari yang sama dengan PHO, dan retensi FHO langsung terbuka.
    const r = await buat(isiSah({ masa_pemeliharaan_hari: '' }))
    expect(r.statusCode, r.body).toBe(201)
    const id = r.json().serah_terima.id
    dibuat.push(id)
    const { rows } = await db.query(
      'SELECT masa_pemeliharaan_hari FROM serah_terima WHERE id = $1', [id])
    expect(rows[0].masa_pemeliharaan_hari).toBeNull()
    await db.query('DELETE FROM serah_terima WHERE id = $1', [id])
    dibuat.pop()
  })
})

describe('menerbitkan berita acara', () => {
  it('FHO tanpa PHO ditolak 422 dengan pesan yang bisa dibaca', async () => {
    const r = await buat(isiSah({ jenis: 'fho' }))
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/masa pemeliharaan belum pernah dimulai/i)
  })

  it('PHO tersimpan dengan jumlah punch terbuka yang TERHITUNG dari basis', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM punch_items
        WHERE project_id = $1 AND status IN ('terbuka','dikerjakan','menunggu_cek')`,
      [projectId])
    const terbukaNyata = rows[0].n
    expect(terbukaNyata).toBeGreaterThan(0)

    const r = await buat(isiSah({ masa_pemeliharaan_hari: 90 }))
    expect(r.statusCode, r.body).toBe(201)
    const j = r.json()
    dibuat.push(j.serah_terima.id)

    expect(j.serah_terima.nomor).toMatch(/^BA-PHO-2026-\d{4}$/)
    expect(j.serah_terima.status).toBe('draf')
    // Angkanya dibandingkan dengan hitungan basis, BUKAN dengan konstanta —
    // konstanta akan tetap hijau saat penghitungnya salah.
    expect(j.serah_terima.punch_terbuka_saat_terbit).toBe(terbukaNyata)
    expect(j.peringatan).toMatch(/masih terbuka/i)
  })

  it('PHO kedua pada proyek yang sama ditolak 409', async () => {
    const r = await buat(isiSah())
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/sudah punya berita acara PHO/i)
  })
})

describe('tanda tangan & status', () => {
  let id: string

  beforeAll(async () => {
    // PHO dari blok sebelumnya dipakai ulang — ia sudah ada dan berstatus draf.
    const { rows } = await db.query(
      `SELECT id FROM serah_terima
        WHERE project_id = $1 AND jenis = 'pho' AND status = 'draf'
        ORDER BY dibuat_pada DESC LIMIT 1`, [projectId])
    id = rows[0].id
  })

  it('menolak ditandatangani tanpa satu pun tanda tangan', async () => {
    const r = await ubah(id, { status: 'ditandatangani' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/kedua tanda tangan/i)
  })

  it('satu tanda tangan saja masih ditolak, dan pesannya menyebut pihak yang kurang', async () => {
    await ubah(id, { ttd_url: 'penyerah.png', pihak: 'penyerah' })
    const r = await ubah(id, { status: 'ditandatangani' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/tanda tangan penerima/i)
  })

  it('dua tanda tangan → ditandatangani, dengan pesan yang menyebut retensi', async () => {
    await ubah(id, { ttd_url: 'penerima.png', pihak: 'penerima' })
    const r = await ubah(id, { status: 'ditandatangani' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().serah_terima.status).toBe('ditandatangani')
    expect(r.json().pesan).toMatch(/retensi kini boleh cair/i)
  })

  it('tanda tangan TAK BISA dibubuhkan lagi sesudah ditandatangani', async () => {
    const r = await ubah(id, { ttd_url: 'lain.png', pihak: 'penyerah' })
    expect(r.statusCode).toBe(409)
  })

  it('tanggal TERKUNCI sesudah ditandatangani — ditegakkan basis', async () => {
    // Lewat SQL langsung, bukan rute: yang diuji adalah trigger, dan rutenya
    // memang tak menyediakan jalan mengubah tanggal.
    await expect(
      db.query('UPDATE serah_terima SET tanggal = $2 WHERE id = $1', [id, '2026-09-09']),
    ).rejects.toThrow(/tak bisa diubah/i)
  })

  it('FHO SEKARANG diterima karena PHO-nya sudah ditandatangani', async () => {
    const r = await buat(isiSah({ jenis: 'fho', tanggal: '2026-11-01' }))
    expect(r.statusCode, r.body).toBe(201)
    dibuat.push(r.json().serah_terima.id)
  })

  it('FHO bertanggal SEBELUM PHO ditolak', async () => {
    // FHO barusan sudah ada, jadi yang ini akan menabrak "satu per jenis"
    // lebih dulu — dibatalkan dulu supaya yang diuji benar-benar tanggalnya.
    const { rows } = await db.query(
      `SELECT id FROM serah_terima WHERE project_id = $1 AND jenis = 'fho' AND status <> 'dibatalkan'`,
      [projectId])
    await db.query(
      `UPDATE serah_terima SET status = 'dibatalkan', alasan_batal = 'uji tanggal mundur' WHERE id = $1`,
      [rows[0].id])

    const r = await buat(isiSah({ jenis: 'fho', tanggal: '2026-07-01' }))
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/mendahului PHO/i)
  })

  it('tanda tangan pada berita acara DIBATALKAN ditolak APLIKASI', async () => {
    // Kasus ini yang membedakan gerbang aplikasi dari trigger basis: trigger
    // hanya mengunci yang DITANDATANGANI, jadi yang dibatalkan lolos ke basis
    // dan tanda tangan tertulis pada dokumen yang sudah ditarik.
    //
    // Terbukti lewat mutasi: tanpa test ini, membuang `if (status !== 'draf')`
    // tetap hijau karena basis kebetulan menahan kasus yang diuji.
    const r0 = await buat(isiSah({ jenis: 'fho', tanggal: '2026-12-01' }))
    expect(r0.statusCode, r0.body).toBe(201)
    const idBatal = r0.json().serah_terima.id as string
    dibuat.push(idBatal)

    const b = await ubah(idBatal, { status: 'dibatalkan', alasan: 'uji tanda tangan' })
    expect(b.statusCode, b.body).toBe(200)

    const r = await ubah(idBatal, { ttd_url: 'x.png', pihak: 'penyerah' })
    expect(r.statusCode,
      'tanda tangan dibubuhkan pada berita acara yang sudah dibatalkan').toBe(409)
    expect(r.json().error).toMatch(/hanya.*draf/i)

    const { rows } = await db.query(
      'SELECT ttd_penyerah_url FROM serah_terima WHERE id = $1', [idBatal])
    expect(rows[0].ttd_penyerah_url).toBeNull()
  })

  // Catatan jujur tentang `.eq('status', status)` pada transisi:
  //
  // Ia adalah lapis KEDUA, dan saya TIDAK berhasil membuatnya merah lewat
  // mutasi. Sebabnya bukan lemahnya test melainkan urutannya —
  // `periksaTransisiSerahTerima` sudah menolak setiap perpindahan tak sah
  // dari hasil BACA, jadi WHERE-nya hanya tercapai bila status berubah persis
  // di antara baca dan tulis. Menyusun balapan itu dari test yang memanggil
  // rute lewat `inject` berarti menyuntik jeda ke dalam kode produksi, dan
  // penanda-untuk-test di jalur uang adalah harga yang lebih mahal daripada
  // satu lapis yang tak terbukti.
  //
  // Dibiarkan ada dan dicatat, bukan dihapus supaya "semua termutasi": lapis
  // kedua yang tak diuji tetap menutup balapan nyata, sementara menghapusnya
  // membuka kembali. Yang tak boleh adalah mengaku ia terbukti.
  //
  // Kasus yang SAMA di back-charge (D3) berakhir dengan kesimpulan sama, dan
  // ditulis apa adanya di sana juga.

  it('pembatalan wajib beralasan', async () => {
    const r = await ubah(id, { status: 'dibatalkan' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/wajib beralasan/i)
  })
})

describe('kesiapan PHO', () => {
  it('melaporkan cacat terbuka TANPA melarang, dan menyebut porsi retensi', async () => {
    const r = await app.inject({
      method: 'GET', url: `/api/v1/serah-terima/kesiapan/${projectId}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode, r.body).toBe(200)
    const j = r.json()
    expect(j.kesiapan.punchTerbuka).toBeGreaterThan(0)
    expect(j.kesiapan.siap).toBe(false)
    expect(j.kesiapan.sebab).toMatch(/tetap bisa diterbitkan/i)
    // PHO sudah ditandatangani di blok sebelumnya → setengah retensi terbuka.
    expect(j.retensi.porsi_maks).toBe(0.5)
    expect(j.sudah_ada.pho).toBe(true)
  })

  it('menolak proyek milik tenant lain', async () => {
    const { rows } = await db.query(
      'SELECT id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!rows.length) return
    const r = await app.inject({
      method: 'GET', url: `/api/v1/serah-terima/kesiapan/${rows[0].id}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(404)
  })
})

describe('daftar', () => {
  it('akhir masa pemeliharaan DITURUNKAN, bukan disimpan', async () => {
    const r = await app.inject({
      method: 'GET', url: `/api/v1/serah-terima?project_id=${projectId}&jenis=pho`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode, r.body).toBe(200)
    const pho = r.json().serah_terima.find((b: { masa_pemeliharaan_hari: number | null }) =>
      b.masa_pemeliharaan_hari === 90)
    expect(pho).toBeTruthy()
    // 2026-08-01 + 90 hari = 2026-10-30.
    expect(pho.akhir_pemeliharaan).toBe('2026-10-30')
    // Kolomnya memang tak ada di basis — itulah buktinya diturunkan.
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM information_schema.columns
        WHERE table_name = 'serah_terima' AND column_name = 'akhir_pemeliharaan'`)
    expect(rows[0].n).toBe(0)
  })
})
