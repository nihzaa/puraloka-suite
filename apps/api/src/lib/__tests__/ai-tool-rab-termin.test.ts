/**
 * TOOL RAB & TERMIN — dua pertanyaan tersering yang dulu TAK BISA dijawab.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DUA INI, BUKAN DUA BELAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16, tabel BERISI yang tak punya tool: `rab_items` 377 baris,
 * `termin_schedules` 40, sisanya di bawah 10 (uji_material 5, izin_kerja 4,
 * transmittal 3, kontrak_payung 3, change_orders 2).
 *
 * Tool untuk tabel yang nyaris kosong lebih buruk daripada tak ada tool: model
 * tetap memanggilnya, tetap membakar satu ronde, dan jawabannya jadi lebih
 * lambat tanpa jadi lebih benar. Alasan yang sama dengan "9 tambahan, bukan
 * 33" di kepala `ai-tool-konstruksi.ts`.
 *
 * ── Yang dibuktikan
 *
 *   1. RAB ringkas mengembalikan KATEGORI, bukan 377 baris item
 *   2. drill-down kategori hanya memuat item MILIK kategori itu
 *      (lewat `parent_id`, bukan tebakan urutan)
 *   3. proyek ambigu DINYATAKAN, tak ditebak — RAB proyek salah terlihat sah
 *   4. termin memisahkan yang BELUM ditagih dari yang sudah
 *   5. keduanya membungkus hasil sebagai `<data>` (I-2)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolRab, toolTermin } from '../ai-tool-konstruksi.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string
let namaProyek: string
let namaKategori: string

const ctx = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['projects:view', 'finance:view']),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()

  /*
    Fixture dipilih dari KATEGORI yang punya anak TERBANYAK, bukan dari proyek
    pertama yang punya item.

    Versi pertama saya memilih `LIMIT 1` proyek ber-item, dan kategorinya
    ternyata tak punya anak langsung — sehingga `namaKategori` kosong dan test
    drill-down DIAM-DIAM `return` tanpa menguji apa pun.
    Ketahuannya saat mutasi sengaja: hasilnya "8 passed", bukan 9. Test yang
    skip tanpa jejak terbaca persis seperti test yang lulus.
  */
  const { rows } = await db.query(`
    SELECT p.company_id, p.name, k.name AS kategori,
           (SELECT count(*)::int FROM rab_items x WHERE x.parent_id = k.id) AS n_anak
      FROM rab_items k
      JOIN projects p ON p.id = k.project_id
     WHERE k.level = 'category'
       AND EXISTS (SELECT 1 FROM rab_items c WHERE c.parent_id = k.id)
     ORDER BY n_anak DESC
     LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu kategori RAB beranak untuk test ini')

  companyId = rows[0].company_id
  namaProyek = rows[0].name
  namaKategori = rows[0].kategori
})

afterAll(async () => {
  await db.end()
})

describe('tool RAB', () => {
  it('terdaftar di katalog dengan izin yang benar', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'rab')
    expect(t, 'tool `rab` tak terdaftar di KATALOG_TOOL').toBeTruthy()
    expect(t!.izin).toBe('projects:view')
  })

  it('ringkasan mengembalikan KATEGORI, bukan ratusan item', async () => {
    /*
      `rab_items` berisi 377 baris untuk tenant ini. Mengirim semuanya
      melampaui jendela konteks — dan yang gagal bukan tool ini, melainkan
      panggilan BERIKUTNYA, dengan galat yang tak menyebut sebabnya.
    */
    const h = await toolRab.jalan(ctx(), { proyek: namaProyek })
    expect(h.isError).toBe(false)
    expect(h.isi).toContain('<data sumber="rab">')
    expect(h.isi).toMatch(/kategori/i)
    // Ringkasan menyebut TOTAL — angka yang paling sering ditanya.
    expect(h.isi).toMatch(/total Rp/i)

    // Dan tak membanjiri: baris hasil jauh di bawah jumlah item sesungguhnya.
    const barisTampil = h.isi.split('\n').length
    expect(barisTampil).toBeLessThan(60)
  })

  it('drill-down hanya memuat item MILIK kategori itu', async () => {
    // DINYATAKAN, bukan `return` diam-diam: test yang skip tanpa jejak terbaca
    // persis seperti test yang lulus — dan itulah yang menyembunyikan cacat
    // hierarki ini saat mutasi pertama.
    expect(namaKategori, 'fixture tak menemukan kategori beranak').toBeTruthy()

    const h = await toolRab.jalan(ctx(), { proyek: namaProyek, kategori: namaKategori })
    expect(h.isError).toBe(false)
    expect(h.isi).toContain(namaKategori)

    /*
      ── Dibandingkan dengan NAMA, bukan dengan JUMLAH

      Versi pertama membandingkan `barisHasil < totalItemProyek`. Itu HIJAU
      bahkan sesudah `parent_id` diabaikan — karena `potong()` memangkas di 25,
      dan 25 memang lebih kecil dari 226. Assertion-nya tak pernah bisa
      membedakan yang benar dari yang rusak.

      Sekarang tiap baris hasil dicocokkan ke daftar nama item yang BENAR-BENAR
      milik kategori ini (ditelusuri `parent_id` di SQL, jalur yang sepenuhnya
      terpisah dari kode yang diuji). Satu nama asing = merah.
    */
    const { rows: sah } = await db.query(
      `WITH RECURSIVE turunan AS (
         SELECT id FROM rab_items
          WHERE level='category' AND name = $1
            AND project_id = (SELECT id FROM projects WHERE name = $2 LIMIT 1)
         UNION ALL
         SELECT r.id FROM rab_items r JOIN turunan t ON r.parent_id = t.id
       )
       SELECT r.name FROM rab_items r
        WHERE r.level='item' AND r.parent_id IN (SELECT id FROM turunan)`,
      [namaKategori, namaProyek],
    )

    const namaSah = new Set((sah as Array<{ name: string }>).map((r) => r.name))
    expect(namaSah.size, 'kategori fixture tak punya item turunan').toBeGreaterThan(0)

    const barisHasil = h.isi.split('\n').filter((l) => / × Rp /.test(l))
    expect(barisHasil.length).toBeGreaterThan(0)

    /*
      Nama diambil sampai pemisah TERAKHIR, bukan `split(':')[0]`.

      Percobaan pertama memakai pemisah pertama dan MERAH pada kode yang benar:
      ada item bernama `Septictank ( Biotec  Kap : 2  m³ )` — titik dua ada di
      dalam NAMANYA. Yang salah bukan kodenya melainkan cara test membacanya.

      Barisnya berbentuk `<nama>: <qty> <unit> × Rp …`, jadi yang memisahkan
      adalah titik dua TERAKHIR sebelum ` × Rp`.
    */
    for (const baris of barisHasil) {
      const potongan = baris.slice(0, baris.lastIndexOf(':')).trim()
      expect(
        namaSah.has(potongan),
        `item "${potongan}" BUKAN turunan kategori "${namaKategori}" — parent_id diabaikan`,
      ).toBe(true)
    }
  })

  it('kategori KARANGAN ditolak, dan menyebut yang ada', async () => {
    const h = await toolRab.jalan(ctx(), { proyek: namaProyek, kategori: 'ZZZ-TAK-ADA' })
    expect(h.isError).toBe(true)
    expect(h.isi).toMatch(/tak ada kategori/i)
    // Menyebut pilihan yang benar — penolakan tanpa arah memaksa model menebak.
    expect(h.isi).toMatch(/yang ada:/i)
  })

  it('proyek TAK ADA ditolak, bukan dijawab kosong', async () => {
    const h = await toolRab.jalan(ctx(), { proyek: 'Zzxqv Proyek Tak Ada' })
    expect(h.isError).toBe(true)
  })
})

describe('tool TERMIN', () => {
  it('terdaftar dengan izin finance:view — bukan projects:view', () => {
    // Termin adalah data UANG. Memberinya `projects:view` berarti siapa pun
    // yang bisa melihat proyek bisa melihat nilai kontrak dan jadwal tagihan.
    const t = KATALOG_TOOL.find((x) => x.nama === 'termin')
    expect(t, 'tool `termin` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('finance:view')
  })

  it('memisahkan yang BELUM ditagih dari yang sudah', async () => {
    /*
      Yang ditanya orang hampir selalu "apa yang BELUM ditagih". Daftar
      bercampur memaksa model menyaring sendiri — dan ia bisa salah menyaring
      tanpa ketahuan siapa pun.
    */
    const h = await toolTermin.jalan(ctx(), {})
    expect(h.isError).toBe(false)
    expect(h.isi).toContain('<data sumber="termin">')
    expect(h.isi).toMatch(/BELUM ditagih/i)
  })

  it('proyek yang tak cocok menjawab kosong TANPA melempar', async () => {
    const h = await toolTermin.jalan(ctx(), { proyek: 'Zzxqv Tak Ada' })
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(/tak ada proyek/i)
  })
})
