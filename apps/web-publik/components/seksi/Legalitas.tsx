import { teks, type KontenSitus } from '@/lib/konten'

/**
 * Legalitas — KBLI bersertifikat sebagai DATA MENTAH.
 *
 * Sengaja tidak diterjemahkan jadi ikon "Layanan Kami". Kode KBLI dengan angka
 * tabular berbaris adalah bentuk yang dikenali orang yang mengurus tender dan
 * izin — dan kompetitor tidak menampilkannya karena kebanyakan tidak punya
 * sertifikatnya. Daftar ini diturunkan dari berkas SERTIFIKAT STANDAR yang
 * benar-benar ada, bukan dari daftar layanan yang diinginkan.
 */
export function Legalitas({ konten }: { konten: KontenSitus }) {
  if (konten.legalitas.length === 0) return null

  const judul = teks(konten, 'legal.judul')
  const sub = teks(konten, 'legal.sub')
  const nib = teks(konten, 'kontak.nib')

  return (
    <section
      aria-labelledby="legal-judul"
      style={{ paddingBlock: 'var(--ritme)', borderTop: '1px solid var(--garis)' }}
    >
      <div className="wadah">
        <h2 id="legal-judul" style={{ fontSize: 'var(--ukuran-judul)' }}>
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

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 'calc(var(--ritme) * 0.6) 0 0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 22rem), 1fr))',
            gap: '0 clamp(1rem, 4vw, 3rem)',
          }}
        >
          {konten.legalitas.map((l) => (
            <li
              key={l.kode}
              style={{
                display: 'grid',
                gridTemplateColumns: '4.25rem 1fr',
                gap: '1rem',
                padding: '0.85rem 0',
                borderTop: '1px solid var(--garis)',
                alignItems: 'baseline',
              }}
            >
              {/* Kode KBLI sengaja PUTIH, bukan kuning.
                  Percobaan pertama mewarnai ketiga-belasnya kuning: hasilnya
                  tiga belas titik aksen di satu layar, dan aturan "satu elemen
                  kuning per layar" (spec §5.1) dilanggar oleh seksi yang paling
                  ingin saya buat menonjol. Yang membuat deret ini terbaca
                  sebagai data justru angka tabular dan kolom rapat — bukan
                  warnanya. */}
              <span
                className="angka"
                style={{
                  fontFamily: 'var(--font-tampil)',
                  fontWeight: 700,
                  color: 'var(--pada-navy)',
                  fontSize: '0.95rem',
                  letterSpacing: '0.02em',
                }}
              >
                {l.kode}
              </span>
              <span style={{ fontSize: '0.95rem', lineHeight: 1.4 }}>{l.judul}</span>
            </li>
          ))}
        </ul>

        {nib && (
          <p
            className="angka"
            style={{
              marginTop: '2rem',
              color: 'var(--pada-navy-redup)',
              fontSize: '0.9rem',
            }}
          >
            NIB {nib}
          </p>
        )}
      </div>
    </section>
  )
}
