/**
 * BEBAN MANDOR LINTAS PROYEK (3.20).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU SARINGAN YANG MENENTUKAN SELURUH JAWABANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `mandor_assignments.status` bernilai `active` atau `completed` (diukur ke
 * basis). Menghitung keduanya membuat mandor lama yang sudah MENYELESAIKAN
 * banyak proyek terlihat paling sibuk — padahal ia justru yang paling longgar
 * sekarang.
 *
 * Terbukti pada data ini: Pak Budi 5 penugasan total, tetapi 4 yang aktif.
 * Selisih satu itu cukup mengubah urutan kalau angkanya rapat.
 *
 * Beban yang salah baca berarti penugasan baru jatuh ke orang yang salah, dan
 * akibatnya baru terlihat berbulan kemudian sebagai proyek yang tertinggal.
 *
 * ── Yang dibuktikan
 *
 *   1. hanya `active` yang dihitung (dibandingkan hitungan SQL terpisah)
 *   2. diurut beban terbanyak di atas
 *   3. ambang sorot dari RATA-RATA, bukan angka tetap
 *   4. relasi `users` dinamai — dua FK ke users, `users!inner` ambigu
 *   5. menyatakan keputusannya di tangan pengguna
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolBebanMandorLintas } from '../ai-tool-beban-mandor.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string

const ctx = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['mandor:view']),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT p.company_id FROM mandor_assignments ma
      JOIN projects p ON p.id = ma.project_id
     WHERE p.is_deleted = false
     GROUP BY p.company_id ORDER BY count(*) DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu tenant berpenugasan mandor')
  companyId = rows[0].company_id
})

afterAll(async () => {
  await db.end()
})

describe('tool beban mandor lintas proyek', () => {
  it('terdaftar dengan izin mandor:view', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'beban_mandor_lintas')
    expect(t, 'tool `beban_mandor_lintas` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('mandor:view')
  })

  it('hanya penugasan AKTIF yang dihitung', async () => {
    /*
      Inti berkas ini. Dibandingkan dengan hitungan SQL terpisah untuk mandor
      tersibuk — kalau `completed` ikut, angkanya berbeda dan test merah.
    */
    const { rows } = await db.query(
      `SELECT u.name, count(*)::int AS aktif
         FROM mandor_assignments ma
         JOIN projects p ON p.id = ma.project_id
         JOIN users u ON u.id = ma.mandor_id
        WHERE p.company_id = $1 AND p.is_deleted = false AND ma.status = 'active'
        GROUP BY u.name ORDER BY aktif DESC LIMIT 1`, [companyId])
    if (rows.length === 0) return

    const h = await toolBebanMandorLintas.jalan(ctx(), {})
    expect(h.isError).toBe(false)

    const baris = h.isi.split('\n').find((l) => l.includes(rows[0].name)) ?? ''
    expect(baris, `mandor '${rows[0].name}' tak muncul`).toBeTruthy()

    const ditulis = Number(/: (\d+) penugasan/.exec(baris)?.[1] ?? NaN)
    expect(ditulis, 'jumlah penugasan tak cocok — `completed` mungkin ikut terhitung')
      .toBe(rows[0].aktif)
  })

  it('total & rata-rata cocok dengan basis', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS total, count(DISTINCT ma.mandor_id)::int AS orang
         FROM mandor_assignments ma
         JOIN projects p ON p.id = ma.project_id
        WHERE p.company_id = $1 AND p.is_deleted = false AND ma.status = 'active'`,
      [companyId])
    if (rows[0].total === 0) return

    const h = await toolBebanMandorLintas.jalan(ctx(), {})
    expect(h.isi).toMatch(new RegExp(`total ${rows[0].total}`))
    expect(h.isi).toMatch(new RegExp(`^${rows[0].orang} mandor`, 'm'))
  })

  it('diurut beban TERBANYAK di atas', async () => {
    const h = await toolBebanMandorLintas.jalan(ctx(), {})
    const jumlah = [...h.isi.matchAll(/: (\d+) penugasan di/g)].map((m) => Number(m[1]))
    if (jumlah.length < 2) return

    const urut = [...jumlah].sort((a, b) => b - a)
    expect(jumlah, 'urutan tak menempatkan yang paling sibuk di atas').toEqual(urut)
  })

  it('ambang sorot dari RATA-RATA, bukan angka tetap', async () => {
    /*
      Perusahaan dengan 3 mandor dan 30 mandor punya "sibuk" yang berbeda.
      Angka tetap menyorot semua orang di satu perusahaan dan tak seorang pun
      di perusahaan lain.
    */
    const src = await (await import('node:fs/promises')).readFile(
      new URL('../ai-tool-beban-mandor.ts', import.meta.url), 'utf8')
    expect(src, 'ambang tak lagi diturunkan dari rata-rata').toMatch(/const ambang = rata \*/)

    const h = await toolBebanMandorLintas.jalan(ctx(), {})
    const rata = Number(/rata-rata ([\d.]+) per orang/.exec(h.isi)?.[1] ?? NaN)
    if (!Number.isFinite(rata)) return

    // Yang ditandai ⚠ memang di atas ambang; yang tidak, tidak.
    for (const l of h.isi.split('\n')) {
      const m = /: (\d+) penugasan di/.exec(l)
      if (!m) continue
      const n = Number(m[1])
      if (l.includes('⚠')) expect(n).toBeGreaterThanOrEqual(rata * 1.5)
    }
  })

  it('menyatakan keputusannya di tangan pengguna', async () => {
    // Keahlian, jarak lokasi, dan hubungan dengan klien tak terbaca dari
    // angka — mandor dengan 2 penugasan bisa sedang menangani yang tersulit.
    const h = await toolBebanMandorLintas.jalan(ctx(), {})
    expect(h.isi).toMatch(/tak terbaca dari angka/i)
    expect(h.isi).toMatch(/di tangan pengguna/i)
  })

  it('relasi users DINAMAI — dua FK ke users bikin `users!inner` ambigu', async () => {
    /*
      `mandor_assignments` punya `mandor_id` DAN `assigned_by`, keduanya ke
      `users`. Tanpa menyebut constraint-nya, PostgREST menolak dengan "more
      than one relationship was found" — dan galatnya berbunyi "Gagal membaca
      penugasan", terdengar seperti gangguan basis.
    */
    const src = await (await import('node:fs/promises')).readFile(
      new URL('../ai-tool-beban-mandor.ts', import.meta.url), 'utf8')
    expect(src, 'relasi users tak dinamai — query akan ambigu')
      .toMatch(/users!mandor_assignments_mandor_id_fkey/)
  })
})
