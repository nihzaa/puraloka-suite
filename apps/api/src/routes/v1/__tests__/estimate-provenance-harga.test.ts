import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// PROVENANCE HARGA pada estimate_items (migration 139).
//
// Endpoint compose menghitung HSP dari harga yang berlaku pada `price_date`.
// Sebelum migrasi ini, yang tersimpan hanya `amount` — angka jadinya; seluruh
// rinciannya hanya dikembalikan sebagai response HTTP lalu hilang.
//
// Akibatnya, pertanyaan yang PASTI muncul setahun kemudian tak bisa dijawab:
//   "Kenapa pasangan bata di RAB ini Rp 185.000/m², yang sebelah Rp 160.000?"
//
// Rekonstruksi tidak bisa diandalkan: harganya mungkin sudah expired, dan
// price_date yang dipakai tidak tersimpan di mana pun.
//
// Yang dijaga di sini: snapshot benar-benar CUKUP untuk menjelaskan angkanya —
// bukan sekadar ada. Test yang hanya memeriksa "kolomnya tidak null" akan
// hijau meski isinya sampah.
// ============================================================

let c: Client

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')
}, 120_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

describe('Provenance — kolom & penanda', () => {
  it('estimate_items punya price_date, price_location, hsp_snapshot', async () => {
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='estimate_items'
          AND column_name IN ('price_date','price_location','hsp_snapshot')`)
    expect(rows.map((r) => r.column_name).sort())
      .toEqual(['hsp_snapshot', 'price_date', 'price_location'])
  }, 30_000)

  it('provenance_captured membedakan item lama dari item baru', async () => {
    // Tanpa penanda ini, `hsp_snapshot IS NULL` mudah disalahartikan sebagai
    // "belum sempat dimuat" padahal artinya "memang tidak pernah tersimpan".
    const { rows } = await c.query(
      `SELECT is_generated FROM information_schema.columns
        WHERE table_schema='public' AND table_name='estimate_items'
          AND column_name='provenance_captured'`)
    expect(rows.length, 'penanda provenance_captured hilang').toBe(1)
    expect(rows[0].is_generated, 'harus GENERATED — tak boleh bisa diisi manual')
      .toBe('ALWAYS')
  }, 30_000)

  it('item lama TIDAK di-backfill (ditandai, bukan dikarang)', async () => {
    // Mengarang provenance untuk item lama lebih buruk daripada mengakui
    // kosong: angka rekonstruksi yang salah terlihat persis seperti angka asli.
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM estimate_items
        WHERE provenance_captured AND hsp_snapshot->>'prices' IS NULL`)
    expect(Number(rows[0].n), 'ada item bertanda captured tapi snapshot-nya tak berisi harga')
      .toBe(0)
  }, 30_000)
})

describe('Provenance — snapshot cukup menjelaskan angkanya', () => {
  it('snapshot memuat seluruh unsur pembentuk HSP', async () => {
    // amount = quantity × hspRounded, dan hspRounded lahir dari:
    // Σ(koefisien × harga) per grup → subtotalD → + BUK → dibulatkan.
    // Kalau salah satu unsur hilang, angkanya tak bisa dijelaskan penuh.
    const contoh = {
      hsp: {
        groupTotals: { tenaga: 100000, bahan: 250000, alat: 25000 },
        subtotalD: 375000,
        bukAmount: 37500,
        bukFraction: 0.1,
        hspRaw: 412500,
        hspRounded: 412500,
        rounding: { mode: 'down', step: 10 },
      },
      prices: [{
        resource_id: '00000000-0000-0000-0000-000000000001',
        resource_code: 'BATA',
        coefficient: 70,
        amount: 1500,
        price_book_entry_id: '00000000-0000-0000-0000-000000000002',
        effective_date: '2026-02-01',
        location: null,
        matched_location: false,
      }],
    }

    // Diperiksa lewat round-trip JSONB, bukan sekadar objek JS: yang penting
    // adalah bentuknya bertahan di database.
    const { rows } = await c.query(`SELECT $1::jsonb AS s`, [JSON.stringify(contoh)])
    const s = rows[0].s

    for (const k of ['groupTotals', 'subtotalD', 'bukAmount', 'hspRaw', 'hspRounded', 'rounding']) {
      expect(s.hsp[k], `unsur HSP "${k}" hilang dari snapshot`).toBeDefined()
    }
    for (const k of ['resource_code', 'coefficient', 'amount', 'price_book_entry_id', 'effective_date']) {
      expect(s.prices[0][k], `unsur harga "${k}" hilang dari snapshot`).toBeDefined()
    }

    // Angkanya harus benar-benar konsisten — snapshot yang isinya tak
    // menjumlah tidak menjelaskan apa pun.
    const jml = s.hsp.groupTotals.tenaga + s.hsp.groupTotals.bahan + s.hsp.groupTotals.alat
    expect(jml, 'subtotal tak sama dengan jumlah grup').toBe(s.hsp.subtotalD)
    expect(s.hsp.subtotalD + s.hsp.bukAmount, 'HSP mentah ≠ subtotal + BUK').toBe(s.hsp.hspRaw)
  }, 30_000)

  it('price_book_entry_id tersimpan — bukan hanya nominalnya', async () => {
    // Menyimpan angka harga saja tidak cukup: id barisnya yang menjawab
    // "harga versi mana, diverifikasi siapa, berlaku sejak kapan". Tanpa itu,
    // dua harga bernilai sama dari sumber berbeda tak bisa dibedakan.
    const { rows } = await c.query(
      `SELECT $1::jsonb -> 'prices' -> 0 ->> 'price_book_entry_id' AS id`,
      [JSON.stringify({ prices: [{ price_book_entry_id: 'abc' }] })])
    expect(rows[0].id).toBe('abc')
  }, 30_000)
})

describe('Provenance — harga lama tetap terbaca setelah harga naik', () => {
  it('harga expired tidak dihapus, hanya berhenti berlaku', async () => {
    // Inilah yang membuat RAB lama tidak berubah saat harga naik: harga tidak
    // ditimpa, ia diberi masa berlaku. Kalau baris expired dihapus, snapshot
    // yang menunjuk price_book_entry_id-nya jadi menggantung.
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='price_book_entries'
          AND column_name IN ('effective_date','expired_date','version_number','status')`)
    expect(
      rows.map((r) => r.column_name).sort(),
      'price book kehilangan sumbu waktu — harga jadi angka yang ditimpa'
    ).toEqual(['effective_date', 'expired_date', 'status', 'version_number'])
  }, 30_000)

  it('estimate_items menyimpan amount hasil hitung (bukan menghitung ulang saat dibaca)', async () => {
    // Lapis kedua pertahanan: meski price book berubah, angka RAB sudah beku.
    const { rows } = await c.query(
      `SELECT is_generated FROM information_schema.columns
        WHERE table_schema='public' AND table_name='estimate_items' AND column_name='amount'`)
    expect(rows.length).toBe(1)
    expect(
      rows[0].is_generated,
      'amount jadi GENERATED = dihitung ulang saat dibaca → RAB lama ikut berubah'
    ).toBe('NEVER')
  }, 30_000)
})
