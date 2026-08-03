import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createTestClient, closeTestClient } from '../../../test-utils/test-db'
import { supabaseAuth } from '../../../utils/supabase.js'
import glRoutes from '../gl.js'

// ═════════════════════════════════════════════════════════════════════════════
// GL-1c — API buku besar.
//
// ── Yang diuji di SINI, dan yang tidak
//
// Invarian double-entry (seimbang, immutable, akun satu company) sudah dijaga
// trigger database dan diuji `gl-invarian.test.ts` di level SQL. Mengulangnya
// lewat endpoint tak menambah bukti apa pun.
//
// Yang diuji di sini justru yang TIDAK bisa dijaga trigger:
//
//   · penomoran jurnal — urut, tak menabrak, per tahun
//   · rollback saat baris gagal — jurnal kosong tak boleh tertinggal
//   · buku besar hanya memuat jurnal POSTED (draft & void tak masuk saldo)
//   · trial balance memberi tanda saldo menurut arah normal tipe akun
//   · pesan kegagalan bisa dibaca manusia, bukan bocoran constraint
// ═════════════════════════════════════════════════════════════════════════════

let app: FastifyInstance
let c: Client
let auth: string
let companyId: string
let akunKas: string
let akunBeban: string

const TAG = 'ZZGLAPI'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never,
  )

const req = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } } as never)

async function bersihkan() {
  await c.query(
    `UPDATE journal_entries SET status='void'
      WHERE description LIKE '${TAG}%' AND status='posted'`)
  await c.query(
    `DELETE FROM journal_entry_lines WHERE entry_id IN
       (SELECT id FROM journal_entries WHERE description LIKE '${TAG}%')`)
  await c.query(`DELETE FROM journal_entries WHERE description LIKE '${TAG}%'`)
  await c.query(`DELETE FROM accounts WHERE name LIKE '${TAG}%'`)
}

beforeAll(async () => {
  c = await createTestClient()
  await c.query('SET search_path TO public')
  await c.query('SET client_min_messages TO WARNING')
  await bersihkan()

  const { rows: u } = await c.query(
    `SELECT u.auth_id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.auth_id IS NOT NULL ORDER BY u.created_at LIMIT 1`)
  auth = u[0].auth_id

  const { rows: co } = await c.query('SELECT id FROM companies ORDER BY created_at LIMIT 1')
  companyId = co[0].id

  const { rows: ak } = await c.query(
    `SELECT id, code FROM accounts WHERE company_id=$1 AND code IN ('1111','5110') ORDER BY code`,
    [companyId])
  akunKas = ak.find(a => a.code === '1111').id
  akunBeban = ak.find(a => a.code === '5110').id

  app = Fastify()
  await app.register(glRoutes)
  await app.ready()
  actAs(auth)
}, 120_000)

afterAll(async () => {
  await bersihkan().catch(() => {})
  await app?.close()
  await closeTestClient(c)
})

/** Buat jurnal seimbang lewat API, kembalikan id-nya. */
async function buatJurnal(ket: string, jumlah = 1_000_000): Promise<string> {
  const r = await req('POST', '/api/v1/gl/journal-entries', {
    entry_date: new Date().toISOString().slice(0, 10),
    description: `${TAG} ${ket}`,
    lines: [
      { account_id: akunBeban, debit: jumlah, credit: 0 },
      { account_id: akunKas, debit: 0, credit: jumlah },
    ],
  })
  expect(r.statusCode, `gagal membuat jurnal: ${r.body}`).toBe(201)
  return r.json().data.id
}

describe('GL API · Chart of Accounts', () => {
  it('daftar akun terisi & urut menurut kode', async () => {
    const r = await req('GET', '/api/v1/gl/accounts')
    expect(r.statusCode).toBe(200)
    const kode = r.json().data.map((a: { code: string }) => a.code)
    expect(kode.length).toBeGreaterThanOrEqual(30)
    expect(kode, 'daftar akun tak urut — sulit dibaca sebagai bagan').toEqual([...kode].sort())
  })

  it('akun baru DITOLAK kalau tipenya beda dari induk', async () => {
    // Induk bertipe beda membuat laporan menjumlahkan aset ke dalam beban —
    // angkanya keluar, dan salah. Tak ada constraint DB untuk ini (butuh
    // rekursi), jadi API yang menjaganya.
    const { rows } = await c.query(
      `SELECT id FROM accounts WHERE company_id=$1 AND code='1110'`, [companyId])

    const r = await req('POST', '/api/v1/gl/accounts', {
      code: `${TAG}-1`, name: `${TAG} Salah Tipe`, type: 'expense', parent_id: rows[0].id,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/sama dengan induknya/i)
  })

  it('kode akun ganda ditolak dengan pesan yang bisa dibaca', async () => {
    const r = await req('POST', '/api/v1/gl/accounts', {
      code: '1111', name: `${TAG} Duplikat`, type: 'asset',
    })
    expect(r.statusCode).toBe(400)
    expect(
      r.json().error,
      'pesan bocoran constraint — pengguna tak paham "accounts_code_unik_per_company"',
    ).toMatch(/sudah dipakai/i)
  })
})

describe('GL API · penomoran jurnal', () => {
  it('nomor urut & tak menabrak', async () => {
    const a = await buatJurnal('nomor A')
    const b = await buatJurnal('nomor B')

    const { rows } = await c.query(
      'SELECT id, entry_number FROM journal_entries WHERE id = ANY($1)', [[a, b]])
    const nomor = rows.map(r => r.entry_number)

    expect(new Set(nomor).size, 'dua jurnal bernomor sama').toBe(2)
    for (const n of nomor) expect(n).toMatch(/^JV-\d{4}-\d{4}$/)
  })

  it('nomor dihitung dari yang TERTINGGI, bukan dari jumlah baris', async () => {
    // Kalau dihitung dari `count(*)`, menghapus satu jurnal membuat nomor
    // berikutnya menabrak nomor yang sudah dipakai — dan `UNIQUE` menolaknya,
    // sehingga pembuatan jurnal berhenti total sampai ada yang menyelidiki.
    const j = await buatJurnal('akan dihapus')
    await c.query('DELETE FROM journal_entry_lines WHERE entry_id=$1', [j])
    await c.query('DELETE FROM journal_entries WHERE id=$1', [j])

    const r = await req('POST', '/api/v1/gl/journal-entries', {
      entry_date: new Date().toISOString().slice(0, 10),
      description: `${TAG} sesudah hapus`,
      lines: [
        { account_id: akunBeban, debit: 500, credit: 0 },
        { account_id: akunKas, debit: 0, credit: 500 },
      ],
    })
    expect(r.statusCode, `nomor menabrak sesudah penghapusan: ${r.body}`).toBe(201)
  })
})

describe('GL API · rollback jurnal kosong', () => {
  it('baris yang gagal TIDAK meninggalkan jurnal kosong', async () => {
    // Baris dengan debit DAN kredit sekaligus ditolak constraint. Kepala
    // jurnal sudah tersimpan saat itu — kalau tak dibersihkan, ia tampil di
    // daftar sebagai jurnal sah yang isinya kosong.
    const sebelum = await c.query(
      `SELECT count(*)::int n FROM journal_entries WHERE description LIKE '${TAG}%'`)

    const r = await req('POST', '/api/v1/gl/journal-entries', {
      entry_date: new Date().toISOString().slice(0, 10),
      description: `${TAG} baris rusak`,
      lines: [{ account_id: akunKas, debit: 100, credit: 100 }],
    })
    expect(r.statusCode).toBe(400)

    const sesudah = await c.query(
      `SELECT count(*)::int n FROM journal_entries WHERE description LIKE '${TAG}%'`)
    expect(
      sesudah.rows[0].n,
      'jurnal kosong tertinggal di daftar — terlihat sah padahal tak berisi apa pun',
    ).toBe(sebelum.rows[0].n)
  })
})

describe('GL API · posting & pembatalan', () => {
  it('posting jurnal seimbang berhasil', async () => {
    const j = await buatJurnal('posting sah')
    const r = await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().data.status).toBe('posted')
  })

  it('posting jurnal TAK seimbang ditolak dengan pesan berbahasa manusia', async () => {
    const r0 = await req('POST', '/api/v1/gl/journal-entries', {
      entry_date: new Date().toISOString().slice(0, 10),
      description: `${TAG} timpang`,
      lines: [
        { account_id: akunBeban, debit: 1000, credit: 0 },
        { account_id: akunKas, debit: 0, credit: 900 },
      ],
    })
    const j = r0.json().data.id

    const r = await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak seimbang/i)
  })

  it('posting jurnal yang SUDAH posted ditolak', async () => {
    const j = await buatJurnal('posting ganda')
    await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)

    const r = await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)
    expect(r.statusCode, 'posting ganda lolos — status berubah dua kali').toBe(404)
  })

  it('pembatalan WAJIB menyebut alasan', async () => {
    // Pembatalan tanpa alasan tak bisa ditelusuri — dan justru pembatalan
    // yang paling perlu ditelusuri.
    const j = await buatJurnal('batal tanpa alasan')
    await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)

    const r = await req('PATCH', `/api/v1/gl/journal-entries/${j}/void`, {})
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/alasan/i)
  })

  it('pembatalan dengan alasan tercatat di notes', async () => {
    const j = await buatJurnal('batal sah')
    await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)

    const r = await req('PATCH', `/api/v1/gl/journal-entries/${j}/void`,
      { alasan: 'salah akun' })
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await c.query('SELECT status, notes FROM journal_entries WHERE id=$1', [j])
    expect(rows[0].status).toBe('void')
    expect(rows[0].notes, 'alasan pembatalan tak tercatat').toMatch(/salah akun/)
  })
})

describe('GL API · buku besar', () => {
  it('hanya memuat jurnal POSTED', async () => {
    const draft = await buatJurnal('draft tak masuk buku besar', 777_777)
    const posted = await buatJurnal('posted masuk buku besar', 555_555)
    await req('PATCH', `/api/v1/gl/journal-entries/${posted}/post`)

    const r = await req('GET', '/api/v1/gl/ledger')
    expect(r.statusCode).toBe(200)
    const ids = r.json().data.map((b: { entry_id: string }) => b.entry_id)

    expect(ids, 'jurnal posted tak muncul di buku besar').toContain(posted)
    expect(
      ids,
      'jurnal DRAFT muncul di buku besar — saldo tak akan cocok dengan neraca',
    ).not.toContain(draft)
  })

  it('jurnal yang DIBATALKAN keluar dari buku besar', async () => {
    const j = await buatJurnal('dibatalkan', 333_333)
    await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)
    await req('PATCH', `/api/v1/gl/journal-entries/${j}/void`, { alasan: 'uji' })

    const r = await req('GET', '/api/v1/gl/ledger')
    const ids = r.json().data.map((b: { entry_id: string }) => b.entry_id)
    expect(ids, 'jurnal void masih terhitung — saldo menggelembung').not.toContain(j)
  })

  it('total debit = total kredit, selisih NOL', async () => {
    // Kalau selisih tak nol, invarian database bocor. Angka ini ditampilkan
    // apa adanya di `meta` supaya kebocorannya terlihat, bukan disamarkan.
    const j = await buatJurnal('seimbang buku besar', 250_000)
    await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)

    const r = await req('GET', '/api/v1/gl/ledger')
    const m = r.json().meta
    expect(m.total_debit).toBe(m.total_credit)
    expect(m.selisih, 'buku besar tak seimbang — invarian database bocor').toBe(0)
  })

  it('saring per akun bekerja', async () => {
    const j = await buatJurnal('saring akun', 111_111)
    await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)

    const r = await req('GET', `/api/v1/gl/ledger?account_id=${akunKas}`)
    const semua = r.json().data as Array<{ account_id: string }>
    expect(semua.length).toBeGreaterThan(0)
    expect(
      semua.every(b => b.account_id === akunKas),
      'saringan akun bocor — baris akun lain ikut muncul',
    ).toBe(true)
  })
})

describe('GL API · trial balance', () => {
  it('saldo bertanda menurut arah normal tipe akun', async () => {
    // Aset & beban naik di DEBIT; liabilitas, ekuitas, pendapatan naik di
    // KREDIT. Tanpa penyesuaian tanda, neraca menampilkan liabilitas sebagai
    // angka negatif — benar secara aritmetika, tak terbaca oleh akuntan.
    const j = await buatJurnal('trial balance', 400_000)
    await req('PATCH', `/api/v1/gl/journal-entries/${j}/post`)

    // Jurnal kedua menyentuh akun ber-arah KREDIT (utang supplier). Tanpa ini
    // seluruh fixture cuma berisi aset & beban — keduanya berarah debit,
    // sehingga rumus polos `debit − kredit` kebetulan benar dan penyesuaian
    // tanda tak pernah teruji.
    const { rows: au } = await c.query(
      `SELECT id FROM accounts WHERE company_id=$1 AND code='2110'`, [companyId])
    const r2 = await req('POST', '/api/v1/gl/journal-entries', {
      entry_date: new Date().toISOString().slice(0, 10),
      description: `${TAG} utang supplier`,
      lines: [
        { account_id: akunBeban, debit: 150_000, credit: 0 },
        { account_id: au[0].id, debit: 0, credit: 150_000 },
      ],
    })
    await req('PATCH', `/api/v1/gl/journal-entries/${r2.json().data.id}/post`)

    const r = await req('GET', '/api/v1/gl/trial-balance')
    expect(r.statusCode).toBe(200)
    const rows = r.json().data as Array<{ code: string; type: string; saldo: number; debit: number; credit: number }>

    const beban = rows.find(x => x.code === '5110')
    expect(beban, 'akun beban tak muncul di trial balance').toBeTruthy()
    expect(beban!.saldo, 'beban bersaldo negatif — arah normal terbalik').toBeGreaterThan(0)

    // ⚠️ Akun beban SAJA tak cukup: arah normalnya (debit − kredit) kebetulan
    // sama dengan rumus polos, jadi menghapus penyesuaian tanda TIDAK
    // memerahkan test. Ketahuan dari uji mutasi, bukan dari review.
    //
    // Akun ASET yang dikredit (kas berkurang) memberi saldo negatif dengan
    // rumus polos maupun benar — yang membedakan akun bertipe KREDIT-normal.
    const kas = rows.find(x => x.code === '1111')
    expect(kas, 'akun kas tak muncul di trial balance').toBeTruthy()
    expect(kas!.credit, 'kas tak pernah dikredit — fixture tak menguji apa pun').toBeGreaterThan(0)
    expect(
      kas!.saldo,
      'saldo kas ≠ debit − kredit; arah normal aset salah',
    ).toBe(kas!.debit - kas!.credit)

    // Liabilitas: naik di KREDIT. Rumus polos `debit − kredit` menghasilkan
    // angka NEGATIF — benar secara aritmetika, tak terbaca oleh akuntan.
    const utang = rows.find(x => x.code === '2110')
    expect(utang, 'akun utang tak muncul di trial balance').toBeTruthy()
    expect(
      utang!.saldo,
      'utang bersaldo negatif — arah normal liabilitas terbalik; neraca ' +
        'menampilkan kewajiban sebagai angka minus',
    ).toBeGreaterThan(0)
    expect(utang!.saldo).toBe(utang!.credit - utang!.debit)

    const m = r.json().meta
    expect(m.selisih, 'trial balance tak seimbang').toBe(0)
  })
})
