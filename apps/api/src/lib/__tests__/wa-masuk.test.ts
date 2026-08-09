/**
 * TJS-D2 — parser pesan masuk + dedup ATOMIK terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Parser: tiap cabang "abaikan" benar-benar mengabaikan. Cabang-cabang itu
 * bukan kerapian — dua di antaranya adalah pelajaran lapangan TJS yang, kalau
 * dilanggar, gejalanya bencana dan senyap:
 *
 *   · `fromMe` — bot membalas jawabannya sendiri, selamanya
 *   · `remoteJidAlt` — balasan berisi data perusahaan ke nomor yang SALAH
 *
 * Dedup: dua webhook bersamaan tak bisa keduanya menang. Diuji terhadap basis
 * sungguhan karena yang dijamin di sini adalah primary key, dan primary key
 * palsu di dalam mock menjamin nol.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { supabase } from '../../utils/supabase.js'
import { klaimPesanMasuk, tandaiDiproses, uraiPesanMasuk } from '../wa-masuk.js'

const ID_UJI = 'uji-d2-'

/** Payload Evolution minimal yang SAH — dasar untuk tiap variasi. */
function payload(ubah: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'puraloka-bot',
    data: {
      key: { id: 'ABC123', remoteJid: '628111222333@s.whatsapp.net', fromMe: false },
      pushName: 'Budi',
      message: { conversation: 'Berapa proyek aktif?' },
      ...ubah,
    },
  }
}

describe('parser — cabang "abaikan" benar-benar mengabaikan', () => {
  it('payload sah → terurai lengkap', () => {
    const p = uraiPesanMasuk(payload())
    expect(p).not.toBeNull()
    expect(p!.pesanId).toBe('ABC123')
    expect(p!.teks).toBe('Berapa proyek aktif?')
    expect(p!.nama).toBe('Budi')
    expect(p!.instance).toBe('puraloka-bot')
  })

  it('pesan dari bot sendiri DIBUANG — kalau tidak, lingkaran tak berujung', () => {
    const p = uraiPesanMasuk(
      payload({ key: { id: 'X1', remoteJid: '628111222333@s.whatsapp.net', fromMe: true } }),
    )
    expect(p).toBeNull()
  })

  it('remoteJidAlt MENGALAHKAN remoteJid — salah di sini = data ke nomor asing', () => {
    const p = uraiPesanMasuk(
      payload({
        key: {
          id: 'X2',
          remoteJid: '628000000000@s.whatsapp.net',
          remoteJidAlt: '628999888777@s.whatsapp.net',
          fromMe: false,
        },
      }),
    )
    expect(p!.dari).toContain('628999888777')
  })

  it('pesan grup DIABAIKAN — jawaban satu orang tak boleh terlihat seluruh grup', () => {
    const p = uraiPesanMasuk(
      payload({ key: { id: 'X3', remoteJid: '12036304@g.us', fromMe: false } }),
    )
    expect(p).toBeNull()
  })

  it('tanpa id → null; dedup mustahil tanpa kunci', () => {
    const p = uraiPesanMasuk(
      payload({ key: { remoteJid: '628111222333@s.whatsapp.net', fromMe: false } }),
    )
    expect(p).toBeNull()
  })

  it('event lain (status koneksi) → null, dan itu NORMAL', () => {
    expect(uraiPesanMasuk({ event: 'connection.update', data: { state: 'open' } })).toBeNull()
  })

  it('pesan media tanpa teks → null (sengaja tak menjawab tebakan)', () => {
    const p = uraiPesanMasuk(payload({ message: { imageMessage: { caption: '' } } }))
    expect(p).toBeNull()
  })

  it('payload terbungkus `body` (n8n/proxy) tetap terurai', () => {
    const p = uraiPesanMasuk({ body: payload() })
    expect(p!.pesanId).toBe('ABC123')
  })

  it('teks berformat dibaca dari extendedTextMessage', () => {
    const p = uraiPesanMasuk(payload({ message: { extendedTextMessage: { text: 'halo *tebal*' } } }))
    expect(p!.teks).toBe('halo *tebal*')
  })

  it('konteks balasan ikut, supaya model tahu yang dibalas', () => {
    const p = uraiPesanMasuk(
      payload({
        message: {
          extendedTextMessage: {
            text: 'yang mana?',
            contextInfo: { quotedMessage: { conversation: 'Proyek Cikarang selesai' } },
          },
        },
      }),
    )
    expect(p!.teks).toContain('Proyek Cikarang selesai')
    expect(p!.teks).toContain('yang mana?')
  })

  it('teks raksasa dipotong — pesan besar mendorong riwayat keluar konteks', () => {
    const p = uraiPesanMasuk(payload({ message: { conversation: 'a'.repeat(9_000) } }))
    expect(p!.teks.length).toBeLessThanOrEqual(4_000)
  })

  it('sampah non-objek tak melempar — melempar = penyedia mencoba ulang selamanya', () => {
    for (const buruk of [null, undefined, 'teks', 42, []]) {
      expect(() => uraiPesanMasuk(buruk)).not.toThrow()
      expect(uraiPesanMasuk(buruk)).toBeNull()
    }
  })
})

describe('dedup — terhadap Postgres NYATA', () => {
  let db: Client
  let companyId: string

  beforeAll(async () => {
    db = await createRlsClient()
    const { rows } = await db.query(`
      SELECT c.id FROM companies c
      WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
    `)
    companyId = rows[0].id
  }, 60_000)

  beforeEach(async () => {
    await db.query(`DELETE FROM wa_pesan_masuk_dedup WHERE pesan_id LIKE $1`, [`${ID_UJI}%`])
  })

  afterAll(async () => {
    await db.query(`DELETE FROM wa_pesan_masuk_dedup WHERE pesan_id LIKE $1`, [`${ID_UJI}%`])
    await db.end()
  })

  it('klaim pertama "baru", klaim kedua "duplikat"', async () => {
    const id = `${ID_UJI}sekali`
    expect(await klaimPesanMasuk(supabase, id, '628111')).toBe('baru')
    expect(await klaimPesanMasuk(supabase, id, '628111')).toBe('duplikat')
  })

  it('DUA klaim BERSAMAAN → tepat satu menang', async () => {
    /*
     * Inti seluruh mekanisme ini. Penyedia webhook mengirim ulang saat balasan
     * lambat, dan dua salinan bisa tiba pada saat yang sama.
     *
     * Kalau keduanya menang, pengguna menerima dua balasan dan tenant membayar
     * dua kali untuk satu pertanyaan — tanpa satu pun galat yang menunjukkan
     * ada yang salah.
     */
    const id = `${ID_UJI}balapan`
    const hasil = await Promise.all(
      Array.from({ length: 5 }, () => klaimPesanMasuk(supabase, id, '628111')),
    )
    expect(hasil.filter((h) => h === 'baru')).toHaveLength(1)
    expect(hasil.filter((h) => h === 'duplikat')).toHaveLength(4)
  })

  it('isi pesan TIDAK ikut tersimpan — hanya id dan nomor', async () => {
    const id = `${ID_UJI}isi`
    await klaimPesanMasuk(supabase, id, '628111')
    const { rows } = await db.query(
      `SELECT * FROM wa_pesan_masuk_dedup WHERE pesan_id = $1`, [id])
    const kolom = Object.keys(rows[0])
    for (const terlarang of ['isi', 'pesan', 'teks', 'body', 'content']) {
      expect(kolom).not.toContain(terlarang)
    }
  })

  it('company_id NULL saat diklaim, terisi saat ditandai selesai', async () => {
    // Pesan dari nomor tak dikenal memang belum punya tenant. Memaksanya
    // bernilai sejak awal berarti mengarang pemilik.
    const id = `${ID_UJI}tenant`
    await klaimPesanMasuk(supabase, id, '628111')
    const { rows: sebelum } = await db.query(
      `SELECT company_id, diproses FROM wa_pesan_masuk_dedup WHERE pesan_id = $1`, [id])
    expect(sebelum[0].company_id).toBeNull()
    expect(sebelum[0].diproses).toBe(false)

    await tandaiDiproses(supabase, id, companyId)
    const { rows: sesudah } = await db.query(
      `SELECT company_id, diproses FROM wa_pesan_masuk_dedup WHERE pesan_id = $1`, [id])
    expect(sesudah[0].company_id).toBe(companyId)
    expect(sesudah[0].diproses).toBe(true)
  })
})
