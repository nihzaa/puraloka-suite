/**
 * G1 — Klaim perjalanan, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   • total induk BENAR-BENAR diturunkan trigger dari rinciannya
 *   • rincian TERKUNCI sesudah klaim diputuskan — dan totalnya tak ikut naik
 *   • SoD ditegakkan BASIS, bukan hanya aplikasi
 *   • akun kas & pegawai tenant lain ditolak
 *   • `kasbons.settled_at` terisi sendiri saat status berpindah, dan
 *     DIKOSONGKAN saat mundur
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import klaimRoutes from '../klaim-perjalanan.js'

let app: FastifyInstance
let db: Client
let companyId: string
let userId: string
let pegawaiSaya: string | null = null
let pegawaiLain: string | null = null
let pegawaiAsing: string | null = null
let akunKas: string | null = null
let akunAsing: string | null = null
/** Fixture yang DIBUAT test ini — hanya itu yang boleh dihapusnya. */
let pegawaiAsingDibuat: string | null = null
let akunAsingDibuat: string | null = null
let pegawaiSayaDibuat: string | null = null

const TANDA = '[TEST-G1]'

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const isiSah = (o: Record<string, unknown> = {}) => ({
  tujuan: 'Jakarta',
  keperluan: `${TANDA} Rapat koordinasi dengan owner`,
  tanggal_berangkat: '2026-08-01',
  tanggal_kembali: '2026-08-03',
  item: [
    { jenis: 'transport', uraian: 'Tiket kereta PP', tanggal: '2026-08-01', nominal: 50_000 },
    { jenis: 'konsumsi', uraian: 'Makan siang', tanggal: '2026-08-02', nominal: 30_000 },
  ],
  ...o,
})

async function bersihkan() {
  await db.query(`DELETE FROM klaim_perjalanan WHERE keperluan LIKE '${TANDA}%'`)
}

/** Fixture tenant lain — HANYA yang dibuat test ini, bukan data yang sudah ada. */
async function bersihkanFixture() {
  if (pegawaiAsingDibuat) {
    await db.query('DELETE FROM pegawai WHERE id = $1', [pegawaiAsingDibuat])
  }
  if (akunAsingDibuat) {
    await db.query('DELETE FROM cash_accounts WHERE id = $1', [akunAsingDibuat])
  }
  if (pegawaiSayaDibuat) {
    await db.query('DELETE FROM pegawai WHERE id = $1', [pegawaiSayaDibuat])
  }
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  userId = u[0].id
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1', [userId])
  companyId = co[0].company_id

  // Pegawai yang TERHUBUNG ke user yang login — dipilih menurut SYARAT, bukan
  // LIMIT 1 (pelajaran migrasi 328).
  const { rows: ps } = await db.query(
    'SELECT id FROM pegawai WHERE company_id = $1 AND user_id = $2 LIMIT 1',
    [companyId, userId])
  pegawaiSaya = ps.length ? ps[0].id : null

  // Pegawai LAIN di company yang sama — untuk menguji SoD lolos saat pengaju
  // bukan penyetuju.
  const { rows: pl } = await db.query(
    'SELECT id FROM pegawai WHERE company_id = $1 AND user_id <> $2 LIMIT 1',
    [companyId, userId])
  pegawaiLain = pl.length ? pl[0].id : null

  // Pegawai company LAIN. Id yang BENAR-BENAR ADA, bukan UUID acak: dengan
  // UUID acak `maybeSingle()` mengembalikan null dengan atau tanpa saringan,
  // jadi testnya tetap hijau saat saringannya dibuang (terbukti di E1).
  const { rows: pa } = await db.query(
    'SELECT id FROM pegawai WHERE company_id <> $1 LIMIT 1', [companyId])
  if (pa.length) {
    pegawaiAsing = pa[0].id
  } else {
    // Company lain ADA tapi belum punya pegawai (diukur 2026-08-12: 5 pegawai
    // di satu company, 0 di yang lain). Fixture-nya DIBUAT, bukan test-nya
    // dilewati — test yang di-skip karena data kebetulan tak ada adalah test
    // yang tak pernah menjaga apa pun.
    const { rows: coLain } = await db.query(
      'SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId])
    if (coLain.length) {
      const { rows: p } = await db.query(
        `INSERT INTO pegawai (user_id, company_id, nomor_induk, jabatan, jam_standar)
         VALUES ($1, $2, $3, 'uji tenant lain', 8) RETURNING id`,
        [userId, coLain[0].id, `${TANDA}-ASING`])
      pegawaiAsing = p[0].id
      pegawaiAsingDibuat = p[0].id
    }
  }

  const { rows: ka } = await db.query(
    'SELECT id FROM cash_accounts WHERE company_id = $1 LIMIT 1', [companyId])
  akunKas = ka.length ? ka[0].id : null

  const { rows: kaAsing } = await db.query(
    'SELECT id FROM cash_accounts WHERE company_id <> $1 LIMIT 1', [companyId])
  if (kaAsing.length) {
    akunAsing = kaAsing[0].id
  } else {
    const { rows: coLain } = await db.query(
      'SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId])
    if (coLain.length) {
      const { rows: ca } = await db.query(
        `INSERT INTO cash_accounts (company_id, name, type, balance, is_active, created_by)
         VALUES ($1, $2, 'main', 0, true, $3) RETURNING id`,
        [coLain[0].id, `${TANDA} Kas tenant lain`, userId])
      akunAsing = ca[0].id
      akunAsingDibuat = ca[0].id
    }
  }

  await bersihkan()

  app = Fastify({ logger: false })
  await app.register(klaimRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  await bersihkanFixture()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('validasi masukan', () => {
  it('menolak keperluan kosong', async () => {
    const r = await post('/api/v1/klaim-perjalanan', isiSah({ keperluan: '  ' }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak bisa dinilai/i)
  })

  it('menolak tanggal kembali yang mendahului berangkat', async () => {
    const r = await post('/api/v1/klaim-perjalanan', isiSah({
      tanggal_berangkat: '2026-08-05', tanggal_kembali: '2026-08-01',
    }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak pernah terjadi/i)
  })

  it('menolak rincian bertanggal DI LUAR rentang perjalanan', async () => {
    const r = await post('/api/v1/klaim-perjalanan', isiSah({
      item: [{ jenis: 'transport', uraian: 'x', tanggal: '2026-07-20', nominal: 10_000 }],
    }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/di luar rentang/i)
  })

  it('menolak klaim tanpa rincian', async () => {
    const r = await post('/api/v1/klaim-perjalanan', isiSah({ item: [] }))
    expect(r.statusCode).toBe(400)
  })

  it('menolak pegawai milik tenant LAIN', async () => {
    if (!pegawaiAsing) throw new Error('fixture pegawai asing tak terbentuk')
    const r = await post('/api/v1/klaim-perjalanan', isiSah({ pegawai_id: pegawaiAsing }))
    expect(r.statusCode, r.body).toBe(404)
    expect(r.json().error).toMatch(/pegawai tidak ditemukan/i)

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM klaim_perjalanan WHERE pegawai_id = $1`, [pegawaiAsing])
    expect(rows[0].n, 'klaim tercatat atas nama pegawai perusahaan lain').toBe(0)
  })
})

describe('total diturunkan dari rincian', () => {
  let idKlaim: string

  it('membuat klaim dengan nomor urut dan total terhitung', async () => {
    if (!pegawaiSaya && !pegawaiLain) throw new Error('tak ada pegawai untuk diuji')
    const r = await post('/api/v1/klaim-perjalanan',
      isiSah(pegawaiSaya ? {} : { pegawai_id: pegawaiLain }))
    expect(r.statusCode, r.body).toBe(201)
    const j = r.json()
    expect(j.klaim.nomor).toMatch(/^KLM-2026-\d{4}$/)
    expect(j.klaim.status).toBe('diajukan')
    expect(j.item_dibuat).toBe(2)
    idKlaim = j.klaim.id
  })

  it('total di BASIS sama dengan jumlah rinciannya — bukan angka yang dikirim', async () => {
    const { rows } = await db.query(
      `SELECT k.total_diajukan, (SELECT sum(nominal) FROM klaim_perjalanan_item WHERE klaim_id = k.id) jml
         FROM klaim_perjalanan k WHERE k.id = $1`, [idKlaim])
    expect(Number(rows[0].total_diajukan)).toBe(80_000)
    expect(Number(rows[0].total_diajukan)).toBe(Number(rows[0].jml))
  })

  it('menambah rincian MENAIKKAN total induk', async () => {
    await db.query(
      `INSERT INTO klaim_perjalanan_item (klaim_id, jenis, uraian, tanggal, nominal)
       VALUES ($1, 'tol_parkir', 'Tol', '2026-08-02', 20000)`, [idKlaim])
    const { rows } = await db.query(
      'SELECT total_diajukan FROM klaim_perjalanan WHERE id = $1', [idKlaim])
    expect(Number(rows[0].total_diajukan)).toBe(100_000)
  })

  it('menghapus rincian MENURUNKAN total induk', async () => {
    await db.query(
      `DELETE FROM klaim_perjalanan_item WHERE klaim_id = $1 AND jenis = 'tol_parkir'`, [idKlaim])
    const { rows } = await db.query(
      'SELECT total_diajukan FROM klaim_perjalanan WHERE id = $1', [idKlaim])
    expect(Number(rows[0].total_diajukan)).toBe(80_000)
  })
})

describe('memutuskan', () => {
  let idKlaim: string

  beforeAll(async () => {
    const { rows } = await db.query(
      `SELECT id FROM klaim_perjalanan WHERE keperluan LIKE $1 AND status = 'diajukan'
        ORDER BY dibuat_pada DESC LIMIT 1`, [`${TANDA}%`])
    idKlaim = rows[0].id
  })

  it('menolak WAJIB beralasan', async () => {
    const r = await patch(`/api/v1/klaim-perjalanan/${idKlaim}/putuskan`, { setujui: false })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/berhak tahu/i)
  })

  it('menyetujui MELEBIHI yang diajukan ditolak', async () => {
    const r = await patch(`/api/v1/klaim-perjalanan/${idKlaim}/putuskan`, {
      setujui: true, total_disetujui: 999_999,
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/tak boleh menambah/i)
  })

  it('SoD — pengaju tak bisa memutuskan klaimnya sendiri', async () => {
    // Hanya berlaku bila klaim ini memang milik pegawai yang login.
    const { rows } = await db.query(
      `SELECT p.user_id FROM klaim_perjalanan k JOIN pegawai p ON p.id = k.pegawai_id
        WHERE k.id = $1`, [idKlaim])
    if (rows[0].user_id !== userId) return

    const r = await patch(`/api/v1/klaim-perjalanan/${idKlaim}/putuskan`, {
      setujui: true, total_disetujui: 50_000,
    })
    expect(r.statusCode, r.body).toBe(403)
    expect(r.json().error).toMatch(/diputuskan orang lain/i)
  })

  it('SoD APLIKASI memberi pesan yang bisa ditindaklanjuti, bukan galat Postgres', async () => {
    // Basis juga menolaknya (test berikutnya), tapi galat Postgres tak bisa
    // dibaca pengguna. Yang membedakan kedua lapis adalah PESANNYA — dan
    // tanpa test ini, melucuti gerbang aplikasi tetap hijau karena trigger
    // menutupinya dengan 422 yang tak menolong siapa pun.
    //
    // Klaim khusus yang pengajunya BENAR-BENAR user yang login. Admin di dev
    // bukan pegawai terdaftar (diukur: 5 pegawai, nol di antaranya admin),
    // jadi klaim biasa di berkas ini diajukan atas nama orang lain dan SoD-nya
    // tak pernah terpicu. Versi pertama test ini `return` diam-diam karena itu
    // — dan mutasi membuktikannya lolos.
    const { rows: pegSaya } = await db.query(
      `INSERT INTO pegawai (user_id, company_id, nomor_induk, jabatan, jam_standar)
       VALUES ($1, $2, $3, 'uji SoD', 8)
       ON CONFLICT (user_id, company_id) DO UPDATE SET jabatan = 'uji SoD'
       RETURNING id, (xmax = 0) AS baru`,
      [userId, companyId, `${TANDA}-SOD`])
    const idPegSaya = pegSaya[0].id
    if (pegSaya[0].baru) pegawaiSayaDibuat = idPegSaya

    const buat = await post('/api/v1/klaim-perjalanan', isiSah({ pegawai_id: idPegSaya }))
    expect(buat.statusCode, buat.body).toBe(201)
    const idSendiri = buat.json().klaim.id

    const r = await patch(`/api/v1/klaim-perjalanan/${idSendiri}/putuskan`, {
      setujui: true, total_disetujui: 50_000,
    })
    expect(r.statusCode,
      'gerbang SoD aplikasi dilucuti — penolakannya jatuh ke trigger basis, ' +
      'dan pesannya jadi galat Postgres yang tak bisa ditindaklanjuti').toBe(403)
    expect(r.json().error).toMatch(/diputuskan orang lain/i)
    expect(r.json().error).not.toMatch(/EXCEPTION|violates|check_violation/i)

    // Dan klaimnya TETAP diajukan — penolakan sebelum menulis apa pun.
    const { rows } = await db.query(
      'SELECT status FROM klaim_perjalanan WHERE id = $1', [idSendiri])
    expect(rows[0].status).toBe('diajukan')
  })

  it('SoD ditegakkan BASIS juga, bukan hanya aplikasi', async () => {
    // Importer dan psql menulis ke sini tanpa lewat rute — jaminan aplikasi
    // saja tak cukup. Diuji dengan SQL langsung.
    const { rows } = await db.query(
      `SELECT p.user_id FROM klaim_perjalanan k JOIN pegawai p ON p.id = k.pegawai_id
        WHERE k.id = $1`, [idKlaim])
    if (!rows[0].user_id) return

    await expect(
      db.query(
        `UPDATE klaim_perjalanan
            SET status = 'disetujui', disetujui_oleh = $2, disetujui_pada = now(),
                total_disetujui = 50000
          WHERE id = $1`, [idKlaim, rows[0].user_id]),
    ).rejects.toThrow(/sendiri/i)
  })

  it('rincian TERKUNCI sesudah klaim disetujui — dan totalnya tak ikut naik', async () => {
    // Disetujui lewat SQL oleh orang LAIN supaya SoD terlewati secara sah.
    const { rows: lain } = await db.query(
      `SELECT u.id FROM users u
        WHERE u.id <> (SELECT p.user_id FROM klaim_perjalanan k
                         JOIN pegawai p ON p.id = k.pegawai_id WHERE k.id = $1)
        LIMIT 1`, [idKlaim])
    await db.query(
      `UPDATE klaim_perjalanan
          SET status = 'disetujui', disetujui_oleh = $2, disetujui_pada = now(),
              total_disetujui = 60000
        WHERE id = $1`, [idKlaim, lain[0].id])

    const { rows: sebelum } = await db.query(
      'SELECT total_diajukan FROM klaim_perjalanan WHERE id = $1', [idKlaim])

    await expect(
      db.query(
        `INSERT INTO klaim_perjalanan_item (klaim_id, jenis, uraian, tanggal, nominal)
         VALUES ($1, 'lain', 'sisipan setelah setuju', '2026-08-02', 500000)`, [idKlaim]),
    ).rejects.toThrow(/tak bisa diubah/i)

    const { rows: sesudah } = await db.query(
      'SELECT total_diajukan FROM klaim_perjalanan WHERE id = $1', [idKlaim])
    expect(Number(sesudah[0].total_diajukan),
      'total naik sesudah klaim disetujui — nominal berubah di belakang penyetuju')
      .toBe(Number(sebelum[0].total_diajukan))
  })
})

describe('rantai persetujuan (migrasi 339)', () => {
  it('rantai klaim ADA dan berlangkah — tanpa itu approval mati total', async () => {
    const { rows } = await db.query(
      `SELECT ch.id, count(st.id)::int langkah
         FROM approval_chains ch
         LEFT JOIN approval_steps st ON st.chain_id = ch.id
        WHERE ch.entity_type = 'klaim_perjalanan' AND ch.company_id = $1
        GROUP BY ch.id`, [companyId])
    expect(rows.length,
      'nol rantai klaim — `loadSteps` fail-closed, jadi NOL orang bisa menyetujui')
      .toBeGreaterThan(0)
    expect(rows[0].langkah,
      'rantai tanpa langkah: halaman pengaturan terlihat wajar, tapi modulnya lumpuh senyap')
      .toBeGreaterThan(0)
  })

  it('izin langkahnya NYATA — permission hantu = fail-closed juga', async () => {
    const { rows } = await db.query(
      `SELECT st.required_permission
         FROM approval_steps st JOIN approval_chains ch ON ch.id = st.chain_id
        WHERE ch.entity_type = 'klaim_perjalanan'
          AND NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = st.required_permission)`)
    expect(rows.length,
      'langkah menunjuk izin yang tak ada — tak seorang pun bisa memilikinya').toBe(0)
  })
})

describe('membayar', () => {
  let idSetuju: string

  beforeAll(async () => {
    const { rows } = await db.query(
      `SELECT id FROM klaim_perjalanan WHERE keperluan LIKE $1 AND status = 'disetujui' LIMIT 1`,
      [`${TANDA}%`])
    idSetuju = rows[0].id
  })

  it('menolak pembayaran tanpa akun kas', async () => {
    const r = await patch(`/api/v1/klaim-perjalanan/${idSetuju}/bayar`, {})
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/direkonsiliasi/i)
  })

  it('menolak akun kas milik tenant LAIN', async () => {
    if (!akunAsing) throw new Error('fixture akun kas asing tak terbentuk')
    const r = await patch(`/api/v1/klaim-perjalanan/${idSetuju}/bayar`, {
      cash_account_id: akunAsing,
    })
    expect(r.statusCode, r.body).toBe(404)

    const { rows } = await db.query(
      'SELECT status FROM klaim_perjalanan WHERE id = $1', [idSetuju])
    expect(rows[0].status, 'klaim tetap terbayar meski akun kasnya ditolak').toBe('disetujui')
  })

  it('membayar dengan akun kas sendiri berhasil, dan tanggalnya tercatat', async () => {
    if (!akunKas) throw new Error('fixture akun kas tak terbentuk')
    const r = await patch(`/api/v1/klaim-perjalanan/${idSetuju}/bayar`, {
      cash_account_id: akunKas,
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().klaim.status).toBe('dibayar')
    expect(r.json().klaim.dibayar_pada).toBeTruthy()
  })

  // Catatan jujur tentang `.eq('status', 'disetujui')` pada UPDATE bayar:
  //
  // Ia lapis KEDUA, dan TIDAK berhasil saya buat merah lewat mutasi.
  // `periksaTransisiKlaim` sudah menolak dari hasil BACA, jadi WHERE-nya hanya
  // tercapai bila status berubah persis di antara baca dan tulis — balapan
  // yang tak bisa disusun dari test yang memanggil rute lewat `inject` tanpa
  // menyuntik jeda ke kode produksi.
  //
  // Dibiarkan ada dan dicatat sebagai TAK TERBUKTI, bukan dihapus: lapis kedua
  // yang tak diuji tetap menutup balapan nyata, sementara menghapusnya membuka
  // kembali. Kesimpulan yang sama dengan D3 dan E2.
  it('membayar KEDUA kali ditolak — uangnya sudah keluar', async () => {
    const r = await patch(`/api/v1/klaim-perjalanan/${idSetuju}/bayar`, {
      cash_account_id: akunKas,
    })
    expect(r.statusCode).toBe(409)
  })
})

describe('ringkasan', () => {
  it('memisahkan utang (disetujui) dari yang sudah dibayar', async () => {
    const r = await get('/api/v1/klaim-perjalanan')
    expect(r.statusCode, r.body).toBe(200)
    const ring = r.json().ringkasan
    expect(ring).toHaveProperty('menunggu')
    expect(ring).toHaveProperty('utang')
    expect(ring).toHaveProperty('dibayar')
    // Klaim yang barusan dibayar masuk `dibayar`, bukan `utang`.
    expect(ring.dibayar).toBeGreaterThan(0)
  })
})

describe('kasbons.settled_at — kolom yang dibaca laporan tapi tak pernah ditulis', () => {
  it('SELURUH kasbon settled kini punya settled_at', async () => {
    // Diukur sebelum migrasi 337: 7 kasbon `settled` senilai Rp 54.000.000,
    // dan 0 dari 56 punya `settled_at`. `finance.ts` menyaring
    // `.gte('settled_at', dari)` — nol baris memenuhinya, jadi "kasbon lunas
    // periode ini" SELALU Rp 0.
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM kasbons WHERE status = 'settled' AND settled_at IS NULL`)
    expect(rows[0].n,
      'kasbon lunas tanpa tanggal — laporan arus kas menghitungnya Rp 0').toBe(0)
  })

  it('tambalannya JUJUR — pelunasan lama tak dipindah ke hari ini', async () => {
    // `now()` akan memindahkan pelunasan lama ke periode BERJALAN, dan
    // laporan arus kas bulan ini melonjak karena migrasi.
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM kasbons
        WHERE status = 'settled' AND settled_at::date = CURRENT_DATE
          AND COALESCE(approved_at, created_at)::date <> CURRENT_DATE`)
    expect(rows[0].n,
      'pelunasan lama bertanggal hari ini — arus kas periode berjalan melonjak palsu').toBe(0)
  })

  it('trigger MENGISI settled_at saat status berpindah ke settled', async () => {
    const { rows: k } = await db.query(
      `SELECT id, status FROM kasbons WHERE status = 'approved' LIMIT 1`)
    if (!k.length) return
    const id = k[0].id

    await db.query(`UPDATE kasbons SET status = 'settled' WHERE id = $1`, [id])
    const { rows: sesudah } = await db.query(
      'SELECT settled_at FROM kasbons WHERE id = $1', [id])
    expect(sesudah[0].settled_at,
      'status settled tanpa tanggal — tak terhitung di laporan mana pun').toBeTruthy()

    // Dan MENGOSONGKANNYA saat mundur: `settled_at` yang tertinggal pada
    // kasbon yang dibuka kembali membuatnya terhitung lunas dua kali.
    await db.query(`UPDATE kasbons SET status = 'approved' WHERE id = $1`, [id])
    const { rows: mundur } = await db.query(
      'SELECT settled_at FROM kasbons WHERE id = $1', [id])
    expect(mundur[0].settled_at,
      'settled_at tertinggal sesudah kasbon dibuka kembali — terhitung lunas dua kali')
      .toBeNull()
  })
})
