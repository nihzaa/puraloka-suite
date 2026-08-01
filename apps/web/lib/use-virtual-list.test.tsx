import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVirtualList } from './use-virtual-list'

// ─────────────────────────────────────────────────────────────────────────────
// `useVirtualList` — menentukan BARIS MANA yang benar-benar dirender pada
// daftar panjang (RAB ribuan item, daftar resource, log progres).
//
// Kenapa ini perlu test: salahnya tak pernah melempar error. Jendela yang
// meleset satu baris berarti baris HILANG dari layar — dan orang tak melihat
// baris yang hilang, mereka hanya menyimpulkan "datanya tak ada". Pada RAB,
// itu berarti item pekerjaan yang tak pernah diisi harganya.
//
// Yang dijaga di sini murni aritmetika jendela: apa yang dirender, berapa
// ruang kosong di atas dan bawahnya, dan kapan virtualisasi mengalah pada
// render biasa. Bagian yang menyentuh DOM (scroll listener, ResizeObserver)
// tak diuji di sini — jsdom tak punya tata letak nyata, jadi mengujinya
// berarti menguji tiruan, bukan perilaku.
//
// ── BATAS yang diketahui, dan kenapa dibiarkan
//
// Uji mutasi menemukan dua yang TIDAK terjaga: mengubah `padTop` jadi
// `mulai * tinggiBaris * 2`, dan melepas `Math.max(0, …)` dari `padBottom`.
// Keduanya lolos karena di jsdom `scrollTop` selalu 0 — `mulai` ikut 0,
// dan `0 × 2` tetap 0.
//
// Menjaganya butuh scroll SUNGGUHAN, yang berarti browser sungguhan. Memaksa
// `scrollTop` lewat mock hanya akan menguji mock itu: nilainya tak mengalir
// lewat jalur yang sama (event `scroll` → `setState`), jadi test-nya akan
// hijau tanpa membuktikan apa pun tentang kode nyata.
//
// Dicatat di sini alih-alih ditutup dengan test palsu. Kalau nanti repo ini
// menambahkan Playwright, dua invarian itu tempatnya di sana.
// ─────────────────────────────────────────────────────────────────────────────

describe('useVirtualList — jendela render', () => {
  it('NONAKTIF di bawah ambang — render semua, tanpa padding', () => {
    // Di bawah 60 baris, virtualisasi hanya menambah rumit tanpa manfaat.
    const { result } = renderHook(() => useVirtualList(50, 40))

    expect(result.current.nonaktif).toBe(true)
    expect(result.current.mulai).toBe(0)
    expect(result.current.akhir, 'sebagian baris tak dirender padahal daftarnya pendek').toBe(50)
    expect(result.current.padTop).toBe(0)
    expect(result.current.padBottom).toBe(0)
  })

  it('AKTIF di atas ambang', () => {
    const { result } = renderHook(() => useVirtualList(500, 40))
    expect(result.current.nonaktif).toBe(false)
  })

  it('tepat DI ambang masih nonaktif — batasnya inklusif', () => {
    // `jumlah <= ambangAktif`. Kalau batasnya bergeser jadi `<`, daftar 60
    // baris tiba-tiba tervirtualisasi tanpa alasan.
    expect(renderHook(() => useVirtualList(60, 40)).result.current.nonaktif).toBe(true)
    expect(renderHook(() => useVirtualList(61, 40)).result.current.nonaktif).toBe(false)
  })

  it('di posisi awal, jendela mulai dari 0 — tak ada baris terlewat di atas', () => {
    // `Math.max(0, …)` menjaga ini. Tanpa itu `mulai` jadi negatif (buffer
    // dikurangkan dari 0), dan `slice(-8)` mengambil baris dari UJUNG daftar —
    // orang membuka halaman lalu melihat data terakhir, bukan pertama.
    const { result } = renderHook(() => useVirtualList(1000, 40, { tinggiViewport: 400 }))

    expect(result.current.mulai, 'jendela mulai dari indeks negatif').toBe(0)
    expect(result.current.padTop).toBe(0)
  })

  it('jendela mencakup viewport + buffer di kedua sisi', () => {
    // viewport 400 / baris 40 = 10 terlihat; buffer 8 → jendela 10 + 16 = 26.
    const { result } = renderHook(() =>
      useVirtualList(1000, 40, { tinggiViewport: 400, buffer: 8 }),
    )

    expect(
      result.current.akhir - result.current.mulai,
      'jendela lebih sempit daripada viewport — baris kosong terlihat saat menggulir cepat',
    ).toBe(26)
  })

  it('`akhir` tak pernah melewati jumlah data', () => {
    // Tanpa `Math.min`, `slice` mengembalikan lebih sedikit dari yang diminta
    // dan `padBottom` jadi NEGATIF — daftar menyusut secara visual.
    const { result } = renderHook(() =>
      useVirtualList(20_000, 40, { tinggiViewport: 400, ambangAktif: 10 }),
    )

    expect(result.current.akhir).toBeLessThanOrEqual(20_000)
    expect(result.current.padBottom, 'padding bawah negatif — tinggi daftar salah').toBeGreaterThanOrEqual(0)
  })

  it('padTop + baris dirender + padBottom = tinggi seluruh daftar', () => {
    // Ini invarian yang menjaga scrollbar tetap benar. Kalau jumlahnya
    // meleset, panjang scrollbar berubah-ubah saat menggulir — dan posisi
    // gulir melompat sendiri.
    const jumlah = 1000
    const tinggiBaris = 40
    const { result } = renderHook(() =>
      useVirtualList(jumlah, tinggiBaris, { tinggiViewport: 400 }),
    )

    const { mulai, akhir, padTop, padBottom } = result.current
    const total = padTop + (akhir - mulai) * tinggiBaris + padBottom

    expect(
      total,
      'tinggi total tak konsisten — scrollbar berubah panjang saat menggulir, ' +
        'dan posisi gulir melompat sendiri',
    ).toBe(jumlah * tinggiBaris)
  })

  it('jendela mendekati UJUNG daftar tak melewati batas', () => {
    // ⚠️ Test-test di atas semuanya berjalan pada `scrollTop = 0`, dan itu
    // ketahuan dari uji mutasi: melepas `Math.min(jumlah, …)` TIDAK
    // menggagalkan satu pun — karena di posisi awal `akhir` memang jauh dari
    // ujung. Sama untuk `padTop` dan `padBottom`, yang keduanya nol di sana.
    //
    // Yang diuji di sini: daftar PENDEK yang tervirtualisasi, sehingga
    // jendela (viewport + buffer) LEBIH BESAR daripada datanya. Itu memaksa
    // `Math.min` dan `Math.max` bekerja tanpa perlu menggulir sungguhan —
    // jsdom tak punya tata letak, jadi menggulir di sana menguji tiruan.
    const jumlah = 65 // di atas ambang 60, tapi lebih kecil dari jendela
    const tinggiBaris = 40
    const { result } = renderHook(() =>
      useVirtualList(jumlah, tinggiBaris, { tinggiViewport: 4000, buffer: 8 }),
    )

    expect(result.current.nonaktif).toBe(false)
    expect(
      result.current.akhir,
      '`akhir` melewati jumlah data — `slice` mengembalikan lebih sedikit dari ' +
        'yang diminta dan tinggi daftar ikut salah',
    ).toBe(jumlah)
    expect(
      result.current.padBottom,
      'padding bawah negatif — daftar menyusut secara visual',
    ).toBe(0)

    // Invarian tinggi tetap berlaku di ujung.
    const total = result.current.padTop
      + (result.current.akhir - result.current.mulai) * tinggiBaris
      + result.current.padBottom
    expect(total).toBe(jumlah * tinggiBaris)
  })

  it('daftar KOSONG tak melempar', () => {
    const { result } = renderHook(() => useVirtualList(0, 40))
    expect(result.current.mulai).toBe(0)
    expect(result.current.akhir).toBe(0)
  })

  it('`pasang` aman dipanggil dengan null — komponen dilepas', () => {
    const { result } = renderHook(() => useVirtualList(500, 40))
    expect(() => act(() => result.current.pasang(null))).not.toThrow()
  })

  it('properti bernama `pasang`, BUKAN `ref`', () => {
    // Bukan selera penamaan: `react-hooks/refs` memperlakukan properti bernama
    // `ref` pada hasil hook sebagai ref sungguhan, lalu menganggap SETIAP
    // pembacaan properti lain di objek yang sama sebagai akses-ref selama
    // render. Mengganti namanya kembali ke `ref` akan memerahkan lint di
    // setiap pemanggil — test ini membuat alasannya terbaca sebelum itu.
    const { result } = renderHook(() => useVirtualList(500, 40))
    expect(result.current).toHaveProperty('pasang')
    expect(result.current).not.toHaveProperty('ref')
  })
})
