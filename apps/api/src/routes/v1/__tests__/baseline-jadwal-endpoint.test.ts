import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import baselineRoutes from '../baseline-jadwal.js'

/**
 * BASELINE JADWAL terhadap Postgres NYATA (G6b).
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perbandingannya sudah dikunci 28 test di `lib/__tests__/baseline-jadwal.test.ts`
 * (16/16 mutasi MERAH). Yang tersisa dan butuh basis sungguhan:
 *
 *   • `uq_baseline_satu_aktif` — indeks PARSIAL, dan menetapkan baseline
 *     kedua HARUS berhasil (yang lama dinonaktifkan lebih dulu). Kalau
 *     urutannya salah, penetapan kedua selalu gagal
 *   • item baseline benar-benar append-only lewat trigger — dibuktikan lewat
 *     SQL LANGSUNG, bukan lewat rute, karena skrip impor tak lewat rute
 *   • nomor baseline tak menabrak `uq_baseline_nomor` sesudah ada penghapusan
 *   • salinan tanggal TIDAK ikut berubah saat `rab_items` disunting — inti
 *     seluruh modul ini
 *
 * Fixture berprefiks [TEST-BL] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let itemId: string
let tanggalAsli: { start: string | null; end: string | null } | null = null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url, payload, headers: { authorization: 'Bearer t' } })

const isi = (o: Record<string, unknown> = {}) => ({
  nama: '[TEST-BL] Baseline uji',
  alasan: 'kontrak awal ditandatangani untuk pengujian',
  ...o,
})

/**
 * Baseline NYATA yang aktif sebelum test berjalan — dikembalikan di akhir.
 *
 * ── Cacat yang ditemukan DI LAYAR, bukan oleh test
 *
 * `purge()` hanya menghapus baseline bertanda `[TEST-BL]`, dan itu terlihat
 * cukup. Yang terlewat: menetapkan baseline uji MENONAKTIFKAN baseline nyata
 * lebih dulu (`uq_baseline_satu_aktif` menuntutnya), lalu `purge` menghapus
 * yang uji — dan baseline nyata tertinggal dalam keadaan TIDAK AKTIF.
 *
 * Akibatnya nyata dan diam: proyek yang punya baseline berhenti punya
 * pembanding, layar berkata "belum punya baseline", dan SPI kembali dihitung
 * terhadap jadwal yang bisa bergeser — persis keadaan yang seluruh modul ini
 * perbaiki. Nol test merah, karena test-nya sudah selesai saat itu terjadi.
 *
 * Ditemukan dengan MELIHAT layar sesudah test dijalankan.
 */
let baselineAktifAsli: string | null = null

async function purge() {
  // CASCADE menghapus itemnya — trigger append-only mengizinkan DELETE yang
  // datang lewat CASCADE (`pg_trigger_depth() > 1`), dan justru itu yang
  // membuat baseline salah ketik masih bisa dibuang.
  await client.query(`DELETE FROM baseline_jadwal WHERE nama LIKE '[TEST-BL]%'`)
}

/** Mengaktifkan kembali baseline nyata yang ditidurkan test. */
async function pulihkanBaselineAsli() {
  if (!baselineAktifAsli) return
  // Baris ini hanya berhasil kalau tak ada baseline lain yang aktif —
  // `purge()` di atas sudah memastikannya.
  await client.query(
    `UPDATE baseline_jadwal SET aktif = TRUE WHERE id = $1`, [baselineAktifAsli])
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  // Proyek uji dipilih dari SYARAT yang test ini butuhkan — punya item
  // ber-`planned_start`. Memilih "yang pertama" lalu mengandaikan syaratnya
  // terpenuhi sudah dua kali gagal di run penuh (R-012 dan k3-lapangan).
  const { rows: p } = await client.query(
    `SELECT r.project_id, r.id FROM rab_items r
      JOIN projects pr ON pr.id = r.project_id
      WHERE r.planned_start IS NOT NULL AND pr.company_id IS NOT NULL
      ORDER BY r.project_id, r.id LIMIT 1`)
  if (p.length === 0) throw new Error('tak ada proyek dengan rab_items ber-planned_start')
  projectId = p[0].project_id
  itemId = p[0].id

  const { rows: t } = await client.query(
    `SELECT planned_start, planned_end FROM rab_items WHERE id = $1`, [itemId])
  tanggalAsli = { start: t[0].planned_start, end: t[0].planned_end }

  const { rows: bl } = await client.query(
    `SELECT id FROM baseline_jadwal
      WHERE project_id = $1 AND aktif AND nama NOT LIKE '[TEST-BL]%'`, [projectId])
  baselineAktifAsli = bl[0]?.id ?? null

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(baselineRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  // Tanggal rencana dikembalikan LEBIH DULU dan dijamin: satu test menggeser
  // jadwal proyek nyata untuk membuktikan salinan tak ikut berubah, dan
  // meninggalkannya tergeser akan mengubah Gantt & SPI proyek sungguhan.
  try {
    if (tanggalAsli) {
      await client.query(
        `UPDATE rab_items SET planned_start = $1, planned_end = $2 WHERE id = $3`,
        [tanggalAsli.start, tanggalAsli.end, itemId])
    }
    await purge()
    await pulihkanBaselineAsli()
  } finally {
    await app?.close()
    await client?.end()
  }
})

describe('GET pergeseran — tanpa baseline, jawabannya BUKAN 404', () => {
  it('menjawab 200 dengan alasan yang menyebut akibatnya', async () => {
    // Diuji pada proyek yang MEMANG belum punya baseline — bukan dengan
    // menonaktifkan baseline proyek uji.
    //
    // Versi pertama memakai `projectId` lalu `purge()`, dan itu hijau hanya
    // selama proyek itu belum punya baseline sungguhan. Begitu founder
    // menetapkan satu lewat UI, test ini menuntut penghapusannya — dan test
    // yang menuntut data nyata dihapus supaya dirinya hijau adalah test yang
    // salah, bukan datanya.
    const { rows } = await client.query(
      `SELECT p.id FROM projects p
        WHERE p.company_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM baseline_jadwal b WHERE b.project_id = p.id)
        ORDER BY p.id LIMIT 1`)
    if (rows.length === 0) return   // seluruh proyek sudah punya baseline

    const r = await get(`/api/v1/proyek/${rows[0].id}/baseline/pergeseran`)
    expect(r.statusCode).toBe(200)
    expect(r.json().baseline).toBeNull()
    // Yang bertanya berhak tahu KENAPA angkanya tak bisa dipercaya, bukan
    // sekadar "tidak ditemukan".
    expect(r.json().alasan).toMatch(/selalu terlihat sehat/)
  })
})

describe('POST baseline', () => {
  it('menetapkan baseline menyalin item ber-jadwal', async () => {
    // Nomor diuji sebagai KENAIKAN, bukan nilai absolut.
    //
    // Versi pertama menuntut `nomor === 1`, dan itu mengandaikan proyek uji
    // belum pernah punya baseline. Ia hijau di basis bersih lalu MERAH begitu
    // seseorang menetapkan baseline sungguhan lewat UI — persis yang terjadi
    // beberapa menit setelah test ini ditulis. `purge()` tak boleh menghapus
    // baseline nyata: itu data proyek, bukan fixture.
    await purge()
    const { rows: sebelum } = await client.query(
      `SELECT COALESCE(max(nomor), 0) n FROM baseline_jadwal WHERE project_id = $1`,
      [projectId])

    const r = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    expect(r.statusCode).toBe(201)
    expect(r.json().jumlah_item).toBeGreaterThan(0)
    expect(r.json().baseline.nomor).toBe(Number(sebelum[0].n) + 1)
  })

  it('HANYA item ber-jadwal yang disalin', async () => {
    // Ditemukan mutasi: membuang `.not('planned_start','is',null)` tak
    // membuat satu test pun merah. Akibat nyatanya kalau lolos — item tanpa
    // tanggal ikut masuk baseline sebagai baris yang SELALU "tak bergeser",
    // dan ia mengencerkan rata-rata tertimbang: proyek dengan 285 item yang
    // hanya 14 berjadwal akan menampilkan keterlambatan 20x lebih kecil.
    await purge()
    const c = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    const { rows: berjadwal } = await client.query(
      `SELECT count(*) n FROM rab_items
        WHERE project_id = $1 AND planned_start IS NOT NULL`, [projectId])
    const { rows: semua } = await client.query(
      `SELECT count(*) n FROM rab_items WHERE project_id = $1`, [projectId])

    expect(c.json().jumlah_item).toBe(Number(berjadwal[0].n))
    // Dan itu memang LEBIH SEDIKIT dari seluruh item — kalau sama, test ini
    // tak membuktikan apa pun.
    expect(Number(berjadwal[0].n)).toBeLessThan(Number(semua[0].n))
  })

  it('uraian item DISALIN, bukan dibiarkan kosong', async () => {
    // Ditemukan mutasi. Kalau kosong, laporan pergeseran jatuh ke nama
    // SEKARANG — dan item yang di-rename akan disebut dengan nama baru pada
    // baseline lama, persis yang hendak dicegah.
    await purge()
    const c = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    const { rows } = await client.query(
      `SELECT count(*) n FROM baseline_jadwal_item
        WHERE baseline_id = $1 AND uraian IS NOT NULL`, [c.json().baseline.id])
    expect(Number(rows[0].n)).toBeGreaterThan(0)
  })

  it('pergeseran memakai baseline AKTIF, bukan sembarang', async () => {
    // Ditemukan mutasi: membuang `.eq('aktif', true)` tak membuat test merah.
    // Akibatnya `maybeSingle()` menghadapi >1 baris begitu ada baseline kedua
    // — atau lebih buruk, memakai baseline LAMA sebagai pembanding sehingga
    // adendum yang sudah disetujui tetap dihitung sebagai keterlambatan.
    await purge()
    await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    const dua = await kirim(`/api/v1/proyek/${projectId}/baseline`,
      isi({ nama: '[TEST-BL] Kedua', alasan: 'adendum perpanjangan waktu' }))

    const r = await get(`/api/v1/proyek/${projectId}/baseline/pergeseran`)
    expect(r.statusCode).toBe(200)
    expect(r.json().baseline?.id).toBe(dua.json().baseline.id)
    expect(r.json().baseline?.aktif).toBe(true)
  })

  it('alasan terlalu pendek ditolak sebelum menyentuh basis', async () => {
    const r = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi({ alasan: 'adendum' }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/10 huruf/)
  })

  it('nama kosong ditolak', async () => {
    const r = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi({ nama: '  ' }))
    expect(r.statusCode).toBe(400)
  })

  it('proyek yang tak ada menjawab 404', async () => {
    const r = await kirim(
      '/api/v1/proyek/00000000-0000-0000-0000-0000000000ff/baseline', isi())
    expect(r.statusCode).toBe(404)
  })

  it('baseline KEDUA berhasil — yang lama dinonaktifkan lebih dulu', async () => {
    // Kalau urutannya terbalik, `uq_baseline_satu_aktif` menolak dan
    // penetapan baseline kedua SELALU gagal — padahal adendum adalah
    // kejadian normal dalam proyek konstruksi.
    await purge()
    const satu = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    const r = await kirim(`/api/v1/proyek/${projectId}/baseline`,
      isi({ nama: '[TEST-BL] Baseline kedua', alasan: 'adendum perpanjangan waktu' }))
    expect(r.statusCode).toBe(201)
    // Kenaikan, bukan nilai absolut — lihat catatan di test penyalinan item.
    expect(r.json().baseline.nomor).toBe(satu.json().baseline.nomor + 1)

    // Dan hanya SATU yang aktif.
    const { rows } = await client.query(
      `SELECT count(*) n FROM baseline_jadwal WHERE project_id = $1 AND aktif`,
      [projectId])
    expect(Number(rows[0].n)).toBe(1)
  })
})

describe('salinan tanggal TIDAK ikut berubah — inti seluruh modul ini', () => {
  it('menggeser jadwal RAB tidak mengubah baseline, dan pergeserannya terbaca', async () => {
    await purge()
    const c = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    expect(c.statusCode).toBe(201)

    const { rows: sebelum } = await client.query(
      `SELECT planned_end FROM baseline_jadwal_item
        WHERE baseline_id = $1 AND rab_item_id = $2`, [c.json().baseline.id, itemId])

    // Geser jadwal nyata 45 hari — inilah yang di dunia nyata membuat SPI
    // kembali mendekati 1 tanpa satu pun galat.
    await client.query(
      `UPDATE rab_items SET planned_end = planned_end + INTERVAL '45 days' WHERE id = $1`,
      [itemId])

    const { rows: sesudah } = await client.query(
      `SELECT planned_end FROM baseline_jadwal_item
        WHERE baseline_id = $1 AND rab_item_id = $2`, [c.json().baseline.id, itemId])

    // Baseline TIDAK bergerak.
    expect(String(sesudah[0].planned_end)).toBe(String(sebelum[0].planned_end))

    // Dan pergeserannya terbaca 45 hari.
    const r = await get(`/api/v1/proyek/${projectId}/baseline/pergeseran`)
    const item = r.json().pergeseran.find(
      (x: { rab_item_id: string }) => x.rab_item_id === itemId)
    expect(item.geser_selesai_hari).toBe(45)
    expect(r.json().ringkas.mundur).toBeGreaterThanOrEqual(1)
    expect(r.json().ringkas.mundur_terparah_hari).toBeGreaterThanOrEqual(45)

    // Kembalikan supaya test berikutnya tidak mewarisi jadwal yang tergeser.
    await client.query(
      `UPDATE rab_items SET planned_end = $1, planned_start = $2 WHERE id = $3`,
      [tanggalAsli!.end, tanggalAsli!.start, itemId])
  })
})

describe('append-only ditegakkan BASIS, bukan rute', () => {
  it('UPDATE item baseline lewat SQL langsung DITOLAK', async () => {
    // Lewat SQL langsung, bukan lewat rute: skrip impor, migrasi data, dan
    // perbaikan manual tak melewati satu pun preHandler.
    await purge()
    const c = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    let lolos = false
    try {
      await client.query(
        `UPDATE baseline_jadwal_item SET planned_end = '2099-01-01'
          WHERE baseline_id = $1`, [c.json().baseline.id])
      lolos = true
    } catch { /* ditolak: benar */ }
    expect(lolos).toBe(false)
  })

  it('DELETE satu item DITOLAK, tetapi CASCADE dari kepala JALAN', async () => {
    await purge()
    const c = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    const id = c.json().baseline.id

    let lolos = false
    try {
      await client.query(
        `DELETE FROM baseline_jadwal_item WHERE baseline_id = $1`, [id])
      lolos = true
    } catch { /* ditolak: benar */ }
    expect(lolos).toBe(false)

    // CASCADE HARUS jalan — kalau tidak, baseline yang salah ketik tak bisa
    // dihapus sama sekali dan orang akan mengubah basis lewat jalan lain.
    await client.query(`DELETE FROM baseline_jadwal WHERE id = $1`, [id])
    const { rows } = await client.query(
      `SELECT count(*) n FROM baseline_jadwal_item WHERE baseline_id = $1`, [id])
    expect(Number(rows[0].n)).toBe(0)
  })

  it('nomor tak menabrak sesudah baseline dihapus', async () => {
    // `count + 1` akan menabrak `uq_baseline_nomor` di sini; yang dipakai
    // `max(nomor) + 1`.
    await purge()
    const satu = await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    const dua = await kirim(`/api/v1/proyek/${projectId}/baseline`,
      isi({ nama: '[TEST-BL] Kedua', alasan: 'adendum untuk menguji penomoran' }))
    await client.query(`DELETE FROM baseline_jadwal WHERE id = $1`, [dua.json().baseline.id])

    const tiga = await kirim(`/api/v1/proyek/${projectId}/baseline`,
      isi({ nama: '[TEST-BL] Ketiga', alasan: 'adendum kedua untuk menguji penomoran' }))
    expect(tiga.statusCode).toBe(201)
    // `max(nomor) + 1`, bukan `count + 1` — sesudah #2 dihapus, `count`
    // menghasilkan nomor yang menabrak `uq_baseline_nomor`.
    expect(tiga.json().baseline.nomor).toBe(satu.json().baseline.nomor + 1)
  })
})

describe('GET daftar', () => {
  it('baseline lama tetap ada sebagai riwayat', async () => {
    await purge()
    await kirim(`/api/v1/proyek/${projectId}/baseline`, isi())
    await kirim(`/api/v1/proyek/${projectId}/baseline`,
      isi({ nama: '[TEST-BL] Kedua', alasan: 'adendum perpanjangan waktu' }))

    const r = await get(`/api/v1/proyek/${projectId}/baseline`)
    expect(r.statusCode).toBe(200)
    const uji = r.json().baseline.filter(
      (b: { nama: string }) => b.nama.startsWith('[TEST-BL]'))
    // Yang lama tidak dihapus — ia pembanding sah untuk periodenya.
    expect(uji.length).toBe(2)
    expect(uji.filter((b: { aktif: boolean }) => b.aktif).length).toBe(1)
  })
})
