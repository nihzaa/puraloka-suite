/**
 * PUSH NATIF (Expo) — membangunkan HP, yang Web Push tak bisa lakukan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA, PADAHAL `webpush.ts` SUDAH LENGKAP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Catatan Peta Modul `mb-notif` berbunyi *"Web Push sudah dikonfigurasi; belum
 * diverifikasi di perangkat nyata"* — dan kalimat itu mengirim orang ke arah
 * yang salah. Diukur 2026-08-16:
 *
 *   Web Push LENGKAP end-to-end. `webpush.ts` terpanggil dari corong
 *   `notifications.ts:369`, endpoint subscribe hidup, service worker
 *   terpasang. Tak ada yang perlu "diverifikasi".
 *
 *   Yang HILANG adalah push natif. `apps/mobile` tak punya `expo-notifications`
 *   sama sekali (nol kecocokan di package.json), dan layar notifikasinya MURNI
 *   TARIK: GET saat mount + tarik-untuk-segarkan. HP-nya tak pernah
 *   dibangunkan.
 *
 * Web Push TIDAK sampai ke React Native, dan ini bukan soal konfigurasi:
 * `sw.js` adalah service worker peramban, dan React Native tak menjalankan
 * service worker sama sekali. Tak ada VAPID key yang bisa menjembataninya.
 *
 * ── Kenapa `fetch` mentah, bukan `expo-server-sdk`
 *
 * API-nya satu endpoint POST dengan badan JSON, dan SDK-nya menambah satu
 * dependensi beserta versinya yang harus diikuti. Yang benar-benar berguna
 * dari SDK — pemotongan batch 100 dan pengenalan `DeviceNotRegistered` —
 * keduanya ada di bawah, masing-masing dengan alasannya tertulis di tempat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PAGAR TERHADAP TEST — WAJIB, dan ini alasannya bukan basa-basi
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Modul ini dipanggil dari corong `createNotifications()`, persis jalur yang
 * membocorkan belasan WhatsApp sungguhan tiap `vitest run` pada 2026-08-14 —
 * enam berkas test mengira sedang menguji retensi dan approval. Pagar
 * `NODE_ENV === 'test'` di bawah ditegakkan `audit-saluran-keluar-berpagar.mjs`
 * dengan ambang NOL.
 *
 * Bedanya dengan kebocoran WhatsApp: push ke HP tak bisa ditarik kembali DAN
 * membangunkan orang. Notifikasi "KASBON BARU DIAJUKAN" pukul 2 pagi karena
 * CI berjalan adalah kegagalan yang dirasakan penggunanya secara harfiah.
 */

import { supabase } from './supabase.js'

const EXPO_URL = 'https://exp.host/--/api/v2/push/send'

/**
 * Expo menerima maksimal 100 pesan per permintaan. Melebihinya bukan galat
 * yang jelas — ia membalas 400 untuk SELURUH batch, jadi 101 penerima berarti
 * 101 notifikasi hilang, bukan satu.
 */
const BATAS_BATCH = 100

export interface MuatanPushNatif {
  title: string
  message: string
  action_url?: string
}

interface TiketExpo {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

/** Bentuk token Expo yang sah. Diperiksa sebelum disimpan DAN sebelum dikirim. */
export function tokenExpoSah(token: unknown): token is string {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)
}

/**
 * Buang token yang Expo nyatakan MATI.
 *
 * Sepadan dengan penanganan 410/404 di `webpush.ts:70-71`, dengan satu
 * perbedaan penting: di sini barisnya benar-benar DIHAPUS, bukan sekadar
 * dicatat. Alasannya bentuk penyimpanannya berbeda — `push_subscription`
 * adalah kolom yang akan tertimpa langganan berikutnya, sementara baris di
 * `perangkat_pengguna` akan tinggal selamanya kalau tak dibuang, dan tiap
 * notifikasi berikutnya membawa satu kegagalan yang tak pernah berkurang.
 *
 * Aplikasi yang dicopot pemakainya tak pernah "berlangganan ulang" untuk
 * menimpanya. Token mati adalah sampah permanen sampai dihapus.
 */
async function buangTokenMati(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return
  const { error } = await supabase
    .from('perangkat_pengguna')
    .delete()
    .in('token', tokens)

  // Kegagalan pembersihan DICATAT, tidak ditelan (`audit-catch-senyap.mjs`).
  // Ia tak fatal — notifikasi berikutnya akan mencoba membuangnya lagi — tapi
  // pembersihan yang gagal diam-diam berarti daftar token membusuk tanpa
  // seorang pun tahu.
  if (error) {
    console.error('[push-natif] gagal membuang token mati:', error.message)
    return
  }
  console.warn(`[push-natif] ${tokens.length} token mati dibuang (DeviceNotRegistered)`)
}

/**
 * Kirim satu batch (≤100) ke Expo, lalu buang token yang dinyatakan mati.
 *
 * Memulangkan jumlah yang BERHASIL — dipakai test untuk membuktikan satu
 * perangkat gagal tak menjatuhkan yang lain.
 */
async function kirimBatch(tokens: string[], muatan: MuatanPushNatif): Promise<number> {
  const pesan = tokens.map((to) => ({
    to,
    title: muatan.title,
    body: muatan.message,
    sound: 'default',
    // `data` dibaca aplikasi saat notifikasinya diketuk, untuk membuka layar
    // yang tepat alih-alih beranda.
    data: muatan.action_url ? { action_url: muatan.action_url } : {},
  }))

  let res: Response
  try {
    res = await fetch(EXPO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(pesan),
    })
  } catch (err) {
    // Jaringan mati. Dicatat, tidak dilempar — push tak boleh menjatuhkan
    // alur utama yang sudah sah (kasbon yang sudah disetujui tetap disetujui).
    console.error('[push-natif] gagal menghubungi Expo:', (err as Error)?.message)
    return 0
  }

  if (!res.ok) {
    console.error(`[push-natif] Expo membalas ${res.status} untuk ${tokens.length} token`)
    return 0
  }

  let badan: { data?: TiketExpo[] }
  try {
    badan = (await res.json()) as { data?: TiketExpo[] }
  } catch (err) {
    console.error('[push-natif] balasan Expo tak bisa diurai:', (err as Error)?.message)
    return 0
  }

  const tiket = badan.data ?? []
  const mati: string[] = []
  let berhasil = 0

  // ⚠️ Tiket dicocokkan lewat INDEKS, karena balasan Expo tak menyertakan
  // tokennya. Urutan tiket = urutan pesan yang dikirim; itu kontraknya.
  //
  // Kegagalan SATU tiket TIDAK menghentikan pemrosesan tiket lain — inilah
  // yang membuat satu perangkat mati tak membungkam perangkat lain milik orang
  // yang sama. Kalau dilempar di sini, satu token basi akan menelan seluruh
  // notifikasi untuk seluruh penerima.
  tiket.forEach((t, i) => {
    if (t.status === 'ok') {
      berhasil += 1
      return
    }
    const sebab = t.details?.error
    if (sebab === 'DeviceNotRegistered') {
      mati.push(tokens[i])
    } else {
      // Galat lain (mis. MessageTooBig, MessageRateExceeded) TIDAK menghapus
      // token: perangkatnya masih sah, yang salah pesannya atau lajunya.
      // Menghapusnya berarti membungkam HP yang sehat karena satu pesan
      // kepanjangan.
      console.error(`[push-natif] tiket galat (${sebab ?? 'tak disebut'}): ${t.message ?? ''}`)
    }
  })

  await buangTokenMati(mati)
  return berhasil
}

/**
 * Kirim push natif ke seluruh perangkat milik daftar pengguna.
 *
 * Fire-and-forget dari sisi pemanggil — sepadan dengan `sendWebPushToUsers`.
 * Tak pernah melempar: seluruh galat dicatat di dalam.
 */
export async function kirimPushNatifKeUsers(
  userIds: string[],
  muatan: MuatanPushNatif,
): Promise<number> {
  if (userIds.length === 0) return 0

  // ── PAGAR TERHADAP TEST ──────────────────────────────────────────────────
  //
  // Ditegakkan `audit-saluran-keluar-berpagar.mjs` (ambang NOL). Diletakkan
  // SEBELUM query DB, bukan hanya sebelum `fetch`: test tak perlu membayar
  // perjalanan ke basis untuk sesuatu yang pasti tak dikirim.
  //
  // Fungsi ini tetap bisa diuji — `kirimBatch` dan `buangTokenMati` diuji
  // lewat `globalThis.fetch` tiruan, jalur yang tak melewati pagar ini.
  if (process.env.NODE_ENV === 'test') return 0

  try {
    const { data, error } = await supabase
      .from('perangkat_pengguna')
      .select('token')
      .in('user_id', userIds)

    // Error DIPERIKSA, bukan diabaikan (`audit-kegagalan-senyap.mjs`).
    if (error) {
      console.error('[push-natif] gagal membaca perangkat:', error.message)
      return 0
    }

    // Token disaring lagi di sini meski sudah divalidasi saat mendaftar.
    // Baris warisan atau baris yang masuk lewat jalur lain tetap mungkin
    // cacat, dan satu token tak sah menggagalkan SELURUH batch di sisi Expo —
    // bukan hanya dirinya.
    const tokens = (data ?? [])
      .map((r: { token: string }) => r.token)
      .filter(tokenExpoSah)

    if (tokens.length === 0) return 0

    let total = 0
    for (let i = 0; i < tokens.length; i += BATAS_BATCH) {
      total += await kirimBatch(tokens.slice(i, i + BATAS_BATCH), muatan)
    }
    return total
  } catch (err) {
    console.error('[push-natif] kirimPushNatifKeUsers error:', (err as Error)?.message)
    return 0
  }
}

/** Diekspor hanya untuk test — bukan bagian antarmuka yang dipakai rute. */
export const _internal = { kirimBatch, buangTokenMati, BATAS_BATCH }
