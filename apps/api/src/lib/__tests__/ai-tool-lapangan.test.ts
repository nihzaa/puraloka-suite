/**
 * Tiga tool baca lapangan — katalog 1.7, 1.8, 6.7, dan 6.11.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TOOL, BUKAN OTOMASI TERJADWAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Otomasi terjadwal mengirim tanpa diminta; tool menjawab saat ditanya.
 * "Kasbon Budi sudah berapa" bukan hal yang perlu diberitahukan tiap pagi —
 * ia perlu diketahui pada saat orang bertanya, biasanya tepat sebelum
 * menyetujui kasbon berikutnya.
 *
 * Otomasi 2.10 sudah menegur kasbon yang MENGGANTUNG. Ini melengkapinya dari
 * sisi lain, dan keduanya memakai definisi "belum lunas" yang sama:
 * `status = 'approved'` dan `settled_at IS NULL`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "toolnya jalan" — itu terlalu murah. Yang diuji tiga hal yang punya
 * cara gagal sunyi:
 *
 *   1. I-1 tetap utuh: ketiganya BACA, nol baris tercipta saat dipanggil.
 *   2. `entitas` berisi NAMA yang benar-benar dibaca. Ia dipakai I-4 untuk
 *      menandai jawaban yang menyebut sesuatu di luar itu; kalau ia kosong
 *      atau berisi uuid, pertahanan itu diam-diam mati.
 *   3. Angkanya BENAR — dijumlahkan ulang dari basis, bukan sekadar
 *      "ada angkanya".
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { KATALOG_TOOL } from '../ai-tool.js'
import { createTenantDb } from '../../utils/tenant-db.js'

let db: Client
let companyId: string

function konteks() {
  return {
    db: createTenantDb(companyId),
    companyId,
    userId: '',
    izin: new Set(['mandor:kasbon:approve', 'mandor:view', 'cash:view']),
  }
}

const tool = (nama: string) => {
  const t = KATALOG_TOOL.find((x) => x.nama === nama)
  if (!t) throw new Error(`tool '${nama}' tak terdaftar di KATALOG_TOOL`)
  return t
}

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = rows[0].id
}, 60_000)

afterAll(async () => { await db.end() })

describe('status_kasbon (1.8)', () => {
  it('menjumlahkan yang BELUM LUNAS dengan definisi yang sama dengan otomasi 2.10', async () => {
    /*
      Definisi "belum lunas" harus satu: `approved` DAN `settled_at IS NULL`.

      Kalau tool ini memakai definisi lain — misalnya semua yang bukan
      `settled` — angkanya akan berbeda dari yang ditegur otomasi 2.10, dan
      yang bertanya sesudah menerima notifikasi menemukan dua angka yang
      berselisih tanpa tahu mana yang benar.
    */
    const r = await tool('status_kasbon').jalan(konteks() as never, {})
    expect(r.isError, r.isi).toBe(false)

    const { rows } = await db.query(
      `SELECT coalesce(sum(amount), 0)::numeric AS total
         FROM kasbons
        WHERE company_id = $1 AND status = 'approved' AND settled_at IS NULL`,
      [companyId])
    const totalBasis = Number(rows[0].total)

    expect(totalBasis, 'basis tak punya kasbon belum lunas — test ini tak menguji apa pun')
      .toBeGreaterThan(0)

    /*
      Angka-angka di dalam teks dijumlahkan ulang lalu dibandingkan dengan
      basis. Rp ditulis berformat Indonesia (titik ribuan), jadi titiknya
      dilucuti sebelum diangkakan.

      Hanya baris "belum lunas" yang dijumlahkan — teksnya juga memuat
      "menunggu persetujuan" yang sengaja TIDAK ikut, karena kasbon pending
      belum jadi uang keluar.
    */
    const jumlahDariTeks = [...String(r.isi).matchAll(/belum lunas Rp ([\d.]+)/g)]
      .reduce((s, m) => s + Number(m[1].replace(/\./g, '')), 0)

    expect(jumlahDariTeks,
      'jumlah di jawaban tak cocok dengan basis — definisi "belum lunas" berbeda')
      .toBe(totalBasis)
  }, 120_000)

  it('`entitas` berisi NAMA yang dibaca, bukan uuid dan bukan kosong', async () => {
    /*
      `entitas` dipakai I-4: jawaban model yang menyebut sesuatu di luar daftar
      ini ditandai sebagai kemungkinan injeksi.

      Kalau ia kosong, pertahanan itu diam-diam mati — tak ada galat, tak ada
      gejala. Kalau ia berisi uuid, ia tak akan pernah cocok dengan apa pun
      yang model tulis, dan efeknya sama.
    */
    const r = await tool('status_kasbon').jalan(konteks() as never, {})
    expect(r.entitas.length, '`entitas` kosong — pertahanan I-4 mati diam-diam')
      .toBeGreaterThan(0)

    for (const e of r.entitas) {
      expect(e, `entitas '${e}' berbentuk uuid, bukan nama`)
        .not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)
      // Namanya harus benar-benar muncul di jawaban — kalau tidak, daftar ini
      // tak menggambarkan apa yang dibaca.
      expect(String(r.isi)).toContain(e)
    }
  }, 120_000)

  it('saringan nama menyempitkan, bukan mengosongkan', async () => {
    const semua = await tool('status_kasbon').jalan(konteks() as never, {})
    const nama = semua.entitas[0]
    expect(nama, 'tak ada nama untuk diuji').toBeTruthy()

    // Sebagian nama saja — pencariannya memang harus cocok sebagian, karena
    // orang menyebut "Slamet" bukan "Pak Slamet Riyadi".
    const sebagian = nama.split(' ').slice(-1)[0]
    const r = await tool('status_kasbon').jalan(konteks() as never, { nama: sebagian })

    expect(r.isError).toBe(false)
    expect(r.entitas.length,
      `saringan "${sebagian}" mengosongkan hasil — pencarian sebagian tak bekerja`)
      .toBeGreaterThan(0)
    expect(r.entitas.length).toBeLessThanOrEqual(semua.entitas.length)
  }, 120_000)
})

describe('beban_mandor (6.7 + 6.11)', () => {
  it('jumlah tukang aktif cocok dengan basis', async () => {
    const r = await tool('beban_mandor').jalan(konteks() as never, {})
    expect(r.isError, r.isi).toBe(false)
    expect(r.entitas.length, 'nol mandor terbaca').toBeGreaterThan(0)

    /*
      Hanya tukang AKTIF yang dihitung. Kalau tool ini menghitung semuanya,
      angkanya menggelembung dan "mandor mana yang longgar" jadi salah jawab —
      persis cacat yang pernah terjadi di layar K3 ("3 dari 60 pekerja · 5%"
      untuk proyek yang punya 30).
    */
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM workers
        WHERE company_id = $1 AND is_active = true
          AND mandor_id IN (SELECT DISTINCT mandor_id FROM mandor_assignments
                             WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1))`,
      [companyId])

    const dariTeks = [...String(r.isi).matchAll(/(\d+) tukang aktif/g)]
      .reduce((s, m) => s + Number(m[1]), 0)

    expect(rows[0].n, 'basis tak punya tukang aktif — test tak menguji apa pun')
      .toBeGreaterThan(0)
    expect(dariTeks,
      'jumlah tukang di jawaban tak cocok dengan basis — saringan is_active tak bekerja')
      .toBe(rows[0].n)
  }, 120_000)

  it('menyatakan BATASNYA sendiri — beban, bukan kesediaan', async () => {
    /*
      Katalog menamai 6.11 *Team Capacity Query* — "berapa mandor available".
      Kata "available" menuntut jadwal kesediaan yang TIDAK ADA di basis ini;
      `mandor_assignments` mencatat penugasan, bukan kesanggupan.

      Jadi jawabannya wajib menyebut batas itu sendiri. Tool yang menjawab
      "siapa yang longgar" tanpa menyatakan bahwa ia hanya melihat beban akan
      dipercaya lebih daripada yang pantas.
    */
    const r = await tool('beban_mandor').jalan(konteks() as never, {})
    expect(String(r.isi),
      'jawaban tak menyatakan bahwa ini beban, bukan jadwal kesediaan')
      .toMatch(/bukan jadwal kesediaan/i)
  }, 120_000)
})

describe('saldo_kas (1.7)', () => {
  it('menjumlahkan saldo rekening AKTIF, dan memisahkan per jenis', async () => {
    /*
      `ringkas_keuangan` yang sudah ada bicara PIUTANG — invoice belum dibayar
      klien. Saldo kas hal yang berbeda arah: uang yang sudah di tangan.

      Keduanya sering tertukar dalam percakapan ("keuangan kita gimana?"), dan
      menjawab pertanyaan saldo dengan angka piutang adalah kekeliruan yang tak
      terlihat salah — sama-sama rupiah, sama-sama besar.
    */
    const r = await tool('saldo_kas').jalan(konteks() as never, {})
    expect(r.isError, r.isi).toBe(false)

    const { rows } = await db.query(
      `SELECT coalesce(sum(balance), 0)::numeric AS total, count(*)::int n
         FROM cash_accounts WHERE company_id = $1 AND is_active = true`,
      [companyId])
    const totalBasis = Number(rows[0].total)

    expect(rows[0].n, 'basis tak punya rekening kas aktif').toBeGreaterThan(0)

    const dariTeks = Number(
      (String(r.isi).match(/Total \d+ rekening: Rp ([\d.]+)/) ?? [])[1]?.replace(/\./g, '') ?? '-1')
    expect(dariTeks,
      'total di jawaban tak cocok dengan basis — saringan is_active tak bekerja')
      .toBe(totalBasis)
  }, 120_000)

  it('memakai label Indonesia, bukan nilai enum mentah', async () => {
    /*
      Nilai enumnya `main`, `collector`, `petty_cash` — dan yang membaca
      jawabannya bukan engineer. "petty_cash: Rp 5.000.000" tak berarti apa-apa
      bagi orang yang menanyakan kas kecil.
    */
    const r = await tool('saldo_kas').jalan(konteks() as never, {})
    const isi = String(r.isi)
    expect(isi, 'nilai enum mentah bocor ke jawaban').not.toMatch(/petty_cash|collector/)
    expect(isi).toMatch(/Kas besar|Kas kecil|Kas penampung/)
  }, 120_000)
})

describe('I-1 — ketiganya BACA saja', () => {
  it('nol baris tercipta saat dipanggil', async () => {
    /*
      Penjaga `audit-tool-ai-read-only` memeriksa BENTUK kode; ini memeriksa
      PERILAKU. Keduanya perlu — penjaga bisa dikelabui bentuk baru, perilaku
      tidak.
    */
    const hitung = async () => {
      const { rows } = await db.query(
        `SELECT (SELECT count(*) FROM kasbons WHERE company_id = $1)
              + (SELECT count(*) FROM workers WHERE company_id = $1)
              + (SELECT count(*) FROM notifications WHERE company_id = $1) AS n`,
        [companyId])
      return Number(rows[0].n)
    }

    const sebelum = await hitung()
    await tool('status_kasbon').jalan(konteks() as never, {})
    await tool('beban_mandor').jalan(konteks() as never, {})
    await tool('saldo_kas').jalan(konteks() as never, {})
    expect(await hitung(), 'tool BACA menciptakan baris — I-1 bocor').toBe(sebelum)
  }, 120_000)
})
