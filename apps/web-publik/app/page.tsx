import type { ComponentType } from 'react'
import { ambilKonten, type KontenSitus } from '@/lib/konten'
import { Hero } from '@/components/seksi/Hero'
import { Bukti } from '@/components/seksi/Bukti'
import { Proses } from '@/components/seksi/Proses'
import { Portofolio } from '@/components/seksi/Portofolio'
import { Legalitas } from '@/components/seksi/Legalitas'
import { Kontak } from '@/components/seksi/Kontak'

// SENGAJA tidak memakai `export const revalidate = <detik>`.
//
// Angka itu membuat halaman punya jadwal kedaluwarsanya SENDIRI, terpisah dari
// tag cache `fetch` di dalamnya — dan `revalidateTag('situs')` tak menyentuhnya.
// Gejalanya persis yang saya temukan saat menguji: DB sudah berubah, API sudah
// mengembalikan nilai baru, endpoint revalidate membalas `{direvalidasi:true}`,
// tapi halaman tetap menyajikan HTML lama sampai 5 menit habis.
//
// Tanpa baris itu, kesegaran halaman ditentukan sepenuhnya oleh tag pada
// `fetch` di `ambilKonten()` — satu sumber kebenaran, dan admin melihat
// perubahannya seketika.

/**
 * Peta kunci-seksi → komponen.
 *
 * Urutan dan on/off datang dari `situs_seksi` di DB, BUKAN dari urutan tulis di
 * berkas ini. Admin mematikan sebuah seksi lewat dashboard dan ia hilang tanpa
 * deploy — itu maksud CMS tingkat 3 (spec §4).
 *
 * Kunci yang tak punya komponen sengaja dilewati diam-diam: itu berarti
 * seksinya belum dibangun, bukan datanya rusak.
 */
const KOMPONEN: Record<string, ComponentType<{ konten: KontenSitus }>> = {
  hero: Hero,
  bukti: Bukti,
  proses: Proses,
  portofolio: Portofolio,
  legalitas: Legalitas,
  kontak: Kontak,
}

export default async function Beranda() {
  const konten = await ambilKonten()

  const seksi = konten.seksi
    .filter((s) => s.aktif && KOMPONEN[s.kunci])
    .sort((a, b) => a.urutan - b.urutan)

  return (
    <main id="isi">
      {seksi.map((s) => {
        const Seksi = KOMPONEN[s.kunci]

        // ── Ritme terang-gelap, dikendalikan DB
        //
        // `situs_seksi.nada` (migrasi 236), BUKAN `varian`. Percobaan pertama
        // menumpangkan 'terang' ke `varian`, dan CHECK constraint menolaknya —
        // penolakan yang benar: `varian` mengatur BENTUK (grid | carousel |
        // split), `nada` mengatur WARNA. Dua sumbu ortogonal.
        //
        // Dari DB, bukan dari berkas ini: admin bisa menukar seksi mana yang
        // terang tanpa deploy, sama seperti ia menukar urutan dan on/off.
        //
        // Pembungkusnya `<div>`, bukan diteruskan sebagai prop: komponen
        // seksi tak perlu tahu apa-apa soal ritme warna. Kelasnya menukar
        // NILAI token di lingkupnya, jadi `var(--pada-navy)` yang tersebar
        // di 21 tempat lintas 6 berkas ikut berubah tanpa satu pun disunting.
        const terang = s.nada === 'terang'

        return terang ? (
          <div key={s.kunci} className="seksi-terang">
            <Seksi konten={konten} />
          </div>
        ) : (
          <Seksi key={s.kunci} konten={konten} />
        )
      })}
    </main>
  )
}
