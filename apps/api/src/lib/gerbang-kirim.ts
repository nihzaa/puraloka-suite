/**
 * GERBANG KELUAR — satu tempat yang menjawab "boleh kirim ke orang ini sekarang?".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI PRASYARAT, BUKAN PELENGKAP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-15: repo ini NOL jam tenang, NOL opt-out, NOL batas
 * frekuensi, dan `kirimWa` tak punya throttle sama sekali. Penyedia bawaan
 * (Evolution) juga tak punya batas jendela 24 jam seperti WhatsApp Business
 * resmi.
 *
 * Artinya begitu ada kode yang memanggil `kirimWa` dari penjadwal, tak ada
 * satu pun lapisan yang mencegahnya mengirim pukul 03:00, berulang kali, ke
 * orang yang sama. Repo ini sudah pernah kena bentuknya: satu alur mengirim
 * 28 WhatsApp sungguhan sementara bukunya kosong, dan yang menghentikannya
 * bukan penjaga melainkan seseorang yang kebetulan memperhatikan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIJAGA — DAN YANG SENGAJA TIDAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Gerbang ini HANYA untuk pesan PROAKTIF — yang dimulai sistem. Balasan atas
 * pertanyaan TIDAK lewat sini: orang yang baru mengetik pertanyaan pukul
 * 23:00 memang sedang menunggu jawaban, dan menahannya karena "jam tenang"
 * berarti memutus percakapan yang ia sendiri mulai.
 *
 * Pembedanya bukan isi pesan melainkan SIAPA YANG MEMULAI. Itu yang membuat
 * `bolehKirim` dipanggil di jalur proaktif saja, dan kenapa penjaga
 * `audit-proaktif-lewat-gerbang.mjs` memeriksa jalur itu, bukan `kirimWa`.
 */

import type { TenantDb } from '../utils/tenant-db.js'

/**
 * Seberapa mendesak sebuah pesan.
 *
 * `mendesak` menembus jam tenang — keputusan founder 2026-08-15 ("yang
 * mendesak langsung, sisanya digabung"). Ia TIDAK menembus opt-out: orang
 * yang menyatakan berhenti sudah menyatakannya untuk semua hal, dan
 * pengecualian yang bisa ditembus siapa pun bukan opt-out.
 */
export type Kepentingan = 'biasa' | 'mendesak'

/**
 * Awalan `notifications.type` untuk pesan yang DIMULAI SISTEM.
 *
 * Kuota harian menghitung baris ber-awalan ini saja — balasan atas pertanyaan
 * tak boleh ikut memakan jatah orang yang justru sedang aktif bertanya.
 *
 * Awalan, bukan satu nilai tetap: tiap jenis pesan proaktif tetap punya
 * `type` sendiri supaya dedup harian (`audit-notifikasi-tak-kembar`) bisa
 * membedakannya, sementara penghitung ini melihat keluarganya.
 */
export const AWALAN_TIPE_PROAKTIF = 'proaktif_'

export type AlasanTolak =
  | 'berhenti'
  | 'jam_tenang'
  | 'kuota_habis'
  | 'hari_libur'
  | 'gagal_baca_preferensi'

export type KeputusanKirim =
  | { boleh: true; sisaKuota: number }
  | { boleh: false; alasan: AlasanTolak; pesan: string }

export interface PreferensiPesan {
  jamTenangMulai: string
  jamTenangSelesai: string
  maksPerHari: number
  bolehSapaan: boolean
  berhenti: boolean
  zonaWaktu: string
}

/**
 * Bawaan saat orang belum pernah membuka halaman preferensi.
 *
 * SAMA PERSIS dengan DEFAULT kolom migrasi 389, dan itu disengaja: baris yang
 * hilang harus berperilaku identik dengan baris yang baru dibuat. Bawaan yang
 * berarti "kirim kapan saja" adalah cara paling pasti membuat gerbang ini tak
 * menjaga siapa pun pada hari pertama — justru hari saat ia paling dibutuhkan.
 */
export const PREFERENSI_BAWAAN: PreferensiPesan = {
  jamTenangMulai: '21:00',
  jamTenangSelesai: '07:00',
  maksPerHari: 3,
  bolehSapaan: true,
  berhenti: false,
  zonaWaktu: 'Asia/Jakarta',
}

/** `'21:00'` → 1260. Jam tak sah → `null`, dan pemanggil memutuskan artinya. */
export function menitDariJam(jam: string): number | null {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(jam)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Apakah `menit` berada di dalam jam tenang?
 *
 * Menangani rentang yang MELEWATI TENGAH MALAM — dan itu kasus normalnya,
 * bukan tepi: 21:00–07:00 adalah bawaannya.
 *
 * Versi naif (`menit >= mulai && menit < selesai`) menghasilkan rentang kosong
 * untuk bawaan itu, jadi jam tenang tak pernah berlaku sama sekali — hijau di
 * tiap test yang hanya memeriksa siang hari, dan gagal persis pada malam yang
 * jadi alasan fitur ini ada.
 */
export function didalamJamTenang(menit: number, mulai: number, selesai: number): boolean {
  if (mulai === selesai) return false // rentang nol = tak ada jam tenang
  if (mulai < selesai) return menit >= mulai && menit < selesai
  // Membungkus tengah malam: 21:00–07:00 → [21:00,24:00) ∪ [00:00,07:00)
  return menit >= mulai || menit < selesai
}

interface BarisPreferensi {
  jam_tenang_mulai: string
  jam_tenang_selesai: string
  maks_per_hari: number
  boleh_sapaan: boolean
  berhenti: boolean
  zona_waktu: string
}

export function bentukPreferensi(baris: BarisPreferensi | null): PreferensiPesan {
  if (!baris) return PREFERENSI_BAWAAN
  return {
    jamTenangMulai: baris.jam_tenang_mulai || PREFERENSI_BAWAAN.jamTenangMulai,
    jamTenangSelesai: baris.jam_tenang_selesai || PREFERENSI_BAWAAN.jamTenangSelesai,
    maksPerHari: baris.maks_per_hari ?? PREFERENSI_BAWAAN.maksPerHari,
    bolehSapaan: baris.boleh_sapaan ?? PREFERENSI_BAWAAN.bolehSapaan,
    berhenti: baris.berhenti ?? PREFERENSI_BAWAAN.berhenti,
    zonaWaktu: baris.zona_waktu || PREFERENSI_BAWAAN.zonaWaktu,
  }
}

export interface OpsiBolehKirim {
  db: TenantDb
  userId: string
  /** Bawaan `biasa`. `mendesak` menembus jam tenang, bukan opt-out. */
  kepentingan?: Kepentingan
  /** Sapaan tanpa temuan data — tunduk `boleh_sapaan`. */
  sapaan?: boolean
  sekarang?: Date
  catatGalat?: (pesan: string, err: unknown) => void
}

/**
 * SATU-SATUNYA pintu keputusan sebelum pesan proaktif dikirim.
 *
 * Urutan pemeriksaan menentukan ALASAN yang dilaporkan, dan alasan itu yang
 * dibaca manusia saat bertanya "kenapa saya tidak dapat notifikasi?".
 * Diperiksa dari yang paling menyeluruh ke yang paling sempit supaya
 * jawabannya selalu sebab yang paling pokok:
 *
 *   1. berhenti      menahan segalanya, termasuk mendesak
 *   2. sapaan mati   menahan sapaan saja
 *   3. jam tenang    ditembus `mendesak`
 *   4. hari libur    ditembus `mendesak`
 *   5. kuota habis   ditembus `mendesak`
 *
 * Gagal membaca preferensi → TOLAK (fail-closed). Kebalikannya berarti satu
 * gangguan basis membuka pintu untuk seluruh pesan sekaligus — persis saat
 * sistemnya sedang tak sehat.
 */
export async function bolehKirim(opsi: OpsiBolehKirim): Promise<KeputusanKirim> {
  const sekarang = opsi.sekarang ?? new Date()
  const kepentingan = opsi.kepentingan ?? 'biasa'
  const catatGalat = opsi.catatGalat ?? (() => {})

  const { data, error } = await opsi.db
    .from('preferensi_pesan')
    .select('jam_tenang_mulai, jam_tenang_selesai, maks_per_hari, boleh_sapaan, berhenti, zona_waktu')
    .eq('user_id', opsi.userId)
    .maybeSingle()

  if (error) {
    catatGalat('gagal membaca preferensi pesan', error)
    return {
      boleh: false,
      alasan: 'gagal_baca_preferensi',
      pesan: 'Preferensi pesan tak terbaca — pengiriman ditahan.',
    }
  }

  const pref = bentukPreferensi(data as BarisPreferensi | null)

  // ── 1. Opt-out. Menahan SEGALANYA. ────────────────────────────────────────
  if (pref.berhenti) {
    return { boleh: false, alasan: 'berhenti', pesan: 'Penerima mematikan pesan dari asisten.' }
  }

  // ── 2. Sapaan tanpa alasan data ───────────────────────────────────────────
  if (opsi.sapaan && !pref.bolehSapaan) {
    return { boleh: false, alasan: 'berhenti', pesan: 'Penerima mematikan sapaan tanpa temuan.' }
  }

  // ── 3. Jam tenang ─────────────────────────────────────────────────────────
  if (kepentingan !== 'mendesak') {
    const mulai = menitDariJam(pref.jamTenangMulai)
    const selesai = menitDariJam(pref.jamTenangSelesai)

    // Jam tak sah diperlakukan sebagai jam tenang BAWAAN, bukan sebagai
    // "tak ada jam tenang". CHECK basis seharusnya mencegahnya, tapi kalau
    // toh lolos, yang aman saat ragu adalah menahan.
    const m = mulai ?? menitDariJam(PREFERENSI_BAWAAN.jamTenangMulai)!
    const s = selesai ?? menitDariJam(PREFERENSI_BAWAAN.jamTenangSelesai)!

    const menitSekarang = sekarang.getHours() * 60 + sekarang.getMinutes()
    if (didalamJamTenang(menitSekarang, m, s)) {
      return {
        boleh: false,
        alasan: 'jam_tenang',
        pesan: `Sedang jam tenang (${pref.jamTenangMulai}–${pref.jamTenangSelesai}).`,
      }
    }
  }

  // ── 4. Hari libur ─────────────────────────────────────────────────────────
  //
  // Memakai `hari_libur` yang sudah ada (migrasi 212) — bukan daftar sendiri.
  // `tetap_bekerja` dihormati: sebagian tenant memang bekerja di hari libur
  // tertentu, dan menahan pesan di hari mereka bekerja sama salahnya dengan
  // mengirim di hari mereka libur.
  if (kepentingan !== 'mendesak') {
    const tgl = tanggalLokal(sekarang)
    const { data: libur, error: errLibur } = await opsi.db
      .from('hari_libur')
      .select('nama, tetap_bekerja')
      .eq('tanggal', tgl)
      .limit(1)

    if (errLibur) {
      // Kalender libur yang tak terbaca TIDAK menahan pesan: ia penyempurna,
      // bukan pagar. Menahan semuanya karena satu tabel pelengkap bermasalah
      // akan membuat gerbang ini terasa rusak, dan yang rusak akan dimatikan.
      catatGalat('gagal membaca hari libur', errLibur)
    } else {
      const l = ((libur ?? []) as Array<{ nama: string; tetap_bekerja: boolean }>)[0]
      if (l && !l.tetap_bekerja) {
        return { boleh: false, alasan: 'hari_libur', pesan: `Hari libur: ${l.nama}.` }
      }
    }
  }

  // ── 5. Kuota harian ───────────────────────────────────────────────────────
  //
  // Dihitung dari `notifications` — SATU sumber angka, yang sama dengan yang
  // dibaca dedup harian dan penjaga `audit-notifikasi-tak-kembar`. Penghitung
  // terpisah bisa menyimpang dari riwayatnya tanpa gejala.
  const awalHari = new Date(sekarang)
  awalHari.setHours(0, 0, 0, 0)

  const { data: terkirim, error: errHitung } = await opsi.db
    .from('notifications')
    .select('id')
    .eq('user_id', opsi.userId)
    // Ditandai lewat `type`, BUKAN `channel`.
    //
    // `channel` adalah enum `notification_channel` (push|whatsapp|email) —
    // nilai barunya menuntut ALTER TYPE, dan menambah nilai enum demi
    // penghitung internal berarti mengubah kosakata yang dipakai seluruh
    // sistem notifikasi untuk kebutuhan satu fitur.
    //
    // `type` memang tempatnya: ia sudah dipakai dedup harian dan penjaga
    // `audit-notifikasi-tak-kembar` untuk membedakan jenis pesan.
    .like('type', `${AWALAN_TIPE_PROAKTIF}%`)
    .gte('sent_at', awalHari.toISOString())

  if (errHitung) {
    catatGalat('gagal menghitung kuota harian', errHitung)
    return {
      boleh: false,
      alasan: 'gagal_baca_preferensi',
      pesan: 'Kuota harian tak terbaca — pengiriman ditahan.',
    }
  }

  const dipakai = (terkirim ?? []).length
  const sisa = pref.maksPerHari - dipakai

  if (sisa <= 0 && kepentingan !== 'mendesak') {
    return {
      boleh: false,
      alasan: 'kuota_habis',
      pesan: `Kuota harian habis (${dipakai}/${pref.maksPerHari}).`,
    }
  }

  return { boleh: true, sisaKuota: Math.max(0, sisa) }
}

/** `YYYY-MM-DD` waktu LOKAL — bukan UTC, yang menggeser tanggal di WIB. */
function tanggalLokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
