import { describe, it, expect } from 'vitest'
import {
  susunTender,
  periksaPenetapan,
  periksaPenutupan,
  susunTabulasiItem,
  AMBANG_TERLALU_RENDAH_PCT,
  MIN_ALASAN_BUKAN_TERMURAH,
  MIN_ALASAN_UMUM,
  type BarisPenawaranSubkon,
  type BarisItemPenawaran,
} from '../tender-subkon.js'

// ═════════════════════════════════════════════════════════════════════════════
// TENDER SUBKON — angka yang MEMILIH PELAKSANA borongan ratusan juta.
//
// Diukur: 20 lingkup kerja Rp 15jt–280jt, semuanya `unsigned`, tanpa jejak
// bagaimana mandornya dipilih.
//
// Dua arah salah, keduanya mahal dan keduanya TIDAK melempar error:
//
//   termurah salah hitung  → borongan jatuh ke mandor yang keliru
//   terlalu rendah dipuji  → mandor kabur di tengah, pekerjaan mangkrak
// ═════════════════════════════════════════════════════════════════════════════

const P = (o: Partial<BarisPenawaranSubkon> & Pick<BarisPenawaranSubkon, 'id' | 'nilai_penawaran'>): BarisPenawaranSubkon => ({
  worker_id: 'w' + o.id, worker_name: 'Mandor ' + o.id, ...o,
})

describe('susunTender — dasar', () => {
  it('penawar termurah ditandai, selisih dihitung terhadapnya', () => {
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 100_000_000 }),
      P({ id: 'b', nilai_penawaran: 120_000_000 }),
    ])
    expect(h.nilai_termurah).toBe(100_000_000)
    expect(h.penawaran[0].penilaian).toBe('termurah')
    expect(h.penawaran[1].selisih_termurah_pct).toBe(20)
    expect(h.rentang_pct).toBe(20)
  })

  it('rentang null bila hanya SATU penawar', () => {
    // "Rentang 0%" terbaca "harganya seragam" — padahal tak ada pembanding.
    const h = susunTender([P({ id: 'a', nilai_penawaran: 100_000_000 })])
    expect(h.rentang_pct).toBeNull()
    expect(h.jumlah_menawar).toBe(1)
  })
})

describe('susunTender — jalan di mana pelaksana salah bisa terpilih', () => {
  it('yang TIDAK MENAWAR tak pernah jadi termurah', () => {
    // Kalau `tidak_menawar` diperlakukan sebagai 0, ia SELALU menang — dan
    // borongan jatuh ke mandor yang tak pernah mengajukan harga.
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 100_000_000 }),
      P({ id: 'b', nilai_penawaran: 0, tidak_menawar: true }),
    ])
    expect(h.nilai_termurah).toBe(100_000_000)
    const b = h.penawaran.find((p) => p.id === 'b')!
    expect(b.nilai).toBeNull()
    expect(b.penilaian).toBe('tidak_menawar')
    expect(h.jumlah_tidak_menawar).toBe(1)
  })

  it('NUMERIC berupa STRING dibandingkan sebagai ANGKA', () => {
    // Sebagai TEKS, "100000000" < "99000000" — penawar termahal menang.
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: '100000000' }),
      P({ id: 'b', nilai_penawaran: '99000000' }),
    ])
    expect(h.nilai_termurah).toBe(99_000_000)
    expect(h.penawaran[0].id).toBe('b')
  })

  it('penawaran jauh DI BAWAH perkiraan ditandai, bukan dipuji', () => {
    // Ini inti modulnya: termurah 40% di bawah perkiraan biasanya berarti ada
    // lingkup yang tak dihitung — dan itu kembali sebagai klaim tambah atau
    // pekerjaan mangkrak. Menandainya "termurah" saja membuat yang paling
    // berbahaya terlihat paling menarik.
    const h = susunTender(
      [
        P({ id: 'murah', nilai_penawaran: 60_000_000 }),
        P({ id: 'wajar', nilai_penawaran: 98_000_000 }),
      ],
      100_000_000)
    const murah = h.penawaran.find((p) => p.id === 'murah')!
    expect(murah.selisih_perkiraan_pct).toBe(-40)
    expect(murah.penilaian).toBe('terlalu_rendah')
    expect(murah.penilaian).not.toBe('termurah')
    expect(h.jumlah_terlalu_rendah).toBe(1)
    expect(AMBANG_TERLALU_RENDAH_PCT).toBe(20)
  })

  it('penawaran jauh DI ATAS perkiraan juga ditandai', () => {
    const h = susunTender([P({ id: 'a', nilai_penawaran: 150_000_000 })], 100_000_000)
    expect(h.penawaran[0].selisih_perkiraan_pct).toBe(50)
    expect(h.penawaran[0].penilaian).toBe('terlalu_tinggi')
  })

  it('tanpa perkiraan, penilaian jatuh ke termurah/wajar', () => {
    // Perkiraan kosong ≠ semuanya wajar. Yang benar: tak bisa dinilai
    // terhadap perkiraan, jadi hanya perbandingan antar penawar yang berlaku.
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 10_000_000 }),
      P({ id: 'b', nilai_penawaran: 90_000_000 }),
    ])
    expect(h.penawaran[0].selisih_perkiraan_pct).toBeNull()
    expect(h.penawaran[0].penilaian).toBe('termurah')
    expect(h.jumlah_terlalu_rendah).toBe(0)
  })

  it('yang GUGUR tak ikut perbandingan harga', () => {
    // Penawar gugur tak memenuhi syarat; harganya tak relevan. Membiarkannya
    // ikut membuat "termurah" jatuh ke penawar yang memang tak bisa dipakai.
    const h = susunTender([
      P({ id: 'gugur', nilai_penawaran: 50_000_000, status: 'gugur' }),
      P({ id: 'sah', nilai_penawaran: 100_000_000 }),
    ])
    expect(h.nilai_termurah).toBe(100_000_000)
    expect(h.jumlah_menawar).toBe(1)
    // …tapi tetap DITAMPILKAN, di urutan bawah — supaya terlihat bahwa ia
    // pernah mengajukan dan kenapa tak dipakai.
    expect(h.penawaran.some((p) => p.id === 'gugur')).toBe(true)
    expect(h.penawaran[h.penawaran.length - 1].id).toBe('gugur')
  })
})

describe('susunTender — pemenang bukan termurah WAJIB terlihat', () => {
  it('pemenang bukan-termurah ditandai beserta selisihnya', () => {
    // Sering ada alasan sah (rekam jejak, kapasitas, waktu). Tapi alasan itu
    // tak pernah ditanyakan kalau tak ada yang menandainya.
    const h = susunTender([
      P({ id: 'murah', nilai_penawaran: 100_000_000, status: 'kalah' }),
      P({ id: 'menang', nilai_penawaran: 115_000_000, status: 'menang' }),
    ])
    expect(h.pemenang?.id).toBe('menang')
    expect(h.pemenang_bukan_termurah).toBe(true)
    expect(h.selisih_pemenang_termurah).toBe(15_000_000)
  })

  it('pemenang YANG termurah tidak ditandai', () => {
    const h = susunTender([
      P({ id: 'menang', nilai_penawaran: 100_000_000, status: 'menang' }),
      P({ id: 'kalah', nilai_penawaran: 120_000_000, status: 'kalah' }),
    ])
    expect(h.pemenang_bukan_termurah).toBe(false)
    expect(h.selisih_pemenang_termurah).toBe(0)
  })

  it('belum ada pemenang → null, bukan penawar pertama', () => {
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 100_000_000 }),
      P({ id: 'b', nilai_penawaran: 120_000_000 }),
    ])
    expect(h.pemenang).toBeNull()
    expect(h.pemenang_bukan_termurah).toBe(false)
  })
})

describe('susunTender — jalan lain di mana angkanya bisa menyesatkan', () => {
  it('null/undefined tak membuat NaN mengalir', () => {
    const h = susunTender([P({ id: 'a', nilai_penawaran: null as unknown as number })])
    expect(Number.isNaN(h.penawaran[0].nilai ?? 0)).toBe(false)
    expect(h.penawaran[0].nilai).toBe(0)
  })

  it('nol penawar sama sekali: termurah null, bukan 0', () => {
    const h = susunTender([])
    expect(h.nilai_termurah).toBeNull()
    expect(h.rentang_pct).toBeNull()
    expect(h.pemenang).toBeNull()
  })

  it('semua tidak menawar: termurah null', () => {
    const h = susunTender([
      P({ id: 'a', nilai_penawaran: 0, tidak_menawar: true }),
      P({ id: 'b', nilai_penawaran: 0, tidak_menawar: true }),
    ])
    expect(h.nilai_termurah).toBeNull()
    expect(h.jumlah_menawar).toBe(0)
    expect(h.jumlah_tidak_menawar).toBe(2)
  })

  it('urutan: termurah di atas, tak-menawar lalu gugur di bawah', () => {
    const h = susunTender([
      P({ id: 'gugur', nilai_penawaran: 10_000_000, status: 'gugur' }),
      P({ id: 'takmenawar', nilai_penawaran: 0, tidak_menawar: true }),
      P({ id: 'mahal', nilai_penawaran: 200_000_000 }),
      P({ id: 'murah', nilai_penawaran: 100_000_000 }),
    ])
    expect(h.penawaran.map((p) => p.id)).toEqual(['murah', 'mahal', 'takmenawar', 'gugur'])
  })

  it('perkiraan NOL tidak menghasilkan Infinity', () => {
    const h = susunTender([P({ id: 'a', nilai_penawaran: 100_000_000 })], 0)
    expect(h.penawaran[0].selisih_perkiraan_pct).toBeNull()
    expect(h.penawaran[0].penilaian).toBe('termurah')
  })

  // Catatan penawar diteruskan APA ADANYA.
  //
  // Ditemukan 2026-08-07 saat membangun layarnya: `catatan` ada di input
  // tapi tak pernah sampai ke output. Kolom "Catatan" di UI akan SELALU
  // kosong, tanpa satu pun galat — dan yang hilang justru kalimat yang
  // menjelaskan kenapa sebuah penawaran jauh di bawah perkiraan.
  it('catatan penawar diteruskan ke hasil, termasuk pada yang tak menawar', () => {
    const h = susunTender([
      P({ id: 'rendah', nilai_penawaran: 100_000_000,
          catatan: 'Harga tidak menyebut talang dan flashing.' }),
      P({ id: 'wajar', nilai_penawaran: 160_000_000 }),
      P({ id: 'absen', nilai_penawaran: 0, tidak_menawar: true,
          catatan: 'Sedang mengerjakan dua proyek lain.' }),
    ], 165_000_000)

    const per = (id: string) => h.penawaran.find((p) => p.id === id)!
    expect(per('rendah').catatan).toBe('Harga tidak menyebut talang dan flashing.')
    expect(per('absen').catatan).toBe('Sedang mengerjakan dua proyek lain.')
    // Tanpa catatan tetap `null`, bukan undefined — UI membedakan keduanya.
    expect(per('wajar').catatan).toBeNull()
    // Dan catatan tidak mengubah penilaian: yang rendah tetap ditandai rendah.
    expect(per('rendah').penilaian).toBe('terlalu_rendah')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PENETAPAN PEMENANG
//
// Sampai 2026-08-13 modul ini bisa membandingkan penawaran dengan baik lalu
// berhenti tepat sebelum gunanya: memutuskan. Blok ini menguji aturan yang
// menutup jarak itu.
// ═════════════════════════════════════════════════════════════════════════════

const pw = (o: Partial<BarisPenawaranSubkon> & { id: string }): BarisPenawaranSubkon => ({
  worker_id: 'w-' + o.id, nilai_penawaran: 100_000_000, status: 'diajukan', ...o,
})

const TIGA: BarisPenawaranSubkon[] = [
  pw({ id: 'murah', nilai_penawaran: 100_000_000 }),
  pw({ id: 'tengah', nilai_penawaran: 120_000_000 }),
  pw({ id: 'mahal', nilai_penawaran: 150_000_000 }),
]

const ALASAN_PANJANG = 'Satu-satunya yang pernah mengerjakan bore pile di tanah lunak Dago.'

describe('penetapan pemenang', () => {
  it('penawar termurah cukup dengan alasan pendek', () => {
    const h = periksaPenetapan({
      penawaran: TIGA, idPemenang: 'murah', statusTender: 'terkirim',
      alasan: 'Termurah dan memenuhi syarat.',
    })
    expect(h.boleh).toBe(true)
    if (h.boleh) expect(h.peringatan).toBeNull()
  })

  it('BUKAN termurah menuntut alasan lebih panjang, dan diberi peringatan', () => {
    // Ambang yang lolos untuk termurah harus GAGAL untuk yang bukan termurah —
    // kalau tidak, ambang keduanya sama saja dan pembedaannya cuma hiasan.
    const pendek = 'x'.repeat(MIN_ALASAN_UMUM + 1)
    expect(pendek.length).toBeLessThan(MIN_ALASAN_BUKAN_TERMURAH)

    const gagal = periksaPenetapan({
      penawaran: TIGA, idPemenang: 'mahal', statusTender: 'terkirim', alasan: pendek,
    })
    expect(gagal.boleh).toBe(false)
    if (!gagal.boleh) {
      expect(gagal.kode).toBe('alasan')
      expect(gagal.sebab).toMatch(/bukan penawar termurah/i)
    }

    const lolos = periksaPenetapan({
      penawaran: TIGA, idPemenang: 'mahal', statusTender: 'terkirim', alasan: ALASAN_PANJANG,
    })
    expect(lolos.boleh).toBe(true)
    if (lolos.boleh) {
      expect(lolos.peringatan).toMatch(/50\.000\.000/)
      expect(lolos.peringatan).toMatch(/lebih mahal/i)
    }
  })

  it('yang TIDAK MENAWAR tak bisa menang meski nilainya 0', () => {
    // 0 adalah termurah secara aritmetika. Tanpa pagar ini, borongan jatuh ke
    // mandor yang justru menyatakan tak sanggup.
    const dgnAbsen = [...TIGA, pw({ id: 'absen', nilai_penawaran: 0, tidak_menawar: true })]
    const h = periksaPenetapan({
      penawaran: dgnAbsen, idPemenang: 'absen', statusTender: 'terkirim', alasan: ALASAN_PANJANG,
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.kode).toBe('tak_menawar')
  })

  it('yang tidak menawar juga tak dihitung sebagai pembanding termurah', () => {
    // Kalau 0 ikut jadi "termurah", memenangkan penawar 100jt akan dianggap
    // "bukan termurah" dan menuntut alasan panjang tanpa sebab.
    const dgnAbsen = [...TIGA, pw({ id: 'absen', nilai_penawaran: 0, tidak_menawar: true })]
    const h = periksaPenetapan({
      penawaran: dgnAbsen, idPemenang: 'murah', statusTender: 'terkirim',
      alasan: 'Termurah dan memenuhi syarat.',
    })
    expect(h.boleh).toBe(true)
    if (h.boleh) expect(h.peringatan).toBeNull()
  })

  it('yang GUGUR tak bisa menang, dan tak jadi pembanding', () => {
    const dgnGugur = [
      pw({ id: 'gugur', nilai_penawaran: 50_000_000, status: 'gugur' }),
      ...TIGA,
    ]
    const tolak = periksaPenetapan({
      penawaran: dgnGugur, idPemenang: 'gugur', statusTender: 'terkirim', alasan: ALASAN_PANJANG,
    })
    expect(tolak.boleh).toBe(false)
    if (!tolak.boleh) expect(tolak.kode).toBe('status')

    // 'murah' tetap termurah di antara yang bersaing — gugur tak menariknya turun.
    const terima = periksaPenetapan({
      penawaran: dgnGugur, idPemenang: 'murah', statusTender: 'terkirim',
      alasan: 'Termurah dan memenuhi syarat.',
    })
    expect(terima.boleh).toBe(true)
  })

  it('penawaran dari tender LAIN ditolak', () => {
    const h = periksaPenetapan({
      penawaran: TIGA, idPemenang: 'entah', statusTender: 'terkirim', alasan: ALASAN_PANJANG,
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.kode).toBe('tak_ada')
  })

  it('tender yang SUDAH selesai atau batal tak bisa ditetapkan ulang', () => {
    for (const st of ['selesai', 'batal']) {
      const h = periksaPenetapan({
        penawaran: TIGA, idPemenang: 'murah', statusTender: st, alasan: ALASAN_PANJANG,
      })
      expect(h.boleh, st).toBe(false)
      if (!h.boleh) expect(h.kode).toBe('sudah_putus')
    }
  })

  it('nilai bertipe STRING (dari pg) dibandingkan sebagai angka', () => {
    // '90000000' < '100000000' benar secara teks DAN angka, jadi tak
    // membuktikan apa pun. '9000000' vs '100000000' membedakannya: sebagai
    // teks '9…' > '1…', sebagai angka 9jt < 100jt.
    const str = [
      pw({ id: 'a', nilai_penawaran: '9000000' }),
      pw({ id: 'b', nilai_penawaran: '100000000' }),
    ]
    const h = periksaPenetapan({
      penawaran: str, idPemenang: 'a', statusTender: 'terkirim',
      alasan: 'Termurah dan memenuhi syarat.',
    })
    expect(h.boleh, 'termurah dibandingkan sebagai teks').toBe(true)
    if (h.boleh) expect(h.peringatan).toBeNull()
  })

  it('termurah tetap termurah walau penilaiannya "terlalu rendah"', () => {
    // Cacat yang tertangkap dari LAYAR 2026-08-13, bukan dari test: UI menilai
    // "bukan termurah" lewat label `penilaian === 'termurah'`. Pada tender
    // nyata, penawar terendah justru berlabel `terlalu_rendah` (28,5% di bawah
    // perkiraan) — jadi tak ada baris berlabel 'termurah' sama sekali, dan
    // pemeriksaannya gagal senyap: dialog menuntut 10 karakter alih-alih 25.
    //
    // Aturan di sini membandingkan NILAI, bukan label. Test ini menguncinya.
    const h = periksaPenetapan({
      penawaran: TIGA, idPemenang: 'tengah', statusTender: 'terkirim',
      alasan: 'x'.repeat(MIN_ALASAN_UMUM + 2),
    })
    expect(h.boleh, 'ambang bukan-termurah tak diberlakukan').toBe(false)
    if (!h.boleh) expect(h.kode).toBe('alasan')
  })

  it('alasan berisi spasi saja diperlakukan kosong', () => {
    const h = periksaPenetapan({
      penawaran: TIGA, idPemenang: 'murah', statusTender: 'terkirim', alasan: '          ',
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.kode).toBe('alasan')
  })
})

describe('penutupan tender', () => {
  const menang = (id: string, d: BarisPenawaranSubkon[]) =>
    d.map((p) => (p.id === id ? { ...p, status: 'menang' as const } : p))

  it('tanpa pemenang ditolak', () => {
    const h = periksaPenutupan({ penawaran: TIGA, statusTender: 'terkirim', alasan: ALASAN_PANJANG })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/Belum ada pemenang/i)
  })

  it('dengan satu pemenang dan alasan, boleh ditutup', () => {
    const h = periksaPenutupan({
      penawaran: menang('murah', TIGA), statusTender: 'terkirim', alasan: ALASAN_PANJANG,
    })
    expect(h.boleh).toBe(true)
  })

  it('tanpa alasan ditolak meski pemenangnya ada', () => {
    const h = periksaPenutupan({
      penawaran: menang('murah', TIGA), statusTender: 'terkirim', alasan: '  ',
    })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/[Aa]lasan/)
  })

  it('DUA pemenang ditolak — jalur tulis yang melewati aplikasi', () => {
    const dua = TIGA.map((p) =>
      p.id === 'murah' || p.id === 'mahal' ? { ...p, status: 'menang' as const } : p)
    const h = periksaPenutupan({ penawaran: dua, statusTender: 'terkirim', alasan: ALASAN_PANJANG })
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.sebab).toMatch(/2 pemenang/)
  })

  it('yang sudah selesai atau batal tak bisa ditutup lagi', () => {
    for (const st of ['selesai', 'batal']) {
      const h = periksaPenutupan({
        penawaran: menang('murah', TIGA), statusTender: st, alasan: ALASAN_PANJANG,
      })
      expect(h.boleh, st).toBe(false)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PERBANDINGAN PER-ITEM (migrasi 437)
//
// Yang dijawab di sini dan tak bisa dijawab oleh `susunTender`:
//
//   "Agung Rp 12jt lebih murah — di POS MANA?"
//
// Selisih total yang sama bisa berarti penawar yang efisien merata, ATAU
// penawar yang MELEWATKAN satu pos. Yang kedua kembali sebagai klaim tambah,
// dan ia terbaca identik dengan yang pertama selama yang dibandingkan cuma
// totalnya.
// ═════════════════════════════════════════════════════════════════════════════

const IT = (
  penawaran_id: string,
  kode_item: string | null,
  uraian: string,
  harga_satuan: number | string,
  volume: number | string = 10,
): BarisItemPenawaran => ({ penawaran_id, kode_item, uraian, harga_satuan, volume })

describe('susunTabulasiItem — dasar', () => {
  it('termurah per ITEM ditandai, bukan termurah per total', () => {
    // Penawar B lebih mahal totalnya, tapi lebih murah di A.2. Itulah yang
    // hilang saat hanya total yang dibandingkan.
    const h = susunTabulasiItem([
      IT('a', 'A.1', 'Galian', 100_000),
      IT('a', 'A.2', 'Urugan', 900_000),
      IT('b', 'A.1', 'Galian', 120_000),
      IT('b', 'A.2', 'Urugan', 500_000),
    ], { a: 'Agung', b: 'Budi' })

    const galian = h.baris.find((x) => x.kode_item === 'A.1')!
    const urugan = h.baris.find((x) => x.kode_item === 'A.2')!
    expect(galian.sel.find((s) => s.penawaran_id === 'a')!.termurah).toBe(true)
    expect(urugan.sel.find((s) => s.penawaran_id === 'b')!.termurah).toBe(true)
    expect(h.jumlah_item_tak_lengkap).toBe(0)
  })

  it('item disatukan lewat KODE, meski uraiannya ditulis berbeda', () => {
    const h = susunTabulasiItem([
      IT('a', 'A.1', 'Galian tanah biasa', 100_000),
      IT('b', 'A.1', 'Pekerjaan galian', 120_000),
    ])
    expect(h.baris).toHaveLength(1)
    expect(h.baris[0].sel).toHaveLength(2)
  })

  it('tanpa kode, uraian jadi penyatunya — beda kapital tetap satu baris', () => {
    const h = susunTabulasiItem([
      IT('a', null, 'Galian Tanah', 100_000),
      IT('b', null, 'galian tanah', 120_000),
    ])
    expect(h.baris).toHaveLength(1)
  })

  it('NUMERIC string dibandingkan sebagai ANGKA, bukan teks', () => {
    // "100000" > "99000" benar sebagai angka, SALAH sebagai teks.
    const h = susunTabulasiItem([
      IT('a', 'A.1', 'Galian', '100000'),
      IT('b', 'A.1', 'Galian', '99000'),
    ])
    expect(h.baris[0].harga_termurah).toBe(99_000)
    expect(h.baris[0].sel.find((s) => s.penawaran_id === 'b')!.termurah).toBe(true)
  })
})

describe('susunTabulasiItem — pos yang TIDAK dihitung seorang penawar', () => {
  it('penawar yang tak mengisi item muncul sebagai sel KOSONG, bukan Rp 0', () => {
    // Nol adalah angka terkecil. Dipasang di kolom yang sedang dibandingkan
    // besarannya, ia menang sebagai termurah — dan pos yang TIDAK DIHITUNG
    // terbaca sebagai pos yang paling murah.
    const h = susunTabulasiItem([
      IT('a', 'A.1', 'Galian', 100_000),
      IT('a', 'A.2', 'Urugan', 500_000),
      IT('b', 'A.1', 'Galian', 120_000),
      // 'b' tidak mengisi A.2 sama sekali.
    ])
    const urugan = h.baris.find((x) => x.kode_item === 'A.2')!
    const selB = urugan.sel.find((s) => s.penawaran_id === 'b')!
    expect(selB.harga_satuan).toBeNull()
    expect(selB.subtotal).toBeNull()
    expect(selB.termurah).toBe(false)
    expect(urugan.harga_termurah).toBe(500_000)
  })

  it('item yang tak lengkap DITANDAI dan diangkat ke paling atas', () => {
    const h = susunTabulasiItem([
      IT('a', 'A.1', 'Galian', 100_000),
      IT('b', 'A.1', 'Galian', 101_000),
      IT('a', 'A.2', 'Urugan', 500_000),
    ])
    expect(h.jumlah_item_tak_lengkap).toBe(1)
    // Yang tak lengkap di atas meski rentangnya tak paling lebar — pos yang
    // tak dihitung lebih penting daripada pos yang harganya beda 1%.
    expect(h.baris[0].kode_item).toBe('A.2')
    expect(h.baris[0].tak_lengkap).toBe(true)
  })

  it('ringkasan penawar menghitung berapa item yang TIDAK ia isi', () => {
    const h = susunTabulasiItem([
      IT('a', 'A.1', 'Galian', 100_000),
      IT('a', 'A.2', 'Urugan', 500_000),
      IT('b', 'A.1', 'Galian', 90_000),
    ], { a: 'Agung', b: 'Budi' })

    const budi = h.penawar.find((p) => p.penawaran_id === 'b')!
    expect(budi.jumlah_item).toBe(1)
    expect(budi.jumlah_tak_diisi).toBe(1)
    // Budi menang di satu-satunya pos yang ia isi — tapi ia melewatkan satu.
    expect(budi.jumlah_termurah).toBe(1)
  })
})

describe('susunTabulasiItem — nilai batas', () => {
  it('rentang null bila hanya SATU penawar mengisi item', () => {
    const h = susunTabulasiItem([IT('a', 'A.1', 'Galian', 100_000)])
    expect(h.baris[0].rentang_pct).toBeNull()
  })

  it('harga termurah NOL tak menghasilkan Infinity', () => {
    // Harga 0 sah (pekerjaan yang sudah termasuk pos lain), tapi
    // persentasenya tak terdefinisi.
    const h = susunTabulasiItem([
      IT('a', 'A.1', 'Galian', 0),
      IT('b', 'A.1', 'Galian', 100_000),
    ])
    expect(h.baris[0].rentang_pct).toBeNull()
    for (const s of h.baris[0].sel) expect(s.selisih_pct).toBeNull()
  })

  it('subtotal dari basis dipakai apa adanya bila dikirim', () => {
    // Kolom GENERATED. Menghitung ulang di sini hanya menciptakan kesempatan
    // kedua untuk membulatkannya berbeda.
    const h = susunTabulasiItem([
      { penawaran_id: 'a', kode_item: 'A.1', uraian: 'Galian', volume: 3, harga_satuan: 100, subtotal: 999 },
    ])
    expect(h.baris[0].sel[0].subtotal).toBe(999)
  })

  it('subtotal dihitung hanya bila basis tak mengirimkannya', () => {
    const h = susunTabulasiItem([IT('a', 'A.1', 'Galian', 100, 3)])
    expect(h.baris[0].sel[0].subtotal).toBe(300)
  })

  it('daftar kosong menghasilkan tabulasi kosong, bukan lempar', () => {
    const h = susunTabulasiItem([])
    expect(h.baris).toHaveLength(0)
    expect(h.penawar).toHaveLength(0)
    expect(h.total_termurah_gabungan).toBe(0)
  })
})
