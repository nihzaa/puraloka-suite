/**
 * PABRIK ADAPTOR — kunci penyedia wajib PUNYA PEMBACA dan PUNYA KOTAK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA CACAT NYATA YANG DIKUNCI TEST INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keduanya hidup di repo ini sampai 2026-08-12, keduanya TANPA GEJALA, dan
 * keduanya bentuk cermin dari kesalahan yang sama:
 *
 *   AI_PROVIDER_API_KEY   dibaca kode, TAK ADA kotaknya di halaman Kredensial
 *                         → memilih penyedia OpenAI-compatible selalu
 *                           berakhir `kunci_tak_ada`, dan kotak
 *                           `AI_CUSTOM_API_KEY` yang ADA tak pernah dibaca
 *
 *   OPENAI_API_KEY        PUNYA kotak, punya tombol uji yang benar-benar
 *                         memanggil api.openai.com — tapi NOL pembaca
 *                         → orang mengisinya, mengujinya, melihat "sehat",
 *                           lalu tak ada apa pun yang memakainya
 *
 * Yang pertama: penyedia tak bisa dipakai sama sekali. Yang kedua: kotak yang
 * berbohong. Tak satu pun memunculkan galat, dan typecheck hijau untuk
 * keduanya — karena `kunciKredensial` hanyalah `string`.
 *
 * Test ini menutupnya dengan menuntut invarian yang tak bisa dilanggar tanpa
 * merah: SETIAP `kunciKredensial` di `PENYEDIA` wajib ada di
 * `KATALOG_KREDENSIAL`, dan sebaliknya setiap kunci AI di katalog wajib
 * dipakai seseorang.
 *
 * Nol panggilan berbayar di seluruh berkas ini — pabrik hanya MERAKIT
 * adaptor, tak pernah memanggil model.
 */
import { describe, it, expect } from 'vitest'
import { PENYEDIA, buatAdaptor, metaPenyedia, penyediaDikenal } from '../ai-adaptor.js'
import { KATALOG_KREDENSIAL } from '../kredensial.js'

const kunciKatalog = new Set(KATALOG_KREDENSIAL.map(k => k.kunci))

describe('setiap penyedia punya KOTAK untuk kuncinya', () => {
  it('kunciKredensial tiap penyedia terdaftar di KATALOG_KREDENSIAL', () => {
    // Inilah yang gagal saat `AI_PROVIDER_API_KEY` masih tertulis.
    const yatim = PENYEDIA
      .filter(p => !kunciKatalog.has(p.kunciKredensial))
      .map(p => `${p.id} → ${p.kunciKredensial}`)

    expect(yatim).toEqual([])
  })

  it('penyedia yang butuh base URL punya kunci base URL di katalog juga', () => {
    // Kunci tanpa alamat sama tak bergunanya dengan alamat tanpa kunci.
    const butuh = PENYEDIA.filter(p => p.butuhBaseUrl)
    if (butuh.length > 0) {
      expect(kunciKatalog.has('AI_PROVIDER_BASE_URL')).toBe(true)
    }
  })
})

describe('setiap kunci AI di katalog punya PEMBACA', () => {
  it('tak ada kunci AI yang tak dipakai penyedia mana pun', () => {
    // Inilah yang gagal saat `OPENAI_API_KEY` masih menganggur.
    //
    // `AI_PROVIDER_BASE_URL` dikecualikan: ia alamat, bukan kunci, dan
    // dibaca langsung di `ai-jalankan.ts`/`ai.ts` — bukan lewat `PENYEDIA`.
    const dipakai = new Set(PENYEDIA.map(p => p.kunciKredensial))
    const menganggur = KATALOG_KREDENSIAL
      .filter(k => k.grup === 'AI')
      .filter(k => k.kunci !== 'AI_PROVIDER_BASE_URL')
      .filter(k => !dipakai.has(k.kunci))
      .map(k => k.kunci)

    expect(menganggur).toEqual([])
  })
})

describe('buatAdaptor — kegagalan dikembalikan, tidak dilempar', () => {
  it('penyedia tak dikenal menghasilkan hasil, bukan throw', () => {
    // Kontraknya: pemanggil `/ai/insight` menjawab dengan jalur deterministik
    // 200, pemanggil lain 402. Melempar memaksa keduanya menebak artinya.
    const r = buatAdaptor({ penyedia: 'anthropc', apiKey: 'x'.repeat(40) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.alasan).toBe('penyedia_tak_dikenal')
  })

  it('kunci kosong ditolak dengan menyebut NAMA kunci yang harus diisi', () => {
    const r = buatAdaptor({ penyedia: 'anthropic', apiKey: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.alasan).toBe('kunci_tak_ada')
      // Pesan yang cuma bilang "kunci belum dipasang" membuat orang menebak
      // kotak mana yang dimaksud di halaman berisi 13 kotak.
      expect(r.pesan).toContain('ANTHROPIC_API_KEY')
    }
  })

  it('openai-compatible TANPA base URL ditolak', () => {
    const r = buatAdaptor({ penyedia: 'openai-compatible', apiKey: 'x'.repeat(40) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.alasan).toBe('base_url_tak_ada')
  })
})

describe('OpenAI resmi — alamat tetap, tak perlu diketik', () => {
  it('terdaftar sebagai penyedia dan TIDAK menuntut base URL', () => {
    expect(penyediaDikenal('openai')).toBe(true)
    expect(metaPenyedia('openai')?.butuhBaseUrl).toBe(false)
    expect(metaPenyedia('openai')?.kunciKredensial).toBe('OPENAI_API_KEY')
  })

  it('bisa dirakit hanya dengan kunci — alamatnya diisi sistem', () => {
    // Kalau ini gagal, orang harus mengetik https://api.openai.com/v1 sendiri,
    // dan salah ketiknya baru terlihat saat panggilan pertama — tampak
    // seperti "kunci salah", bukan "alamat salah".
    const r = buatAdaptor({ penyedia: 'openai', apiKey: 'sk-' + 'x'.repeat(40) })
    expect(r.ok).toBe(true)
  })

  it('base URL yang diisi TETAP dihormati — untuk proxy internal', () => {
    const r = buatAdaptor({
      penyedia: 'openai',
      apiKey: 'sk-' + 'x'.repeat(40),
      baseUrl: 'https://proxy.internal/v1',
    })
    expect(r.ok).toBe(true)
  })
})

describe('anthropic tetap utuh', () => {
  it('dirakit tanpa base URL', () => {
    const r = buatAdaptor({ penyedia: 'anthropic', apiKey: 'sk-ant-' + 'x'.repeat(40) })
    expect(r.ok).toBe(true)
  })
})
