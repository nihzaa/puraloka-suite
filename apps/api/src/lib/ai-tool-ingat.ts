/**
 * MENGINGAT SELURUH PERCAKAPAN — dengan MENCARI, bukan membawa semuanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN "KIRIM SEMUA RIWAYAT KE PROMPT"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-16: "saya mau asisten itu bisa mengingat seluruh percakapan".
 *
 * Cara paling harfiah — memuat seluruh `ai_pesan` ke tiap prompt — ditolak,
 * dan alasannya bukan kehati-hatian:
 *
 *   · riwayat dikirim ULANG tiap ronde. Percakapan yang tumbuh membuat tiap
 *     giliran berikutnya lebih mahal, dan biayanya naik KUADRATIK, bukan
 *     linear. Pengguna paling aktif jadi yang paling mahal — persis terbalik
 *     dari yang seharusnya.
 *   · jendela konteks punya batas keras. Yang gagal bukan pemuatannya
 *     melainkan panggilan BERIKUTNYA, dengan galat yang tak menyebut sebabnya.
 *   · sebagian besar percakapan lama TAK relevan dengan pertanyaan sekarang.
 *     Membawanya bukan "ingatan", melainkan kebisingan yang membuat model
 *     mencampur konteks lama ke jawaban baru.
 *
 * Yang dipakai: **ingatan sebagai TOOL**. Asisten mencarinya saat butuh —
 * "kemarin kita bahas apa soal Cimahi?" — dan yang masuk prompt hanya
 * potongan yang benar-benar cocok.
 *
 * Ini juga cara manusia mengingat: kita tak memutar ulang seluruh hidup tiap
 * kali bicara; kita mengingat SAAT ditanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BATAS YANG TETAP BERLAKU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pencarian disaring `user_id` DI BASIS — bukan di memori. Percakapan orang
 * lain di tenant yang sama tak pernah terbaca, sekalipun katanya cocok.
 *
 * Itu berbeda dari `ai_ingatan` (fakta yang sengaja dibagikan, dengan
 * `izin_minimum`-nya sendiri). Yang di sini isi OBROLAN — dan obrolan orang
 * lain bukan milik siapa pun selain mereka, berapa pun izinnya.
 */

import type { DefinisiToolAi, KonteksTool } from './ai-tool-dasar.js'
import { bungkusData, potong } from './ai-tool-dasar.js'

/** Maksimal potongan yang dikembalikan — biaya, bukan kesopanan. */
const MAKS_HASIL = 12

/** Panjang tiap potongan. Cukup untuk mengenali konteks, tak cukup jadi beban. */
const PANJANG_POTONG = 400

interface BarisPesan {
  teks: string | null
  peran: string
  dibuat_pada: string
  percakapan_id: string
}

export const toolIngatPercakapan: DefinisiToolAi = {
  nama: 'ingat_percakapan',
  label: 'Mengingat percakapan lalu',
  keterangan:
    'Mencari percakapan LAMA Anda dengan pengguna ini — semua percakapan, bukan hanya yang ' +
    'sedang berjalan. Pakai untuk "kemarin kita bahas apa", "dulu saya pernah bilang", ' +
    '"apa yang sudah kita putuskan soal X", atau saat pengguna merujuk sesuatu yang tak ada ' +
    'di percakapan sekarang. Kosongkan `kata_kunci` untuk melihat ringkasan percakapan terakhir.',
  izin: 'ai:chat',
  skema: {
    type: 'object',
    properties: {
      kata_kunci: {
        type: 'string',
        description:
          'Kata yang dicari di isi percakapan (mis. nama proyek, "kasbon", "harga semen"). '
          + 'Kosongkan untuk daftar percakapan terakhir.',
      },
    },
  },
  async jalan({ db, userId }: KonteksTool, argumen) {
    const kunci = typeof argumen.kata_kunci === 'string' ? argumen.kata_kunci.trim() : ''

    /*
     * Percakapan MILIK ORANG INI saja — disaring di basis.
     *
     * `user_id` ikut di WHERE, bukan difilter sesudah dibaca: obrolan orang
     * lain tak boleh pernah sampai ke memori proses ini, apalagi ke prompt.
     */
    const { data: pcp, error: errPcp } = await db
      .from('ai_percakapan')
      .select('id, judul, kanal, dibuat_pada')
      .eq('user_id', userId)
      .order('dibuat_pada', { ascending: false })
      .limit(200)

    if (errPcp) {
      return { isi: `Gagal membaca percakapan: ${errPcp.message}`, isError: true, entitas: [] }
    }

    const daftarPcp = (pcp ?? []) as unknown as Array<{
      id: string; judul: string | null; kanal: string; dibuat_pada: string
    }>

    if (daftarPcp.length === 0) {
      return {
        isi: bungkusData('ingatan', 'Belum ada percakapan tersimpan dengan pengguna ini.'),
        isError: false,
        entitas: [],
      }
    }

    // ── Tanpa kata kunci: ringkasan percakapan terakhir ─────────────────────
    if (!kunci) {
      const { data: tampil, dipotong } = potong(daftarPcp)
      return {
        isi: bungkusData(
          'ingatan',
          `${daftarPcp.length} percakapan tersimpan:\n` +
            tampil
              .map(
                (p) =>
                  `· ${String(p.dibuat_pada).slice(0, 10)} [${p.kanal}] ` +
                  (p.judul || '(tanpa judul)'),
              )
              .join('\n') +
            '\n\nSebut kata kuncinya untuk mencari isi percakapannya.',
          dipotong,
        ),
        isError: false,
        entitas: [],
      }
    }

    const idMilikku = daftarPcp.map((p) => p.id)
    const judulPer = new Map(daftarPcp.map((p) => [p.id, p.judul]))

    /*
     * Pencocokan di APLIKASI, bukan lewat `.ilike()`.
     *
     * Kata kunci datang dari model, dan teks yang model karang bisa memuat
     * karakter yang jadi wildcard PostgREST (`%`, `*`, koma pemisah filter).
     * Pola yang sama dengan `idProyek()` di `ai-tool-konstruksi.ts`.
     */
    const { data: pesan, error: errPesan } = await db
      .from('ai_pesan')
      .select('teks, peran, dibuat_pada, percakapan_id')
      .in('percakapan_id', idMilikku)
      .order('dibuat_pada', { ascending: false })
      .limit(500)

    if (errPesan) {
      return { isi: `Gagal membaca pesan: ${errPesan.message}`, isError: true, entitas: [] }
    }

    const kunciKecil = kunci.toLowerCase()
    const cocok = ((pesan ?? []) as unknown as BarisPesan[])
      .filter((m) => (m.teks ?? '').toLowerCase().includes(kunciKecil))
      .slice(0, MAKS_HASIL)

    if (cocok.length === 0) {
      return {
        isi: bungkusData(
          'ingatan',
          `Tak ada percakapan yang menyebut '${kunci}'. ` +
            'Jangan mengarang isinya — katakan saja belum pernah dibahas.',
        ),
        isError: false,
        entitas: [],
      }
    }

    /*
     * Potongan dipangkas DI SEKITAR kata kuncinya, bukan dari awal pesan.
     *
     * Pesan panjang yang menyebut kata kunci di kalimat terakhir akan terpotong
     * habis kalau diambil dari depan — dan yang tersisa justru bagian yang tak
     * relevan, sambil terlihat seperti jawaban.
     */
    const petik = (teks: string): string => {
      const i = teks.toLowerCase().indexOf(kunciKecil)
      if (i < 0 || teks.length <= PANJANG_POTONG) return teks.slice(0, PANJANG_POTONG)
      const mulai = Math.max(0, i - Math.floor(PANJANG_POTONG / 3))
      return (mulai > 0 ? '…' : '') + teks.slice(mulai, mulai + PANJANG_POTONG) + '…'
    }

    return {
      isi: bungkusData(
        'ingatan',
        `${cocok.length} potongan percakapan menyebut '${kunci}' (terbaru dulu):\n\n` +
          cocok
            .map((m) => {
              const judul = judulPer.get(m.percakapan_id)
              return (
                `[${String(m.dibuat_pada).slice(0, 10)}` +
                (judul ? ` · ${judul}` : '') +
                `] ${m.peran === 'user' ? 'Pengguna' : 'Anda'}: ${petik(m.teks ?? '')}`
              )
            })
            .join('\n\n'),
      ),
      isError: false,
      entitas: [],
    }
  },
}
