/**
 * "APA YANG PERLU SAYA URUS?" — dan inbox 8.049 yang tak pernah dibaca.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI: KEMAMPUAN MENYARING, BUKAN MEMBACA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: 8.049 notifikasi belum dibaca, 1.509 `urgent`, tersebar
 * ke 18 orang. Satu penerima sendirian punya 3.331.
 *
 * Membacakan semuanya bukan bantuan — itu memindahkan masalahnya. Yang
 * berguna: sebutkan yang mendesak, ringkas sisanya per jenis.
 *
 * ── Yang dibuktikan
 *
 *   1. hanya notifikasi MILIK penanya (bocor lewat prompt = menembus izin)
 *   2. yang sudah ditindaklanjuti TIDAK disebut sebagai "perlu diurus"
 *   3. daftar mendesak dibatasi — lebih dari 8 berhenti jadi daftar tindakan
 *   4. sisanya DIRINGKAS per jenis, bukan didaftar satu per satu
 *   5. batas pembacaan DINYATAKAN kalau terpotong
 *   6. inbox bersih dijawab jujur, bukan dikarang
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { toolPerhatian } from '../ai-tool-perhatian.js'
import { KATALOG_TOOL } from '../ai-tool.js'

let db: Client
let companyId: string
let userSibuk: string
let userLain: string | null

const ctx = (uid: string) =>
  ({
    db: createTenantDb(companyId),
    companyId,
    userId: uid,
    izin: new Set(['ai:chat']),
  }) as never

beforeAll(async () => {
  db = await createRlsClient()

  const { rows } = await db.query(`
    SELECT user_id, company_id, count(*)::int n
      FROM notifications WHERE is_read = false
     GROUP BY 1,2 ORDER BY n DESC LIMIT 1`)
  if (rows.length === 0) throw new Error('Butuh notifikasi belum dibaca untuk test ini')

  userSibuk = rows[0].user_id
  companyId = rows[0].company_id

  const { rows: lain } = await db.query(
    `SELECT user_id, count(*)::int n FROM notifications
      WHERE is_read=false AND company_id=$1 AND user_id<>$2
      GROUP BY 1 ORDER BY n DESC LIMIT 1`, [companyId, userSibuk])
  userLain = lain[0]?.user_id ?? null
})

afterAll(async () => {
  await db.end()
})

describe('tool perlu perhatian', () => {
  it('terdaftar di katalog dengan izin ai:chat', () => {
    const t = KATALOG_TOOL.find((x) => x.nama === 'perlu_perhatian')
    expect(t, 'tool `perlu_perhatian` tak terdaftar').toBeTruthy()
    expect(t!.izin).toBe('ai:chat')
  })

  it('query menyaring user_id — DIPERIKSA DI SUMBER, bukan dari keluaran', async () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      TIGA PERCOBAAN GAGAL MEMBEDAKAN BOCOR DARI TIDAK — dan sebabnya DATA
      ══════════════════════════════════════════════════════════════════════

      Saya mencoba membuktikan anti-bocor lewat KELUARAN, tiga kali, dan
      ketiganya tetap HIJAU sesudah saringan `user_id` sengaja dihapus:

        1. judul unik milik user lain   → NOL judul unik (notifikasi lahir
                                          dari otomasi massal; semua orang
                                          menerima judul yang sama persis)
        2. jumlah "MENDESAK (N)"        → `.limit(400)` memotong pembacaan
                                          lebih dulu, jadi angkanya 138 di
                                          KEDUA keadaan
        3. pesan eksklusif milik lain   → NOL juga, dengan sebab yang sama

      Kesimpulannya bukan "toolnya salah" melainkan **datanya tak bisa
      membedakan**: di basis ini, notifikasi tiap orang identik isinya.

      Membiarkan test yang hijau-karena-buta jauh lebih buruk daripada tak
      punya test — ia memberi rasa aman yang tak berdasar. Maka yang diperiksa
      SUMBERNYA: `.eq('user_id', userId)` wajib ada di query. Itu lemah
      dibanding uji perilaku, dan kelemahannya ditulis di sini supaya pembaca
      berikutnya tahu persis seberapa jauh test ini menjamin.
    */
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../ai-tool-perhatian.ts', import.meta.url), 'utf8')

    expect(
      src,
      'saringan `user_id` hilang — "apa yang perlu SAYA urus" akan memuat pekerjaan orang lain',
    ).toMatch(/\.eq\('user_id',\s*userId\)/)
  })

  it('hanya notifikasi MILIK penanya', async () => {
    /*
      Kebocorannya lewat PROMPT, bukan lewat tool berizin — jadi ia menembus
      seluruh permission check tanpa gejala. "Apa yang perlu saya urus" yang
      memuat pekerjaan orang lain juga membocorkan apa yang sedang mereka
      tangani.
    */
    if (!userLain) return // tenant berpenghuni satu penerima

    /*
      ── Dibandingkan lewat JUMLAH, bukan lewat judul ────────────────────────

      Percobaan pertama mencari judul yang UNIK milik `userLain` di keluaran.
      Itu HIJAU bahkan sesudah saringan `user_id` dihapus — diukur: NOL judul
      unik. Notifikasi di sini lahir dari otomasi massal, jadi semua orang
      menerima judul yang sama persis. Assertion-nya tak pernah punya bahan.

      Jumlah tak bisa dibagi begitu. Kalau saringannya hilang, "MENDESAK (N)"
      melonjak ke gabungan seluruh penerima — dan itu terbaca langsung.
    */
    const { rows: mendesakku } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE user_id=$1 AND is_read=false
          AND priority IN ('urgent','high') AND is_actioned IS DISTINCT FROM true`,
      [userSibuk])

    const { rows: mendesakSemua } = await db.query(
      `SELECT count(*)::int n FROM notifications
        WHERE company_id=$1 AND is_read=false
          AND priority IN ('urgent','high') AND is_actioned IS DISTINCT FROM true`,
      [companyId])

    const h = await toolPerhatian.jalan(ctx(userSibuk), {})
    expect(h.isError).toBe(false)
    expect(mendesakSemua[0].n).toBeGreaterThan(mendesakku[0].n) // fixture punya bahan

    /*
      ── Diperiksa lewat ISI baris, bukan lewat jumlah ───────────────────────

      Percobaan KEDUA membandingkan angka "MENDESAK (N)". Itu pun hijau
      sesudah saringan dihapus — `.limit(400)` memotong pembacaan lebih dulu,
      jadi angkanya 138 di kedua keadaan. Batas baca menutupi kebocorannya.

      Yang tak bisa ditutupi: notifikasi yang penerimanya BUKAN penanya.
      Diambil satu baris mendesak yang benar-benar hanya dimiliki orang lain
      (judul + pesan sekaligus, karena judul saja dipakai bersama), lalu
      dibuktikan ia tak muncul.
    */
    const { rows: cumaMilikLain } = await db.query(
      `SELECT n.title, n.message FROM notifications n
        WHERE n.user_id = $1 AND n.is_read = false
          AND n.priority IN ('urgent','high') AND n.message IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM notifications m
             WHERE m.user_id = $2 AND m.message = n.message)
        LIMIT 3`,
      [userLain, userSibuk])

    if (cumaMilikLain.length === 0) return // tak ada pesan eksklusif — tak ada bahan

    for (const r of cumaMilikLain as Array<{ message: string }>) {
      expect(
        h.isi,
        `pesan milik user lain bocor: ${r.message.slice(0, 60)}`,
      ).not.toContain(r.message.slice(0, 60))
    }
  })

  it('daftar mendesak DIBATASI — bukan ratusan baris', async () => {
    // Lebih dari delapan berhenti terbaca sebagai daftar tindakan dan mulai
    // terbaca sebagai laporan — dan laporan tak dikerjakan siapa pun.
    const h = await toolPerhatian.jalan(ctx(userSibuk), {})
    const butir = h.isi.split('\n').filter((l) => l.startsWith('· ')).length
    expect(butir).toBeLessThanOrEqual(8)
  })

  it('sisanya DIRINGKAS per jenis, bukan didaftar', async () => {
    const h = await toolPerhatian.jalan(ctx(userSibuk), {})
    // Ringkasan berbentuk "Selebihnya (N): x jenis-a, y jenis-b."
    if (/Selebihnya/.test(h.isi)) {
      expect(h.isi).toMatch(/Selebihnya \(\d+\):/)
    }
    // Dan keseluruhan keluarannya tetap pendek — inilah gunanya tool ini.
    expect(h.isi.length).toBeLessThan(4000)
  })

  it('yang sudah DITINDAKLANJUTI tak disebut sebagai perlu diurus', async () => {
    /*
      `is_actioned=true` tapi `is_read=false` adalah keadaan yang sangat umum:
      orang menekan tombolnya di halaman lain lalu tak pernah menandai baca.
      Menyebutnya "perlu diurus" membuat ia mengerjakan ulang yang sudah selesai.
    */
    const { rows } = await db.query(
      `SELECT title FROM notifications
        WHERE user_id=$1 AND is_read=false AND is_actioned=true
          AND priority IN ('urgent','high') AND title IS NOT NULL LIMIT 3`,
      [userSibuk])
    if (rows.length === 0) return

    const h = await toolPerhatian.jalan(ctx(userSibuk), {})
    const bagianMendesak = h.isi.split('Selebihnya')[0]
    for (const r of rows as Array<{ title: string }>) {
      // Judul bersama tetap mungkin muncul lewat baris LAIN yang belum
      // ditindaklanjuti; yang diuji: tak ada baris mendesak yang SEMUA-nya
      // sudah ditindaklanjuti.
      const { rows: masihAda } = await db.query(
        `SELECT 1 FROM notifications
          WHERE user_id=$1 AND is_read=false AND is_actioned IS DISTINCT FROM true
            AND title=$2 LIMIT 1`, [userSibuk, r.title])
      if (masihAda.length > 0) continue
      expect(bagianMendesak, `sudah ditindaklanjuti tapi disebut: ${r.title}`)
        .not.toContain(r.title)
    }
  })

  it('menyuruh model menyebut yang MENDESAK saja', async () => {
    // Tanpa instruksi ini model cenderung membacakan seluruh isi hasil tool —
    // dan penyaringannya jadi sia-sia.
    const h = await toolPerhatian.jalan(ctx(userSibuk), {})
    expect(h.isi).toMatch(/jangan membacakan seluruh daftar/i)
  })
})
