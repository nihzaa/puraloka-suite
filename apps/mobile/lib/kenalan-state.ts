/**
 * Penanda perkenalan — dengan salinan SINKRON di memori.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TAK CUKUP `storage` SAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `storage.get()` memulangkan Promise. Saat pengguna menekan "Lewati":
 *
 *     kenalan.tsx   storage.set(...)      → tertulis
 *     kenalan.tsx   router.replace(login) → berpindah
 *     _layout.tsx   storage.get(...)      → Promise, BELUM selesai
 *     _layout.tsx   kenalanSelesai masih false
 *     _layout.tsx   router.replace(kenalan) ← MEMANTULKAN KEMBALI
 *
 * Terukur 2026-09-05 lewat `history.replaceState`: dua panggilan
 * `→ /kenalan` berturut-turut sesudah klik. Penandanya BENAR tersimpan
 * (`puraloka_kenalan_selesai=1`, terverifikasi di localStorage) — jadi
 * memeriksa penyimpanan tak akan menemukan apa pun yang salah.
 *
 * Lingkaran yang tak bisa ditinggalkan, dengan nol galat dan data yang
 * benar. Yang menemukannya cuma mencoba menekan tombolnya.
 *
 * ── Yang diperbaiki salinan ini
 *
 * `sudahKenalan()` menjawab SEKETIKA — tanpa await, tanpa balapan. Ia
 * diisi sekali dari penyimpanan saat aplikasi dimulai, lalu diperbarui
 * langsung saat pengguna menyelesaikan/melewati perkenalan.
 *
 * Penyimpanan tetap sumber kebenarannya lintas-sesi; salinan ini hanya
 * menutup jendela beberapa milidetik tempat balapan itu hidup.
 */
import { storage } from './storage'

export const KUNCI_KENALAN = 'puraloka_kenalan_selesai'

/** `null` = belum dibaca dari penyimpanan. */
let salinan: boolean | null = null

/** Jawaban seketika. `null` berarti belum tahu — JANGAN dibaca sebagai "belum". */
export function sudahKenalan(): boolean | null {
  return salinan
}

/** Dibaca sekali saat aplikasi mulai. Gagal baca → dianggap SUDAH. */
export async function muatKenalan(): Promise<boolean> {
  if (salinan !== null) return salinan
  try {
    salinan = (await storage.get(KUNCI_KENALAN)) === '1'
  } catch {
    /*
      Gagal membaca penyimpanan diperlakukan sebagai SUDAH selesai.

      Yang lebih buruk daripada melewatkan perkenalan adalah mengurung
      pengguna di dalamnya: kalau penyimpanan rusak, "belum selesai"
      berarti perkenalan muncul tiap kali DAN tandanya tak pernah bisa
      disimpan.
    */
    salinan = true
  }
  return salinan
}

/** Ditandai saat perkenalan selesai atau dilewati — salinan lebih dulu. */
export async function tandaiKenalanSelesai(): Promise<void> {
  salinan = true
  try {
    await storage.set(KUNCI_KENALAN, '1')
  } catch {
    console.warn('[kenalan] gagal menyimpan tanda — akan muncul lagi lain kali')
  }
}
