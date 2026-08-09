/**
 * AGENT LOOP — model memanggil tool, berulang, sampai menjawab.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * C-4: RONDE TERAKHIR DIKIRIM TANPA TOOLS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS menghentikan loop begitu ronde habis, dan mengembalikan apa pun yang ada
 * — yang pada ronde terakhir biasanya `tool_use`, bukan teks. Pengguna melihat
 * **balasan kosong**, dan tak ada galat di mana pun: modelnya menjawab dengan
 * benar, hanya saja jawabannya berupa permintaan tool yang tak pernah dijawab.
 *
 * Di sini ronde terakhir dikirim **tanpa `tools`**. Model yang tak punya tool
 * tak bisa meminta tool; ia terpaksa merangkum dari yang sudah ia punya. Satu
 * panggilan ekstra jauh lebih murah daripada jawaban kosong yang membuat
 * pengguna mengulang pertanyaannya — dan pengulangan itu memakai token juga.
 *
 * ── Galat tool dikembalikan sebagai isError, tidak dilempar
 *
 * Tool yang gagal bukan sistem yang rusak. Model harus TAHU tool-nya gagal
 * supaya bisa mencoba cara lain atau mengatakannya jujur. Melempar dari sini
 * mengubah kegagalan satu tool jadi kegagalan seluruh percakapan.
 *
 * ── Biaya dicatat per RONDE
 *
 * Bukan per pesan. Satu pertanyaan bisa memicu beberapa ronde, dan mencatat
 * per pesan menyembunyikan yang lain — itu cacat TJS yang `ai_biaya_token`
 * perbaiki. Loop ini memanggil `catatRonde` tiap putaran.
 */

import type { AdaptorPenyedia, HasilTool, PesanChat } from './ai-penyedia.js'
import { jalankanTool, katalogUntuk, type KonteksTool } from './ai-tool.js'

/**
 * Batas ronde.
 *
 * Empat, bukan enam belas seperti TJS. Tool di sini semuanya membaca dan
 * pertanyaannya bersifat operasional ("berapa yang lewat tempo"), jadi lebih
 * dari empat ronde hampir selalu berarti model tersesat — dan tiap ronde
 * ditagih. Kalau kelak ada tool yang menuntut penelusuran bertingkat, angka
 * ini dinaikkan SADAR, bukan dibiarkan besar sejak awal.
 */
export const MAKS_RONDE = 4

export interface HasilLoop {
  ok: boolean
  teks: string
  /** Alasan berhenti — untuk log dan untuk UI, bukan untuk ditebak. */
  alasan: 'selesai' | 'ronde_habis' | 'gagal_penyedia'
  ronde: number
  /** SELURUH blok tiap ronde, untuk disimpan ke `ai_pesan.blok` (C-5). */
  blok: unknown[]
  /** Entitas yang benar-benar dibaca tool — dipakai I-4. */
  entitas: string[]
  adaGalatTool: boolean
  /** Pesan gagal penyedia, kalau ada. */
  pesanGagal?: string
}

export interface OpsiLoop {
  adaptor: AdaptorPenyedia
  model: string
  maxToken: number
  sistem: string
  pesan: PesanChat[]
  konteksTool: KonteksTool
  /** Dipanggil TIAP ronde, sebelum ronde berikutnya dimulai. */
  catatRonde: (pemakaian: { masuk: number; keluar: number; cacheTulis: number; cacheBaca: number }, ronde: number) => Promise<void>
  maksRonde?: number
}

export async function jalankanLoop(opsi: OpsiLoop): Promise<HasilLoop> {
  const maksRonde = opsi.maksRonde ?? MAKS_RONDE
  const katalog = katalogUntuk(opsi.konteksTool.izin)

  const pesan: PesanChat[] = [...opsi.pesan]
  const blokSemua: unknown[] = []
  const entitas: string[] = []
  let adaGalatTool = false
  let hasilTool: HasilTool[] | undefined

  for (let ronde = 1; ronde <= maksRonde; ronde++) {
    // C-4: ronde TERAKHIR tanpa tools. Model yang tak punya tool tak bisa
    // meminta tool — ia terpaksa merangkum dari yang sudah ia punya, alih-alih
    // mengembalikan `tool_use` yang tak akan pernah dijawab.
    const rondeTerakhir = ronde === maksRonde
    const jawab = await opsi.adaptor.chat({
      model: opsi.model,
      maxToken: opsi.maxToken,
      sistem: opsi.sistem,
      pesan,
      tools: rondeTerakhir || katalog.length === 0
        ? undefined
        : katalog.map((t) => ({ nama: t.nama, keterangan: t.keterangan, skema: t.skema })),
      hasilTool,
    })

    if (!jawab.ok) {
      return {
        ok: false,
        teks: '',
        alasan: 'gagal_penyedia',
        ronde,
        blok: blokSemua,
        entitas,
        adaGalatTool,
        pesanGagal: jawab.pesan,
      }
    }

    // Biaya dicatat TIAP ronde, sebelum memutuskan lanjut atau berhenti.
    // Mencatatnya hanya di akhir berarti percakapan yang putus di tengah
    // tercatat nol — padahal tokennya sudah terpakai dan sudah ditagih.
    await opsi.catatRonde(jawab.pemakaian, ronde)

    blokSemua.push({
      ronde,
      teks: jawab.teks,
      panggilanTool: jawab.panggilanTool,
    })

    if (jawab.berhentiKarena !== 'butuh_tool' || jawab.panggilanTool.length === 0) {
      return {
        ok: true,
        teks: jawab.teks,
        alasan: rondeTerakhir && jawab.berhentiKarena === 'butuh_tool' ? 'ronde_habis' : 'selesai',
        ronde,
        blok: blokSemua,
        entitas,
        adaGalatTool,
      }
    }

    // ── Jalankan tool yang diminta ────────────────────────────────────────
    hasilTool = []
    for (const panggilan of jawab.panggilanTool) {
      const hasil = await jalankanTool(opsi.konteksTool, panggilan.nama, panggilan.argumen)

      if (!hasil.ok) {
        // Tool tak dikenal / izin ditolak dikembalikan KE MODEL sebagai
        // kegagalan tool, bukan dilempar. Model perlu tahu supaya bisa
        // mengatakannya jujur alih-alih mengarang jawaban.
        adaGalatTool = true
        hasilTool.push({ id: panggilan.id, isi: hasil.pesan, isError: true })
        continue
      }

      if (hasil.hasil.isError) adaGalatTool = true
      entitas.push(...hasil.hasil.entitas)
      hasilTool.push({ id: panggilan.id, isi: hasil.hasil.isi, isError: hasil.hasil.isError })
    }

    blokSemua.push({ ronde, hasilTool })

    // Pesan asisten ronde ini disimpan BESERTA blok panggilan tool-nya (C-5).
    //
    // `panggilanTool` bukan hiasan: tanpa itu Anthropic menolak ronde
    // berikutnya dengan 400 — "Each `tool_result` block must have a
    // corresponding `tool_use` block in the previous message". Versi pertama
    // mengirim teks datar '(memanggil tool)' dan ronde 1 berhasil sementara
    // ronde 2 gagal, bentuk kegagalan yang gampang disalahartikan sebagai
    // penyedia bermasalah.
    pesan.push({
      peran: 'assistant',
      isi: jawab.teks,
      panggilanTool: jawab.panggilanTool,
    })

    // Hasil tool masuk ke RIWAYAT, bukan hanya diteruskan lewat `hasilTool`.
    //
    // Diukur: `hasilTool` ditambahkan adaptor sebagai pesan TERAKHIR, sementara
    // pesan asisten ronde ini baru di-push sesudahnya. Pada ronde 1→2 urutannya
    // kebetulan benar; pada ronde 3 ia terbalik — dua `tool_use` berturut tanpa
    // `tool_result` di antaranya, dan Anthropic menolak 400.
    //
    // Menaruhnya di riwayat membuat urutannya benar untuk ronde ke berapa pun,
    // alih-alih benar untuk dua ronde pertama saja.
    pesan.push({
      peran: 'user',
      isi: '',
      hasilTool,
    })
    hasilTool = undefined
  }

  // Tak seharusnya tercapai: ronde terakhir dikirim tanpa tools, jadi ia selalu
  // berhenti di `return` dalam loop. Dipertahankan supaya perubahan pada batas
  // ronde tak diam-diam menghasilkan `undefined`.
  return {
    ok: true,
    teks: '',
    alasan: 'ronde_habis',
    ronde: maksRonde,
    blok: blokSemua,
    entitas,
    adaGalatTool,
  }
}

/**
 * I-4 — entitas yang disebut jawaban tapi TIDAK pernah dikembalikan tool.
 *
 * Injeksi yang berhasil biasanya meninggalkan jejak: model membicarakan sesuatu
 * yang tak pernah ia ambil. Yang dicari di sini pola pengenal dokumen
 * (PO-2026-0412, MR-…, INV-…) — bentuk yang paling mungkin dipakai penyerang
 * karena ia harus menyebut dokumen tertentu agar perintahnya berarti.
 *
 * Hasilnya PERINGATAN, bukan pemblokiran. Model bisa saja menyebut nomor yang
 * pengguna sendiri ketik di pertanyaannya, dan memblokir itu akan membuat
 * asisten menolak pertanyaan yang wajar. Yang dituju: jejaknya terlihat.
 */
export function entitasTakDikenal(teks: string, entitasTool: string[]): string[] {
  const dikenal = new Set(entitasTool.map((e) => e.toUpperCase()))
  const pola = /\b(?:PO|MR|INV|SPK|BA|NCR)[-/][A-Z0-9-/]{2,}/gi
  const disebut = teks.match(pola) ?? []
  const asing = new Set<string>()
  for (const d of disebut) {
    if (!dikenal.has(d.toUpperCase())) asing.add(d)
  }
  return [...asing]
}
