import { teks, type KontenSitus } from '@/lib/konten'
import { Lambang } from '@/components/Lambang'

/**
 * Hero — pernyataan, bukan sambutan.
 *
 * Yang muncul lebih dulu bukan nama perusahaan melainkan APA yang dibangun,
 * karena itu yang dicari pengunjung dalam tiga detik pertama. Nama dan tahun
 * berdiri jadi eyebrow di atasnya: kredensial yang mendukung klaim, bukan
 * menggantikannya.
 */
export function Hero({ konten }: { konten: KontenSitus }) {
  const judul = teks(konten, 'hero.judul')
  const sub = teks(konten, 'hero.sub')
  const sejak = teks(konten, 'merek.sejak')
  const nama = teks(konten, 'merek.nama')

  if (!judul) return null

  return (
    <section
      aria-labelledby="hero-judul"
      style={{ background: 'var(--grad-navy)', paddingBlock: 'var(--ritme)' }}
    >
      <div className="wadah">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.875rem',
            marginBottom: 'calc(var(--ritme) * 0.6)',
          }}
        >
          {/* Lambang PUTIH, bukan kuning — 16,62:1 vs 11,77:1, dan menjaga
              kuning tetap langka supaya aksennya masih bekerja. */}
          <Lambang tinggi={38} />
          <span
            style={{
              fontFamily: 'var(--font-tampil)',
              fontWeight: 700,
              fontSize: '1.05rem',
              letterSpacing: '-0.01em',
            }}
          >
            {nama}
          </span>
        </div>

        {sejak && (
          <p className="eyebrow angka" style={{ marginBottom: '1.25rem' }}>
            Sejak {sejak}
          </p>
        )}

        <h1 id="hero-judul" style={{ fontSize: 'var(--ukuran-hero)', maxWidth: '17ch' }}>
          {judul}
        </h1>

        {sub && (
          <p
            style={{
              color: 'var(--pada-navy-redup)',
              maxWidth: '46ch',
              marginTop: '1.75rem',
              fontSize: 'clamp(1rem, 1.6vw, 1.2rem)',
            }}
          >
            {sub}
          </p>
        )}
      </div>
    </section>
  )
}
