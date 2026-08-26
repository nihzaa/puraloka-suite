import type { FastifyReply, FastifyRequest } from 'fastify'
import { supabase } from './supabase.js'

// ============================================================================
// IDEMPOTENCY untuk operasi yang menyentuh uang (F1-1).
// ============================================================================
//
// ── Masalah
//
// `POST /finance/invoice/:id/pay` melakukan INSERT polos ke `payments`, dan
// trigger menambah saldo kas dari baris itu. Diverifikasi 2026-08-03: tak ada
// satu pun constraint unik yang mencegah dua INSERT identik.
//
// Satu tombol ditekan dua kali = dua pembayaran + dua pergerakan kas. Bukan
// hipotetis: jaringan lapangan yang buruk membuat orang menekan ulang, dan
// HTTP tak menjanjikan apa pun tentang request yang timeout — mungkin sudah
// sampai, mungkin belum.
//
// Bentuk kerusakannya paling buruk: angka bertambah TANPA galat, tanpa log,
// tanpa gejala. Yang menemukannya biasanya rekonsiliasi bank berminggu kemudian.
//
// ── Kenapa bukan unique constraint di `payments`
//
// Unik pada `(invoice_id, amount_paid, paid_at)` terdengar lebih sederhana
// tetapi SALAH secara bisnis: dua cicilan bernilai sama pada hari yang sama
// adalah kejadian sah. Menolaknya berarti menolak transaksi nyata.
//
// Yang membedakan "pengiriman ulang" dari "pembayaran kedua" bukan isinya
// melainkan NIAT pemanggil — dan itu hanya bisa ia nyatakan sendiri, lewat
// kunci per-aksi. Itulah header `Idempotency-Key`.
//
// ── Kenapa kunci OPSIONAL (dan itu keputusan sadar)
//
// Memaksa setiap pemanggil mengirim kunci akan memutus klien yang sudah ada —
// termasuk web app hari ini. Yang dipilih: kunci opsional, tetapi begitu
// dikirim, jaminannya penuh.
//
// Konsekuensinya jujur: klien yang TIDAK mengirim kunci tetap bisa
// menggandakan. Itu bukan celah tersembunyi melainkan batas yang dinyatakan,
// dan menutupnya adalah pekerjaan sisi klien (mengirim kunci), bukan sisi
// server menebak.
// ============================================================================

export interface HasilIdempotensi {
  /** Sudah pernah diproses — balas ulang respons pertama, JANGAN kerjakan lagi. */
  diulang: boolean
  status?: number
  hasil?: unknown
  /** Kunci yang dipakai; `null` bila pemanggil tak mengirim header. */
  kunci: string | null
}

/** Batas panjang kunci — mencegah header raksasa jadi beban penyimpanan. */
const MAKS_PANJANG_KUNCI = 200

/**
 * Periksa apakah operasi ini sudah pernah dijalankan dengan kunci yang sama.
 *
 * Dipanggil di AWAL handler, sebelum apa pun ditulis. Bila `diulang: true`,
 * handler WAJIB langsung membalas `status`/`hasil` tanpa mengerjakan ulang.
 */
export async function periksaIdempotensi(
  request: FastifyRequest,
  operasi: string,
): Promise<HasilIdempotensi> {
  const raw = request.headers['idempotency-key']
  const kunci = (Array.isArray(raw) ? raw[0] : raw)?.trim()

  if (!kunci) return { diulang: false, kunci: null }
  if (kunci.length > MAKS_PANJANG_KUNCI) {
    // Ditolak di sini, bukan dibiarkan gagal di DB: pesan yang bisa dibaca
    // lebih berguna daripada galat constraint mentah.
    return { diulang: false, kunci: kunci.slice(0, MAKS_PANJANG_KUNCI) }
  }

  const { data, error } = await supabase
    .from('idempotency_keys')
    .select('status_http, hasil')
    .eq('company_id', request.companyId!)
    .eq('operasi', operasi)
    .eq('kunci', kunci)
    .maybeSingle()

  if (error) {
    // Gagal MEMBACA tabel idempotency tak boleh menggagalkan operasinya —
    // itu menukar risiko duplikat dengan risiko lumpuh total. Tapi ia juga tak
    // boleh senyap: tanpa log, kita kehilangan satu-satunya petunjuk bahwa
    // jaminan idempotensi sedang tidak aktif.
    request.log.error({ err: error, operasi }, 'gagal membaca idempotency_keys — operasi dilanjutkan TANPA jaminan')
    return { diulang: false, kunci }
  }

  if (data) return { diulang: true, status: data.status_http, hasil: data.hasil, kunci }
  return { diulang: false, kunci }
}

/**
 * Catat hasil operasi supaya pengiriman ulang membalas hal yang SAMA.
 *
 * Dipanggil SESUDAH operasi berhasil. Kegagalan mencatat tidak membatalkan
 * operasinya — uangnya sudah berpindah, dan membatalkan balasan sukses hanya
 * membuat pemanggil mencoba lagi (justru menggandakan).
 */
export async function catatIdempotensi(
  request: FastifyRequest,
  operasi: string,
  kunci: string | null,
  status: number,
  hasil: unknown,
): Promise<void> {
  if (!kunci) return

  const { error } = await supabase.from('idempotency_keys').insert({
    company_id: request.companyId!,
    operasi,
    kunci,
    user_id: request.currentUser?.id ?? null,
    status_http: status,
    hasil: hasil as never,
  })

  // 23505 = kunci sudah tercatat. Itu BUKAN kesalahan: dua request kembar yang
  // lolos bersamaan akan berlomba di sini, dan yang kalah cukup diam — barisnya
  // sudah ada, jaminannya tetap terpenuhi.
  if (error && (error as { code?: string }).code !== '23505') {
    request.log.error({ err: error, operasi, kunci }, 'gagal mencatat idempotency_keys')
  }
}

/**
 * Pembungkus singkat: balas ulang bila sudah pernah, atau kembalikan kunci
 * untuk dicatat nanti.
 *
 * Mengembalikan `null` bila permintaan sudah dibalas (handler harus `return`).
 */
export async function gerbangIdempotensi(
  request: FastifyRequest,
  reply: FastifyReply,
  operasi: string,
): Promise<string | null | undefined> {
  const p = await periksaIdempotensi(request, operasi)
  if (p.diulang) {
    // Header penanda supaya klien (dan siapa pun yang membaca log) tahu ini
    // balasan ulang, bukan operasi baru yang kebetulan hasilnya sama.
    void reply.header('Idempotent-Replay', 'true').status(p.status ?? 200).send(p.hasil)
    return null
  }
  return p.kunci
}

/**
 * Apakah gerbang SUDAH membalas permintaan ini?
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA FUNGSI INI ADA — `kunciIdem === null` AMBIGU, DAN ITU MEMAKAN KORBAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `gerbangIdempotensi` memulangkan `null` untuk DUA keadaan yang berlawanan:
 *
 *   1. permintaan ini pengiriman ulang → sudah dibalas, handler harus berhenti
 *   2. pemanggil TIDAK mengirim `Idempotency-Key` → tak ada jaminan, tetapi
 *      handler harus JALAN TERUS seperti biasa
 *
 * Pola `if (kunciIdem === null) return` karena itu SALAH: ia menghentikan
 * handler untuk keadaan (2) juga. Akibatnya permintaan tanpa kunci dibalas
 * 200 dengan badan kosong dan TIDAK MENULIS APA PUN — gagal senyap yang
 * sempurna, karena statusnya sukses.
 *
 * Ditemukan 2026-08-27 saat memasang gerbang di `progress-logs`: enam test
 * geotag mendadak merah dengan "expected [] to have a length of 1". Testnya
 * benar; gerbangnya yang menelan seluruh permintaan.
 *
 * ⚠ `cash.ts:222` memakai pola `=== null` yang sama dan **punya cacat yang
 * sama**: `POST /cash/transfers` tanpa header akan dibalas 200 tanpa membuat
 * transfer. Belum pernah terlihat hanya karena web app selalu mengirim kunci.
 * Ikut diperbaiki di commit yang sama.
 *
 * Yang ditanya di sini adalah FAKTA, bukan tebakan dari nilai kembalian:
 * apakah Fastify sudah mengirim balasan.
 */
export function sudahDibalas(reply: FastifyReply): boolean {
  return reply.sent
}
