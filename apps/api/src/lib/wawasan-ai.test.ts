import { describe, it, expect } from 'vitest'
import {
  susunPrompt,
  periksaJawaban,
  BATAS,
  SKEMA_JAWABAN,
  PROMPT_SISTEM,
  type FaktaPortofolio,
} from './wawasan-ai.js'

const FAKTA: FaktaPortofolio = {
  skor: 42,
  invoiceLewatTempo: 3,
  milestoneTelat: 1,
  proyekMandek: 2,
  proyekLewatTenggat: 4,
  proyekAktif: 9,
}

describe('susunPrompt', () => {
  it('memuat seluruh fakta — tak ada yang diam-diam hilang', () => {
    const p = susunPrompt(FAKTA)
    expect(p).toContain('42 dari 100')
    expect(p).toContain('Invoice lewat jatuh tempo: 3')
    expect(p).toContain('Milestone telat: 1')
    expect(p).toContain('progres 0%): 2')
    expect(p).toContain('Proyek lewat tenggat: 4')
    expect(p).toContain('Proyek berjalan: 9')
  })

  /*
   * Nol harus tertulis "0", BUKAN hilang dari prompt. Fakta yang dihapus saat
   * bernilai nol membuat model menebak: "invoice lewat tempo tidak disebut"
   * terbaca sebagai "tidak diketahui", bukan "tidak ada" — dan tebakan itulah
   * yang melahirkan kalimat karangan.
   */
  it('nol tetap ditulis, bukan dihilangkan dari prompt', () => {
    const p = susunPrompt({ ...FAKTA, invoiceLewatTempo: 0, proyekMandek: 0 })
    expect(p).toContain('Invoice lewat jatuh tempo: 0')
    expect(p).toContain('progres 0%): 0')
  })
})

describe('SKEMA_JAWABAN', () => {
  /*
   * Aturan Emas §9. Skema yang punya field angka adalah undangan bagi model
   * untuk mengarang skor — persis "78/100" di referensi. Dijaga di test supaya
   * penambahan field angka di kemudian hari merah lebih dulu, bukan diam-diam
   * tampil di kartu.
   */
  it('hanya dua field teks — tak ada tempat bagi model menaruh angka', () => {
    expect(Object.keys(SKEMA_JAWABAN.properties).sort()).toEqual(['penilaian', 'rekomendasi'])
    for (const p of Object.values(SKEMA_JAWABAN.properties)) {
      expect(p.type).toBe('string')
    }
    expect(SKEMA_JAWABAN.additionalProperties).toBe(false)
  })

  it('prompt sistem melarang menyebut skor', () => {
    expect(PROMPT_SISTEM).toMatch(/jangan menyebut skor/i)
  })
})

describe('periksaJawaban', () => {
  it('menerima jawaban yang wajar', () => {
    const h = periksaJawaban({
      penilaian: 'Empat proyek lewat tenggat menekan kondisi portofolio.',
      rekomendasi: 'Jadwalkan rapat dengan mandor keempat proyek yang lewat tenggat minggu ini.',
    })
    expect(h).not.toBeNull()
    expect(h!.penilaian).toContain('lewat tenggat')
  })

  it('merapikan baris baru dan spasi ganda', () => {
    const h = periksaJawaban({ penilaian: '  Kondisi\n  menurun.  ', rekomendasi: 'Tagih\tinvoice.' })
    expect(h!.penilaian).toBe('Kondisi menurun.')
    expect(h!.rekomendasi).toBe('Tagih invoice.')
  })

  /*
   * Ditolak, BUKAN dipotong. Kalimat terpotong di tengah ("Segera tagih
   * invoice PT Sur…") terbaca sebagai aplikasi rusak — lebih buruk daripada
   * kalimat deterministik yang utuh.
   */
  it('menolak jawaban melebihi batas panjang kartu', () => {
    expect(periksaJawaban({ penilaian: 'a'.repeat(BATAS.penilaian + 1), rekomendasi: 'ok' })).toBeNull()
    expect(periksaJawaban({ penilaian: 'ok', rekomendasi: 'a'.repeat(BATAS.rekomendasi + 1) })).toBeNull()
  })

  it('tepat di batas masih diterima', () => {
    const h = periksaJawaban({
      penilaian: 'a'.repeat(BATAS.penilaian),
      rekomendasi: 'b'.repeat(BATAS.rekomendasi),
    })
    expect(h).not.toBeNull()
  })

  it('menolak field kosong atau hanya spasi', () => {
    expect(periksaJawaban({ penilaian: '', rekomendasi: 'ok' })).toBeNull()
    expect(periksaJawaban({ penilaian: '   ', rekomendasi: 'ok' })).toBeNull()
    expect(periksaJawaban({ penilaian: 'ok', rekomendasi: '' })).toBeNull()
  })

  it('menolak bentuk yang sama sekali bukan jawaban', () => {
    for (const buruk of [null, undefined, 'teks polos', 42, [], {}]) {
      expect(periksaJawaban(buruk)).toBeNull()
    }
  })

  /*
   * Field asing DIABAIKAN, bukan bikin gagal. `additionalProperties: false`
   * sudah menjaganya di sisi API; kalau toh lolos, mengabaikannya lebih baik
   * daripada membuang jawaban yang bagian pentingnya sah.
   */
  it('mengabaikan field asing tanpa menggugurkan jawaban', () => {
    const h = periksaJawaban({ penilaian: 'Baik.', rekomendasi: 'Lanjutkan.', skor: 78 })
    expect(h).toEqual({ penilaian: 'Baik.', rekomendasi: 'Lanjutkan.' })
    expect(h).not.toHaveProperty('skor')
  })
})
