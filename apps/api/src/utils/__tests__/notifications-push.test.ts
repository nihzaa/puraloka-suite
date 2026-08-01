import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// NOTIFIKASI → WEB PUSH: rantai yang selama ini PUTUS.
//
// `utils/webpush.ts` lengkap sejak lama — VAPID terkonfigurasi, endpoint
// subscribe hidup, service worker terpasang. Tapi `sendWebPush()` punya NOL
// SEBUTAN di seluruh `src/` (diverifikasi grep 2026-08-01), sehingga
// `createNotifications()` menulis `channel: 'push'` ke DB tanpa pernah
// benar-benar mengirim push. Nol dari 23 user punya `push_subscription` —
// konsisten, karena UI-nya juga tak pernah memanggil `subscribeToPush()`.
//
// Yang dijaga test ini bukan "web-push berfungsi" (itu urusan pustakanya),
// melainkan **rantainya tetap tersambung**: kalau seseorang menghapus
// panggilan push saat merapikan `notifications.ts`, seluruh notifikasi
// diam-diam kembali jadi in-app saja — tanpa satu pun error.
// ============================================================

const insertHasil = { error: null as { message: string } | null }
const terkirim: Array<{ userIds: string[]; payload: Record<string, unknown> }> = []

vi.mock('../supabase.js', () => {
  const chain = {
    insert: vi.fn(async () => insertHasil),
    select: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(async () => ({ data: [] })),
  }
  return { supabase: { from: vi.fn(() => chain) } }
})

vi.mock('../webpush.js', () => ({
  sendWebPushToUsers: vi.fn(async (userIds: string[], payload: Record<string, unknown>) => {
    terkirim.push({ userIds, payload })
  }),
}))

const { createNotification, createNotifications } = await import('../notifications.js')

const U1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const U2 = 'bbbbbbbb-0000-0000-0000-000000000002'
const U3 = 'cccccccc-0000-0000-0000-000000000003'

/**
 * Push dikirim fire-and-forget (`void`) DAN lewat impor dinamis
 * (`await import('./webpush.js')`), jadi butuh lebih dari satu putaran
 * microtask untuk selesai.
 *
 * Satu `setTimeout(0)` sempat cukup untuk kasus SATU panggilan tapi tidak
 * untuk DUA — dan itu membuat test "pesan berbeda tetap terpisah" gagal
 * padahal kodenya benar. Kegagalan yang menuduh kode padahal test-nya yang
 * belum menunggu adalah kelas kesalahan yang mahal: ia mengirim orang
 * memperbaiki hal yang tak rusak.
 */
const tunggu = async (harapan?: number) => {
  // Menunggu sampai JUMLAHNYA sesuai, bukan menebak berapa putaran cukup.
  // Menebak putaran membuat test bergantung kecepatan mesin: 5 putaran cukup
  // untuk satu panggilan tapi tidak untuk dua, dan kegagalannya menuduh KODE
  // padahal test-nya yang belum menunggu — kelas kesalahan yang mengirim
  // orang memperbaiki hal yang tak rusak.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2))
    if (harapan !== undefined && terkirim.length >= harapan) return
  }
}

beforeEach(async () => {
  // ⚠️ Tunggu SEBELUM mengosongkan, bukan hanya sesudah memanggil.
  //
  // Push dikirim fire-and-forget lewat impor dinamis, jadi panggilan dari test
  // SEBELUMNYA bisa baru mendarat setelah test berikutnya mulai — lalu
  // `terkirim` yang sudah dikosongkan terisi lagi oleh sisa itu, dan
  // hitungannya jadi salah di test yang tak bersalah. Kegagalan semacam ini
  // menuduh kode padahal yang bocor adalah antar-test.
  await new Promise((r) => setTimeout(r, 30))
  terkirim.length = 0
  insertHasil.error = null
})

describe('createNotifications → Web Push', () => {
  it('notifikasi yang tersimpan MEMICU push', async () => {
    await createNotifications([
      { user_id: U1, title: 'Kasbon menunggu', message: 'Rp 500.000', type: 'kasbon_pending' },
    ])
    await tunggu(1)

    expect(
      terkirim.length,
      'notifikasi tersimpan tapi push tak dikirim — rantainya putus lagi, dan ' +
        'seluruh notifikasi kembali in-app saja tanpa satu pun error'
    ).toBe(1)
    expect(terkirim[0].userIds).toEqual([U1])
    expect(terkirim[0].payload.title).toBe('Kasbon menunggu')
  })

  it('gagal simpan → TIDAK mengirim push', async () => {
    // Push untuk notifikasi yang tak tersimpan membuat penerima mengetuk
    // notifikasi, membuka aplikasi, dan tak menemukan apa pun.
    insertHasil.error = { message: 'insert gagal' }
    await createNotifications([
      { user_id: U1, title: 'X', message: 'Y', type: 'general' },
    ])
    await tunggu()

    expect(
      terkirim.length,
      'push dikirim untuk notifikasi yang GAGAL disimpan — penerima akan ' +
        'membuka aplikasi dan tak menemukan apa pun'
    ).toBe(0)
  })

  it('pesan yang SAMA ke banyak orang → SATU panggilan, bukan N', async () => {
    // Satu kejadian biasanya menghasilkan pesan identik untuk banyak penerima
    // ("kasbon menunggu persetujuan" ke seluruh admin). Mengirim per-baris
    // berarti N query ke `users` untuk payload yang sama persis.
    await createNotifications([
      { user_id: U1, title: 'Kasbon menunggu', message: 'Rp 500.000', type: 'kasbon_pending' },
      { user_id: U2, title: 'Kasbon menunggu', message: 'Rp 500.000', type: 'kasbon_pending' },
      { user_id: U3, title: 'Kasbon menunggu', message: 'Rp 500.000', type: 'kasbon_pending' },
    ])
    await tunggu(1)

    expect(terkirim.length, 'pesan identik dikirim terpisah — N query untuk payload yang sama').toBe(1)
    expect(terkirim[0].userIds.sort()).toEqual([U1, U2, U3].sort())
  })

  it('pesan BERBEDA tetap terpisah — tak digabung salah', async () => {
    // Penggabungan berdasarkan isi TIDAK boleh menyatukan pesan yang berbeda:
    // orang akan menerima notifikasi milik orang lain.
    await createNotifications([
      { user_id: U1, title: 'Kasbon disetujui', message: 'Rp 500.000', type: 'kasbon_approved' },
      { user_id: U2, title: 'Kasbon ditolak', message: 'Rp 500.000', type: 'kasbon_rejected' },
    ])
    await tunggu(2)

    expect(terkirim.length, 'dua pesan berbeda digabung — penerima dapat notifikasi orang lain').toBe(2)
    const judul = terkirim.map((t) => t.payload.title).sort()
    expect(judul).toEqual(['Kasbon disetujui', 'Kasbon ditolak'])
  })

  it('`action_url` ikut terbawa ke payload push', async () => {
    // Tanpa ini, mengetuk push membuka aplikasi di halaman awal — dan orang
    // harus mencari sendiri apa yang diberitahukan.
    await createNotifications([
      {
        user_id: U1, title: 'Temuan baru', message: 'PL-003',
        type: 'punch_assigned', action_url: '/lapangan/punch-list?item=abc',
      },
    ])
    await tunggu(1)
    expect(terkirim[0].payload.action_url).toBe('/lapangan/punch-list?item=abc')
  })

  it('daftar kosong → nol panggilan (tak ada push hantu)', async () => {
    await createNotifications([])
    await tunggu()
    expect(terkirim.length).toBe(0)
  })
})

describe('createNotification (tunggal) → Web Push', () => {
  it('memicu push untuk satu penerima', async () => {
    await createNotification({
      user_id: U1, title: 'Inspeksi lolos', message: 'RFI-004', type: 'inspeksi_lolos',
    })
    await tunggu(1)
    expect(terkirim.length).toBe(1)
    expect(terkirim[0].userIds).toEqual([U1])
  })

  it('gagal simpan → TIDAK mengirim push', async () => {
    insertHasil.error = { message: 'insert gagal' }
    await createNotification({
      user_id: U1, title: 'X', message: 'Y', type: 'general',
    })
    await tunggu()
    expect(terkirim.length).toBe(0)
  })
})
