/**
 * KEPATUHAN MENGGANTUNG — tiga bentuk yang sengaja TIDAK disatukan.
 *
 * Data acuan dari basis nyata 2026-08-19:
 *
 *   induksi_k3             25 catatan, 2 sudah kedaluwarsa (terlama sejak 15 Juni)
 *   pemantauan_lingkungan   5 pengukuran, 1 melampaui baku mutu
 *   temuan_audit            5 belum ditutup
 *   itp_titik               4 belum diperiksa
 *   sertifikat_ipc          3 draf, terlama 13 hari
 *   cuti_ambil              2 diajukan belum diputus, 8 hari
 *   nota_kredit             1 diajukan, 12 hari
 */
import { describe, it, expect } from 'vitest'
import { nilaiMasaBerlaku, nilaiPengukuran, nilaiMenggantung } from '../kepatuhan-menggantung.js'

describe('nilaiMasaBerlaku', () => {
  it('induksi yang sudah HABIS dilaporkan', () => {
    // Diukur: 2 pekerja induksinya habis, terlama sejak 15 Juni.
    expect(nilaiMasaBerlaku({ sisaHari: -60 }, 14)).toEqual({ perlu: true, sebab: 'habis' })
  })

  it('yang SEGERA habis dilaporkan sebelum berakhir', () => {
    // Pekerja yang induksinya habis pekan depan masih bisa diinduksi ulang
    // sebelum ia ditolak di gerbang.
    expect(nilaiMasaBerlaku({ sisaHari: 10 }, 14).sebab).toBe('segera_habis')
  })

  it('hari-H belum habis', () => {
    expect(nilaiMasaBerlaku({ sisaHari: 0 }, 14).sebab).toBe('segera_habis')
    expect(nilaiMasaBerlaku({ sisaHari: -1 }, 14).sebab).toBe('habis')
  })

  it('yang masih lama TIDAK ditegur', () => {
    expect(nilaiMasaBerlaku({ sisaHari: 200 }, 14).perlu).toBe(false)
  })

  it('TANPA masa berlaku TIDAK ditegur — berbeda dari punch list', () => {
    /*
      Keputusan yang sengaja berlawanan dengan `tenggat-terlewat.ts`, yang
      MELAPORKAN pekerjaan tanpa tenggat.

      Bedanya: di sana setiap punch item memang harus punya target, jadi
      kekosongan adalah kelalaian. Di sini kekosongan adalah keadaan yang SAH —
      induksi umum berlaku sekali seumur proyek, hanya induksi khusus pekerjaan
      berisiko yang berbatas waktu.

      Menuduhnya lupa akan menegur setiap pekerja tetap, tiap kali, selamanya.
    */
    for (const s of [null, Number.NaN]) {
      const h = nilaiMasaBerlaku({ sisaHari: s as number | null }, 14)
      expect(h.perlu).toBe(false)
      expect(h.sebab).toBe('tanpa_masa_berlaku')
    }
  })
})

describe('nilaiPengukuran', () => {
  it('melampaui baku mutu dilaporkan', () => {
    // Kebisingan 72 dB terhadap baku mutu 70 dB.
    const h = nilaiPengukuran({ nilai: 72, bakuMutu: 70, makinRendahMakinBaik: true }, 10)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('melampaui')
    expect(h.rasio).toBeCloseTo(1.029, 2)
  })

  it('MENDEKATI baku mutu juga dilaporkan — sebelum terlanjur melanggar', () => {
    // 65 dari 70 = 93%, di dalam margin 10%.
    expect(nilaiPengukuran({ nilai: 65, bakuMutu: 70, makinRendahMakinBaik: true }, 10).sebab)
      .toBe('mendekati')
    // 60 dari 70 = 86%, di luar margin.
    expect(nilaiPengukuran({ nilai: 60, bakuMutu: 70, makinRendahMakinBaik: true }, 10).sebab)
      .toBe('memenuhi')
  })

  it('ARAH TERBALIK — parameter yang melanggar justru saat RENDAH', () => {
    /*
      Untuk kebisingan dan debu, melampaui berarti melanggar. Untuk pH minimum
      atau oksigen terlarut, yang melanggar justru yang di BAWAH baku mutu.

      Tanpa pembedaan ini, parameter arah-terbalik dilaporkan aman persis
      ketika ia paling berbahaya.
    */
    const rendah = nilaiPengukuran({ nilai: 3, bakuMutu: 5, makinRendahMakinBaik: false }, 10)
    expect(rendah.perlu).toBe(true)
    expect(rendah.sebab).toBe('melampaui')

    // Nilai yang sama pada parameter arah biasa justru aman.
    expect(nilaiPengukuran({ nilai: 3, bakuMutu: 5, makinRendahMakinBaik: true }, 10).sebab)
      .toBe('memenuhi')
  })

  it('BAKU MUTU NOL tak dibagi — Infinity akan melapor "melampaui" selamanya', () => {
    /*
      `nilai / 0` menghasilkan Infinity, yang lolos `Number.isFinite` pada
      pemeriksaan naif dan kemudian dibandingkan — hasilnya "melampaui" untuk
      SETIAP parameter yang baku mutunya belum diisi.

      Peringatan yang benar karena alasan yang salah tetap merusak kepercayaan
      begitu ada yang memeriksanya.
    */
    const h = nilaiPengukuran({ nilai: 50, bakuMutu: 0, makinRendahMakinBaik: true }, 10)
    expect(h.perlu).toBe(false)
    expect(h.sebab).toBe('tak_terukur')
    expect(h.rasio).toBe(null)
  })

  it('nilai atau baku mutu yang hilang tak dinilai', () => {
    for (const p of [
      { nilai: null, bakuMutu: 70 },
      { nilai: 70, bakuMutu: null },
      { nilai: null, bakuMutu: null },
    ]) {
      expect(nilaiPengukuran({ ...p, makinRendahMakinBaik: true }, 10).sebab).toBe('tak_terukur')
    }
  })
})

describe('nilaiMenggantung', () => {
  it('nota kredit 12 hari apa adanya', () => {
    const h = nilaiMenggantung({ umurHari: 12, selesai: false, berat: false }, 7)
    expect(h.perlu).toBe(true)
    expect(h.sebab).toBe('menggantung')
  })

  it('yang SELESAI tak ditegur, berapa pun umurnya', () => {
    expect(nilaiMenggantung({ umurHari: 999, selesai: true, berat: true }, 7).perlu).toBe(false)
  })

  it('PERKARA BERAT ditegur lebih cepat — ambang DIBAGI, bukan dikali', () => {
    /*
      Sengaja BERLAWANAN ARAH dengan `tenggat-terlewat.ts`.

      Di sana ambang berarti "berapa hari SEBELUM tenggat", jadi memperbesarnya
      memperingatkan lebih dini. Di sini ambang berarti "berapa hari SESUDAH
      mulai menunggu", jadi yang memperingatkan lebih dini adalah yang lebih
      KECIL.

      Salah arah di sini tak menghasilkan galat apa pun — cuma perkara berat
      yang ditegur paling lambat. Pada umur 5 hari dengan ambang 10: yang berat
      sudah ditegur (10/2 = 5), yang biasa belum.
    */
    expect(nilaiMenggantung({ umurHari: 5, selesai: false, berat: true }, 10, 2).perlu).toBe(true)
    expect(nilaiMenggantung({ umurHari: 5, selesai: false, berat: false }, 10, 2).perlu).toBe(false)
  })

  it('ambang berat tak pernah turun di bawah 1 hari', () => {
    // Ambang 1 dibagi 2 = 0, dan ambang nol menegur segala sesuatu pada hari
    // ia dicatat — termasuk yang baru dibuat semenit lalu.
    expect(nilaiMenggantung({ umurHari: 0, selesai: false, berat: true }, 1, 2).perlu).toBe(false)
    expect(nilaiMenggantung({ umurHari: 1, selesai: false, berat: true }, 1, 2).perlu).toBe(true)
  })

  it('TAK TERTANGGAL dilaporkan — umur satu-satunya alat ukur di sini', () => {
    for (const u of [null, Number.NaN]) {
      const h = nilaiMenggantung({ umurHari: u as number | null, selesai: false, berat: false }, 7)
      expect(h.perlu).toBe(true)
      expect(h.sebab).toBe('tak_tertanggal')
    }
  })

  it('UMUR NEGATIF (bertanggal masa depan) dianggap bergerak, bukan ditegur', () => {
    /*
      Salah ketik tahun. Menegur sesuatu yang "berumur minus 300 hari"
      menghasilkan pesan yang tak masuk akal bagi pembacanya — yang salah
      datanya, bukan pekerjaannya.

      ⚠ AMBANG NEGATIF dan `berat: false` di sini bukan kesalahan tulis —
      keduanya diperlukan supaya mutasi benar-benar tertangkap.

      Versi pertama test ini memakai ambang 7 dan `berat: true`, dan mutasi
      yang MEMBUANG penjagaan `umur < 0` tetap LOLOS. Dua sebab bertumpuk:

        1. dengan ambang positif, `-300 >= 7` sudah false dengan sendirinya
        2. `berat: true` menjepit ambang lewat `Math.max(1, …)`, jadi ambang
           negatif sekalipun tetap jadi 1 — dan `-300 >= 1` juga false

      Yang benar-benar menguji penjagaannya: ambang negatif TANPA jepitan,
      yakni `berat: false`. Keadaan ini bisa terjadi sungguhan — `ambangHari`
      datang dari setelan tenant, dan tak ada apa pun di jalur ini yang
      mencegah angka negatif di sana.
    */
    for (const ambang of [7, -1, -400]) {
      for (const berat of [true, false]) {
        const h = nilaiMenggantung({ umurHari: -300, selesai: false, berat }, ambang)
        expect(h.perlu, `ambang ${ambang} berat=${berat} seharusnya tetap menahan umur negatif`)
          .toBe(false)
        expect(h.sebab).toBe('bergerak')
      }
    }
  })

  it('yang masih muda TIDAK ditegur', () => {
    expect(nilaiMenggantung({ umurHari: 2, selesai: false, berat: false }, 7).sebab).toBe('bergerak')
  })
})
