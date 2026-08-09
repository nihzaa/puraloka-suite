/**
 * RATE LIMIT PER USER — bukan per IP (kriteria TJS-B1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PER IP SALAH ARAH UNTUK ERP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bawaan `@fastify/rate-limit` memakai alamat IP. Untuk aplikasi konsumen itu
 * masuk akal; untuk ERP tidak.
 *
 * Satu kantor konstruksi duduk di belakang SATU IP. Lima orang yang bertanya
 * bersamaan akan saling memblokir — dan yang kena bukan yang boros, melainkan
 * yang kebetulan menekan Enter paling akhir. Gejalanya "asistennya sering
 * error", bukan "kuota saya habis", jadi tak ada yang mengubah perilakunya.
 *
 * Sebaliknya, satu orang yang membuka lima tab tetap satu kuota — dan itu
 * memang yang ingin dibatasi.
 *
 * ── Yang diuji: KUNCINYA, bukan penghitungnya
 *
 * `@fastify/rate-limit` sudah punya test-nya sendiri untuk penghitungan.
 * Yang bisa salah di sisi kita adalah kunci: memakai IP, memakai companyId
 * (satu tenant jadi satu kuota — lebih buruk lagi), atau lupa memasangnya
 * sama sekali. Ketiganya lolos "status 200".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const RUTE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Ambil blok `rateLimit: { … }` dari sebuah berkas rute. */
function blokRateLimit(berkas: string): string {
  const src = readFileSync(resolve(RUTE, berkas), 'utf8')
  const i = src.indexOf('rateLimit: {')
  if (i === -1) return ''
  return src.slice(i, i + 400)
}

describe('rute AI berbayar memakai kunci PER USER', () => {
  for (const berkas of ['ai-chat.ts', 'ai.ts']) {
    it(`${berkas} memasang keyGenerator`, () => {
      const blok = blokRateLimit(berkas)
      // Tanpa `keyGenerator`, pustakanya diam-diam memakai IP — dan tak ada
      // galat yang menandainya.
      expect(blok, `${berkas} tak punya rateLimit`).not.toBe('')
      expect(blok).toContain('keyGenerator')
    })

    it(`${berkas} memakai currentUser.id, bukan IP atau companyId`, () => {
      const blok = blokRateLimit(berkas)
      expect(blok).toMatch(/currentUser\?\.id/)
      // companyId akan membuat SATU tenant berbagi satu kuota — lebih buruk
      // daripada per IP, karena seluruh perusahaan saling memblokir.
      expect(blok).not.toMatch(/keyGenerator[\s\S]{0,120}companyId/)
    })

    it(`${berkas} punya jatuhan ke IP untuk permintaan tanpa user`, () => {
      // Permintaan tanpa user seharusnya sudah 401 di preHandler. Jatuhannya
      // tetap ada supaya `keyGenerator` tak pernah mengembalikan undefined —
      // kunci undefined membuat SEMUA permintaan berbagi satu ember.
      expect(blokRateLimit(berkas)).toMatch(/\?\?\s*request\.ip/)
    })
  }
})

describe('batasnya masuk akal', () => {
  it('chat 30/menit, insight 20/menit', () => {
    // Angka yang terlalu longgar membuat rate limit jadi hiasan; yang terlalu
    // ketat membuat percakapan wajar terputus di tengah.
    expect(blokRateLimit('ai-chat.ts')).toMatch(/max:\s*30/)
    expect(blokRateLimit('ai.ts')).toMatch(/max:\s*20/)
  })

  it('jendelanya per menit, bukan per jam', () => {
    // Jendela satu jam berarti pengguna yang kena batas menunggu sejam —
    // dan sejam adalah waktu yang cukup untuk menyerah memakai fiturnya.
    for (const berkas of ['ai-chat.ts', 'ai.ts']) {
      expect(blokRateLimit(berkas)).toMatch(/timeWindow:\s*'1 minute'/)
    }
  })
})

describe('rate limit BUKAN pengganti gerbang biaya', () => {
  it('rute chat tetap memanggil periksaGerbangAi', () => {
    // Keduanya menjawab pertanyaan berbeda: rate limit menahan pembakaran
    // dalam satu jam, gerbang biaya menahan tagihan bulanan. Menghapus salah
    // satunya karena "yang lain sudah ada" meninggalkan lubang di sisi lain.
    const src = readFileSync(resolve(RUTE, 'ai-chat.ts'), 'utf8')
    expect(src).toContain('periksaGerbangAi')
  })
})
