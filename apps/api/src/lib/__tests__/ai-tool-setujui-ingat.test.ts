/**
 * TOOL PERSETUJUAN & INGATAN — jalur keputusan, dan ingatan lintas percakapan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG PALING MAHAL KALAU SALAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Persetujuan atas dokumen yang SALAH.** Rute `preview-setujui` menuntut
 *    `entity_id` berupa UUID, dan model AKAN mengarangnya. Karena itu tool
 *    menerima NOMOR URUT, lalu meresolusinya sendiri lewat `db` milik tenant.
 *    Kalau resolusinya bergeser, orang menyetujui kasbon yang bukan ia baca.
 *
 * 2. **Ingatan yang membocorkan obrolan ORANG LAIN.** `ai_pesan` tak punya
 *    `user_id`; kepemilikannya lewat `ai_percakapan.user_id`. Query yang lupa
 *    menyaringnya akan mengembalikan obrolan rekan sekantor — dan bocornya
 *    lewat PROMPT, menembus seluruh permission check, karena bukan lewat tool
 *    yang berizin.
 *
 * ── Yang dibuktikan
 *
 *   1. daftar menunggu diurut TERLAMA dulu (bukan terbesar)
 *   2. `siapkan_persetujuan` nomor N menunjuk dokumen ke-N di daftar yang SAMA
 *   3. nomor di luar jangkauan ditolak, bukan menunjuk dokumen acak
 *   4. hasilnya menyatakan BELUM DISETUJUI
 *   5. ingatan hanya membaca percakapan MILIK penanya
 *   6. kata kunci yang tak ada TIDAK dijawab karangan
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolMenungguSaya, toolSiapkanSetujui } from '../ai-tool-setujui.js'
import { toolIngatPercakapan } from '../ai-tool-ingat.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string
let userA: string
let userB: string | null

const ctxSetujui = () =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: userA,
    izin: new Set(['ai:setujui']),
  }) as never

const ctxIngat = (uid: string) =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: uid,
    izin: new Set(['ai:chat']),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()

  // Tenant yang punya percakapan berpesan — supaya test ingatan tak kosong.
  const { rows } = await db.query(`
    SELECT p.company_id, p.user_id, count(*)::int n
      FROM ai_percakapan p JOIN ai_pesan m ON m.percakapan_id = p.id
     GROUP BY 1,2 ORDER BY n DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh satu percakapan berpesan untuk test ini')

  companyId = rows[0].company_id
  userA = rows[0].user_id

  const { rows: lain } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id=$1 AND user_id<>$2 LIMIT 1`,
    [companyId, userA])
  userB = lain[0]?.user_id ?? null
})

afterAll(async () => {
  await db.end()
})

describe('tool persetujuan', () => {
  it('keduanya terdaftar dengan izin ai:setujui', () => {
    // Izin TERPISAH dari `ai:chat`: memberi seseorang akses asisten tak boleh
    // diam-diam memberinya jalan menyetujui uang.
    for (const nama of ['menunggu_persetujuan_saya', 'siapkan_persetujuan']) {
      const t = KATALOG_TOOL.find((x) => x.nama === nama)
      expect(t, `tool '${nama}' tak terdaftar di katalog`).toBeTruthy()
      expect(t!.izin).toBe('ai:setujui')
    }
  })

  it('daftar menunggu diurut TERLAMA dulu', async () => {
    /*
      Bukan terbesar dulu. Yang paling merugikan bukan nominal terbesar
      melainkan yang paling lama menggantung: mandor tak bisa bekerja, dan
      yang menunggu tak tahu kepada siapa bertanya.
    */
    const h = await toolMenungguSaya.jalan(ctxSetujui(), {})
    expect(h.isError).toBe(false)

    const tanggal = [...h.isi.matchAll(/diajukan (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1])
    if (tanggal.length >= 2) {
      const urut = [...tanggal].sort()
      expect(tanggal, 'daftar tak urut terlama-dulu').toEqual(urut)
    }
  })

  it('nomor N menunjuk dokumen ke-N di daftar yang SAMA', async () => {
    /*
      Inti keamanannya. Kalau `siapkan_persetujuan` menyusun daftarnya sendiri
      dengan urutan berbeda, orang menyetujui dokumen yang BUKAN ia baca — dan
      ringkasan yang ditampilkan tetap terlihat masuk akal.
    */
    const daftar = await toolMenungguSaya.jalan(ctxSetujui(), {})
    const baris1 = daftar.isi.split('\n').find((l) => /^1\. \[/.test(l))
    if (!baris1) return // tenant tanpa antrean — tak ada yang bisa diuji

    const h = await toolSiapkanSetujui.jalan(ctxSetujui(), { nomor: 1 })
    expect(h.isError).toBe(false)

    // Judul yang sama harus muncul di keduanya.
    const judul = baris1.replace(/^1\. \[[^\]]+\]\s*/, '').split(' — ')[0].trim()
    expect(h.isi).toContain(judul)

    // Dan ia membawa penunjuk yang dipakai rute — bukan nomor urut.
    expect(h.isi).toMatch(/JENIS=\w+ ENTITY_ID=[0-9a-f-]{36}/)
  })

  it('menyatakan BELUM DISETUJUI', async () => {
    // Model yang menerima hasil tool tanpa penegasan cenderung melaporkan
    // "sudah saya setujui" — dan yang percaya lalu tak menekan tombolnya
    // mengira kasbonnya jalan, padahal mandornya masih menunggu.
    const h = await toolSiapkanSetujui.jalan(ctxSetujui(), { nomor: 1 })
    if (h.isError) return
    expect(h.isi).toMatch(/BELUM DISETUJUI/i)
  })

  it('nomor di luar jangkauan DITOLAK, bukan menunjuk acak', async () => {
    const h = await toolSiapkanSetujui.jalan(ctxSetujui(), { nomor: 99_999 })
    expect(h.isError).toBe(true)
    expect(h.isi).not.toMatch(/ENTITY_ID=/)
  })

  it('nomor bukan-angka ditolak', async () => {
    for (const n of [0, -3, 'dua' as unknown as number]) {
      const h = await toolSiapkanSetujui.jalan(ctxSetujui(), { nomor: n })
      expect(h.isError).toBe(true)
    }
  })
})

describe('tool ingatan lintas percakapan', () => {
  it('terdaftar dengan izin ai:chat', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'ingat_percakapan')
    expect(t, 'tool `ingat_percakapan` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('ai:chat')
  })

  it('tanpa kata kunci → daftar percakapan, bukan seluruh isinya', async () => {
    // Memuat seluruh isi berarti biaya naik kuadratik tiap ronde.
    const h = await toolIngatPercakapan.jalan(ctxIngat(userA), {})
    expect(h.isError).toBe(false)
    expect(h.isi).toContain('<data sumber="ingatan">')
    expect(h.isi).toMatch(/percakapan tersimpan/i)
  })

  it('hanya membaca percakapan MILIK penanya', async () => {
    /*
      `ai_pesan` tak punya `user_id` — kepemilikannya lewat
      `ai_percakapan.user_id`. Query yang lupa menyaringnya mengembalikan
      obrolan rekan sekantor, dan bocornya lewat PROMPT: menembus seluruh
      permission check karena bukan lewat tool berizin.
    */
    if (!userB) return // tenant berpenghuni satu orang

    const { rows: milikA } = await db.query(
      `SELECT count(*)::int n FROM ai_percakapan WHERE user_id=$1`, [userA])
    const { rows: milikB } = await db.query(
      `SELECT count(*)::int n FROM ai_percakapan WHERE user_id=$1`, [userB])

    const hA = await toolIngatPercakapan.jalan(ctxIngat(userA), {})
    const angkaA = Number(hA.isi.match(/(\d+) percakapan tersimpan/)?.[1] ?? -1)

    // Yang dilaporkan ke A adalah jumlah milik A — bukan A + B.
    if (angkaA >= 0 && milikB[0].n > 0) {
      expect(angkaA).toBe(milikA[0].n)
      expect(angkaA).toBeLessThan(milikA[0].n + milikB[0].n)
    }
  })

  it('kata kunci yang TAK ADA tidak dijawab karangan', async () => {
    const h = await toolIngatPercakapan.jalan(ctxIngat(userA), {
      kata_kunci: 'zzxqv-tak-pernah-disebut-sama-sekali',
    })
    expect(h.isError).toBe(false)
    expect(h.isi).toMatch(/tak ada percakapan/i)
    // Instruksi eksplisit supaya model tak mengisi kekosongan dengan tebakan.
    expect(h.isi).toMatch(/jangan mengarang/i)
  })
})
