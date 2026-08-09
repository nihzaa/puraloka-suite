/**
 * ADAPTOR ANTHROPIC.
 *
 * Satu-satunya berkas yang boleh menyentuh SDK Anthropic — ditegakkan penjaga
 * `audit-satu-jalan-ke-model.mjs` (L-6). Alasannya bukan kerapian: timeout,
 * pemetaan galat, dan `isError` semuanya hidup di lapisan ini, dan pemanggilan
 * SDK yang melewatinya melewati ketiganya sekaligus — tanpa gejala, karena
 * jalur pintas itu tetap bekerja sampai penyedianya lambat atau tool-nya gagal.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  TIMEOUT_BAWAAN_MS,
  alasanDariGalat,
  gagal,
  type AdaptorPenyedia,
  type HasilChat,
  type KemampuanModel,
  type OpsiChat,
  type PanggilanTool,
} from './ai-penyedia.js'

/**
 * Kemampuan per MODEL, bukan per penyedia.
 *
 * Model tak dikenal mendapat kemampuan paling konservatif: penalaran adaptif
 * MATI. Mengirim `thinking` ke model yang tak mendukungnya berakhir 400, dan
 * menganggap "penyedia Anthropic berarti semua modelnya bisa" adalah cara
 * cacat itu masuk.
 */
const KEMAMPUAN: Record<string, KemampuanModel> = {
  'claude-opus-5': { penalaranAdaptif: true, toolCalling: true, keluaranBerstruktur: true, jendelaToken: 1_000_000 },
  'claude-sonnet-5': { penalaranAdaptif: true, toolCalling: true, keluaranBerstruktur: true, jendelaToken: 1_000_000 },
  'claude-haiku-4-5': { penalaranAdaptif: false, toolCalling: true, keluaranBerstruktur: true, jendelaToken: 200_000 },
}

const KEMAMPUAN_TERBATAS: KemampuanModel = {
  penalaranAdaptif: false,
  toolCalling: true,
  keluaranBerstruktur: false,
  jendelaToken: 200_000,
}

export class AdaptorAnthropic implements AdaptorPenyedia {
  readonly nama = 'anthropic'
  private klien: Anthropic

  constructor(apiKey: string, baseURL?: string) {
    this.klien = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      // SDK punya timeout-nya sendiri, dan bawaannya 10 MENIT. Disetel di sini
      // supaya adaptor yang dibuat tanpa memikirkannya tetap aman; `OpsiChat`
      // masih bisa memperketatnya per panggilan.
      timeout: TIMEOUT_BAWAAN_MS,
      // Backoff bawaan SDK. Dinyatakan eksplisit karena ia bagian dari kontrak
      // adaptor, bukan detail yang boleh berubah diam-diam saat SDK naik versi.
      maxRetries: 2,
    })
  }

  kemampuan(model: string): KemampuanModel {
    return KEMAMPUAN[model] ?? KEMAMPUAN_TERBATAS
  }

  async chat(opsi: OpsiChat): Promise<HasilChat> {
    const timeoutMs = opsi.timeoutMs ?? TIMEOUT_BAWAAN_MS

    try {
      const isiPesan: Anthropic.MessageParam[] = opsi.pesan.map((p) => ({
        role: p.peran,
        content: p.isi,
      }))

      // Hasil tool disusulkan sebagai pesan `user` berisi blok `tool_result` —
      // bentuk yang Anthropic tuntut. `is_error` DIBAWA (C-6): tanpa itu model
      // melanjutkan seolah tool-nya berhasil.
      if (opsi.hasilTool?.length) {
        isiPesan.push({
          role: 'user',
          content: opsi.hasilTool.map((h) => ({
            type: 'tool_result' as const,
            tool_use_id: h.id,
            content: h.isi,
            is_error: h.isError,
          })),
        })
      }

      const permintaan: Anthropic.MessageCreateParams = {
        model: opsi.model,
        max_tokens: opsi.maxToken,
        messages: isiPesan,
        ...(opsi.sistem ? { system: opsi.sistem } : {}),
        ...(opsi.tools?.length
          ? {
              tools: opsi.tools.map((t) => ({
                name: t.nama,
                description: t.keterangan,
                input_schema: t.skema as Anthropic.Tool.InputSchema,
              })),
            }
          : {}),
        ...(opsi.skemaJawaban
          ? {
              output_config: {
                format: { type: 'json_schema' as const, schema: opsi.skemaJawaban },
              },
            }
          : {}),
      }

      const jawab = await this.klien.messages.create(permintaan, { timeout: timeoutMs })

      // Model bisa MENOLAK menjawab (200 + stop_reason 'refusal'), dan saat itu
      // `content` kosong. Membaca content[0] tanpa memeriksanya melempar
      // TypeError yang menyamar sebagai galat jaringan.
      if (jawab.stop_reason === 'refusal') {
        // Sengaja TIDAK boleh diulang: percobaan kedua ditolak dengan cara yang
        // sama, dan tiap percobaan tetap ditagih.
        return gagal('ditolak_model', 'model menolak menjawab')
      }

      let teks = ''
      const panggilanTool: PanggilanTool[] = []
      for (const blok of jawab.content) {
        if (blok.type === 'text') teks += blok.text
        else if (blok.type === 'tool_use') {
          panggilanTool.push({
            id: blok.id,
            nama: blok.name,
            // Anthropic mengirim objek. Adaptor OpenAI-compatible mengirim
            // STRING JSON dan menguraikannya di sisinya sendiri — perbedaan itu
            // berhenti di lapisan ini, tidak bocor ke pemanggil.
            argumen: (blok.input ?? {}) as Record<string, unknown>,
          })
        }
      }

      return {
        ok: true,
        teks,
        panggilanTool,
        model: jawab.model ?? opsi.model,
        pemakaian: {
          masuk: jawab.usage?.input_tokens ?? 0,
          keluar: jawab.usage?.output_tokens ?? 0,
          cacheTulis: jawab.usage?.cache_creation_input_tokens ?? 0,
          cacheBaca: jawab.usage?.cache_read_input_tokens ?? 0,
        },
        berhentiKarena:
          jawab.stop_reason === 'tool_use'
            ? 'butuh_tool'
            : jawab.stop_reason === 'max_tokens'
              ? 'kehabisan_token'
              : 'selesai',
      }
    } catch (err) {
      // TAK PERNAH melempar keluar. Pemanggil memilih tindakan dari `alasan`,
      // bukan dari mengurai teks galat yang bisa berubah kapan saja.
      const { alasan, pesan } = alasanDariGalat(err)
      return gagal(alasan, pesan)
    }
  }
}
