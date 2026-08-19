import { describe, it, expect } from 'vitest'
import {
  usulanDariElemen, gabungUsulan, assemblyCocok, polaBeton,
  type ElemenTerhitung,
} from '../struktur-ke-rab'
import { analisaBalok } from '../struktur-beton'
import { analisaBalokBaja } from '../struktur-baja'
import { konversiBesiBeton, konversiBajaProfil } from '../satuan-beli'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * JEMBATAN VOLUME → RAB — tujuan awal seluruh modul struktur
 *
 * Modul struktur menghitung volume; basis punya 3.043 assembly AHSP lengkap
 * dengan bahan, upah, dan alat. Yang TIDAK ada di antaranya: apa pun yang
 * menyambungkan — sehingga estimator MENGETIK ULANG angka dari layar analisa
 * ke RAB.
 *
 * Begitu desainnya berubah, RAB tidak ikut berubah, tanpa satu pun galat. Itu
 * persis masalah yang disebut di kepala `struktur-beton.ts` sebagai alasan
 * seluruh modul ini dibangun.
 *
 * ⚠ Modul ini SEMPAT ditulis tanpa test sama sekali — dan fungsi
 * penggabungannya punya logika kunci yang rumit (membuang kode elemen dari
 * uraian, tetapi TIDAK membuang diameter besi). Itu jenis logika yang salahnya
 * tak menimbulkan galat: ia menghasilkan RAB yang terlihat rapi dengan D16 dan
 * Ø8 tercampur jadi satu baris.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const BALOK = analisaBalok({
  bMm: 300, hMm: 520, panjangM: 6, selimutMm: 30, dUtamaMm: 16,
  nTarik: 5, dSengkangMm: 8, jarakSengkangMm: 150,
  mutu: { fcMpa: 25, fyMpa: 400 }, muKnm: 120, vuKn: 90,
})

const el = (
  kode: string, jenis: string, h: { volume: unknown; catatan?: string[] },
): ElemenTerhitung => ({ kode, jenis, volume: h.volume as never, catatan: h.catatan })

describe('usulanDariElemen — satu elemen jadi beberapa item RAB', () => {
  it('balok beton menghasilkan beton, bekisting, dan dua baris pembesian', () => {
    const u = usulanDariElemen(el('B1', 'balok', BALOK))
    expect(u.map((x) => x.jenis).sort())
      .toEqual(['bekisting', 'beton', 'pembesian', 'pembesian'])
  })

  it('kuantitas & satuan cocok dengan volume elemennya', () => {
    const u = usulanDariElemen(el('B1', 'balok', BALOK))

    const beton = u.find((x) => x.jenis === 'beton')!
    expect(beton.satuan).toBe('m3')
    expect(beton.kuantitas).toBeCloseTo(BALOK.volume.betonM3, 9)

    const bekisting = u.find((x) => x.jenis === 'bekisting')!
    expect(bekisting.satuan).toBe('m2')
    expect(bekisting.kuantitas).toBeCloseTo(BALOK.volume.bekistingM2, 9)
  })

  it('besi DIPECAH per diameter, bukan dijumlahkan', () => {
    /*
      D16 dan Ø8 punya harga berbeda, dan RAB yang menyebut "besi 90 kg" tanpa
      diameter tak bisa dipesan ke supplier.
    */
    const u = usulanDariElemen(el('B1', 'balok', BALOK))
    const besi = u.filter((x) => x.jenis === 'pembesian')
    expect(besi).toHaveLength(2)
    const uraian = besi.map((x) => x.uraian).join(' ')
    expect(uraian).toMatch(/16/)
    expect(uraian).toMatch(/8/)
  })

  it('baja profil DIPISAH dari pembesian — AHSP-nya berbeda', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      Pembesian dihitung per kg dengan upah tukang besi. Baja profil butuh
      pabrikasi, pengelasan, dan crane — AHSP `2.3.1.1` di basis ini memuat
      Alat Las Listrik dan Sewa mobil crane yang tak ada di AHSP pembesian.

      Menjumlahkannya berarti seluruh baja profil dihargai sebagai tulangan
      beton, dan selisihnya besar.
      ══════════════════════════════════════════════════════════════════════
    */
    const baja = analisaBalokBaja({
      profil: {
        designation: '200x100x5.5x8', profile_type: 'WF',
        hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
        beratKgPerM: 21.3333, panjangStandarM: 12,
      },
      mutu: { fyMpa: 240, fuMpa: 370 },
      bentangM: 6, jarakPengakuM: 0, muKnm: 30, vuKn: 60, bebanLayanKnPerM: 3,
    })
    const u = usulanDariElemen(el('BJ1', 'baja_balok', baja))
    expect(u).toHaveLength(1)
    expect(u[0].jenis).toBe('baja-profil')
    /*
      Diperiksa AKIBATNYA, bukan bentuk polanya. Versi sebelumnya menguji
      `/pabrikasi dan ereksi/` — frasa persis — dan jadi merah begitu polanya
      berubah jadi daftar kata, padahal perilakunya justru MEMBAIK. Test yang
      mengunci bentuk internal menghukum perbaikan.
    */
    const NAMA_AHSP_BAJA = '1 kg Pabrikasi dan Ereksi Baja Profil'
    expect(u[0].assemblyPola.some((x) => assemblyCocok(NAMA_AHSP_BAJA, x))).toBe(true)
    expect(u[0].uraian).toMatch(/WF/)
  })

  it('baris berkuantitas NOL dilewati, bukan diusulkan dengan angka nol', () => {
    /*
      Item RAB bervolume nol tetap muncul di dokumen penawaran dan membuat
      pembacanya mengira ada pekerjaan yang belum diisi harganya.
    */
    const kosong = el('TP1', 'tiang', {
      volume: { betonM3: 2, bekistingM2: 0, besi: [], besiTotalKg: 0, beratSendiriKg: 0 },
    })
    const u = usulanDariElemen(kosong)
    expect(u.map((x) => x.jenis)).toEqual(['beton'])
  })

  it('baris BESI berkuantitas nol dilewati — mutasi sempat LOLOS tanpa ini', () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      TEST INI ADA KARENA MUTASI LOLOS.

      Melepas `if (b.totalKg <= 0) continue` TIDAK memerahkan satu test pun:
      seluruh fixture memakai balok nyata, yang tiap baris besinya berbobot.
      Penjaganya ada di kode tetapi tak pernah ikut diuji.

      Yang membuatnya nyata: tiang pancang precast memulangkan `besi: []`, dan
      elemen yang tulangannya belum diisi bisa memulangkan baris berbobot nol.
      Keduanya menghasilkan item RAB "Pembesian 0 kg" yang tetap muncul di
      dokumen penawaran — dan pembacanya mengira ada pekerjaan yang belum
      diisi harganya.
      ══════════════════════════════════════════════════════════════════════
    */
    const adaYangNol = el('B9', 'balok', {
      volume: {
        betonM3: 1, bekistingM2: 5,
        besi: [
          { tipe: 'BjTS', diameterMm: 16, peran: 'utama', jumlahBatang: 4, panjangPerBatangM: 6, beratKgPerM: 1.58, totalKg: 37.9 },
          { tipe: 'BjTP', diameterMm: 8, peran: 'sengkang', jumlahBatang: 0, panjangPerBatangM: 1.5, beratKgPerM: 0.39, totalKg: 0 },
        ],
        besiTotalKg: 37.9, beratSendiriKg: 2400,
      },
    })
    const besi = usulanDariElemen(adaYangNol).filter((x) => x.jenis === 'pembesian')
    expect(besi).toHaveLength(1)
    expect(besi[0].uraian).toMatch(/16/)
    expect(besi.every((x) => x.kuantitas > 0)).toBe(true)
  })

  it('CATATAN batas ikut terbawa ke usulan RAB', () => {
    /*
      Tanpa ini, usulan RAB kehilangan keterangan bahwa volume besinya belum
      termasuk penyaluran — dan angka yang 26% kurang tanpa keterangan adalah
      cara paling rapi membuat orang salah.
    */
    const u = usulanDariElemen(el('B1', 'balok', BALOK))
    expect(u[0].catatan.join(' ')).toMatch(/penyaluran/i)
  })

  it('bekisting memakai POLA berbeda per jenis elemen', () => {
    /*
      AHSP bekisting kolom, balok, dan pondasi telapak punya koefisien upah
      yang berbeda — diukur di basis: `2.2.1.3.1` telapak, `.3` kolom,
      `.4` balok.
    */
    const balok = usulanDariElemen(el('B1', 'balok', BALOK))
      .find((x) => x.jenis === 'bekisting')!
    const kolom = usulanDariElemen(el('K1', 'kolom', BALOK))
      .find((x) => x.jenis === 'bekisting')!
    expect(balok.assemblyPola[0]).toMatch(/balok/)
    expect(kolom.assemblyPola[0]).toMatch(/kolom/)
  })

  it('asal menyebut kode DAN jenis elemennya', () => {
    const u = usulanDariElemen(el('B1', 'balok', BALOK))
    expect(u[0].asal).toEqual({ kodeElemen: 'B1', jenisElemen: 'balok' })
  })
})

describe('gabungUsulan — 40 balok jadi SATU baris beton', () => {
  it('elemen sejenis DIGABUNG, kuantitasnya dijumlah', () => {
    /*
      Satu proyek dengan 40 balok tak boleh menghasilkan 40 baris "beton balok"
      di RAB: yang dibeli beton, sekali, sejumlah totalnya.
    */
    const semua = [
      ...usulanDariElemen(el('B1', 'balok', BALOK)),
      ...usulanDariElemen(el('B2', 'balok', BALOK)),
      ...usulanDariElemen(el('B3', 'balok', BALOK)),
    ]
    const beton = gabungUsulan(semua).filter((x) => x.jenis === 'beton')
    expect(beton).toHaveLength(1)
    expect(beton[0].kuantitas).toBeCloseTo(BALOK.volume.betonM3 * 3, 9)
  })

  it('DIAMETER berbeda TIDAK digabung — barang berbeda', () => {
    /*
      Ini yang paling mudah salah: menggabungkan seluruh "pembesian" jadi satu
      baris membuat D16 dan Ø8 tercampur, dan RAB-nya tak bisa dipesan.

      Salahnya tak menimbulkan galat — ia menghasilkan RAB yang terlihat rapi.
    */
    const g = gabungUsulan(usulanDariElemen(el('B1', 'balok', BALOK)))
    expect(g.filter((x) => x.jenis === 'pembesian')).toHaveLength(2)
  })

  it('diameter sama dari elemen BERBEDA memang digabung', () => {
    // Arah sebaliknya: D16 dari B1 dan D16 dari B2 adalah barang yang SAMA.
    const semua = [
      ...usulanDariElemen(el('B1', 'balok', BALOK)),
      ...usulanDariElemen(el('B2', 'balok', BALOK)),
    ]
    const g = gabungUsulan(semua)
    expect(g.filter((x) => x.jenis === 'pembesian')).toHaveLength(2)
    const utama = g.find((x) => x.jenis === 'pembesian' && /16/.test(x.uraian))!
    expect(utama.asal).toHaveLength(2)
  })

  it('asal DIKUMPULKAN — angka gabungan tetap bisa ditelusuri', () => {
    /*
      Tanpa ini, RAB berisi angka yang tak bisa ditanya "dari mana?" — dan
      angka yang tak bisa ditanya akan dipercaya bulat-bulat, termasuk saat
      salah.
    */
    const semua = [
      ...usulanDariElemen(el('B1', 'balok', BALOK)),
      ...usulanDariElemen(el('B2', 'balok', BALOK)),
    ]
    const beton = gabungUsulan(semua).find((x) => x.jenis === 'beton')!
    expect(beton.asal.map((a) => a.kodeElemen).sort()).toEqual(['B1', 'B2'])
  })

  it('jenis elemen berbeda TIDAK digabung meski sama-sama beton', () => {
    // Beton balok dan beton kolom dituang terpisah dan sering bermutu berbeda.
    const g = gabungUsulan([
      ...usulanDariElemen(el('B1', 'balok', BALOK)),
      ...usulanDariElemen(el('K1', 'kolom', BALOK)),
    ])
    expect(g.filter((x) => x.jenis === 'beton')).toHaveLength(2)
  })

  it('catatan digabung TANPA duplikat', () => {
    const semua = [
      ...usulanDariElemen(el('B1', 'balok', BALOK)),
      ...usulanDariElemen(el('B2', 'balok', BALOK)),
    ]
    const beton = gabungUsulan(semua).find((x) => x.jenis === 'beton')!
    expect(new Set(beton.catatan).size).toBe(beton.catatan.length)
  })

  it('urut mengikuti urutan pengerjaan di lapangan', () => {
    /*
      beton → bekisting → pembesian → baja. RAB yang urutannya acak sulit
      diperiksa orang, dan yang sulit diperiksa tak diperiksa.
    */
    const urut = gabungUsulan(usulanDariElemen(el('B1', 'balok', BALOK)))
      .map((x) => x.jenis)
    expect(urut.indexOf('beton')).toBeLessThan(urut.indexOf('bekisting'))
    expect(urut.indexOf('bekisting')).toBeLessThan(urut.indexOf('pembesian'))
  })

  it('daftar kosong menghasilkan daftar kosong, bukan galat', () => {
    expect(gabungUsulan([])).toEqual([])
  })
})

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * PENCOCOKAN NAMA AHSP — cacat yang ditemukan dengan MENJALANKAN, bukan test
 *
 * Blok ini ada karena test sebelumnya hijau sementara endpointnya memasangkan
 * balok f'c 25 MPa ke AHSP **f'c 7,5 MPa**. Test lama hanya memeriksa "polanya
 * ada", tak pernah memeriksa pola itu memilih baris yang BENAR di antara nama
 * AHSP sungguhan.
 *
 * Nama di bawah disalin APA ADANYA dari basis, termasuk spasi gandanya.
 * ══════════════════════════════════════════════════════════════════════════════
 */
describe('assemblyCocok terhadap nama AHSP sungguhan', () => {
  const BETON_75 = "1 m3 beton mutu rendah f'c 7,5 MPa, slump (100 ± 25) mm, agregat maks 19 mm secara manual"
  const BETON_25 = "1 m3 beton mutu sedang f'c 25 MPa, slump (100 ± 25) mm, agregat maks 19 mm secara semi mekanis"
  const BETON_30 = "1 m3 beton mutu sedang f'c 30 MPa, slump (100 ± 25) mm, agregat maks 19 mm secara semi mekanis"
  const TULANGAN = '1 KG TULANGAN  BETON  DENGAN BESI POLOS / ULIR  (SNI.2013)'

  /** Apakah salah satu pola cocok? Meniru pemilihan di rute. */
  const cocokSalahSatu = (nama: string, pola: string[]) => pola.some((x) => assemblyCocok(nama, x))

  it("f'c 25 TIDAK cocok ke AHSP 7,5 MPa — angka 25 pada slump bukan mutu", () => {
    /*
      Ini kegagalan sungguhan yang terjadi di endpoint. SETIAP nama AHSP beton
      mengandung `slump (100 +- 25) mm`, jadi pencocokan kata-lepas menemukan
      `25` di sana dan memilih baris pertama — f'c 7,5 MPa. RAB-nya terlihat
      wajar karena angkanya memang angka beton.
    */
    expect(cocokSalahSatu(BETON_75, polaBeton(25))).toBe(false)
  })

  it("f'c 25 cocok ke AHSP f'c 25 MPa", () => {
    expect(cocokSalahSatu(BETON_25, polaBeton(25))).toBe(true)
  })

  it('mutu tidak saling tertukar antar baris', () => {
    expect(cocokSalahSatu(BETON_30, polaBeton(25))).toBe(false)
    expect(cocokSalahSatu(BETON_25, polaBeton(30))).toBe(false)
    expect(cocokSalahSatu(BETON_30, polaBeton(30))).toBe(true)
  })

  it("mutu desimal dicocokkan dengan pemisah koma maupun titik", () => {
    /* Basis menulis `f'c 7,5 MPa`; kode menyimpannya sebagai 7.5. */
    expect(cocokSalahSatu(BETON_75, polaBeton(7.5))).toBe(true)
  })

  it('mutu tak diketahui tidak cocok apa pun — masuk daftar terlihat', () => {
    /*
      Menebak mutu jauh lebih berbahaya daripada melapor "tak ketemu": harga
      beton berbeda dua kali lipat antar mutu, dan tebakan tak meninggalkan
      jejak apa pun di RAB.
    */
    for (const n of [BETON_75, BETON_25, BETON_30]) {
      expect(cocokSalahSatu(n, polaBeton(undefined))).toBe(false)
      expect(cocokSalahSatu(n, polaBeton(0))).toBe(false)
    }
  })

  it('pola FRASA tahan spasi ganda pada nama AHSP', () => {
    /*
      ⚠ Test ini ada karena mutasi M3 LOLOS tanpanya.

      Mematikan normalisasi spasi (`.replace(/\s+/g, ' ')`) tidak
      memerahkan satu test pun, karena pola KATA-LEPAS memakai `includes`
      per kata dan memang tak peduli spasi. Yang benar-benar bergantung pada
      normalisasi adalah pola FRASA — dan waktu itu tak ada satu pun frasa
      yang diuji terhadap nama berspasi ganda.

      Nama AHSP sungguhan berbunyi `f'c 7,5 MPa,` dengan spasi tunggal, tapi
      basis yang sama juga memuat baris berspasi ganda. Frasa harus tetap
      cocok pada keduanya.
    */
    const BERSPASI_GANDA = "1 m3 beton  mutu  rendah  f'c  7,5  MPa,  slump (100 ± 25) mm"
    expect(assemblyCocok(BERSPASI_GANDA, "~f'c 7,5 mpa")).toBe(true)
  })

  it('pola kata-lepas tahan spasi ganda pada nama AHSP', () => {
    /*
      Nama aslinya berspasi GANDA (`TULANGAN  BETON  DENGAN`). Versi frasa-utuh
      gagal total di sini, dan gagalnya senyap: 4 dari 9 usulan jadi "tak
      ketemu" tanpa menyebut sebabnya.
    */
    expect(assemblyCocok(TULANGAN, 'tulangan beton polos ulir')).toBe(true)
  })

  it('kata yang tak ada membuat pola gagal, bukan cocok sebagian', () => {
    expect(assemblyCocok(TULANGAN, 'tulangan beton galvanis')).toBe(false)
  })

  it('pekerjaan ANGKUT tulangan tidak ikut tercocok', () => {
    /*
      Tiga AHSP lain mengandung kata "tulangan" tetapi pekerjaannya mengangkut,
      bukan memasang. Memakainya membuat RAB kehilangan pemasangannya.
    */
    expect(assemblyCocok('Menaikkan 1 kg tulangan ke lantai 2', 'tulangan beton polos ulir')).toBe(false)
  })
})

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SATUAN BELI — cacat yang lolos 26 test dan ketahuan dari GAMBAR
 *
 * `satuan-beli.ts` ditulis lengkap (25 aturan konversi), field `beli`
 * dideklarasikan di tipe `UsulanItemRab`, dan tak ada satu pun test yang
 * memeriksanya. Akibatnya modul itu tak pernah dipanggil sekali pun: `beli`
 * selalu `undefined`, dan kolom "Dibeli" di layar berisi "—" pada sembilan
 * barisnya.
 *
 * Yang menemukannya bukan test — melainkan memotret halamannya dan membacanya.
 * Blok ini memastikan kegagalan yang sama tak bisa senyap lagi.
 * ══════════════════════════════════════════════════════════════════════════════
 */
describe('satuan beli (RAB kg → RAP batang)', () => {
  /* BALOK sudah HASIL analisa, bukan inputnya — dipakai langsung. */
  const usulan = usulanDariElemen(el('B1', 'balok', BALOK))
  const besi = usulan.filter((u) => u.jenis === 'pembesian')

  it('tiap baris besi punya satuan beli — bukan undefined', () => {
    expect(besi.length).toBeGreaterThan(0)
    for (const b of besi) {
      expect(b.beli, `baris "${b.uraian}" tak punya satuan beli`).toBeDefined()
      expect(b.beli!.kuantitas).toBeGreaterThan(0)
      expect(b.beli!.satuan).toBe('btg')
    }
  })

  it('jumlah batang DIBULATKAN KE ATAS — setengah lonjor tak dijual', () => {
    /*
      Pembulatan ke bawah membuat RAP kekurangan bahan tanpa terlihat: angkanya
      wajar, satuannya benar, dan kurangnya baru ketahuan di lapangan.
    */
    for (const b of besi) {
      expect(Number.isInteger(b.beli!.kuantitas)).toBe(true)
      const beratPerLonjor = b.beli!.terpasangKg / b.beli!.kuantitas
      expect(b.beli!.kuantitas * beratPerLonjor).toBeGreaterThanOrEqual(b.kuantitas - 1e-9)
    }
  })

  it('berat TERPASANG dibawa apa adanya — supaya selisihnya bisa dilihat', () => {
    /*
      Yang dibeli selalu ≥ yang terpasang, karena barangnya dijual utuh.
      Menyimpan hanya salah satunya menghilangkan selisih itu dari pandangan —
      dan selisih itulah yang membuat belanja aktual melebihi RAP.
    */
    for (const b of besi) {
      expect(b.beli!.terpasangKg).toBeCloseTo(b.kuantitas, 6)
    }
  })

  it('baja profil dikonversi memakai berat profilnya, bukan rumus besi beton', () => {
    /*
      Rumus besi beton (0,0061654·d²) tak berlaku untuk WF — penampangnya bukan
      lingkaran. Memakai rumus yang salah menghasilkan jumlah batang yang
      terlihat wajar sambil salah berkali lipat.
    */
    const baja = analisaBalokBaja({
      profil: {
        designation: '200x100x5.5x8', profile_type: 'WF',
        hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
        beratKgPerM: 21.3333, panjangStandarM: 12,
      },
      mutu: { fyMpa: 240, fuMpa: 370 },
      bentangM: 6, jarakPengakuM: 0, muKnm: 30, vuKn: 60, bebanLayanKnPerM: 3,
    })
    /*
      BERAT dinaikkan supaya kedua rumus memberi jawaban BERBEDA.

      Dengan satu balok saja beratnya 256 kg — persis satu batang — dan rumus
      yang SALAH pun membulatkan ke 1. Mutasi yang menukar konversinya lolos
      karena fixture-nya terlalu kecil untuk membedakan keduanya, bukan karena
      kodenya benar.

      Volumenya dikalikan sepuluh di tempat (2.560 kg): rumus profil memberi
      10 batang, rumus besi beton tetap 1.
    */
    const sepuluh = el('BJ1', 'baja_balok', baja)
    sepuluh.volume = {
      ...sepuluh.volume,
      besi: sepuluh.volume.besi.map((b) => ({ ...b, totalKg: b.totalKg * 10 })),
    }
    const u = usulanDariElemen(sepuluh)
      .find((x) => x.jenis === 'baja-profil')!
    expect(u.beli).toBeDefined()

    /*
      ⚠ Angka di bawah SENGAJA dikunci, dan versi pertama test ini menguncinya
      SALAH.

      Semula tertulis `toBe(1)` dengan alasan "256 ÷ (21,33 × 12) = 1,0".
      Mutasi yang mengganti `konversiBajaProfil` dengan `konversiBesiBeton`
      LOLOS — keduanya kebetulan memulangkan angka yang sama untuk kasus itu,
      jadi test-nya tak membuktikan rumus mana yang dipakai.

      Diukur langsung, keduanya jauh berbeda:

          2.400 kg  →  profil 10 batang  ·  rumus-besi 1 batang

      karena rumus besi beton (0,0061654·d²) memperlakukan 200 sebagai DIAMETER
      lingkaran — satu "batang" jadi 2.959 kg, bukan 256 kg. Yang dikunci
      sekarang adalah isi per batang, yang berbeda di kedua rumus untuk semua
      masukan.
    */
    expect(u.beli!.satuan).toBe('btg')
    /*
      Satu batang WF 200×100 sepanjang 12 m = 21,3333 × 12 ≈ 256 kg.
      Rumus besi beton memperlakukan 200 sebagai DIAMETER lingkaran dan
      menghasilkan "batang" seberat 2.959 kg — satu batang untuk pekerjaan
      yang butuh sepuluh.
    */
    const isiPerBatang = u.beli!.terpasangKg / u.beli!.kuantitas
    expect(isiPerBatang).toBeLessThan(300)
    expect(u.beli!.kuantitas).toBeGreaterThan(1)
  })

  it('rumus profil dan rumus besi beton memberi jawaban BERBEDA', () => {
    /*
      Penjaga terhadap tertukarnya dua konversi. Tanpa test ini, memakai rumus
      besi beton untuk baja profil lolos tanpa satu pun kegagalan — dan
      akibatnya RAP memesan 1 batang WF untuk pekerjaan yang butuh 10.
    */
    const berat = 2400
    const profil = konversiBajaProfil(21.3333, berat)
    const salah = konversiBesiBeton(200, berat)
    expect(profil.kuantitasBeli).toBe(10)
    expect(salah.kuantitasBeli).toBe(1)
    expect(profil.kuantitasBeli).not.toBe(salah.kuantitasBeli)
  })

  it('beton dan bekisting TIDAK punya satuan beli — dan itu benar', () => {
    /*
      Beton dicor per m³ dan bekisting diukur per m²; keduanya memang tak
      dibeli dalam satuan utuh. Memaksakan angka "dibeli" di sini berarti
      mengarang.
    */
    for (const u of usulan.filter((x) => x.jenis === 'beton' || x.jenis === 'bekisting')) {
      expect(u.beli).toBeUndefined()
    }
  })
})

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SATUAN BELI SESUDAH DIGABUNG — jalur yang BENAR-BENAR dipakai endpoint
 *
 * Blok `satuan beli` di atas menguji `usulanDariElemen`. Endpoint tidak
 * memakai hasilnya langsung: ia melewatkannya lewat `gabungUsulan` lebih dulu.
 *
 * Dan di situlah `beli` hilang. Fungsi itu membangun objek gabungan baru tanpa
 * menyalin field-nya, jadi kolom "Dibeli" di layar berisi "—" pada sembilan
 * barisnya sementara 32 test tetap hijau.
 *
 * Pelajarannya bukan "kurang test" — melainkan test yang menguji fungsi yang
 * TIDAK dipakai jalur produksi. Blok ini menguji jalur yang dipakai.
 * ══════════════════════════════════════════════════════════════════════════════
 */
describe('satuan beli sesudah gabungUsulan', () => {
  const gabung = gabungUsulan([
    ...usulanDariElemen(el('B1', 'balok', BALOK)),
    ...usulanDariElemen(el('B2', 'balok', BALOK)),
  ])
  const besi = gabung.filter((u) => u.jenis === 'pembesian')

  it('field beli TIDAK hilang saat digabung', () => {
    expect(besi.length).toBeGreaterThan(0)
    for (const b of besi) {
      expect(b.beli, `"${b.uraian}" kehilangan satuan beli sesudah digabung`).toBeDefined()
      expect(b.beli!.kuantitas).toBeGreaterThan(0)
    }
  })

  it('jumlah batang dihitung dari total GABUNGAN, bukan menjumlahkan pembulatan', () => {
    /*
      Dua balok identik: tiap-tiap butuh 1 lonjor kalau dibulatkan sendiri,
      tetapi digabung keduanya sering tetap muat di lonjor yang sama. Sisa
      potongan batang yang sama dipakai untuk elemen berikutnya — itulah cara
      besi dipotong di lapangan.

      Menjumlahkan pembulatan memesan lebih banyak daripada yang dibutuhkan,
      dan kelebihannya tak terlihat karena angkanya wajar.
    */
    const satu = usulanDariElemen(el('B1', 'balok', BALOK))
      .filter((u) => u.jenis === 'pembesian')
    for (const g of besi) {
      const sepadan = satu.find((x) => x.uraian.startsWith(g.uraian))
      if (!sepadan?.beli) continue
      const dijumlahkan = sepadan.beli.kuantitas * 2
      expect(g.beli!.kuantitas).toBeLessThanOrEqual(dijumlahkan)
    }
  })

  it('terpasangKg gabungan sama dengan kuantitas gabungan', () => {
    /*
      Keduanya harus bergerak bersama. Kalau `terpasangKg` tertinggal di angka
      satu elemen sementara `kuantitas` sudah dijumlahkan, selisih beli-vs-
      terpasang yang ditampilkan jadi mengarang.
    */
    for (const b of besi) {
      expect(b.beli!.terpasangKg).toBeCloseTo(b.kuantitas, 6)
    }
  })

  it('yang tak punya satuan beli tetap tak punya sesudah digabung', () => {
    for (const g of gabung.filter((x) => x.jenis === 'beton' || x.jenis === 'bekisting')) {
      expect(g.beli).toBeUndefined()
    }
  })
})
