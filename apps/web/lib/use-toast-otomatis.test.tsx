import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useState } from 'react'
import { useToastOtomatis } from './use-toast-otomatis'

// ─────────────────────────────────────────────────────────────────────────────
// `useToastOtomatis` — menutup toast setelah beberapa detik.
//
// Hook ini menggantikan pola yang disalin di 17 halaman. Kalau perilakunya
// salah, seluruh 17 halaman itu salah bersamaan — dan gejalanya tak seragam:
// toast yang tak pernah tertutup menghalangi tombol di bawahnya, sedangkan
// toast yang tertutup terlalu cepat membuat pesan galat tak sempat dibaca.
//
// Yang diuji di sini adalah PERILAKUNYA, bukan keberadaan panggilannya. Lint
// dan penjaga tak bisa membedakan `setTimeout(fn, 4000)` dari
// `setTimeout(fn, 40)`.
// ─────────────────────────────────────────────────────────────────────────────

function Contoh({ jeda }: { jeda?: number }) {
  const [pesan, setPesan] = useState<string | null>('tersimpan')
  useToastOtomatis(!!pesan, () => setPesan(null), jeda)
  return <div data-testid="toast">{pesan ?? 'kosong'}</div>
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useToastOtomatis', () => {
  it('menutup toast sesudah jeda lewat', () => {
    const { getByTestId } = render(<Contoh jeda={4000} />)
    expect(getByTestId('toast').textContent).toBe('tersimpan')

    act(() => { vi.advanceTimersByTime(3999) })
    expect(getByTestId('toast').textContent).toBe('tersimpan')

    act(() => { vi.advanceTimersByTime(1) })
    expect(getByTestId('toast').textContent).toBe('kosong')
  })

  it('TIDAK menutup sebelum waktunya — pesan galat harus sempat dibaca', () => {
    const { getByTestId } = render(<Contoh jeda={4000} />)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(getByTestId('toast').textContent).toBe('tersimpan')
  })

  it('penghitung tidak jalan saat tak ada toast', () => {
    const tutup = vi.fn()
    function Diam() {
      useToastOtomatis(false, tutup, 1000)
      return null
    }
    render(<Diam />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(tutup).not.toHaveBeenCalled()
  })

  // Inilah alasan setter disimpan di `ref`, bukan masuk dependensi.
  //
  // Kalau `tutup` ikut jadi dependensi, tiap render yang membuat fungsi baru
  // akan MENYALAKAN ULANG penghitungnya. Pada halaman yang sering render —
  // dan halaman yang menampilkan toast biasanya baru saja menyimpan sesuatu —
  // toast itu tak pernah tertutup sama sekali.
  it('render ulang dengan fungsi baru TIDAK menyalakan ulang penghitung', () => {
    const tutup = vi.fn()
    function Sering({ n }: { n: number }) {
      // Fungsi baru tiap render, persis seperti `() => setToast(null)` inline.
      useToastOtomatis(true, () => tutup(n), 1000)
      return <span>{n}</span>
    }
    const { rerender } = render(<Sering n={1} />)

    act(() => { vi.advanceTimersByTime(600) })
    rerender(<Sering n={2} />)   // render ulang di tengah jalan
    act(() => { vi.advanceTimersByTime(600) })

    // Total 1200ms > 1000ms → sudah harus tertutup meski di-render ulang.
    expect(tutup).toHaveBeenCalledTimes(1)
    // Dan yang dipanggil versi TERBARU, bukan closure basi dari render pertama.
    expect(tutup).toHaveBeenCalledWith(2)
  })

  // Diuji lewat `clearTimeout`, BUKAN lewat "setter tak terpanggil".
  //
  // Versi pertama test ini memeriksa `expect(tutup).not.toHaveBeenCalled()`
  // sesudah unmount — dan mutasi yang MENGHAPUS `clearTimeout` tetap
  // meloloskannya. Sebabnya: React mengabaikan setter pada komponen yang
  // sudah lepas, jadi `tutup` memang tak pernah terpanggil entah timernya
  // dibersihkan atau tidak. Test itu hijau tanpa menjaga apa pun.
  //
  // Yang bocor pada kasus nyata bukan pemanggilan setter melainkan TIMER-nya:
  // pada halaman yang membuka-tutup dialog berkali-kali, tiap toast
  // meninggalkan satu penghitung yang tak pernah dibatalkan.
  // Diuji lewat JUMLAH TIMER YANG MASIH MENGGANTUNG, bukan lewat spy.
  //
  // Dua versi sebelumnya gagal menangkap mutasi, masing-masing karena alasan
  // berbeda — dan keduanya hijau, yang justru lebih berbahaya daripada merah:
  //
  //   1. `expect(tutup).not.toHaveBeenCalled()` — React mengabaikan setter
  //      pada komponen yang sudah lepas, jadi ini benar entah timernya
  //      dibersihkan atau tidak.
  //   2. `vi.spyOn(globalThis, 'clearTimeout')` — `vi.useFakeTimers()` sudah
  //      MENGGANTI fungsi global itu, jadi spy-nya memata-matai fungsi yang
  //      tak lagi dipanggil siapa pun.
  //
  // `vi.getTimerCount()` membaca antrean timer palsu itu sendiri — satu-
  // satunya tempat yang benar-benar tahu apakah penghitungnya masih hidup.
  it('membersihkan penghitung saat komponen dilepas', () => {
    function Sementara() {
      useToastOtomatis(true, () => {}, 1000)
      return null
    }
    const { unmount } = render(<Sementara />)
    expect(vi.getTimerCount(), 'hook tak memasang penghitung').toBeGreaterThan(0)

    unmount()
    expect(
      vi.getTimerCount(),
      'timer masih menggantung sesudah unmount — tiap toast meninggalkan satu',
    ).toBe(0)
  })
})
