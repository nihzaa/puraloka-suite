/**
 * Izin kedaluwarsa (9.1) · risiko lewat tinjau (9.4).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU CACAT YANG TERTANGKAP SEBELUM SEMPAT DIKIRIM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi pertama 9.4 menyaring risiko tertutup dengan
 * `status === 'ditutup' || 'selesai' || 'batal'`. Tak satu pun dari ketiganya
 * ada di enum `status_risiko` — nilainya `terjadi` · `terpantau` · `tertutup`.
 *
 * Saringan itu tak pernah cocok dengan apa pun, jadi risiko yang sudah
 * ditutup akan ditegur selamanya. Dan tak ada satu pun galat yang menunjuknya,
 * karena membandingkan teks dengan teks selalu sah.
 *
 * Test pertama di bawah menjaga persis itu.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-IZR'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string

const panggil = (rute: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${rute}${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tanggal(selisih: number): string {
  const d = new Date()
  d.setDate(d.getDate() + selisih)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM izin_proyek WHERE jenis LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM izin_kerja WHERE nomor LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM risiko_proyek WHERE judul LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE company_id = $1
        AND type IN ('izin_proyek_kedaluwarsa', 'izin_penghalang_belum_terbit',
                     'izin_kerja_kedaluwarsa', 'risiko_lewat_tinjau',
                     'risiko_tinggi_tanpa_tenggat')`,
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

  // Proyek yang BERJALAN — izin penghalang hanya ditegur pada proyek berjalan.
  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 AND status = 'active' LIMIT 1`,
    [companyId])
  if (!p[0]) throw new Error('tak ada proyek berstatus active')
  proyek = p[0].id

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

async function ditegur(tipe: string, id: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = $1 AND company_id = $2 AND action_data->>'record_id' = $3`,
    [tipe, companyId, id])
  return (rows[0].n as number) > 0
}

/*
  `skor` adalah kolom TURUNAN (`dampak × kemungkinan`), bukan kolom biasa —
  basisnya menolak nilai yang disisipkan langsung.

  Itu invarian yang bagus: skor yang bisa diisi sendiri memungkinkan risiko
  berdampak 5 dan berkemungkinan 5 dicatat berskor 1, dan tak ada yang bisa
  menemukannya. Test ini menyetel dampak dan kemungkinannya saja.
*/
async function buatRisiko(judul: string, opsi: {
  dampak?: number; kemungkinan?: number
  status?: string; tenggat?: string | null
}) {
  /*
    Dua constraint lagi yang dipatuhi apa adanya, dan keduanya benar:

      `risiko_tertutup_beralasan`  risiko `tertutup` wajib punya stempel
                                   penutupan DAN alasan ≥10 karakter
      `risiko_terjadi_bertanggal`  risiko `terjadi` wajib menyebut kapan

    Risiko yang ditutup tanpa alasan adalah risiko yang dihapus dari daftar,
    bukan yang diselesaikan.
  */
  const st = opsi.status ?? 'terpantau'
  const { rows } = await db.query(
    `INSERT INTO risiko_proyek (project_id, kode, judul, kategori, dampak,
                                kemungkinan, status, tenggat_tinjau, strategi,
                                ditutup_pada, alasan_tutup, terjadi_pada)
     VALUES ($1,$2,$3,'teknis'::kategori_risiko,$4,$5,
             $6::status_risiko,$7,'kurangi'::strategi_risiko,$8,$9,$10)
     RETURNING id, skor`,
    [proyek, `${TANDA}-${judul.slice(0, 6)}`, `${TANDA} ${judul}`,
     opsi.dampak ?? 4, opsi.kemungkinan ?? 4, st, opsi.tenggat ?? null,
     st === 'tertutup' ? tanggal(-1) : null,
     st === 'tertutup' ? 'Pemasok cadangan sudah dikontrak dan barang tiba.' : null,
     st === 'terjadi' ? tanggal(-30) : null])
  return rows[0].id as string
}

describe('9.4 — risiko lewat tenggat tinjau', () => {
  it('risiko TERTUTUP tidak ditegur — nilai enumnya diukur, bukan ditebak', async () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      CACAT YANG TERTANGKAP SEBELUM SEMPAT DIKIRIM
      ══════════════════════════════════════════════════════════════════════

      Versi pertama menyaring `ditutup`/`selesai`/`batal`. Enum `status_risiko`
      berisi `terjadi` · `terpantau` · `tertutup` — tak satu pun cocok.

      Saringan yang tak pernah cocok tak menghasilkan galat: membandingkan teks
      dengan teks selalu sah. Yang terjadi cuma risiko tertutup ditegur
      selamanya, dan daftar itu tak akan pernah bisa dikosongkan.
    */
    await bersihkan()
    const tertutup = await buatRisiko('tertutup', {
      status: 'tertutup', tenggat: tanggal(-200),
    })
    const terpantau = await buatRisiko('terpantau', {
      status: 'terpantau', tenggat: tanggal(-200),
    })

    const r = await panggil('risiko-lewat-tinjau')
    expect(r.statusCode, r.body).toBe(200)

    expect(await ditegur('risiko_lewat_tinjau', terpantau),
      'risiko terpantau yang lewat 200 hari tak ditegur')
      .toBe(true)
    expect(await ditegur('risiko_lewat_tinjau', tertutup),
      'risiko TERTUTUP ikut ditegur — saringan statusnya memakai nilai yang '
      + 'tak ada di enum, jadi ia tak pernah cocok dengan apa pun')
      .toBe(false)
  }, 120_000)

  it('risiko yang sudah TERJADI tetap diawasi', async () => {
    /*
      `terjadi` bukan `tertutup`. Risiko yang sudah terjadi justru paling butuh
      ditinjau — dampaknya sedang berjalan dan strateginya jelas belum bekerja.
      Menyamakannya dengan "selesai" adalah kesalahan yang paling mudah dibuat
      dan paling mahal.
    */
    await bersihkan()
    const terjadi = await buatRisiko('terjadi', {
      status: 'terjadi', tenggat: tanggal(-200),
    })

    await panggil('risiko-lewat-tinjau')
    expect(await ditegur('risiko_lewat_tinjau', terjadi),
      'risiko yang sudah TERJADI dilewati seolah sudah selesai — dampaknya '
      + 'sedang berjalan dan strateginya jelas belum bekerja')
      .toBe(true)
  }, 120_000)

  it('tenggangnya menyusut sebanding skor', async () => {
    /*
      Dua risiko yang tenggat tinjaunya lewat SAMA PERSIS, hanya skornya
      berbeda. Dengan ambang 14: skor 25 → tenggang ≈ 1 hari; skor 1 →
      tenggang ≈ 13 hari.

      Keduanya lewat 5 hari: yang berskor tinggi berbunyi, yang rendah belum.
    */
    await bersihkan()
    const tinggi = await buatRisiko('tinggi', {
      dampak: 5, kemungkinan: 5, tenggat: tanggal(-5),   // skor turunan = 25
    })
    const rendah = await buatRisiko('rendah', {
      dampak: 1, kemungkinan: 1, tenggat: tanggal(-5),   // skor turunan = 1
    })

    await panggil('risiko-lewat-tinjau')
    expect(await ditegur('risiko_lewat_tinjau', tinggi),
      'risiko berskor 25 yang lewat 5 hari tak ditegur')
      .toBe(true)
    expect(await ditegur('risiko_lewat_tinjau', rendah),
      'risiko berskor 1 yang lewat 5 hari ikut ditegur — tenggangnya tak '
      + 'menyusut menurut skor, jadi yang remeh berbunyi sama nyaringnya '
      + 'dengan yang gawat')
      .toBe(false)
  }, 120_000)

  it('risiko tinggi TANPA tenggat tinjau ditegur terpisah', async () => {
    /*
      Tanpa jadwal, risiko itu tak akan pernah muncul di daftar lewat-tenggat
      mana pun — jadi risiko paling besar justru jadi yang paling mungkin
      terlupakan. Diam terhadapnya terlihat persis seperti keberhasilan.
    */
    await bersihkan()
    const tanpa = await buatRisiko('tanpa tenggat', { dampak: 5, kemungkinan: 4, tenggat: null })
    const rendahTanpa = await buatRisiko('remeh tanpa', {
      dampak: 1, kemungkinan: 2, tenggat: null,          // skor turunan = 2
    })

    await panggil('risiko-lewat-tinjau')
    expect(await ditegur('risiko_tinggi_tanpa_tenggat', tanpa),
      'risiko berskor 20 tanpa tenggat tinjau tak ditegur')
      .toBe(true)
    expect(await ditegur('risiko_tinggi_tanpa_tenggat', rendahTanpa),
      'risiko berskor 2 tanpa tenggat ikut ditegur — ambang skornya tak dipakai')
      .toBe(false)
  }, 120_000)
})

describe('9.1 — izin kedaluwarsa', () => {
  async function buatIzinProyek(jenis: string, opsi: {
    status?: string; sampai?: string | null; menghalangi?: boolean
  }) {
    /*
      `izin_proyek_terbit_bernomor` menuntut izin berstatus `terbit` punya
      nomor DAN tanggal mulai berlaku. Izin yang mengaku terbit tanpa bisa
      menyebut nomornya bukan izin.
    */
    const terbit = (opsi.status ?? 'terbit') === 'terbit'
    const { rows } = await db.query(
      `INSERT INTO izin_proyek (project_id, jenis, nomor, status,
                                berlaku_dari, berlaku_sampai, menghalangi_mulai)
       VALUES ($1,$2,$3,$4::status_izin_proyek,$5,$6,$7) RETURNING id`,
      [proyek, `${TANDA} ${jenis}`, `${TANDA}-${jenis}`,
       opsi.status ?? 'terbit', terbit ? tanggal(-365) : null,
       opsi.sampai ?? null, opsi.menghalangi ?? false])
    return rows[0].id as string
  }

  it('izin PENGHALANG yang belum terbit ditegur terpisah dan lebih genting', async () => {
    /*
      Izin yang belum pernah terbit berbeda dari izin yang habis masa
      berlakunya: yang kedua PERNAH sah, yang pertama tidak pernah. Dan
      `menghalangi_mulai` menyatakan sendiri bahwa pekerjaan seharusnya belum
      dimulai tanpanya.
    */
    await bersihkan()
    const penghalang = await buatIzinProyek('penghalang', {
      status: 'diajukan', menghalangi: true,
    })
    const biasa = await buatIzinProyek('biasa', { status: 'diajukan', menghalangi: false })

    const r = await panggil('izin-kedaluwarsa')
    expect(r.statusCode, r.body).toBe(200)

    expect(await ditegur('izin_penghalang_belum_terbit', penghalang),
      'izin penghalang yang belum terbit di proyek berjalan tak ditegur')
      .toBe(true)
    expect(await ditegur('izin_penghalang_belum_terbit', biasa),
      'izin biasa yang belum terbit ikut ditegur sebagai penghalang')
      .toBe(false)

    const { rows: n } = await db.query(
      `SELECT priority FROM notifications
        WHERE type = 'izin_penghalang_belum_terbit' AND company_id = $1
          AND action_data->>'record_id' = $2`, [companyId, penghalang])
    expect(n[0]?.priority,
      'izin penghalang tak berprioritas tertinggi — ia lebih genting daripada '
      + 'izin yang sekadar habis masa berlakunya')
      .toBe('urgent')
  }, 120_000)

  it('izin terbit TANPA tanggal akhir dihitung, bukan dilewati diam', async () => {
    /*
      Mungkin memang berlaku selamanya, mungkin tanggalnya belum diisi.
      Keduanya terlihat SAMA di basis, dan otomasi ini tak boleh memilih
      tafsir yang lebih nyaman lalu diam.
    */
    await bersihkan()
    const dasar = await panggil('izin-kedaluwarsa')
    const awal = (dasar.json() as { checked: { izin_tanpa_masa_berlaku: number } })
      .checked.izin_tanpa_masa_berlaku

    await buatIzinProyek('abadi', { status: 'terbit', sampai: null })

    const r = await panggil('izin-kedaluwarsa')
    expect((r.json() as { checked: { izin_tanpa_masa_berlaku: number } })
      .checked.izin_tanpa_masa_berlaku,
      'izin terbit tanpa tanggal akhir tak terhitung — ia hilang dari '
      + 'pengawasan tanpa seorang pun tahu')
      .toBe(awal + 1)
  }, 120_000)

  it('ambang hari benar-benar menyaring', async () => {
    await bersihkan()
    const jauh = await buatIzinProyek('jauh', { status: 'terbit', sampai: tanggal(100) })

    await panggil('izin-kedaluwarsa')
    expect(await ditegur('izin_proyek_kedaluwarsa', jauh),
      'izin yang berakhir 100 hari lagi ditegur pada ambang bawaan 60')
      .toBe(false)

    await panggil('izin-kedaluwarsa', '?hari=150')
    expect(await ditegur('izin_proyek_kedaluwarsa', jauh),
      'ambang 150 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBe(true)
  }, 120_000)

  it('izin kerja: hanya yang DISETUJUI yang berbahaya saat kedaluwarsa', async () => {
    /*
      Izin kerja yang `diajukan` atau `ditolak` tak pernah memberi hak masuk
      kepada siapa pun — kedaluwarsanya tak berakibat apa-apa. Yang
      `disetujui` dipakai orang untuk bekerja di ketinggian atau ruang
      terbatas, dan itu yang berbahaya.
    */
    await bersihkan()
    const buat = async (nomor: string, status: string) => {
      // `izin_keputusan_lengkap`: izin yang disetujui/ditolak wajib menyebut
      // KAPAN diputuskan. Keputusan tanpa tanggal tak bisa diaudit.
      const diputus = status === 'disetujui' || status === 'ditolak'
      const { rows } = await db.query(
        `INSERT INTO izin_kerja (company_id, project_id, nomor, jenis,
                                 uraian_pekerjaan, berlaku_dari, berlaku_sampai,
                                 status, diputuskan_pada,
                                 pengendalian_risiko, apd_wajib, alasan_tolak)
         VALUES ($1,$2,$3,'ketinggian',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [companyId, proyek, nomor, `${TANDA} uraian`,
         tanggal(-20), tanggal(-5), status,
         diputus ? new Date().toISOString() : null,
         // `izin_setuju_ada_pengendalian`: izin kerja tak boleh disetujui
         // tanpa pengendalian risiko dan APD tercatat. Izin ketinggian yang
         // disetujui tanpa menyebut apa pengamannya bukan izin, itu formulir.
         status === 'disetujui' ? 'Pagar pengaman dan full body harness.' : null,
         status === 'disetujui' ? ['helm', 'harness', 'sepatu safety'] : null,
         // `izin_tolak_beralasan`: penolakan wajib beralasan ≥10 karakter.
         status === 'ditolak' ? 'Pengendalian jatuh belum memadai.' : null])
      return rows[0].id as string
    }

    const disetujui = await buat(`${TANDA}-OK`, 'disetujui')
    const diajukan = await buat(`${TANDA}-AJU`, 'diajukan')
    const ditolak = await buat(`${TANDA}-TLK`, 'ditolak')

    await panggil('izin-kedaluwarsa')

    expect(await ditegur('izin_kerja_kedaluwarsa', disetujui),
      'izin kerja DISETUJUI yang sudah habis tak ditegur — orang bisa masih '
      + 'bekerja di bawahnya')
      .toBe(true)
    for (const [nama, id] of [['diajukan', diajukan], ['ditolak', ditolak]] as const) {
      expect(await ditegur('izin_kerja_kedaluwarsa', id),
        `izin kerja ${nama} ikut ditegur — ia tak pernah memberi hak masuk `
        + 'kepada siapa pun')
        .toBe(false)
    }
  }, 120_000)
})
