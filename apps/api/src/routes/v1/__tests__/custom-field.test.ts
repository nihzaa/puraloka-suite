/**
 * TJS-P5 — custom field per tenant, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SELURUH TEST DI SINI MENEMBAK BASIS LANGSUNG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `cara_verifikasi` item ini berbunyi:
 *
 *   > test: tipe di luar daftar DITOLAK DB, bukan hanya UI
 *
 * Kalimat "bukan hanya UI" itu seluruh isinya. Validasi di lapisan aplikasi
 * membuktikan aplikasi menolak — ia TIDAK membuktikan basis menolak, dan
 * yang menulis ke basis bukan cuma aplikasi: ada importer, ada skrip
 * perbaikan data, ada psql di tangan orang yang sedang buru-buru.
 *
 * Karena itu tak ada `app.inject` di berkas ini sama sekali. Tiap test
 * mengirim SQL apa adanya dan menuntut basis yang menolak.
 *
 * ── Kenapa batas JUMLAH juga diuji
 *
 * Enum membatasi BENTUK, tak satu pun membatasi VOLUME. Tenant bisa membuat
 * 300 field bertipe sah di entitas sah — dan hasilnya EAV penuh dengan enum
 * yang rapi. Never Build List mencoret EAV penuh; batas 20 itulah yang
 * memisahkan keduanya.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

let db: Client
let companyId: string

const TANDA = '[TEST-CF]'

/** Definisi bertanda, supaya pembersihannya tak menyentuh data lain. */
async function buatDef(
  entitas: string, tipe: string, kunci: string, extra: Record<string, unknown> = {},
): Promise<string> {
  const opsi = (extra.opsi as string[] | undefined) ?? []
  const { rows } = await db.query(
    `INSERT INTO custom_field_def (company_id, entitas, tipe, kunci, label, opsi, wajib)
     VALUES ($1, $2::cf_entitas, $3::cf_tipe, $4, $5, $6, $7) RETURNING id`,
    [companyId, entitas, tipe, kunci, `${TANDA} ${kunci}`, opsi, extra.wajib ?? false],
  )
  return rows[0].id
}

const isi = (defId: string, nilai: string, entitasId?: string) =>
  db.query(
    `INSERT INTO custom_field_nilai (company_id, def_id, entitas_id, nilai)
     VALUES ($1, $2, COALESCE($3::uuid, gen_random_uuid()), $4::jsonb)`,
    [companyId, defId, entitasId ?? null, nilai],
  )

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  if (!rows.length) throw new Error('tak ada company untuk test ini')
  companyId = rows[0].id
  await db.query(`DELETE FROM custom_field_def WHERE label LIKE '${TANDA}%'`)
}, 90_000)

afterAll(async () => {
  // Nilai ikut terhapus lewat ON DELETE CASCADE.
  await db.query(`DELETE FROM custom_field_def WHERE label LIKE '${TANDA}%'`)
  await db.end()
})

describe('daftar TERTUTUP — ditegakkan tipe, bukan niat baik', () => {
  it('entitas di luar daftar DITOLAK BASIS', async () => {
    // `kasbons` tabel nyata dan besar — justru itu yang membuatnya contoh
    // bagus: yang menolak bukan "tabelnya tak ada", melainkan "tak ada di
    // daftar". Yang menyentuh uang tak boleh bisa dikonfigurasi dari UI.
    await expect(buatDef('kasbons', 'teks', 'x1')).rejects.toThrow(/invalid input value|cf_entitas/i)
  })

  it('tipe di luar daftar DITOLAK BASIS', async () => {
    await expect(buatDef('projects', 'json', 'x2')).rejects.toThrow(/invalid input value|cf_tipe/i)
  })

  it('daftar entitas berisi TEPAT lima nilai yang diniatkan', async () => {
    // Test ini gagal saat seseorang menambah entitas lewat `ALTER TYPE` tanpa
    // memperbarui daftar ini — dan itu memang yang diinginkan: penambahan
    // entitas harus terbaca di review, bukan lolos diam-diam.
    const { rows } = await db.query(`
      SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'cf_entitas' ORDER BY e.enumlabel`)
    expect(rows.map(r => r.v)).toEqual(['clients', 'materials', 'pegawai', 'projects', 'suppliers'])
  })
})

describe('nilai harus cocok dengan TIPE field-nya', () => {
  it('teks pada field angka ditolak', async () => {
    const d = await buatDef('projects', 'angka', 'cf_angka')
    await expect(isi(d, '"dua belas"')).rejects.toThrow(/bertipe angka/i)
  })

  it('angka yang sah diterima — penjaga yang menolak segalanya tak berguna', async () => {
    const d = await buatDef('projects', 'angka', 'cf_angka_ok')
    await expect(isi(d, '12.5')).resolves.toBeTruthy()
  })

  it('uang WAJIB string, bukan number', async () => {
    // CLAUDE.md §5.4: nol float. `jsonb` number adalah IEEE754 di banyak
    // driver, dan nominal yang lolos sebagai float salah di digit terakhir
    // tanpa satu pun galat.
    const d = await buatDef('projects', 'uang', 'cf_uang')
    await expect(isi(d, '1250000.50')).rejects.toThrow(/bertipe uang/i)
    await expect(isi(d, '"1250000.50"')).resolves.toBeTruthy()
  })

  it('tanggal yang bentuknya benar tapi TAK ADA ditolak', async () => {
    // '2026-02-31' lolos regex `\d{4}-\d{2}-\d{2}`. Yang menangkapnya cast
    // ke `date`, bukan polanya.
    const d = await buatDef('projects', 'tanggal', 'cf_tgl')
    await expect(isi(d, '"2026-02-31"')).rejects.toThrow(/bukan tanggal yang ada/i)
    await expect(isi(d, '"2026-02-28"')).resolves.toBeTruthy()
  })

  it('pilihan di luar opsi ditolak', async () => {
    const d = await buatDef('projects', 'pilihan', 'cf_pil', { opsi: ['Utara', 'Selatan'] })
    await expect(isi(d, '"Timur"')).rejects.toThrow(/bukan salah satu opsi/i)
    await expect(isi(d, '"Utara"')).resolves.toBeTruthy()
  })

  it('pilihan TANPA opsi tak bisa dibuat sama sekali', async () => {
    // Dropdown kosong: field wajib bertipe ini MENGUNCI form selamanya.
    //
    // CHECK-nya sempat SALAH dan menerima ini: `array_length('{}', 1)`
    // memulangkan NULL (bukan 0), dan `NULL >= 1` bernilai NULL — yang CHECK
    // perlakukan sebagai LOLOS. Ditemukan blok verifikasi migrasi 321,
    // bukan oleh mata; bentuk SQL-nya terbaca benar.
    await expect(buatDef('projects', 'pilihan', 'cf_pil_kosong')).rejects.toThrow(/check/i)
  })

  it('field WAJIB tak bisa dikosongkan', async () => {
    const d = await buatDef('projects', 'teks', 'cf_wajib', { wajib: true })
    await expect(isi(d, 'null')).rejects.toThrow(/wajib diisi/i)
  })

  it('field TAK wajib boleh dikosongkan — barisnya tetap ada', async () => {
    // Barisnya disimpan, bukan dihapus: jejak "pernah diisi lalu dikosongkan"
    // ikut hilang kalau dihapus.
    const d = await buatDef('projects', 'teks', 'cf_opsional')
    await expect(isi(d, 'null')).resolves.toBeTruthy()
  })
})

describe('batas VOLUME — yang memisahkan custom field dari EAV penuh', () => {
  it('field ke-21 pada satu entitas ditolak', async () => {
    for (let i = 1; i <= 20; i++) await buatDef('materials', 'teks', `cf_vol_${i}`)
    await expect(buatDef('materials', 'teks', 'cf_vol_21')).rejects.toThrow(/Batas 20 custom field/i)
  })

  it('batasnya PER ENTITAS, bukan per company', async () => {
    // Kalau batasnya per-company, tenant dengan 20 field di material tak bisa
    // menambah satu pun di proyek — dan yang terjadi berikutnya adalah
    // permintaan menaikkan batas, bukan penataan ulang.
    await expect(buatDef('clients', 'teks', 'cf_entitas_lain')).resolves.toBeTruthy()
  })
})

describe('tenancy — kriteria "definisi DAN nilai, keduanya company_id + RLS"', () => {
  it('kedua tabel punya company_id NOT NULL', async () => {
    const { rows } = await db.query(`
      SELECT table_name, is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND column_name='company_id'
         AND table_name IN ('custom_field_def','custom_field_nilai')
       ORDER BY table_name`)
    expect(rows).toHaveLength(2)
    for (const r of rows) expect(r.is_nullable, r.table_name).toBe('NO')
  })

  it('kedua tabel ber-RLS dengan policy PERMISSIVE — tidak mati total', async () => {
    // `(OR semua PERMISSIVE) AND (AND semua RESTRICTIVE)`; OR atas himpunan
    // kosong = FALSE. T5A menemukan 30 tabel mati total karena ini.
    const { rows } = await db.query(`
      SELECT c.relname,
             c.relrowsecurity AS rls,
             count(*) FILTER (WHERE p.polpermissive)::int AS permissive
        FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
       WHERE c.relname IN ('custom_field_def','custom_field_nilai')
       GROUP BY 1,2 ORDER BY 1`)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.rls, `${r.relname} RLS`).toBe(true)
      expect(r.permissive, `${r.relname} policy permissive`).toBeGreaterThanOrEqual(2)
    }
  })

  it('nilai milik company LAIN dari definisinya ditolak', async () => {
    // Kebocoran lintas-tenant yang tak akan terlihat di UI mana pun: nilainya
    // tersimpan, dan yang membacanya adalah tenant yang salah.
    const d = await buatDef('projects', 'teks', 'cf_tenant')
    const { rows } = await db.query(
      `SELECT id FROM companies WHERE id <> $1 LIMIT 1`, [companyId])
    if (!rows.length) return // basis satu company — tak bisa diuji
    await expect(
      db.query(
        `INSERT INTO custom_field_nilai (company_id, def_id, entitas_id, nilai)
         VALUES ($1, $2, gen_random_uuid(), '"x"'::jsonb)`,
        [rows[0].id, d],
      ),
    ).rejects.toThrow(/tak cocok dengan definisinya/i)
  })

  it('satu nilai per (field, baris) — bukan dua yang saling menimpa', async () => {
    const d = await buatDef('projects', 'teks', 'cf_unik')
    const { rows } = await db.query('SELECT gen_random_uuid() AS id')
    await isi(d, '"pertama"', rows[0].id)
    await expect(isi(d, '"kedua"', rows[0].id)).rejects.toThrow(/duplicate key|unique/i)
  })
})
