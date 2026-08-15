/**
 * AUTOMATION 2.3 (retensi tertahan) + 5.12′ (aksi berisiko harian).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA KLAIM YANG DIUJI, DAN KEDUANYA BISA SALAH DIAM-DIAM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **2.3 — pesannya menyebut DUA angka.** Retensi kontraktual
 * (`projects.retention_amount`, terukur Rp 302,9 jt) dan retensi terealisasi
 * (`invoices.retensi_amount`, terukur NOL di 26 dari 26 invoice).
 *
 * Layar Register Retensi di `/piutang` membaca yang kedua, jadi ia
 * menampilkan nol. Kalau otomasi mengirim "Rp 101 juta tertahan" lalu orang
 * menekan tautannya dan melihat NOL, ia menyimpulkan salah satunya rusak —
 * dan berhenti mempercayai keduanya.
 *
 * **5.12′ — nol temuan TIDAK mengirim apa pun.** Ringkasan harian yang selalu
 * datang meski kosong berhenti dibaca dalam seminggu, dan pada hari ia sungguh
 * berisi, tak ada yang membukanya.
 *
 * ── Cacat yang sudah tertangkap SEBELUM test ini ada
 *
 * `audit_logs` kategori **D**, bukan B. `.from()` menolaknya, dan
 * pembungkusnya menyebut jalannya sendiri di pesan galat. Nama tabel hanyalah
 * string — typecheck tak bisa menangkapnya; hanya menjalankan sungguhan yang
 * bisa.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

let app: FastifyInstance
let db: Client
let companyId: string

const panggil = (kunci: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${kunci}${q}`,
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  await db.query(
    `DELETE FROM notifications
      WHERE type IN ('retensi_tertahan', 'audit_aksi_berisiko') AND company_id = $1`,
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

  const { rows } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = rows[0].id

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

describe('2.3 — retensi tertahan', () => {
  it('menyebut retensi KONTRAKTUAL dan yang benar-benar tercatat di invoice', async () => {
    /*
      Inti otomasi ini.

      Kalau pesannya hanya menyebut satu angka, penerimanya akan
      membandingkannya dengan layar `/piutang` yang membaca angka LAIN — dan
      selisihnya terbaca sebagai kerusakan, bukan sebagai informasi.
    */
    await bersihkan()

    const r = await panggil('retensi-tertahan')
    expect(r.statusCode, r.body).toBe(200)

    const c = (r.json() as {
      checked: { proyek_beretensi: number; lewat_waktu: number; tanpa_realisasi_invoice: number }
    }).checked

    expect(c.proyek_beretensi,
      'basis tak punya proyek beretensi — test ini tak menguji apa pun')
      .toBeGreaterThan(0)
    expect(c.lewat_waktu, 'nol proyek lewat waktu').toBeGreaterThan(0)

    const { rows } = await db.query(
      `SELECT message, action_data FROM notifications
        WHERE type = 'retensi_tertahan' AND company_id = $1 LIMIT 1`,
      [companyId])
    expect(rows.length, 'nol notifikasi padahal ada proyek lewat waktu').toBeGreaterThan(0)

    const ad = rows[0].action_data as {
      retensi_kontraktual?: number; retensi_tercatat?: number
    }
    expect(ad.retensi_kontraktual, 'retensi kontraktual tak terbawa').toBeGreaterThan(0)
    expect(ad.retensi_tercatat,
      'retensi tercatat tak terbawa — pembaca tak bisa membandingkannya dengan layar')
      .toBeDefined()

    /*
      Terukur: SELURUH invoice ber-`retensi_amount` nol. Jadi pesannya WAJIB
      menyatakan bahwa angkanya masih kontraktual — kalau tidak, ia mengklaim
      uang yang sebenarnya belum pernah ditahan.
    */
    if (Number(ad.retensi_tercatat) === 0) {
      expect(rows[0].message as string,
        'pesan tak menyatakan angkanya masih kontraktual')
        .toMatch(/masih kontraktual|belum ada satu pun invoice/i)
    }
  }, 120_000)

  it('proyek yang SUDAH punya berita acara serah terima dilewati', async () => {
    /*
      Berita acara membuka pencairan retensi. Yang sudah punya sedang dalam
      proses, dan menegurnya adalah menegur pekerjaan yang sudah berjalan.

      `serah_terima` nol baris hari ini, jadi saringannya belum terbukti dari
      data — tetapi ia tetap dipasang supaya otomasi berhenti menegur begitu
      orang mulai mengisinya, bukan menunggu seseorang ingat memperbaiki kode.

      Yang diuji di sini: saringannya BENAR-BENAR ada di jalur eksekusi, bukan
      hanya di komentar. Dibuktikan dengan menyisipkan satu berita acara lalu
      memastikan proyeknya hilang dari hasil.
    */
    await bersihkan()

    const { rows: sebelum } = await db.query(
      `SELECT (action_data->>'record_id') AS pid FROM notifications
        WHERE type = 'retensi_tertahan' AND company_id = $1`, [companyId])
    await panggil('retensi-tertahan')

    const { rows: kena } = await db.query(
      `SELECT DISTINCT (action_data->>'record_id') AS pid FROM notifications
        WHERE type = 'retensi_tertahan' AND company_id = $1`, [companyId])
    expect(kena.length, 'nol proyek tertegur').toBeGreaterThan(0)
    expect(sebelum.length).toBe(0)

    const pid = kena[0].pid as string

    /*
      Kolom wajib DIUKUR ke `information_schema`, bukan ditebak:

          company_id · project_id · jenis · nomor · tanggal · lingkup_serah

      Bentuk pertama test ini menebak enam kolom yang SALAH (melewatkan `nomor`
      dan `lingkup_serah`), lalu mengambil jalan pintas "lewati kalau bentuknya
      di luar dugaan" — dan jalan pintas itu membuat saringan BAST TAK PERNAH
      DIUJI SAMA SEKALI.

      Mutasi membuktikannya: membuang `if (punyaBast.has(pid)) continue` dari
      rute tetap hijau. Kesembilan kalinya sesi ini bentuk ditebak, dan kali
      ini yang rusak bukan kodenya melainkan pertahanannya.
    */
    /*
      Kolom pembuatnya `diterbitkan_oleh`, BUKAN `created_by` — tabel ini tak
      punya kolom bernama itu sama sekali.

      Kekeliruan kesepuluh sesi ini, dan penyebabnya sama tiap kali: saya
      mengukur SEBAGIAN (hanya kolom NOT NULL) lalu menebak sisanya. Mengukur
      seluruh kolom lebih murah daripada satu putaran gagal.
    */
    const { rows: u } = await db.query(
      `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 1`, [companyId])
    const nomorUji = `UJI-BAST-${Date.now()}`

    await db.query(
      `INSERT INTO serah_terima
         (company_id, project_id, jenis, nomor, tanggal, lingkup_serah, diterbitkan_oleh)
       VALUES ($1, $2, 'pho', $3, current_date, 'Seluruh lingkup (uji)', $4)`,
      [companyId, pid, nomorUji, u[0].user_id])

    try {
      await bersihkan()
      await panggil('retensi-tertahan')
      const { rows: sesudah } = await db.query(
        `SELECT 1 FROM notifications
          WHERE type = 'retensi_tertahan' AND company_id = $1
            AND action_data->>'record_id' = $2`, [companyId, pid])
      expect(sesudah.length,
        'proyek yang sudah punya berita acara MASIH ditegur — saringan BAST tak bekerja')
        .toBe(0)
    } finally {
      await db.query(`DELETE FROM serah_terima WHERE nomor = $1`, [nomorUji])
    }
  }, 180_000)
})

describe("5.12′ — ringkasan aksi berisiko", () => {
  it('membaca audit_logs kategori D dengan saringan company_id eksplisit', async () => {
    /*
      `audit_logs` kategori D — `.from()` MENOLAKNYA, dan bentuk pertama rute
      ini memakainya. Rute balas 500, penjadwal mencatat gagal.

      Nama tabel hanyalah string, jadi typecheck tak bisa menangkapnya. Yang
      menangkapnya pembungkus tenancy saat dijalankan sungguhan.
    */
    await bersihkan()

    const r = await panggil('audit-aksi-berisiko')
    expect(r.statusCode, r.body).toBe(200)

    const c = (r.json() as {
      checked: { event_24jam: number; kritis: number; ledakan: number; klaster_hapus: number }
    }).checked

    expect(c.event_24jam,
      'nol kejadian 24 jam — jejak audit mati, atau saringan company_id salah')
      .toBeGreaterThan(0)

    /*
      Dibandingkan dengan basis: kalau angkanya berbeda, entah pembacaannya
      terpotong di 1.000 (batas senyap PostgREST) entah saringan tenantnya
      bocor ke perusahaan lain.
    */
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM audit_logs
        WHERE company_id = $1 AND created_at >= now() - interval '24 hours'`,
      [companyId])

    // Selisih kecil wajar — beberapa detik berlalu antara dua pembacaan, dan
    // jejak audit terus bertambah. Yang tak wajar: terpotong tepat di 1.000.
    expect(c.event_24jam, 'pembacaan terpotong tepat di 1.000 — paging tak bekerja')
      .not.toBe(1000)
    expect(Math.abs(c.event_24jam - rows[0].n),
      `selisih terlalu jauh (${c.event_24jam} vs ${rows[0].n}) — saringan tenant bocor`)
      .toBeLessThan(200)
  }, 120_000)

  /*
    ⚠ CABANG "NOL TEMUAN" TIDAK TERUJI, dan itu dinyatakan bukan disembunyikan.

    Rute ini sengaja TIDAK mengirim apa pun bila tak ada satu pun temuan.
    Cabang itu tak bisa dijalankan dari basis ini: aksi keamanan
    (`role.permissions`, `credential.set`, …) dihitung TANPA ambang, dan
    keempatnya ada di jejak hari ini — jadi `temuan` tak pernah kosong.

    Menghapus jejaknya juga mustahil: `audit_logs` append-only, ditegakkan
    trigger `trg_audit_logs_no_delete`.

    Mutasi membuktikan celah ini nyata — mengubah `if (temuan.length === 0)`
    jadi `if (false)` tetap hijau. Dicatat di sini alih-alih dibuat test palsu
    yang seolah menguji: test yang berpura-pura lebih berbahaya daripada
    ketiadaan test, karena ia membuat orang berhenti mencari.

    Cara mengujinya kelak: tenant baru tanpa jejak audit sama sekali.
  */
  it('SATU ringkasan per hari, dan dedup menahannya', async () => {
    /*
      `record_id` sengaja tanggalnya, bukan id temuan — ringkasan ini satu per
      hari per tenant. Kalau ia dibuat per temuan, satu hari sibuk menghasilkan
      belasan pesan tentang hal yang sama.
    */
    await bersihkan()

    await panggil('audit-aksi-berisiko')
    const hitung = async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int n, count(DISTINCT action_data->>'record_id')::int rec
           FROM notifications
          WHERE type = 'audit_aksi_berisiko' AND company_id = $1`, [companyId])
      return rows[0]
    }

    const a = await hitung()
    expect(a.n, 'nol ringkasan — padahal jejak audit berisi').toBeGreaterThan(0)
    expect(a.rec, 'lebih dari satu record_id — ringkasan harusnya satu per hari').toBe(1)

    await panggil('audit-aksi-berisiko')
    const b = await hitung()
    expect(b.n, 'panggilan kedua menambah ringkasan — dedup tak menahan').toBe(a.n)
  }, 120_000)

  it('ambang dari query BENAR-BENAR dipakai menyaring', async () => {
    /*
      Kalau ambangnya hanya dilaporkan tetapi tak dipakai, hasilnya tetap masuk
      akal dan pengaturan tenant tak berpengaruh sama sekali — cacat yang sudah
      terjadi sekali di 5.7 dan ditangkap test seperti ini.

      Nilai yang dipakai harus BERADA DI DALAM rentang sah `AMBANG_OTOMASI`
      (min 20, max 5000) — `ambilAmbang` menjepit di luar itu.

      Bentuk pertama test ini memakai `perjam=1` dan merah dengan "expected 20
      to be 1". Yang salah TESTNYA: penjepitnya justru bekerja seperti
      seharusnya, dan menuntutnya menerima 1 berarti menuntut ambang yang tak
      masuk akal bisa disetel lewat query.
    */
    const rendah = await panggil('audit-aksi-berisiko', '?perjam=20&klaster=3')
    const tinggi = await panggil('audit-aksi-berisiko', '?perjam=5000&klaster=500')

    const cr = (rendah.json() as { checked: { ledakan: number; ambang_per_jam: number } }).checked
    const ct = (tinggi.json() as { checked: { ledakan: number; ambang_per_jam: number } }).checked

    expect(cr.ambang_per_jam, 'ambang dari query tak sampai ke respons').toBe(20)
    expect(ct.ambang_per_jam).toBe(5000)
    expect(cr.ledakan,
      'ambang rendah tak menemukan lebih banyak — nilainya tak dipakai menyaring')
      .toBeGreaterThan(ct.ledakan)
  }, 120_000)
})
