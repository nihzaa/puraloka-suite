/**
 * M-1 — jatuhan `.env` dan batas multi-tenantnya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI DIUJI, DAN KENAPA BUKAN SEKADAR SOAL KERAPIAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `process.env` SATU untuk seluruh proses. Tenant yang belum mengisi kuncinya
 * sendiri akan memakai kunci milik server:
 *
 *   · ANTHROPIC_API_KEY → tagihan token jatuh ke pemilik instalasi
 *   · WA_*              → tenant B mengirim WhatsApp lewat NOMOR TENANT A
 *
 * Yang kedua tak bisa ditarik kembali: pesannya sudah sampai ke ponsel orang,
 * atas nama perusahaan yang salah.
 *
 * Jatuhan itu TETAP ADA — ia jaring pengaman satu-instalasi, dan mencabutnya
 * akan mematikan `/ai/insight` yang jalan hari ini. Yang diuji di sini: ia
 * BISA DIMATIKAN, dan saat dimatikan ia benar-benar mati (bukan cuma
 * dilaporkan mati).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { sumberKredensial, metaKredensial, KATALOG_KREDENSIAL } from '../kredensial.js'

const SEMULA = { ...process.env }

afterEach(() => {
  process.env = { ...SEMULA }
})

describe('saklar KREDENSIAL_TANPA_JATUHAN_ENV', () => {
  it('tanpa saklar: env yang terisi dilaporkan sebagai sumber', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-uji-jangan-dipakai'
    delete process.env.KREDENSIAL_TANPA_JATUHAN_ENV
    expect(sumberKredensial(false, 'ANTHROPIC_API_KEY')).toBe('env')
  })

  it('dengan saklar: env DIABAIKAN, sumbernya "tidak-ada"', () => {
    /*
     * Yang diuji bukan cuma nilainya — melainkan bahwa UI TAK BOLEH berkata
     * "dari env server" untuk nilai yang tak terpakai. Layar yang begitu
     * membuat orang mengira integrasinya hidup, lalu bingung kenapa tak ada
     * yang terkirim.
     */
    process.env.ANTHROPIC_API_KEY = 'sk-uji-jangan-dipakai'
    process.env.KREDENSIAL_TANPA_JATUHAN_ENV = '1'
    expect(sumberKredensial(false, 'ANTHROPIC_API_KEY')).toBe('tidak-ada')
  })

  it('nilai TENANT tetap menang, saklar hidup maupun mati', () => {
    // Pasangan wajib: saklar yang mematikan SEMUANYA juga lolos test di atas.
    process.env.ANTHROPIC_API_KEY = 'sk-uji-jangan-dipakai'
    process.env.KREDENSIAL_TANPA_JATUHAN_ENV = '1'
    expect(sumberKredensial(true, 'ANTHROPIC_API_KEY')).toBe('tenant')
  })

  it('hanya "1" yang mematikan — nilai lain tak diam-diam menyalakannya', () => {
    // Saklar yang menyala untuk string apa pun ('0', 'false') adalah saklar
    // yang menyala karena salah ketik.
    process.env.ANTHROPIC_API_KEY = 'sk-uji-jangan-dipakai'
    process.env.KREDENSIAL_TANPA_JATUHAN_ENV = '0'
    expect(sumberKredensial(false, 'ANTHROPIC_API_KEY')).toBe('env')
  })
})

describe('katalog — kunci mana yang punya jatuhan', () => {
  it('kunci PER-TENANT MURNI tak boleh punya jatuhan env', () => {
    /*
     * n8n dan Evolution didaftarkan SESUDAH multi-tenant jadi sasaran, jadi
     * keduanya sengaja tanpa `env`. Kalau kelak seseorang menambahkannya
     * "supaya gampang di lokal", tenant kedua akan diam-diam memakai
     * instance n8n milik tenant pertama — dan alur otomasinya berjalan di
     * tempat yang salah tanpa satu pun galat.
     */
    const wajibMurni = [
      'N8N_BASE_URL', 'N8N_API_KEY',
      'EVOLUTION_API_KEY', 'EVOLUTION_API_URL', 'EVOLUTION_INSTANCE',
      'OPENAI_API_KEY', 'AI_CUSTOM_API_KEY', 'AI_PROVIDER_BASE_URL',
    ]
    const melanggar = wajibMurni.filter((k) => metaKredensial(k)?.env)
    expect(
      melanggar,
      'kunci ini punya jatuhan env — tenant kedua akan memakai milik tenant pertama',
    ).toEqual([])
  })

  it('tiap kunci di katalog punya label dan keterangan yang bisa dibaca penyewa', () => {
    /*
     * Bukan gaya-gayaan: keterangan pernah memuat "TERPISAH dari TJS di :5678"
     * dan path absolut `E:/Project/...` — catatan mesin developer di layar
     * penyewa. Founder yang menemukannya, 2026-08-10.
     */
    /*
     * Pola PATH WINDOWS, bukan "huruf besar lalu titik dua".
     *
     * Versi pertama memakai `/[A-Z]:[\\/]/` dan merah untuk tiga kunci yang
     * sebenarnya benar — ia cocok dengan `http://` di dalam "Evolution API,
     * mis. http://localhost:8081" (huruf `I` dari API, lalu `:`). Alat
     * ukurnya yang salah, bukan katalognya.
     *
     * Sekarang: satu huruf drive diapit batas kata, mis. `E:/` atau `C:\`.
     */
    const bocor = KATALOG_KREDENSIAL.filter(
      (m) =>
        !m.label?.trim() ||
        !m.keterangan?.trim() ||
        /\b[A-Z]:[\\/]/.test(m.keterangan) ||
        /\bTJS\b/.test(m.keterangan) ||
        /scripts[\\/]/.test(m.keterangan),
    )
    expect(
      bocor.map((m) => m.kunci),
      'keterangan memuat jejak mesin developer, atau label/keterangan kosong',
    ).toEqual([])
  })
})
