import type { ComponentType } from 'react'
import { ambilKonten, type KontenSitus } from '@/lib/konten'
import { Hero } from '@/components/seksi/Hero'
import { Bukti } from '@/components/seksi/Bukti'
import { Proses } from '@/components/seksi/Proses'
import { Portofolio } from '@/components/seksi/Portofolio'
import { Legalitas } from '@/components/seksi/Legalitas'
import { Kontak } from '@/components/seksi/Kontak'

export const revalidate = 300

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
        return <Seksi key={s.kunci} konten={konten} />
      })}
    </main>
  )
}
