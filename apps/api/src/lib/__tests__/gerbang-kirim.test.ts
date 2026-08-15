/**
 * GERBANG KELUAR — yang menahan asisten mengirim pukul 3 pagi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI YANG PALING MENENTUKAN DI FASE 3
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur: repo ini NOL jam tenang, NOL opt-out, NOL batas frekuensi, dan
 * `kirimWa` tak punya throttle. Penyedia bawaan juga tak punya batas jendela
 * 24 jam. Begitu proaktivitas menyala, gerbang inilah SATU-SATUNYA hal yang
 * berdiri di antara penjadwal dan telepon orang.
 *
 * Repo ini sudah pernah kena bentuknya: satu alur mengirim 28 WhatsApp
 * sungguhan sementara bukunya kosong, dan yang menghentikannya bukan penjaga
 * melainkan seseorang yang kebetulan memperhatikan.
 *
 * Yang dibuktikan:
 *
 *   1. jam tenang MELEWATI TENGAH MALAM (21:00–07:00) benar-benar berlaku
 *   2. `mendesak` menembus jam tenang, TAPI TIDAK menembus opt-out
 *   3. kuota menahan yang ke-N+1, dihitung dari `notifications`
 *   4. baris preferensi yang HILANG = bawaan protektif, bukan izin tanpa batas
 *   5. gagal baca → TOLAK (fail-closed)
 *
 * Poin 1 paling mudah salah diam-diam: rumus naif menghasilkan rentang KOSONG
 * untuk 21:00–07:00, jadi jam tenang tak pernah berlaku — hijau di tiap test
 * yang cuma memeriksa siang hari, gagal persis pada malam yang jadi alasan
 * fitur ini ada.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import {
  PREFERENSI_BAWAAN,
  bolehKirim,
  didalamJamTenang,
  menitDariJam,
} from '../gerbang-kirim.js'

let db: Client
let companyId: string
let userId: string

const jam = (h: number, m = 0) => {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

beforeAll(async () => {
  db = await createRlsClient()
  const { rows: co } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = co[0].id
  const { rows: us } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`,
    [companyId],
  )
  userId = us[0].user_id
  await bersih()
}, 90_000)

afterAll(async () => {
  await bersih()
  await db.end()
})

async function bersih() {
  await db.query(`DELETE FROM preferensi_pesan WHERE user_id = $1`, [userId])
  await db.query(
    `DELETE FROM notifications WHERE user_id = $1 AND type LIKE 'proaktif_%'`,
    [userId],
  )
  // Hari libur uji dibersihkan supaya tak mempengaruhi kasus lain.
  await db.query(`DELETE FROM hari_libur WHERE company_id = $1 AND nama = 'UJI-GERBANG'`, [
    companyId,
  ])
}

async function setPref(p: Record<string, unknown>) {
  const kolom = Object.keys(p)
  const nilai = Object.values(p)
  const set = kolom.map((k, i) => `${k} = $${i + 3}`).join(', ')
  await db.query(
    `INSERT INTO preferensi_pesan (company_id, user_id) VALUES ($1, $2)
     ON CONFLICT (company_id, user_id) DO NOTHING`,
    [companyId, userId],
  )
  if (kolom.length > 0) {
    await db.query(
      `UPDATE preferensi_pesan SET ${set} WHERE company_id = $1 AND user_id = $2`,
      [companyId, userId, ...nilai],
    )
  }
}

/** Menambah N notifikasi proaktif hari ini — untuk menguji kuota. */
async function catatKirim(n: number) {
  for (let i = 0; i < n; i += 1) {
    await db.query(
      `INSERT INTO notifications (company_id, user_id, type, title, message, channel, sent_at)
       VALUES ($1, $2, 'proaktif_uji', 'uji', 'uji', 'push', now())`,
      [companyId, userId],
    )
  }
}

describe('rumus jam tenang — MELEWATI tengah malam', () => {
  it('21:00–07:00 menahan pukul 23:00 DAN pukul 03:00', () => {
    const mulai = menitDariJam('21:00')!
    const selesai = menitDariJam('07:00')!
    // Rumus naif (`>= mulai && < selesai`) menghasilkan rentang KOSONG di
    // sini — jam tenang tak pernah berlaku, dan tak ada yang menyadarinya
    // sampai ada yang dikirimi pesan tengah malam.
    expect(didalamJamTenang(23 * 60, mulai, selesai)).toBe(true)
    expect(didalamJamTenang(3 * 60, mulai, selesai)).toBe(true)
    expect(didalamJamTenang(0, mulai, selesai)).toBe(true)
  })

  it('21:00–07:00 MELEWATKAN siang', () => {
    const mulai = menitDariJam('21:00')!
    const selesai = menitDariJam('07:00')!
    expect(didalamJamTenang(13 * 60, mulai, selesai)).toBe(false)
    expect(didalamJamTenang(7 * 60, mulai, selesai)).toBe(false) // batas: sudah bangun
    expect(didalamJamTenang(20 * 60 + 59, mulai, selesai)).toBe(false)
  })

  it('rentang biasa (13:00–15:00) tetap benar', () => {
    const a = menitDariJam('13:00')!
    const b = menitDariJam('15:00')!
    expect(didalamJamTenang(14 * 60, a, b)).toBe(true)
    expect(didalamJamTenang(16 * 60, a, b)).toBe(false)
  })

  it('mulai == selesai berarti TAK ADA jam tenang', () => {
    const a = menitDariJam('09:00')!
    expect(didalamJamTenang(9 * 60, a, a)).toBe(false)
  })

  it('jam tak sah → null, bukan angka ngawur', () => {
    expect(menitDariJam('25:00')).toBeNull()
    expect(menitDariJam('7:00')).toBeNull() // wajib dua digit
    expect(menitDariJam('')).toBeNull()
  })
})

describe('baris preferensi HILANG = bawaan protektif', () => {
  it('tanpa baris, pukul 23:00 tetap DITAHAN', async () => {
    // Bawaan yang berarti "kirim kapan saja" membuat gerbang ini tak menjaga
    // siapa pun pada hari pertama — hari saat ia paling dibutuhkan.
    const k = await bolehKirim({
      db: createTenantDb(companyId), userId, sekarang: jam(23),
    })
    expect(k.boleh).toBe(false)
    if (!k.boleh) expect(k.alasan).toBe('jam_tenang')
  })

  it('bawaan pustaka SAMA dengan DEFAULT kolom', async () => {
    // Kalau keduanya menyimpang, baris yang hilang berperilaku beda dari
    // baris yang baru dibuat — dan bedanya cuma terlihat saat ada yang
    // membuka halaman preferensi lalu menekan simpan tanpa mengubah apa pun.
    await setPref({})
    const { rows } = await db.query(
      `SELECT jam_tenang_mulai, jam_tenang_selesai, maks_per_hari, berhenti
         FROM preferensi_pesan WHERE user_id = $1`,
      [userId],
    )
    expect(rows[0].jam_tenang_mulai).toBe(PREFERENSI_BAWAAN.jamTenangMulai)
    expect(rows[0].jam_tenang_selesai).toBe(PREFERENSI_BAWAAN.jamTenangSelesai)
    expect(rows[0].maks_per_hari).toBe(PREFERENSI_BAWAAN.maksPerHari)
    expect(rows[0].berhenti).toBe(PREFERENSI_BAWAAN.berhenti)
    await bersih()
  })
})

describe('jam tenang & MENDESAK', () => {
  it('pesan biasa DITAHAN pukul 23:00', async () => {
    await setPref({})
    const k = await bolehKirim({ db: createTenantDb(companyId), userId, sekarang: jam(23) })
    expect(k.boleh).toBe(false)
    if (!k.boleh) expect(k.alasan).toBe('jam_tenang')
  })

  it('pesan MENDESAK MENEMBUS jam tenang', async () => {
    await setPref({})
    const k = await bolehKirim({
      db: createTenantDb(companyId), userId, sekarang: jam(23), kepentingan: 'mendesak',
    })
    expect(k.boleh).toBe(true)
  })

  it('pesan biasa LOLOS pukul 10:00', async () => {
    await setPref({})
    const k = await bolehKirim({ db: createTenantDb(companyId), userId, sekarang: jam(10) })
    expect(k.boleh).toBe(true)
  })
})

describe('opt-out menahan SEGALANYA', () => {
  it('berhenti menahan pesan biasa', async () => {
    await setPref({ berhenti: true })
    const k = await bolehKirim({ db: createTenantDb(companyId), userId, sekarang: jam(10) })
    expect(k.boleh).toBe(false)
    if (!k.boleh) expect(k.alasan).toBe('berhenti')
  })

  it('berhenti menahan pesan MENDESAK juga', async () => {
    // Pengecualian yang bisa ditembus siapa pun bukan opt-out.
    await setPref({ berhenti: true })
    const k = await bolehKirim({
      db: createTenantDb(companyId), userId, sekarang: jam(10), kepentingan: 'mendesak',
    })
    expect(k.boleh).toBe(false)
    if (!k.boleh) expect(k.alasan).toBe('berhenti')
  })

  it('sapaan ditahan saat boleh_sapaan mati, pesan bertemuan tetap lolos', async () => {
    await setPref({ berhenti: false, boleh_sapaan: false })
    const sapa = await bolehKirim({
      db: createTenantDb(companyId), userId, sekarang: jam(10), sapaan: true,
    })
    expect(sapa.boleh).toBe(false)

    const temuan = await bolehKirim({
      db: createTenantDb(companyId), userId, sekarang: jam(10),
    })
    expect(temuan.boleh).toBe(true)
  })
})

describe('kuota harian', () => {
  it('menahan yang ke-N+1', async () => {
    await setPref({ berhenti: false, boleh_sapaan: true, maks_per_hari: 2 })
    await catatKirim(2)

    const k = await bolehKirim({ db: createTenantDb(companyId), userId, sekarang: jam(10) })
    expect(k.boleh).toBe(false)
    if (!k.boleh) expect(k.alasan).toBe('kuota_habis')
  })

  it('MENDESAK menembus kuota habis', async () => {
    const k = await bolehKirim({
      db: createTenantDb(companyId), userId, sekarang: jam(10), kepentingan: 'mendesak',
    })
    expect(k.boleh).toBe(true)
  })

  it('sisa kuota dilaporkan, bukan cuma boleh/tidak', async () => {
    await bersih()
    await setPref({ maks_per_hari: 3 })
    await catatKirim(1)
    const k = await bolehKirim({ db: createTenantDb(companyId), userId, sekarang: jam(10) })
    expect(k.boleh).toBe(true)
    if (k.boleh) expect(k.sisaKuota).toBe(2)
  })

  it('kuota NOL menahan semua pesan biasa', async () => {
    await bersih()
    await setPref({ maks_per_hari: 0 })
    const k = await bolehKirim({ db: createTenantDb(companyId), userId, sekarang: jam(10) })
    expect(k.boleh).toBe(false)
    if (!k.boleh) expect(k.alasan).toBe('kuota_habis')
  })
})

describe('hari libur', () => {
  it('menahan pesan biasa di hari libur', async () => {
    await bersih()
    await setPref({})
    const hariIni = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const tgl = `${hariIni.getFullYear()}-${p(hariIni.getMonth() + 1)}-${p(hariIni.getDate())}`
    await db.query(
      `INSERT INTO hari_libur (company_id, tanggal, nama, jenis, tetap_bekerja)
       VALUES ($1, $2, 'UJI-GERBANG', 'nasional', false)`,
      [companyId, tgl],
    )

    const k = await bolehKirim({ db: createTenantDb(companyId), userId, sekarang: jam(10) })
    expect(k.boleh).toBe(false)
    if (!k.boleh) expect(k.alasan).toBe('hari_libur')
  })

  it('MENDESAK menembus hari libur', async () => {
    const k = await bolehKirim({
      db: createTenantDb(companyId), userId, sekarang: jam(10), kepentingan: 'mendesak',
    })
    expect(k.boleh).toBe(true)
    await bersih()
  })
})

describe('FAIL-CLOSED — gangguan basis menahan, bukan membuka', () => {
  /**
   * `db` palsu yang selalu gagal.
   *
   * Ditulis tangan, bukan lewat basis nyata: memaksa Postgres gagal di tengah
   * test berarti merusak keadaan yang dipakai kasus lain. Yang diuji di sini
   * KEPUTUSANNYA saat pembacaan gagal, dan itu tak butuh basis sungguhan.
   */
  const dbGagal = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'basis mati' } }),
        }),
        // Jalur kuota memakai `.like().gte()`; disediakan supaya bentuknya
        // sama walau cabang ini tak tercapai saat preferensi sudah gagal.
        like: () => ({ gte: async () => ({ data: null, error: { message: 'basis mati' } }) }),
      }),
    }),
  } as never

  it('preferensi gagal dibaca → DITAHAN, bukan diloloskan', async () => {
    // Kebalikannya berarti satu gangguan basis membuka pintu untuk SELURUH
    // pesan sekaligus — persis saat sistemnya sedang tak sehat.
    const k = await bolehKirim({ db: dbGagal, userId, sekarang: jam(10) })
    expect(k.boleh).toBe(false)
    if (!k.boleh) expect(k.alasan).toBe('gagal_baca_preferensi')
  })

  it('MENDESAK pun ikut ditahan saat basis gagal', async () => {
    const k = await bolehKirim({
      db: dbGagal, userId, sekarang: jam(10), kepentingan: 'mendesak',
    })
    expect(k.boleh).toBe(false)
  })
})
