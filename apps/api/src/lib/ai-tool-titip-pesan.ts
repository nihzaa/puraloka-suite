/**
 * "TOLONG INGATKAN PAK BUDI" — asisten menyampaikan pesan ke ORANG LAIN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA TOOL YANG MENYENTUH ORANG LAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Semua tool lain membaca, atau menulis catatan milik penanya sendiri. Yang
 * ini mengirim sesuatu ke inbox orang lain — dan itu kelas risiko yang
 * berbeda:
 *
 *   · penerima melihat pesan yang TIDAK ia minta
 *   · pesannya membawa nama pengirim, jadi ia terbaca sebagai perintah atasan
 *   · injeksi lewat dokumen bisa membuat model mengirim pesan yang tak pernah
 *     diucapkan siapa pun
 *
 * Yang menahannya, berlapis:
 *
 *   1. **Izin terpisah** `notifications:rules:manage` — bukan `ai:chat`. Yang boleh
 *      memakai asisten tak otomatis boleh mengirim pesan atas nama orang lain.
 *   2. **Hanya ke SESAMA anggota tenant**, diresolusi dari nama lewat `db`
 *      milik tenant. Model tak pernah menyebut `user_id`.
 *   3. **Pengirim SELALU disebut** di isi pesan. Pesan anonim dari sistem
 *      tak bisa ditindaklanjuti dan tak bisa dibantah.
 *   4. **Nada dijaga**: yang dikirim kalimat pengguna apa adanya, dengan
 *      awalan yang menyatakan ini titipan — bukan keputusan perusahaan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA `notifications`, BUKAN WHATSAPP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * WhatsApp menembus jam istirahat dan tak punya tombol "nanti saja". Gerbang
 * keluar (`lib/gerbang-kirim.ts`) memang ada untuk itu, tetapi ia dirancang
 * untuk pesan sistem yang terjadwal — bukan untuk kalimat yang lahir spontan
 * di tengah percakapan orang lain.
 *
 * `createNotification` sudah punya push, jejak, dan halaman yang menampungnya.
 * Kalau kelak titipan perlu sampai lewat WhatsApp, ia lewat gerbang itu —
 * bukan lewat jalan pintas dari sini.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData } from './ai-tool-dasar.js'

/** Panjang maksimum titipan. Lebih dari ini bukan pesan, melainkan dokumen. */
const MAKS_ISI = 400

export const toolTitipPesan: DefinisiToolAi = {
  nama: 'titip_pesan',
  label: 'Menitip pesan ke rekan',
  keterangan:
    'Menitipkan pesan ke REKAN SEKANTOR — "tolong ingatkan Pak Budi soal invoice", ' +
    '"sampaikan ke Bu Sari besok ada rapat". Pesannya masuk ke notifikasi orang itu, ' +
    'DENGAN nama pengirimnya. Pakai hanya kalau pengguna memang meminta menyampaikan ' +
    'sesuatu; jangan menawarkannya sendiri.',
  izin: 'notifications:rules:manage',
  skema: {
    type: 'object',
    properties: {
      kepada: {
        type: 'string',
        description: 'Nama rekan yang dituju (sebagian nama boleh). BUKAN id.',
      },
      pesan: { type: 'string', description: 'Isi titipan, apa adanya dari pengguna.' },
    },
    required: ['kepada', 'pesan'],
  },
  async jalan({ db, companyId, userId }, argumen) {
    const kepada = typeof argumen.kepada === 'string' ? argumen.kepada.trim() : ''
    const pesan = typeof argumen.pesan === 'string' ? argumen.pesan.trim() : ''

    if (!kepada) {
      return { isi: 'Dititipkan ke siapa? Sebutkan namanya.', isError: true, entitas: [] }
    }
    if (pesan.length < 3) {
      return { isi: 'Isi titipannya apa? Sebutkan sedikit lebih jelas.', isError: true, entitas: [] }
    }
    if (pesan.length > MAKS_ISI) {
      return {
        isi: `Titipan terlalu panjang (${pesan.length} huruf, maksimal ${MAKS_ISI}). `
          + 'Ringkas dulu, atau kirim lewat jalur biasa.',
        isError: true,
        entitas: [],
      }
    }

    /*
     * Penerima diresolusi dari NAMA lewat `company_members` — hanya sesama
     * anggota tenant ini.
     *
     * Model tak pernah menyebut `user_id`: ia AKAN mengarang UUID, dan UUID
     * karangan yang kebetulan cocok berarti pesan terkirim ke orang asing.
     */
    const { data, error } = await db
      .unsafe(
        'company_members',
        'tool AI: mencari rekan sekantor — company_id DINYATAKAN eksplisit di bawah. ' +
          'Kategori D karena keanggotaan lintas-tenant memang mungkin (satu orang bisa ' +
          'jadi anggota beberapa perusahaan), jadi saringannya harus ditulis tangan.',
      )
      /*
       * Relasi DINAMAI lewat nama constraint-nya.
       *
       * `company_members` punya DUA FK ke `users` — `user_id` (anggotanya) dan
       * `created_by` (yang mendaftarkan). `users!inner(...)` karenanya ambigu,
       * dan PostgREST menolaknya: "more than one relationship was found".
       *
       * Menyebut `company_members_user_id_fkey` memilih yang benar. Tanpa itu
       * queryn­ya gagal, dan gagalnya berbunyi "Gagal membaca daftar rekan" —
       * terdengar seperti gangguan basis, bukan seperti query yang salah tulis.
       */
      .select('user_id, users!company_members_user_id_fkey!inner(id, name, email)')
      /*
       * `company_id` DINYATAKAN — ini yang menggantikan saringan wrapper.
       *
       * Tanpa baris ini, "rekan sekantor" mencakup anggota SELURUH perusahaan
       * di basis — dan titipan pesan bisa terkirim ke orang yang tak pernah
       * satu kantor dengan pengirimnya.
       */
      .eq('company_id', companyId)
      .limit(300)

    if (error) {
      return { isi: `Gagal membaca daftar rekan: ${error.message}`, isError: true, entitas: [] }
    }

    type Anggota = { user_id: string; users?: { name?: string; email?: string } | null }
    const semua = (data ?? []) as unknown as Anggota[]

    const kunci = kepada.toLowerCase()
    const cocok = semua.filter((m) => (m.users?.name ?? '').toLowerCase().includes(kunci))

    if (cocok.length === 0) {
      return {
        isi: `Tak ada rekan bernama '${kepada}' di perusahaan ini. `
          + 'JANGAN mengirim ke orang lain yang mirip namanya.',
        isError: true,
        entitas: [],
      }
    }
    if (cocok.length > 1) {
      /*
       * AMBIGU dinyatakan, tak pernah ditebak.
       *
       * Mengirim ke orang yang salah tak bisa ditarik kembali — ia sudah
       * terbaca, dan yang salah kirim tak selalu tahu.
       */
      return {
        isi: bungkusData(
          'titip_pesan',
          `Ada ${cocok.length} rekan yang cocok: ` +
            `${cocok.map((m) => m.users?.name).filter(Boolean).join(', ')}. ` +
            'Minta pengguna menyebut yang mana.',
        ),
        isError: false,
        entitas: cocok.map((m) => m.users?.name ?? '').filter(Boolean),
      }
    }

    const tujuan = cocok[0]
    if (tujuan.user_id === userId) {
      // Menitip ke diri sendiri adalah pengingat, dan pengingat punya toolnya.
      return {
        isi: 'Itu Anda sendiri — pakai `titip_pengingat` kalau ingin diingatkan.',
        isError: true,
        entitas: [],
      }
    }

    // Nama PENGIRIM dibaca dari basis, bukan diterima dari model: pesan yang
    // mengaku dari orang lain adalah bentuk penyalahgunaan paling sederhana.
    const { data: aku } = await db
      .unsafe(
        'users',
        'tool AI: membaca nama PENGIRIM sendiri — disaring `id = userId` dari sesi, ' +
          'jadi ia tak pernah membaca baris orang lain. Kategori D karena `users` ' +
          'memang lintas-tenant (satu orang bisa jadi anggota beberapa perusahaan).',
      )
      .select('name, email')
      .eq('id', userId)
      .maybeSingle()

    const namaPengirim =
      (aku as { name?: string; email?: string } | null)?.name ??
      (aku as { name?: string; email?: string } | null)?.email ??
      'rekan Anda'

    const { createNotification } = await import('../utils/notifications.js')

    await createNotification({
      company_id: companyId,
      user_id: tujuan.user_id,
      title: `Titipan dari ${namaPengirim}`,
      // Awalan menyatakan ini TITIPAN, bukan keputusan perusahaan — dan
      // menyebut siapa yang menitipkan supaya bisa ditanya balik.
      message: `${pesan}\n\n— dititipkan ${namaPengirim} lewat asisten`,
      type: 'titipan_asisten',
      priority: 'normal',
    })

    return {
      isi: bungkusData(
        'titip_pesan',
        `Titipan terkirim ke ${tujuan.users?.name ?? 'rekan'}: "${pesan}". ` +
          'Namanya tercantum sebagai pengirim.',
      ),
      isError: false,
      entitas: [tujuan.users?.name ?? ''],
    }
  },
}
