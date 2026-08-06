import { teks, srcSetMedia, urlMedia, type KontenSitus } from '@/lib/konten'

/**
 * Portofolio — dokumentasi proses, bukan galeri hasil akhir.
 *
 * Dikelompokkan per JENIS PEKERJAAN mengikuti galeri compro cetak (hal. 13-19),
 * bukan per proyek bernama: satu foto pemasangan baja bisa milik proyek pabrik
 * mana pun, tapi kategori pekerjaannya pasti benar.
 *
 * Kategori tanpa foto SENGAJA tidak dirender. Judul kosong terbaca seperti
 * fitur rusak, dan itu lebih merugikan daripada kategori yang tak muncul.
 * (renovasi-rumah dan beton-pracetak hari ini kosong — berkas aslinya belum
 * ditemukan, lihat spec §6.2.)
 */
export function Portofolio({ konten }: { konten: KontenSitus }) {
  const berisi = konten.kategori.filter((k) => k.media.length > 0)
  if (berisi.length === 0) return null

  const judul = teks(konten, 'porto.judul')
  const sub = teks(konten, 'porto.sub')

  return (
    <section
      aria-labelledby="porto-judul"
      style={{ paddingBlock: 'var(--ritme)', borderTop: '1px solid var(--garis)' }}
    >
      <div className="wadah">
        <h2 id="porto-judul" style={{ fontSize: 'var(--ukuran-judul)' }}>
          {judul}
        </h2>
        {sub && (
          <p
            style={{
              color: 'var(--pada-navy-redup)',
              maxWidth: '56ch',
              marginTop: '1rem',
            }}
          >
            {sub}
          </p>
        )}

        {berisi.map((k, i) => (
          <article key={k.kunci} style={{ marginTop: 'calc(var(--ritme) * 0.8)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '1rem',
                // Garis kuning HANYA di kategori pertama. Percobaan pertama
                // memberi garis aksen ke setiap kategori — lima garis kuning
                // dalam satu gulir, dan aksennya berhenti berarti apa pun.
                // Sisanya memakai garis netral yang sama dengan seksi lain.
                borderTop:
                  i === 0 ? '2px solid var(--aksen)' : '1px solid var(--garis-kuat)',
                paddingTop: '1rem',
              }}
            >
              <h3 style={{ fontSize: 'clamp(1.15rem, 2vw, 1.5rem)' }}>{k.judul}</h3>
              <span
                className="angka"
                style={{
                  color: 'var(--pada-navy-redup)',
                  fontSize: '0.8rem',
                  letterSpacing: '0.06em',
                }}
              >
                {k.media.length} FOTO
              </span>
            </div>

            {k.ringkasan && (
              <p
                style={{
                  color: 'var(--pada-navy-redup)',
                  marginTop: '0.75rem',
                  maxWidth: '62ch',
                  fontSize: '0.95rem',
                }}
              >
                {k.ringkasan}
              </p>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(100%, 19rem), 1fr))',
                gap: '0.75rem',
                marginTop: '1.5rem',
              }}
            >
              {k.media.map((m) => (
                <img
                  key={m.path_storage}
                  src={urlMedia(m.path_storage, 1280)}
                  srcSet={srcSetMedia(m.path_storage)}
                  sizes="(max-width: 40rem) 100vw, (max-width: 70rem) 50vw, 19rem"
                  alt={m.alt}
                  // Dimensi asli — mencegah halaman melompat saat gambar dimuat.
                  width={m.lebar}
                  height={m.tinggi}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 3',
                    objectFit: 'cover',
                    background: 'rgba(255,255,255,0.04)',
                  }}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
