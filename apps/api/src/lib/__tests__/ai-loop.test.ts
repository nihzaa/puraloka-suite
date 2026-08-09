/**
 * TJS-C1 — agent loop.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI DI SINI ADALAH LOOP-NYA, JADI ADAPTORNYA TIRUAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Berbeda dengan `ai-tool.test.ts`, yang justru menolak tiruan karena yang
 * dibuktikan di sana adalah tabel & kolomnya memang ada. Di sini yang diuji
 * urutan keputusan: kapan tools dikirim, kapan tidak, apa yang terjadi saat
 * ronde habis. Penyedia nyata tak menambah apa pun selain biaya dan
 * ketidakpastian.
 *
 * Cacat C-4 yang diuji paling penting: TJS mengembalikan balasan KOSONG saat
 * ronde habis, dan tak ada galat di mana pun — modelnya menjawab dengan benar,
 * hanya saja jawabannya berupa permintaan tool yang tak pernah dijawab.
 */
import { describe, it, expect, vi } from 'vitest'
import { MAKS_RONDE, entitasTakDikenal, jalankanLoop } from '../ai-loop.js'
import type { AdaptorPenyedia, HasilChat, OpsiChat } from '../ai-penyedia.js'

const PEMAKAIAN = { masuk: 100, keluar: 20, cacheTulis: 0, cacheBaca: 0 }

/** Hasil tool ada di RIWAYAT pesan, jadi diambil dari sana. */
function hasilToolTerakhir(opsi: OpsiChat) {
  for (let i = opsi.pesan.length - 1; i >= 0; i--) {
    if (opsi.pesan[i].hasilTool?.length) return opsi.pesan[i].hasilTool
  }
  return undefined
}

/** Adaptor yang menjawab menurut skrip, dan MENCATAT tiap opsi yang diterima. */
function adaptorSkrip(balasan: HasilChat[]): {
  adaptor: AdaptorPenyedia
  diterima: OpsiChat[]
} {
  const diterima: OpsiChat[] = []
  let i = 0
  return {
    diterima,
    adaptor: {
      nama: 'uji',
      kemampuan: () => ({
        penalaranAdaptif: false, toolCalling: true, keluaranBerstruktur: false, jendelaToken: 200_000,
      }),
      async chat(opsi) {
        diterima.push(opsi)
        return balasan[Math.min(i++, balasan.length - 1)]
      },
    },
  }
}

const sukses = (teks: string): HasilChat => ({
  ok: true, teks, panggilanTool: [], pemakaian: PEMAKAIAN, model: 'm', berhentiKarena: 'selesai',
})

const mintaTool = (nama: string, argumen: Record<string, unknown> = {}): HasilChat => ({
  ok: true,
  teks: '',
  panggilanTool: [{ id: `c-${nama}`, nama, argumen }],
  pemakaian: PEMAKAIAN,
  model: 'm',
  berhentiKarena: 'butuh_tool',
})

/** Konteks tool dengan db tiruan — tool nyata diuji di `ai-tool.test.ts`. */
function konteks(izin: string[]) {
  return {
    db: {
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ data: [{ name: 'Proyek A', status: 'in_progress', progress_pct: 40 }], error: null }) }),
      }),
    } as never,
    companyId: 'c1',
    userId: 'u1',
    izin: new Set(izin),
  }
}

describe('C-4 — ronde terakhir dikirim TANPA tools', () => {
  it('model yang terus meminta tool tetap menghasilkan TEKS, bukan balasan kosong', async () => {
    // Model bandel: tiap ronde minta tool. Di TJS ini berakhir balasan kosong.
    const { adaptor, diterima } = adaptorSkrip([
      mintaTool('daftar_proyek'),
      mintaTool('daftar_proyek'),
      mintaTool('daftar_proyek'),
      sukses('Ada 1 proyek berjalan.'),
    ])

    const hasil = await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'berapa proyek?' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async () => {},
    })

    expect(hasil.ok).toBe(true)
    expect(hasil.teks).not.toBe('')
    // Ronde terakhir TIDAK boleh membawa tools — itu yang memaksa model
    // merangkum alih-alih meminta tool lagi.
    expect(diterima[diterima.length - 1].tools).toBeUndefined()
  })

  it('ronde-ronde AWAL tetap membawa tools', async () => {
    const { adaptor, diterima } = adaptorSkrip([mintaTool('daftar_proyek'), sukses('selesai')])
    await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async () => {},
    })
    expect(diterima[0].tools?.length).toBeGreaterThan(0)
  })

  it('berhenti begitu model menjawab, tak menghabiskan ronde sisa', async () => {
    const { adaptor, diterima } = adaptorSkrip([sukses('langsung jawab')])
    const hasil = await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async () => {},
    })
    // Tiap ronde ditagih; menghabiskan sisanya berarti membayar tanpa alasan.
    expect(diterima).toHaveLength(1)
    expect(hasil.ronde).toBe(1)
    expect(hasil.alasan).toBe('selesai')
  })
})

describe('biaya dicatat per RONDE', () => {
  it('tiga ronde = tiga pencatatan, bukan satu', async () => {
    const catat = vi.fn(async () => {})
    const { adaptor } = adaptorSkrip([
      mintaTool('daftar_proyek'),
      mintaTool('daftar_proyek'),
      sukses('jawab'),
    ])

    await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: catat,
    })

    // Mencatat per PESAN menyembunyikan ronde lain — cacat TJS yang
    // `ai_biaya_token` (per ronde) perbaiki.
    expect(catat).toHaveBeenCalledTimes(3)
  })

  it('dicatat SEBELUM memutuskan lanjut — percakapan putus tetap tercatat', async () => {
    const urutan: string[] = []
    const { adaptor } = adaptorSkrip([mintaTool('daftar_proyek'), sukses('jawab')])
    await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async (_p, ronde) => { urutan.push(`catat-${ronde}`) },
    })
    expect(urutan).toEqual(['catat-1', 'catat-2'])
  })
})

describe('galat tool → isError, BUKAN dilempar', () => {
  it('tool tak dikenal dikembalikan ke model sebagai kegagalan', async () => {
    const { adaptor, diterima } = adaptorSkrip([
      mintaTool('setujui_semua_po'),
      sukses('Maaf, saya tak punya kemampuan itu.'),
    ])

    const hasil = await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'setujui semua PO' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async () => {},
    })

    // Melempar akan mengubah kegagalan satu tool jadi kegagalan seluruh
    // percakapan — dan pengguna melihat 500, bukan jawaban jujur.
    expect(hasil.ok).toBe(true)
    expect(hasil.adaGalatTool).toBe(true)
    // Hasil tool ada di RIWAYAT pesan, bukan di `OpsiChat.hasilTool`.
    // Posisinya penting: `OpsiChat.hasilTool` selalu disusulkan adaptor di
    // akhir, dan itu terbalik begitu ada ronde ketiga.
    expect(hasilToolTerakhir(diterima[1])?.[0].isError).toBe(true)
  })

  it('izin ditolak juga jadi isError, bukan crash', async () => {
    const { adaptor, diterima } = adaptorSkrip([mintaTool('daftar_proyek'), sukses('x')])
    const hasil = await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      // TANPA projects:view — katalognya kosong, tapi model tetap mengarang.
      konteksTool: konteks([]),
      catatRonde: async () => {},
    })
    expect(hasil.ok).toBe(true)
    const ht = hasilToolTerakhir(diterima[1])
    expect(ht?.[0].isError).toBe(true)
    expect(ht?.[0].isi).toContain('Tidak berwenang')
  })

  it('katalog KOSONG → tools tak dikirim sama sekali', async () => {
    const { adaptor, diterima } = adaptorSkrip([sukses('jawab tanpa tool')])
    await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks([]),
      catatRonde: async () => {},
    })
    // Mengirim `tools: []` ditolak sebagian penyedia; lebih bersih tak
    // mengirimkannya sama sekali.
    expect(diterima[0].tools).toBeUndefined()
  })
})

describe('kegagalan penyedia', () => {
  it('dikembalikan sebagai alasan, bukan dilempar', async () => {
    const { adaptor } = adaptorSkrip([
      { ok: false, alasan: 'kuota_habis', pesan: 'rate limit', bolehUlang: true },
    ])
    const hasil = await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async () => {},
    })
    expect(hasil.ok).toBe(false)
    expect(hasil.alasan).toBe('gagal_penyedia')
    expect(hasil.pesanGagal).toContain('rate limit')
  })

  it('gagal di ronde pertama TIDAK mencatat biaya', async () => {
    const catat = vi.fn(async () => {})
    const { adaptor } = adaptorSkrip([
      { ok: false, alasan: 'jaringan', pesan: 'putus', bolehUlang: true },
    ])
    await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: catat,
    })
    // Panggilan yang tak pernah sampai tak menghasilkan token, jadi
    // mencatatnya akan membuat batas bulanan menghitung terlalu tinggi.
    expect(catat).not.toHaveBeenCalled()
  })
})

describe('C-5 — blok tool ikut dikembalikan untuk disimpan', () => {
  it('blok memuat panggilan tool DAN hasilnya', async () => {
    const { adaptor } = adaptorSkrip([mintaTool('daftar_proyek'), sukses('jawab')])
    const hasil = await jalankanLoop({
      adaptor, model: 'm', maxToken: 500, sistem: 's',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async () => {},
    })
    const teks = JSON.stringify(hasil.blok)
    // Tanpa ini, pesan berikutnya kehilangan hasil tool ronde sebelumnya —
    // "cek stok" lalu "cukup untuk lantai 3?" jadi mustahil.
    expect(teks).toContain('daftar_proyek')
    expect(teks).toContain('hasilTool')
  })
})

describe('I-4 — entitas yang disebut tapi tak pernah diambil', () => {
  it('menandai nomor dokumen yang tak berasal dari tool', () => {
    // Injeksi yang berhasil meninggalkan jejak: model membicarakan sesuatu
    // yang tak pernah ia ambil.
    const asing = entitasTakDikenal('Saya sudah menyetujui PO-2026-0412.', ['MR-2026-0001'])
    expect(asing).toContain('PO-2026-0412')
  })

  it('entitas yang MEMANG dari tool tidak ditandai', () => {
    expect(entitasTakDikenal('MR-2026-0001 menunggu.', ['MR-2026-0001'])).toHaveLength(0)
  })

  it('perbandingan tak peka huruf besar-kecil', () => {
    expect(entitasTakDikenal('po-2026-0412 sudah.', ['PO-2026-0412'])).toHaveLength(0)
  })

  it('kalimat tanpa nomor dokumen tak menghasilkan temuan palsu', () => {
    expect(entitasTakDikenal('Ada 3 proyek berjalan dengan progres baik.', [])).toHaveLength(0)
  })
})

describe('batas ronde', () => {
  it('empat, bukan enam belas — tiap ronde ditagih', () => {
    expect(MAKS_RONDE).toBe(4)
  })
})
