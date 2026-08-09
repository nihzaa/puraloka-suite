/**
 * PARSER PESAN MASUK — payload penyedia → bentuk internal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TERPISAH DARI ROUTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bentuk payload Evolution punya belasan cabang yang semuanya "normal": event
 * bukan pesan, pesan dari bot sendiri, pesan tanpa teks, pesan tanpa id.
 * Menguji cabang-cabang itu lewat HTTP berarti tiap kasus butuh server hidup
 * dan rahasia webhook yang benar — dan yang diuji jadi rangkaian gerbang,
 * bukan parsingnya.
 *
 * Fungsi murni bisa diuji dengan objek biasa. Route memanggilnya.
 *
 * ── Yang ditiru dari TJS (terukur, bukan tebakan)
 *
 * `automation-tjs/.../lib/wa/inbound/evolution-inbound.ts` menyimpan dua
 * pelajaran lapangan yang tak akan saya temukan sendiri tanpa perangkat nyata:
 *
 *   1. baris 108 — `key.fromMe === true` harus dibuang, "akan jadi lingkaran".
 *      Bot membalas dirinya sendiri tanpa henti.
 *   2. baris 114 — `remoteJidAlt` DIDAHULUKAN atas `remoteJid`: "Evolution
 *      memakainya untuk akun tertentu, dan mengabaikannya berarti balasan
 *      dikirim ke nomor yang salah."
 *
 * Keduanya ditiru apa adanya. Cacat nomor 2 sangat buruk kalau terjadi di
 * sini: balasan asisten memuat data perusahaan, dan salah nomor berarti
 * data itu terkirim ke orang asing.
 *
 * ── Yang SENGAJA tidak ditiru
 *
 * TJS menerjemahkan pesan media jadi penanda teks (`[gambar]` dsb.) supaya
 * AI tetap menjawab. Di sini media DIABAIKAN: asisten ini menjawab pertanyaan
 * tentang data perusahaan, dan membalas foto dengan tebakan berdasarkan
 * caption lebih buruk daripada diam. Kalau kelak ada pembacaan gambar, ia
 * masuk lewat pintu yang sadar biayanya sendiri.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const MAKS_TEKS = 4000
const MAKS_KUTIPAN = 300

export interface PesanMasuk {
  /** Id dari penyedia — kunci deduplikasi. */
  pesanId: string
  /** Nomor pengirim, belum dinormalkan (normalisasi milik `wa-kirim`). */
  dari: string
  nama?: string
  teks: string
  instance?: string
}

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Teks bisa duduk di dua tempat tergantung apakah pesannya punya format. */
function ambilTeks(msg: Record<string, unknown>): string {
  return (
    str(msg.conversation) ||
    str(obj(msg.extendedTextMessage)?.text) ||
    ''
  )
}

function ambilKutipan(msg: Record<string, unknown>): string {
  for (const k of ['extendedTextMessage', 'imageMessage', 'videoMessage']) {
    const ctx = obj(obj(msg[k])?.contextInfo)
    const q = obj(ctx?.quotedMessage)
    if (!q) continue
    const t =
      str(q.conversation) ||
      str(obj(q.extendedTextMessage)?.text) ||
      str(obj(q.imageMessage)?.caption)
    if (t) return t
  }
  return ''
}

/**
 * `null` berarti "tak ada yang perlu dijawab" — keadaan NORMAL, bukan galat.
 *
 * Penting untuk dibedakan: kalau ini melempar, penyedia akan mencoba ulang
 * webhook yang sebenarnya baik-baik saja, dan percobaan ulang itu menumpuk.
 */
export function uraiPesanMasuk(mentah: unknown): PesanMasuk | null {
  const luar = obj(mentah)
  if (!luar) return null

  // Sebagian pemasangan membungkus payload asli dalam `body` (n8n, proxy).
  const body = obj(luar.body) ?? luar

  if (str(body.event) !== 'messages.upsert') return null

  const data = obj(body.data)
  const key = obj(data?.key)
  if (!data || !key) return null

  // Pesan yang dikirim bot sendiri — kalau diproses, asisten menjawab
  // jawabannya sendiri, selamanya. (TJS baris 108.)
  if (key.fromMe === true) return null

  const pesanId = str(key.id)
  if (!pesanId) return null // tanpa id, dedup mustahil

  // `remoteJidAlt` didahulukan — TJS baris 114. Salah di sini = balasan
  // berisi data perusahaan terkirim ke nomor lain.
  const dari = str(key.remoteJidAlt) || str(key.remoteJid)
  if (!dari) return null

  // Pesan grup diabaikan: `bangunSesiDariNomor` meresolusi satu orang, dan
  // di grup pengirimnya bukan pemilik jid. Menjawab di grup juga berarti
  // data satu orang terlihat semua anggota grup.
  if (dari.endsWith('@g.us')) return null

  const msg = obj(data.message)
  if (!msg) return null

  let teks = ambilTeks(msg).trim()
  if (!teks) return null // media/stiker: lihat catatan kepala berkas

  const kutipan = ambilKutipan(msg)
  if (kutipan) {
    teks = `[Membalas: "${kutipan.slice(0, MAKS_KUTIPAN)}"]\n${teks}`
  }

  return {
    pesanId,
    dari,
    nama: str(data.pushName) || undefined,
    teks: teks.slice(0, MAKS_TEKS),
    instance: str(body.instance) || undefined,
  }
}

/**
 * Mengklaim pesan sebagai "milik saya untuk diproses" — ATOMIK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PRIMARY KEY YANG MEMUTUSKAN, BUKAN `SELECT` LALU `INSERT`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penyedia webhook mengirim ulang saat balasan lambat, dan dua salinan bisa
 * tiba BERSAMAAN. Dengan baca-lalu-tulis, keduanya melihat "belum ada" dan
 * keduanya diproses: pengguna menerima dua balasan, dan tenant membayar dua
 * kali untuk satu pertanyaan. Tak ada galat di mana pun.
 *
 * INSERT pada primary key tak punya celah itu — basis yang menengahi, dan
 * hanya satu yang bisa menang.
 *
 * ── Kenapa di sini, bukan di route
 *
 * Ratchet T4f melarang akses `supabase` mentah bertambah di `routes/`, dan
 * larangan itu benar: query mentah di route adalah tempat lubang tenancy
 * tumbuh. Tabel ini memang lintas-tenant secara sengaja (pesan masuk belum
 * punya tenant sampai nomornya dikenali), dan kesengajaan itu lebih baik
 * tinggal di satu fungsi bernama yang bisa dibaca utuh daripada tersebar
 * sebagai query di tengah handler.
 */
export type HasilKlaim = 'baru' | 'duplikat' | 'gagal'

export async function klaimPesanMasuk(
  db: SupabaseClient,
  pesanId: string,
  nomor: string,
): Promise<HasilKlaim> {
  const { error } = await db
    .from('wa_pesan_masuk_dedup')
    .insert({ pesan_id: pesanId, nomor })
    .select('pesan_id')

  if (!error) return 'baru'
  // 23505 = unique_violation → memang sudah pernah diproses.
  if (error.code === '23505') return 'duplikat'
  // Kegagalan lain TIDAK boleh dibaca sebagai "proses saja": tanpa dedup yang
  // berfungsi, percobaan ulang penyedia berubah jadi tagihan berlipat.
  return 'gagal'
}

/**
 * Menandai pesan sudah selesai diproses, sekaligus mencatat tenant-nya.
 *
 * Dipisah dari klaim karena tenant baru diketahui SESUDAH nomornya diresolusi.
 * Kegagalannya sengaja tak menjatuhkan apa pun: balasannya sudah terkirim, dan
 * membatalkan sesuatu yang sudah sampai ke telepon orang tidak mungkin.
 */
export async function tandaiDiproses(
  db: SupabaseClient,
  pesanId: string,
  companyId: string,
): Promise<void> {
  await db
    .from('wa_pesan_masuk_dedup')
    .update({ diproses: true, company_id: companyId })
    .eq('pesan_id', pesanId)
}
