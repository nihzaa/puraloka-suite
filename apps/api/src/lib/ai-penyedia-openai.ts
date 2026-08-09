/**
 * ADAPTOR OPENAI-COMPATIBLE — untuk penyedia yang meniru API OpenAI
 * (OpenRouter, Groq, Together, LM Studio lokal, dan penyedia lain yang
 * founder mungkin pilih nanti).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DI SINILAH NORMALISASI TOOL-CALLING BENAR-BENAR TERJADI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiga perbedaan bentuk yang harus berhenti di berkas ini, karena masing-masing
 * gagal SENYAP kalau bocor ke pemanggil:
 *
 *   1. SKEMA      Anthropic `input_schema`, OpenAI `function.parameters`
 *   2. ARGUMEN    Anthropic objek, OpenAI **STRING JSON**
 *                 → `args.qty` bernilai `undefined` tanpa galat apa pun
 *   3. HASIL      Anthropic blok `tool_result` dengan `is_error`;
 *                 OpenAI pesan berperan `tool` — dan TIDAK PUNYA `is_error`
 *
 * Nomor 3 adalah C-6. OpenAI tak menyediakan tempat untuk menandai kegagalan,
 * jadi adaptor ini MENULISKANNYA ke isi pesan dengan awalan yang jelas. Yang
 * dilarang bukan "tak punya field" melainkan MENELAN informasinya — model harus
 * tahu tool-nya gagal, entah lewat field atau lewat teks.
 *
 * Ditulis dengan `fetch`, bukan SDK OpenAI: menambah dependensi untuk satu
 * bentuk permintaan JSON yang stabil bertahun-tahun tak sepadan, dan penjaga
 * L-6 hanya perlu menjaga satu berkas ini.
 */

import {
  TIMEOUT_BAWAAN_MS,
  alasanDariGalat,
  denganTimeout,
  gagal,
  type AdaptorPenyedia,
  type HasilChat,
  type KemampuanModel,
  type OpsiChat,
  type PanggilanTool,
} from './ai-penyedia.js'

/**
 * Kemampuan model penyedia pihak ketiga TIDAK BISA diketahui dari namanya.
 *
 * Jadi bawaannya konservatif: tak ada penalaran adaptif, tak ada keluaran
 * berstruktur asli. Menebak "punya" lalu mengirimkannya berakhir 400 pada
 * penyedia yang tak mendukung — dan galatnya menyalahkan permintaan, bukan
 * tebakan yang membuatnya.
 */
const KEMAMPUAN_BAWAAN: KemampuanModel = {
  penalaranAdaptif: false,
  toolCalling: true,
  keluaranBerstruktur: false,
  jendelaToken: 128_000,
}

interface BalasanOpenAI {
  model?: string
  choices?: Array<{
    finish_reason?: string
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

export class AdaptorOpenAICompatible implements AdaptorPenyedia {
  readonly nama: string

  constructor(
    private apiKey: string,
    private baseURL: string,
    nama = 'openai-compatible',
    private kemampuanKhusus?: Record<string, KemampuanModel>,
  ) {
    this.nama = nama
  }

  kemampuan(model: string): KemampuanModel {
    return this.kemampuanKhusus?.[model] ?? KEMAMPUAN_BAWAAN
  }

  async chat(opsi: OpsiChat): Promise<HasilChat> {
    const timeoutMs = opsi.timeoutMs ?? TIMEOUT_BAWAAN_MS

    const pesan: Array<Record<string, unknown>> = []
    if (opsi.sistem) pesan.push({ role: 'system', content: opsi.sistem })
    for (const p of opsi.pesan) {
      // Gaya OpenAI menaruh panggilan tool di `tool_calls` pada pesan asisten,
      // bukan sebagai blok isi. Bentuknya beda dari Anthropic; tuntutannya
      // sama — pesan `role: 'tool'` di bawah harus punya `tool_call_id` yang
      // merujuk panggilan yang benar-benar ada di riwayat.
      // Hasil tool DI POSISINYA — gaya OpenAI memakai pesan `role: 'tool'`
      // terpisah per hasil, bukan satu pesan berisi banyak blok.
      if (p.peran === 'user' && p.hasilTool?.length) {
        for (const h of p.hasilTool) {
          pesan.push({
            role: 'tool',
            tool_call_id: h.id,
            content: h.isError ? `TOOL GAGAL: ${h.isi}` : h.isi,
          })
        }
        continue
      }
      if (p.peran === 'assistant' && p.panggilanTool?.length) {
        pesan.push({
          role: 'assistant',
          content: p.isi || null,
          tool_calls: p.panggilanTool.map((t) => ({
            id: t.id,
            type: 'function',
            // Argumen dikembalikan ke bentuk STRING JSON — itu yang gaya
            // OpenAI harapkan, dan konversinya berhenti di adaptor ini.
            function: { name: t.nama, arguments: JSON.stringify(t.argumen) },
          })),
        })
        continue
      }
      pesan.push({ role: p.peran, content: p.isi })
    }

    // ── C-6 pada penyedia yang tak punya `is_error` ────────────────────────
    //
    // Kegagalan tool ditulis KE DALAM isi, bukan dihilangkan. Awalan besar
    // supaya model tak salah membacanya sebagai data — "TOOL GAGAL:" di depan
    // pesan galat jauh lebih sulit diabaikan daripada teks galat telanjang,
    // yang gampang dianggap sebagai hasil yang sah.
    for (const h of opsi.hasilTool ?? []) {
      pesan.push({
        role: 'tool',
        tool_call_id: h.id,
        content: h.isError ? `TOOL GAGAL: ${h.isi}` : h.isi,
      })
    }

    const badan: Record<string, unknown> = {
      model: opsi.model,
      max_tokens: opsi.maxToken,
      messages: pesan,
    }

    if (opsi.tools?.length) {
      // Bentuk skemanya berbeda dari Anthropic — di sinilah perbedaannya
      // diterjemahkan, bukan di pemanggil.
      badan.tools = opsi.tools.map((t) => ({
        type: 'function',
        function: { name: t.nama, description: t.keterangan, parameters: t.skema },
      }))
    }

    if (opsi.skemaJawaban) {
      if (!this.kemampuan(opsi.model).keluaranBerstruktur) {
        // Gagal JELAS, bukan mengirim lalu berharap. Penyedia yang tak
        // mendukungnya akan mengabaikan field-nya diam-diam dan mengembalikan
        // teks bebas — yang lalu gagal di-parse jauh dari sebabnya.
        return gagal(
          'tak_didukung',
          `penyedia ${this.nama} tak menyatakan dukungan keluaran berstruktur untuk model ${opsi.model}`,
        )
      }
      badan.response_format = { type: 'json_schema', json_schema: { schema: opsi.skemaJawaban } }
    }

    try {
      const hasil = await denganTimeout(timeoutMs, async (signal) => {
        const r = await fetch(`${this.baseURL.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(badan),
          signal,
        })
        if (!r.ok) {
          // Dilempar dengan `status` supaya `alasanDariGalat` memetakannya sama
          // persis seperti galat SDK Anthropic — 429 harus berarti
          // `kuota_habis` di penyedia mana pun.
          const teks = await r.text().catch(() => '')
          throw Object.assign(new Error(teks || `HTTP ${r.status}`), { status: r.status })
        }
        return (await r.json()) as BalasanOpenAI
      })

      if (!hasil.ok) return gagal('timeout', `penyedia ${this.nama} tak menjawab dalam ${timeoutMs} ms`)

      const jawab = hasil.nilai
      const pilihan = jawab.choices?.[0]
      if (!pilihan?.message) {
        return gagal('jawaban_tak_terbaca', `balasan ${this.nama} tanpa choices[0].message`)
      }

      const panggilanTool: PanggilanTool[] = []
      for (const tc of pilihan.message.tool_calls ?? []) {
        // ARGUMEN datang sebagai STRING JSON. Diuraikan DI SINI supaya
        // pemanggil selalu menerima objek, apa pun penyedianya.
        let argumen: Record<string, unknown> = {}
        try {
          argumen = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}
        } catch {
          // Model bisa menghasilkan JSON rusak. Membiarkannya jadi `{}` berarti
          // tool dipanggil TANPA argumen dan bertindak atas bawaannya — jauh
          // lebih berbahaya daripada gagal.
          return gagal(
            'jawaban_tak_terbaca',
            `argumen tool '${tc.function?.name}' bukan JSON sah: ${tc.function?.arguments?.slice(0, 200)}`,
          )
        }
        panggilanTool.push({ id: tc.id, nama: tc.function?.name ?? '', argumen })
      }

      const masuk = jawab.usage?.prompt_tokens ?? 0
      const cacheBaca = jawab.usage?.prompt_tokens_details?.cached_tokens ?? 0

      return {
        ok: true,
        teks: pilihan.message.content ?? '',
        panggilanTool,
        model: jawab.model ?? opsi.model,
        pemakaian: {
          // `prompt_tokens` gaya OpenAI SUDAH termasuk token cache. Menjumlahkan
          // keduanya akan menghitung ganti rugi dua kali dan membuat batas
          // biaya tercapai lebih cepat dari seharusnya.
          masuk: Math.max(0, masuk - cacheBaca),
          keluar: jawab.usage?.completion_tokens ?? 0,
          // Gaya OpenAI tak melaporkan penulisan cache terpisah.
          cacheTulis: 0,
          cacheBaca,
        },
        berhentiKarena:
          pilihan.finish_reason === 'tool_calls'
            ? 'butuh_tool'
            : pilihan.finish_reason === 'length'
              ? 'kehabisan_token'
              : 'selesai',
      }
    } catch (err) {
      const { alasan, pesan } = alasanDariGalat(err)
      return gagal(alasan, pesan)
    }
  }
}
