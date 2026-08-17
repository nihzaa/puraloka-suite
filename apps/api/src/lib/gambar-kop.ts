/**
 * MENGGAMBAR KOP TENANT DI ATAS PDF — satu tempat, dipakai semua dokumen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIEKSTRAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `kop-dokumen.ts` sudah menyusun TEKS kop dan menurunkan kunci logo yang
 * aman. Yang belum punya rumah adalah tujuh puluh baris berikutnya: mengambil
 * identitas dari `companies`, mengunduh logo dari Storage, menangani tiga
 * cara logo bisa gagal, lalu menggambarnya.
 *
 * Sampai 2026-08-17 baris itu hanya ada di `contracts.ts`. Menyalinnya ke
 * dokumen kedua bukan sekadar duplikasi kode — ia menduplikasi KEPUTUSAN
 * KEAMANAN. Yang menyalin dengan tergesa akan menulis `doc.image(kop.logoUrl)`
 * dan tanpa sadar membuat server bisa disuruh menembak alamat mana pun,
 * termasuk alamat internal (SSRF), karena `logo_url` adalah teks yang bisa
 * disunting siapa pun pemegang `settings:manage`.
 *
 * Jadi yang dijaga di sini bukan kerapian, melainkan bahwa jalur logo yang
 * SUDAH diperiksa adalah satu-satunya jalur yang ada.
 *
 * ── Kenapa kegagalan TIDAK menghentikan pencetakan
 *
 * Ketiga kegagalan (identitas tak termuat, logo tak terunduh, gambar rusak)
 * dicatat lalu dilewati. Alasannya sama dengan yang sudah ditulis di
 * `contracts.ts`: dokumen yang tak bisa terbit jauh lebih merugikan daripada
 * dokumen tanpa logo. Kontrak yang gagal dicetak menghentikan penandatanganan;
 * kontrak berkop tipis tetap sah.
 *
 * Tapi galatnya TIDAK ditelan. Logo yang diam-diam tak pernah tercetak membuat
 * orang mengunggah ulang berkali-kali tanpa pernah tahu sebabnya.
 */

import { susunKop, kunciLogo, BUCKET_LOGO, type IdentitasTenant, type Kop } from './kop-dokumen.js'

/** Kolom identitas yang dibutuhkan `susunKop`. Satu tempat supaya dua pemanggil tak berbeda. */
export const KOLOM_IDENTITAS =
  'name, legal_name, tagline, address, city, postal_code, phone, email, website, npwp, logo_url'

/** Pencatat galat sekurang-kurangnya sebesar `request.log`. */
interface Pencatat {
  warn: (obj: unknown, msg?: string) => void
}

/** Bagian pdfkit yang dipakai — sengaja sempit supaya mudah diuji tanpa PDF sungguhan. */
export interface KanvasKop {
  image: (buf: Buffer, x: number, y: number, opts: Record<string, unknown>) => unknown
  font: (nama: string) => KanvasKop
  fontSize: (n: number) => KanvasKop
  text: (teks: string, x: number, y: number, opts: Record<string, unknown>) => KanvasKop
  moveTo: (x: number, y: number) => KanvasKop
  lineTo: (x: number, y: number) => KanvasKop
  lineWidth: (n: number) => KanvasKop
  stroke: () => unknown
  y: number
}

/** Pengunduh berkas Storage — disuntik supaya test tak menyentuh jaringan. */
export type UnduhLogo = (kunci: string) => Promise<Buffer | null>

export interface OpsiKop {
  doc: KanvasKop
  y: number
  margin: number
  lebar: number
  kop: Kop
  logo: Buffer | null
}

/**
 * Menggambar kop dan memulangkan `y` SESUDAH garis pemisah.
 *
 * Tinggi logo dipaku, lebar mengikuti rasio: logo tenant datang dalam bentuk
 * apa pun, dan memaksa lebarnya membuat logo tinggi-kurus melebar sampai
 * menutupi nama perusahaan.
 */
export function gambarKop(o: OpsiKop, log?: Pencatat): number {
  const { doc, margin, lebar, kop } = o
  let y = o.y

  if (o.logo) {
    const H = 38
    try {
      doc.image(o.logo, margin, y, { fit: [lebar, H], align: 'center' })
      y += H + 6
    } catch (e) {
      // pdfkit menolak berkas gambar yang rusak. Sudah divalidasi magic-byte
      // saat unggah, tapi berkas di Storage bisa rusak belakangan — dan itu
      // tak boleh menggagalkan dokumennya.
      log?.warn({ err: e }, 'logo tak bisa digambar, dokumen tetap dicetak')
    }
  }

  doc.font('Helvetica-Bold').fontSize(12)
    .text(kop.nama.toUpperCase(), margin, y, { width: lebar, align: 'center' })
  y = doc.y + 2

  for (const b of kop.baris) {
    doc.font('Helvetica').fontSize(8.5)
      .text(b, margin, y, { width: lebar, align: 'center' })
    y = doc.y + 1
  }

  y = doc.y + 6
  doc.moveTo(margin, y).lineTo(margin + lebar, y).lineWidth(1.2).stroke()
  return y + 14
}

/**
 * Mengambil identitas tenant + logo yang SUDAH diperiksa.
 *
 * `ambilIdentitas` dan `unduh` disuntik supaya berkas ini tak bergantung pada
 * Fastify maupun SDK Supabase — dan supaya test bisa memaksakan ketiga
 * kegagalan tanpa jaringan.
 */
export async function siapkanKop(opsi: {
  companyId: string
  ambilIdentitas: () => Promise<IdentitasTenant | null>
  unduh: UnduhLogo
  log?: Pencatat
}): Promise<{ kop: Kop; logo: Buffer | null }> {
  let identitas: IdentitasTenant | null = null
  try {
    identitas = await opsi.ambilIdentitas()
  } catch (e) {
    opsi.log?.warn({ err: e }, 'identitas tenant tak termuat, dokumen dicetak berkop kosong')
  }

  const kop = susunKop(identitas)

  // Logo diambil lewat KUNCI STORAGE yang diturunkan dari companyId, BUKAN
  // dengan mem-fetch `logo_url` — lihat kepala berkas.
  const kunci = kunciLogo(kop.logoUrl, opsi.companyId)
  if (!kunci) return { kop, logo: null }

  try {
    const buf = await opsi.unduh(kunci)
    return { kop, logo: buf }
  } catch (e) {
    opsi.log?.warn({ err: e, kunci }, 'logo gagal dibaca, dokumen tetap dicetak')
    return { kop, logo: null }
  }
}

export { BUCKET_LOGO }
