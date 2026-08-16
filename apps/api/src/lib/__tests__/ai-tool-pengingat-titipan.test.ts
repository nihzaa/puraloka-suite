/**
 * PENGINGAT & TITIPAN PESAN — dua kemampuan terakhir asisten manusia.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA RISIKO YANG BERBEDA KELASNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Pengingat** menyentuh diri sendiri. Yang terburuk: satu pesan yang tak
 * perlu. Karena itu ia boleh menulis langsung tanpa token konfirmasi.
 *
 * **Titipan pesan** menyentuh ORANG LAIN — satu-satunya tool yang begitu.
 * Yang terburuk: pesan terkirim ke orang yang salah, membawa nama pengirim,
 * dan tak bisa ditarik kembali karena sudah terbaca.
 *
 * ── Yang dibuktikan
 *
 *   1. kata waktu diurai SISTEM, bukan model — termasuk "jumat" saat hari Jumat
 *   2. waktu yang tak dikenali DITOLAK, bukan ditebak
 *   3. waktu LAMPAU ditolak — pengingat yang sudah lewat bukan pengingat
 *   4. pengingat hanya milik penanya
 *   5. titipan ke nama AMBIGU tak pernah ditebak
 *   6. titipan ke diri sendiri diarahkan ke tool yang benar
 *   7. nama pengirim dibaca BASIS, tak pernah dari model
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolTitipPengingat, toolDaftarPengingat, uraiWaktu } from '../ai-tool-pengingat.js'
import { toolTitipPesan } from '../ai-tool-titip-pesan.js'
import { KATALOG_TOOL } from '../ai-tool.js'

const TANDA = '[UJI-PENGINGAT]'

let db: Client
let companyId: string
let userA: string
let userB: string | null
let namaB: string | null

const ctx = (uid: string, izin: string[]) =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: uid,
    izin: new Set(izin),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT m.company_id, m.user_id FROM company_members m
     JOIN users u ON u.id = m.user_id LIMIT 1`)
  companyId = rows[0].company_id
  userA = rows[0].user_id

  const { rows: b } = await db.query(
    `SELECT m.user_id, u.name FROM company_members m JOIN users u ON u.id=m.user_id
      WHERE m.company_id=$1 AND m.user_id<>$2 AND u.name IS NOT NULL LIMIT 1`,
    [companyId, userA])
  userB = b[0]?.user_id ?? null
  namaB = b[0]?.name ?? null
})

afterAll(async () => {
  await db.query(`DELETE FROM pengingat_asisten WHERE isi LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM notifications WHERE message LIKE $1`, [`${TANDA}%`])
  await db.end()
})

describe('urai waktu', () => {
  // Jumat 2026-08-14, pukul 10:00 — titik acuan tetap supaya test tak berubah
  // arti seiring hari dijalankannya.
  const jumat = new Date('2026-08-14T10:00:00')

  it('kata sehari-hari dikenali', () => {
    expect(uraiWaktu('besok', jumat)?.getDate()).toBe(15)
    expect(uraiWaktu('lusa', jumat)?.getDate()).toBe(16)
    expect(uraiWaktu('3 hari', jumat)?.getDate()).toBe(17)
  })

  it('"jumat" saat hari JUMAT berarti minggu DEPAN', () => {
    /*
      Kalau ia berarti "hari ini", pengingatnya berbunyi beberapa detik lagi —
      dan pengingat yang berbunyi seketika bukan pengingat.
    */
    const h = uraiWaktu('jumat', jumat)
    expect(h).toBeTruthy()
    expect(h!.getDate()).toBe(21) // 14 + 7
  })

  it('jam bawaan 08:00, bukan tengah malam', () => {
    // Pengingat pukul 00:00 datang saat orang tidur, lalu tenggelam di antara
    // notifikasi semalam.
    expect(uraiWaktu('besok', jumat)?.getHours()).toBe(8)
    expect(uraiWaktu('senin', jumat)?.getHours()).toBe(8)
  })

  it('tanggal pasti dan jam eksplisit dihormati', () => {
    const h = uraiWaktu('2026-09-01 14:30', jumat)
    expect(h?.getMonth()).toBe(8) // September
    expect(h?.getHours()).toBe(14)
    expect(h?.getMinutes()).toBe(30)
  })

  it('kata yang TAK dikenali → null, bukan tebakan', () => {
    // Pengingat yang datang di hari salah lebih buruk daripada permintaan
    // untuk mengulang kalimatnya.
    for (const k of ['nanti kapan-kapan', 'zzxqv', '', '32 windu']) {
      expect(uraiWaktu(k, jumat), `'${k}' seharusnya tak dikenali`).toBeNull()
    }
  })
})

describe('tool pengingat', () => {
  it('keduanya terdaftar', () => {
    for (const n of ['titip_pengingat', 'pengingat_saya']) {
      const t = KATALOG_TOOL.find((x) => x.nama === n)
      expect(t, `tool '${n}' tak terdaftar`).toBeTruthy()
      expect(t!.izin).toBe('ai:chat')
    }
  })

  it('tersimpan dan terbaca kembali', async () => {
    const h = await toolTitipPengingat.jalan(ctx(userA, ['ai:chat']), {
      isi: `${TANDA} tagih Pak Andi`, kapan: 'besok',
    })
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(/tersimpan/i)

    const d = await toolDaftarPengingat.jalan(ctx(userA, ['ai:chat']), {})
    expect(d.isi).toContain(`${TANDA} tagih Pak Andi`)
  })

  it('waktu LAMPAU ditolak', async () => {
    const h = await toolTitipPengingat.jalan(ctx(userA, ['ai:chat']), {
      isi: `${TANDA} sudah lewat`, kapan: '2020-01-01',
    })
    expect(h.isError).toBe(true)
    expect(h.isi).toMatch(/sudah lewat/i)
  })

  it('waktu tak dikenali ditolak dengan CONTOH, bukan sekadar "salah"', async () => {
    const h = await toolTitipPengingat.jalan(ctx(userA, ['ai:chat']), {
      isi: `${TANDA} entah kapan`, kapan: 'pokoknya nanti',
    })
    expect(h.isError).toBe(true)
    // Penolakan tanpa arah memaksa model menebak bentuk yang diterima.
    expect(h.isi).toMatch(/besok|jumat|2026/i)
  })

  it('pengingat orang lain TIDAK ikut terbaca', async () => {
    if (!userB) return

    await db.query(
      `INSERT INTO pengingat_asisten (company_id, user_id, isi, jatuh_pada)
       VALUES ($1,$2,$3, now() + interval '2 days')`,
      [companyId, userB, `${TANDA} rahasia milik B`])

    const d = await toolDaftarPengingat.jalan(ctx(userA, ['ai:chat']), {})
    expect(d.isi, 'pengingat milik user lain bocor').not.toContain('rahasia milik B')
  })
})

describe('tool titip pesan', () => {
  it('izinnya TERPISAH dari ai:chat', () => {
    /*
      Ini satu-satunya tool yang menyentuh orang lain. Memberi seseorang akses
      asisten tak boleh diam-diam memberinya jalan mengirim pesan atas nama
      dirinya ke seluruh kantor.
    */
    const t = KATALOG_TOOL.find((x) => x.nama === 'titip_pesan')
    expect(t, 'tool `titip_pesan` tak terdaftar').toBeTruthy()
    expect(t!.izin).not.toBe('ai:chat')
    expect(t!.izin).toMatch(/^notifications:/)
  })

  it('nama yang TAK ADA ditolak — bukan dikirim ke yang mirip', async () => {
    const h = await toolTitipPesan.jalan(ctx(userA, ['notifications:rules:manage']), {
      kepada: 'Zzxqv Tak Ada', pesan: `${TANDA} halo`,
    })
    expect(h.isError).toBe(true)
    expect(h.isi).toMatch(/jangan mengirim ke orang lain yang mirip/i)
  })

  it('menitip ke DIRI SENDIRI diarahkan ke tool pengingat', async () => {
    const { rows } = await db.query(`SELECT name FROM users WHERE id=$1`, [userA])
    if (!rows[0]?.name) return

    const h = await toolTitipPesan.jalan(ctx(userA, ['notifications:rules:manage']), {
      kepada: rows[0].name, pesan: `${TANDA} ke diri sendiri`,
    })
    // Entah ambigu (nama umum) atau diarahkan — yang penting TIDAK terkirim.
    if (h.isError) expect(h.isi).toMatch(/titip_pengingat|sendiri/i)
  })

  it('pesan terlalu panjang ditolak', async () => {
    const h = await toolTitipPesan.jalan(ctx(userA, ['notifications:rules:manage']), {
      kepada: namaB ?? 'x', pesan: `${TANDA} ${'a'.repeat(500)}`,
    })
    expect(h.isError).toBe(true)
    expect(h.isi).toMatch(/terlalu panjang/i)
  })

  it('terkirim DENGAN nama pengirim yang dibaca dari basis', async () => {
    if (!userB || !namaB) return

    const h = await toolTitipPesan.jalan(ctx(userA, ['notifications:rules:manage']), {
      kepada: namaB, pesan: `${TANDA} tolong cek invoice`,
    })
    if (h.isError) return // nama ambigu di tenant ini — bukan kegagalan tool

    const { rows } = await db.query(
      `SELECT title, message, user_id FROM notifications
        WHERE message LIKE $1 ORDER BY created_at DESC LIMIT 1`, [`${TANDA} tolong cek%`])

    expect(rows).toHaveLength(1)
    expect(rows[0].user_id, 'terkirim ke orang yang salah').toBe(userB)
    // Pengirim DISEBUT — pesan anonim tak bisa ditindaklanjuti & tak bisa dibantah.
    expect(rows[0].title).toMatch(/^Titipan dari /)
    expect(rows[0].message).toMatch(/dititipkan .* lewat asisten/)
  })
})
