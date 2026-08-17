import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// PUSH NATIF — yang BISA dibuktikan dari sini, dan yang TIDAK.
//
// ── Yang TIDAK bisa dibuktikan, dan tak diklaim di mana pun
//
// Bahwa sebuah HP sungguhan berbunyi. Itu butuh perangkat fisik, build Expo,
// dan kredensial push — tak satu pun tersedia di CI. Test ini TIDAK
// berpura-pura menutupinya.
//
// ── Yang BISA dibuktikan, dan itulah isi berkas ini
//
//   1. Token mati DIBUANG dari basis saat Expo bilang DeviceNotRegistered.
//   2. Satu perangkat gagal TIDAK menjatuhkan perangkat lain.
//   3. Galat SELAIN token mati tidak menghapus perangkat yang sehat.
//   4. Test TIDAK MENGIRIM apa pun sungguhan (pagar NODE_ENV).
//   5. Batch dipotong 100 — 101 penerima tidak jadi nol notifikasi.
//   6. Token cacat disaring sebelum berangkat.
//
// `globalThis.fetch` disadap, bukan dipagari — pola yang sama dengan
// `ai-penyedia-openai.ts` di daftar DIKECUALIKAN penjaga saluran keluar.
// Alasannya sama pula: jalur HTTP-nya tetap teruji (bentuk permintaan,
// penguraian tiket, penghapusan token) sementara tak ada satu byte pun keluar.
// ============================================================================

const dihapus: string[][] = []

/**
 * Token yang "ada di basis" menurut mock — dipakai jalur BACA
 * (`kirimPushNatifKeUsers`), bukan jalur hapus.
 *
 * ⚠️ Mock ini SENGAJA mendukung `.select().in()`, dan itu bukan kelengkapan
 * kosmetik. Versi pertama hanya mendukung `.delete().in()`, sehingga
 * `kirimPushNatifKeUsers` melempar TypeError di baris `.select(...)`, error
 * itu ditelan `catch`-nya sendiri, dan fungsinya memulangkan 0 tanpa pernah
 * menyentuh `fetch`.
 *
 * Akibatnya test "pagar terhadap test" HIJAU karena alasan yang SALAH: ia
 * mengira membuktikan pagar bekerja, padahal ia hanya membuktikan mock-nya
 * tak lengkap. Terbukti saat mutasi 2 (pagar dicabut) TIDAK membuatnya merah —
 * penjaga CI yang menangkapnya, bukan test ini.
 *
 * Test yang lulus karena sebab yang salah lebih berbahaya daripada test yang
 * tak ada: ia menghalangi orang menulis yang benar.
 */
const tokenDiBasis: Array<{ token: string }> = []

vi.mock('../supabase.js', () => {
  const chain: Record<string, unknown> = {}
  let modeHapus = false

  chain.delete = vi.fn(() => {
    modeHapus = true
    return chain
  })
  chain.select = vi.fn(() => {
    modeHapus = false
    return chain
  })
  chain.in = vi.fn(async (_kolom: string, nilai: string[]) => {
    if (modeHapus) {
      dihapus.push(nilai)
      return { error: null }
    }
    return { data: tokenDiBasis, error: null }
  })

  return { supabase: { from: vi.fn(() => chain) } }
})

const { _internal, tokenExpoSah, kirimPushNatifKeUsers } = await import('../push-natif.js')

const T1 = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'
const T2 = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]'
const T3 = 'ExponentPushToken[cccccccccccccccccccccc]'

const MUATAN = { title: 'Kasbon disetujui', message: 'Rp 500.000', action_url: '/kasbon/1' }

/** Balasan Expo tiruan — satu tiket per token, urutannya mengikat. */
function balas(tiket: Array<Record<string, unknown>>) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: tiket }),
  })) as unknown as typeof fetch
}

const fetchAsli = globalThis.fetch

beforeEach(() => {
  dihapus.length = 0
  // Basis berisi token SAH. Kalau pagarnya dicabut, fungsinya akan menemukan
  // token ini dan benar-benar memanggil `fetch` — itulah yang membuat test
  // pagar bisa merah.
  tokenDiBasis.length = 0
  tokenDiBasis.push({ token: T1 }, { token: T2 })
})

afterEach(() => {
  globalThis.fetch = fetchAsli
  vi.restoreAllMocks()
})

describe('token Expo — penyaringan bentuk', () => {
  it('menerima bentuk yang sah', () => {
    expect(tokenExpoSah(T1)).toBe(true)
    expect(tokenExpoSah('ExpoPushToken[xyz]')).toBe(true)
  })

  it('menolak yang cacat — satu token buruk menggagalkan SELURUH batch di sisi Expo', () => {
    expect(tokenExpoSah('')).toBe(false)
    expect(tokenExpoSah(null)).toBe(false)
    expect(tokenExpoSah(undefined)).toBe(false)
    expect(tokenExpoSah(12345)).toBe(false)
    // Bentuk langganan Web Push — bukti dua bentuk itu memang tak tertukar.
    expect(tokenExpoSah({ endpoint: 'https://fcm.googleapis.com/x' })).toBe(false)
    expect(tokenExpoSah('ExponentPushToken[]')).toBe(false)
    expect(tokenExpoSah('bukan-token')).toBe(false)
  })
})

describe('token mati dibersihkan', () => {
  it('DeviceNotRegistered → barisnya DIHAPUS dari basis', async () => {
    globalThis.fetch = balas([
      { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
    ])

    await _internal.kirimBatch([T1], MUATAN)

    // Kalau ini gagal, token mati menumpuk selamanya dan tiap notifikasi
    // berikutnya membawa satu kegagalan yang tak pernah berkurang.
    expect(dihapus).toEqual([[T1]])
  })

  it('satu perangkat MATI tidak menjatuhkan perangkat lain', async () => {
    globalThis.fetch = balas([
      { status: 'ok', id: 'x1' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: 'x3' },
    ])

    const berhasil = await _internal.kirimBatch([T1, T2, T3], MUATAN)

    // Dua tetap terkirim meski yang tengah mati — inti syarat nomor 5 tugas.
    expect(berhasil).toBe(2)
    // ...dan yang dihapus HANYA yang mati, dicocokkan lewat INDEKS tiket.
    expect(dihapus).toEqual([[T2]])
  })

  it('galat SELAIN token mati tidak menghapus perangkat yang sehat', async () => {
    globalThis.fetch = balas([
      { status: 'error', message: 'terlalu besar', details: { error: 'MessageTooBig' } },
    ])

    await _internal.kirimBatch([T1], MUATAN)

    // Perangkatnya masih sah — yang salah pesannya. Menghapusnya berarti
    // membungkam HP yang sehat karena satu pesan kepanjangan.
    expect(dihapus).toEqual([])
  })

  it('Expo tak terjangkau → dicatat, tidak melempar, tidak menghapus apa pun', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ENOTFOUND exp.host')
    }) as unknown as typeof fetch
    const jejak = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Tak melempar: kasbon yang sudah disetujui tetap disetujui walau push mati.
    await expect(_internal.kirimBatch([T1], MUATAN)).resolves.toBe(0)
    // Tapi TIDAK ditelan diam-diam (`audit-catch-senyap.mjs`).
    expect(jejak).toHaveBeenCalled()
    // Jaringan mati BUKAN bukti token mati.
    expect(dihapus).toEqual([])
  })
})

describe('bentuk permintaan ke Expo', () => {
  it('membawa judul, isi, dan action_url yang bisa dibuka saat diketuk', async () => {
    const f = balas([{ status: 'ok' }])
    globalThis.fetch = f

    await _internal.kirimBatch([T1], MUATAN)

    const [url, opsi] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    const badan = JSON.parse((opsi as { body: string }).body)
    expect(badan).toHaveLength(1)
    expect(badan[0]).toMatchObject({
      to: T1,
      title: 'Kasbon disetujui',
      body: 'Rp 500.000',
      data: { action_url: '/kasbon/1' },
    })
  })
})

describe('pagar terhadap test — TIDAK ADA yang dikirim sungguhan', () => {
  it('kirimPushNatifKeUsers berhenti sebelum menyentuh jaringan saat NODE_ENV=test', async () => {
    const f = vi.fn()
    globalThis.fetch = f as unknown as typeof fetch

    expect(process.env.NODE_ENV).toBe('test')
    const n = await kirimPushNatifKeUsers(['user-1', 'user-2'], MUATAN)

    expect(n).toBe(0)
    // Ini yang menahan kebocoran 2026-08-14 terulang lewat saluran baru:
    // belasan HP dibangunkan tiap `vitest run`.
    expect(f).not.toHaveBeenCalled()
  })

  it('daftar penerima kosong tidak menyentuh apa pun', async () => {
    const f = vi.fn()
    globalThis.fetch = f as unknown as typeof fetch
    expect(await kirimPushNatifKeUsers([], MUATAN)).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('batas batch', () => {
  it('batasnya 100 — 101 penerima tidak boleh jadi NOL notifikasi', () => {
    // Expo membalas 400 untuk SELURUH batch bila lebih dari 100. Angkanya
    // dijaga di sini supaya "optimasi" yang menaikkannya merah lebih dulu.
    expect(_internal.BATAS_BATCH).toBe(100)
  })
})
