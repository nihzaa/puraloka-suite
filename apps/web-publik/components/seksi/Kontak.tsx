import { teks, type KontenSitus } from '@/lib/konten'
import { Lambang } from '@/components/Lambang'

/**
 * `081311081813` → `6281311081813` — bentuk yang diterima wa.me.
 *
 * Diekspor supaya bisa diuji tanpa merender komponen: salah format di sini
 * menghasilkan tautan yang membuka WhatsApp ke nomor yang tidak ada, dan itu
 * gagal tanpa satu pun pesan galat.
 */
export function keFormatWa(nomor: string): string {
  const angka = nomor.replace(/\D/g, '')
  if (angka.startsWith('62')) return angka
  if (angka.startsWith('0')) return `62${angka.slice(1)}`
  return angka
}

/**
 * Kontak — WhatsApp sebagai jalur utama, email untuk yang formal.
 *
 * `topik` mengisi pesan awal sesuai konteks pemanggilnya. Menghilangkan beban
 * "harus menulis apa", yang membuat sebagian orang mengurungkan niat menghubungi.
 */
export function Kontak({
  konten,
  topik,
}: {
  konten: KontenSitus
  topik?: string
}) {
  const wa = teks(konten, 'kontak.whatsapp')
  const template = teks(konten, 'kontak.wa_template')
  const email = teks(konten, 'kontak.email')
  const alamat = teks(konten, 'kontak.alamat')
  const nama = teks(konten, 'merek.nama')
  const judul = teks(konten, 'kontak.judul')
  const sub = teks(konten, 'kontak.sub')

  if (!wa && !email) return null

  const pesan = encodeURIComponent(`${template}${topik ?? ''}`.trim())

  return (
    <section
      aria-labelledby="kontak-judul"
      style={{
        paddingBlock: 'var(--ritme)',
        borderTop: '1px solid var(--garis)',
        background: 'var(--grad-navy)',
      }}
    >
      <div className="wadah">
        <h2 id="kontak-judul" style={{ fontSize: 'var(--ukuran-judul)', maxWidth: '16ch' }}>
          {judul}
        </h2>
        {sub && (
          <p
            style={{
              color: 'var(--pada-navy-redup)',
              maxWidth: '48ch',
              marginTop: '1rem',
            }}
          >
            {sub}
          </p>
        )}

        {wa && (
          <a
            href={`https://wa.me/${keFormatWa(wa)}?text=${pesan}`}
            // Tautan keluar ke domain lain — noopener wajib.
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              marginTop: '2rem',
              padding: '1rem 2.25rem',
              // Putih di atas navy: 16,62:1. Tombol utama sengaja BUKAN kuning —
              // kuning dijaga tetap langka supaya perannya sebagai aksen bekerja.
              background: 'var(--pada-navy)',
              color: 'var(--navy-pekat)',
              fontWeight: 700,
              fontFamily: 'var(--font-tampil)',
              textDecoration: 'none',
              fontSize: '1.05rem',
            }}
          >
            Kirim pesan WhatsApp
          </a>
        )}

        <address
          style={{
            marginTop: 'calc(var(--ritme) * 0.7)',
            fontStyle: 'normal',
            color: 'var(--pada-navy-redup)',
            display: 'grid',
            gap: '0.6rem',
            fontSize: '0.95rem',
            maxWidth: '38ch',
          }}
        >
          {wa && (
            <span className="angka">
              WhatsApp{' '}
              <a
                href={`https://wa.me/${keFormatWa(wa)}?text=${pesan}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--pada-navy)' }}
              >
                {wa}
              </a>
            </span>
          )}
          {email && (
            <a href={`mailto:${email}`} style={{ color: 'var(--pada-navy)' }}>
              {email}
            </a>
          )}
          {alamat && <span>{alamat}</span>}
        </address>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginTop: 'calc(var(--ritme) * 0.7)',
            paddingTop: '1.5rem',
            borderTop: '1px solid var(--garis)',
            color: 'var(--pada-navy-redup)',
            fontSize: '0.85rem',
          }}
        >
          <Lambang tinggi={24} warna="var(--pada-navy-redup)" />
          <span>{nama}</span>
        </div>
      </div>
    </section>
  )
}
