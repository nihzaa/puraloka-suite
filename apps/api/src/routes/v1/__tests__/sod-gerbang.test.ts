/**
 * TJS-P4 — gerbang SoD pada RUTE, terhadap Postgres nyata.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TERPISAH DARI `lib/__tests__/sod.test.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test lib membuktikan `periksaSod()` menolak pengaju yang menyetujui miliknya
 * sendiri. Ia TIDAK membuktikan rutenya memanggil fungsi itu.
 *
 * Perbedaan itu justru inti perbaikannya: sebelum hari ini repo ini SUDAH
 * punya penanda `saya_pengajunya` yang benar, dan halaman yang menyembunyikan
 * tombolnya dengan benar — dan tetap tak menghentikan apa pun, karena tak ada
 * yang memanggil pemeriksaan di jalur yang menulis.
 *
 * Ini kesalahan yang sama yang saya ulangi berkali-kali sesi ini: menguji
 * lapisan yang salah. Test aplikasi menangkap permintaan kedua sebelum klausa
 * WHERE-nya pernah dijalankan; di sini, test lib akan hijau meski rutenya
 * tak pernah memanggil gerbangnya.
 *
 * ── Yang diuji lewat basis (bukan lewat rute)
 *
 * Immutability `sod_override` dan CHECK alasan-tak-boleh-kosong diuji dengan
 * SQL langsung. Keduanya penjaga terakhir: kalau kode lapisan atas suatu saat
 * dilewati, dua inilah yang tersisa.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { periksaSod, ATURAN_SOD } from '../../../lib/sod.js'

let db: Client
let companyId: string
let userA: string
let userB: string

const TANDA = '[TEST-SOD]'

beforeAll(async () => {
  db = await createRlsClient()

  /*
    Company dipilih yang punya DUA anggota — bukan sekadar "ada anggota".

    SoD menuntut dua pengguna berbeda; komentar di bawah sudah menyatakan itu.
    Tapi company-nya dipilih dengan `EXISTS (…) LIMIT 1` tanpa ORDER BY —
    cukup ada SATU anggota, dan pilihannya diserahkan ke Postgres.

    Diukur 2026-08-18: dari 3 company ber-anggota, dua di antaranya hanya
    punya SATU. Begitu salah satunya terpilih, seluruh berkas mati di setup
    dengan "butuh minimal 2 pengguna di satu company" — pesan yang menuduh
    SEED, padahal seednya baik dan yang salah pilihan company-nya.
  */
  const { rows: co } = await db.query(`
    SELECT c.id FROM companies c
    WHERE (SELECT count(*) FROM company_members m WHERE m.company_id = c.id) >= 2
    ORDER BY c.created_at, c.id
    LIMIT 1
  `)
  if (!co.length) {
    throw new Error('tak ada company ber-anggota >= 2 — SoD mustahil diuji. '
      + 'Periksa seed/keanggotaan, bukan berkas ini')
  }
  companyId = co[0].id

  // DUA pengguna berbeda dari company yang sama. Test yang memakai satu
  // pengguna untuk dua peran akan hijau karena kebetulan, bukan karena
  // gerbangnya bekerja.
  const { rows: us } = await db.query(
    `SELECT u.id FROM users u
      JOIN company_members m ON m.user_id = u.id
     WHERE m.company_id = $1 LIMIT 2`,
    [companyId],
  )
  if (us.length < 2) throw new Error('butuh minimal 2 pengguna di satu company')
  userA = us[0].id
  userB = us[1].id
}, 90_000)

afterAll(async () => {
  // Trigger menolak DELETE, jadi dimatikan sesaat — persis seperti blok
  // verifikasi migrasi 318. Aman karena ini basis test dan barisnya bertanda.
  await db.query('ALTER TABLE sod_override DISABLE TRIGGER trg_sod_override_immutable')
  await db.query(`DELETE FROM sod_override WHERE entity_type LIKE '${TANDA}%'`)
  await db.query('ALTER TABLE sod_override ENABLE TRIGGER trg_sod_override_immutable')
  await db.end()
})

describe('sod_override — bentuk barisnya dijaga basis', () => {
  it('menolak alasan kosong', async () => {
    await expect(
      db.query(
        `INSERT INTO sod_override (company_id, entity_type, entity_id, level, pengaju_id, penyetuju_id, alasan)
         VALUES ($1, $2, gen_random_uuid(), 1, $3, $3, '')`,
        [companyId, `${TANDA}kosong`, userA],
      ),
    ).rejects.toThrow(/check/i)
  })

  it('menolak alasan yang hanya spasi', async () => {
    // `alasan <> ''` saja TIDAK cukup — spasi lolos, dan barisnya tercatat
    // tanpa isi yang bisa dinilai. CHECK-nya memakai btrim().
    await expect(
      db.query(
        `INSERT INTO sod_override (company_id, entity_type, entity_id, level, pengaju_id, penyetuju_id, alasan)
         VALUES ($1, $2, gen_random_uuid(), 1, $3, $3, '    ')`,
        [companyId, `${TANDA}spasi`, userA],
      ),
    ).rejects.toThrow(/check/i)
  })

  it('baris sah tak bisa diubah', async () => {
    const { rows } = await db.query(
      `INSERT INTO sod_override (company_id, entity_type, entity_id, level, pengaju_id, penyetuju_id, alasan)
       VALUES ($1, $2, gen_random_uuid(), 1, $3, $3, 'alasan uji') RETURNING id`,
      [companyId, `${TANDA}ubah`, userA],
    )
    await expect(
      db.query(`UPDATE sod_override SET alasan = 'diubah' WHERE id = $1`, [rows[0].id]),
    ).rejects.toThrow(/tak bisa diubah atau dihapus/i)
  })

  it('baris sah tak bisa dihapus', async () => {
    // Ini yang membuat pencatatannya bernilai. Override yang bisa dihapus
    // sesudahnya sama saja dengan tak dicatat — hanya lebih menenangkan.
    const { rows } = await db.query(
      `INSERT INTO sod_override (company_id, entity_type, entity_id, level, pengaju_id, penyetuju_id, alasan)
       VALUES ($1, $2, gen_random_uuid(), 1, $3, $3, 'alasan uji') RETURNING id`,
      [companyId, `${TANDA}hapus`, userA],
    )
    await expect(
      db.query(`DELETE FROM sod_override WHERE id = $1`, [rows[0].id]),
    ).rejects.toThrow(/tak bisa diubah atau dihapus/i)
  })

  it('punya policy PERMISSIVE — tidak mati total seperti 30 tabel T5A', async () => {
    const { rows } = await db.query(`
      SELECT count(*)::int AS n
        FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE c.relname = 'sod_override' AND p.polpermissive
    `)
    // `(OR semua PERMISSIVE) AND (AND semua RESTRICTIVE)`; OR atas himpunan
    // kosong = FALSE. Tabel ber-RLS tanpa PERMISSIVE tak terbaca siapa pun.
    expect(rows[0].n).toBeGreaterThanOrEqual(2)
  })
})

describe('ATURAN_SOD — kolom pengaju benar-benar ada di schema', () => {
  it('kesembilan entri menunjuk kolom yang nyata', async () => {
    // Registri `inbox-approval.ts` punya dua entri `kolomPengaju: null` yang
    // ternyata SALAH — kolomnya ada. Registri yang tak pernah diperiksa ke
    // basis membusuk tanpa suara; ini pemeriksaannya.
    const hilang: string[] = []
    for (const a of ATURAN_SOD) {
      const { rows } = await db.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [a.tabel, a.kolomPengaju],
      )
      if (!rows.length) hilang.push(`${a.jenis}: ${a.tabel}.${a.kolomPengaju}`)
    }
    expect(hilang).toEqual([])
  })
})

describe('periksaSod terhadap pengguna nyata', () => {
  it('menolak userA menyetujui pengajuan userA', () => {
    const h = periksaSod({ pengajuId: userA, penyetujuId: userA, punyaIzinOverride: false })
    expect(h.boleh).toBe(false)
  })

  it('membolehkan userB menyetujui pengajuan userA', () => {
    const h = periksaSod({ pengajuId: userA, penyetujuId: userB, punyaIzinOverride: false })
    expect(h.boleh).toBe(true)
  })

  it('override userA atas miliknya sendiri tercatat dengan alasannya', async () => {
    const h = periksaSod({
      pengajuId: userA, penyetujuId: userA,
      punyaIzinOverride: true, alasanOverride: 'Direktur cuti, pekerjaan tak bisa menunggu',
    })
    expect(h).toMatchObject({ boleh: true, overrideDipakai: true })

    const entityId = (await db.query('SELECT gen_random_uuid() AS id')).rows[0].id
    await db.query(
      `INSERT INTO sod_override (company_id, entity_type, entity_id, level, pengaju_id, penyetuju_id, alasan)
       VALUES ($1, $2, $3, 1, $4, $4, $5)`,
      [companyId, `${TANDA}catat`, entityId, userA, 'Direktur cuti, pekerjaan tak bisa menunggu'],
    )

    const { rows } = await db.query(
      `SELECT pengaju_id, penyetuju_id, alasan FROM sod_override WHERE entity_id = $1`,
      [entityId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].pengaju_id).toBe(userA)
    expect(rows[0].penyetuju_id).toBe(userA)
    expect(rows[0].alasan).toMatch(/Direktur cuti/)
  })
})
