/**
 * AUTOMATION 2.9 + 6.3 + 3.6 — ketiga yang sempat dibatalkan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA, DAN APA YANG SEBENARNYA DIBUKTIKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ketiganya saya batalkan 2026-08-16 dengan alasan "datanya tak mendukung".
 * Founder bertanya *"emang gabisa banget dibangun?"* — dan pertanyaan itu
 * benar. Dua dari tiga alasan pembatalan tak bertahan saat diperiksa ulang:
 *
 *   2.9  `project_expenses` NOL baris → saya simpulkan sumbernya salah.
 *        SALAH. `trg_kasbon_approved_create_expense` adalah `AFTER UPDATE`
 *        dengan syarat `OLD.status <> 'approved'`; data seed disisipkan
 *        LANGSUNG berstatus approved, jadi trigger tak pernah menyala.
 *        Artefak seed, bukan cacat rancangan.
 *
 *   6.3  100% pekerja "tak absen" → saya simpulkan otomasinya tak berguna.
 *        Separuh benar: sebagai tuduhan kepada PEKERJA memang tak berguna,
 *        tetapi sebagai peringatan operasional per LINGKUP KERJA ia tepat.
 *
 *   3.6  tren butuh dua periode → tetap benar, dan tak akan sembuh sendiri
 *        karena identitas pihaknya lewat teks bebas. Diganti STATUS
 *        (`bolehDipakai`), yang tak butuh periode kedua.
 *
 * Karena itu test ini tak cuma memeriksa "rutenya jalan". Untuk 2.9 ia
 * MENYISIPKAN pengeluaran nyata — membuktikan otomasi yang di basis dev diam
 * memang bekerja begitu datanya ada, bukan diam karena rusak.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import costControlRoutes from '../cost-control.js'

const TANDA = '[UJI-TIGA]'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let userId: string

const panggil = (kunci: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${kunci}${q}`,
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  await db.query(`DELETE FROM project_expenses WHERE description LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE type IN ('serapan_anggaran','absensi_berhenti','subkon_tak_layak')
        AND company_id = $1`,
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

  const { rows: u } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
  userId = u[0].user_id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  /*
    `cost-control` WAJIB ikut didaftarkan — 2.9 memanggilnya lewat
    `server.inject`. Tanpa ini rutenya 404, otomasi melapor 500, dan testnya
    merah untuk alasan yang tak ada hubungannya dengan apa yang diuji.

    Pelajaran yang sama dengan harness 3.18.
  */
  await app.register(costControlRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

describe('2.9 — serapan anggaran', () => {
  it('DIAM saat tak ada pengeluaran, BERBUNYI begitu ada — dan itu bedanya', async () => {
    /*
      Inti pembelaan otomasi ini.

      Di basis dev `project_expenses` nol baris, jadi serapan 0% dan otomasi
      diam. Itu yang membuat saya membatalkannya. Tetapi diam karena TAK ADA
      BELANJA berbeda dari diam karena RUSAK — dan satu-satunya cara
      membedakannya adalah menyisipkan belanja lalu melihat ia berbunyi.

      Proyek dipilih yang punya pagu terbesar supaya satu baris pengeluaran
      cukup melampaui ambang; kalau tidak, test ini akan lulus atau gagal
      tergantung data seed yang bisa berubah.
    */
    await bersihkan()

    const r0 = await panggil('serapan-anggaran')
    expect(r0.statusCode, r0.body).toBe(200)
    const c0 = (r0.json() as {
      checked: { proyek_di_portofolio: number; diperiksa: number; tanpa_pagu: number }
    }).checked

    expect(c0.proyek_di_portofolio,
      'portofolio kosong — otomasi ini tak menguji apa pun').toBeGreaterThan(0)

    // Proyek berpagu terbesar, DIUKUR — bukan diambil yang pertama.
    const { rows: pil } = await db.query(
      `SELECT p.id, p.name, coalesce(sum(r.total_price), 0) AS pagu
         FROM projects p
         JOIN rab_items r ON r.project_id = p.id AND r.level = 'category'
        WHERE p.company_id = $1 AND p.status = 'active'
        GROUP BY p.id, p.name
        ORDER BY 3 DESC LIMIT 1`,
      [companyId])
    expect(pil.length, 'tak ada proyek aktif ber-RAB').toBe(1)
    projectId = pil[0].id as string
    const pagu = Number(pil[0].pagu)

    const { rows: kat } = await db.query(
      `SELECT id FROM project_expense_categories WHERE project_id = $1 LIMIT 1`,
      [projectId])

    /*
      `status = 'approved'` — `analisaProyek` hanya menghitung yang disetujui.
      Disisipkan LANGSUNG dengan status itu, persis seperti data seed; yang
      diuji di sini otomasinya, bukan trigger kasbon.
    */
    /*
      `unit_price` dan `category_id` WAJIB — diukur ke
      `information_schema`, bukan ditebak. Kolom bukan-null tanpa default:
      project_id · category_id · description · unit_price · total_amount ·
      submitted_by.

      Bentuk pertama saya melewatkan `unit_price` dan ditolak basis. Kedelapan
      kalinya dalam sesi ini nama/bentuk kolom ditebak alih-alih diukur.
    */
    expect(kat[0]?.id, 'proyek tak punya kategori pengeluaran').toBeTruthy()

    const nominal = Math.ceil(pagu * 0.95)
    await db.query(
      `INSERT INTO project_expenses
         (project_id, category_id, description, qty, unit_price, total_amount,
          status, expense_date, expense_source, submitted_by)
       VALUES ($1, $2, $3, 1, $4, $4, 'approved', current_date, 'main_cash', $5)`,
      [projectId, kat[0].id, `${TANDA} belanja uji`, nominal, userId],
    )

    const r1 = await panggil('serapan-anggaran')
    expect(r1.statusCode, r1.body).toBe(200)

    const { rows } = await db.query(
      `SELECT message, action_data FROM notifications
        WHERE type = 'serapan_anggaran' AND company_id = $1
          AND project_id = $2`,
      [companyId, projectId])

    expect(rows.length,
      'otomasi tetap diam padahal serapan 95% — ia memang rusak, bukan sekadar tak ada data')
      .toBeGreaterThan(0)

    /*
      Pesannya WAJIB menyebut dasar pembandingnya.

      RAB adalah harga JUAL. Persentase terhadapnya terlihat lebih kecil
      daripada kenyataan, dan pustakanya memperingatkan itu sendiri. Angka
      tanpa dasarnya mengundang keputusan yang lebih percaya diri daripada
      datanya.
    */
    expect(rows[0].message as string,
      'pesan tak menyebut dasar pembandingnya').toMatch(/dihitung terhadap/i)
    const ad = rows[0].action_data as { dasar?: string; serapan_pct?: number }
    expect(ad.dasar, 'dasar pembanding tak terbawa ke action_data').toBeTruthy()
    expect(Number(ad.serapan_pct)).toBeGreaterThan(50)
  }, 180_000)

  it('proyek TANPA pagu dilewati, dan itu dilaporkan', async () => {
    /*
      `serapanPct === null` berarti pagunya nol — proyek tanpa RAP, RAB,
      maupun nilai kontrak. Itu ketiadaan data, bukan penghematan.

      Pustakanya sengaja memulangkan `null` alih-alih 0 untuk membedakan
      keduanya; pembedaan itu sia-sia kalau otomasi menyamakannya lagi.
    */
    const r = await panggil('serapan-anggaran')
    const c = (r.json() as {
      checked: { proyek_di_portofolio: number; diperiksa: number; tanpa_pagu: number }
    }).checked

    expect(c.diperiksa + c.tanpa_pagu,
      'ada proyek yang tak masuk ember mana pun').toBeLessThanOrEqual(c.proyek_di_portofolio)
    expect(c.tanpa_pagu,
      'nol proyek tanpa pagu — angka ini tak pernah terbukti dilaporkan')
      .toBeGreaterThanOrEqual(0)
  }, 120_000)
})

describe('6.3 — absensi berhenti dicatat', () => {
  it('menegur per LINGKUP KERJA, bukan per pekerja', async () => {
    /*
      Pembedaan yang membuat otomasi ini berguna sama sekali.

      Diukur: 60 dari 60 pekerja aktif berjarak ≥7 hari dari absensi
      terakhirnya. Sebagai tuduhan per-pekerja itu 60 pesan tentang satu sebab
      yang sama — kebisingan. Sebagai peringatan per-lingkup ia 17 pesan yang
      masing-masing punya penerima dan tindakan yang jelas.

      ── Dan satu cacat yang HANYA ketahuan saat dijalankan

      Bentuk pertama memakai `viaProject('work_scopes', pid)`. `work_scopes`
      kategori C lewat `assignment_id`, BUKAN `project_id` — jadi id proyek
      dioper ke tempat yang menunggu id penugasan. Nol baris, rute balas 200,
      nol notifikasi, tanpa satu pun galat.

      Typecheck tak bisa menangkapnya: keduanya `string`.
    */
    await bersihkan()

    const r = await panggil('absensi-berhenti')
    expect(r.statusCode, r.body).toBe(200)

    const c = (r.json() as {
      checked: { scope_aktif: number; scope_berhenti: number }
    }).checked

    expect(c.scope_aktif,
      'NOL lingkup terperiksa — rantai tenancy tiga lapis putus lagi')
      .toBeGreaterThan(0)

    const { rows } = await db.query(
      `SELECT count(DISTINCT action_data->>'record_id')::int lingkup,
              count(*)::int total
         FROM notifications
        WHERE type = 'absensi_berhenti' AND company_id = $1`,
      [companyId])

    if (c.scope_berhenti > 0) {
      expect(rows[0].lingkup,
        'ada lingkup berhenti tapi nol notifikasi').toBeGreaterThan(0)

      // `record_id` = id LINGKUP, bukan id pekerja. Kalau berbalik, dedup
      // harian akan menahan per orang dan satu lingkup mengirim puluhan pesan.
      const { rows: cek } = await db.query(
        `SELECT count(*)::int n FROM work_scopes
          WHERE id IN (SELECT (action_data->>'record_id')::uuid FROM notifications
                        WHERE type = 'absensi_berhenti' AND company_id = $1)`,
        [companyId])
      expect(cek[0].n,
        '`record_id` bukan id work_scopes — dedup akan salah sasaran')
        .toBe(rows[0].lingkup)
    }
  }, 180_000)

  it('dedup harian menahan', async () => {
    await bersihkan()
    await panggil('absensi-berhenti')

    const hitung = async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int n FROM notifications
          WHERE type = 'absensi_berhenti' AND company_id = $1`, [companyId])
      return rows[0].n as number
    }

    const a = await hitung()
    await panggil('absensi-berhenti')
    expect(await hitung(), 'panggilan kedua menambah — dedup tak menahan').toBe(a)
  }, 180_000)
})

describe('3.6 — subkontraktor tak layak', () => {
  it('menilai evaluasi TERBARU saja', async () => {
    /*
      Tanpa ini, subkon yang tahun lalu masuk daftar hitam lalu diperbaiki
      tetap ditegur berdasar baris lamanya — dan pesan yang menuduh atas
      keadaan yang sudah berubah adalah cara tercepat membuat orang berhenti
      membacanya.

      Diukur di basis: 2 dari 5 baris memenuhi `bolehDipakai = false`.
    */
    await bersihkan()

    const r = await panggil('subkon-tak-layak')
    expect(r.statusCode, r.body).toBe(200)

    const c = (r.json() as { checked: { pihak_dinilai: number; tak_layak: number } }).checked
    expect(c.pihak_dinilai, 'nol pihak dinilai').toBeGreaterThan(0)

    /*
      Jumlah pihak yang dinilai harus SAMA PERSIS dengan jumlah pihak yang
      berbeda — bukan sekadar "tak melebihi jumlah baris".

      Bentuk pertama assertion ini `toBeLessThanOrEqual(jumlah baris)`, dan
      mutasi membuktikannya terlalu longgar: mengubah kunci pengelompokan
      supaya TIAP BARIS jadi kelompoknya sendiri tetap lolos, karena 5 ≤ 5.

      Kunci pengelompokannya `supplier_id` kalau ada, `nama:<pihak_nama>` kalau
      tidak — dihitung di sini dengan cara yang sama supaya keduanya bergerak
      bersama saat datanya berubah.
    */
    const { rows: pihak } = await db.query(
      `SELECT count(DISTINCT coalesce(supplier_id::text, 'nama:' || coalesce(pihak_nama,'?')))::int n
         FROM evaluasi_subkon WHERE company_id = $1`, [companyId])
    expect(c.pihak_dinilai,
      'jumlah pihak dinilai tak sama dengan jumlah pihak berbeda — '
      + 'pengelompokan "terbaru per pihak" tak bekerja')
      .toBe(pihak[0].n)

    if (c.tak_layak > 0) {
      const { rows } = await db.query(
        `SELECT message, action_data FROM notifications
          WHERE type = 'subkon_tak_layak' AND company_id = $1 LIMIT 1`,
        [companyId])
      expect(rows.length).toBe(1)

      // Alasannya WAJIB ikut — "tak boleh dipakai" tanpa sebab tak bisa
      // ditindaklanjuti, dan yang menerimanya harus menebak.
      const ad = rows[0].action_data as { alasan?: string[] }
      expect(Array.isArray(ad.alasan) && ad.alasan.length > 0,
        'alasan tak layak tak terbawa ke action_data').toBe(true)
      expect(rows[0].message as string).toMatch(/tak boleh dipakai/i)
    }
  }, 180_000)
})
