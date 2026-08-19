/**
 * Penetapan pemenang tender subkon, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   • pemenang lama benar-benar TURUN jadi kalah sebelum yang baru naik —
 *     indeks unik parsial `idx_penawaran_subkon_satu_pemenang` (migrasi 201)
 *     akan menolak urutan yang terbalik, dan pesannya tak terbaca manusia
 *   • trigger 347: tender tak bisa ditutup tanpa pemenang / tanpa alasan
 *   • trigger 347: penawaran TERKUNCI sesudah tendernya selesai
 *   • tender milik tenant lain tak bisa disentuh
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import tenderSubkonRoutes from '../tender-subkon.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let tenderId: string
let pMurah: string
let pMahal: string
let pAbsen: string

const TANDA = 'UJI-TSK'
const ALASAN = 'Satu-satunya yang pernah mengerjakan pekerjaan sejenis di lokasi ini.'

const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query(
    `DELETE FROM penawaran_subkon WHERE tender_id IN
       (SELECT id FROM tender_subkon WHERE nomor LIKE $1)`, [`${TANDA}%`])
  await db.query('DELETE FROM tender_subkon WHERE nomor LIKE $1', [`${TANDA}%`])
}

/** Tender baru + tiga penawar. Dipakai ulang tiap blok yang butuh keadaan bersih. */
async function siapkanTender(nomor: string) {
  const { rows: t } = await db.query(
    `INSERT INTO tender_subkon (project_id, nomor, judul, nilai_perkiraan, tanggal, status)
     VALUES ($1, $2, 'Uji penetapan pemenang', 120000000, '2026-02-01', 'terkirim')
     RETURNING id`, [projectId, nomor])

  // ORDER BY WAJIB. `LIMIT 3` tanpa urutan menyerahkan pilihannya ke
  // Postgres: selama jumlah barisnya tetap ia memulangkan yang sama dan tak
  // pernah terlihat salah, lalu berhenti benar begitu ada baris ditambah
  // atau dihapus — dan kegagalannya menuduh RUTE, bukan fixture.
  const { rows: w } = await db.query(
    'SELECT id FROM workers WHERE company_id = $1 ORDER BY created_at, id LIMIT 3', [companyId])
  if (w.length < 3) throw new Error('butuh tiga worker di company ini — fixture tak terbentuk')

  const buat = async (wid: string, nilai: number, absen = false) => {
    const { rows } = await db.query(
      `INSERT INTO penawaran_subkon (tender_id, worker_id, nilai_penawaran, waktu_kerja_hari,
                                     tidak_menawar, status)
       VALUES ($1, $2, $3, 60, $4, 'diajukan') RETURNING id`,
      [t[0].id, wid, nilai, absen])
    return rows[0].id as string
  }

  return {
    tenderId: t[0].id as string,
    murah: await buat(w[0].id, 100_000_000),
    mahal: await buat(w[1].id, 150_000_000),
    absen: await buat(w[2].id, 0, true),
    // Id tukangnya ikut dipulangkan — test gerbang kelayakan perlu menandai
    // mitra di baliknya, dan mencarinya ulang lewat penawaran berarti
    // menduplikasi pengetahuan tentang bentuk fixture ini.
    workerMurah: w[0].id as string,
  }
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  // Company dipilih yang BENAR-BENAR berisi bahan fixture.
  //
  // Akun uji ini anggota TIGA company, dan seluruh 60 `workers` ada di satu
  // saja. `LIMIT 1` tanpa `ORDER BY` menyerahkan pilihannya ke Postgres —
  // sempat memilih company yang kosong, lalu test mati dengan "butuh tiga
  // worker di company ini" yang menuduh SEED, padahal seednya baik-baik saja
  // dan yang salah pilihan company-nya.
  companyId = await companyBerisi(db, auth, ['workers', 'projects'])

  const { rows: p } = await db.query(
    'SELECT id FROM projects WHERE company_id = $1 LIMIT 1', [companyId])
  if (!p.length) throw new Error('tak ada proyek di company ini')
  projectId = p[0].id

  await bersihkan()
  const f = await siapkanTender(`${TANDA}-001`)
  tenderId = f.tenderId; pMurah = f.murah; pMahal = f.mahal; pAbsen = f.absen

  app = Fastify({ logger: false })
  await app.register(tenderSubkonRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('menolak penetapan yang tak sah', () => {
  it('tanpa penawaran_id ditolak 400', async () => {
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/pemenang`, { alasan: ALASAN })
    expect(r.statusCode).toBe(400)
  })

  it('yang TIDAK MENAWAR ditolak, dan tak ada yang berubah di basis', async () => {
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/pemenang`,
      { penawaran_id: pAbsen, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/TIDAK menawar/i)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM penawaran_subkon WHERE tender_id = $1 AND status <> $2',
      [tenderId, 'diajukan'])
    expect(rows[0].n, 'penolakan meninggalkan perubahan separuh jalan').toBe(0)
  })

  it('alasan terlalu pendek untuk pemenang BUKAN termurah ditolak 409', async () => {
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/pemenang`,
      { penawaran_id: pMahal, alasan: 'Sesuai arahan' })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/bukan penawar termurah/i)
  })

  it('penawaran dari tender lain ditolak 404', async () => {
    const lain = await siapkanTender(`${TANDA}-LAIN`)
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/pemenang`,
      { penawaran_id: lain.murah, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(404)
  })

  it('tender milik tenant LAIN ditolak 404', async () => {
    // Fixture DIBUAT, tidak dicari lalu dilewati — test yang `return` diam-diam
    // saat fixturenya tak ada tidak menguji apa pun.
    //
    // ⚠️ TAK TERBUKTI lewat mutasi: melepas `.in('project_id', idProyek)` dari
    // rute TIDAK membuat test ini merah. Diukur 2026-08-13. Sebabnya bukan
    // testnya lemah — RLS di basis menahan barisnya lebih dulu, jadi
    // `.unsafe()` pun tak melihat tender milik tenant lain.
    //
    // Dua lapisan, dan yang kedua bekerja. Tapi itu berarti test ini menjaga
    // HASILNYA (404, dan tak ada yang tersunting), bukan penyaring di rutenya.
    // Dinyatakan alih-alih diklaim tertutup.
    let { rows } = await db.query(
      `SELECT t.id FROM tender_subkon t JOIN projects p ON p.id = t.project_id
        WHERE p.company_id <> $1 LIMIT 1`, [companyId])

    if (!rows.length) {
      const { rows: pa } = await db.query(
        'SELECT id FROM projects WHERE company_id <> $1 LIMIT 1', [companyId])
      if (!pa.length) throw new Error('tak ada proyek tenant lain — fixture tak terbentuk')
      const ins = await db.query(
        `INSERT INTO tender_subkon (project_id, nomor, judul, tanggal, status)
         VALUES ($1, $2, 'tender tenant lain (uji)', '2026-02-01', 'terkirim')
         RETURNING id`, [pa[0].id, `${TANDA}-ASING`])
      rows = ins.rows
    }

    const r = await patch(`/api/v1/tender-subkon/${rows[0].id}/pemenang`,
      { penawaran_id: pMurah, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(404)

    const { rows: sesudah } = await db.query(
      'SELECT alasan_pilih FROM tender_subkon WHERE id = $1', [rows[0].id])
    expect(sesudah[0].alasan_pilih, 'tender perusahaan lain ikut tersunting').toBeNull()
  })
})

describe('penetapan berhasil', () => {
  it('pemenang bukan termurah diterima, dan peringatannya menyebut selisih', async () => {
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/pemenang`,
      { penawaran_id: pMahal, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().peringatan).toMatch(/50\.000\.000/)

    const { rows } = await db.query(
      'SELECT id, status FROM penawaran_subkon WHERE tender_id = $1', [tenderId])
    const st = Object.fromEntries(rows.map((x) => [x.id, x.status]))
    expect(st[pMahal]).toBe('menang')
    expect(st[pMurah], 'penawar lain tidak diturunkan jadi kalah').toBe('kalah')
    // Yang tidak menawar TIDAK diseret jadi 'kalah': ia tak pernah bersaing.
    expect(st[pAbsen]).toBe('diajukan')
  })

  it('alasan tersimpan di tendernya', async () => {
    const { rows } = await db.query(
      'SELECT alasan_pilih FROM tender_subkon WHERE id = $1', [tenderId])
    expect(rows[0].alasan_pilih).toBe(ALASAN)
  })

  it('jumlah penawar yang dikalahkan dilaporkan', async () => {
    // Bukan hiasan: `update` yang hanya memeriksa `error` menganggap NOL baris
    // sebagai berhasil (penjaga `audit-tulis-tanpa-periksa`). Angka ini yang
    // membuat "tak ada yang berubah" bisa dibedakan dari "berhasil".
    const f = await siapkanTender(`${TANDA}-HITUNG`)
    const r = await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
      { penawaran_id: f.murah, alasan: 'Termurah dan memenuhi seluruh syarat.' })
    expect(r.statusCode, r.body).toBe(200)
    // Tiga penawar: murah (menang), mahal (kalah), absen (tak diseret).
    expect(r.json().penawar_dikalahkan).toBe(1)
  })

  it('MENGGANTI pemenang berhasil — lama turun sebelum baru naik', async () => {
    // Inti test ini: indeks unik parsial menolak dua baris 'menang'. Kalau
    // urutan update terbalik, yang muncul adalah galat duplicate key yang tak
    // bisa dibaca pengguna.
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/pemenang`,
      { penawaran_id: pMurah, alasan: 'Termurah dan memenuhi seluruh syarat.' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().peringatan).toBeNull()

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM penawaran_subkon WHERE tender_id = $1 AND status = 'menang'`,
      [tenderId])
    expect(rows[0].n, 'lebih dari satu pemenang lolos').toBe(1)

    const { rows: m } = await db.query(
      `SELECT id FROM penawaran_subkon WHERE tender_id = $1 AND status = 'menang'`, [tenderId])
    expect(m[0].id).toBe(pMurah)
  })
})

describe('penutupan tender', () => {
  it('tender TANPA pemenang tak bisa ditutup', async () => {
    const kosong = await siapkanTender(`${TANDA}-KOSONG`)
    const r = await patch(`/api/v1/tender-subkon/${kosong.tenderId}/tutup`, {})
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/Belum ada pemenang/i)

    const { rows } = await db.query(
      'SELECT status FROM tender_subkon WHERE id = $1', [kosong.tenderId])
    expect(rows[0].status).toBe('terkirim')
  })

  it('tender berpemenang & beralasan berhasil ditutup', async () => {
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/tutup`, {})
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().tender.status).toBe('selesai')
  })

  it('yang sudah selesai tak bisa ditutup lagi', async () => {
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/tutup`, {})
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/sudah ditutup/i)
  })

  it('pemenang tak bisa diganti sesudah tender ditutup', async () => {
    const r = await patch(`/api/v1/tender-subkon/${tenderId}/pemenang`,
      { penawaran_id: pMahal, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/sudah diputuskan/i)
  })
})

describe('trigger 347 — penawaran terkunci sesudah putusan', () => {
  it('nilai penawaran tak bisa diubah lagi', async () => {
    await expect(
      db.query('UPDATE penawaran_subkon SET nilai_penawaran = 1 WHERE id = $1', [pMurah]),
    ).rejects.toThrow(/sudah diputuskan/i)

    const { rows } = await db.query(
      'SELECT nilai_penawaran FROM penawaran_subkon WHERE id = $1', [pMurah])
    expect(Number(rows[0].nilai_penawaran),
      'dasar keputusan berubah sesudah keputusannya diambil').toBe(100_000_000)
  })

  it('catatan TETAP boleh diubah — sering baru ditulis sesudah keputusan', async () => {
    await db.query(
      `UPDATE penawaran_subkon SET catatan = 'ditinjau ulang' WHERE id = $1`, [pMurah])
  })

  it('trigger 347 juga menolak penutupan tanpa alasan, dari sisi BASIS', async () => {
    // Rute sudah menolaknya lebih dulu; ini membuktikan pagarnya juga ada di
    // basis — jalur tulis lain (importer, psql) tetap terjaga.
    const f = await siapkanTender(`${TANDA}-BASIS`)
    await db.query(
      `UPDATE penawaran_subkon SET status = 'menang' WHERE id = $1`, [f.murah])
    await expect(
      db.query(`UPDATE tender_subkon SET status = 'selesai' WHERE id = $1`, [f.tenderId]),
    ).rejects.toThrow(/[Aa]lasan/)
  })

  /**
   * ══════════════════════════════════════════════════════════════════════
   * GERBANG KELAYAKAN — daftar hitam yang akhirnya menutup pintu ini
   * ══════════════════════════════════════════════════════════════════════
   *
   * Diukur 2026-08-19, SEBELUM migrasi 461: kedelapan penawaran tender
   * datang lewat `workers`, sementara `evaluasi_subkon.masuk_daftar_hitam`
   * — satu-satunya penanda daftar hitam — hanya bisa menunjuk `suppliers`.
   * Dan berkas rutenya tak memeriksanya SAMA SEKALI (nol rujukan).
   *
   * Jadi pihak yang di-blacklist bisa menawar DAN MENANG. Bukan karena
   * penjaganya lalai, melainkan karena penjaganya berdiri di pintu lain.
   *
   * Migrasi 461 memindahkan penandanya ke `mitra.daftar_hitam`, tempat
   * ketiga peran bertemu. Yang diuji di sini: penanda itu benar-benar
   * menahan penetapan, dan menahannya dengan KALIMAT yang bisa ditindak.
   */
  it('mitra DAFTAR HITAM ditolak jadi pemenang — pintu yang dulu terbuka', async () => {
    const f = await siapkanTender(`${TANDA}-HITAM`)

    const { rows: mt } = await db.query(
      'SELECT mitra_id FROM workers WHERE id = $1', [f.workerMurah])
    const idMitra = mt[0]?.mitra_id
    if (!idMitra) throw new Error('worker uji belum tertaut mitra — migrasi 461 belum jalan?')

    const { rows: awal } = await db.query(
      'SELECT daftar_hitam, alasan_daftar_hitam FROM mitra WHERE id = $1', [idMitra])
    try {
      await db.query(
        `UPDATE mitra SET daftar_hitam = true,
                alasan_daftar_hitam = 'tiga kali gagal serah terima',
                daftar_hitam_sejak = now() WHERE id = $1`, [idMitra])

      const r = await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
        { penawaran_id: f.murah, alasan: ALASAN })

      // 409, bukan 403: permintaannya sah dan penggunanya berwenang —
      // keadaan PIHAKNYA yang menolak. 403 terbaca sebagai "Anda tak boleh
      // menetapkan pemenang", tuduhan yang salah alamat.
      expect(r.statusCode, r.body).toBe(409)
      expect(r.json().error).toMatch(/daftar hitam/i)
      // Alasannya IKUT. Tanpa itu penggunanya harus membuka layar lain, dan
      // sebagian akan menyimpulkan sistemnya rusak.
      expect(r.json().error).toMatch(/tiga kali gagal serah terima/)

      // Dan penawarannya BENAR-BENAR tak berpindah status. Menolak di
      // balasan tetapi terlanjur menulis 'menang' adalah kegagalan yang
      // paling sulit terlihat: layar bilang gagal, basis bilang menang.
      const { rows: st } = await db.query(
        'SELECT status FROM penawaran_subkon WHERE id = $1', [f.murah])
      expect(st[0].status).toBe('diajukan')
    } finally {
      await db.query(
        `UPDATE mitra SET daftar_hitam = $2, alasan_daftar_hitam = $3,
                daftar_hitam_sejak = NULL WHERE id = $1`,
        [idMitra, awal[0].daftar_hitam, awal[0].alasan_daftar_hitam])
    }
  })

  it('sesudah daftar hitam DICABUT, mitra yang sama boleh menang', async () => {
    // Gerbang yang tak bisa dibuka lagi bukan gerbang, melainkan tembok —
    // dan keputusan blacklist memang bisa ditinjau ulang.
    const f = await siapkanTender(`${TANDA}-CABUT`)
    const r = await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
      { penawaran_id: f.murah, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(200)
  })

})
