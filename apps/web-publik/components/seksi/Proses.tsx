'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { teks, type KontenSitus } from '@/lib/konten'

// Bundle 3D dimuat malas dan TIDAK di-SSR. Ia tak boleh memblokir LCP, dan
// tak ada gunanya dirender di server — canvas WebGL kosong di HTML.
const Massing = dynamic(
  () => import('@/components/adegan/Massing').then((m) => m.Massing),
  { ssr: false, loading: () => <div style={{ height: '52vh' }} aria-hidden="true" /> },
)

/**
 * Lima tahap membangun. Urutan SEJATI — karena itu penomoran 01–05 di sini
 * jujur, bukan hiasan: pondasi memang mendahului struktur.
 *
 * Sengaja TIDAK dari CMS. Ini koreografi, bukan konten: timing dan urutannya
 * terikat ke adegan 3D, dan membiarkannya diedit dari dashboard menghasilkan
 * halaman yang suatu hari rusak tanpa ada yang tahu sebabnya (spec §4.1).
 */
const TAHAP = [
  { kunci: 'pondasi', judul: 'Pondasi', ket: 'Galian, pembesian, pengecoran.' },
  { kunci: 'struktur', judul: 'Struktur', ket: 'Kolom, balok, pelat — atau rangka baja.' },
  { kunci: 'arsitektur', judul: 'Arsitektur', ket: 'Dinding, atap, lantai, fasad.' },
  { kunci: 'mep', judul: 'MEP', ket: 'Listrik, air, dan sanitasi.' },
  { kunci: 'serah', judul: 'Serah terima', ket: 'Uji fungsi, perbaikan cacat, dokumen.' },
] as const

function dukungWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

export function Proses({ konten }: { konten: KontenSitus }) {
  const [progress, setProgress] = useState(0)
  const [pakai3D, setPakai3D] = useState(false)
  // Putaran lambat adegan dihentikan saat halaman tak terlihat. Membiarkannya
  // berputar di tab latar membakar GPU tanpa satu pun mata yang melihatnya —
  // dan di laptop itu berarti kipas menyala tanpa alasan.
  const [jedaGerak, setJedaGerak] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const kurangiGerak = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setPakai3D(dukungWebGL() && !kurangiGerak)

    const onVisibilitas = () => setJedaGerak(document.hidden)
    onVisibilitas()
    document.addEventListener('visibilitychange', onVisibilitas)
    return () => document.removeEventListener('visibilitychange', onVisibilitas)
  }, [])

  useEffect(() => {
    if (!pakai3D) return

    // Progress dihitung dari PERJALANAN seksi melintasi layar, bukan dari
    // seberapa jauh ia sudah tergulir ke dalam dirinya sendiri.
    //
    // Rumus pertama (`-r.top / (r.height - innerHeight)`) mengasumsikan seksi
    // LEBIH TINGGI dari viewport. Seksi ini tidak — pembaginya negatif dan
    // hasilnya dijepit ke 0 selamanya, sehingga seluruh tahap padam dan adegan
    // 3D terbaca seperti gagal muat. Ketahuan hanya karena potretnya dilihat.
    const onScroll = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 saat puncak seksi baru menyentuh dasar layar,
      // 1 saat dasarnya meninggalkan puncak layar.
      const total = r.height + vh
      const lewat = vh - r.top
      setProgress(Math.min(1, Math.max(0, lewat / total)))
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [pakai3D])

  // Tanpa 3D, SELURUH tahap ditampilkan menyala — daftarnya harus utuh
  // maknanya, bukan sekadar animasi yang dimatikan.
  //
  // Dengan 3D, minimal satu tahap selalu menyala: daftar yang seluruhnya redup
  // terbaca sebagai gagal muat, bukan sebagai "belum mulai".
  const aktifSampai = pakai3D
    ? Math.max(1, Math.round(progress * TAHAP.length))
    : TAHAP.length

  const judul = teks(konten, 'proses.judul')
  const sub = teks(konten, 'proses.sub')

  return (
    <section
      ref={ref}
      aria-labelledby="proses-judul"
      style={{ paddingBlock: 'var(--ritme)', borderTop: '1px solid var(--garis)' }}
    >
      <div className="wadah">
        <h2 id="proses-judul" style={{ fontSize: 'var(--ukuran-judul)' }}>
          {judul}
        </h2>
        {sub && (
          <p
            style={{
              color: 'var(--pada-navy-redup)',
              maxWidth: '52ch',
              marginTop: '1rem',
            }}
          >
            {sub}
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: pakai3D ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr',
            gap: 'clamp(1.5rem, 5vw, 4rem)',
            alignItems: 'center',
            marginTop: 'calc(var(--ritme) * 0.7)',
          }}
        >
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {TAHAP.map((t, i) => {
              const nyala = i < aktifSampai
              return (
                <li
                  key={t.kunci}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2.75rem 1fr',
                    gap: '1.25rem',
                    padding: '1.1rem 0',
                    borderTop: '1px solid var(--garis)',
                    // ── SENGAJA tanpa `opacity` untuk meredupkan teks ────────
                    // `opacity` mencampur warna teks dengan latarnya, sehingga
                    // kontras yang benar pada token-nya bisa jatuh jauh di
                    // bawah ambang tanpa terdeteksi pemindai statis. Versi
                    // pertama memakai opacity 0,45 — itu akan membuat teks
                    // tahap yang belum menyala 3,4:1, gagal AA.
                    //
                    // Kelas cacat yang sama tercatat enam kali di apps/web
                    // (sidebar 0,55 sendirian menghasilkan 227 pelanggaran)
                    // dan sudah punya penjaga CI di sana. Penjaga itu belum
                    // menjangkau app ini, jadi aturannya ditegakkan manual.
                    // Yang diredupkan WARNA-nya, bukan lapisan seluruh baris.
                    transition: 'color 240ms ease',
                  }}
                >
                  <span
                    className="angka"
                    aria-hidden="true"
                    style={{
                      fontFamily: 'var(--font-tampil)',
                      fontWeight: 700,
                      color: nyala ? 'var(--aksen)' : 'var(--pada-navy-redup)',
                      fontSize: '0.95rem',
                      paddingTop: '0.15rem',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p
                      style={{
                        fontWeight: 600,
                        // Kedua keadaan memakai token yang kontrasnya SUDAH
                        // lulus AA di latar navy (16,62:1 dan 7,52:1). Yang
                        // membedakan tahap sudah/belum adalah tingkat warnanya,
                        // bukan transparansi — jadi tak ada keadaan yang
                        // terbaca lebih redup dari yang seharusnya.
                        color: nyala ? 'var(--pada-navy)' : 'var(--pada-navy-redup)',
                        transition: 'color 240ms ease',
                      }}
                    >
                      {t.judul}
                    </p>
                    <p
                      style={{
                        color: 'var(--pada-navy-redup)',
                        fontSize: '0.9rem',
                        marginTop: '0.25rem',
                      }}
                    >
                      {t.ket}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>

          {pakai3D && (
            <div aria-hidden="true">
              <Massing tahap={TAHAP.length} progress={progress} jedaGerak={jedaGerak} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
