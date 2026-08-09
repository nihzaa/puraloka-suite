/**
 * TJS-D2 — rute POST /api/v1/wa/webhook, pintu tanpa login.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN: TIAP GERBANG BEKERJA, DAN NOL BIAYA SEBELUM GERBANG LOLOS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Route ini satu-satunya yang tak lewat `authenticate`, jadi setiap gerbang
 * ditegakkan dengan tangan — dan gerbang yang ditegakkan dengan tangan hanya
 * sekuat testnya.
 *
 * Seperti `ai-chat.test.ts`, keberhasilan gerbang dibuktikan dengan MENGHITUNG
 * BARIS `ai_biaya_token`, bukan dengan membaca status HTTP. Status 200 tak
 * membuktikan apa pun di sini: route ini SELALU 200 kecuali rahasianya salah.
 *
 * ── Kenapa kunci model tak dipasang
 *
 * Kalau seluruh gerbang bekerja, panggilan berbayar tak pernah terjadi, jadi
 * kunci tak dibutuhkan. Kalau ada gerbang yang bocor, ketiadaan kunci membuat
 * kebocorannya berhenti sebelum jadi tagihan — dan tetap terlihat sebagai
 * `tindakan: 'gagal'` alih-alih `'ditolak'`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import waWebhookRoutes from '../wa-webhook.js'

const RAHASIA = 'rahasia-uji-d2-jangan-dipakai-produksi'
const NOMOR_TERDAFTAR = '628997000111'
const NOMOR_ASING = '628997000999'
const PREFIX = 'wh-uji-'

let app: FastifyInstance
let db: Client
let companyId: string
let userId: string
let userIdKlien: string
const NOMOR_KLIEN = '628997000222'
let rahasiaAsli: string | undefined

function payload(pesanId: string, dari: string, teks = 'Berapa proyek aktif?') {
  return {
    event: 'messages.upsert',
    instance: 'puraloka-bot',
    data: {
      key: { id: pesanId, remoteJid: `${dari}@s.whatsapp.net`, fromMe: false },
      pushName: 'Uji',
      message: { conversation: teks },
    },
  }
}

const kirim = (badan: unknown, rahasia: string | null = RAHASIA) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/wa/webhook',
    payload: badan as never,
    headers: rahasia === null ? {} : { 'x-webhook-secret': rahasia },
  })

async function jumlahBiaya(): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM ai_biaya_token WHERE company_id = $1`, [companyId])
  return rows[0].n
}

beforeAll(async () => {
  db = await createRlsClient()
  const { rows: c } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = c[0].id
  /*
   * Peran DIPILIH EKSPLISIT, tak pernah `LIMIT 1`.
   *
   * Versi pertama test ini memakai `LIMIT 1` dan mendapat seorang **client** —
   * peran yang memang tak punya `ai:chat`. Akibatnya setiap kasus "nomor
   * terdaftar" berhenti di gerbang izin, dan test tetap hijau tanpa pernah
   * membuktikan bahwa gerbang SETELAHNYA bekerja.
   *
   * Itu jenis kehijauan paling berbahaya: bukan salah jawabannya, melainkan
   * pertanyaannya tak pernah sampai.
   */
  const { rows: m } = await db.query(
    `SELECT m.user_id FROM company_members m JOIN roles r ON r.id = m.role_id
      WHERE m.company_id = $1 AND r.name = 'admin' LIMIT 1`, [companyId])
  if (!m[0]) throw new Error('tak ada anggota ber-peran admin di company uji')
  userId = m[0].user_id

  const { rows: k } = await db.query(
    `SELECT m.user_id FROM company_members m JOIN roles r ON r.id = m.role_id
      WHERE m.company_id = $1 AND r.name = 'client' LIMIT 1`, [companyId])
  if (!k[0]) throw new Error('tak ada anggota ber-peran client di company uji')
  userIdKlien = k[0].user_id

  rahasiaAsli = process.env.WA_WEBHOOK_SECRET
  process.env.WA_WEBHOOK_SECRET = RAHASIA

  app = Fastify()
  await app.register(waWebhookRoutes)
  await app.ready()
}, 60_000)

afterAll(async () => {
  if (rahasiaAsli === undefined) delete process.env.WA_WEBHOOK_SECRET
  else process.env.WA_WEBHOOK_SECRET = rahasiaAsli
  await db.query(`DELETE FROM wa_pesan_masuk_dedup WHERE pesan_id LIKE $1`, [`${PREFIX}%`])
  await db.query(`DELETE FROM wa_nomor_pengguna WHERE nomor IN ($1, $2, $3)`,
    [NOMOR_TERDAFTAR, NOMOR_ASING, NOMOR_KLIEN])
  await db.query(`DELETE FROM ai_akses_ditolak WHERE pengenal IN ($1, $2, $3)`,
    [NOMOR_TERDAFTAR, NOMOR_ASING, NOMOR_KLIEN])
  await app.close()
  await db.end()
})

beforeEach(async () => {
  await db.query(`DELETE FROM wa_pesan_masuk_dedup WHERE pesan_id LIKE $1`, [`${PREFIX}%`])
  await db.query(`DELETE FROM wa_nomor_pengguna WHERE nomor IN ($1, $2, $3)`,
    [NOMOR_TERDAFTAR, NOMOR_ASING, NOMOR_KLIEN])
  await db.query(`DELETE FROM ai_akses_ditolak WHERE pengenal IN ($1, $2, $3)`,
    [NOMOR_TERDAFTAR, NOMOR_ASING, NOMOR_KLIEN])
})

describe('gerbang 1 — rahasia webhook (celah yang TJS tak punya)', () => {
  it('tanpa header rahasia → 401, dan NOL baris dedup tercipta', async () => {
    const r = await kirim(payload(`${PREFIX}tanpa`, NOMOR_ASING), null)
    expect(r.statusCode).toBe(401)

    // Yang ditolak tak boleh meninggalkan jejak apa pun yang bisa dipakai
    // memetakan sistem — termasuk baris dedup atas id pilihannya sendiri.
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM wa_pesan_masuk_dedup WHERE pesan_id = $1`,
      [`${PREFIX}tanpa`])
    expect(rows[0].n).toBe(0)
  })

  it('rahasia salah → 401', async () => {
    const r = await kirim(payload(`${PREFIX}salah`, NOMOR_ASING), 'bukan-rahasianya')
    expect(r.statusCode).toBe(401)
  })

  it('rahasia panjang-beda → 401 (bukan crash pada perbandingan)', async () => {
    const r = await kirim(payload(`${PREFIX}pjg`, NOMOR_ASING), 'x')
    expect(r.statusCode).toBe(401)
  })

  it('rahasia BENAR → lolos gerbang 1 (bukan 401)', async () => {
    const r = await kirim(payload(`${PREFIX}benar`, NOMOR_ASING))
    expect(r.statusCode).toBe(200)
  })
})

describe('gerbang 2 — bentuk payload', () => {
  it('event bukan pesan → 200 "diabaikan", tanpa galat', async () => {
    // Membalas galat untuk peristiwa normal membuat penyedia mencoba ulang
    // selamanya.
    const r = await kirim({ event: 'connection.update', data: { state: 'open' } })
    expect(r.statusCode).toBe(200)
    expect(r.json().tindakan).toBe('diabaikan')
  })

  it('pesan dari bot sendiri → "diabaikan" (tak ada lingkaran)', async () => {
    const p = payload(`${PREFIX}bot`, NOMOR_ASING)
    p.data.key.fromMe = true
    const r = await kirim(p)
    expect(r.json().tindakan).toBe('diabaikan')
  })
})

describe('gerbang 3 — dedup', () => {
  it('webhook yang sama dua kali → yang kedua "duplikat"', async () => {
    const p = payload(`${PREFIX}ganda`, NOMOR_ASING)
    const a = await kirim(p)
    const b = await kirim(p)
    expect(a.json().tindakan).not.toBe('duplikat')
    expect(b.json().tindakan).toBe('duplikat')
  })

  it('lima webhook BERSAMAAN → tepat satu yang diproses', async () => {
    const p = payload(`${PREFIX}balap`, NOMOR_ASING)
    const hasil = await Promise.all(Array.from({ length: 5 }, () => kirim(p)))
    const tindakan = hasil.map((r) => r.json().tindakan)
    expect(tindakan.filter((t) => t === 'duplikat')).toHaveLength(4)
  })
})

describe('gerbang 4 — identitas, dan C-9', () => {
  it('nomor tak terdaftar → DICATAT di ai_akses_ditolak, TANPA balasan', async () => {
    const r = await kirim(payload(`${PREFIX}asing`, NOMOR_ASING))
    expect(r.json().tindakan).toBe('ditolak')

    const { rows } = await db.query(
      `SELECT alasan, kanal FROM ai_akses_ditolak WHERE pengenal = $1`, [NOMOR_ASING])
    expect(rows).toHaveLength(1)
    expect(rows[0].alasan).toBe('nomor_tak_terdaftar')
    expect(rows[0].kanal).toBe('ai_whatsapp')
  })

  it('isi pesan orang asing TIDAK disimpan di mana pun', async () => {
    const rahasiaOrang = 'NIK saya 3273010101010001 tolong bantu'
    await kirim(payload(`${PREFIX}privasi`, NOMOR_ASING, rahasiaOrang))

    // Orang yang tak pernah menyetujui apa pun tak boleh datanya tersimpan.
    for (const [tabel, kolom] of [
      ['ai_akses_ditolak', 'pengenal'],
      ['wa_pesan_masuk_dedup', 'nomor'],
    ] as const) {
      const { rows } = await db.query(
        `SELECT to_jsonb(t) j FROM ${tabel} t WHERE ${kolom} LIKE '628997%'`)
      for (const r of rows) {
        expect(JSON.stringify(r.j)).not.toContain('3273010101010001')
      }
    }
  })

  it('nomor terdaftar tapi BELUM diverifikasi → ditolak, dicatat', async () => {
    // Siapa pun bisa mengetik nomor orang lain. Tanpa verifikasi, mendaftarkan
    // nomor korban sudah cukup untuk membaca datanya.
    await db.query(
      `INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor, terverifikasi_pada, aktif)
       VALUES ($1, $2, $3, NULL, true)`,
      [companyId, userId, NOMOR_TERDAFTAR],
    )
    const r = await kirim(payload(`${PREFIX}belumverif`, NOMOR_TERDAFTAR))
    expect(r.json().tindakan).toBe('ditolak')

    const { rows } = await db.query(
      `SELECT alasan FROM ai_akses_ditolak WHERE pengenal = $1`, [NOMOR_TERDAFTAR])
    expect(rows[0].alasan).toBe('belum_terverifikasi')
  })

  it('nomor terverifikasi tapi DINONAKTIFKAN → ditolak', async () => {
    await db.query(
      `INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor, terverifikasi_pada, aktif)
       VALUES ($1, $2, $3, now(), false)`,
      [companyId, userId, NOMOR_TERDAFTAR],
    )
    const r = await kirim(payload(`${PREFIX}nonaktif`, NOMOR_TERDAFTAR))
    expect(r.json().tindakan).toBe('ditolak')
    const { rows } = await db.query(
      `SELECT alasan FROM ai_akses_ditolak WHERE pengenal = $1`, [NOMOR_TERDAFTAR])
    expect(rows[0].alasan).toBe('nonaktif')
  })
})

describe('gerbang izin — peran menentukan, sama seperti di web', () => {
  it('nomor SAH milik CLIENT → tanpa_izin (client tak punya ai:chat)', async () => {
    await db.query(
      `INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor, terverifikasi_pada, aktif)
       VALUES ($1, $2, $3, now(), true)`,
      [companyId, userIdKlien, NOMOR_KLIEN],
    )
    const r = await kirim(payload(`${PREFIX}klien`, NOMOR_KLIEN))
    expect(r.json().tindakan).toBe('tanpa_izin')
  })

  it('nomor SAH milik ADMIN → MENEMBUS gerbang izin', async () => {
    /*
     * Test paling penting di berkas ini, dan yang paling mudah luput.
     *
     * Semua kasus lain berhenti LEBIH AWAL. Kalau tak ada satu pun kasus yang
     * benar-benar menembus gerbang izin, seluruh berkas ini bisa hijau
     * sekalipun gerbang-gerbang setelahnya rusak total — yang diuji cuma
     * penolakan.
     *
     * Yang dituntut di sini bukan jawabannya (kunci model memang sengaja tak
     * dipasang), melainkan BUKTI bahwa alirannya sampai ke gerbang berikutnya:
     * `tindakan` apa pun SELAIN 'ditolak' dan 'tanpa_izin'.
     */
    await db.query(
      `INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor, terverifikasi_pada, aktif)
       VALUES ($1, $2, $3, now(), true)`,
      [companyId, userId, NOMOR_TERDAFTAR],
    )
    const r = await kirim(payload(`${PREFIX}admin`, NOMOR_TERDAFTAR))
    const t = r.json().tindakan
    expect(t).not.toBe('ditolak')
    expect(t).not.toBe('tanpa_izin')
  })
})

describe('NOL biaya untuk apa pun yang tertahan gerbang', () => {
  it('nomor asing, rahasia salah, dan duplikat → tak satu pun menambah biaya', async () => {
    const sebelum = await jumlahBiaya()

    await kirim(payload(`${PREFIX}b1`, NOMOR_ASING), 'salah')
    await kirim(payload(`${PREFIX}b2`, NOMOR_ASING))
    await kirim(payload(`${PREFIX}b2`, NOMOR_ASING)) // duplikat
    await kirim({ event: 'connection.update' })

    expect(await jumlahBiaya()).toBe(sebelum)
  })
})
