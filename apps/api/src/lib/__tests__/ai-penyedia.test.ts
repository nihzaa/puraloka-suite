/**
 * TJS-B2 — lapisan adaptor.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN: PERBEDAAN BENTUK ANTAR PENYEDIA BERHENTI DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap perbedaan yang diuji di bawah gagal SENYAP kalau bocor ke pemanggil.
 * Argumen tool yang tetap berupa string JSON tidak melempar apa pun — ia
 * membuat `args.qty` bernilai `undefined`, dan tool bertindak atas bawaannya.
 *
 * Adaptor OpenAI diuji dengan `fetch` tiruan, bukan jaringan nyata: yang diuji
 * bentuk terjemahannya, dan test yang butuh penyedia hidup tak akan pernah
 * dijalankan orang.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ALASAN_BOLEH_ULANG,
  TIMEOUT_BAWAAN_MS,
  alasanDariGalat,
  denganTimeout,
  gagal,
  pangkasRiwayat,
  perkiraanToken,
} from '../ai-penyedia.js'
import { AdaptorOpenAICompatible } from '../ai-penyedia-openai.js'
import { AdaptorAnthropic } from '../ai-penyedia-anthropic.js'
import { PENYEDIA, buatAdaptor, metaPenyedia, penyediaDikenal } from '../ai-adaptor.js'

const fetchAsli = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchAsli
  vi.restoreAllMocks()
})

function balasanOpenAI(badan: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(badan), { status, headers: { 'content-type': 'application/json' } }),
  )
}

describe('pemetaan galat — SERAGAM lintas penyedia', () => {
  it('429 selalu kuota_habis, di penyedia mana pun', () => {
    expect(alasanDariGalat({ status: 429, message: 'rate limited' }).alasan).toBe('kuota_habis')
  })

  it('401/403 kunci_ditolak — bukan "jaringan"', () => {
    // Kalau ini dipetakan jadi `jaringan`, ia masuk ALASAN_BOLEH_ULANG dan
    // sistem akan mencoba ulang kunci yang memang salah, selamanya.
    expect(alasanDariGalat({ status: 401 }).alasan).toBe('kunci_ditolak')
    expect(alasanDariGalat({ status: 403 }).alasan).toBe('kunci_ditolak')
  })

  it('AbortError → timeout', () => {
    expect(alasanDariGalat({ name: 'AbortError' }).alasan).toBe('timeout')
  })

  it('404 model_tak_dikenal, 5xx jaringan', () => {
    expect(alasanDariGalat({ status: 404 }).alasan).toBe('model_tak_dikenal')
    expect(alasanDariGalat({ status: 503 }).alasan).toBe('jaringan')
  })

  it('yang boleh diulang HANYA yang memang berubah kalau diulang', () => {
    expect([...ALASAN_BOLEH_ULANG].sort()).toEqual(['jaringan', 'kuota_habis', 'timeout'])
    // Mengulang penolakan model menghasilkan penolakan yang sama, dan tiap
    // percobaan tetap ditagih.
    expect(ALASAN_BOLEH_ULANG.has('ditolak_model')).toBe(false)
    expect(ALASAN_BOLEH_ULANG.has('kunci_ditolak')).toBe(false)
  })

  it('gagal() mengisi bolehUlang, jadi pemanggil tak menebaknya', () => {
    const a = gagal('timeout', 'x')
    const b = gagal('ditolak_model', 'y')
    expect(a.ok).toBe(false)
    if (!a.ok) expect(a.bolehUlang).toBe(true)
    if (!b.ok) expect(b.bolehUlang).toBe(false)
  })
})

describe('pemangkasan riwayat — berbasis TOKEN, bukan jumlah pesan', () => {
  it('satu pesan RAKSASA memicu pemangkasan meski jumlahnya sedikit', () => {
    // Inilah bedanya dari TJS: batas "N pesan terakhir" tak melihat ini.
    const pesan = [
      { peran: 'user' as const, isi: 'a'.repeat(40_000) },
      { peran: 'assistant' as const, isi: 'ringkas' },
      { peran: 'user' as const, isi: 'lanjut' },
    ]
    const hasil = pangkasRiwayat(pesan, 1_000)
    expect(hasil.length).toBeLessThan(3)
    expect(hasil.some((p) => p.isi.length === 40_000)).toBe(false)
  })

  it('yang TERBARU dipertahankan — percakapan kehilangan awalnya', () => {
    const pesan = Array.from({ length: 20 }, (_, i) => ({
      peran: 'user' as const,
      isi: `pesan-${i} ${'x'.repeat(400)}`,
    }))
    const hasil = pangkasRiwayat(pesan, 500)
    // Kehilangan pesan terakhir berarti model menjawab pertanyaan yang bukan
    // pertanyaan terakhir penggunanya.
    expect(hasil[hasil.length - 1].isi).toContain('pesan-19')
  })

  it('SELALU menyisakan minimal satu pesan, meski batasnya mustahil', () => {
    const hasil = pangkasRiwayat([{ peran: 'user', isi: 'x'.repeat(10_000) }], 1)
    // Mengirim riwayat kosong berarti model menjawab tanpa pertanyaan.
    expect(hasil).toHaveLength(1)
  })

  it('riwayat yang muat tidak dipangkas', () => {
    const pesan = [
      { peran: 'user' as const, isi: 'halo' },
      { peran: 'assistant' as const, isi: 'hai' },
    ]
    expect(pangkasRiwayat(pesan, 10_000)).toHaveLength(2)
  })

  it('perkiraan token naik seiring panjang teks', () => {
    expect(perkiraanToken('x'.repeat(400))).toBeGreaterThan(perkiraanToken('x'.repeat(40)))
  })
})

describe('denganTimeout', () => {
  it('mengembalikan timeout, bukan melempar', async () => {
    const hasil = await denganTimeout(20, (signal) =>
      new Promise((_, tolak) => {
        signal.addEventListener('abort', () => tolak(Object.assign(new Error('abort'), { name: 'AbortError' })))
      }),
    )
    expect(hasil.ok).toBe(false)
  })

  it('meneruskan sinyal abort — bukan sekadar berhenti menunggu', async () => {
    // `Promise.race` saja hanya berhenti MENUNGGU; panggilannya jalan terus
    // dan tetap ditagih.
    let dapatSinyal: AbortSignal | null = null
    await denganTimeout(1_000, async (signal) => {
      dapatSinyal = signal
      return 'ok'
    })
    expect(dapatSinyal).toBeInstanceOf(AbortSignal)
  })

  it('meneruskan nilai saat tepat waktu', async () => {
    const hasil = await denganTimeout(1_000, async () => 42)
    expect(hasil).toEqual({ ok: true, nilai: 42 })
  })
})

describe('AdaptorOpenAICompatible — normalisasi bentuk', () => {
  const buat = () => new AdaptorOpenAICompatible('kunci-uji', 'https://contoh.test/v1')

  it('ARGUMEN tool string JSON diuraikan jadi OBJEK', async () => {
    globalThis.fetch = balasanOpenAI({
      model: 'm',
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [{ id: 'c1', function: { name: 'cekStok', arguments: '{"kode":"BESI-10","qty":25}' } }],
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }) as never

    const r = await buat().chat({ model: 'm', maxToken: 100, pesan: [{ peran: 'user', isi: 'cek' }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Kalau ini tetap string, `args.qty` bernilai undefined di tool — tanpa
    // galat apa pun, dan tool bertindak atas bawaannya.
    expect(typeof r.panggilanTool[0].argumen).toBe('object')
    expect(r.panggilanTool[0].argumen.qty).toBe(25)
    expect(r.berhentiKarena).toBe('butuh_tool')
  })

  it('argumen JSON RUSAK → gagal, BUKAN objek kosong', async () => {
    globalThis.fetch = balasanOpenAI({
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ id: 'c1', function: { name: 'hapus', arguments: '{rusak' } }] },
      }],
    }) as never

    const r = await buat().chat({ model: 'm', maxToken: 100, pesan: [] })
    expect(r.ok).toBe(false)
    // `{}` akan membuat tool dipanggil TANPA argumen dan bertindak atas
    // bawaannya — untuk tool bernama `hapus`, itu jauh lebih buruk daripada gagal.
    if (!r.ok) expect(r.alasan).toBe('jawaban_tak_terbaca')
  })

  it('C-6: isError DIBAWA meski OpenAI tak punya field-nya', async () => {
    let badanTerkirim: Record<string, unknown> = {}
    globalThis.fetch = vi.fn(async (_u: unknown, opsi: RequestInit) => {
      badanTerkirim = JSON.parse(opsi.body as string)
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
    }) as never

    await buat().chat({
      model: 'm',
      maxToken: 100,
      pesan: [],
      hasilTool: [{ id: 'c1', isi: 'stok tak terbaca', isError: true }],
    })

    const pesanTool = (badanTerkirim.messages as Array<{ role: string; content: string }>)
      .find((p) => p.role === 'tool')
    // Yang dilarang bukan "tak punya field" melainkan MENELAN informasinya.
    expect(pesanTool?.content).toContain('TOOL GAGAL')
    expect(pesanTool?.content).toContain('stok tak terbaca')
  })

  it('hasil tool SUKSES tidak diberi awalan gagal', async () => {
    let badanTerkirim: Record<string, unknown> = {}
    globalThis.fetch = vi.fn(async (_u: unknown, opsi: RequestInit) => {
      badanTerkirim = JSON.parse(opsi.body as string)
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
    }) as never

    await buat().chat({
      model: 'm', maxToken: 100, pesan: [],
      hasilTool: [{ id: 'c1', isi: '25 batang', isError: false }],
    })

    const pesanTool = (badanTerkirim.messages as Array<{ role: string; content: string }>)
      .find((p) => p.role === 'tool')
    expect(pesanTool?.content).toBe('25 batang')
  })

  it('SKEMA tool diterjemahkan ke function.parameters', async () => {
    let badanTerkirim: Record<string, unknown> = {}
    globalThis.fetch = vi.fn(async (_u: unknown, opsi: RequestInit) => {
      badanTerkirim = JSON.parse(opsi.body as string)
      return new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 })
    }) as never

    await buat().chat({
      model: 'm', maxToken: 100, pesan: [],
      tools: [{ nama: 'cekStok', keterangan: 'baca stok', skema: { type: 'object' } }],
    })

    const tools = badanTerkirim.tools as Array<{ function: { name: string; parameters: unknown } }>
    // Anthropic memakai `input_schema`; perbedaan itu berhenti di adaptor.
    expect(tools[0].function.name).toBe('cekStok')
    expect(tools[0].function.parameters).toEqual({ type: 'object' })
  })

  it('token cache TIDAK dihitung dua kali', async () => {
    globalThis.fetch = balasanOpenAI({
      choices: [{ message: { content: 'x' } }],
      usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } },
    }) as never

    const r = await buat().chat({ model: 'm', maxToken: 100, pesan: [] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // `prompt_tokens` gaya OpenAI SUDAH termasuk cache. Menjumlahkannya membuat
    // batas biaya tercapai lebih cepat dari seharusnya.
    expect(r.pemakaian.masuk).toBe(200)
    expect(r.pemakaian.cacheBaca).toBe(800)
  })

  it('keluaran berstruktur DITOLAK JELAS bila model tak menyatakan dukungan', async () => {
    globalThis.fetch = balasanOpenAI({ choices: [{ message: { content: '{}' } }] }) as never
    const r = await buat().chat({
      model: 'm', maxToken: 100, pesan: [], skemaJawaban: { type: 'object' },
    })
    // Mengirimnya lalu berharap berarti penyedia mengabaikannya diam-diam dan
    // mengembalikan teks bebas — yang gagal di-parse jauh dari sebabnya.
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.alasan).toBe('tak_didukung')
  })

  it('HTTP 429 → kuota_habis, dan TIDAK melempar', async () => {
    globalThis.fetch = vi.fn(async () => new Response('rate limit', { status: 429 })) as never
    const r = await buat().chat({ model: 'm', maxToken: 100, pesan: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.alasan).toBe('kuota_habis')
      expect(r.bolehUlang).toBe(true)
    }
  })

  it('balasan tanpa choices → jawaban_tak_terbaca, bukan crash', async () => {
    globalThis.fetch = balasanOpenAI({ model: 'm' }) as never
    const r = await buat().chat({ model: 'm', maxToken: 100, pesan: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.alasan).toBe('jawaban_tak_terbaca')
  })

  it('kemampuan bawaan KONSERVATIF untuk model tak dikenal', async () => {
    const k = buat().kemampuan('model-asing')
    // Menebak "punya" lalu mengirimkannya berakhir 400 di penyedia yang tak
    // mendukung — dan galatnya menyalahkan permintaan, bukan tebakannya.
    expect(k.penalaranAdaptif).toBe(false)
    expect(k.keluaranBerstruktur).toBe(false)
  })
})

describe('AdaptorAnthropic — kemampuan per MODEL', () => {
  const a = new AdaptorAnthropic('kunci-uji')

  it('model tak dikenal TIDAK mewarisi kemampuan penyedianya', () => {
    // Mengirim `thinking` ke model yang tak mendukungnya berakhir 400.
    expect(a.kemampuan('claude-entah-apa').penalaranAdaptif).toBe(false)
  })

  it('haiku ditandai tanpa penalaran adaptif, opus dengan', () => {
    expect(a.kemampuan('claude-haiku-4-5').penalaranAdaptif).toBe(false)
    expect(a.kemampuan('claude-opus-5').penalaranAdaptif).toBe(true)
  })

  it('jendela token dinyatakan, dipakai pemangkasan riwayat', () => {
    expect(a.kemampuan('claude-opus-5').jendelaToken).toBeGreaterThan(0)
  })
})

describe('pabrik adaptor', () => {
  it('penyedia tak dikenal DITOLAK, tidak jatuh ke bawaan', () => {
    const r = buatAdaptor({ penyedia: 'anthropc', apiKey: 'k' })
    // Jatuh ke bawaan berarti tenant yang mengira sudah pindah penyedia
    // diam-diam tetap memakai yang lama — dan tagihannya datang dari tempat
    // yang tak ia duga.
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.alasan).toBe('penyedia_tak_dikenal')
  })

  it('kunci kosong → kunci_tak_ada dengan nama kunci yang harus dipasang', () => {
    const r = buatAdaptor({ penyedia: 'anthropic', apiKey: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.alasan).toBe('kunci_tak_ada')
      expect(r.pesan).toContain('ANTHROPIC_API_KEY')
    }
  })

  it('penyedia OpenAI-compatible tanpa base URL DITOLAK', () => {
    const r = buatAdaptor({ penyedia: 'openai-compatible', apiKey: 'k' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.alasan).toBe('base_url_tak_ada')
  })

  it('konfigurasi lengkap menghasilkan adaptor', () => {
    const a = buatAdaptor({ penyedia: 'anthropic', apiKey: 'k' })
    const b = buatAdaptor({ penyedia: 'openai-compatible', apiKey: 'k', baseUrl: 'https://x.test/v1' })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    if (a.ok) expect(a.adaptor.nama).toBe('anthropic')
    if (b.ok) expect(b.adaptor.nama).toBe('openai-compatible')
  })

  it('tiap penyedia menyebut kunci kredensialnya', () => {
    for (const p of PENYEDIA) {
      expect(p.kunciKredensial).toBeTruthy()
      expect(penyediaDikenal(p.id)).toBe(true)
      expect(metaPenyedia(p.id)?.label).toBeTruthy()
    }
  })
})

describe('kontrak', () => {
  it('timeout bawaan ada dan masuk akal', () => {
    // TJS menyerahkannya ke SDK: 10 menit x 16 ronde = 160 menit menggantung.
    expect(TIMEOUT_BAWAAN_MS).toBeGreaterThan(1_000)
    expect(TIMEOUT_BAWAAN_MS).toBeLessThanOrEqual(120_000)
  })
})
