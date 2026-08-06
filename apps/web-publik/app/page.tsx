import { ambilKonten, teks } from '@/lib/konten'

export const revalidate = 300

export default async function Beranda() {
  const k = await ambilKonten()

  return (
    <main id="isi" className="wadah" style={{ paddingBlock: 'var(--ritme)' }}>
      <p className="eyebrow">Sejak {teks(k, 'merek.sejak')}</p>
      <h1 style={{ fontSize: 'var(--ukuran-hero)', maxWidth: '18ch' }}>
        {teks(k, 'hero.judul')}
      </h1>
      <p style={{ color: 'var(--pada-navy-redup)', maxWidth: '48ch', marginTop: '1.5rem' }}>
        {teks(k, 'hero.sub')}
      </p>

      <p style={{ marginTop: 'var(--ritme)', color: 'var(--pada-navy-redup)' }}>
        {k.kategori.length} kategori · {k.milestone.length} milestone ·{' '}
        {k.legalitas.length} KBLI ·{' '}
        {k.kategori.reduce((n, kat) => n + kat.media.length, 0)} foto
      </p>
    </main>
  )
}
