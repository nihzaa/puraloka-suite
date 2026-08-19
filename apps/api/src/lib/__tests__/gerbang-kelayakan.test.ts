import { describe, it, expect } from 'vitest'
import { periksaKelayakan, type MitraKelayakan } from '../gerbang-kelayakan.js'

/**
 * GERBANG KELAYAKAN MITRA — satu penanda, semua pintu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DITUTUP, DIUKUR BUKAN DIDUGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai migrasi 461, identitas mitra terpecah tiga tabel dan gerbang
 * kelayakannya cuma menutup SATU pintu. Diukur 2026-08-19:
 *
 *   evaluasi_subkon.supplier_id       → suppliers   (5 evaluasi)
 *   prakualifikasi_vendor.supplier_id → suppliers   (5 prakualifikasi)
 *   penawaran_subkon.worker_id        → workers     (8 penawaran)
 *
 * Kedelapan penawaran tender datang lewat `workers`, sementara
 * `masuk_daftar_hitam` hanya bisa menunjuk `suppliers` — dan
 * `tender-subkon.ts` maupun `spk.ts` tak memeriksanya sama sekali.
 *
 * Jadi pihak yang di-blacklist tetap bisa menawar dan menang. Bukan karena
 * penjaganya lalai, melainkan karena penjaganya berdiri di pintu yang lain.
 */
const m = (o: Partial<MitraKelayakan> = {}): MitraKelayakan => ({
  id: 'm1', nama: 'CV Sinar Jaya',
  daftar_hitam: false, alasan_daftar_hitam: null, aktif: true,
  ...o,
})

describe('gerbang kelayakan mitra', () => {
  it('mitra bersih boleh maju, tanpa pesan yang mengganggu', () => {
    const h = periksaKelayakan(m())
    expect(h.boleh).toBe(true)
    expect(h.kode).toBe('layak')
    // `null`, bukan string kosong: layar memutuskan menampilkan-atau-tidak
    // dari ada-tidaknya pesan, dan string kosong menghasilkan kotak
    // peringatan kosong.
    expect(h.pesan).toBeNull()
  })

  it('DAFTAR HITAM ditolak — dan alasannya ikut terbawa', () => {
    /*
      Inti berkas ini. Sebelum migrasi 461 + gerbang ini, pihak yang
      di-blacklist tetap bisa ditetapkan sebagai pemenang tender.
    */
    const h = periksaKelayakan(m({
      daftar_hitam: true,
      alasan_daftar_hitam: 'tiga kali gagal serah terima',
    }))
    expect(h.boleh).toBe(false)
    expect(h.kode).toBe('daftar_hitam')
    expect(h.pesan).toContain('CV Sinar Jaya')
    // Alasannya IKUT. "Ditolak: masuk daftar hitam" tanpa sebab memaksa
    // pengguna membuka layar lain, dan sebagian akan menyimpulkan sistemnya
    // rusak.
    expect(h.pesan).toContain('tiga kali gagal serah terima')
  })

  it('daftar hitam TANPA alasan tetap ditolak, pesannya tak menggantung', () => {
    /*
      CHECK migrasi 461 menuntut alasan, jadi keadaan ini seharusnya mustahil.
      Tetap diuji karena baris lama atau pelonggaran constraint di kemudian
      hari bisa menghasilkannya — dan saat itu terjadi, yang paling buruk
      bukan penolakannya melainkan pesan yang berhenti di titik dua.
    */
    for (const alasan of [null, '', '   ']) {
      const h = periksaKelayakan(m({ daftar_hitam: true, alasan_daftar_hitam: alasan }))
      expect(h.boleh).toBe(false)
      expect(h.pesan).toContain('alasan tak tercatat')
      expect(h.pesan).not.toMatch(/:\s*\.$/)
    }
  })

  it('TAK AKTIF ditolak dengan kalimat yang BERBEDA dari daftar hitam', () => {
    // "Sudah tidak dipakai" dan "dilarang" menuntut tindakan yang berbeda:
    // yang pertama diaktifkan kembali dalam sedetik, yang kedua butuh
    // keputusan. Menyamakan kalimatnya membuat keduanya diperlakukan sama.
    const h = periksaKelayakan(m({ aktif: false }))
    expect(h.boleh).toBe(false)
    expect(h.kode).toBe('tak_aktif')
    expect(h.pesan).toMatch(/dinonaktifkan/i)
    expect(h.pesan).not.toMatch(/daftar hitam/i)
  })

  it('daftar hitam MENANG atas tak aktif — yang lebih berat yang disebut', () => {
    /*
      Mitra yang di-blacklist biasanya juga dinonaktifkan. Kalau urutan
      pemeriksaannya terbalik, pesannya berbunyi "tidak aktif" — terbaca
      seperti kelalaian administrasi, dan orang akan mengaktifkannya kembali
      tanpa tahu ada larangan di baliknya.
    */
    const h = periksaKelayakan(m({
      daftar_hitam: true, alasan_daftar_hitam: 'pemalsuan berita acara', aktif: false,
    }))
    expect(h.kode).toBe('daftar_hitam')
    expect(h.pesan).toContain('pemalsuan berita acara')
  })

  it('BELUM tertaut identitas TIDAK menghentikan pekerjaan', () => {
    /*
      Keputusan yang gampang salah arah.

      `null` berarti barisnya belum punya `mitra_id` — keadaan DATA, bukan
      penilaian atas pihaknya. Menolaknya akan menghentikan seluruh tender di
      tenant yang barisnya belum ter-backfill, pada hari migrasi dijalankan,
      dengan pesan yang menuduh mitranya.

      Tetap DIBERITAHU: ada yang perlu dibereskan, cuma bukan sekarang.
    */
    for (const kosong of [null, undefined]) {
      const h = periksaKelayakan(kosong)
      expect(h.boleh).toBe(true)
      expect(h.kode).toBe('tanpa_identitas')
      expect(h.pesan).toMatch(/belum punya identitas/i)
    }
  })

  it('`daftar_hitam` null diperlakukan sebagai TIDAK, bukan ya', () => {
    // Kolomnya NOT NULL DEFAULT false di basis, tapi baris yang datang lewat
    // join kiri bisa membawa null. Menganggapnya "ya" akan memblokir mitra
    // yang bersih — kegagalan yang menuduh pihak yang tak bersalah.
    const h = periksaKelayakan(m({ daftar_hitam: null, aktif: null }))
    expect(h.boleh).toBe(true)
    expect(h.kode).toBe('layak')
  })
})
