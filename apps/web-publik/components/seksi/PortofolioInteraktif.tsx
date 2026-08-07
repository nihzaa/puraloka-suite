'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { srcSetMedia, urlMedia, type Kategori } from '@/lib/konten'
import { petakTerlihat, geserIndeks } from './portofolio-logika'

/**
 * Portofolio interaktif — saring per kategori, klik untuk memperbesar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-08: *"terlalu generik, kurang interaktif"*. Diukur: 28 foto
 * disajikan sebagai grid mati. Tak bisa diklik, tak bisa diperbesar, tak bisa
 * disaring. Orang yang datang mencari "apakah mereka pernah bikin gudang
 * sebesar punya saya" harus menggulir seluruh halaman dan menebak dari
 * gambar kecil.
 *
 * ── Kenapa client island, bukan mengubah seluruh seksi jadi client
 *
 * `Portofolio.tsx` tetap Server Component. Ia yang merender daftar kategori,
 * judul, dan ringkasannya — semua yang perlu dibaca mesin pencari dan tetap
 * bekerja tanpa JavaScript. Yang dipindah ke sini HANYA kendalinya.
 *
 * Yang paling menentukan: **fotonya tetap ada saat JS gagal.** Kalau seluruh
 * grid jadi client dan bundle-nya gagal dimuat, situs perusahaan konstruksi
 * kehilangan seluruh buktinya. Karena itu server merender grid lengkap, dan
 * komponen ini menggantinya begitu terpasang.
 *
 * ── Kenapa dialog dibangun tangan, bukan pustaka
 *
 * Diperiksa `package.json`: tak ada Radix, tak ada headless-ui, tak ada
 * Motion. Menambah dependensi untuk satu dialog di satu halaman adalah ongkos
 * yang tak sepadan. `<dialog>` bawaan peramban sudah memberi fokus terkunci,
 * lapisan atas, dan Esc — tiga hal yang paling sering salah kalau ditulis
 * sendiri dari div.
 */

type Props = {
  kategori: Kategori[]
  labelSemua: string
}

type Terbuka = { kategoriKunci: string; indeks: number } | null

export function PortofolioInteraktif({ kategori, labelSemua }: Props) {
  const [saring, setSaring] = useState<string | null>(null)
  const [terbuka, setTerbuka] = useState<Terbuka>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pemicuRef = useRef<HTMLButtonElement | null>(null)
  const idJudul = useId()

  const terlihat = petakTerlihat(kategori, saring)
  const total = kategori.reduce((n, k) => n + k.media.length, 0)

  // Kategori foto yang sedang dibuka — dipakai untuk keterangan di dialog.
  const kategoriFoto = terbuka
    ? kategori.find((k) => k.kunci === terbuka.kategoriKunci)
    : null
  const foto = kategoriFoto?.media[terbuka!.indeks] ?? null

  const buka = useCallback((kunci: string, indeks: number, dari: HTMLButtonElement) => {
    pemicuRef.current = dari
    setTerbuka({ kategoriKunci: kunci, indeks })
  }, [])

  const tutup = useCallback(() => {
    setTerbuka(null)
    // Fokus DIKEMBALIKAN ke gambar yang tadi diklik, bukan dibiarkan jatuh ke
    // awal halaman. Tanpa ini, pengguna keyboard yang menutup dialog harus
    // menyusuri seluruh halaman lagi untuk kembali ke tempatnya semula.
    pemicuRef.current?.focus()
  }, [])

  const geser = useCallback((arah: 1 | -1) => {
    setTerbuka((t) => {
      if (!t) return t
      const k = kategori.find((x) => x.kunci === t.kategoriKunci)
      if (!k) return t
      return { ...t, indeks: geserIndeks(t.indeks, arah, k.media.length) }
    })
  }, [kategori])

  // `<dialog>` bawaan: showModal() memberi fokus terkunci, lapisan ::backdrop,
  // dan Esc — tanpa satu baris pun kode fokus buatan sendiri.
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (terbuka && !d.open) d.showModal()
    if (!terbuka && d.open) d.close()
  }, [terbuka])

  // Panah kiri/kanan hanya saat dialog terbuka. Esc ditangani `<dialog>`
  // sendiri; `onClose` di bawah yang menyelaraskan state kita dengannya.
  useEffect(() => {
    if (!terbuka) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); geser(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); geser(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [terbuka, geser])

  return (
    <>
      {/* ── Saringan ────────────────────────────────────────────────────── */}
      <div
        role="group"
        aria-label={labelSemua}
        className="porto-saring"
      >
        <button
          type="button"
          onClick={() => setSaring(null)}
          aria-pressed={saring === null}
          className="porto-pil"
        >
          {labelSemua}
          <span className="porto-jumlah angka">{total}</span>
        </button>

        {kategori.map((k) => (
          <button
            key={k.kunci}
            type="button"
            onClick={() => setSaring(k.kunci)}
            aria-pressed={saring === k.kunci}
            className="porto-pil"
          >
            {k.judul}
            <span className="porto-jumlah angka">{k.media.length}</span>
          </button>
        ))}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div className="porto-grid">
        {terlihat.map(({ media: m, kunci, indeks }) => (
          <button
            key={`${kunci}-${m.path_storage}`}
            type="button"
            className="porto-petak"
            onClick={(e) => buka(kunci, indeks, e.currentTarget)}
          >
            <img
              src={urlMedia(m.path_storage, 1280)}
              srcSet={srcSetMedia(m.path_storage)}
              sizes="(max-width: 40rem) 100vw, (max-width: 70rem) 50vw, 19rem"
              alt={m.alt}
              width={m.lebar}
              height={m.tinggi}
              loading="lazy"
              decoding="async"
            />
          </button>
        ))}
      </div>

      {/* ── Dialog ──────────────────────────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        className="porto-dialog"
        aria-labelledby={idJudul}
        // Menyelaraskan state saat dialog ditutup lewat Esc atau klik backdrop
        // — jalur yang TIDAK melewati tombol tutup kita.
        onClose={tutup}
        onClick={(e) => {
          // Klik di luar gambar menutup. `e.target === e.currentTarget` benar
          // hanya untuk backdrop, karena isinya dibungkus elemen sendiri.
          if (e.target === e.currentTarget) dialogRef.current?.close()
        }}
      >
        {foto && kategoriFoto && (
          <div className="porto-dialog-isi">
            <img
              src={urlMedia(foto.path_storage, 1920)}
              srcSet={srcSetMedia(foto.path_storage)}
              sizes="90vw"
              alt={foto.alt}
              width={foto.lebar}
              height={foto.tinggi}
            />

            <div className="porto-dialog-kaki">
              <p id={idJudul}>
                {kategoriFoto.judul}
                <span className="angka">
                  {terbuka!.indeks + 1} dari {kategoriFoto.media.length}
                </span>
              </p>

              <div className="porto-dialog-tombol">
                <button type="button" onClick={() => geser(-1)} aria-label="Foto sebelumnya">
                  &#8592;
                </button>
                <button type="button" onClick={() => geser(1)} aria-label="Foto berikutnya">
                  &#8594;
                </button>
                <button type="button" onClick={() => dialogRef.current?.close()}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
