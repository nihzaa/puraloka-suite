/**
 * RK3K benar-benar tercetak — Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * RK3K adalah dokumen yang DISERAHKAN ke panitia tender. Yang menentukan
 * bukan apa yang tersimpan di basis maupun apa yang tampil di layar,
 * melainkan apa yang ada di kertas — dan status 200 tetap keluar meski
 * lampirannya kosong melompong.
 *
 * ── Yang paling penting dijaga: bagian KOSONG tetap terlihat
 *
 * Godaan seorang pencetak adalah melewati bagian yang tak punya isi supaya
 * dokumennya rapi. Justru itu yang berbahaya: bagian yang hilang sama sekali
 * dari daftar isi terbaca seperti bagian yang TAK DIMINTA, dan pemeriksa
 * kehilangan satu-satunya petunjuk bahwa ada yang belum dipertanggungjawabkan.
 *
 * Dokumen rapi yang menyembunyikan kekosongannya persis jadi apa yang
 * penundaan modul ini dulu ingin cegah: bukti bahwa K3-nya administratif
 * belaka. Karena itu berkas ini MEMBUAT sebuah bagian jadi kosong, lalu
 * menuntut kata "BELUM ADA CATATAN" muncul di kertasnya.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { teksPdf } from '../../../test-utils/teks-pdf.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import k3Routes from '../k3-lapangan.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let namaAwal: string | null = null

const NAMA_UJI = 'PT UJI RK3K PURALOKA'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  companyId = await companyBerisi(db, auth, ['projects'])

  // Proyek dipilih yang BENAR-BENAR punya catatan K3. Memilih sembarang
  // proyek menghasilkan lima bagian kosong, dan test "isi tercetak" akan
  // gagal sambil menuduh pencetaknya — padahal proyeknya yang salah pilih.
  const { rows: p } = await db.query(
    `SELECT p.id
       FROM projects p
      WHERE p.company_id = $1
        AND EXISTS (SELECT 1 FROM induksi_k3 i WHERE i.project_id = p.id)
      LIMIT 1`, [companyId])
  if (!p.length) throw new Error('butuh proyek ber-induksi K3 — fixture tak terbentuk')
  projectId = p[0].id

  const { rows: c } = await db.query('SELECT legal_name FROM companies WHERE id = $1', [companyId])
  namaAwal = c[0]?.legal_name ?? null
  await db.query('UPDATE companies SET legal_name = $1 WHERE id = $2', [NAMA_UJI, companyId])

  app = Fastify({ logger: false })
  await app.register(k3Routes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  // Data dev yang NYATA disunting di sini, bukan fixture buatan sendiri.
  await db.query('UPDATE companies SET legal_name = $1 WHERE id = $2', [namaAwal, companyId])
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('RK3K — JSON dan PDF berasal dari satu perakit', () => {
  it('JSON memulangkan lima bagian dan TIDAK mengangkut rincinya', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/k3/rk3k`)
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)
    const b = r.json()
    expect(b.bagian).toHaveLength(5)
    // Rinci bisa mencapai ratusan baris dan layar hanya menampilkan
    // hitungannya. Yang tak ditampilkan tak perlu diangkut.
    expect(b.rinci, 'rinci ikut terkirim ke layar — muatan yang tak dipakai').toBeUndefined()
  })

  it('hitungan di PDF sama dengan hitungan di JSON', async () => {
    // Kalau keduanya merakit sendiri-sendiri, yang dibaca di layar bukan yang
    // tercetak di kertas yang ditandatangani — dan itu tak punya gejala
    // sampai seseorang membandingkannya berdampingan.
    const j = (await get(`/api/v1/proyek/${projectId}/k3/rk3k`)).json()
    const p = await get(`/api/v1/proyek/${projectId}/k3/rk3k.pdf`)
    expect(p.statusCode).toBe(200)
    const isi = teksPdf(p.rawPayload)

    for (const b of j.bagian as Array<{ jumlah: number; judul: string }>) {
      if (b.jumlah > 0) {
        expect(isi, `hitungan "${b.judul}" tak tercetak`).toContain(`${b.jumlah} catatan`)
      }
    }
  })
})

describe('RK3K PDF', () => {
  it('terbit sebagai PDF ber-nama berkas, bukan JSON', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/k3/rk3k.pdf`)
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)
    expect(r.headers['content-type']).toContain('application/pdf')
    expect(String(r.headers['content-disposition'])).toContain('RK3K-')
    expect(String(r.headers['content-disposition'])).toContain('.pdf')
  })

  it('memuat kop tenant — dokumen tender tanpa identitas penerbit tak berarti', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/k3/rk3k.pdf`)
    const isi = teksPdf(r.rawPayload)
    expect(isi, 'nama perusahaan tak tercetak').toContain(NAMA_UJI)
    expect(isi).toContain('RENCANA KESELAMATAN')
  })

  it('memuat LAMPIRAN, bukan hanya angka rangkuman', async () => {
    // Pemeriksa tender menagih daftarnya. Rangkuman berangka saja tak bisa
    // diperiksa silang dengan apa pun.
    const r = await get(`/api/v1/proyek/${projectId}/k3/rk3k.pdf`)
    const isi = teksPdf(r.rawPayload)
    expect(isi).toContain('Induksi')
    // Nama peserta induksi yang sungguhan harus muncul.
    const { rows } = await db.query(
      `SELECT peserta_nama FROM induksi_k3
        WHERE project_id = $1 AND peserta_nama IS NOT NULL LIMIT 1`, [projectId])
    if (rows.length) {
      // Frasa PENDEK: teks PDF dirakit ulang dari pecahan operator TJ, dan
      // kalimat panjang bisa terpotong di tengah kata.
      const potong = String(rows[0].peserta_nama).split(' ')[0]
      expect(isi, `peserta "${potong}" tak tercetak di lampiran`).toContain(potong)
    }
  })

  it('memuat PERNYATAAN CAKUPAN — kertasnya tak boleh terbaca sebagai jaminan kelengkapan', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/k3/rk3k.pdf`)
    expect(teksPdf(r.rawPayload)).toContain('PERNYATAAN CAKUPAN')
  })

  it('bagian KOSONG tetap tercetak dan DITANDAI, bukan dilewati diam-diam', async () => {
    // Yang paling penting di berkas ini. Bagian yang hilang dari daftar isi
    // terbaca seperti bagian yang tak diminta.
    //
    // JSA dikosongkan SEMENTARA dengan memindahkannya ke proyek lain — bukan
    // dihapus, karena ini basis dev yang isinya dipakai test lain.
    const { rows: lain } = await db.query(
      `SELECT id FROM projects WHERE company_id = $1 AND id <> $2 LIMIT 1`,
      [companyId, projectId])
    const { rows: punya } = await db.query(
      'SELECT id FROM jsa WHERE project_id = $1', [projectId])

    if (!lain.length || !punya.length) {
      // Tak bisa dikosongkan tanpa merusak — periksa jalur yang sudah kosong.
      const j = (await get(`/api/v1/proyek/${projectId}/k3/rk3k`)).json()
      if (j.bagian_kosong.length === 0) return
      const r = await get(`/api/v1/proyek/${projectId}/k3/rk3k.pdf`)
      expect(teksPdf(r.rawPayload)).toContain('BELUM ADA CATATAN')
      return
    }

    const ids = punya.map((x: { id: string }) => x.id)
    await db.query('UPDATE jsa SET project_id = $1 WHERE id = ANY($2)', [lain[0].id, ids])
    try {
      const r = await get(`/api/v1/proyek/${projectId}/k3/rk3k.pdf`)
      const isi = teksPdf(r.rawPayload)
      expect(r.statusCode, 'dokumen menolak terbit saat ada bagian kosong — '
        + 'orang akan menyusunnya di Word, di luar jangkauan aplikasi ini').toBe(200)

      // ── Ringkasan (bagian A) menandainya
      expect(isi, 'ringkasan tak menandai bagian kosong').toContain('BELUM ADA CATATAN')
      expect(isi, 'judul bagian kosong ikut hilang dari ringkasan').toContain('Identifikasi Bahaya')

      // ── LAMPIRANnya juga, dan ini diperiksa TERPISAH.
      //
      // Mutasi pertama berkas ini lolos justru di sini: melewati lampiran
      // kosong diam-diam TIDAK membuat test merah, karena kata penandanya
      // sudah muncul di ringkasan beberapa sentimeter di atasnya.
      //
      // Ringkasan berbunyi "0 catatan" mudah terbaca sebagai kolom yang belum
      // diisi; lampiran yang HILANG membuat pembaca menyangka bagian itu tak
      // diminta. Keduanya lubang yang berbeda, jadi keduanya punya assertion
      // sendiri — frasa pendek, karena teks PDF dirakit dari pecahan TJ.
      expect(isi, 'judul LAMPIRAN bagian kosong hilang dari dokumen')
        .toContain('B. Identifikasi Bahaya')
      expect(isi, 'lampiran kosong dilewati diam-diam — pembaca menyangka bagian itu tak diminta')
        .toContain('Belum ada catatan untuk bagian ini')
    } finally {
      await db.query('UPDATE jsa SET project_id = $1 WHERE id = ANY($2)', [projectId, ids])
    }
  })
})
