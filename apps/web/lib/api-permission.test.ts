import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getStoredPermissions, hasPermission, logout } from './api'

// ─────────────────────────────────────────────────────────────────────────────
// `hasPermission` & `logout` — dua jalur KEAMANAN di sisi web.
//
// `hasPermission` adalah gerbang yang menentukan siapa melihat tombol apa
// (ADR-004: kode memeriksa capability, bukan nama jabatan). Ia dipakai di
// puluhan tempat setelah remediasi 2026-08-01, dan tak satu pun diuji.
//
// `logout` lebih halus tapi lebih merusak kalau salah: kalau ia lupa membuang
// SATU kunci, orang berikutnya yang login di perangkat itu memakai sisa data
// pemilik sebelumnya. Untuk `puraloka_company_id` akibatnya konkret dan sudah
// dicatat di kodenya: request membawa `x-company-id` milik orang lain, ditolak
// 403, dan pemakainya terkunci tanpa tahu sebabnya.
//
// Keduanya membaca `localStorage`, yang berarti mereka juga harus TAHAN
// terhadap isi yang rusak — dan itu bukan hipotetis: nilai di sana bertahan
// lintas rilis, jadi format lama akan bertemu kode baru.
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('hasPermission — gerbang tampilan', () => {
  it('true untuk permission yang dimiliki', () => {
    localStorage.setItem('puraloka_permissions', JSON.stringify(['audit:view', 'cash:transfer:create']))
    expect(hasPermission('audit:view')).toBe(true)
  })

  it('false untuk yang TIDAK dimiliki — bukan sekadar tak melempar', () => {
    localStorage.setItem('puraloka_permissions', JSON.stringify(['audit:view']))
    expect(
      hasPermission('users:manage'),
      'permission yang tak dimiliki dianggap ada — tombol muncul lalu API menolak 403',
    ).toBe(false)
  })

  it('false saat BELUM ADA data sama sekali (belum login)', () => {
    // Gagal-terbuka di sini berarti seluruh UI tampil sebelum login.
    expect(hasPermission('users:manage')).toBe(false)
  })

  it('false saat isi localStorage RUSAK — gagal-tertutup, bukan melempar', () => {
    // Nilai di `localStorage` bertahan lintas rilis, jadi format lama pasti
    // bertemu kode baru suatu saat. Melempar di sini membuat SELURUH halaman
    // blank; mengembalikan `true` membuka akses yang tak dimiliki. Yang benar:
    // diam-diam tertutup.
    localStorage.setItem('puraloka_permissions', '{bukan json')
    expect(() => hasPermission('audit:view')).not.toThrow()
    expect(hasPermission('audit:view')).toBe(false)

    // ⚠️ Memeriksa satu permission SAJA tidak cukup, dan itu ketahuan dari uji
    // mutasi: mengubah `catch` agar mengembalikan `new Set(['*'])` tetap
    // membuat test di atas hijau — `'audit:view'` memang tak ada di sana.
    // Tapi Set yang tak kosong berarti data RUSAK bisa memberi permission,
    // dan cukup satu tempat memeriksa `'*'` untuk membuka seluruh UI.
    //
    // Yang dijaga: gagal-tertutup berarti KOSONG, bukan "kebetulan tak cocok".
    expect(
      getStoredPermissions().size,
      'data rusak menghasilkan permission — gagal-tertutup harus berarti nol, ' +
        'bukan sekadar tak cocok dengan yang kebetulan diperiksa',
    ).toBe(0)
  })

  it('false saat isinya JSON tapi bukan array', () => {
    localStorage.setItem('puraloka_permissions', JSON.stringify({ audit: true }))
    expect(hasPermission('audit:view')).toBe(false)
  })

  it('cocok PERSIS — bukan awalan', () => {
    // `cash:transfer` tak boleh membuka `cash:transfer:confirm`. Pencocokan
    // awalan akan memberi wewenang mengonfirmasi kepada yang hanya boleh
    // membuat — dan itu memindahkan uang.
    localStorage.setItem('puraloka_permissions', JSON.stringify(['cash:transfer']))
    expect(
      hasPermission('cash:transfer:confirm'),
      'pencocokan awalan memberi wewenang yang tak diberikan',
    ).toBe(false)
  })

  it('getStoredPermissions mengembalikan Set, bukan array', () => {
    localStorage.setItem('puraloka_permissions', JSON.stringify(['a', 'b', 'a']))
    const p = getStoredPermissions()
    expect(p).toBeInstanceOf(Set)
    expect(p.size).toBe(2)
  })
})

describe('logout — tak boleh menyisakan jejak pemilik sebelumnya', () => {
  it('membuang SELURUH kunci milik pemakai', () => {
    localStorage.setItem('puraloka_user', JSON.stringify({ id: 'u1' }))
    localStorage.setItem('puraloka_permissions', JSON.stringify(['audit:view']))
    localStorage.setItem('puraloka_company_id', 'c1')
    localStorage.setItem('puraloka_menu', JSON.stringify([{ key: 'proyek' }]))
    localStorage.setItem('puraloka_menu_etag', 'W/"abc"')

    logout()

    // Diperiksa satu per satu, bukan `length === 0`: memeriksa jumlah membuat
    // test tetap hijau kalau kunci BARU ditambahkan tanpa ikut dibuang.
    expect(localStorage.getItem('puraloka_user'), 'data user tertinggal').toBeNull()
    expect(localStorage.getItem('puraloka_permissions'), 'permission tertinggal').toBeNull()
    expect(
      localStorage.getItem('puraloka_company_id'),
      'pilihan perusahaan tertinggal — orang berikutnya mengirim x-company-id ' +
        'milik pemilik sebelumnya, ditolak 403, dan terkunci tanpa tahu sebabnya',
    ).toBeNull()

    // Menu berbeda per perusahaan (`company_menu_settings`), jadi cache yang
    // tertinggal menampilkan struktur menu tenant SEBELUMNYA kepada orang
    // berikutnya di perangkat ini.
    expect(localStorage.getItem('puraloka_menu'), 'cache menu tertinggal').toBeNull()
    // ETag lebih buruk kalau tertinggal: peramban mengirim `If-None-Match`
    // milik tenant lama dan server bisa membalas 304, sehingga menu lama
    // BERTAHAN alih-alih diperbarui — tanpa satu pun pesan galat.
    expect(
      localStorage.getItem('puraloka_menu_etag'),
      'ETag menu tertinggal — revalidasi membalas 304 dan menu tenant lama bertahan',
    ).toBeNull()
  })

  it('sesudah logout, hasPermission kembali false', () => {
    localStorage.setItem('puraloka_permissions', JSON.stringify(['users:manage']))
    expect(hasPermission('users:manage')).toBe(true)

    logout()

    expect(
      hasPermission('users:manage'),
      'permission masih terbaca sesudah logout — UI menampilkan tombol milik ' +
        'orang yang sudah keluar',
    ).toBe(false)
  })

  it('aman dipanggil dua kali', () => {
    logout()
    expect(() => logout()).not.toThrow()
  })
})
