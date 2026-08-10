/**
 * S4 — template pesan WA: perenderan, penolakan, dan basis nyata.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * · placeholder SALAH KETIK → GAGAL, bukan string kosong yang senyap
 * · nilai di luar daftar `variabel` tak bisa masuk (kebocoran field)
 * · nilai yang memuat `{{ }}` dinetralkan — injeksi template
 * · template hilang/rusak → CADANGAN dipakai, tapi DICATAT
 * · isolasi tenant: template tenant lain tak terbaca
 *
 * ── Kenapa "gagal, bukan kosong" pantas diuji sendiri
 *
 * Interpolasi bebas (`konteks[k] ?? ''`) adalah satu baris yang bekerja untuk
 * semua kasus — dan itulah bahayanya. Template "Halo {{nma}}," terkirim
 * sebagai "Halo ," tanpa satu pun galat. Pelanggan menerima pesan yang
 * terlihat rusak, dan yang menulis template tak pernah tahu.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import {
  MAKS_NILAI,
  bersihkanNilai,
  render,
  renderDariDb,
  variabelDipakai,
  type Template,
} from '../wa-template.js'

const TPL = (ubah: Partial<Template> = {}): Template => ({
  kode: 'uji',
  label: 'Uji',
  isi: 'Halo {{nama}}, kode Anda {{kode}}.',
  variabel: ['nama', 'kode'],
  aktif: true,
  ...ubah,
})

describe('perenderan — fungsi murni', () => {
  it('mengisi placeholder yang terdaftar', () => {
    const h = render(TPL(), { nama: 'Budi', kode: '123456' })
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.teks).toBe('Halo Budi, kode Anda 123456.')
  })

  it('placeholder SALAH KETIK → gagal, BUKAN string kosong', () => {
    // Inti berkas ini. Dengan interpolasi bebas, ini terkirim sebagai
    // "Halo , kode Anda 123456." tanpa satu pun galat.
    const h = render(TPL({ isi: 'Halo {{nma}}, kode {{kode}}.' }), {
      nama: 'Budi',
      kode: '1',
    })
    expect(h.ok).toBe(false)
    if (!h.ok) {
      expect(h.alasan).toBe('variabel_tak_dikenal')
      // Pesannya menyebut YANG SALAH dan YANG TERSEDIA — supaya yang
      // memperbaikinya tak perlu menebak.
      expect(h.pesan).toContain('nma')
      expect(h.pesan).toContain('nama')
    }
  })

  it('nilai KURANG → gagal, bukan pesan berlubang', () => {
    const h = render(TPL(), { nama: 'Budi' })
    expect(h.ok).toBe(false)
    if (!h.ok) {
      expect(h.alasan).toBe('nilai_kurang')
      expect(h.pesan).toContain('kode')
    }
  })

  it('template nonaktif ditolak', () => {
    const h = render(TPL({ aktif: false }), { nama: 'a', kode: 'b' })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('nonaktif')
  })

  it('nilai TAMBAHAN di luar daftar diabaikan, tak bocor ke pesan', () => {
    /*
     * Kalau kelak seseorang meneruskan objek yang kebetulan berisi kunci API,
     * ia TAK BOLEH bisa masuk pesan lewat placeholder — dan template yang
     * mencobanya sudah gagal di test sebelumnya. Di sini yang dibuktikan:
     * nilai berlebih tak muncul dengan sendirinya.
     */
    const h = render(TPL(), {
      nama: 'Budi',
      kode: '1',
      apiKey: 'sk-rahasia-yang-tak-boleh-keluar',
    })
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.teks).not.toContain('sk-rahasia')
  })
})

describe('injeksi template — nilai yang memuat placeholder', () => {
  it('`{{` di dalam NILAI dinetralkan', () => {
    // Judul temuan yang diketik seseorang bisa memuat `{{kode}}`. Tanpa
    // penetralan, ia ikut terganti pada perenderan berikutnya.
    const h = render(TPL(), { nama: '{{kode}}', kode: 'RAHASIA' })
    expect(h.ok).toBe(true)
    if (h.ok) {
      expect(h.teks).not.toContain('{{kode}}')
      // Nilai aslinya tetap terbaca manusia — dinetralkan, bukan dibuang.
      expect(h.teks).toContain('kode}}')
    }
  })

  it('nilai raksasa DIPOTONG', () => {
    const h = render(TPL(), { nama: 'a'.repeat(5_000), kode: '1' })
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.teks.length).toBeLessThan(MAKS_NILAI + 100)
  })

  it('bersihkanNilai menangani null/undefined tanpa melempar', () => {
    expect(bersihkanNilai(null)).toBe('')
    expect(bersihkanNilai(undefined)).toBe('')
    expect(bersihkanNilai(0)).toBe('0')
  })

  it('variabelDipakai membaca placeholder unik saja', () => {
    expect(variabelDipakai('{{a}} {{b}} {{a}}')).toEqual(['a', 'b'])
    expect(variabelDipakai('tanpa placeholder')).toEqual([])
  })
})

describe('terhadap basis NYATA', () => {
  let db: Client
  let companyId: string

  beforeAll(async () => {
    db = await createRlsClient()
    const { rows } = await db.query(`SELECT id FROM companies WHERE code = 'puraloka-persada'`)
    companyId = rows[0].id
  }, 60_000)

  afterAll(async () => {
    await db.query(`DELETE FROM wa_template WHERE kode LIKE 'uji-s4%'`)
    await db.end()
  })

  it('template bawaan migrasi 270 ADA dan bisa dirender', async () => {
    const teks = await renderDariDb(
      createTenantDb(companyId),
      'verifikasi_nomor',
      { kode: '987654', menit: 10 },
      'CADANGAN',
    )
    // Kalau ini mengembalikan 'CADANGAN', template bawaannya hilang — dan
    // seluruh gunanya migrasi 270 batal tanpa satu pun galat.
    expect(teks).not.toBe('CADANGAN')
    expect(teks).toContain('987654')
    expect(teks).toContain('10 menit')
  })

  it('template TAK ADA → cadangan dipakai, DAN dicatat', async () => {
    const catatan: string[] = []
    const teks = await renderDariDb(
      createTenantDb(companyId),
      'kode-yang-tak-pernah-ada',
      {},
      'CADANGAN',
      (p) => catatan.push(p),
    )
    expect(teks).toBe('CADANGAN')
    // Cadangan yang dipakai DIAM-DIAM membuat template yang hilang tak
    // pernah diperbaiki.
    expect(catatan.length).toBeGreaterThan(0)
    expect(catatan[0]).toContain('tak ada')
  })

  it('template RUSAK → cadangan dipakai, DAN dicatat', async () => {
    await db.query(
      `INSERT INTO wa_template (company_id, kode, label, isi, variabel)
       VALUES ($1, 'uji-s4-rusak', 'Rusak', 'Halo {{tak_terdaftar}}', ARRAY[]::text[])`,
      [companyId],
    )
    const catatan: string[] = []
    const teks = await renderDariDb(
      createTenantDb(companyId),
      'uji-s4-rusak',
      {},
      'CADANGAN',
      (p) => catatan.push(p),
    )
    expect(teks).toBe('CADANGAN')
    expect(catatan[0]).toContain('variabel_tak_dikenal')
  })

  it('template tenant LAIN tak terbaca', async () => {
    const { rows: pemilik } = await db.query(
      `SELECT owner_user_id FROM companies WHERE code = 'puraloka-persada'`)
    const { rows: lain } = await db.query(
      `INSERT INTO companies (code, name, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
      [`uji-s4-${Date.now()}`, '[UJI-S4] Tenant Lain', pemilik[0].owner_user_id],
    )
    await db.query(
      `INSERT INTO wa_template (company_id, kode, label, isi)
       VALUES ($1, 'uji-s4-milik-lain', 'Milik lain', 'RAHASIA TENANT LAIN')`,
      [lain[0].id],
    )

    const teks = await renderDariDb(
      createTenantDb(companyId),
      'uji-s4-milik-lain',
      {},
      'CADANGAN',
    )
    expect(teks).toBe('CADANGAN')
    expect(teks).not.toContain('RAHASIA')

    await db.query(`DELETE FROM wa_template WHERE company_id = $1`, [lain[0].id])
    await db.query(`UPDATE companies SET is_active = false WHERE id = $1`, [lain[0].id])
  })

  it('template bawaan lengkap — ketiganya', async () => {
    const { rows } = await db.query(
      `SELECT kode FROM wa_template WHERE company_id = $1
        AND kode IN ('verifikasi_nomor', 'asisten_tanpa_izin', 'asisten_gagal')`,
      [companyId],
    )
    expect(rows).toHaveLength(3)
  })
})
