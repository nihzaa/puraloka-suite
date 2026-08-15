/**
 * "APA YANG PERLU SAYA URUS HARI INI?" — pekerjaan asisten manusia yang paling
 * sering, dan yang paling belum ada di sini.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MASALAHNYA BUKAN KURANG INFORMASI — MELAINKAN TERLALU BANYAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: **8.049 notifikasi belum dibaca**, 1.509 di antaranya
 * `urgent`, tersebar ke 18 orang.
 *
 * Angka itu sendiri adalah diagnosisnya. Inbox yang tak pernah kosong berhenti
 * dibaca — dan begitu berhenti dibaca, notifikasi ke-8.050 yang benar-benar
 * penting tenggelam bersama 8.049 yang tidak. Menambah notifikasi baru di atas
 * tumpukan itu tak menolong siapa pun.
 *
 * Yang dilakukan asisten manusia: ia TIDAK membacakan seluruh inbox. Ia
 * berkata "tiga hal ini perlu Anda hari ini, sisanya sudah saya urus atau
 * bisa menunggu".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MENGGABUNG, BUKAN MENGURUTKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mengurutkan 8.049 baris berdasarkan prioritas tetap menghasilkan 8.049
 * baris. Yang berguna adalah PENGELOMPOKAN: "3.331 pengajuan kasbon" adalah
 * satu kalimat yang bisa ditindaklanjuti; 3.331 baris bukan.
 *
 * Karena itu keluarannya:
 *
 *   1. yang MENDESAK dan masih menunggu    → disebut satu per satu (maks 8)
 *   2. sisanya                             → diringkas per jenis + jumlah
 *
 * Batas 8 bukan angka cantik: lebih dari itu berhenti terbaca sebagai daftar
 * tindakan dan mulai terbaca sebagai laporan — dan laporan tak dikerjakan
 * siapa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HANYA MILIK PENANYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `notifications.user_id` disaring DI BASIS. "Apa yang perlu saya urus" yang
 * ikut memuat notifikasi orang lain bukan cuma salah — ia membocorkan pekerjaan
 * yang sedang orang lain tangani, lewat prompt, menembus permission check.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData } from './ai-tool-dasar.js'

/** Yang disebut satu per satu. Lebih dari ini berhenti jadi daftar tindakan. */
const MAKS_DISEBUT = 8

/** Umur yang dianggap "menggantung" — bukan kebijakan, sekadar penanda baca. */
const HARI_MENGGANTUNG = 3

interface BarisNotif {
  title: string | null
  message: string | null
  type: string | null
  priority: string | null
  created_at: string | null
  is_actioned: boolean | null
  action_url: string | null
}

/** Nama jenis dalam bahasa orang, bukan nama kolom. */
const LABEL_JENIS: Record<string, string> = {
  kasbon_submitted: 'pengajuan kasbon',
  kasbon_approved: 'kasbon disetujui',
  kasbon_outstanding: 'kasbon belum dipertanggungjawabkan',
  worker_kasbon_reminder: 'pengingat kasbon tukang',
  invoice_created: 'invoice terbit',
  change_order_approved: 'change order disetujui',
}

export const toolPerhatian: DefinisiToolAi = {
  nama: 'perlu_perhatian',
  label: 'Perlu perhatian hari ini',
  keterangan:
    'Ringkasan hal yang PERLU DIURUS oleh pengguna hari ini — disaring dari notifikasinya, ' +
    'yang mendesak disebut satu per satu dan sisanya diringkas per jenis. Pakai untuk ' +
    '"apa kerjaan saya hari ini", "ada yang penting?", "saya ketinggalan apa", atau saat ' +
    'menyapa di pagi hari. JANGAN membacakan seluruh daftar — sebutkan yang mendesak saja.',
  izin: 'ai:chat',
  skema: { type: 'object', properties: {} },
  async jalan({ db, userId }) {
    /*
     * Disaring `user_id` DI BASIS, dan `is_read=false` ikut di WHERE.
     *
     * Membaca semuanya lalu menyaring di memori berarti 8.049 baris melewati
     * jaringan untuk menghasilkan tiga kalimat — dan pada tenant yang lebih
     * ramai, ia terpotong senyap di batas PostgREST.
     */
    const { data, error } = await db
      .from('notifications')
      .select('title, message, type, priority, created_at, is_actioned, action_url')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(400)

    if (error) {
      return { isi: `Gagal membaca notifikasi: ${error.message}`, isError: true, entitas: [] }
    }

    const semua = (data ?? []) as unknown as BarisNotif[]

    if (semua.length === 0) {
      return {
        isi: bungkusData('perlu_perhatian', 'Tak ada yang menunggu perhatian Anda. Inbox bersih.'),
        isError: false,
        entitas: [],
      }
    }

    /*
     * MENDESAK = prioritas urgent/high DAN belum ditindaklanjuti.
     *
     * `is_actioned` ikut karena notifikasi yang sudah ditindaklanjuti tetapi
     * belum ditandai baca adalah keadaan yang sangat umum — dan menyebutnya
     * sebagai "perlu diurus" membuat orang mengerjakan ulang hal yang sudah
     * selesai.
     */
    const mendesak = semua.filter(
      (n) => (n.priority === 'urgent' || n.priority === 'high') && n.is_actioned !== true,
    )

    const sisanya = semua.filter((n) => !mendesak.includes(n))

    const umur = (t: string | null): number =>
      t ? Math.floor((Date.now() - new Date(t).getTime()) / 86_400_000) : 0

    const bagian: string[] = []

    if (mendesak.length > 0) {
      const disebut = mendesak.slice(0, MAKS_DISEBUT)
      bagian.push(
        `MENDESAK (${mendesak.length}):\n` +
          disebut
            .map((n) => {
              const hari = umur(n.created_at)
              return (
                `· ${n.title ?? LABEL_JENIS[n.type ?? ''] ?? n.type ?? 'tanpa judul'}` +
                (n.message ? ` — ${n.message.slice(0, 90)}` : '') +
                (hari >= HARI_MENGGANTUNG ? ` (menggantung ${hari} hari)` : '')
              )
            })
            .join('\n') +
          (mendesak.length > MAKS_DISEBUT
            ? `\n… dan ${mendesak.length - MAKS_DISEBUT} lagi yang mendesak.`
            : ''),
      )
    }

    if (sisanya.length > 0) {
      /*
       * Sisanya DIRINGKAS per jenis, bukan didaftar.
       *
       * "1.180 invoice terbit" adalah satu kalimat yang bisa diputuskan;
       * 1.180 baris adalah laporan yang tak dibaca siapa pun.
       */
      const perJenis = new Map<string, number>()
      for (const n of sisanya) {
        const k = LABEL_JENIS[n.type ?? ''] ?? n.type ?? 'lainnya'
        perJenis.set(k, (perJenis.get(k) ?? 0) + 1)
      }

      const ringkas = [...perJenis.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ')

      bagian.push(`Selebihnya (${sisanya.length}): ${ringkas}.`)
    }

    /*
     * Batas pembacaan DINYATAKAN, tidak disembunyikan.
     *
     * Kalau 400 baris tak cukup, angkanya harus terlihat — "8.049 belum
     * dibaca" yang dilaporkan sebagai "12 hal" tanpa keterangan adalah
     * kebohongan yang paling mudah dipercaya.
     */
    if (semua.length >= 400) {
      bagian.push(
        'Catatan: hanya 400 notifikasi terbaru yang dibaca — jumlah sebenarnya lebih banyak.',
      )
    }

    return {
      isi: bungkusData(
        'perlu_perhatian',
        bagian.join('\n\n') +
          '\n\nSebutkan yang MENDESAK saja kepada pengguna. Jangan membacakan seluruh daftar.',
      ),
      isError: false,
      entitas: [],
    }
  },
}
