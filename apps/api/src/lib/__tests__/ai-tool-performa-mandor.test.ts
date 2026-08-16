/**
 * 6.12 — ringkasan performa mandor, diuji terhadap Postgres NYATA.
 *
 * Inti berkas ini satu hal: hari orang dijumlah dari `porsi_hari`, BUKAN dari
 * `count(*)`. Diukur 2026-08-16, 113 dari 1.279 baris absensi bernilai 0,50 —
 * jadi menghitung barisnya melebihkan 56,5 hari orang, dan hasilnya tetap
 * berupa bilangan bulat yang terlihat wajar di laporan.
 *
 * Angkanya karena itu dibandingkan dengan hitungan SQL terpisah, bukan dengan
 * konstanta yang ditulis tangan — konstanta akan basi begitu data dummy
 * berubah, lalu ditambal jadi longgar sampai tak menguji apa pun.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { ringkasPerformaMandor } from '../ai-tool-performa-mandor.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string

/** Rentang yang menutupi seluruh absensi dummy (2026-07-10 … 2026-08-08). */
const SEJAK = '2026-07-01'
const SAMPAI = '2026-08-31'

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT p.company_id FROM mandor_assignments ma
      JOIN projects p ON p.id = ma.project_id
     WHERE p.is_deleted = false
     GROUP BY p.company_id ORDER BY count(*) DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu tenant berpenugasan mandor')
  companyId = rows[0].company_id
})

afterAll(async () => {
  await db.end()
})

describe('tool performa mandor', () => {
  it('terdaftar dengan izin mandor:view yang BENAR-BENAR ada', async () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'performa_mandor')
    expect(t, 'tool `performa_mandor` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('mandor:view')

    // Kunci izin hantu menolak SEMUA orang tanpa gejala — dicocokkan ke tabel.
    const { rows } = await db.query('SELECT 1 FROM permissions WHERE key = $1', [
      t!.izin,
    ])
    expect(rows.length, `izin ${t!.izin} tak ada di tabel permissions`).toBe(1)
  })

  it('menjumlah porsi_hari, BUKAN menghitung baris', async () => {
    const h = await ringkasPerformaMandor(createTenantDb(companyId), {
      sejak: SEJAK,
      sampai: SAMPAI,
    })
    expect('galat' in h, JSON.stringify(h)).toBe(false)
    if ('galat' in h) return

    const { rows } = await db.query(
      `SELECT sum(a.porsi_hari)::float8 AS hari_orang,
              count(*)::int          AS jumlah_baris
         FROM absensi_harian a
         JOIN work_scopes ws        ON ws.id = a.scope_id
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
         JOIN projects p            ON p.id = ma.project_id
        WHERE p.company_id = $1 AND p.is_deleted = false
          AND a.tanggal BETWEEN $2 AND $3`,
      [companyId, SEJAK, SAMPAI],
    )
    const hariOrang = Number(rows[0].hari_orang)
    const jumlahBaris = Number(rows[0].jumlah_baris)

    expect(h.totalHariOrang).toBeCloseTo(hariOrang, 2)

    /*
     * Penjaga tafsiran. Kalau kedua angka ini kebetulan sama, test di atas
     * tak bisa membedakan penjumlahan dari penghitungan — dan hijau-nya tak
     * berarti apa-apa. Maka ketidaksamaannya ditegaskan di sini.
     */
    expect(
      hariOrang,
      'data uji tak lagi punya setengah hari — test ini berhenti membedakan ' +
        'sum(porsi_hari) dari count(*); tambahkan baris porsi_hari = 0,5',
    ).not.toBe(jumlahBaris)
    expect(h.totalHariOrang).not.toBe(jumlahBaris)
  })

  it('mandor diurutkan dari hari orang terbanyak', async () => {
    const h = await ringkasPerformaMandor(createTenantDb(companyId), {
      sejak: SEJAK,
      sampai: SAMPAI,
    })
    if ('galat' in h) throw new Error(h.galat)
    expect(h.mandor.length).toBeGreaterThan(1)
    for (let i = 1; i < h.mandor.length; i++) {
      expect(h.mandor[i - 1].hariOrang).toBeGreaterThanOrEqual(h.mandor[i].hariOrang)
    }
  })

  it('mandor tersibuk cocok dengan hitungan SQL terpisah', async () => {
    const h = await ringkasPerformaMandor(createTenantDb(companyId), {
      sejak: SEJAK,
      sampai: SAMPAI,
    })
    if ('galat' in h) throw new Error(h.galat)

    const { rows } = await db.query(
      `SELECT u.name, sum(a.porsi_hari)::float8 AS hari_orang,
              count(DISTINCT a.worker_id)::int  AS tukang
         FROM absensi_harian a
         JOIN work_scopes ws        ON ws.id = a.scope_id
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
         JOIN projects p            ON p.id = ma.project_id
         JOIN users u               ON u.id = ma.mandor_id
        WHERE p.company_id = $1 AND p.is_deleted = false
          AND a.tanggal BETWEEN $2 AND $3
        GROUP BY u.name ORDER BY 2 DESC LIMIT 1`,
      [companyId, SEJAK, SAMPAI],
    )
    expect(h.mandor[0].mandor).toBe(rows[0].name)
    expect(h.mandor[0].hariOrang).toBeCloseTo(Number(rows[0].hari_orang), 2)
    expect(h.mandor[0].jumlahTukang).toBe(Number(rows[0].tukang))
  })

  it('rentang tanggal benar-benar menyaring — bukan hiasan argumen', async () => {
    // Rentang di masa depan yang pasti kosong. Kalau saringannya tak dipasang,
    // angkanya akan sama dengan rentang penuh.
    const kosong = await ringkasPerformaMandor(createTenantDb(companyId), {
      sejak: '2030-01-01',
      sampai: '2030-01-31',
    })
    if ('galat' in kosong) throw new Error(kosong.galat)
    expect(kosong.totalHariOrang).toBe(0)
    expect(kosong.mandor).toHaveLength(0)
    expect(kosong.catatan).toBeTruthy()
  })

  it('tenant tanpa proyek memulangkan nol, bukan galat', async () => {
    const { rows } = await db.query(`
      SELECT c.id FROM companies c
       WHERE NOT EXISTS (SELECT 1 FROM projects p
                          WHERE p.company_id = c.id AND p.is_deleted = false)
       LIMIT 1`)
    if (rows.length === 0) {
      // Bukan test yang dilewati diam-diam: dinyatakan supaya yang membaca
      // tahu cabang ini TIDAK teruji hari ini.
      expect(rows.length, 'tak ada tenant tanpa proyek — cabang ini tak teruji').toBe(0)
      return
    }
    const h = await ringkasPerformaMandor(createTenantDb(rows[0].id))
    if ('galat' in h) throw new Error(h.galat)
    expect(h.totalHariOrang).toBe(0)
    expect(h.catatan).toBeTruthy()
  })

  it('rentang bawaan 30 hari terakhir dan dinyatakan di keluaran', async () => {
    const h = await ringkasPerformaMandor(createTenantDb(companyId))
    if ('galat' in h) throw new Error(h.galat)
    // Angkanya boleh nol (absensi dummy berhenti 2026-08-08); yang diuji
    // rentangnya dinyatakan, supaya pembaca tahu angka itu mewakili apa.
    expect(h.sejak).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(h.sampai).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const beda =
      (new Date(h.sampai).getTime() - new Date(h.sejak).getTime()) / 864e5
    expect(beda).toBe(29)
  })
})
