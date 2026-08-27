/**
 * NOL HARDCODE — perilaku asisten benar-benar datang dari basis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BUTUH TEST SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-10: *"semuanya bisa dikonfigurasi di UI, gaada yang hardcode
 * di sana"*.
 *
 * Menambah kolom ke basis dan halaman ke UI TIDAK membuktikan itu. Yang
 * membuktikannya: nilai di basis benar-benar mengubah perilaku, dan nilai yang
 * berbahaya benar-benar ditolak. Kolom yang ada tetapi tak dibaca kode adalah
 * bentuk kebohongan yang paling meyakinkan — halamannya bekerja, tombol
 * simpannya hijau, dan tak ada yang berubah.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { bentukKonfigurasi, konfigurasiBawaan } from '../ai-config.js'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

let db: Client
let companyId: string

/**
 * Konfigurasi SEBELUM test — dipulihkan apa adanya di `afterAll`.
 *
 * ── Kenapa bukan sekadar disetel NULL
 *
 * Versi sebelumnya mengembalikan `tool_aktif = NULL` untuk seluruh asisten.
 * Itu bukan "membersihkan jejak test" melainkan MENGHAPUS KONFIGURASI NYATA:
 * kurasi tool per-asisten (staff 15, insight 14 — dipasang 2026-08-16 untuk
 * menghemat ~2.700 token per ronde) lenyap tiap kali berkas test ini jalan.
 *
 * Terjadi DUA KALI dalam satu sesi, dan keduanya baru ketahuan saat diukur
 * ulang — tak ada galat, tak ada test merah. Yang hilang cuma penghematannya.
 *
 * Sekarang: dibaca dulu, dipulihkan persis. Test tetap bebas mengubah apa pun
 * di tengah jalan.
 */
let konfigSebelum: Array<{
  asisten: string
  prompt_sistem: string | null
  maks_ronde: number
  tool_aktif: string[] | null
}> = []

beforeAll(async () => {
  db = await createRlsClient()
  /*
   * Tenant uji WAJIB yang benar-benar punya `ai_provider_config`.
   *
   * Versi sebelumnya `LIMIT 1` tanpa `ORDER BY` dan tanpa syarat config —
   * artinya PT mana yang terpilih ditentukan urutan fisik baris, sesuatu yang
   * berubah begitu ada company baru. Dan itu terjadi 2026-08-16: dua PT anak
   * disemai untuk menguji portofolio grup, keduanya terpilih lebih dulu, dan
   * keduanya belum punya baris config — sehingga `UPDATE ... WHERE company_id`
   * tak mengenai baris apa pun, dan test "basis MENOLAK nilai berbahaya" jadi
   * hijau-karena-buta lalu merah karena tak menemukan baris.
   *
   * Yang rusak BUKAN kode produk (`konfigurasiBawaan()` menangani tenant tanpa
   * config dengan benar), melainkan asumsi test ini. Sekarang syaratnya
   * eksplisit dan urutannya pasti.
   */
  const { rows } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
      AND EXISTS (SELECT 1 FROM ai_provider_config a WHERE a.company_id = c.id)
    ORDER BY c.created_at LIMIT 1
  `)
  if (rows.length === 0) throw new Error('Butuh satu tenant ber-ai_provider_config')
  companyId = rows[0].id

  const { rows: cfg } = await db.query(
    `SELECT asisten, prompt_sistem, maks_ronde, tool_aktif
       FROM ai_provider_config WHERE company_id = $1`,
    [companyId],
  )
  konfigSebelum = cfg
}, 60_000)

afterAll(async () => {
  // Dipulihkan PER ASISTEN dengan nilai aslinya — bukan diseragamkan NULL.
  for (const k of konfigSebelum) {
    await db.query(
      `UPDATE ai_provider_config
          SET prompt_sistem = $2, maks_ronde = $3, tool_aktif = $4::text[]
        WHERE company_id = $1 AND asisten = $5`,
      [companyId, k.prompt_sistem, k.maks_ronde, k.tool_aktif, k.asisten],
    )
  }
  await db.end()
})

describe('kolom perilaku ADA dan bertipe benar', () => {
  it('prompt_sistem, maks_ronde, tool_aktif terpasang', async () => {
    const { rows } = await db.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'ai_provider_config'
        AND column_name IN ('prompt_sistem', 'maks_ronde', 'tool_aktif')
      ORDER BY column_name
    `)
    expect(rows.map((r) => r.column_name)).toEqual(['maks_ronde', 'prompt_sistem', 'tool_aktif'])
    expect(rows.find((r) => r.column_name === 'tool_aktif')?.data_type).toBe('ARRAY')
  })
})

describe('basis MENOLAK nilai yang berbahaya', () => {
  it('maks_ronde 99 ditolak — satu pertanyaan bisa habiskan kuota sebulan', async () => {
    await expect(
      db.query(`UPDATE ai_provider_config SET maks_ronde = 99 WHERE company_id = $1`, [companyId]),
    ).rejects.toThrow()
  })

  it('maks_ronde 0 ditolak — asisten yang tak boleh melangkah tak bisa menjawab', async () => {
    await expect(
      db.query(`UPDATE ai_provider_config SET maks_ronde = 0 WHERE company_id = $1`, [companyId]),
    ).rejects.toThrow()
  })

  it('prompt 9.000 karakter ditolak', async () => {
    // Prompt dikirim ULANG tiap ronde. 8.000 karakter ≈ 2.000 token, dikali 4
    // ronde sudah 8.000 token hanya untuk instruksi.
    await expect(
      db.query(
        `UPDATE ai_provider_config SET prompt_sistem = repeat('x', 9000) WHERE company_id = $1`,
        [companyId],
      ),
    ).rejects.toThrow()
  })

  it('nilai yang WAJAR diterima', async () => {
    await db.query(
      `UPDATE ai_provider_config SET maks_ronde = 6, prompt_sistem = 'Sebut nilai dalam jutaan.'
       WHERE company_id = $1 AND asisten = 'staff'`,
      [companyId],
    )
    const { rows } = await db.query(
      `SELECT maks_ronde, prompt_sistem FROM ai_provider_config
       WHERE company_id = $1 AND asisten = 'staff'`,
      [companyId],
    )
    expect(rows[0].maks_ronde).toBe(6)
    expect(rows[0].prompt_sistem).toContain('jutaan')
  })
})

describe('array kosong ≠ NULL — ini inti "matikan semua tool"', () => {
  it('array kosong tersimpan sebagai array kosong, bukan NULL', async () => {
    await db.query(
      `UPDATE ai_provider_config SET tool_aktif = '{}' WHERE company_id = $1 AND asisten = 'staff'`,
      [companyId],
    )
    const { rows } = await db.query(
      `SELECT tool_aktif FROM ai_provider_config WHERE company_id = $1 AND asisten = 'staff'`,
      [companyId],
    )
    // Kalau ini NULL, tenant yang mematikan semua tool diam-diam mendapat
    // semuanya kembali — kebalikan dari yang ia pilih.
    expect(rows[0].tool_aktif).toEqual([])
    expect(rows[0].tool_aktif).not.toBeNull()
  })

  it('bentukKonfigurasi mempertahankan bedanya', () => {
    const dasar = {
      asisten: 'staff', penyedia: 'anthropic', model: 'claude-haiku-4-5',
      max_token: 1024, aktif: true, batas_bulanan_idr: null, mode_batas: 'peringatkan',
    }

    const kosong = bentukKonfigurasi({ ...dasar, tool_aktif: [] }, 'staff')
    const belum = bentukKonfigurasi({ ...dasar, tool_aktif: null }, 'staff')

    // `|| null` akan mengubah `[]` jadi null di sini — cacat yang tak melempar
    // apa pun dan membalik arti pilihan pengguna.
    expect(kosong.toolAktif).toEqual([])
    expect(belum.toolAktif).toBeNull()
  })

  it('nilai dari basis dipakai, bukan bawaan', () => {
    const k = bentukKonfigurasi(
      {
        asisten: 'staff', penyedia: 'anthropic', model: 'claude-haiku-4-5',
        max_token: 1024, aktif: true, batas_bulanan_idr: null, mode_batas: 'peringatkan',
        prompt_sistem: '  Jawab dalam poin.  ', maks_ronde: 9, tool_aktif: ['daftar_proyek'],
      },
      'staff',
    )
    expect(k.promptSistem).toBe('Jawab dalam poin.')
    expect(k.maksRonde).toBe(9)
    expect(k.toolAktif).toEqual(['daftar_proyek'])
  })

  it('bawaan dipakai saat kolomnya kosong', () => {
    const k = bentukKonfigurasi(
      {
        asisten: 'staff', penyedia: 'anthropic', model: 'claude-haiku-4-5',
        max_token: 1024, aktif: true, batas_bulanan_idr: null, mode_batas: 'peringatkan',
      },
      'staff',
    )
    expect(k.maksRonde).toBe(konfigurasiBawaan('staff').maksRonde)
    expect(k.promptSistem).toBeNull()
  })
})

describe('kode BENAR-BENAR memakainya — bukan kolom hiasan', () => {
  /*
   * Dibaca dari SELURUH jalur AI, bukan satu berkas.
   *
   * Versi pertama test ini hanya membaca `routes/v1/ai-chat.ts`. Saat gerbang
   * diangkat ke `lib/ai-jalankan.ts` supaya kanal WhatsApp memakai aturan yang
   * sama, test ini merah — padahal kodenya masih ada dan masih benar, hanya
   * pindah berkas.
   *
   * Itu kegagalan yang tepat (ia MEMANG menemukan kodenya hilang dari tempat
   * yang diperiksa), tapi memperbaikinya dengan menunjuk satu berkas baru cuma
   * menunda masalah yang sama ke pemindahan berikutnya. Yang dijaga di sini
   * bukan "berkas X memuat baris Y", melainkan "kolom konfigurasi ini benar-
   * benar sampai ke model" — dan itu berlaku di mana pun kodenya tinggal.
   */
  const jalurAi = [
    resolve(SRC, 'routes', 'v1', 'ai-chat.ts'),
    resolve(SRC, 'routes', 'v1', 'wa-webhook.ts'),
    resolve(SRC, 'lib', 'ai-jalankan.ts'),
  ]
  const chat = jalurAi.map((p) => readFileSync(p, 'utf8')).join('\n')

  it('rute chat memakai maksRonde dari config, bukan konstanta', () => {
    expect(chat).toContain('maksRonde: gerbang.konfigurasi.maksRonde')
  })

  it('rute chat menyambung promptSistem tenant', () => {
    // Pemanggilannya jadi multi-baris sejak `sifat_bicara` ikut (migrasi 382/383),
    // jadi yang dicocokkan argumennya — bukan satu baris utuh.
    expect(chat).toMatch(/susunPromptSistem\(\s*gerbang\.konfigurasi\.promptSistem/)
  })

  it('konteks PENANYA benar-benar sampai ke prompt, bukan cuma disusun', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      CACAT YANG DIJAGA — dan kenapa test fungsinya saja tak cukup
      ══════════════════════════════════════════════════════════════════════

      `susunKonteksPenanya` punya testnya sendiri dan hijau. Yang TIDAK diuji
      siapa pun: apakah hasilnya sampai ke prompt.

      Sampai 2026-08-27 ternyata TIDAK. Identitas penanya dibaca dari basis
      tiap percakapan, disusun jadi blok konteks, lalu variabelnya berhenti di
      situ — `susunPromptSistem` dipanggil dengan empat argumen, dan parameter
      kelimanya (`blokPenanya`) selalu jatuh ke bawaan `''`.

      Akibatnya persis yang ditulis di dokumentasi parameter itu sendiri:
      "kasbon minggu ini" tak bisa dijawab karena model tak punya jam, dan
      asisten menyapa pemiliknya dengan "Anda" datar.

      Tak ada galat sepanjang itu — pekerjaan membaca basisnya tetap berjalan,
      hasilnya saja yang dibuang. Ditemukan lewat `no-unused-vars`, bukan lewat
      satu pun test.
    */
    expect(chat).toContain('blokPenanya = susunKonteksPenanya(')
    expect(chat).toMatch(/susunPromptSistem\([\s\S]{0,400}?blokPenanya,/)
  })

  it('prompt tenant DISAMBUNG, tidak menggantikan prompt dasar', () => {
    // Kalau tenant bisa mengganti seluruh prompt, satu kalimat ceroboh
    // menghapus instruksi yang menahan injeksi — dan tak ada gejala sampai
    // seseorang mencobanya.
    //
    // `dasar` = PAGAR_FAKTA + gaya bicara + gaya kanal (dulu `PROMPT_DASAR +
    // gayaKanal`; dipecah 2026-08-14 supaya watak bisa berubah tanpa ikut
    // mencabut pagar). Ia tetap muncul SEBELUM tambahan tenant di array yang
    // di-join, dan urutan itulah yang dijaga di sini.
    expect(chat).toMatch(/function susunPromptSistem[\s\S]*?PAGAR_FAKTA \+ gaya \+ gayaKanal[\s\S]*?\n    dasar,/)
  })

  it('sifat bicara ikut disambungkan ke prompt', () => {
    // Kolom yang tersimpan tapi tak pernah dibaca adalah bentuk kebohongan
    // yang paling meyakinkan — halamannya bekerja, tombolnya hijau, dan tak
    // ada yang berubah.
    expect(chat).toContain('gerbang.konfigurasi.sifatBicara')
  })

  it('toolAktif menyaring katalog', () => {
    expect(chat).toContain('gerbang.konfigurasi.toolAktif')
  })

  it('pilihan tenant TIDAK bisa menambah tool di luar izin pengguna', () => {
    // Kalau bisa, halaman pengaturan jadi jalan pintas ke data yang
    // permission-nya sengaja tak diberikan — naik hak akses lewat kotak
    // centang.
    expect(chat).toMatch(/\[\.\.\.izinPengguna\]\.filter/)
  })

  it('TIDAK ADA saklar "izinkan menulis" di mana pun', async () => {
    // Ember [C] CLAUDE.md §5.3: sifat READ-ONLY tak boleh bisa dikonfigurasi.
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ai_provider_config'
    `)
    const kolom = rows.map((r) => r.column_name as string)
    for (const terlarang of ['boleh_tulis', 'izinkan_tulis', 'allow_write', 'read_only']) {
      expect(kolom, `kolom '${terlarang}' tak boleh ada`).not.toContain(terlarang)
    }
  })
})

describe('saklar mati + retensi per tenant', () => {
  it('ai_pengaturan_tenant punya kedua kolomnya', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ai_pengaturan_tenant' AND column_name IN ('ai_aktif', 'retensi_hari')
      ORDER BY column_name
    `)
    expect(rows.map((r) => r.column_name)).toEqual(['ai_aktif', 'retensi_hari'])
  })

  it('retensi 0 ditolak', async () => {
    await expect(
      db.query(`UPDATE ai_pengaturan_tenant SET retensi_hari = 0 WHERE company_id = $1`, [companyId]),
    ).rejects.toThrow()
  })

  it('retensi NULL sah — "simpan selamanya" harus mungkin', async () => {
    await db.query(
      `UPDATE ai_pengaturan_tenant SET retensi_hari = NULL WHERE company_id = $1`, [companyId])
    const { rows } = await db.query(
      `SELECT retensi_hari FROM ai_pengaturan_tenant WHERE company_id = $1`, [companyId])
    expect(rows[0].retensi_hari).toBeNull()
    await db.query(
      `UPDATE ai_pengaturan_tenant SET retensi_hari = 30 WHERE company_id = $1`, [companyId])
  })
})
