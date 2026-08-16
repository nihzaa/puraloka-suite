/**
 * 8.2 + 8.7 — penalaran berlapis, diuji TANPA saldo API.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG BISA DAN TIDAK BISA DIBUKTIKAN TANPA MODEL SUNGGUHAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * BISA: loop benar-benar menjalankan beberapa tool berurutan dan menyerahkan
 * hasil semuanya ke ronde sintesis; batas ronde ditegakkan; jawaban yang
 * terpotong MENYATAKAN dirinya terpotong; instruksinya benar-benar sampai ke
 * prompt sistem.
 *
 * TIDAK BISA: apakah model MEMILIH tool yang tepat. Itu hanya ketahuan dari
 * percakapan sungguhan, dan berkas ini tidak berpura-pura membuktikannya.
 * Adaptor di bawah adalah skrip — ia memanggil tool yang SAYA tentukan, bukan
 * yang model pilih.
 *
 * Perbedaan itu ditulis di sini supaya hijau-nya berkas ini tak dibaca sebagai
 * "asisten sudah pandai menalar". Yang hijau adalah jalurnya, bukan
 * penilaiannya.
 */

import { describe, it, expect } from 'vitest'
import { jalankanLoop } from '../ai-loop.js'
import type { AdaptorPenyedia, HasilChat, OpsiChat } from '../ai-penyedia.js'
import {
  PENALARAN_BERLAPIS,
  CATATAN_RONDE_HABIS,
  tempelCatatanRonde,
} from '../ai-penalaran-berlapis.js'
import { susunPromptSistem, PAGAR_FAKTA } from '../ai-jalankan.js'

const PEMAKAIAN = { masuk: 100, keluar: 20, cacheTulis: 0, cacheBaca: 0 }

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
        penalaranAdaptif: false,
        toolCalling: true,
        keluaranBerstruktur: false,
        jendelaToken: 200_000,
      }),
      async chat(opsi) {
        diterima.push(opsi)
        return balasan[Math.min(i++, balasan.length - 1)]
      },
    },
  }
}

const sukses = (teks: string): HasilChat => ({
  ok: true, teks, panggilanTool: [], pemakaian: PEMAKAIAN, model: 'm',
  berhentiKarena: 'selesai',
})

const mintaTool = (nama: string): HasilChat => ({
  ok: true, teks: '',
  panggilanTool: [{ id: `c-${nama}`, nama, argumen: {} }],
  pemakaian: PEMAKAIAN, model: 'm', berhentiKarena: 'butuh_tool',
})

/** Konteks tool tiruan — tool nyata tak dipanggil, yang diuji alur loop. */
const konteks = (izin: string[]) =>
  ({
    db: null as never,
    companyId: 'co-uji',
    userId: 'u-uji',
    izin: new Set(izin),
  }) as never

describe('instruksi penalaran berlapis benar-benar sampai ke prompt', () => {
  it('ikut di prompt sistem, SESUDAH pagar fakta', () => {
    const p = susunPromptSistem(null, '', ['menyarankan'], '', '')
    expect(p).toContain('PERTANYAAN YANG BUTUH BEBERAPA LANGKAH')
    /*
     * Urutannya mengikat. Blok ini memuat satu-satunya izin mengarang angka di
     * seluruh sistem (skenario andaian 8.2); kalau ia naik ke atas pagar,
     * izin sempit itu terbaca sederajat dengan larangan mutlak.
     */
    expect(p.indexOf(PAGAR_FAKTA)).toBe(0)
    expect(p.indexOf('PERTANYAAN YANG BUTUH BEBERAPA LANGKAH')).toBeGreaterThan(
      PAGAR_FAKTA.length - 1,
    )
  })

  it('menyuruh memanggil BEBERAPA tool sebelum menyimpulkan', () => {
    expect(PENALARAN_BERLAPIS).toContain('PANGGIL BEBERAPA TOOL BERURUTAN')
    // Tanpa kalimat ini, model cenderung menjawab dari tool pertama lalu
    // berhenti — kesimpulan yakin dari separuh data.
    expect(PENALARAN_BERLAPIS).toContain('Menjawab dari tool pertama saja')
  })

  it('mewajibkan angka andaian DIBERI LABEL dan tak boleh dikarang sendiri', () => {
    // Pengandaian adalah satu-satunya lubang di PAGAR_FAKTA. Kalau syaratnya
    // hilang, jawaban campuran angka nyata + angka karangan jadi mustahil
    // diperiksa pembacanya.
    expect(PENALARAN_BERLAPIS).toContain('andaian')
    expect(PENALARAN_BERLAPIS).toContain('Jangan pernah mengarang angka andaian')
    expect(PENALARAN_BERLAPIS).toContain('yang DISEBUTKAN')
  })

  it('menyuruh mengaku kalau langkahnya habis', () => {
    expect(PENALARAN_BERLAPIS).toContain('KALAU LANGKAH ANDA HABIS')
    expect(PENALARAN_BERLAPIS).toContain('KATAKAN TERUS TERANG')
  })

  it('ikut di SEMUA watak, termasuk himpunan sifat kosong', () => {
    // Cara bekerja bukan watak. Asisten paling kaku pun tetap harus memeriksa
    // beberapa sisi sebelum menyimpulkan.
    for (const sifat of [[], ['menyarankan'], ['mengobrol'], ['menyarankan', 'mengobrol']]) {
      expect(
        susunPromptSistem(null, '', sifat as never, '', ''),
        `sifat ${JSON.stringify(sifat)} kehilangan panduan penalaran`,
      ).toContain('PERTANYAAN YANG BUTUH BEBERAPA LANGKAH')
    }
  })
})

describe('loop BENAR-BENAR merangkai beberapa tool', () => {
  it('tiga tool berurutan, lalu sintesis — semua hasilnya sampai ke ronde akhir', async () => {
    const { adaptor, diterima } = adaptorSkrip([
      /*
       * Nama tool SENGAJA fiktif. Yang diuji berkas ini alur loop — berapa
       * ronde, apa yang dikirim tiap ronde, apakah hasil lama ikut sampai ke
       * ronde sintesis. Memakai nama tool nyata akan membuat loop benar-benar
       * mengeksekusinya dan menyentuh basis, sehingga test alur berubah jadi
       * test integrasi yang gagal karena sebab yang bukan urusannya.
       *
       * Loop mengembalikan tool tak dikenal KE MODEL sebagai kegagalan tool
       * (ai-loop.ts), jadi jalur ronde-nya tetap berjalan penuh.
       */
      mintaTool('sisi_a'),
      mintaTool('sisi_b'),
      mintaTool('sisi_c'),
      sukses('Prioritaskan proyek A karena kasnya paling ketat.'),
    ])

    const hasil = await jalankanLoop({
      adaptor,
      model: 'm',
      maxToken: 1000,
      sistem: 'uji',
      pesan: [{ peran: 'user', isi: 'Proyek mana yang harus diprioritaskan?' }],
      konteksTool: konteks(['projects:view', 'finance:view']),
      catatRonde: async () => {},
      maksRonde: 6,
    })

    expect(hasil.ok).toBe(true)
    if (!hasil.ok) return

    // Empat ronde: tiga bertool + satu sintesis.
    expect(hasil.ronde).toBe(4)
    expect(hasil.alasan).toBe('selesai')

    /*
     * Inti test ini: ronde sintesis harus MELIHAT hasil ketiga tool, bukan
     * cuma yang terakhir. Loop yang membuang hasil lama membuat model
     * menyimpulkan dari satu pembacaan sambil terlihat memakai tiga.
     */
    const rondeAkhir = diterima[diterima.length - 1]
    const semuaHasil = rondeAkhir.pesan.flatMap((p) => p.hasilTool ?? [])
    expect(semuaHasil.length).toBeGreaterThanOrEqual(3)
  })

  it('ronde TERAKHIR dikirim tanpa tool — model terpaksa merangkum', async () => {
    const { adaptor, diterima } = adaptorSkrip([
      mintaTool('sisi_a'),
      mintaTool('sisi_b'),
      sukses('Kesimpulan.'),
    ])

    await jalankanLoop({
      adaptor, model: 'm', maxToken: 1000, sistem: 'uji',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view', 'finance:view']),
      catatRonde: async () => {},
      maksRonde: 3,
    })

    expect(diterima[diterima.length - 1].tools).toBeUndefined()
    expect(diterima[0].tools).toBeTruthy()
  })

  it('ronde habis ditandai `ronde_habis`, bukan dilaporkan sukses', async () => {
    // Model terus meminta tool sampai batas. Ini kegagalan yang paling mudah
    // menyamar jadi jawaban biasa.
    const { adaptor } = adaptorSkrip([mintaTool('sisi_a')])

    const hasil = await jalankanLoop({
      adaptor, model: 'm', maxToken: 1000, sistem: 'uji',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async () => {},
      maksRonde: 3,
    })

    expect(hasil.ok).toBe(true)
    if (!hasil.ok) return
    expect(hasil.alasan).toBe('ronde_habis')
  })

  it('maks_ronde 6 memberi LIMA ronde bertool', async () => {
    /*
     * Angka yang menentukan seberapa dalam asisten boleh berpikir.
     *
     * Diukur 2026-08-16: basis menyimpan 4, dan karena loop menyisihkan ronde
     * terakhir tanpa tool, itu berarti hanya TIGA pembacaan. Pertanyaan
     * strategis yang jujur butuh 4-5. Test ini mengunci hubungan
     * "maks_ronde N → N-1 ronde bertool" supaya perubahannya tak senyap.
     */
    const { adaptor, diterima } = adaptorSkrip([
      mintaTool('a'), mintaTool('b'), mintaTool('c'), mintaTool('d'),
      mintaTool('e'), sukses('Selesai.'),
    ])

    await jalankanLoop({
      adaptor, model: 'm', maxToken: 1000, sistem: 'uji',
      pesan: [{ peran: 'user', isi: 'x' }],
      konteksTool: konteks(['projects:view']),
      catatRonde: async () => {},
      maksRonde: 6,
    })

    const bertool = diterima.filter((d) => d.tools !== undefined).length
    expect(bertool).toBe(5)
  })
})

describe('jawaban terpotong MENYATAKAN dirinya terpotong', () => {
  it('menempel catatan saat ronde habis', () => {
    const t = tempelCatatanRonde('Kesimpulan sementara.', 'ronde_habis')
    expect(t).toContain('batas langkah pemeriksaan tercapai')
  })

  it('TIDAK menempel saat selesai wajar', () => {
    const t = tempelCatatanRonde('Kesimpulan.', 'selesai')
    expect(t).toBe('Kesimpulan.')
  })

  it('idempoten — dua kali panggil tak menghasilkan dua catatan', () => {
    // Jawaban yang memuat peringatan sama dua kali membuat pembacanya
    // menyangka ada dua masalah berbeda.
    const sekali = tempelCatatanRonde('x', 'ronde_habis')
    const dua = tempelCatatanRonde(sekali, 'ronde_habis')
    expect(dua).toBe(sekali)
    expect(dua.split('batas langkah pemeriksaan tercapai')).toHaveLength(2)
  })

  it('catatan menyebut apa yang harus dilakukan pembaca', () => {
    // Peringatan tanpa jalan keluar cuma membuat cemas.
    expect(CATATAN_RONDE_HABIS).toContain('Persempit')
  })
})
