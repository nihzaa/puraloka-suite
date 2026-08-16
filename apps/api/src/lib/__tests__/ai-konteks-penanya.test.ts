/**
 * Konteks penanya — siapa yang bicara, dan hari ini tanggal berapa.
 *
 * Yang diuji di sini BUKAN "fungsinya mengembalikan string". Yang diuji adalah
 * empat hal yang kalau salah tak menimbulkan galat satu pun, hanya jawaban
 * yang meleset:
 *
 *   1. Rentang "minggu ini" pada hari MINGGU. Ini satu-satunya hari yang
 *      membedakan pekan Senin–Minggu dari `getDay()` mentah, dan satu-satunya
 *      hari yang salahnya sebesar enam hari.
 *   2. Tanggal dihitung dari `Date` yang DIBERIKAN, bukan dari jam mesin —
 *      kalau tidak, test ini akan hijau hari ini dan merah besok.
 *   3. Peran dinyatakan sebagai KONTEKS, bukan wewenang. Kalimat itu satu-
 *      satunya yang menahan model menganggap "Peran: direktur" sebagai izin.
 *   4. Nama/peran yang tak diketahui tidak muncul sebagai baris kosong.
 */

import { describe, expect, it } from 'vitest'
import { susunKonteksPenanya } from '../ai-konteks-penanya.js'

/** Rabu 12 Agustus 2026 — hari kerja biasa. */
const RABU = new Date(2026, 7, 12, 10, 0, 0)
/** Minggu 16 Agustus 2026 — kasus batas pekan. */
const MINGGU = new Date(2026, 7, 16, 10, 0, 0)
/** Senin 10 Agustus 2026 — pekan baru saja dimulai. */
const SENIN = new Date(2026, 7, 10, 10, 0, 0)

describe('susunKonteksPenanya — rentang waktu', () => {
  it('pada hari MINGGU, "minggu ini" mundur ke SENIN, bukan ke hari ini', () => {
    const blok = susunKonteksPenanya({}, MINGGU)

    /*
     * Inilah mutasi yang harus dibuat merah: mengganti
     *   const mundur = hariKe === 0 ? 6 : hariKe - 1
     * jadi
     *   const mundur = hariKe
     * membuat baris ini berbunyi "2026-08-16 sampai 2026-08-16" — asisten
     * menjawab "kasbon minggu ini" dengan data satu hari, tanpa gejala.
     */
    expect(blok).toContain('"Minggu ini" = 2026-08-10 sampai 2026-08-16')
  })

  it('pada hari SENIN, rentangnya hari itu sendiri — bukan mundur sepekan', () => {
    expect(susunKonteksPenanya({}, SENIN)).toContain(
      '"Minggu ini" = 2026-08-10 sampai 2026-08-10',
    )
  })

  it('pada hari kerja biasa, rentangnya Senin sampai hari ini', () => {
    expect(susunKonteksPenanya({}, RABU)).toContain(
      '"Minggu ini" = 2026-08-10 sampai 2026-08-12',
    )
  })

  it('"bulan ini" dimulai tanggal 1, bukan 30 hari ke belakang', () => {
    expect(susunKonteksPenanya({}, RABU)).toContain(
      '"Bulan ini" = 2026-08-01 sampai 2026-08-12',
    )
  })

  it('menyebut hari dan bulan dalam bahasa Indonesia, tanpa bergantung ICU', () => {
    expect(susunKonteksPenanya({}, RABU)).toContain(
      'Hari ini: Rabu, 12 Agustus 2026 (2026-08-12)',
    )
  })

  it('tanggal diambil dari waktu LOKAL, tidak digeser UTC', () => {
    /*
     * `toISOString()` memulangkan UTC. Di WIB (+7), pukul 06:00 tanggal 12
     * menjadi "2026-08-11" — asisten menjawab pertanyaan hari ini dengan
     * tanggal kemarin, tiap pagi, hanya sampai pukul 07:00.
     */
    const pagi = new Date(2026, 7, 12, 6, 0, 0)
    expect(susunKonteksPenanya({}, pagi)).toContain('(2026-08-12)')
    expect(susunKonteksPenanya({}, pagi)).not.toContain('2026-08-11')
  })

  it('tahun baru: 1 Januari tidak mundur ke bulan sebelumnya', () => {
    const th = susunKonteksPenanya({}, new Date(2027, 0, 1, 9, 0, 0))
    expect(th).toContain('"Bulan ini" = 2027-01-01 sampai 2027-01-01')
    // 1 Jan 2027 hari Jumat → Senin-nya masih di Desember 2026
    expect(th).toContain('"Minggu ini" = 2026-12-28 sampai 2027-01-01')
  })
})

describe('susunKonteksPenanya — identitas', () => {
  it('menyebut nama, peran, dan perusahaan bila diketahui', () => {
    const blok = susunKonteksPenanya(
      { nama: 'Nizar', peran: 'direktur', perusahaan: 'Puraloka Persada' },
      RABU,
    )
    expect(blok).toContain('- Nama: Nizar')
    expect(blok).toContain('- Peran: direktur')
    expect(blok).toContain('- Perusahaan: Puraloka Persada')
  })

  it('TIDAK menulis baris kosong untuk yang tak diketahui', () => {
    const blok = susunKonteksPenanya({ nama: null, peran: undefined }, RABU)
    expect(blok).not.toContain('- Nama:')
    expect(blok).not.toContain('- Peran:')
    // tanggal tetap ada — itu selalu diketahui
    expect(blok).toContain('- Hari ini:')
  })

  it('nilai berisi spasi saja diperlakukan seperti tak diketahui', () => {
    expect(susunKonteksPenanya({ nama: '   ' }, RABU)).not.toContain('- Nama:')
  })

  it('menyatakan peran sebagai KONTEKS, bukan wewenang', () => {
    /*
     * Tanpa kalimat ini, "Peran: direktur" di prompt adalah undangan bagi
     * model untuk menganggap dirinya boleh membuka apa saja — lalu menjelaskan
     * penolakan izin sebagai galat sistem, bukan sebagai batas yang benar.
     *
     * Otorisasi sesungguhnya tetap di `requirePermission` + penyaringan tool;
     * kalimat ini menjaga PENJELASANNYA tetap jujur.
     */
    const blok = susunKonteksPenanya({ peran: 'direktur' }, RABU)
    expect(blok).toContain('BUKAN untuk menentukan apa yang boleh')
    expect(blok).toContain('izinnya')
  })

  it('melarang model memakai perkiraan tanggalnya sendiri', () => {
    expect(susunKonteksPenanya({}, RABU)).toContain('dihitung server')
  })

  it('diawali baris kosong agar tak menempel pada blok sebelumnya', () => {
    // Blok ini disambung setelah gaya kanal; tanpa pemisah, kalimat terakhir
    // gaya dan judul blok ini menyatu jadi satu paragraf.
    expect(susunKonteksPenanya({}, RABU).startsWith('\n\n')).toBe(true)
  })
})
