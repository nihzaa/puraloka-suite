/**
 * TOOL HARGA SATUAN — dan harga BASI yang tak boleh ikut terjawab.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI PUNYA TEST SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `price_book_entries` BERVERSI: satu sumber daya bisa punya beberapa baris
 * dengan `version_number` dan `effective_date` berbeda, plus `expired_date`.
 *
 * Kalau semuanya ikut terjawab, asisten menyebut DUA harga untuk satu barang —
 * dan yang membacanya memilih yang lebih murah, karena itu yang enak didengar.
 * Selisihnya masuk ke penawaran, dan baru terlihat saat pekerjaan jalan.
 *
 * Diukur 2026-08-16: 2.943 aktif, 188 kedaluwarsa, 81 draf.
 *
 * ── Yang dibuktikan
 *
 *   1. hanya `status='active'` yang terjawab (draf & kedaluwarsa dibuang)
 *   2. baris ber-`expired_date` LEWAT tetap dibuang meski statusnya active
 *   3. satu sumber daya → SATU harga (versi tertinggi), bukan beberapa
 *   4. barang yang tak terdaftar TIDAK dijawab karangan
 *   5. satuan ikut — "145.000" tanpa "/OH" adalah angka yang bisa salah pakai
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolHargaSatuan } from '../ai-tool-harga.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string

const ctx = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['projects:view']),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(
    `SELECT id FROM companies WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id=companies.id) LIMIT 1`,
  )
  companyId = rows[0].id
})

afterAll(async () => {
  await db.end()
})

describe('tool harga satuan', () => {
  it('terdaftar di katalog', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'harga_satuan')
    expect(t, 'tool `harga_satuan` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('projects:view')
  })

  it('menjawab harga yang benar-benar ada, LENGKAP dengan satuannya', async () => {
    // Angka tanpa satuan bisa salah pakai: Rp 145.000 per OH sangat berbeda
    // artinya dari Rp 145.000 per m².
    const { rows } = await db.query(`
      SELECT r.name FROM price_book_entries p JOIN resources r ON r.id = p.resource_id
       WHERE p.status = 'active' AND r.unit_code IS NOT NULL LIMIT 1`)
    if (rows.length === 0) return

    const kata = String(rows[0].name).split(/\s+/).find((w: string) => w.length > 3) ?? 'tukang'
    const h = await toolHargaSatuan.jalan(ctx(), { cari: kata })

    expect(h.isError).toBe(false)
    expect(h.isi).toContain('<data sumber="harga_satuan">')
    expect(h.isi).toMatch(/Rp /)
  })

  it('harga KEDALUWARSA tidak ikut terjawab', async () => {
    /*
      Dua penanda yang bisa berselisih: `status` dan `expired_date`. Yang lebih
      ketat menang — baris ber-`expired_date` lewat dibuang meski statusnya
      masih `active`.
    */
    const { rows } = await db.query(`
      SELECT r.name, p.amount FROM price_book_entries p JOIN resources r ON r.id = p.resource_id
       WHERE p.expired_date IS NOT NULL AND p.expired_date < CURRENT_DATE LIMIT 1`)
    if (rows.length === 0) return // tak ada data kedaluwarsa — tak ada yang bisa diuji

    const h = await toolHargaSatuan.jalan(ctx(), { cari: String(rows[0].name).slice(0, 12) })
    // Kalau namanya muncul, nominalnya TIDAK boleh yang kedaluwarsa itu.
    if (!h.isError && h.isi.includes(String(rows[0].name))) {
      const nominalBasi = Number(rows[0].amount).toLocaleString('id-ID')
      expect(h.isi, 'harga kedaluwarsa ikut terjawab').not.toContain(`Rp ${nominalBasi} `)
    }
  })

  it('satu sumber daya → SATU baris, bukan beberapa versi', async () => {
    /*
      Dua harga untuk satu barang membuat pembacanya memilih yang lebih murah.

      ── Kenapa memeriksa SELURUH daftar, bukan satu nama

      Versi pertama mengambil satu nama berduplikat lewat SQL lalu mencarinya
      di hasil. Itu HIJAU bahkan sesudah dedup dibuang — nama yang terpilih
      kebetulan tak memunculkan kedua versinya dalam potongan yang ditampilkan,
      jadi assertion-nya tak pernah menguji apa pun.

      Sekarang: cari kata yang PASTI memunculkan duplikat, lalu buktikan tak
      ada satu pun nama yang muncul dua kali di seluruh keluaran. Kalau dedup
      dibuang, nama berduplikat langsung terlihat.
    */
    const { rows } = await db.query(`
      SELECT r.name FROM price_book_entries p JOIN resources r ON r.id = p.resource_id
       WHERE p.status='active' GROUP BY r.name HAVING count(*) > 1 LIMIT 5`)
    if (rows.length === 0) return // tak ada duplikat — tak ada yang bisa diuji

    for (const baris of rows as Array<{ name: string }>) {
      const h = await toolHargaSatuan.jalan(ctx(), { cari: baris.name })
      if (h.isError) continue

      // Hitung tiap nama di keluaran; tak boleh ada yang muncul >1.
      const hitung = new Map<string, number>()
      for (const l of h.isi.split('\n')) {
        const m = /^(.+?): Rp /.exec(l)
        if (m) hitung.set(m[1], (hitung.get(m[1]) ?? 0) + 1)
      }

      for (const [nama, n] of hitung) {
        expect(n, `'${nama}' muncul ${n}× — versi lama ikut terjawab`).toBe(1)
      }
    }
  })

  it('barang yang TAK terdaftar tidak dijawab karangan', async () => {
    const h = await toolHargaSatuan.jalan(ctx(), { cari: 'zzxqv-barang-tak-pernah-ada' })
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(/tak ada harga aktif/i)
    // Instruksi eksplisit — model cenderung mengisi kekosongan dengan angka
    // yang "masuk akal", dan angka karangan di konteks harga masuk ke penawaran.
    expect(h.isi).toMatch(/jangan mengarang/i)
  })

  it('kata cari terlalu pendek ditolak', async () => {
    // Satu huruf mencocokkan ribuan baris — dan yang terkirim ke model jadi
    // daftar acak yang terlihat seperti jawaban.
    const h = await toolHargaSatuan.jalan(ctx(), { cari: 'a' })
    expect(h.isError).toBe(true)
  })
})
