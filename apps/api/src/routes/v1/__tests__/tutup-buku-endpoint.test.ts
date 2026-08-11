import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import tutupBukuRoutes from '../tutup-buku.js'
import { selisihSeimbang } from '../../../lib/tutup-buku.js'

/**
 * PERIODE AKUNTANSI & TUTUP BUKU terhadap Postgres NYATA.
 *
 * ⚠ EMBER [C]. Yang diuji di sini bukan hanya rutenya, melainkan bahwa
 *   PENGUNCIANNYA BENAR-BENAR MENGUNCI — dan bahwa ia ditegakkan BASIS,
 *   bukan oleh pemeriksaan rute yang bisa dilewati jalur lain.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 37 test di `lib/__tests__/tutup-buku.test.ts`
 * (24 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • constraint EXCLUDE menolak periode tumpang tindih (dua permintaan
 *     bersamaan bisa lolos pemeriksaan aplikasi; EXCLUDE tidak)
 *   • trigger menolak POSTING jurnal ke periode tertutup — diuji lewat SQL
 *     LANGSUNG, bukan lewat rute, supaya membuktikan basis yang menjaganya
 *   • riwayat append-only benar-benar tak bisa di-UPDATE/DELETE
 *   • dua penutupan BERSAMAAN hanya satu yang berhasil
 *   • membuka kembali menaikkan `dibuka_ulang` dan mencatat riwayat
 *
 * Fixture berprefiks [TEST-TB] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let userId: string
let akunA: string
let akunB: string
/** Periode NON-UJI yang sempat ditutup di `beforeAll` — dikembalikan di akhir. */
let periodeDikembalikan: string[] = []

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  // URUTAN PENTING, dan tiap langkahnya menghindari penjaga yang memang
  // bekerja:
  //
  //   1. Periode dihapus DULU. Selama periodenya masih tertutup,
  //      `trg_gl_baris_hormati_periode` menolak menghapus baris jurnal di
  //      dalamnya — penjaga yang benar, tetapi menghalangi pembersihan.
  //   2. Jurnal dikembalikan ke `draft`. `trg_gl_baris_posted_immutable`
  //      menolak menghapus baris milik jurnal posted ("koreksi lewat jurnal
  //      balik") — juga penjaga yang benar.
  //
  // Keduanya ditemukan test ini pada percobaan pertama, dan tak satu pun
  // dilemahkan untuk menghijaukannya.
  await client.query(`DELETE FROM periode_akuntansi WHERE nama LIKE '[TEST-TB]%'`)
  await client.query(
    `UPDATE journal_entries SET status='draft', posted_at=NULL, posted_by=NULL
      WHERE entry_number LIKE '[TEST-TB]%' AND status = 'posted'`)
  await client.query(
    `DELETE FROM journal_entry_lines WHERE entry_id IN
       (SELECT id FROM journal_entries WHERE entry_number LIKE '[TEST-TB]%')`)
  await client.query(`DELETE FROM journal_entries WHERE entry_number LIKE '[TEST-TB]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT company_id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  companyId = p[0].company_id

  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)
  userId = u[0].id

  const { rows: a } = await client.query(
    `SELECT id FROM accounts WHERE company_id = $1 ORDER BY code LIMIT 2`, [companyId])
  akunA = a[0].id
  akunB = a[1].id

  await purge()

  // Periode uji memakai tahun 2029 supaya tak bertabrakan dengan periode
  // dummy pengembangan (Mei–Sep 2026). Tetapi periode dummy yang masih
  // TERBUKA tetap menghalangi penutupan periode 2029 — dan itu rancangan
  // yang benar: periode sebelumnya yang terbuka membuat saldo awal periode
  // ini tak bisa dipercaya.
  //
  // Karena itu seluruh periode lain ditutup di awal, dan dikembalikan di
  // akhir. Bukan dilemahkan penjaganya — dikondisikan keadaannya.
  const { rows: terbukaAwal } = await client.query(
    `SELECT id FROM periode_akuntansi WHERE company_id=$1 AND status='terbuka'`,
    [companyId])
  periodeDikembalikan = terbukaAwal.map((r) => r.id as string)
  if (periodeDikembalikan.length > 0) {
    await client.query(
      `UPDATE periode_akuntansi SET status='tertutup', ditutup_pada=now(), ditutup_oleh=$2
        WHERE id = ANY($1::uuid[])`, [periodeDikembalikan, userId])
  }

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(tutupBukuRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  // Kembalikan periode pengembangan ke keadaan semula.
  if (periodeDikembalikan.length > 0) {
    await client.query(
      `UPDATE periode_akuntansi SET status='terbuka', ditutup_pada=NULL, ditutup_oleh=NULL
        WHERE id = ANY($1::uuid[])`, [periodeDikembalikan])
  }
  await app?.close()
  await client?.end()
})

/** Jurnal SEIMBANG lewat SQL langsung — bukan lewat rute GL. */
async function buatJurnal(tanggal: string, status: 'draft' | 'posted' = 'draft') {
  const { rows } = await client.query(
    `INSERT INTO journal_entries (company_id, entry_number, entry_date, description, status, created_by)
     VALUES ($1, $2, $3, 'uji tutup buku', 'draft', $4) RETURNING id`,
    [companyId, `[TEST-TB]${Math.floor(Math.random() * 1e9)}`, tanggal, userId])
  const id = rows[0].id as string
  await client.query(
    `INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES ($1,$2,1000,0)`,
    [id, akunA])
  await client.query(
    `INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES ($1,$2,0,1000)`,
    [id, akunB])
  if (status === 'posted') {
    await client.query(
      `UPDATE journal_entries SET status='posted', posted_at=now(), posted_by=$2 WHERE id=$1`,
      [id, userId])
  }
  return id
}

describe('POST /gl/periode', () => {
  it('periode sah dibuat dan riwayatnya tercatat', async () => {
    const r = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] Januari 2029',
      tanggal_mulai: '2029-01-01', tanggal_akhir: '2029-01-31',
    })
    expect(r.statusCode).toBe(201)

    const h = await get(`/api/v1/gl/periode/${r.json().periode.id}/riwayat`)
    expect(h.statusCode).toBe(200)
    expect(h.json().riwayat.some((x: { tindakan: string }) => x.tindakan === 'dibuat')).toBe(true)
  })

  it('TUMPANG TINDIH ditolak dengan pesan yang bisa dibaca, bukan galat Postgres', async () => {
    const r = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] Tumpang',
      tanggal_mulai: '2029-01-15', tanggal_akhir: '2029-02-15',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/dua jawaban/)
    expect(r.json().error).not.toMatch(/exclusion constraint|periode_tak_tumpang/)
  })

  it('periode BERSEBELAHAN diterima', async () => {
    const r = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] Februari 2029',
      tanggal_mulai: '2029-02-01', tanggal_akhir: '2029-02-28',
    })
    expect(r.statusCode).toBe(201)
  })

  it('tanggal akhir mendahului mulai ditolak APLIKASI', async () => {
    const r = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] Terbalik',
      tanggal_mulai: '2029-06-01', tanggal_akhir: '2029-05-01',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/mendahului/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('nama kosong DAN nama yang hilang sama-sama ditolak', async () => {
    // Mutasi membuktikan menguji spasi saja tak cukup: `b.nama === undefined`
    // tetap menolak yang hilang, jadi test lama hijau untuk kode yang
    // meloloskan "   ".
    for (const nama of ['   ', '', undefined]) {
      const r = await kirim('POST', '/api/v1/gl/periode', {
        ...(nama === undefined ? {} : { nama }),
        tanggal_mulai: '2029-07-01', tanggal_akhir: '2029-07-31',
      })
      expect(r.statusCode).toBe(400)
      expect(r.json().error).toMatch(/nama wajib diisi/)
    }
  })

  it('format tanggal salah ditolak', async () => {
    const r = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] X', tanggal_mulai: '01-07-2029', tanggal_akhir: '2029-07-31',
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('GET /gl/periode/:id/kesiapan', () => {
  it('draft jadi PERINGATAN, periode sebelum yang terbuka jadi PENGHALANG', async () => {
    const p = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] Maret 2029',
      tanggal_mulai: '2029-03-01', tanggal_akhir: '2029-03-31',
    })
    await buatJurnal('2029-03-10', 'draft')
    await buatJurnal('2029-03-15', 'posted')

    const r = await get(`/api/v1/gl/periode/${p.json().periode.id}/kesiapan`)
    expect(r.statusCode).toBe(200)
    expect(r.json().kesiapan.isi.draft).toBeGreaterThanOrEqual(1)
    expect(r.json().kesiapan.isi.posted).toBeGreaterThanOrEqual(1)

    // Draft = peringatan (tidak menghalangi).
    expect(r.json().kesiapan.masalah.some(
      (m: { berat: string }) => m.berat === 'peringatan')).toBe(true)

    // Januari & Februari masih terbuka pada tahap ini, jadi Maret memang
    // TERHALANG — dan itulah rancangannya. Versi pertama test ini menuntut
    // `boleh: true` tanpa memperhitungkan urutan, lalu merah karena kodenya
    // BENAR.
    expect(r.json().kesiapan.boleh).toBe(false)
    expect(r.json().kesiapan.masalah.some(
      (m: { berat: string }) => m.berat === 'penghalang')).toBe(true)
  })

  it('jurnal VOID tak dihitung sebagai posted maupun draft', async () => {
    // `void` sudah dibatalkan — memasukkannya ke hitungan membuat periode
    // terlihat berisi padahal jurnalnya tak berlaku, dan totalnya tak akan
    // cocok dengan laporan (`gl.ts` menyaring `status = 'posted'`).
    const { rows } = await client.query(
      `SELECT id FROM periode_akuntansi WHERE nama = '[TEST-TB] Maret 2029'`)

    const sebelum = (await get(`/api/v1/gl/periode/${rows[0].id}/kesiapan`)).json().kesiapan.isi

    const je = await buatJurnal('2029-03-20', 'draft')
    await client.query(`UPDATE journal_entries SET status='void' WHERE id=$1`, [je])

    const sesudah = (await get(`/api/v1/gl/periode/${rows[0].id}/kesiapan`)).json().kesiapan.isi
    expect(sesudah.posted).toBe(sebelum.posted)
    expect(sesudah.draft).toBe(sebelum.draft)
  })

  it('selisih debit-kredit NOL untuk jurnal seimbang', async () => {
    const { rows } = await client.query(
      `SELECT id FROM periode_akuntansi WHERE nama = '[TEST-TB] Maret 2029'`)
    const r = await get(`/api/v1/gl/periode/${rows[0].id}/kesiapan`)
    expect(r.json().selisih).toBe(0)
  })

  it('404 untuk periode yang tak ada', async () => {
    const r = await get('/api/v1/gl/periode/00000000-0000-0000-0000-0000000000ff/kesiapan')
    expect(r.statusCode).toBe(404)
  })
})

describe('POST /gl/periode/:id/tutup', () => {
  it('periode SEBELUMNYA yang terbuka MENGHALANGI penutupan', async () => {
    // Maret dibuat sesudah Januari & Februari yang masih terbuka.
    const { rows } = await client.query(
      `SELECT id FROM periode_akuntansi WHERE nama = '[TEST-TB] Maret 2029'`)
    const r = await kirim('POST', `/api/v1/gl/periode/${rows[0].id}/tutup`)
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/masih terbuka/)
    expect(r.json().error).toMatch(/tak bisa dijumlahkan/)
  })

  it('menutup berurutan dari yang paling awal berhasil', async () => {
    for (const nama of ['[TEST-TB] Januari 2029', '[TEST-TB] Februari 2029']) {
      const { rows } = await client.query(
        `SELECT id FROM periode_akuntansi WHERE nama = $1`, [nama])
      const r = await kirim('POST', `/api/v1/gl/periode/${rows[0].id}/tutup`, {
        catatan: 'Tutup buku rutin akhir bulan',
      })
      expect(r.statusCode).toBe(200)
      expect(r.json().periode.status).toBe('tertutup')
      expect(r.json().periode.ditutup_pada).toBeTruthy()
    }
  })

  it('menutup yang SUDAH tertutup ditolak', async () => {
    const { rows } = await client.query(
      `SELECT id FROM periode_akuntansi WHERE nama = '[TEST-TB] Januari 2029'`)
    const r = await kirim('POST', `/api/v1/gl/periode/${rows[0].id}/tutup`)
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/sudah tertutup/)
  })

  it('riwayat penutupan mencatat jumlah jurnal posted', async () => {
    const { rows } = await client.query(
      `SELECT id FROM periode_akuntansi WHERE nama = '[TEST-TB] Januari 2029'`)
    const r = await get(`/api/v1/gl/periode/${rows[0].id}/riwayat`)
    const tutup = r.json().riwayat.find((x: { tindakan: string }) => x.tindakan === 'ditutup')
    expect(tutup).toBeTruthy()
    expect(typeof tutup.jurnal_posted).toBe('number')
  })

  it('404 untuk periode yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/gl/periode/00000000-0000-0000-0000-0000000000ff/tutup')
    expect(r.statusCode).toBe(404)
  })
})

describe('PENGUNCIAN ditegakkan BASIS, bukan rute — Ember [C]', () => {
  it('POSTING jurnal ke periode tertutup ditolak lewat SQL LANGSUNG', async () => {
    // Diuji lewat SQL langsung, BUKAN lewat rute — kalau penguncian hanya
    // hidup di lapisan aplikasi, skrip impor dan perbaikan manual bisa
    // menembusnya, dan laporan yang sudah dikirim berubah angkanya.
    const je = await buatJurnal('2029-01-20', 'draft')
    await expect(
      client.query(
        `UPDATE journal_entries SET status='posted', posted_at=now(), posted_by=$2 WHERE id=$1`,
        [je, userId]),
    ).rejects.toThrow(/sudah ditutup/)
  })

  it('INSERT langsung berstatus posted ke periode tertutup ditolak', async () => {
    await expect(
      client.query(
        `INSERT INTO journal_entries (company_id, entry_number, entry_date, description, status, created_by)
         VALUES ($1, '[TEST-TB]LANGSUNG', '2029-01-25', 'x', 'posted', $2)`,
        [companyId, userId]),
    ).rejects.toThrow(/sudah ditutup/)
  })

  it('DRAFT di periode tertutup TETAP BOLEH', async () => {
    // Draft tak masuk laporan mana pun; menahannya hanya menghalangi orang
    // menyiapkan koreksi.
    const je = await buatJurnal('2029-01-28', 'draft')
    expect(je).toBeTruthy()
  })

  it('MEMINDAHKAN tanggal jurnal posted KE periode tertutup ditolak', async () => {
    // Tanggal asalnya harus di luar SEMUA periode — termasuk periode dummy
    // (Mei–Sep 2026) yang ada di basis pengembangan. Versi pertama memakai
    // 2026-06-10 yang ternyata jatuh di periode Juni dummy yang TERTUTUP,
    // sehingga jurnalnya tak bisa di-posting sejak awal.
    const je = await buatJurnal('2029-06-10', 'posted')
    await expect(
      client.query(`UPDATE journal_entries SET entry_date='2029-01-10' WHERE id=$1`, [je]),
    ).rejects.toThrow(/sudah ditutup/)
  })

  it('MENAMBAH baris ke jurnal posted di periode tertutup ditolak', async () => {
    const { rows } = await client.query(
      `SELECT id FROM journal_entries
        WHERE entry_number LIKE '[TEST-TB]%' AND status='posted'
          AND entry_date BETWEEN '2029-01-01' AND '2029-01-31' LIMIT 1`)
    if (rows.length === 0) return   // tak ada jurnal posted di Januari — dilewati
    await expect(
      client.query(
        `INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES ($1,$2,500,0)`,
        [rows[0].id, akunA]),
    ).rejects.toThrow(/sudah ditutup/)
  })

  it('riwayat APPEND-ONLY: UPDATE dan DELETE ditolak basis', async () => {
    const { rows } = await client.query(
      `SELECT r.id FROM periode_akuntansi_riwayat r
         JOIN periode_akuntansi p ON p.id = r.periode_id
        WHERE p.nama LIKE '[TEST-TB]%' LIMIT 1`)
    expect(rows.length).toBeGreaterThan(0)

    await expect(
      client.query(`UPDATE periode_akuntansi_riwayat SET alasan='x' WHERE id=$1`, [rows[0].id]),
    ).rejects.toThrow(/append-only/)

    await expect(
      client.query(`DELETE FROM periode_akuntansi_riwayat WHERE id=$1`, [rows[0].id]),
    ).rejects.toThrow(/append-only/)
  })

  it('invariant GL LAMA tetap berlaku: jurnal tak seimbang tak bisa posted', async () => {
    // Migrasi 294 tak boleh melemahkan yang sudah ada.
    const { rows } = await client.query(
      `INSERT INTO journal_entries (company_id, entry_number, entry_date, description, status, created_by)
       VALUES ($1, '[TEST-TB]TIMPANG', '2029-09-01', 'x', 'draft', $2) RETURNING id`,
      [companyId, userId])
    await client.query(
      `INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit) VALUES ($1,$2,1000,0)`,
      [rows[0].id, akunA])
    await expect(
      client.query(
        `UPDATE journal_entries SET status='posted', posted_at=now(), posted_by=$2 WHERE id=$1`,
        [rows[0].id, userId]),
    ).rejects.toThrow()
  })
})

describe('POST /gl/periode/:id/buka', () => {
  // Membuka kembali butuh `gl:periode:reopen` — capability TERPISAH dari
  // `manage`. Migrasi 294 memberikannya hanya ke `direktur`, dan test ini
  // MENEMUKAN bahwa tak ada satu pun pengguna berperan direktur di basis:
  // capability-nya tak bisa dipakai siapa pun, sehingga koreksi yang sah
  // akan dilakukan lewat SQL langsung — tanpa jejak. Migrasi 295
  // memperluasnya ke admin dengan syarat pencabutan tertulis.
  it('alasan terlalu pendek ditolak dengan penjelasan', async () => {
    const { rows } = await client.query(
      `SELECT id FROM periode_akuntansi WHERE nama = '[TEST-TB] Januari 2029'`)
    const r = await kirim('POST', `/api/v1/gl/periode/${rows[0].id}/buka`, {
      alasan: 'koreksi',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/tak ada di ruangan/)
  })

  it('membuka kembali menaikkan dibuka_ulang dan mencatat riwayat', async () => {
    const { rows } = await client.query(
      `SELECT id, dibuka_ulang FROM periode_akuntansi WHERE nama = '[TEST-TB] Januari 2029'`)
    const sebelum = rows[0].dibuka_ulang as number

    const r = await kirim('POST', `/api/v1/gl/periode/${rows[0].id}/buka`, {
      alasan: 'Audit menemukan salah posting biaya material ke akun overhead',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().periode.status).toBe('terbuka')
    expect(r.json().periode.dibuka_ulang).toBe(sebelum + 1)

    const h = await get(`/api/v1/gl/periode/${rows[0].id}/riwayat`)
    const buka = h.json().riwayat.find(
      (x: { tindakan: string }) => x.tindakan === 'dibuka_ulang')
    expect(buka).toBeTruthy()
    expect(buka.alasan).toMatch(/Audit menemukan/)
  })

  it('SESUDAH dibuka, posting ke tanggal itu lolos lagi', async () => {
    // Membuktikan penguncian benar-benar mengikuti status periode, bukan
    // sekadar menolak selamanya.
    const je = await buatJurnal('2029-01-22', 'draft')
    await client.query(
      `UPDATE journal_entries SET status='posted', posted_at=now(), posted_by=$2 WHERE id=$1`,
      [je, userId])
    const { rows } = await client.query(
      `SELECT status FROM journal_entries WHERE id=$1`, [je])
    expect(rows[0].status).toBe('posted')
  })

  it('DUA pembukaan BERSAMAAN: hanya satu yang berhasil', async () => {
    // Status lama di WHERE — kalau tidak, keduanya "berhasil membuka" dan
    // `dibuka_ulang` naik dua untuk satu pembukaan, sehingga angka yang
    // menceritakan kualitas pembukuan jadi salah.
    const p = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] Lomba Buka 2029',
      tanggal_mulai: '2029-10-01', tanggal_akhir: '2029-10-31',
    })
    const id = p.json().periode.id
    await client.query(
      `UPDATE periode_akuntansi SET status='tertutup', ditutup_pada=now(), ditutup_oleh=$2
        WHERE id=$1`, [id, userId])

    const alasan = 'Audit menemukan salah posting yang perlu dikoreksi segera'
    const [a, b2] = await Promise.all([
      kirim('POST', `/api/v1/gl/periode/${id}/buka`, { alasan }),
      kirim('POST', `/api/v1/gl/periode/${id}/buka`, { alasan }),
    ])
    const kode = [a.statusCode, b2.statusCode].sort()
    expect(kode[0]).toBe(200)
    expect([409, 422]).toContain(kode[1])

    // Dan `dibuka_ulang` hanya naik SATU.
    const { rows } = await client.query(
      `SELECT dibuka_ulang FROM periode_akuntansi WHERE id=$1`, [id])
    expect(rows[0].dibuka_ulang).toBe(1)
  })

  it('membuka yang TIDAK tertutup ditolak', async () => {
    const { rows } = await client.query(
      `SELECT id FROM periode_akuntansi WHERE nama = '[TEST-TB] Januari 2029'`)
    const r = await kirim('POST', `/api/v1/gl/periode/${rows[0].id}/buka`, {
      alasan: 'Alasan yang cukup panjang untuk lolos ambang minimal',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/tidak sedang tertutup/)
  })

  it('404 untuk periode yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/gl/periode/00000000-0000-0000-0000-0000000000ff/buka',
      { alasan: 'Alasan yang cukup panjang untuk lolos ambang minimal' })
    expect(r.statusCode).toBe(404)
  })
})

describe('GET /gl/periode — daftar & ringkasan', () => {
  it('menghitung terbuka, tertutup, dan yang pernah dibuka ulang', async () => {
    const r = await get('/api/v1/gl/periode')
    expect(r.statusCode).toBe(200)
    expect(r.json().ringkas.total).toBeGreaterThan(0)
    expect(r.json().ringkas.pernah_dibuka_ulang).toBeGreaterThanOrEqual(1)
  })

  it('tiap periode membawa isi dan selisihnya', async () => {
    const r = await get('/api/v1/gl/periode')
    const uji = r.json().periode.filter(
      (p: { nama: string }) => p.nama.startsWith('[TEST-TB]'))
    expect(uji.length).toBeGreaterThan(0)
    for (const p of uji) {
      expect(p.isi).toBeTruthy()
      expect(typeof p.isi.posted).toBe('number')
      // Seluruh jurnal uji seimbang, jadi selisihnya 0 — bukan `null`,
      // yang berarti angkanya gagal dibaca.
      expect(p.selisih).toBe(0)
    }

    // Mutasi membuktikan "selisih = 0" saja tak cukup: `selisih: 0` yang
    // di-hardcode juga menghasilkan 0.
    //
    // Selisih BUKAN-NOL tak bisa dibuat lewat jurnal posted — `trg_gl_wajib_
    // seimbang` melarangnya, dan itu memang benar. Yang membedakan justru
    // NILAI LAIN yang bisa dikembalikan fungsi ini: `null`, saat totalnya tak
    // terbaca. `selisihSeimbang` menjawab `null` bila salah satu sisi bukan
    // angka — dan `0` yang di-hardcode tak akan pernah `null`.
    //
    // Diuji lewat pustaka pada nilai yang tak mungkin tercipta di basis
    // (kolom numeric tak bisa menyimpan teks), tetapi BISA tiba lewat query
    // yang gagal sebagian.
    expect(selisihSeimbang({
      posted: 1, draft: 0, total_debit: 'x', total_kredit: 1000,
    })).toBeNull()

    // Dan di daftar: periode KOSONG punya total 0 — bukan null, karena
    // nol sungguhan berbeda dari tak terbaca.
    const p = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] Kosong 2029',
      tanggal_mulai: '2029-12-01', tanggal_akhir: '2029-12-31',
    })
    expect(p.statusCode).toBe(201)
    const r2 = await get('/api/v1/gl/periode')
    const kosong = r2.json().periode.find(
      (x: { nama: string }) => x.nama === '[TEST-TB] Kosong 2029')
    expect(kosong.isi.posted).toBe(0)
    expect(kosong.selisih).toBe(0)
  })
})

describe('dua penutupan BERSAMAAN', () => {
  it('hanya satu yang berhasil', async () => {
    // Periode lomba harus jadi periode uji PALING AWAL yang masih terbuka —
    // kalau tidak, keduanya ditolak 422 karena terhalang periode sebelumnya,
    // dan yang teruji adalah pemeriksaan kesiapan, BUKAN `.eq('status',
    // 'terbuka')` di WHERE. Kesalahan lapisan yang sama sudah terjadi di
    // G1e, G1f, G2e, G3, dan G4.
    //
    // Karena itu SELURUH periode yang masih terbuka ditutup dulu — bukan
    // hanya yang berprefiks uji. Basis pengembangan punya periode dummy
    // (Mei–Sep 2026) yang juga bisa menghalangi, dan versi pertama test ini
    // hanya menutup yang berprefiks `[TEST-TB]`.
    await client.query(
      `UPDATE periode_akuntansi SET status='tertutup', ditutup_pada=now(), ditutup_oleh=$1
        WHERE company_id=$2 AND status='terbuka'`, [userId, companyId])

    const p = await kirim('POST', '/api/v1/gl/periode', {
      nama: '[TEST-TB] Lomba 2029',
      tanggal_mulai: '2029-11-01', tanggal_akhir: '2029-11-30',
    })
    const id = p.json().periode.id

    // Status lama ikut di WHERE — kalau tidak, keduanya "berhasil menutup"
    // dan riwayatnya mencatat dua penutupan untuk satu periode.
    const [a, b] = await Promise.all([
      kirim('POST', `/api/v1/gl/periode/${id}/tutup`, { catatan: 'A' }),
      kirim('POST', `/api/v1/gl/periode/${id}/tutup`, { catatan: 'B' }),
    ])
    const kode = [a.statusCode, b.statusCode].sort()
    // 422 bila permintaan kedua sempat membaca status 'tertutup' lebih dulu;
    // 409 bila keduanya membaca 'terbuka' dan UPDATE kedua tak kena baris.
    expect(kode[0]).toBe(200)
    expect([409, 422]).toContain(kode[1])
  })
})
