/**
 * AUTOMATION 3.18 — dan klaim yang membuatnya boleh ada sama sekali.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG SEBENARNYA DIUJI DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 3.18 ditunda pada 2026-08-15 dengan alasan yang tercatat: EVM tak disimpan,
 * dan merakit ulang BAC/AC/EV/PV di dalam otomasi butuh ~25 baris salinan dari
 * `kurva-s.ts`. Dua sumber untuk satu angka adalah cara paling sunyi membuat
 * laporan dan notifikasi berselisih.
 *
 * Jalan keluarnya: otomasi MEMANGGIL rute kurva-S lewat `server.inject`.
 *
 * Klaimnya jadi satu kalimat yang bisa salah: **SPI yang dikirim notifikasi
 * adalah SPI yang sama persis dengan yang dilihat orang di layar Kurva-S.**
 *
 * Kalau klaim itu salah, seluruh alasan membangunnya begini runtuh — dan
 * runtuhnya tak akan terbaca dari kode, hanya dari dua angka berbeda di dua
 * layar yang tak pernah dibuka bersamaan.
 *
 * ── Kenapa kedua rute didaftarkan di harness ini
 *
 * `otomasi-terjadwal.test.ts` hanya mendaftarkan rute otomasi. Untuk rute lain
 * itu tak berpengaruh; untuk yang INI berpengaruh besar — `inject` ke kurva-S
 * akan 404, tiap proyek jatuh ke `evm_tak_terhitung`, dan testnya HIJAU tanpa
 * pernah menyentuh satu pun perhitungan EVM.
 *
 * Hijau yang tak menguji apa pun lebih berbahaya daripada merah.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import kurvaSRoutes from '../kurva-s.js'
import { AMBANG_OTOMASI } from '../../../lib/ambang-otomasi.js'

let app: FastifyInstance
let db: Client
let companyId: string

const panggilOtomasi = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/evm-kinerja${q}`,
    headers: { authorization: 'Bearer t' },
  })

const panggilKurvaS = (projectId: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/projects/${projectId}/kurva-s`,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows: c } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`,
  )
  companyId = c[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  // WAJIB — lihat komentar kepala berkas. Tanpa ini test hijau tanpa menguji.
  await app.register(kurvaSRoutes)
  await app.ready()
}, 60_000)

afterAll(async () => {
  await db.query(
    `DELETE FROM notifications WHERE type = 'evm_kinerja_menurun' AND company_id = $1`,
    [companyId],
  )
  await app.close()
  await db.end()
})

describe('3.18 — satu sumber untuk SPI/CPI', () => {
  it('angka di notifikasi SAMA PERSIS dengan angka dari rute Kurva-S', async () => {
    /*
      Inti seluruh berkas ini.

      Ambang dipaku ke 1.0 lewat query supaya SETIAP proyek yang punya EVM
      memicu notifikasi — kalau memakai ambang bawaan (0.9), proyek dummy yang
      kebetulan sehat tak menghasilkan satu pun baris untuk dibandingkan, dan
      testnya lulus tanpa membandingkan apa pun.
    */
    await db.query(
      `DELETE FROM notifications WHERE type = 'evm_kinerja_menurun' AND company_id = $1`,
      [companyId],
    )

    const r = await panggilOtomasi('?spi=1&cpi=1')
    expect(r.statusCode, r.body).toBe(200)

    const badan = r.json() as {
      checked: { proyek_aktif: number; evm_terhitung: number; evm_tak_terhitung: number }
    }

    /*
      Prasyarat yang DIPERIKSA, bukan diandaikan.

      Kalau nol proyek punya EVM terhitung, perbandingan di bawah tak menguji
      apa-apa — dan tanpa assertion ini, testnya tetap hijau. Persis kegagalan
      yang komentar kepala berkas peringatkan, dalam bentuk lain.
    */
    expect(
      badan.checked.evm_terhitung,
      `nol proyek ber-EVM (aktif ${badan.checked.proyek_aktif}, `
        + `tak terhitung ${badan.checked.evm_tak_terhitung}) — `
        + 'perbandingan tak menguji apa pun',
    ).toBeGreaterThan(0)

    const { rows: notif } = await db.query(
      `SELECT project_id, action_data FROM notifications
        WHERE type = 'evm_kinerja_menurun' AND company_id = $1`,
      [companyId],
    )
    expect(notif.length).toBeGreaterThan(0)

    /*
      Tiap proyek yang ditegur diperiksa ULANG lewat rute kurva-S, dan angkanya
      harus identik sampai digit terakhir.

      Bukan `toBeCloseTo`. Kalau keduanya sungguh lahir dari perhitungan yang
      sama, tak ada ruang untuk selisih pembulatan sama sekali — dan toleransi
      yang dilonggarkan "sedikit" adalah persis cara dua sumber yang menyimpang
      lolos tanpa ketahuan.
    */
    const sudahDicek = new Set<string>()
    for (const n of notif) {
      const pid = n.project_id as string
      if (sudahDicek.has(pid)) continue
      sudahDicek.add(pid)

      const k = await panggilKurvaS(pid)
      expect(k.statusCode, `kurva-s ${pid}: ${k.body}`).toBe(200)

      const meta = (k.json() as { meta: { evm: Record<string, number>; cakupanJadwalPct: number } }).meta
      const ad = n.action_data as { spi: number; cpi: number; cakupan_jadwal_pct: number }

      expect(ad.spi, `SPI notifikasi != SPI kurva-s untuk ${pid}`).toBe(meta.evm.spi)
      expect(ad.cpi, `CPI notifikasi != CPI kurva-s untuk ${pid}`).toBe(meta.evm.cpi)
      expect(ad.cakupan_jadwal_pct).toBe(meta.cakupanJadwalPct)
    }

    expect(sudahDicek.size).toBeGreaterThan(0)
  }, 120_000)

  it('proyek TANPA anggaran dilewati, bukan ditegur', async () => {
    /*
      BAC nol menghasilkan SPI/CPI nol. Itu ketiadaan data, bukan kinerja
      buruk — dan menegur orang untuk proyek yang belum dianggarkan membuat
      mereka berhenti mempercayai seluruh pesannya.

      Diperiksa lewat angka yang dilaporkan rute, bukan lewat menyiapkan
      proyek tanpa anggaran: basis ini sudah punya proyek semacam itu, dan
      membuat satu lagi berarti menguji fixture sendiri.
    */
    const r = await panggilOtomasi('?spi=1&cpi=1')
    expect(r.statusCode).toBe(200)

    const c = (r.json() as {
      checked: {
        proyek_aktif: number; evm_terhitung: number
        evm_tak_terhitung: number; sudah_dikirim_hari_ini: number
      }
    }).checked

    /*
      Tiap proyek aktif berakhir di SATU dari TIGA ember. Kalau jumlahnya tak
      cocok, ada proyek yang hilang tanpa jejak di antaranya.

      Ember ketiga (`sudah_dikirim_hari_ini`) lahir dari test ini: bentuk
      pertamanya menjumlahkan dua ember dan merah, karena proyek yang sudah
      dikirimi hari ini keluar dari perulangan sebelum masuk keduanya. Yang
      salah rutenya, bukan testnya — tanpa angka itu, "0 notifikasi" tak bisa
      dibedakan dari "0 proyek bermasalah".
    */
    expect(
      c.evm_terhitung + c.evm_tak_terhitung + c.sudah_dikirim_hari_ini,
      'ada proyek aktif yang tak masuk ember mana pun',
    ).toBe(c.proyek_aktif)
  }, 120_000)

  it('dedup harian menahan — panggilan kedua tak menambah notifikasi', async () => {
    /*
      Dedup di repo ini pernah mati diam-diam sekali (pemisah `NUL` di
      2.10). Kegagalannya sunyi: pesan kembar tiap hari, dan yang menerimanya
      menyimpulkan sistemnya rusak lalu berhenti membacanya.
    */
    await db.query(
      `DELETE FROM notifications WHERE type = 'evm_kinerja_menurun' AND company_id = $1`,
      [companyId],
    )

    await panggilOtomasi('?spi=1&cpi=1')
    const { rows: a } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type = 'evm_kinerja_menurun' AND company_id = $1`,
      [companyId],
    )

    await panggilOtomasi('?spi=1&cpi=1')
    const { rows: b } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE type = 'evm_kinerja_menurun' AND company_id = $1`,
      [companyId],
    )

    expect(a[0].n).toBeGreaterThan(0)
    expect(b[0].n, 'panggilan kedua menambah notifikasi — dedup harian tak menahan')
      .toBe(a[0].n)
  }, 120_000)

  it('ambang DESIMAL bertahan — tidak dibulatkan jadi 1', async () => {
    /*
      Kedua ambang EVM satu-satunya yang desimal di `AMBANG_OTOMASI`.

      `ambilAmbang` tak membulatkan hari ini (diperiksa saat menulisnya), tapi
      itu perilaku yang mudah dirusak: satu `Math.round` yang ditambahkan
      "supaya rapi" membuat 0.9 jadi 1, dan ambang 1.0 berarti hampir setiap
      proyek memicu pesan setiap hari. Notifikasi yang selalu menyala berhenti
      dibaca — kerusakan yang tak memunculkan satu pun galat.

      Diperiksa lewat nilai yang DIKEMBALIKAN rute, bukan lewat konstanta:
      konstanta membuktikan bawaannya benar, respons membuktikan ia sampai ke
      pemakainya utuh.
    */
    expect(AMBANG_OTOMASI['otomasi.evm_spi.minimum'].bawaan).toBe(0.9)

    const r = await panggilOtomasi('?spi=0.75&cpi=0.85')
    expect(r.statusCode).toBe(200)

    const c = (r.json() as { checked: { ambang_spi: number; ambang_cpi: number } }).checked
    expect(c.ambang_spi, 'ambang SPI dibulatkan').toBe(0.75)
    expect(c.ambang_cpi, 'ambang CPI dibulatkan').toBe(0.85)
  }, 120_000)
})
