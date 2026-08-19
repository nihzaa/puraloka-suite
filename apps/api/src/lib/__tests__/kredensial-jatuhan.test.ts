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

describe('surel multi-tenant (2026-08-19)', () => {
  /*
    Founder bertanya: *"gimana soal multi tenant api ini? perusahaan lain pake
    api yang sama dengan yang ini juga?"* — dan pertanyaannya menemukan cacat
    yang nyata.

    Sampai hari itu `utils/email.ts` membaca `process.env.RESEND_API_KEY`
    LANGSUNG, tak lewat lapisan kredensial. Artinya seluruh tenant berkirim
    surel lewat SATU akun Resend milik operator:

      · kuota 3.000/bulan dibagi tanpa ada yang tahu siapa memakai berapa
      · satu tenant kena batas → surel tenant LAIN ikut mati
      · penerima melihat domain OPERATOR, bukan domain perusahaan pengirim
      · satu tenant di-spam-report → reputasi domain semua tenant kena

    Yang ketiga paling mahal: tagihan dan berita acara yang datang dari domain
    tak dikenal terbaca seperti penipuan.
  */
  it('RESEND_API_KEY ada di katalog — bisa dipasang per tenant', () => {
    const meta = metaKredensial('RESEND_API_KEY')
    expect(meta, 'kunci Resend tak ada di katalog, jadi tak bisa dipasang dari UI')
      .toBeDefined()
    expect(meta!.env, 'jatuhan env dicabut — instalasi satu-perusahaan akan mati')
      .toBe('RESEND_API_KEY')
  })

  it('EMAIL_FROM ada di katalog — kunci saja TIDAK cukup', () => {
    /*
      Kunci Resend milik sendiri tapi alamat pengirim milik operator masih
      salah: penerimanya tetap melihat domain operator. Multi-tenant surel
      menuntut KEDUANYA.
    */
    const meta = metaKredensial('EMAIL_FROM')
    expect(meta, 'alamat pengirim tak bisa disetel per tenant').toBeDefined()
    expect(meta!.grup).toBe('Email')
  })

  it('KUNCI punya jatuhan env, ALAMAT tidak — dan bedanya disengaja', () => {
    /*
      Penjaga `audit-jatuhan-env-tak-bertambah.mjs` menolak versi pertama
      entri `EMAIL_FROM` yang punya `env:`, dan penjaganya BENAR.

      Jatuhan env untuk KUNCI API masih masuk akal: tenant yang belum punya
      akun Resend tetap bisa berkirim surel, dan yang "bocor" cuma kuota
      operator. Puraloka hari ini satu perusahaan, dan mencabutnya akan
      mematikan surel yang sekarang jalan.

      Untuk ALAMAT PENGIRIM, jatuhannya justru cacat yang hendak ditutup:
      tenant tanpa alamat sendiri akan mengirim TAGIHAN dan BERITA ACARA dari
      domain OPERATOR — penerimanya melihat pengirim yang tak ia kenal, dan
      untuk dokumen yang meminta uang itu terbaca seperti penipuan.
    */
    delete process.env.KREDENSIAL_TANPA_JATUHAN_ENV
    process.env.RESEND_API_KEY = 'nilai-uji'
    process.env.EMAIL_FROM = 'nilai-uji'

    expect(sumberKredensial(false, 'RESEND_API_KEY'),
      'kunci Resend kehilangan jatuhan env — instalasi satu-perusahaan mati')
      .toBe('env')

    expect(sumberKredensial(false, 'EMAIL_FROM'),
      'alamat pengirim mewarisi env — tenant mengirim tagihan dari domain operator')
      .not.toBe('env')
  })

  it('saat saklar tanpa-jatuhan menyala, kunci Resend IKUT mati', () => {
    /*
      Inti multi-tenant yang sesungguhnya. Operator yang menjual ke banyak PT
      menyalakan saklar ini supaya tak ada tenant yang diam-diam memakai
      kunci — dan tagihan — operator.

      Kalau surel LOLOS dari saklar itu, ia jadi satu-satunya jalur yang tetap
      memakai akun operator tanpa ada yang menyadarinya.
    */
    process.env.KREDENSIAL_TANPA_JATUHAN_ENV = '1'
    process.env.RESEND_API_KEY = 'nilai-uji'
    expect(sumberKredensial(false, 'RESEND_API_KEY'), 'surel lolos dari saklar')
      .not.toBe('env')
  })
})
