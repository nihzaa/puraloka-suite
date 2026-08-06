import { teks, type KontenSitus } from '@/lib/konten'

/**
 * Bukti — linimasa 2009→sekarang.
 *
 * Tahun dipajang besar dengan angka tabular supaya kolomnya berbaris presisi:
 * itu bahasa asli gambar kerja dan tabel volume, bukan hiasan. Yang menopang
 * seksi ini bukan gaya visualnya melainkan isinya — nama proyek dan nama klien
 * yang tak bisa disalin kompetitor.
 */
export function Bukti({ konten }: { konten: KontenSitus }) {
  if (konten.milestone.length === 0) return null

  const judul = teks(konten, 'bukti.judul')
  const sub = teks(konten, 'bukti.sub')

  return (
    <section
      aria-labelledby="bukti-judul"
      style={{ paddingBlock: 'var(--ritme)', borderTop: '1px solid var(--garis)' }}
    >
      <div className="wadah">
        <h2 id="bukti-judul" style={{ fontSize: 'var(--ukuran-judul)' }}>
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

        <ol
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 'calc(var(--ritme) * 0.7) 0 0',
          }}
        >
          {konten.milestone.map((m) => (
            <li
              key={`${m.tahun}-${m.judul}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(4.5rem, auto) 1fr',
                gap: 'clamp(1rem, 4vw, 3rem)',
                padding: '1.35rem 0',
                borderTop: '1px solid var(--garis)',
              }}
            >
              <span
                className="angka"
                style={{
                  fontFamily: 'var(--font-tampil)',
                  fontWeight: 700,
                  fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
                  color: 'var(--pada-navy-redup)',
                  lineHeight: 1.2,
                }}
              >
                {m.tahun}
              </span>
              <div>
                <p style={{ fontWeight: 600, lineHeight: 1.35 }}>{m.judul}</p>
                {m.keterangan && (
                  <p
                    style={{
                      color: 'var(--pada-navy-redup)',
                      marginTop: '0.4rem',
                      fontSize: '0.95rem',
                      maxWidth: '62ch',
                    }}
                  >
                    {m.keterangan}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
