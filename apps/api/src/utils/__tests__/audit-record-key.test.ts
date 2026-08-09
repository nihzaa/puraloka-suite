/**
 * TJS-A4 — audit dengan identitas BUKAN UUID.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DIUJI DI SINI SUDAH AKTIF SEBELUM TEST INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit_logs.record_id` bertipe `uuid`. Lima modul memakai `recordId` untuk
 * identitas yang bukan UUID — kode tujuan kasbon, `event_type` aturan
 * notifikasi, `entity_type` rantai approval, nama kunci kredensial, nama tugas
 * terjadwal.
 *
 * Akibatnya insert ditolak basis, `logAuditEvent` menangkap galatnya dan
 * mencatatnya ke log aplikasi, lalu barisnya TAK PERNAH sampai ke
 * `audit_logs`. Diukur 2026-08-09: NOL baris untuk ketiga modul konfigurasi
 * itu — padahal justru merekalah yang mengubah cara sistem memutuskan.
 *
 * Yang membuatnya bertahan lama: tak ada gejala. Log aplikasi memuat galatnya,
 * tapi tak seorang pun membaca log untuk memastikan audit tertulis — orang
 * membaca audit untuk memastikan sesuatu terjadi.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'

let db: Client
const TABEL_UJI = '__uji_audit_a4__'

beforeAll(async () => { db = await createRlsClient() }, 60_000)
afterAll(async () => { await db.end() })

describe('audit_logs — identitas bukan UUID', () => {
  it('kolom record_key dan via ADA', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'audit_logs' AND column_name IN ('record_key', 'via')
      ORDER BY column_name
    `)
    expect(rows.map((r) => r.column_name)).toEqual(['record_key', 'via'])
  })

  it('audit ber-record_key DITERIMA — inilah cacat yang diperbaiki', async () => {
    const { rows } = await db.query(
      `INSERT INTO audit_logs (company_id, table_name, record_key, action, severity, via)
       VALUES ((SELECT id FROM companies LIMIT 1), $1, 'ANTHROPIC_API_KEY', 'uji.a4', 'info', 'web')
       RETURNING record_key, via`,
      [TABEL_UJI],
    )
    expect(rows[0].record_key).toBe('ANTHROPIC_API_KEY')
    expect(rows[0].via).toBe('web')
  })

  it('baris TANPA penunjuk apa pun DITOLAK', async () => {
    // Jejak audit yang tak menunjuk record mana pun tak bisa ditelusuri —
    // persis yang audit log ada untuk cegah.
    await expect(
      db.query(
        `INSERT INTO audit_logs (company_id, table_name, action, severity)
         VALUES ((SELECT id FROM companies LIMIT 1), $1, 'uji.tanpa.penunjuk', 'info')`,
        [TABEL_UJI],
      ),
    ).rejects.toThrow()
  })

  it('kanal asing DITOLAK', async () => {
    await expect(
      db.query(
        `INSERT INTO audit_logs (company_id, table_name, record_key, action, severity, via)
         VALUES ((SELECT id FROM companies LIMIT 1), $1, 'x', 'uji.kanal', 'info', 'telepati')`,
        [TABEL_UJI],
      ),
    ).rejects.toThrow()
  })

  it('audit log tetap APPEND-ONLY — DELETE ditolak', async () => {
    // Gerbang Keras G-3. Migrasi 249 menambah kolom, TIDAK melonggarkan ini —
    // dan blok verifikasinya sengaja tak menghapus baris ujinya sendiri.
    await expect(
      db.query(`DELETE FROM audit_logs WHERE table_name = $1`, [TABEL_UJI]),
    ).rejects.toThrow()
  })
})

describe('ai_akses_ditolak — percobaan tanpa tenant', () => {
  it('tabelnya ada dan TIDAK punya company_id', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ai_akses_ditolak' ORDER BY column_name
    `)
    const kolom = rows.map((r) => r.column_name)
    expect(kolom).toContain('pengenal')
    expect(kolom).toContain('kanal')
    // Ketiadaan `company_id` DISENGAJA: yang ditolak memang tak punya tenant,
    // dan memaksanya masuk `audit_logs` (company_id NOT NULL) berarti
    // mengarang pemilik jejak.
    expect(kolom).not.toContain('company_id')
  })

  it('TIDAK menyimpan isi pesan', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ai_akses_ditolak'
    `)
    const kolom = rows.map((r) => r.column_name as string)
    // Pesan dari orang tak dikenal bisa memuat apa saja; menyimpannya berarti
    // menyimpan data orang yang tak pernah menyetujui apa pun.
    for (const terlarang of ['pesan', 'message', 'isi', 'body', 'content']) {
      expect(kolom, `kolom '${terlarang}' tak boleh ada`).not.toContain(terlarang)
    }
  })

  it('menerima percobaan dari pengenal tak dikenal', async () => {
    const { rows } = await db.query(
      `INSERT INTO ai_akses_ditolak (pengenal, kanal, alasan)
       VALUES ('6280000000000', 'ai_whatsapp', 'nomor tidak terdaftar')
       RETURNING pengenal, kanal`,
    )
    expect(rows[0].pengenal).toBe('6280000000000')
    await db.query(`DELETE FROM ai_akses_ditolak WHERE pengenal = '6280000000000'`)
  })
})
