/**
 * AUTOMATION 9.1 — dokumen kepatuhan & izin proyek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rumusnya sudah punya test sendiri (`kepatuhan-k3.test.ts` 28 `it`,
 * `risiko-proyek`). Yang perlu dibuktikan sambungannya — dan sambungan itu
 * punya tiga cara gagal yang tak terlihat dari kode:
 *
 *   1. Dokumen TANPA masa berlaku (`npwp`, `bpjs_ketenagakerjaan`) tak boleh
 *      ditegur. Dua dari sembilan dokumen nyata berbentuk begitu, dan
 *      menagihnya sebagai "kedaluwarsa" adalah bug yang menuduh dokumen yang
 *      benar.
 *
 *   2. Dokumen yang lewat TERLALU lama harus berhenti ditegur. Terukur: satu
 *      izin proyek lewat 283 hari. Dedup harian menahan kembar DALAM satu
 *      hari, bukan lintas hari.
 *
 *   3. DUA jenis notifikasi terpisah — dedup bekerja per (jenis, record), dan
 *      menyatukannya membuat salah satunya tertahan keliru.
 *
 * ── Yang TIDAK diuji di sini, dan kenapa
 *
 * `hijauTapiMati` (dokumen bercentang terverifikasi tetapi tanggalnya lewat)
 * dihitung pustakanya dan sudah punya testnya di sana. Yang diuji di sini cuma
 * bahwa nilainya IKUT DIBAWA ke `action_data` — kalau tidak, sinyal terkuat
 * himpunan ini hilang tanpa jejak.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import { AMBANG_OTOMASI } from '../../../lib/ambang-otomasi.js'
import { AMBANG_SEGERA_HABIS } from '../../../lib/kepatuhan-k3.js'

const TANDA = 'UJI-KEP-91'

let app: FastifyInstance
let db: Client
let companyId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/kepatuhan-dokumen${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tanggal(selisih: number): string {
  const d = new Date()
  d.setDate(d.getDate() + selisih)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM dokumen_kepatuhan WHERE nomor LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE type IN ('kepatuhan_dokumen', 'izin_proyek_habis') AND company_id = $1`,
    [companyId],
  )
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows: c } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

describe('9.1 — dokumen kepatuhan', () => {
  it('dokumen TANPA masa berlaku tak ditegur; yang habis dekat ditegur', async () => {
    /*
      Diukur di basis dev: 2 dari 9 dokumen (`npwp`, `bpjs_ketenagakerjaan`)
      memang tak punya `berlaku_sampai`. Pustakanya memetakannya ke
      `tanpa_masa`, dan otomasi ini sengaja hanya menegur `kedaluwarsa` dan
      `segera_habis`.

      Kalau saringan status hilang, kedua dokumen itu ikut ditegur — dan
      menuduh NPWP "kedaluwarsa" membuat seluruh pesan kepatuhan kehilangan
      kepercayaan.
    */
    await bersihkan()

    /*
      `diverifikasi_oleh` + `diverifikasi_pada` WAJIB ikut saat
      `terverifikasi = true` — CHECK `kepatuhan_verifikasi_lengkap`.

      Bentuk pertama test ini menyetel `terverifikasi = true` saja dan
      ditolak basis. Dan tak bisa disiasati dengan `false`: presedensi di
      `nilaiKepatuhan` menaruh `belum_diverifikasi` SEBELUM `segera_habis`,
      jadi dokumen 30-hari yang tak terverifikasi tak akan pernah berstatus
      `segera_habis` dan test ini tak akan menguji apa yang dimaksud.
    */
    await db.query(
      `INSERT INTO dokumen_kepatuhan
         (company_id, pihak_nama, jenis, nomor, berlaku_sampai,
          terverifikasi, diverifikasi_oleh, diverifikasi_pada)
       SELECT $1, v.pihak, v.jenis, v.nomor, v.sampai::date, true, m.user_id, now()
         FROM (VALUES ('PT Uji Tanpa Masa','npwp', $2::text, NULL::text),
                      ('PT Uji Dekat',     'sbu',  $3::text, $4::text))
              AS v(pihak, jenis, nomor, sampai)
        CROSS JOIN LATERAL (
          SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1
        ) m`,
      [companyId, `${TANDA}-TANPAMASA`, `${TANDA}-DEKAT`, tanggal(30)],
    )

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT d.nomor
         FROM notifications n
         JOIN dokumen_kepatuhan d ON d.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'kepatuhan_dokumen' AND n.company_id = $1`,
      [companyId],
    )
    const ditegur = new Set(rows.map((x) => x.nomor as string))

    expect(ditegur.has(`${TANDA}-TANPAMASA`),
      'dokumen tanpa masa berlaku ikut ditegur — NPWP dituduh kedaluwarsa')
      .toBe(false)
    expect(ditegur.has(`${TANDA}-DEKAT`),
      'dokumen yang habis 30 hari lagi TIDAK ditegur').toBe(true)
  }, 120_000)

  it('yang lewat terlalu lama berhenti ditegur, dan itu DILAPORKAN', async () => {
    /*
      Terukur: satu izin proyek nyata lewat 283 hari. Tanpa batas bawah ia
      ditagih tiap minggu selamanya.

      Angkanya juga wajib muncul di respons — tanpa itu "0 notifikasi" tak bisa
      dibedakan dari "semua dokumen sehat".
    */
    await bersihkan()

    /*
      `terverifikasi = false` cukup di sini, dan itu disengaja: keduanya sudah
      LEWAT tanggal, dan presedensi `nilaiKepatuhan` menaruh `kedaluwarsa`
      MENANG atas `belum_diverifikasi`. Jadi statusnya tetap `kedaluwarsa`
      tanpa perlu mengisi dua kolom verifikasi.
    */
    await db.query(
      `INSERT INTO dokumen_kepatuhan
         (company_id, pihak_nama, jenis, nomor, berlaku_sampai, terverifikasi)
       VALUES ($1,'PT Uji Baru Lewat','siujk', $2, $3, false),
              ($1,'PT Uji Lama Lewat','siujk', $4, $5, false)`,
      [companyId, `${TANDA}-BARULEWAT`, tanggal(-20), `${TANDA}-LAMALEWAT`, tanggal(-500)],
    )

    const r = await panggil()
    expect(r.statusCode).toBe(200)

    const c = (r.json() as { checked: { dilewati_terlalu_lama: number } }).checked
    expect(c.dilewati_terlalu_lama,
      'tak ada yang dilewati — batas bawah tak bekerja').toBeGreaterThan(0)

    const { rows } = await db.query(
      `SELECT d.nomor
         FROM notifications n
         JOIN dokumen_kepatuhan d ON d.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'kepatuhan_dokumen' AND n.company_id = $1`,
      [companyId],
    )
    const ditegur = new Set(rows.map((x) => x.nomor as string))

    expect(ditegur.has(`${TANDA}-BARULEWAT`), 'yang lewat 20 hari TIDAK ditegur').toBe(true)
    expect(ditegur.has(`${TANDA}-LAMALEWAT`),
      'yang lewat 500 hari masih ditegur — akan menagih selamanya').toBe(false)
  }, 120_000)

  it('`hijauTapiMati` ikut terbawa ke action_data', async () => {
    /*
      Sinyal terkuat di seluruh himpunan ini: dokumen yang masih bercentang
      TERVERIFIKASI padahal tanggalnya sudah lewat. Terukur ada satu nyata —
      asuransi CAR yang lewat 106 hari sambil hijau.

      Orang yang melihat centang hijau berhenti memeriksanya. Kalau nilainya
      tak ikut terbawa, sinyalnya hilang tanpa jejak dan pesannya jadi sama
      saja dengan dokumen merah biasa.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO dokumen_kepatuhan
         (company_id, pihak_nama, jenis, nomor, berlaku_sampai,
          terverifikasi, diverifikasi_oleh, diverifikasi_pada)
       SELECT $1,'PT Uji Hijau Mati','asuransi_car', $2, $3, true, u.user_id, now()
         FROM company_members u WHERE u.company_id = $1 LIMIT 1`,
      [companyId, `${TANDA}-HIJAUMATI`, tanggal(-30)],
    )

    const r = await panggil()
    expect(r.statusCode).toBe(200)

    const { rows } = await db.query(
      `SELECT n.action_data, n.message
         FROM notifications n
         JOIN dokumen_kepatuhan d ON d.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'kepatuhan_dokumen' AND n.company_id = $1
          AND d.nomor = $2 LIMIT 1`,
      [companyId, `${TANDA}-HIJAUMATI`],
    )

    expect(rows.length, 'dokumen hijau-tapi-mati tak ditegur sama sekali').toBe(1)
    const ad = rows[0].action_data as { hijau_tapi_mati?: boolean }
    expect(ad.hijau_tapi_mati, '`hijauTapiMati` tak terbawa ke action_data').toBe(true)
    expect(rows[0].message as string,
      'pesannya tak menyebut centang terverifikasi — sinyal terkuatnya hilang')
      .toMatch(/terverifikasi/i)
  }, 120_000)

  it('bawaan ambang SAMA dengan bawaan pustaka', async () => {
    /*
      Kalau berbeda, layar Kepatuhan menandai "segera habis" pada hari yang
      BERLAINAN dari hari notifikasinya dikirim — dan yang membuka layar
      sesudah menerima pesan menemukan status yang tak cocok.
    */
    expect(AMBANG_OTOMASI['otomasi.kepatuhan_dokumen.hari'].bawaan)
      .toBe(AMBANG_SEGERA_HABIS)
  })

  it('dedup harian menahan kedua jenisnya', async () => {
    await bersihkan()

    // Pemanasan — menstabilkan keadaan sesudah penghapusan (pelajaran 5.7).
    await panggil()

    const hitung = async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int n FROM notifications
          WHERE type IN ('kepatuhan_dokumen','izin_proyek_habis') AND company_id = $1`,
        [companyId])
      return rows[0].n as number
    }

    const a = await hitung()
    await panggil()
    const b = await hitung()

    expect(a).toBeGreaterThan(0)
    expect(b, 'panggilan kedua menambah notifikasi — dedup tak menahan').toBe(a)
  }, 120_000)
})
