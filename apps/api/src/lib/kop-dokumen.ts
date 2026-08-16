/**
 * KOP DOKUMEN per tenant — identitas yang harus muncul di tiap kertas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Lubang yang ditutup, diukur 2026-08-13
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `companies` sudah menyimpan seluruh identitas yang dibutuhkan sebuah kop —
 * `legal_name`, `address`, `city`, `postal_code`, `phone`, `email`, `website`,
 * `npwp`, `logo_url`. Halaman Pengaturan mengisinya.
 *
 * Dan PDF kontrak (`contracts.ts`) **tidak memakai satu pun dari itu**. Ia
 * langsung membuka dengan "KONTRAK PEKERJAAN <NAMA PROYEK>". Disisir: kata
 * `logo` tak muncul sekali pun di berkas itu.
 *
 * Untuk aplikasi satu perusahaan, itu cuma kurang rapi. Untuk SaaS
 * multi-tenant — yang justru sedang dituju repo ini — itu berarti setiap
 * tenant menerbitkan dokumen tanpa identitasnya, dan dua perusahaan berbeda
 * menghasilkan kertas yang tak bisa dibedakan.
 *
 * ── Kenapa berkas TERSENDIRI, bukan ditempel di contracts.ts
 *
 * Kop bukan milik kontrak. SPK, berita acara, sertifikat IPC, dan surat
 * penawaran menuntut kop yang SAMA — dan kop yang disalin ke lima berkas akan
 * berbeda-beda begitu satu disunting. Itu persis kelas cacat yang ditemukan di
 * modul tabel (empat gaya untuk satu pertanyaan) dan judul halaman.
 *
 * ── Yang TIDAK dilakukan di sini
 *
 * Berkas ini tidak menggambar. Ia hanya menyusun BARIS-BARIS yang harus
 * tercetak, dan menyatakan mana yang hilang. Penggambaran diserahkan ke
 * pemanggil karena tiap dokumen punya lebar dan margin sendiri — memaksakan
 * satu penggambar akan membuat kop terlihat benar di kontrak dan meleset di
 * dokumen lain.
 */

export type IdentitasTenant = {
  name?: string | null
  legal_name?: string | null
  tagline?: string | null
  address?: string | null
  city?: string | null
  postal_code?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  npwp?: string | null
  logo_url?: string | null
}

export type Kop = {
  /** Nama yang dicetak besar. `legal_name` menang bila ada. */
  nama: string
  /** Baris di bawah nama, sudah tergabung — kosong bila tak ada satu pun. */
  baris: string[]
  logoUrl: string | null
  /**
   * Bidang identitas yang KOSONG, dalam bahasa manusia.
   *
   * Bukan untuk menolak pencetakan — dokumen tetap harus bisa terbit. Ini
   * dipakai layar Pengaturan untuk menyatakan apa yang akan hilang dari
   * kertas, sebelum kertasnya terlanjur dikirim ke klien.
   */
  yangHilang: string[]
}

const isi = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * Susun kop dari identitas tenant.
 *
 * Yang kosong DILEWATI, bukan dicetak sebagai baris kosong atau "-". Alamat
 * yang tak diisi lalu tercetak sebagai garis kosong membuat kertasnya terlihat
 * rusak; melewatinya membuat kop merapat dan tetap terbaca wajar.
 */
export function susunKop(t: IdentitasTenant | null | undefined): Kop {
  const c = t ?? {}

  // `legal_name` menang: itulah nama yang mengikat secara hukum, dan kontrak
  // adalah dokumen hukum. `name` adalah nama panggilan sehari-hari.
  const nama = isi(c.legal_name) ?? isi(c.name) ?? 'Perusahaan Belum Bernama'

  const baris: string[] = []

  const alamat = [isi(c.address), isi(c.city), isi(c.postal_code)]
    .filter(Boolean).join(', ')
  if (alamat) baris.push(alamat)

  // Telepon dan email digabung satu baris: keduanya pendek, dan dua baris
  // terpisah membuat kop menjulur tanpa menambah informasi.
  const kontak = [
    isi(c.phone) ? `Telp. ${isi(c.phone)}` : null,
    isi(c.email),
    isi(c.website),
  ].filter(Boolean).join(' · ')
  if (kontak) baris.push(kontak)

  if (isi(c.npwp)) baris.push(`NPWP: ${isi(c.npwp)}`)
  if (isi(c.tagline)) baris.push(isi(c.tagline)!)

  const yangHilang: string[] = []
  if (!isi(c.legal_name)) yangHilang.push('nama resmi perusahaan')
  if (!isi(c.address)) yangHilang.push('alamat')
  if (!isi(c.phone) && !isi(c.email)) yangHilang.push('telepon atau email')
  if (!isi(c.npwp)) yangHilang.push('NPWP')
  if (!isi(c.logo_url)) yangHilang.push('logo')

  return { nama, baris, logoUrl: isi(c.logo_url), yangHilang }
}

/** Bucket Storage tempat logo tenant disimpan (`settings.ts` yang menulisnya). */
export const BUCKET_LOGO = 'company-assets'

/**
 * Menurunkan KUNCI STORAGE logo dari `logo_url` — dan menolak yang bukan
 * milik tenant ini.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KUNCI, BUKAN URL-NYA LANGSUNG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `contracts.ts` sengaja tidak pernah mengunduh logo, dengan dua alasan yang
 * ditulis di sana dan keduanya masih berlaku:
 *
 *   1. **SSRF.** `logo_url` adalah teks yang bisa disunting siapa pun yang
 *      punya `settings:manage`. Mengambilnya dengan `fetch()` saat mencetak
 *      berarti server ini bisa disuruh menembak alamat mana pun — termasuk
 *      alamat internal yang tak terjangkau dari luar.
 *   2. **Dokumen gagal terbit saat jaringan bermasalah.**
 *
 * Yang membatalkan KEDUANYA bukan "fetch dengan hati-hati", melainkan tidak
 * memakai URL itu sama sekali sebagai alamat. `settings.ts` menulis berkasnya
 * ke jalur yang BENTUKNYA sudah pasti:
 *
 *     {companyId}/logo/company-logo.{ext}
 *
 * Jadi kuncinya bisa DITURUNKAN, lalu diunduh lewat klien Storage (SDK, bukan
 * HTTP sembarang alamat). URL-nya hanya dipakai untuk mengetahui ekstensinya.
 *
 * ── Kenapa tetap memeriksa segmen tenant
 *
 * Kalau `logo_url` diisi tangan dengan jalur milik tenant LAIN, menurunkan
 * kunci apa adanya akan mencetak logo perusahaan orang di kontrak kita.
 * Karena itu kunci hasil turunan WAJIB berawalan `companyId` pemanggil —
 * bukan yang tertulis di URL.
 *
 * Mengembalikan `null` bila tak bisa diturunkan dengan yakin. `null` berarti
 * "cetak tanpa logo", bukan "gagal mencetak".
 */
export function kunciLogo(logoUrl: string | null, companyId: string): string | null {
  if (!isi(logoUrl) || !isi(companyId)) return null

  // Buang cache-buster `?t=...` yang ditambahkan `settings.ts`.
  const tanpaKueri = logoUrl!.split('?')[0]

  // Ekstensi diambil dari URL — hanya daftar yang memang bisa diunggah
  // (`ALLOWED_IMAGES`). Apa pun di luar itu ditolak, jadi teks aneh di
  // `logo_url` tak pernah menjadi jalur berkas.
  const m = /\.(png|jpg|jpeg|webp)$/i.exec(tanpaKueri)
  if (!m) return null

  // Ekstensi apa adanya dipakai untuk MEMERIKSA URL; yang dinormalkan
  // (jpeg→jpg) dipakai untuk MEMBANGUN kunci — persis seperti `settings.ts`
  // menuliskannya saat unggah.
  const extAsli = m[1].toLowerCase()
  const ext = extAsli.replace('jpeg', 'jpg')

  // Jalur DIBANGUN dari companyId pemanggil, bukan disalin dari URL.
  const kunci = `${companyId}/logo/company-logo.${ext}`
  const jalurDiUrl = `${companyId}/logo/company-logo.${extAsli}`

  // URL-nya harus BERAKHIR dengan jalur baku tenant ini.
  //
  // `includes()` saja tidak cukup, dan test membuktikannya: URL
  // `…/{companyId}/logo/../../rahasia.png` memuat segmen tenant DAN berakhiran
  // `.png`, sehingga lolos dua pemeriksaan di atas. Kuncinya memang tetap
  // dibangun ulang (jadi tak ada path traversal yang sampai ke Storage), tapi
  // hasilnya jadi bohong dengan cara lain: `logo_url` menunjuk ke suatu tempat,
  // yang tercetak logo baku — dan tak ada yang memberi tahu bahwa keduanya
  // berbeda.
  //
  // Menolak lebih jujur: tak ada logo yang tercetak, dan `logo_url` yang
  // memang aneh tetap aneh sampai diperbaiki di Pengaturan.
  if (!tanpaKueri.endsWith(jalurDiUrl)) return null

  return kunci
}

/**
 * Apakah kop ini layak dicetak di dokumen yang DIKIRIM KE LUAR?
 *
 * `layak: false` TIDAK menghentikan pencetakan — dokumen yang tak bisa terbit
 * jauh lebih merugikan daripada dokumen berkop tipis. Ia dipakai untuk
 * memberi peringatan di layar sebelum orang mengirimkannya ke klien.
 *
 * Ambangnya: nama resmi DAN salah satu cara menghubungi. Kertas tanpa
 * keduanya tak bisa dipertanggungjawabkan siapa pun.
 */
export function kopLayakKirim(k: Kop): { layak: boolean; sebab: string | null } {
  const adaNama = k.nama !== 'Perusahaan Belum Bernama'
  const adaKontak = k.baris.some((b) => /Telp\.|@/.test(b))

  if (!adaNama && !adaKontak) {
    return {
      layak: false,
      sebab: 'Identitas perusahaan belum diisi sama sekali. Dokumen yang terbit '
        + 'tanpa nama dan kontak tak bisa dipertanggungjawabkan siapa pun.',
    }
  }
  if (!adaNama) {
    return { layak: false, sebab: 'Nama resmi perusahaan belum diisi di Pengaturan.' }
  }
  if (!adaKontak) {
    return {
      layak: false,
      sebab: 'Belum ada telepon maupun email di identitas perusahaan — penerima '
        + 'dokumen tak punya cara menghubungi balik.',
    }
  }
  return { layak: true, sebab: null }
}
