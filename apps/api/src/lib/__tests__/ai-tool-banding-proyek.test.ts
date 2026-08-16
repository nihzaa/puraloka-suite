/**
 * BANDINGKAN PROYEK (8.8) — dan dua cara ia bisa menyesatkan pemilik.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI: URUTANNYA, BUKAN ANGKANYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keluaran tool ini menentukan ke mana pemilik pergi minggu ini. Dua cara ia
 * bisa mengirimnya ke tempat yang salah:
 *
 * 1. **Mengurutkan progres mentah.** Proyek yang baru mulai memang kecil
 *    progresnya — itu normal. Mengurutkannya menempatkan proyek SEHAT di
 *    urutan "paling buruk", dan yang benar-benar tertinggal tenggelam.
 *
 * 2. **Proyek tanpa tanggal dianggap tepat jadwal.** Deviasi 0 menempatkannya
 *    di tengah daftar sebagai proyek paling sehat — persis kebalikan dari
 *    yang perlu diperhatikan.
 *
 * Diukur 2026-08-16: 17 proyek, seluruhnya ber-`contract_value` dan
 * `progress_pct`. Hanya 3 punya RAB dan 4 punya pengeluaran — itulah sebabnya
 * perbandingan berbasis BIAYA ditolak: ia hanya mencakup seperempat
 * portofolio, dan yang tak tercakup terbaca "baik-baik saja".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolBandingProyek, porsiWaktu } from '../ai-tool-banding-proyek.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string

const ctx = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: 'uji',
    izin: new Set(['projects:view']),
  }) as never

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

describe('porsi waktu', () => {
  const kini = new Date('2026-08-16T12:00:00')

  it('setengah jalan → sekitar 50%', () => {
    const v = porsiWaktu('2026-08-01', '2026-08-31', kini)
    expect(v).toBeGreaterThan(45)
    expect(v).toBeLessThan(55)
  })

  it('belum mulai → 0, bukan MINUS', () => {
    // Minus membuat deviasinya melonjak positif dan proyek yang belum jalan
    // tampil sebagai yang paling sehat.
    expect(porsiWaktu('2026-12-01', '2027-01-01', kini)).toBe(0)
  })

  it('sudah lewat tenggat → 100, bukan 150', () => {
    // Tanpa dijepit, proyek yang lewat setahun berdeviasi −400 dan mengubur
    // seluruh daftar di bawahnya.
    expect(porsiWaktu('2025-01-01', '2025-06-01', kini)).toBe(100)
  })

  it('tanggal tak lengkap / terbalik → null', () => {
    // `null` = tak bisa dihitung. Yang memakainya WAJIB memisahkannya, bukan
    // menggantinya dengan nol.
    expect(porsiWaktu(null, '2026-08-31', kini)).toBeNull()
    expect(porsiWaktu('2026-08-01', null, kini)).toBeNull()
    expect(porsiWaktu('2026-08-31', '2026-08-01', kini)).toBeNull()
    expect(porsiWaktu('bukan tanggal', '2026-08-31', kini)).toBeNull()
  })
})

describe('tool banding proyek', () => {
  it('terdaftar dengan izin projects:view', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'banding_proyek')
    expect(t, 'tool `banding_proyek` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('projects:view')
  })

  it('diurut DEVIASI, bukan progres mentah', async () => {
    /*
      Inti berkas ini.

      Kalau ia mengurutkan `progress_pct`, proyek 0% yang baru mulai akan di
      atas — padahal yang perlu didatangi adalah yang progresnya tertinggal
      dari WAKTUNYA.
    */
    const h = await toolBandingProyek.jalan(ctx(), {})
    expect(h.isError).toBe(false)

    const deviasi = [...h.isi.matchAll(/^([+-]\d+) — /gm)].map((m) => Number(m[1]))
    expect(deviasi.length, 'tak ada baris perbandingan').toBeGreaterThan(0)

    // Menaik: paling negatif (paling tertinggal) di ATAS.
    const urut = [...deviasi].sort((a, b) => a - b)
    expect(deviasi, 'urutan tak menempatkan yang paling tertinggal di atas').toEqual(urut)
  })

  it('deviasi COCOK dengan hitungan basis — dihitung ulang lewat SQL', async () => {
    /*
      Dihitung ulang lewat jalur terpisah. Membandingkan hasil dengan dirinya
      sendiri tak membuktikan apa pun.
    */
    /*
      `end_date - start_date` pada kolom `date` menghasilkan INTEGER (jumlah
      hari), bukan interval — jadi `EXTRACT(EPOCH FROM …)` menolaknya:
      "function pg_catalog.extract(unknown, integer) does not exist".

      Selisih harinya dipakai langsung. Ditemukan saat test ini merah, bukan
      lewat review.
    */
    const { rows } = await db.query(
      `WITH h AS (
         SELECT name, progress_pct,
                GREATEST(0, LEAST(100,
                  (CURRENT_DATE - start_date)::numeric
                  / NULLIF((end_date - start_date)::numeric, 0) * 100)) AS waktu
           FROM projects
          WHERE company_id = $1 AND is_deleted = false
            AND status IN ('active','on_hold')
            AND start_date IS NOT NULL AND end_date IS NOT NULL
            AND end_date > start_date
       )
       SELECT name, progress_pct, waktu FROM h
        ORDER BY (progress_pct - waktu) ASC LIMIT 1`, [companyId])
    if (rows.length === 0) return

    const harapan = Math.round(Number(rows[0].progress_pct) - Number(rows[0].waktu))
    const h = await toolBandingProyek.jalan(ctx(), {})

    const baris1 = h.isi.split('\n').find((l) => /^[+-]\d+ — /.test(l)) ?? ''
    const ditulis = Number(/^([+-]\d+) — /.exec(baris1)?.[1] ?? NaN)

    expect(baris1, 'proyek teratas berbeda dari hitungan SQL').toContain(rows[0].name)
    // Toleransi 1 poin: keluaran membulatkan, SQL tidak.
    expect(Math.abs(ditulis - harapan)).toBeLessThanOrEqual(1)
  })

  it('proyek tanpa tanggal DISEBUT terpisah, tak dianggap sehat', async () => {
    /*
      Deviasi 0 untuk proyek tanpa tanggal menempatkannya di tengah daftar
      sebagai yang paling sehat — kebalikan dari yang perlu diperhatikan.
    */
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM projects
        WHERE company_id=$1 AND is_deleted=false AND status IN ('active','on_hold')
          AND (start_date IS NULL OR end_date IS NULL)`, [companyId])

    const h = await toolBandingProyek.jalan(ctx(), {})

    /*
      ── Kalau tenant ini TAK punya proyek tanpa tanggal, yang diuji SUMBERNYA

      Diukur 2026-08-16: 13 proyek berjalan, NOL di antaranya tanpa tanggal.
      Mutasi sengaja (proyek tanpa tanggal diberi deviasi 0) karena itu tetap
      HIJAU — datanya tak bisa membedakan.

      Membiarkan test yang lolos karena kebetulan tak ada bahannya lebih buruk
      daripada tak punya test: ia memberi rasa aman yang tak berdasar. Maka
      cabang pemisahnya diperiksa di kode, dan kelemahannya ditulis di sini
      supaya pembaca berikutnya tahu persis seberapa jauh ia menjamin.
    */
    if (rows[0].n === 0) {
      const src = await (await import('node:fs/promises')).readFile(
        new URL('../ai-tool-banding-proyek.ts', import.meta.url), 'utf8')
      expect(
        src,
        'cabang pemisah proyek tanpa tanggal hilang — mereka akan dianggap tepat jadwal',
      ).toMatch(/takTerukur\.push\(p\)/)
      return
    }

    if (rows[0].n > 0) {
      expect(h.isi).toMatch(/TIDAK bisa dibandingkan/i)
      expect(h.isi).toMatch(/BUKAN berarti sehat/i)
      // Dan mereka TIDAK muncul di daftar berdeviasi.
      const berdeviasi = [...h.isi.matchAll(/^[+-]\d+ — (.+?):/gm)].map((m) => m[1])
      const { rows: tanpa } = await db.query(
        `SELECT name FROM projects
          WHERE company_id=$1 AND is_deleted=false AND status IN ('active','on_hold')
            AND (start_date IS NULL OR end_date IS NULL) LIMIT 5`, [companyId])
      for (const t of tanpa as Array<{ name: string }>) {
        expect(berdeviasi, `${t.name} tanpa tanggal ikut diberi deviasi`).not.toContain(t.name)
      }
    }
  })

  it('bawaan hanya proyek BERJALAN — completed tak mengubur yang aktif', async () => {
    // Proyek `completed` selalu berdeviasi buruk kalau tanggal selesainya
    // lewat, dan menyorotinya mengubur proyek berjalan yang perlu didatangi.
    const { rows } = await db.query(
      `SELECT name FROM projects
        WHERE company_id=$1 AND is_deleted=false AND status='completed' LIMIT 3`, [companyId])
    if (rows.length === 0) return

    const h = await toolBandingProyek.jalan(ctx(), {})
    for (const p of rows as Array<{ name: string }>) {
      expect(h.isi, `proyek selesai '${p.name}' ikut dibandingkan`).not.toContain(p.name)
    }
  })
})
