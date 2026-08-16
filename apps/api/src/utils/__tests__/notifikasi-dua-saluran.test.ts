import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// CORONG SATU, SALURAN DUA.
//
// Yang dijaga di sini bukan "Expo berfungsi" melainkan RANTAINYA TERSAMBUNG —
// persis alasan `notifications-push.test.ts` ada untuk Web Push.
//
// Kelas cacat yang ditutup: seseorang merapikan `notifications.ts` dan
// menghapus salah satu dari dua panggilan. Tak ada yang merah, tak ada galat,
// dan seluruh notifikasi diam-diam berhenti sampai ke HP — sementara Web Push
// tetap jalan sehingga "notifikasi masih berfungsi" terasa benar.
//
// Ini SATU-SATUNYA yang membuktikan push natif ikut terpanggil untuk tiap
// notifikasi; tak ada penjaga skrip yang memeriksa hal ini.
// ============================================================================

const insertHasil = { error: null as { message: string } | null }
const web: Array<{ userIds: string[]; muatan: Record<string, unknown> }> = []
const natif: Array<{ userIds: string[]; muatan: Record<string, unknown> }> = []

vi.mock('../supabase.js', () => {
  const chain: Record<string, unknown> = {}
  chain.insert = vi.fn(async () => insertHasil)
  chain.select = vi.fn(() => chain)
  chain.in = vi.fn(async () => ({ data: [], error: null }))
  chain.not = vi.fn(async () => ({ data: [] }))
  return { supabase: { from: vi.fn(() => chain) } }
})

vi.mock('../webpush.js', () => ({
  sendWebPushToUsers: vi.fn(async (userIds: string[], muatan: Record<string, unknown>) => {
    web.push({ userIds, muatan })
  }),
}))

vi.mock('../push-natif.js', () => ({
  kirimPushNatifKeUsers: vi.fn(async (userIds: string[], muatan: Record<string, unknown>) => {
    natif.push({ userIds, muatan })
    return userIds.length
  }),
}))

// Jembatan otomasi dibungkam: ia menyentuh webhook n8n, dan test ini tak
// sedang mengujinya.
vi.mock('../terbit-peristiwa.js', () => ({
  terbitkanPeristiwa: vi.fn(async () => {}),
}))

const { createNotification, createNotifications } = await import('../notifications.js')

const CO = 'cccccccc-0000-0000-0000-000000000001'
const U1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const U2 = 'bbbbbbbb-0000-0000-0000-000000000002'

/**
 * Push dikirim fire-and-forget (`void`), jadi butuh beberapa putaran microtask.
 * Menunggu sampai JUMLAHNYA sesuai, bukan menebak berapa putaran cukup —
 * pelajaran yang sudah dibayar `notifications-push.test.ts`: menebak putaran
 * membuat test bergantung kecepatan mesin, dan kegagalannya menuduh KODE.
 */
const tunggu = async (harapan: number) => {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2))
    if (natif.length >= harapan && web.length >= harapan) return
  }
}

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 30))
  web.length = 0
  natif.length = 0
  insertHasil.error = null
})

describe('createNotification — satu penerima', () => {
  it('memanggil KEDUA saluran, bukan hanya Web Push', async () => {
    await createNotification({
      company_id: CO, user_id: U1,
      title: 'Kasbon menunggu', message: 'Rp 500.000',
      type: 'kasbon_pending', action_url: '/kasbon/1',
    })
    await tunggu(1)

    expect(web).toHaveLength(1)
    expect(natif).toHaveLength(1)
    expect(natif[0].userIds).toEqual([U1])
  })

  it('muatan kedua saluran IDENTIK — dua jalur tak boleh menyimpang', async () => {
    await createNotification({
      company_id: CO, user_id: U1,
      title: 'NCR baru', message: 'Beton keropos',
      type: 'ncr_assigned', action_url: '/ncr/9',
    })
    await tunggu(1)

    // Dibangun dari satu objek `muatan` di `kirimPush`, jadi penyimpangan
    // seharusnya mustahil secara bentuk. Test ini yang membuatnya TETAP
    // mustahil kalau seseorang memecahnya jadi dua literal.
    expect(natif[0].muatan).toEqual(web[0].muatan)
    expect(natif[0].muatan).toMatchObject({
      title: 'NCR baru', message: 'Beton keropos', action_url: '/ncr/9',
    })
  })
})

describe('createNotifications — batch', () => {
  it('push natif ikut dikelompokkan per ISI, bukan per penerima', async () => {
    await createNotifications([
      { company_id: CO, user_id: U1, title: 'Kasbon', message: 'sama', type: 'kasbon_pending' },
      { company_id: CO, user_id: U2, title: 'Kasbon', message: 'sama', type: 'kasbon_pending' },
    ])
    await tunggu(1)

    // Satu panggilan berisi dua penerima — bukan dua panggilan. Kalau ini
    // pecah, satu kejadian jadi N permintaan ke Expo untuk muatan identik.
    expect(natif).toHaveLength(1)
    expect(natif[0].userIds).toEqual([U1, U2])
  })

  it('isi BERBEDA tetap terpisah', async () => {
    await createNotifications([
      { company_id: CO, user_id: U1, title: 'A', message: 'satu', type: 'kasbon_pending' },
      { company_id: CO, user_id: U2, title: 'B', message: 'dua', type: 'kasbon_pending' },
    ])
    await tunggu(2)

    expect(natif).toHaveLength(2)
    expect(natif.map((n) => n.muatan.title).sort()).toEqual(['A', 'B'])
  })

  it('GAGAL SIMPAN → tak ada push natif untuk notifikasi yang tak ada', async () => {
    insertHasil.error = { message: 'insert ditolak' }

    await createNotifications([
      { company_id: CO, user_id: U1, title: 'X', message: 'y', type: 'kasbon_pending' },
    ])
    await new Promise((r) => setTimeout(r, 40))

    // Penerima akan mengetuk push, membuka aplikasi, dan tak menemukan apa pun.
    expect(natif).toHaveLength(0)
    expect(web).toHaveLength(0)
  })
})

describe('satu saluran mati tak membungkam yang lain', () => {
  it('Web Push melempar → push natif TETAP terkirim', async () => {
    const { sendWebPushToUsers } = await import('../webpush.js')
    vi.mocked(sendWebPushToUsers).mockRejectedValueOnce(new Error('VAPID rusak'))
    const jejak = vi.spyOn(console, 'error').mockImplementation(() => {})

    await createNotification({
      company_id: CO, user_id: U1,
      title: 'Tetap sampai', message: 'ke HP', type: 'kasbon_pending',
    })
    // ⚠️ Ditunggu sampai JEJAKNYA muncul, bukan sampai `natif` terisi.
    //
    // Versi pertama menunggu `natif.length >= 1` lalu langsung memeriksa spy —
    // dan MERAH, padahal kodenya benar. Sebabnya: `kirimPush` fire-and-forget
    // (`void`), jadi saluran yang SUKSES mendarat lebih dulu; `allSettled`
    // baru memanggil `console.error` satu putaran kemudian. Test-nya yang
    // belum menunggu, bukan kodenya yang bisu — kelas kegagalan yang mengirim
    // orang memperbaiki hal yang tak rusak.
    for (let i = 0; i < 60 && jejak.mock.calls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 2))
    }

    // Inilah alasan `Promise.allSettled`, bukan `Promise.all`.
    expect(natif).toHaveLength(1)
    expect(jejak).toHaveBeenCalled()
    expect(jejak.mock.calls.flat().join(' ')).toContain('web-push')
    jejak.mockRestore()
  })

  it('push natif melempar → Web Push TETAP terkirim', async () => {
    const { kirimPushNatifKeUsers } = await import('../push-natif.js')
    vi.mocked(kirimPushNatifKeUsers).mockRejectedValueOnce(new Error('Expo mati'))
    const jejak = vi.spyOn(console, 'error').mockImplementation(() => {})

    await createNotification({
      company_id: CO, user_id: U1,
      title: 'Tetap sampai', message: 'ke peramban', type: 'kasbon_pending',
    })
    // Alasan menunggu jejak (bukan `web`) sama dengan test di atasnya.
    for (let i = 0; i < 60 && jejak.mock.calls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 2))
    }

    expect(web).toHaveLength(1)
    expect(jejak).toHaveBeenCalled()
    // Saluran yang disebut harus yang BENAR-BENAR gagal — kalau namanya
    // tertukar, diagnosis produksi menunjuk saluran yang sehat.
    expect(jejak.mock.calls.flat().join(' ')).toContain('push-natif')
    jejak.mockRestore()
  })
})
