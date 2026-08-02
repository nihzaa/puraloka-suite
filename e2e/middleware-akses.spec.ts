import { test, expect, type Page } from '@playwright/test'

// ═════════════════════════════════════════════════════════════════════════════
// `middleware.ts` — siapa boleh melihat halaman apa.
//
// ── Kenapa harus di browser sungguhan
//
// Middleware Next berjalan di server, sebelum React ada. Tak satu pun dari
// 1.231 test API atau 56 test jsdom bisa menyentuhnya: yang pertama tak
// menjalankan Next, yang kedua mulai SESUDAH halaman diputuskan.
//
// Sampai file ini ada, satu-satunya lapisan yang memutuskan "mandor tak boleh
// membuka /keuangan" tak dijaga apa pun.
//
// ── Kenapa tak butuh kredensial
//
// Guard-nya membaca dua cookie (`puraloka_token`, `puraloka_role`), bukan
// memanggil Supabase. Jadi seluruh perilakunya bisa diuji tanpa login — dan
// itu SEKALIGUS temuan: token tak diverifikasi di sini.
//
// Itu bukan lubang keamanan dengan sendirinya — data sungguhan dijaga di API
// (Bearer token) dan di RLS. Middleware ini hanya mengarahkan navigasi. Tapi
// artinya ia tak boleh dianggap sebagai batas keamanan, dan test ini menulis
// itu supaya tak ada yang menyimpulkan sebaliknya dari melihat namanya.
// ═════════════════════════════════════════════════════════════════════════════

/** Pasang cookie sesi seolah user sudah login dengan role tertentu. */
async function masuk(page: Page, role: string) {
  await page.context().addCookies([
    { name: 'puraloka_token', value: 'token-uji', url: 'http://localhost:3100' },
    { name: 'puraloka_role', value: role, url: 'http://localhost:3100' },
  ])
}

/**
 * Buka `path`, kembalikan pathname SESUDAH redirect middleware.
 *
 * `waitUntil: 'commit'` — kita hanya peduli ke mana diarahkan, bukan apakah
 * halamannya selesai memuat. Menunggu `load` membuat test bergantung pada API
 * yang mungkin tak berjalan, dan itu menguji hal yang berbeda.
 */
async function bukaKe(page: Page, path: string): Promise<string> {
  await page.goto(path, { waitUntil: 'commit' })
  return new URL(page.url()).pathname
}

test.describe('Belum login', () => {
  test('halaman terlindungi mengarahkan ke /login', async ({ page }) => {
    expect(await bukaKe(page, '/dashboard')).toBe('/login')
    expect(await bukaKe(page, '/keuangan')).toBe('/login')
  })

  test('/login sendiri TIDAK dialihkan — kalau iya, tak ada yang bisa masuk', async ({ page }) => {
    expect(await bukaKe(page, '/login')).toBe('/login')
  })
})

test.describe('Isolasi antar-role', () => {
  test('mandor tak bisa membuka halaman keuangan', async ({ page }) => {
    await masuk(page, 'mandor')

    expect(
      await bukaKe(page, '/keuangan'),
      'mandor bisa membuka halaman keuangan — invoice, kasbon lintas proyek, ' +
        'dan arus kas seluruh perusahaan terlihat oleh orang lapangan',
    ).toBe('/mandor-portal')
  })

  test('client hanya bisa ke portal-nya sendiri', async ({ page }) => {
    await masuk(page, 'client')

    expect(await bukaKe(page, '/dashboard')).toBe('/portal')
    expect(
      await bukaKe(page, '/mandor-portal'),
      'client masuk ke portal mandor — data upah dan kasbon terlihat oleh klien',
    ).toBe('/portal')
    // Yang memang haknya tetap terbuka — termasuk anak rutenya, yang harus
    // tetap cocok sesudah pencocokan diperketat ke batas segmen.
    expect(await bukaKe(page, '/portal')).toBe('/portal')
    expect(
      await bukaKe(page, '/portal/proyek'),
      'anak rute ikut diblokir — pencocokan terlalu ketat, klien tak bisa ' +
        'membuka apa pun selain halaman depan portalnya',
    ).toBe('/portal/proyek')
  })

  test('pm tak bisa membuka manajemen user', async ({ page }) => {
    await masuk(page, 'pm')

    expect(
      await bukaKe(page, '/users'),
      'PM bisa membuka manajemen user — pembuatan akun dan penggantian role terbuka',
    ).toBe('/pm-portal')
  })

  test('pm ditolak dari /dashboard TANPA loop redirect', async ({ page }) => {
    // Sampai 2026-08-02 ini menghasilkan ERR_TOO_MANY_REDIRECTS: home PM adalah
    // `/dashboard`, tapi `/dashboard` tak ada di daftar izinnya — jadi redirect
    // "kembali ke home" ditolak lagi, selamanya. Layar kosong, tanpa pesan.
    //
    // `/dashboard` tetap TERTUTUP untuk PM (`routes/v1/dashboard.ts` tak
    // menyaring per-role — membukanya berarti memberi angka keuangan seluruh
    // perusahaan). Yang diperbaiki adalah tujuannya, bukan haknya.
    expect(
      await bukaKe(page, '/dashboard'),
      'PM masuk ke dashboard admin — angka keuangan seluruh perusahaan terbuka',
    ).not.toBe('/dashboard')
  })

  test('admin bisa ke halaman admin', async ({ page }) => {
    await masuk(page, 'admin')

    // Sisi sebaliknya: guard yang terlalu ketat memblokir admin dari
    // pekerjaannya sendiri, dan itu sama merusaknya dengan yang terlalu longgar.
    expect(await bukaKe(page, '/dashboard')).toBe('/dashboard')
    expect(await bukaKe(page, '/keuangan')).toBe('/keuangan')
    expect(await bukaKe(page, '/users')).toBe('/users')
  })
})

test.describe('Role kustom', () => {
  // Role kustom (mis. "direktur") dibuat lewat UI dan tak ada di `ROLE_ALLOWED`.
  // Cabang ini yang menanganinya — dan ia gampang terlewat karena tak ada role
  // kustom di data seed.
  test('boleh ke dashboard, tetap diblokir dari portal role lain', async ({ page }) => {
    await masuk(page, 'direktur')

    expect(await bukaKe(page, '/dashboard')).toBe('/dashboard')
    expect(
      await bukaKe(page, '/mandor-portal'),
      'role kustom masuk ke portal mandor — cabang `blockedPrefixes` tak jalan',
    ).toBe('/dashboard')
    expect(await bukaKe(page, '/portal')).toBe('/dashboard')
  })
})

test.describe('Pencocokan prefiks', () => {
  test('prefiks yang mirip tak ikut terbuka', async ({ page }) => {
    // `ROLE_ALLOWED` mencocokkan dengan `startsWith`. Mandor diizinkan ke
    // `/proyek` — pertanyaannya apakah izin itu bocor ke rute lain yang
    // KEBETULAN diawali huruf yang sama.
    //
    // Ini bukan skenario karangan: menambah menu bernama `/proyeksi-kas`
    // (dan "Proyeksi Kas" MEMANG sudah ada di roadmap sebagai item #10) akan
    // membuatnya cocok dengan prefiks `/proyek` dan terbuka untuk mandor
    // tanpa ada yang mengubah daftar izin.
    await masuk(page, 'mandor')

    expect(
      await bukaKe(page, '/proyeksi-kas'),
      'rute `/proyeksi-kas` terbuka untuk mandor hanya karena diawali `/proyek` — ' +
        'pencocokan prefiks bocor ke rute yang namanya kebetulan mirip',
    ).toBe('/mandor-portal')
  })
})
