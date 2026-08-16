/**
 * ALOKASI KAS KE PROYEK (2.15).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI: BAHWA IA TIDAK MEMILIH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog menamainya "Advisor", dan di situlah godaannya: meringkas tiga angka
 * jadi satu skor lalu mengurutkannya. Skor tunggal menyembunyikan
 * pertukarannya — proyek yang paling tertinggal jadwalnya belum tentu yang
 * paling mendesak dananya, dan piutang besar bisa jadi alasan mendanai ATAU
 * alasan menahan.
 *
 * Pemilik yang membaca satu angka kehilangan justru bagian yang membuatnya
 * bisa memutuskan.
 *
 * ── Yang dibuktikan
 *
 *   1. permintaan dihitung dari kasbon `pending` + pengeluaran `submitted`
 *      (keduanya sudah diajukan manusia, bukan perkiraan)
 *   2. angkanya cocok dengan basis — dihitung ulang lewat SQL terpisah
 *   3. proyek TANPA permintaan tidak ikut (bukan baris kosong)
 *   4. saldo vs total dinyatakan apa adanya, termasuk saat kurang
 *   5. deviasi jadwal `null` DISEBUT "tak terukur", bukan diganti 0
 *   6. tak meringkas jadi satu skor — ketiga angka tetap terlihat
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolAlokasiKas } from '../ai-tool-alokasi-kas.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string

const ctx = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['finance:view']),
  }) as never

const rupiahKe = (teks: string, pola: RegExp): number => {
  const m = pola.exec(teks)
  return m ? Number(m[1].replace(/\./g, '')) : NaN
}

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT company_id FROM projects WHERE is_deleted = false
     GROUP BY company_id ORDER BY count(*) DESC LIMIT 1`)
  companyId = rows[0].company_id
})

afterAll(async () => {
  await db.end()
})

describe('tool alokasi kas', () => {
  it('terdaftar dengan izin finance:view', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'alokasi_kas')
    expect(t, 'tool `alokasi_kas` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('finance:view')
  })

  it('total permintaan COCOK dengan basis — dihitung ulang lewat SQL', async () => {
    /*
      Dihitung ulang lewat jalur terpisah dari kode yang diuji. Membandingkan
      hasil dengan dirinya sendiri tak membuktikan apa pun.

      Definisi "menunggu" harus SAMA PERSIS: kasbon `pending` + pengeluaran
      `submitted`. Kalau kodenya kelak menambah status lain tanpa alasan,
      test ini merah — dan itu memang yang diinginkan.
    */
    const { rows } = await db.query(
      `SELECT COALESCE((
         SELECT sum(k.amount) FROM kasbons k
           JOIN projects p ON p.id = k.project_id
          WHERE p.company_id = $1 AND p.is_deleted = false
            AND p.status IN ('active','on_hold') AND k.status = 'pending'
       ),0) + COALESCE((
         SELECT sum(e.total_amount) FROM project_expenses e
           JOIN projects p ON p.id = e.project_id
          WHERE p.company_id = $1 AND p.is_deleted = false
            AND p.status IN ('active','on_hold') AND e.status = 'submitted'
       ),0) AS total`, [companyId])

    const harapan = Math.round(Number(rows[0].total))
    const h = await toolAlokasiKas.jalan(ctx(), {})
    expect(h.isError).toBe(false)

    if (harapan === 0) {
      expect(h.isi).toMatch(/tak ada permintaan dana/i)
      return
    }

    const ditulis = rupiahKe(h.isi, /total permintaan menunggu Rp ([\d.]+)/)
    expect(Math.abs(ditulis - harapan)).toBeLessThanOrEqual(1)
  })

  it('proyek TANPA permintaan tidak ikut didaftar', async () => {
    /*
      Daftar yang memuat proyek beranggka nol membuat yang benar-benar minta
      tenggelam — dan pemilik membaca 13 baris untuk menemukan 4 yang penting.
    */
    const { rows } = await db.query(
      `SELECT p.name FROM projects p
        WHERE p.company_id = $1 AND p.is_deleted = false
          AND p.status IN ('active','on_hold')
          AND NOT EXISTS (SELECT 1 FROM kasbons k
                           WHERE k.project_id = p.id AND k.status='pending')
          AND NOT EXISTS (SELECT 1 FROM project_expenses e
                           WHERE e.project_id = p.id AND e.status='submitted')
        LIMIT 5`, [companyId])
    if (rows.length === 0) return

    const h = await toolAlokasiKas.jalan(ctx(), {})
    for (const p of rows as Array<{ name: string }>) {
      const barisMinta = h.isi
        .split('\n')
        .filter((l) => l.startsWith('· ') && l.includes('minta'))
        .join('\n')
      expect(barisMinta, `proyek tanpa permintaan '${p.name}' ikut didaftar`)
        .not.toContain(p.name)
    }
  })

  it('menyatakan saat kas TIDAK menutup permintaan', async () => {
    // Menyembunyikan kekurangan adalah kesalahan yang paling mahal di sini:
    // pemilik menyetujui semuanya lalu kas habis di tengah bulan.
    const h = await toolAlokasiKas.jalan(ctx(), {})
    if (/tak ada permintaan dana/i.test(h.isi)) return
    expect(h.isi).toMatch(/kas (TIDAK menutup|menutup seluruh)/i)
  })

  it('deviasi tak terukur DISEBUT, bukan diganti nol', async () => {
    /*
      Nol berarti "tepat jadwal" — klaim yang datanya tak dukung. Proyek yang
      tanggalnya belum lengkap akan tampil sehat, padahal tak diketahui.
    */
    const src = await (await import('node:fs/promises')).readFile(
      new URL('../ai-tool-alokasi-kas.ts', import.meta.url), 'utf8')
    expect(src, 'deviasi null tak lagi dipisahkan').toMatch(/jadwal tak terukur/)
    expect(src, 'cabang null hilang — deviasi akan jadi angka palsu')
      .toMatch(/deviasi:\s*waktu === null/)
  })

  it('TIDAK meringkas jadi satu skor — ketiga angka tetap terlihat', async () => {
    /*
      Inti berkas ini. Skor tunggal menyembunyikan pertukarannya, dan pemilik
      yang membaca satu angka kehilangan bagian yang membuatnya bisa memutuskan.
    */
    const h = await toolAlokasiKas.jalan(ctx(), {})
    if (/tak ada permintaan dana/i.test(h.isi)) return

    const baris = h.isi.split('\n').filter((l) => l.startsWith('· ') && l.includes('minta'))
    expect(baris.length).toBeGreaterThan(0)
    // Tiap baris menyebut nominal DAN keadaan jadwalnya — bukan satu peringkat.
    for (const b of baris) {
      expect(b, `baris tanpa nominal: ${b}`).toMatch(/minta Rp [\d.]+/)
      expect(b, `baris tanpa keadaan jadwal: ${b}`).toMatch(/jadwal/)
    }
    expect(h.isi).toMatch(/bukan putusannya/i)
  })
})
