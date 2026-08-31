import type { FastifyReply, FastifyRequest } from 'fastify'
import { supabase } from './supabase.js'

/**
 * GERBANG MODUL — apakah perusahaan ini MEMBAYAR untuk modul yang ia buka.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BUKAN gerbang izin. Dua pertanyaan berbeda, dua kode HTTP berbeda.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   requireModul('modul.akuntansi')   → "perusahaan ini bayar untuk apa?"   402
 *   requirePermission('gl:view')      → "orang ini boleh apa?"              403
 *
 * Keduanya wajib lulus, dan urutannya MODUL DULU. Alasannya bukan teknis
 * melainkan pesan: staf yang ditolak karena paketnya perlu diberi tahu
 * "upgrade paket", sementara staf yang ditolak karena perannya perlu diberi
 * tahu "minta akses ke admin Anda". Kalau keduanya menjawab 403, tim dukungan
 * tak bisa membedakan keduanya tanpa membaca log.
 *
 * ⚠ 402, dan sengaja BUKAN 404. Menyamar sebagai "tak ada" berbohong tentang
 * keberadaan fitur — dan menghancurkan kemampuan mendiagnosis, persis bentuk
 * kegagalan "gejala menunjuk ke tempat lain" yang berulang kali memakan waktu
 * di repo ini (kasus port 3001 vs 3007, CLAUDE.md §7).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MEMBACA SNAPSHOT LOKAL, BUKAN DB VENDOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kebenaran soal paket dimiliki konsol vendor, di basis TERPISAH. Godaannya
 * memanggil basis itu tiap gerbang diperiksa — dan itu menjadikannya titik
 * kegagalan tunggal atas SELURUH produk: konsol mati, 2.022 perusahaan
 * kehilangan seluruh modulnya sekaligus. Itu bukan penegakan batas; itu
 * pemadaman.
 *
 * Jadi vendor MENDORONG keadaan ke `entitlement_snapshot` (migrasi 544), dan
 * gerbang ini membaca salinan lokal itu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ARAH KEGAGALAN — dan kenapa "gagal-terbuka" di sini BUKAN `catch → allow`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-31: `companies` 2.022 baris, `subscriptions` NOL. Gerbang
 * yang gagal-tertutup akan memadamkan seluruh pelanggan pada detik ia
 * dipasang — termasuk Puraloka Persada sendiri.
 *
 * Tapi ada dua cara "membuka saat ragu", dan bedanya penting:
 *
 *   ❌ catch → return true       memberi "ya" yang tak pernah diverifikasi
 *   ✅ pakai snapshot terakhir   memberi jawaban yang PERNAH benar
 *
 * Yang dipakai di sini yang kedua. Kalau snapshot tak terbaca sama sekali
 * (basis bermasalah), gerbang membuka — tapi MENCATATNYA, karena gerbang yang
 * membuka diam-diam tak bisa dibedakan dari gerbang yang bekerja.
 *
 * ⚠ Ini SATU-SATUNYA arah gagal-terbuka yang sah di repo ini selain
 * `batas-paket.ts`, dan pengecualiannya harus tetap sempit. Gerbang IZIN dan
 * gerbang TENANCY tetap gagal-tertutup — keduanya menjawab "boleh atau
 * tidak", sementara berkas ini menjawab "sudah bayar untuk apa". Yang pertama
 * keamanan; yang kedua komersial.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TAK TERDAFTAR = TERBUKA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keputusan founder 2026-08-31. Alasannya: katalog akan SELALU tertinggal dari
 * kode. Modul yang ditambahkan besok belum punya barisnya, dan kalau "tak
 * terdaftar" berarti "tertutup", tiap modul baru lahir MATI untuk semua
 * pelanggan — termasuk yang membayar paling mahal. Gejalanya "menu hilang",
 * bukan galat, jadi tak seorang pun tahu harus memperbaiki apa.
 *
 * Menutup sebuah modul karenanya harus DISENGAJA: ada barisnya, `terbuka`
 * bernilai false.
 */

/** Kunci modul yang TAK PERNAH boleh digerbang — jalur pemulihan. */
const SELALU_TERBUKA = new Set([
  // Pelanggan yang ingin membayar harus SELALU bisa membayar. Menggerbang
  // halaman langganan di belakang gerbang yang ia pulihkan mengunci pelanggan
  // di luar pintu yang ia bayar untuk masuk — Azure memperlihatkan kegagalan
  // ini: invoice terkunci → pembayaran swalayan mati → harus telepon dukungan.
  'modul.langganan',
  'modul.pengaturan',
  // Pelanggan yang keluar harus selalu bisa membawa datanya.
  'modul.ekspor',
])

export interface KeadaanModul {
  terbuka: boolean
  /** Kalimat untuk pengguna. NULL bila terbuka. */
  alasan: string | null
  /** Nama paket yang berlaku, untuk pesan upsell. */
  paketNama: string | null
  /** True bila jawabannya diberikan karena snapshot tak terbaca. */
  daruratTerbuka: boolean
}

const TERBUKA: KeadaanModul = Object.freeze({
  terbuka: true,
  alasan: null,
  paketNama: null,
  daruratTerbuka: false,
})

/**
 * Apakah satu modul terbuka untuk sebuah perusahaan.
 *
 * Dipakai preHandler `requireModul` DAN oleh rute yang perlu memutuskan di
 * tengah handler (mis. menyembunyikan satu bagian jawaban).
 */
export async function bacaKeadaanModul(
  companyId: string,
  kunciModul: string
): Promise<KeadaanModul> {
  if (!companyId) return TERBUKA
  if (SELALU_TERBUKA.has(kunciModul)) return TERBUKA

  const { data, error } = await supabase
    .from('entitlement_snapshot')
    .select('terbuka, paket_nama')
    .eq('company_id', companyId)
    .eq('kunci', kunciModul)
    .maybeSingle()

  if (error) {
    // Basis bermasalah BUKAN bukti bahwa tenant ini tak berlangganan. Membuka,
    // tapi menandainya supaya pemanggil bisa mencatat — lihat catatan panjang
    // di kepala berkas soal `catch → allow` vs snapshot.
    return { terbuka: true, alasan: null, paketNama: null, daruratTerbuka: true }
  }

  // Tak ada barisnya = tak terdaftar = TERBUKA (lihat kepala berkas).
  if (!data) return TERBUKA

  // ⚠ Hanya `false` yang menutup. NULL berarti "belum ditetapkan", dan
  // menyamakannya dengan false akan menutup modul yang tak pernah diputuskan
  // siapa pun.
  if (data.terbuka !== false) return TERBUKA

  const paket = data.paket_nama ?? null
  return {
    terbuka: false,
    // Menyebut MODUL apa dan PAKET apa. Pesan generik ("akses ditolak")
    // membuat pengguna menyimpulkan produknya rusak, bukan bahwa ada sesuatu
    // yang bisa dibeli.
    alasan: paket
      ? `Modul ini tidak termasuk dalam paket ${paket}.`
      : 'Modul ini tidak termasuk dalam paket Anda.',
    paketNama: paket,
    daruratTerbuka: false,
  }
}

/**
 * preHandler Fastify. Dipasang SEBELUM `requirePermission` pada rute modul
 * berbayar.
 *
 * Bentuknya sengaja mencerminkan `requirePermission` — pola yang sudah mapan
 * di repo ini menurunkan biaya belajar, dan memungkinkan penjaga sejenis
 * memeriksa keduanya dengan cara yang sama.
 */
export function requireModul(kunciModul: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // ⚠ `request.companyId`, BUKAN `request.currentUser.companyId`.
    //
    // Percobaan pertama saya memakai yang kedua — dan itu `undefined` selamanya
    // (`AuthUser` tak punya medan itu; company aktif dipasang `authenticate()`
    // ke `request.companyId`, auth.ts:189). Gerbang yang membaca medan yang
    // tak ada akan pulang lebih awal pada SETIAP permintaan: tak pernah
    // menolak siapa pun, tak pernah mengeluarkan galat, dan `tsc` diam karena
    // medannya opsional. Gerbang yang diam persis seperti gerbang yang bekerja.
    const companyId = request.companyId
    // Belum terautentikasi bukan urusan gerbang ini — `authenticate` yang
    // menjawabnya, dan menjawab di sini akan menutupi urutan preHandler yang
    // salah pasang.
    if (!companyId) return

    const keadaan = await bacaKeadaanModul(companyId, kunciModul)

    if (keadaan.daruratTerbuka) {
      // Gerbang yang membuka diam-diam tak bisa dibedakan dari gerbang yang
      // bekerja. Dicatat sebagai `warn`, bukan `error`: ini keadaan yang
      // SENGAJA dipilih, bukan kegagalan yang tak terduga.
      request.log.warn(
        { companyId, kunciModul },
        'Gerbang modul membuka darurat — snapshot entitlement tak terbaca'
      )
      return
    }

    if (!keadaan.terbuka) {
      // 402 Payment Required — bukan 403, supaya bisa dibedakan dari penolakan
      // izin, dan bukan 404, supaya tidak berbohong soal keberadaan fitur.
      return reply.status(402).send({
        error: keadaan.alasan,
        kode: 'MODUL_TAK_TERMASUK_PAKET',
        modul: kunciModul,
        paket: keadaan.paketNama,
      })
    }
  }
}
