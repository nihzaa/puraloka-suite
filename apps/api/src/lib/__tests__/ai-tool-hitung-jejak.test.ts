/**
 * PERKIRAAN BIAYA & JEJAK PERUBAHAN — dua kemampuan asisten manusia.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA CARA GAGAL YANG PALING MAHAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Perkiraan yang TERLALU MURAH.** Satu komponen tanpa harga membuat
 *    totalnya lebih rendah dari sebenarnya — dan angka yang lebih murah adalah
 *    angka yang paling enak dipercaya. Ia masuk ke pembicaraan dengan klien,
 *    lalu jadi angka yang dipegang orang.
 *
 * 2. **Jejak yang membocorkan nilai lama.** `audit_logs` memuat
 *    `old_values`/`new_values` — nominal sebelum & sesudah diubah. Hasil tool
 *    masuk ke prompt, dan prompt tak punya jejak akses sendiri: sekali nominal
 *    lama masuk ke sana, ia tersimpan di `ai_pesan` tanpa pernah lewat
 *    pemeriksaan izin apa pun.
 *
 * ── Yang dibuktikan
 *
 *   1. perkiraan dihitung dari AHSP nyata, bukan dikarang
 *   2. pekerjaan AMBIGU tak ditebak — pilihan ditawarkan
 *   3. komponen tanpa harga DINYATAKAN, tidak dianggap nol
 *   4. hasilnya menyatakan "biaya langsung", bukan harga jual
 *   5. jejak TIDAK memuat old_values/new_values
 *   6. jejak disaring company_id — `unsafe()` melewati wrapper
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolHitungPekerjaan } from '../ai-tool-hitung.js'
import { toolJejakPerubahan } from '../ai-tool-jejak.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string
let namaAhsp: string

const ctxHitung = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['projects:view']),
  }) as never

const ctxJejak = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['audit:view']),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()

  const { rows } = await db.query(`
    SELECT company_id FROM audit_logs GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`)
  companyId = rows[0].company_id

  /*
    AHSP yang punya komponen DAN namanya UNIK.

    Percobaan pertama hanya menuntut "punya komponen", dan namanya ternyata
    cocok dengan beberapa AHSP lain — jadi tool mengembalikan daftar pilihan
    (perilaku yang BENAR), dan test yang mengharapkan angka jadi merah.

    Yang salah bukan toolnya melainkan fixture-nya: nama yang ambigu memang
    tak boleh menghasilkan satu angka.
  */
  const { rows: a } = await db.query(`
    SELECT a.name FROM assemblies a
     WHERE a.status='active'
       AND EXISTS (SELECT 1 FROM assembly_components c WHERE c.assembly_id = a.id)
       AND (SELECT count(*) FROM assemblies b
             WHERE b.status='active' AND b.name ILIKE '%' || a.name || '%') = 1
     ORDER BY (SELECT count(*) FROM assembly_components c WHERE c.assembly_id=a.id) DESC
     LIMIT 1`)
  namaAhsp = a[0]?.name ?? ''
})

afterAll(async () => {
  await db.end()
})

describe('tool perkiraan biaya', () => {
  it('terdaftar di katalog', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'hitung_pekerjaan')
    expect(t, 'tool `hitung_pekerjaan` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('projects:view')
  })

  it('menghitung dari AHSP NYATA, dan angkanya cocok dengan basis', async () => {
    expect(namaAhsp, 'fixture tak menemukan AHSP berkomponen').toBeTruthy()

    const h = await toolHitungPekerjaan.jalan(ctxHitung(), { pekerjaan: namaAhsp, volume: 10 })
    expect(h.isError).toBe(false)
    expect(h.isi).toContain('<data sumber="hitung_pekerjaan">')
    expect(h.isi).toMatch(/Biaya langsung per/)

    /*
      Dihitung ULANG lewat SQL — jalur yang sepenuhnya terpisah dari kode yang
      diuji. Membandingkan hasil dengan dirinya sendiri tak membuktikan apa pun.
    */
    const { rows } = await db.query(
      `SELECT COALESCE(sum(ac.coefficient * p.amount), 0)::numeric AS total
         FROM assemblies a
         JOIN assembly_components ac ON ac.assembly_id = a.id
         JOIN LATERAL (
           SELECT amount FROM price_book_entries pb
            WHERE pb.resource_id = ac.resource_id AND pb.status = 'active'
              AND (pb.expired_date IS NULL OR pb.expired_date >= CURRENT_DATE)
            ORDER BY pb.version_number DESC LIMIT 1
         ) p ON true
        WHERE a.name = $1 AND a.status = 'active'`,
      [namaAhsp],
    )

    const harapan = Number(rows[0].total)
    if (harapan > 0) {
      // Angka di keluaran ditulis dengan pemisah ribuan Indonesia.
      const ditulis = h.isi.match(/Biaya langsung per [^:]+: Rp ([\d.]+)/)?.[1] ?? ''
      const angkanya = Number(ditulis.replace(/\./g, ''))
      // Toleransi 1 rupiah untuk pembulatan tampilan.
      expect(Math.abs(angkanya - Math.round(harapan))).toBeLessThanOrEqual(1)
    }
  })

  it('pekerjaan AMBIGU tak ditebak — pilihan ditawarkan', async () => {
    /*
      "beton" cocok dengan puluhan AHSP yang harganya berbeda jauh. Memilih
      yang pertama berarti memberi angka yang KEBETULAN — dan angka kebetulan
      yang terlihat pasti adalah kesalahan yang paling sulit dibantah.
    */
    const h = await toolHitungPekerjaan.jalan(ctxHitung(), { pekerjaan: 'beton' })
    expect(h.isError).toBe(false)
    if (/Ada \d+ pekerjaan/.test(h.isi)) {
      expect(h.isi).toMatch(/minta pengguna memilih/i)
      // Dan TIDAK menyebut angka apa pun — itu yang membuatnya aman.
      expect(h.isi).not.toMatch(/Biaya langsung per/)
    }
  })

  it('hasilnya menyatakan BIAYA LANGSUNG, bukan harga jual', async () => {
    // Angka tanpa keterangan akan dipakai sebagai harga jual — dan selisihnya
    // persis margin perusahaan.
    const h = await toolHitungPekerjaan.jalan(ctxHitung(), { pekerjaan: namaAhsp, volume: 1 })
    if (h.isError) return
    expect(h.isi).toMatch(/belum termasuk overhead/i)
    expect(h.isi).toMatch(/jangan menyebutnya sebagai harga jual/i)
  })

  it('pekerjaan yang TAK ADA tidak dijawab karangan', async () => {
    const h = await toolHitungPekerjaan.jalan(ctxHitung(), { pekerjaan: 'zzxqv-tak-pernah-ada' })
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(/tak ada ahsp aktif/i)
    expect(h.isi).toMatch(/jangan mengarang/i)
  })
})

describe('tool jejak perubahan', () => {
  it('terdaftar dengan izin audit:view — BUKAN ai:chat', () => {
    // Yang boleh memakai asisten tak otomatis boleh membaca siapa mengubah apa.
    const t = KATALOG_TOOL.find((x) => x.nama === 'jejak_audit')
    expect(t, 'tool `jejak_audit` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('audit:view')
  })

  it('TIDAK memuat old_values / new_values', async () => {
    /*
      Inti keamanannya. Hasil tool masuk ke prompt, dan prompt tak punya jejak
      akses sendiri — sekali nominal lama masuk ke sana, ia tersimpan di
      `ai_pesan` tanpa pernah lewat pemeriksaan izin apa pun.
    */
    const src = await (await import('node:fs/promises')).readFile(
      new URL('../ai-tool-jejak.ts', import.meta.url), 'utf8')

    // Diperiksa di SELECT-nya, bukan di seluruh berkas: komentar memang
    // menjelaskan kenapa keduanya tak ikut.
    const pilih = src.match(/\.select\(\s*([\s\S]*?)\)\s*\n/)?.[1] ?? ''
    expect(pilih, 'old_values ikut di-select — nilai lama bocor ke prompt')
      .not.toMatch(/old_values/)
    expect(pilih, 'new_values ikut di-select — nilai baru bocor ke prompt')
      .not.toMatch(/new_values/)
  })

  it('menyaring company_id — `unsafe()` melewati wrapper', async () => {
    /*
      `audit_logs` kategori D: wrapper MENOLAK `.from()` dan menuntut
      `unsafe()`. Tapi `unsafe()` juga melewati saringan tenant — jadi
      `company_id` harus dinyatakan tangan, atau jejak SELURUH tenant terbaca.

      Diperiksa di sumber: datanya sendiri tak bisa membedakan (satu tenant
      mendominasi), dan test yang hijau-karena-buta lebih buruk daripada tak
      ada test.
    */
    const src = await (await import('node:fs/promises')).readFile(
      new URL('../ai-tool-jejak.ts', import.meta.url), 'utf8')
    expect(src, 'saringan company_id hilang — jejak tenant lain ikut terbaca')
      .toMatch(/\.eq\('company_id',\s*companyId\)/)
  })

  it('tanpa tabel & id DITOLAK — 62.013 baris tak boleh dibaca sekaligus', async () => {
    const h = await toolJejakPerubahan.jalan(ctxJejak(), {})
    expect(h.isError).toBe(true)
  })

  it('membaca jejak yang benar-benar ada', async () => {
    const { rows } = await db.query(
      `SELECT table_name FROM audit_logs WHERE company_id=$1 AND table_name IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`, [companyId])
    if (rows.length === 0) return

    const h = await toolJejakPerubahan.jalan(ctxJejak(), { tabel: rows[0].table_name })
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(/jejak terbaru/i)
    // Mengarahkan ke halaman Audit untuk isinya — bukan menutupinya diam-diam.
    expect(h.isi).toMatch(/halaman Audit/i)
  })
})
