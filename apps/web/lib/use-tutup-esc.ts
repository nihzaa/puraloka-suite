/**
 * `useTutupEsc()` — modal ditutup dengan tombol Esc.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sembilan modal di halaman `/mandor` bisa ditutup dengan mengklik latarnya
 * dan tak ada cara lain — nol penanganan Esc di seluruh berkas (diverifikasi
 * 2026-08-01). Bagi pemakai keyboard itu berarti **terjebak**: modal terbuka,
 * Tab berputar di dalamnya, dan satu-satunya jalan keluar adalah mengambil
 * tetikus.
 *
 * WCAG 2.1 menyebut ini "No Keyboard Trap" (2.1.2, Level A) — bukan
 * penyempurnaan, melainkan syarat dasar.
 *
 * ── Kenapa bukan sekadar menambal latar dengan `role="button"`
 *
 * Itu yang disarankan lint (`click-events-have-key-events`) kalau dibaca
 * harfiah, dan itu jawaban yang salah: latar modal bukan tombol. Menandainya
 * begitu membuat pembaca layar mengumumkan "tombol" untuk area kosong, dan
 * menambahkan satu perhentian Tab yang tak berarti apa-apa. Yang dibutuhkan
 * bukan latar yang bisa difokus — melainkan jalan keluar dari papan tik.
 *
 * ── Pemakaian
 *
 *     useTutupEsc(onClose)
 *
 * Nonaktifkan sementara (mis. saat sedang menyimpan) dengan melewatkan `null`:
 *
 *     useTutupEsc(saving ? null : onClose)
 */
import { useEffect } from 'react'

export function useTutupEsc(tutup: (() => void) | null | undefined) {
  useEffect(() => {
    if (!tutup) return
    // Disalin ke const supaya penyempitan tipe bertahan sampai ke dalam
    // penangan — `tutup` adalah parameter yang bisa berubah tiap render.
    const jalankan = tutup
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // ⚠️ CATATAN untuk modal BERTUMPUK.
      //
      // Penangan ini terpasang di `document`, jadi kalau dua modal terbuka
      // bersamaan KEDUANYA menerima Esc dan keduanya tertutup sekaligus.
      //
      // Konsekuensi itu diterima, bukan diabaikan: menutup terlalu banyak
      // membuat orang mengulang beberapa klik; TERJEBAK di modal tanpa jalan
      // keluar papan tik melanggar WCAG 2.1.2 dan tak punya jalan keluar sama
      // sekali. Yang kedua jauh lebih buruk.
      //
      // Kalau nanti ada modal DI ATAS modal dan perilaku itu terasa salah,
      // hook ini butuh daftar tumpukan supaya hanya yang teratas menanggapi.
      // Ditulis di sini supaya yang menambahkannya tahu, bukan menemukannya
      // lewat laporan bug.
      e.preventDefault()
      jalankan()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tutup])
}
