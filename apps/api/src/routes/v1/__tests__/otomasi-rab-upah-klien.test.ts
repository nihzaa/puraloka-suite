/**
 * Harga satuan RAB (3.12) · laporan upah (6.4) · kontrak klien (7.10).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA CACAT NYATA YANG DIJAGA DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ketiganya sungguh terjadi dan tertangkap di basis dev, bukan dibayangkan:
 *
 *   1. Satuan borongan (`ls`) ikut dibandingkan. Tiga temuan paling NYARING
 *      di basis ini semuanya `ls` — "Air Kerja" Rp 800 ribu lawan Rp 10 juta,
 *      12,5× — dan ketiganya wajar, karena lump sum memang menskala dengan
 *      besar proyek. Orang yang memeriksa tiga teratas lalu menemukan
 *      semuanya wajar berhenti memeriksa yang keempat.
 *
 *   2. Rasio dibulatkan SEBELUM dibandingkan dengan ambang. Satu laporan upah
 *      berasio 0,66667 membulat jadi 0,67 dan lolos dari ambang 1/1,5. Ambang
 *      yang bergerak tergantung pembulatan bukan ambang.
 *
 *   3. "klien null" terkirim sungguhan. Seluruh 10 klien berjenis
 *      `perorangan` dan `company_name` NULL di kesepuluhnya.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-RUK'

let app: FastifyInstance
let db: Client
let companyId: string
let proyekA: string
let proyekB: string

const panggil = (rute: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${rute}${q}`,
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  await db.query(`DELETE FROM rab_items WHERE name LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE company_id = $1
        AND type IN ('rab_harga_menyimpang', 'upah_menyimpang', 'kontrak_klien_berakhir')`,
    [companyId])
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

  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 ORDER BY created_at LIMIT 2`,
    [companyId])
  if (p.length < 2) throw new Error('butuh dua proyek')
  proyekA = p[0].id
  proyekB = p[1].id

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

async function buatItem(proyek: string, nama: string, satuan: string, harga: number) {
  await db.query(
    `INSERT INTO rab_items (project_id, level, name, unit, qty, unit_price, total_price)
     VALUES ($1,'item',$2,$3,1,$4,$4)`,
    [proyek, nama, satuan, harga])
}

/** Apakah ada notifikasi RAB yang menyebut nama item ini. */
async function ditegurRab(nama: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = 'rab_harga_menyimpang' AND company_id = $1 AND message LIKE $2`,
    [companyId, `%${nama}%`])
  return (rows[0].n as number) > 0
}

describe('3.12 — harga satuan RAB menyimpang', () => {
  it('satuan borongan DIKELUARKAN, satuan ukur dibandingkan', async () => {
    /*
      Dua item dengan sebaran harga yang SAMA PERSIS (10×), hanya satuannya
      berbeda. Kalau `ls` ikut dibandingkan, keduanya ditegur — dan yang `ls`
      adalah teguran palsu yang justru paling mencolok angkanya.

      Ini bukan penyederhanaan: harga lump sum memang menskala dengan besar
      proyek, jadi 10× bukan penyimpangan melainkan aritmetika.
    */
    await bersihkan()
    await buatItem(proyekA, `${TANDA} borongan`, 'ls', 1_000_000)
    await buatItem(proyekB, `${TANDA} borongan`, 'ls', 10_000_000)
    await buatItem(proyekA, `${TANDA} terukur`, 'm²', 1_000_000)
    await buatItem(proyekB, `${TANDA} terukur`, 'm²', 10_000_000)

    const r = await panggil('rab-harga-menyimpang')
    expect(r.statusCode, r.body).toBe(200)

    expect(await ditegurRab(`${TANDA} terukur`),
      'item bersatuan m² dengan sebaran 10× TIDAK ditegur')
      .toBe(true)
    expect(await ditegurRab(`${TANDA} borongan`),
      'item bersatuan `ls` ikut ditegur — lump sum memang menskala dengan '
      + 'besar proyek, dan teguran palsunya justru yang angkanya paling besar')
      .toBe(false)
  }, 120_000)

  it('ambang PECAHAN benar-benar menyaring', async () => {
    /*
      Ambangnya 1,3 — pecahan. Kalau `jepit()` membulatkannya jadi 1, tiap
      selisih 1% ditandai sebagai penyimpangan, dan tak ada satu pun galat.
      Cacat itu sudah terjadi sekali, ketika ambang 0,75 diam-diam jadi 0.

      Sebarannya 1,2× — di bawah bawaan 1,3, di atas ambang 1,1.
    */
    await bersihkan()
    await buatItem(proyekA, `${TANDA} tipis`, 'm', 100_000)
    await buatItem(proyekB, `${TANDA} tipis`, 'm', 120_000)

    await panggil('rab-harga-menyimpang')
    expect(await ditegurRab(`${TANDA} tipis`),
      'sebaran 1,2× ditegur pada ambang bawaan 1,3 — ambangnya membulat jadi 1')
      .toBe(false)

    await panggil('rab-harga-menyimpang?rasio=1.1')
    expect(await ditegurRab(`${TANDA} tipis`),
      'ambang 1,1 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBe(true)
  }, 120_000)

  it('item yang hanya ada di SATU proyek tak dibandingkan', async () => {
    /*
      Dua baris bernama sama di proyek yang sama adalah dua item RAB, bukan
      dua harga untuk pekerjaan yang sama. Membandingkannya menegur penyusun
      RAB atas sesuatu yang memang wajar — misalnya cat interior lantai 1 dan
      lantai 2 dengan mutu berbeda.
    */
    await bersihkan()
    await buatItem(proyekA, `${TANDA} sendirian`, 'm²', 100_000)
    await buatItem(proyekA, `${TANDA} sendirian`, 'm²', 900_000)

    await panggil('rab-harga-menyimpang')
    expect(await ditegurRab(`${TANDA} sendirian`),
      'dua baris di proyek yang SAMA ditegur sebagai selisih antar proyek')
      .toBe(false)
  }, 120_000)
})

describe('6.4 — laporan upah menyimpang', () => {
  it('ambang dibandingkan MENTAH, bukan sesudah dibulatkan', async () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      CACAT INI TERTANGKAP DI BASIS NYATA
      ══════════════════════════════════════════════════════════════════════

      Satu laporan Rp 2.800.000 dengan median Rp 4.200.000 berasio tepat
      0,666666… — persis 1/1,5. Dibulatkan lebih dulu ia jadi 0,67, dan
      0,67 > 0,66667, jadi ia LOLOS dari ambangnya sendiri.

      Sesudah diperbaiki, laporan itu ditegur di basis dev:

        "Laporan upah minggu 2026-06-01 sebesar Rp 2.800.000 — 1.5× lebih
         kecil daripada biasanya untuk pekerjaan yang sama (Rp 4.200.000,
         dari 7 minggu sebelumnya)."

      Test ini memakai laporan itu sendiri, dicari dari basis menurut
      BENTUKNYA (rasio tepat di batas), bukan menurut id yang dipaku.
    */
    const { rows } = await db.query(
      `SELECT w.id, w.net_amount,
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY h.net_amount)
                 FROM weekly_wage_reports h
                WHERE h.scope_id = w.scope_id AND h.status = 'paid') med,
              (SELECT count(*) FROM weekly_wage_reports h
                WHERE h.scope_id = w.scope_id AND h.status = 'paid') riw
         FROM weekly_wage_reports w
        WHERE w.status = 'submitted'`)

    const batas = rows.filter((r) => {
      if (!r.med || Number(r.med) <= 0 || Number(r.riw) < 3) return false
      const m = Number(r.net_amount) / Number(r.med)
      // Tepat di batas: pembulatan ke 2 desimal memindahkannya ke sisi lain.
      const bulat = Math.round(m * 100) / 100
      return (m <= 1 / 1.5 && bulat > 1 / 1.5) || (m >= 1.5 && bulat < 1.5)
    })

    if (batas.length === 0) {
      /*
        Tak ada kasus batas di basis saat ini — dinyatakan, bukan didiamkan.
        Test yang lulus karena tak menemukan apa pun untuk diuji adalah test
        yang berbohong, dan `expect` di bawah menjaga agar jalur ini tetap
        terlihat kalau seed berubah.
      */
      expect(rows.length,
        'tak ada laporan `submitted` sama sekali — test ini tak menguji apa pun')
        .toBeGreaterThan(0)
      return
    }

    await db.query(
      `DELETE FROM notifications WHERE type = 'upah_menyimpang' AND company_id = $1`,
      [companyId])
    await panggil('upah-menyimpang')

    const { rows: n } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type = 'upah_menyimpang' AND company_id = $1
          AND action_data->>'record_id' = $2`,
      [companyId, batas[0].id])

    expect(n[0].n,
      'laporan yang rasionya TEPAT di batas tak ditegur — ambangnya '
      + 'dibandingkan sesudah dibulatkan, jadi ia bergerak sendiri')
      .toBeGreaterThan(0)
  }, 120_000)

  it('yang riwayatnya terlalu tipis DILAPORKAN, bukan didiamkan', async () => {
    /*
      Laporan yang lingkupnya belum punya riwayat tak bisa dibandingkan dengan
      apa pun. Melewatinya diam-diam membuat "0 anomali" terbaca sebagai
      "semuanya wajar" — padahal sebagiannya belum pernah diperiksa.

      Terukur di basis: ada laporan `submitted` dengan riwayat NOL.
    */
    const r = await panggil('upah-menyimpang')
    expect(r.statusCode, r.body).toBe(200)
    const c = (r.json() as {
      checked: { menunggu_persetujuan: number; tak_bisa_dinilai: number }
    }).checked

    expect(c.menunggu_persetujuan,
      'tak ada laporan menunggu persetujuan — test tak menguji apa pun')
      .toBeGreaterThan(0)
    expect(c.tak_bisa_dinilai,
      'nol laporan tak-bisa-dinilai padahal ada lingkup tanpa riwayat — '
      + 'angka ini yang menahan "0 anomali" dibaca sebagai "semuanya wajar"')
      .toBeGreaterThan(0)
  }, 120_000)

  it('minimum riwayat BENAR-BENAR menyaring', async () => {
    /*
      Satu minggu pembanding bukan kebiasaan, itu satu titik. Kalau minimumnya
      cuma dilaporkan tanpa dipakai, laporan bisa ditandai menyimpang karena
      berbeda dari SATU minggu yang kebetulan tercatat.
    */
    const longgar = await panggil('upah-menyimpang', '?riwayat=1')
    const ketat = await panggil('upah-menyimpang', '?riwayat=20')

    const tl = (x: typeof longgar) =>
      (x.json() as { checked: { tak_bisa_dinilai: number } }).checked.tak_bisa_dinilai

    expect(tl(ketat),
      'menaikkan minimum riwayat tak menambah yang tak-bisa-dinilai — '
      + 'nilainya tak dipakai menyaring')
      .toBeGreaterThan(tl(longgar))
  }, 120_000)
})

describe('7.10 — kontrak klien mendekati akhir', () => {
  it('menyebut NAMA klien perorangan, bukan "null"', async () => {
    /*
      Terkirim sungguhan ke basis sebelum diperbaiki:

        "… — klien null, nilai kontrak Rp 890.000.000."

      Seluruh 10 klien berjenis `perorangan`, dan `company_name` NULL di
      kesepuluhnya. Perusahaan konstruksi kecil bekerja untuk ORANG; kolom
      nama badan yang kosong adalah keadaan normal di sini.
    */
    await db.query(
      `DELETE FROM notifications
        WHERE type = 'kontrak_klien_berakhir' AND company_id = $1`, [companyId])

    const r = await panggil('kontrak-klien-berakhir')
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT message FROM notifications
        WHERE type = 'kontrak_klien_berakhir' AND company_id = $1`, [companyId])

    expect(rows.length, 'nol notifikasi — tak ada proyek mendekati akhir')
      .toBeGreaterThan(0)
    for (const x of rows) {
      expect(String(x.message), 'nilai NULL bocor ke isi pesan')
        .not.toMatch(/klien null|undefined/)
    }

    /*
      Dan NAMANYA harus benar-benar muncul.

      Mutasi membuktikan kenapa dua pemeriksaan ini tak sama: membuang
      cadangan `contact_person` membuat seluruh potongan "— klien X" HILANG,
      jadi kata "null" pun tak pernah muncul dan pemeriksaan di atas lulus.
      Yang dijaga di sini SYARATNYA (pesan menyebut kliennya), bukan gejalanya
      (kata "null" tak ada).
    */
    const { rows: nama } = await db.query(
      `SELECT cl.contact_person, n.message
         FROM notifications n
         JOIN projects p ON p.id = n.project_id
         JOIN clients cl ON cl.id = p.client_id
        WHERE n.type = 'kontrak_klien_berakhir' AND n.company_id = $1
          AND cl.contact_person IS NOT NULL`, [companyId])

    expect(nama.length,
      'tak ada notifikasi yang proyeknya punya klien bernama — test tak menguji apa pun')
      .toBeGreaterThan(0)
    for (const x of nama) {
      expect(String(x.message),
        `pesan tak menyebut nama klien "${x.contact_person}" sama sekali`)
        .toContain(String(x.contact_person))
    }
  }, 120_000)

  it('jendelanya DUA ARAH — yang baru selesai ikut disapa', async () => {
    /*
      Proyek yang tanggal selesainya baru lewat justru saat terbaik menyapa:
      pekerjaannya masih segar, kliennya masih sering dihubungi. Membatasinya
      pada masa depan saja melewatkan seluruh proyek yang rampung bulan lalu —
      dan itu bukan peluang yang lebih kecil, melainkan lebih matang.

      Terukur: ada proyek yang berakhir 46 hari LALU dan masuk jendela 60.
    */
    await db.query(
      `DELETE FROM notifications
        WHERE type = 'kontrak_klien_berakhir' AND company_id = $1`, [companyId])
    await panggil('kontrak-klien-berakhir')

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type = 'kontrak_klien_berakhir' AND company_id = $1
          AND (action_data->>'sisa_hari')::int < 0`, [companyId])

    expect(rows[0].n,
      'tak satu pun proyek yang SUDAH berakhir ikut disapa — jendelanya '
      + 'cuma satu arah')
      .toBeGreaterThan(0)
  }, 120_000)

  it('ambang hari benar-benar menyaring', async () => {
    const hitung = async (q: string) => {
      await db.query(
        `DELETE FROM notifications
          WHERE type = 'kontrak_klien_berakhir' AND company_id = $1`, [companyId])
      const r = await panggil('kontrak-klien-berakhir', q)
      return (r.json() as { checked: { mendekati_akhir: number } })
        .checked.mendekati_akhir
    }

    const sempit = await hitung('?hari=7')
    const lebar = await hitung('?hari=365')
    expect(lebar, 'melebarkan jendela tak menambah proyek — ambangnya tak dipakai')
      .toBeGreaterThan(sempit)
  }, 120_000)
})
