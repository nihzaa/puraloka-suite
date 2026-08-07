import { teks, urlMedia, srcSetMedia, type KontenSitus, type Media } from '@/lib/konten'
import { Lambang } from '@/components/Lambang'

/**
 * Hero — pernyataan di kiri, BUKTI yang bergerak di kanan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BENTUKNYA BERUBAH — 2026-08-08
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder: *"terlalu generik, kurang interaktif"*. Dilihat dan diukur:
 *
 *   • teks berhenti di ~40% lebar, sisanya gradien navy polos
 *   • NOL foto sebelum orang menggulir — padahal 28 foto pabrik dan
 *     konstruksi baja sudah ada di basis dan termuat sempurna
 *
 * Yang dijual kontraktor adalah **bukti fisik**. Menahan seluruh fotonya
 * sampai di bawah lipatan berarti tiga detik pertama dihabiskan untuk
 * kalimat yang bisa ditulis kontraktor mana pun.
 *
 * ── Kenapa kolom bergerak, bukan satu foto besar
 *
 * Satu foto hero menuntut SATU foto yang cukup kuat jadi wajah perusahaan.
 * Diperiksa: 28 foto ini dokumentasi lapangan yang jujur — bagus sebagai
 * bukti, tak satu pun dirancang sebagai gambar sampul. Tiga kolom yang
 * bergeser pelan menunjukkan KELUASAN kerjanya, dan keluasan itulah yang
 * sebenarnya membedakan: pabrik, gudang, baja, pematangan lahan, perumahan.
 *
 * ── Kenapa CSS asli, bukan pustaka animasi
 *
 * `motion` tidak terpasang di apps/web-publik (diperiksa di package.json,
 * bukan diasumsikan). Menambah dependensi untuk satu geser lambat adalah
 * ongkos yang tak sepadan — `@keyframes translateY` melakukannya dengan nol
 * byte JavaScript, dan hero adalah tempat LCP diukur.
 *
 * ── Aksesibilitas
 *
 * Geraknya `prefers-reduced-motion: reduce` → berhenti total. Kolomnya
 * `aria-hidden` karena ia dekorasi bukti; foto yang sama muncul lagi di
 * portofolio dengan alt text dan bisa dibuka satu per satu di sana.
 */

/** Tiga kolom, kecepatan berbeda supaya tak terbaca sebagai satu blok geser. */
const KOLOM = [
  { kelas: 'kolom-a', durasi: '64s' },
  { kelas: 'kolom-b', durasi: '82s' },
  { kelas: 'kolom-c', durasi: '72s' },
] as const

/**
 * Bagi media jadi tiga kolom secara bergilir.
 *
 * Bergilir (0,3,6… / 1,4,7… / 2,5,8…), bukan dipotong berurutan: potongan
 * berurutan menaruh 14 foto pabrik di satu kolom dan menyisakan kolom lain
 * berisi kategori tunggal — yang justru menyembunyikan keluasan kerjanya.
 */
function bagiKolom(media: Media[], n: number): Media[][] {
  const hasil: Media[][] = Array.from({ length: n }, () => [])
  media.forEach((m, i) => hasil[i % n].push(m))
  return hasil
}

export function Hero({ konten }: { konten: KontenSitus }) {
  const judul = teks(konten, 'hero.judul')
  const sub = teks(konten, 'hero.sub')
  const sejak = teks(konten, 'merek.sejak')
  const nama = teks(konten, 'merek.nama')

  if (!judul) return null

  const semuaMedia = konten.kategori.flatMap((k) => k.media)
  // Kolom hanya dirender bila ada cukup foto untuk terlihat bergerak. Di bawah
  // itu, hero kembali ke satu kolom teks — lebih baik daripada tiga kolom
  // pendek yang melompat tiap beberapa detik.
  const cukupFoto = semuaMedia.length >= 9
  const kolom = cukupFoto ? bagiKolom(semuaMedia, KOLOM.length) : []

  return (
    <section
      aria-labelledby="hero-judul"
      style={{
        background: 'var(--grad-navy)',
        paddingBlock: 'var(--ritme)',
        overflow: 'hidden',
      }}
    >
      <div
        className="wadah hero-tata"
        style={{
          display: 'grid',
          gap: 'clamp(2rem, 5vw, 4rem)',
          alignItems: 'center',
        }}
      >
        <div>
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

          {/* `maxWidth` dilepas, bukan diperlebar.
              `17ch` adalah warisan hero satu-kolom, saat judul punya seluruh
              lebar halaman dan perlu ditahan. Sesudah hero dibagi dua, KOLOM
              KIRI yang menahannya, dan `17ch` di atas kolom 529px memaksa
              judul jadi tiga baris di lebar 416px. Diukur, bukan ditaksir:
              dua pembatas yang bekerja bersamaan selalu menghasilkan yang
              lebih sempit, dan yang lebih sempit di sini bukan yang dimaksud. */}
          <h1 id="hero-judul" style={{ fontSize: 'var(--ukuran-hero)' }}>
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

        {cukupFoto && (
          <div className="hero-galeri" aria-hidden="true">
            {kolom.map((isi, i) => (
              <div key={KOLOM[i].kelas} className="hero-kolom">
                <div
                  className={`hero-jalur ${KOLOM[i].kelas}`}
                  style={{ animationDuration: KOLOM[i].durasi }}
                >
                  {/* Dua kali: jalur harus punya salinan penuh di bawahnya
                      supaya geser -50% kembali ke posisi yang identik dan
                      tak ada kedipan di titik ulang. */}
                  {[...isi, ...isi].map((m, j) => (
                    <img
                      key={`${m.path_storage}-${j}`}
                      src={urlMedia(m.path_storage, 640)}
                      srcSet={srcSetMedia(m.path_storage)}
                      sizes="(max-width: 900px) 0px, 15vw"
                      alt=""
                      loading={j < 2 ? 'eager' : 'lazy'}
                      decoding="async"
                      width={m.lebar}
                      height={m.tinggi}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
