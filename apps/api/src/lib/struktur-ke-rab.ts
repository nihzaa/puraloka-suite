// Jembatan: volume hasil analisa struktur → item RAB ber-AHSP. PURE, tanpa I/O.
//
// ══════════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA — DAN KENAPA IA TUJUAN AWAL SELURUH MODUL STRUKTUR
// ══════════════════════════════════════════════════════════════════════════════
//
// Modul struktur menghitung volume beton, bekisting, besi, dan baja profil.
// Basis ini sudah punya 3.043 assembly AHSP lengkap dengan bahan, upah, dan
// alat (diukur, bukan ditaksir). Yang TIDAK ada di antara keduanya: apa pun
// yang menyambungkan.
//
// Akibatnya estimator MENGETIK ULANG angka dari layar analisa ke RAB. Dan
// begitu desainnya berubah — balok 300×500 jadi 300×520 — RAB tidak ikut
// berubah, tanpa satu pun galat yang memberi tahu. Itu persis masalah yang
// disebut di kepala `struktur-beton.ts` sebagai alasan modul ini dibangun:
//
//     "Yang kedua diketik ULANG dari yang pertama… Selisihnya baru ketahuan
//      saat besi di lapangan kurang, yaitu saat uangnya sudah keluar."
//
// Tanpa berkas ini, seluruh modul struktur berhenti di layar analisa dan
// masalah itu tetap utuh.
//
// ── Yang berkas ini TIDAK lakukan, dan itu disengaja
//
// Ia MENGUSULKAN, tidak MENERAPKAN. Keluarannya daftar usulan item RAB; yang
// memasukkannya ke `estimate_items` adalah manusia lewat tombol.
//
// Alasannya sama persis dengan yang sudah diputuskan untuk takeoff dimensi
// (lihat catatan `crm-boq` di peta-menu): menimpa `quantity` otomatis akan
// menggeser nilai kontrak dan progres lapangan yang tak bisa dibuat ulang,
// tanpa galat dan tanpa keputusan siapa pun.
//
// ── Kenapa pencocokan assembly berbasis POLA, bukan id yang dipaku
//
// Kode assembly berbeda antar edisi AHSP dan antar tenant (ada 3.043 baris,
// sebagian hasil impor pelanggan). Memaku id berarti jembatan ini rusak diam-
// diam begitu tenant memakai edisi lain — dan rusaknya berupa item RAB yang
// menunjuk pekerjaan yang salah, bukan galat.
//
// Yang dipakai: POLA PENCARIAN yang dinyatakan di sini, dicocokkan pemanggil
// ke tabel assembly milik tenantnya. Yang tak ketemu DILAPORKAN, bukan
// dilewati — item RAB yang hilang diam-diam adalah kekurangan anggaran.
// ══════════════════════════════════════════════════════════════════════════════

import type { VolumeElemen } from './struktur-beton'
import { labelK } from './struktur-mutu-nyata.js'
import {
  konversiBesiBeton, konversiBajaProfil, type SatuanBeli,
} from './satuan-beli.js'

/** Jenis pekerjaan yang bisa diturunkan dari volume struktur. */
export type JenisPekerjaan =
  | 'beton'
  | 'bekisting'
  | 'pembesian'
  | 'baja-profil'
  /*
    Kayu dan baja ringan punya AHSP yang SAMA SEKALI BERBEDA dari beton
    maupun baja profil berat, dan satuannya pun lain (kayu m³, baja ringan m).

    Sebelum keduanya dipisahkan, kuda-kuda kayu masuk usulan sebagai
    "Beton kuda_kuda_kayu" dan dicarikan AHSP beton — "tak ketemu" itu justru
    yang menyelamatkannya dari harga yang keliru. Baja ringan lebih buruk: ia
    TERPASANGKAN ke 2.3.1.1 "Pabrikasi dan Ereksi Baja Profil", yaitu AHSP
    baja WF berat dengan las dan crane, dan harganya jauh meleset.
  */
  | 'kayu'
  | 'baja-ringan'

/**
 * Satuan usulan item RAB.
 *
 * `m` ditambahkan bersama baja ringan: AHSP-nya bersatuan meter (kaso
 * dipasang per batang), dan `assemblyCocok` mensyaratkan satuan cocok —
 * usulan bersatuan kg tak pernah menemukan pasangannya.
 */
export type SatuanUsulan = 'm3' | 'm2' | 'm' | 'kg'

/**
 * Satu usulan item RAB.
 *
 * `assemblyPola` bukan id: ia petunjuk pencarian untuk pemanggil. Lihat alasan
 * di kepala berkas.
 */
export interface UsulanItemRab {
  jenis: JenisPekerjaan
  /** Uraian yang dibaca manusia di layar usulan. */
  uraian: string
  /** Kuantitas hasil analisa struktur. */
  kuantitas: number
  /** Satuan RAB — HARUS cocok dengan `output_unit_code` assembly-nya. */
  satuan: SatuanUsulan
  /**
   * Satuan & kuantitas PEMBELIAN untuk RAP — beda dari RAB, dan itu disengaja.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * RAB DIJUAL PER KG, RAP DIBELI PER BATANG
   *
   * AHSP menghitung baja dan besi per KILOGRAM, karena itu satuan yang dipakai
   * menyusun harga jual. Tetapi yang benar-benar dibeli adalah BATANG utuh:
   * baja profil 12 m, besi beton 12 m, pelat per LEMBAR.
   *
   * Balok 5 m berarti satu batang 12 m dipotong, dan sisa 7 m-nya belum tentu
   * terpakai di tempat lain. RAP yang memakai kilogram terpasang KEKURANGAN
   * uang untuk sisa itu — dan kekurangannya tak terlihat karena angkanya
   * "benar" menurut satuan yang dipakai.
   *
   * Keduanya dibawa BERSAMA, tak dipilih salah satu: RAB butuh kg untuk
   * dikalikan HSP, RAP butuh batang untuk dipesan. Menyimpan satu saja berarti
   * yang lain dihitung ulang oleh manusia — dan di situlah selisih lahir.
   * ══════════════════════════════════════════════════════════════════════════
   */
  beli?: {
    /** Berapa banyak yang dibeli. */
    kuantitas: number
    /*
      Tipe kanoniknya diambil dari `satuan-beli.ts`, bukan ditulis ulang.
      Versi sebelumnya menulis `'btg' | 'lbr'` dan langsung tak cocok begitu
      konversinya benar-benar dipanggil — modul itu juga mengenal `rol`, `zak`,
      dan lainnya. Dua daftar yang harus sama, disimpan di dua tempat.
    */
    satuan: SatuanBeli
    /**
     * Ukuran RINGKAS satu satuan beli — muat di satu sel tabel.
     *
     * Contoh: `"lonjor 12 m · 4,74 kg"`. Sengaja dipisahkan dari `asumsi`:
     * versi pertama menaruh seluruh paragraf asumsi di sini, dan UI
     * menampilkannya di kolom selebar 80 px.
     */
    ukuranPerSatuan: string
    /** Keterangan panjang: dari mana angkanya, dan sisanya bagaimana. */
    asumsi: string
    /**
     * Berat yang benar-benar TERPASANG, kg — lebih kecil dari yang dibeli.
     *
     * Dibawa supaya selisihnya bisa ditampilkan alih-alih ditemukan sendiri
     * oleh yang membandingkan RAB dan RAP.
     */
    terpasangKg: number
  }
  /**
   * Kata kunci untuk mencari assembly yang cocok, urut dari yang paling
   * spesifik. Pemanggil mencoba berurutan dan berhenti di yang pertama ketemu.
   */
  assemblyPola: string[]
  /** Dari elemen mana angka ini datang — supaya bisa ditelusuri balik. */
  asal: { kodeElemen: string; jenisElemen: string }
  /**
   * Batas yang HARUS ikut terbaca bersama angkanya.
   *
   * Diteruskan dari `catatan` modul analisa. Tanpa ini, usulan RAB kehilangan
   * keterangan bahwa volume besinya belum termasuk penyaluran — dan angka
   * yang 26% kurang tanpa keterangan adalah cara paling rapi membuat orang
   * salah.
   */
  catatan: string[]
}

/**
 * Pola pencarian assembly per jenis pekerjaan & jenis elemen.
 *
 * Ditulis sebagai DATA supaya bisa diperiksa tanpa membaca logika, dan supaya
 * menambah jenis elemen berarti menambah satu baris — bukan menyunting
 * rangkaian if yang tersebar.
 *
 * Bekisting dipisah per elemen karena AHSP-nya memang berbeda: bekisting
 * kolom, balok, pelat, dan pondasi telapak punya koefisien upah yang berbeda
 * (diukur di basis: `2.2.1.3.1` telapak, `.3` kolom, `.4` balok).
 */
const POLA_BEKISTING: Record<string, string[]> = {
  balok: ['bekisting balok', 'bekisting'],
  kolom: ['bekisting kolom', 'bekisting'],
  kolom_bulat: ['bekisting kolom', 'bekisting'],
  plat: ['bekisting lantai', 'bekisting plat', 'bekisting'],
  footplat: ['bekisting pondasi telapak', 'bekisting pondasi', 'bekisting'],
  pilecap: ['bekisting pondasi telapak', 'bekisting pondasi', 'bekisting'],
  tiang: [],   // precast — tak ada bekisting di proyek
}

/**
 * Pola beton BERGANTUNG MUTUNYA — dan itu bukan kerapian.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * Diukur di basis: ada belasan AHSP beton per mutu, dari f'c 7,5 sampai 45 MPa,
 * dan harganya berbeda jauh — beton mutu rendah dan mutu tinggi bisa selisih
 * dua kali lipat per m3.
 *
 * Versi pertama memakai pola tetap `'beton mutu'`, yang mengambil baris PERTAMA
 * yang cocok: `2.2.1.4.1` — f'c 7,5 MPa. Balok berf'c 25 MPa dihargai sebagai
 * beton 7,5 MPa, dan RAB-nya terlihat wajar karena angkanya memang angka beton.
 *
 * Ketahuannya dari MENJALANKAN endpoint dan membaca nama assembly yang
 * terpilih — bukan dari test, karena test hanya memeriksa polanya ada.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function polaBeton(fcMpa?: number): string[] {
  if (!fcMpa || !(fcMpa > 0)) {
    /*
      Mutu tak diketahui: JANGAN menebak. Pola yang sengaja tak cocok apa pun
      membuat baris ini masuk `tanpaAssembly` dan TERLIHAT — jauh lebih baik
      daripada memasangkannya ke mutu sembarang yang terlihat wajar.
    */
    return ['beton mutu-tak-diketahui']
  }
  /*
    ════════════════════════════════════════════════════════════════════════
    MUTU dicocokkan sebagai FRASA (awalan `~`), bukan kata lepas.

    Pencocokan kata-lepas salah di sini, dan salahnya senyap. SETIAP nama
    AHSP beton mengandung `slump (100 +- 25) mm`, jadi pola kata-lepas
    `beton 25 mpa` menemukan angka `25` pada SLUMP-nya, bukan pada mutunya —
    dan `2.2.1.4.1` (f'c 7,5 MPa) menang karena kebetulan urutan pertama.

    Diukur: balok f'c 25 tercocok ke f'c 7,5 MPa. Kolom f'c 30 kebetulan
    benar HANYA karena tak ada angka 30 lain di namanya — jadi hasil yang
    tampak benar pun tidak membuktikan apa-apa.

    Frasa `f'c 25 mpa` hanya cocok pada penyebutan mutu. Ditulis dua varian
    karena pemisah desimalnya bisa koma (`f'c 7,5 MPa`) maupun titik.
    ════════════════════════════════════════════════════════════════════════
  */
  const angka = String(fcMpa).replace('.', ',')

  /*
    ════════════════════════════════════════════════════════════════════════
    CADANGAN BER-K — dan kenapa hanya SEBAGIAN yang boleh dipakai
    ════════════════════════════════════════════════════════════════════════

    Katalog ini memakai dua bahasa. Diukur 2026-08-20 pada 90 AHSP beton
    bersatuan m3: 26 memakai f'c, 44 memakai K. Yang ber-K sebelumnya TAK
    PERNAH terjangkau, karena pola di sini hanya mencari frasa f'c.

    Tapi yang ber-K TIDAK boleh dipakai semuanya. Dari 45 yang bersatuan m3:

        13 BETON MURNI   "1 M3 BETON SITE MIX MUTU ( K-300 )"
        32 PAKET         "1 M3 BALOK STRUKTUR, 20/30 ( BETON SITE MIX K-250
                          TULANGAN BESI 16= 5 BUAH  SENGKANG BESI …)"

    Yang PAKET sudah memuat tulangan DAN bekisting. Modul ini mengirim
    ketiganya sebagai baris TERPISAH (beton, bekisting, pembesian), jadi
    memasangkan paket ke baris beton membuat tulangan dan bekisting
    terhitung DUA KALI — dan RAB-nya tetap terlihat wajar, karena tiap
    barisnya masuk akal sendiri-sendiri.

    Karena itu polanya berbentuk FRASA (awalan `~`), bukan daftar kata.

    Ini bukan detail gaya. `assemblyCocok` tanpa `~` mencocokkan daftar KATA
    dalam urutan BEBAS — dan nama paket memuat SELURUH kata tersebut:

        pola kata-lepas: beton · site · mix · k-250
        nama paket    : "1 M3 BALOK STRUKTUR, 20/30 ( BETON SITE MIX K-250
                         TULANGAN BESI 16= 5 BUAH …)"   -> COCOK. Salah.

    Frasa `~beton site mix mutu ( k-300 )` hanya cocok pada nama beton
    murni, karena paket menyisipkan kata lain di antara frasanya.

    ⚠ Urutannya penting: f'c DULU. Padanan K adalah konvensi pemesanan,
    bukan kesetaraan presisi — kalau AHSP ber-f'c yang tepat ADA, itu yang
    harus menang.
  */
  const kelasK = K_PADANAN[fcMpa]
  const cadanganK = kelasK
    ? [`~beton site mix ( k-${kelasK} )`,
       `~beton site mix mutu ( k-${kelasK} )`]
    : []

  return [`~f'c ${angka} mpa`, `~f'c ${fcMpa} mpa`, ...cadanganK]
}

/*
  Padanan f'c -> kelas K, HANYA untuk mencari AHSP cadangan.

  Didaftar, bukan dihitung: fc 20/25/30/35 adalah kelas silinder baku SNI
  yang sudah punya padanan K konvensional. Menghitung balik menghasilkan
  angka yang tak ada di katalog mana pun (fc 30 -> K-369).

  Hanya kelas yang BENAR-BENAR ada sebagai beton MURNI di katalog yang
  didaftar (K-100 s.d. K-350) — menambah yang tak ada cuma memperlebar pola
  tanpa menambah satu pun kecocokan.
*/
const K_PADANAN: Record<number, number> = {
  7.5: 100, 10: 125, 12.5: 150, 15: 175,
  17: 200, 17.5: 200, 19: 225, 20: 250, 21: 250,
  22.5: 275, 25: 300, 27.5: 325, 28: 350, 30: 350,
}

/**
 * Pola pembesian — urutan dari yang PALING SPESIFIK.
 *
 * Diukur di basis: AHSP yang benar bernama "1 KG TULANGAN BETON DENGAN BESI
 * POLOS / ULIR (SNI.2013)". Tiga AHSP lain juga mengandung kata "tulangan" —
 * `Menaikkan 1 kg tulangan…`, `Mengangkut 1 kg tulangan…` — dan ketiganya
 * pekerjaan ANGKUT, bukan pemasangan.
 *
 * Versi pertama menaruh `'pembesian'` di depan (tak cocok apa pun di basis
 * ini) dan `'tulangan beton'` sesudahnya — yang bisa mengambil pekerjaan
 * angkut. Versi kedua memakai frasa UTUH, dan gagal total: nama aslinya
 * berspasi GANDA (`TULANGAN  BETON  DENGAN`), sehingga tak satu pun frasa
 * cocok.
 *
 * Sekarang pola adalah daftar KATA yang semuanya harus ada — tahan terhadap
 * spasi ganda, tanda baca, dan urutan. Lihat `assemblyCocok` di rute.
 */
const POLA_PEMBESIAN: string[] = [
  'tulangan beton polos ulir',
  'pembesian',
]

/**
 * Pola AHSP kuda-kuda kayu — diukur di basis: `2.1.2.1` "Pemasangan 1 m3
 * konstruksi kuda-kuda konvensional, kayu kelas II" dan `CIB-STD-47/48`.
 *
 * Satuannya m³, SAMA dengan beton — karena itu pemeriksaan satuan di
 * `assemblyCocok` tak cukup membedakannya. Polanya harus menyebut kayu.
 */
const POLA_KAYU: string[] = [
  'konstruksi kuda-kuda kayu', 'kuda-kuda kayu', 'konstruksi kayu',
]

/**
 * Pola AHSP baja ringan — diukur di basis: `2.1.1.3` "Pemasangan 1 m Kaso
 * Baja Ringan C75 tebal 0,75 mm" dan `2.1.1.1` rangka atap per m².
 *
 * DIPISAHKAN dari baja profil: `2.3.1.1` adalah AHSP baja WF berat dengan
 * las dan crane. Memakainya untuk baja ringan memberi harga yang jauh
 * meleset — dan hasilnya tetap terlihat wajar.
 */
const POLA_BAJA_RINGAN: string[] = [
  'kaso baja ringan', 'baja ringan', 'rangka atap baja ringan',
]

const POLA_BAJA_PROFIL: string[] = [
  'pabrikasi ereksi baja profil', 'baja profil',
]

/** Bentuk minimum yang dibutuhkan dari hasil analisa mana pun. */
export interface ElemenTerhitung {
  kode: string
  /** balok · kolom · plat · footplat · pilecap · tiang · balok_baja · kolom_baja */
  jenis: string
  volume: VolumeElemen
  catatan?: string[]
  /**
   * Kuat tekan beton elemen ini, MPa — menentukan AHSP mana yang dipakai.
   *
   * Ada belasan AHSP beton per mutu di basis, dan harganya berbeda jauh.
   * Tanpa ini, seluruh beton dihargai memakai baris pertama yang cocok.
   *
   * Kosong untuk elemen baja, dan untuk beton yang mutunya belum terbaca dari
   * input — keduanya menghasilkan pola yang sengaja tak cocok apa pun,
   * sehingga barisnya terlihat di `tanpaAssembly` alih-alih salah harga.
   */
  fcMpa?: number
}

/**
 * Ubah hasil analisa satu elemen jadi usulan item RAB.
 *
 * Baris berkuantitas NOL DILEWATI, bukan diusulkan dengan angka nol: item RAB
 * bervolume nol tetap muncul di dokumen penawaran dan membuat pembacanya
 * mengira ada pekerjaan yang belum diisi harganya.
 *
 * Yang TIDAK dilewati: elemen yang memang bervolume nol untuk alasan nyata —
 * tiang pancang precast tak punya bekisting, dan itu sudah dinyatakan di
 * `catatan` modulnya, bukan disembunyikan di sini.
 */
/**
 * Imbuhan mutu untuk uraian RAB: `" - f'c 25 MPa (K-300)"`.
 *
 * Memulangkan string KOSONG bila elemennya tak bermutu beton (baja, kayu).
 * Menambahkan "(mutu tak diketahui)" di sana justru menakut-nakuti tanpa
 * sebab — baja memang tak punya mutu beton.
 */
function imbuhanMutu(fcMpa?: number): string {
  if (!fcMpa || !(fcMpa > 0)) return ''
  const k = labelK(fcMpa)
  return k ? ` f'c ${fcMpa} MPa (${k})` : ` f'c ${fcMpa} MPa`
}

export function usulanDariElemen(el: ElemenTerhitung): UsulanItemRab[] {
  const usulan: UsulanItemRab[] = []
  const asal = { kodeElemen: el.kode, jenisElemen: el.jenis }
  const catatan = el.catatan ?? []

  if (el.volume.betonM3 > 0) {
    usulan.push({
      /*
        Medan `betonM3` menampung volume bahan utama, dan untuk kuda-kuda
        kayu isinya KAYU — bukan beton. Modul kayu memakai medan yang sama
        supaya rekap proyek bisa menjumlahkannya (satuannya sama, m³), tetapi
        AHSP dan harganya berbeda sama sekali.

        Tanpa pembedaan ini usulan berbunyi "Beton kuda_kuda_kayu" dan dicari
        di AHSP beton — dan kalau kebetulan ada yang cocok satuannya, kayu
        akan dihargai sebagai beton.
      */
      jenis: el.jenis === 'kuda_kuda_kayu' ? 'kayu' : 'beton',
      /*
        MUTUNYA IKUT DI URAIAN — dalam dua bahasa sekaligus.

        Baris inilah yang dibaca orang yang MEMESAN betonnya, dan sebelumnya
        ia berbunyi "Beton Balok B1" saja: tanpa MPa, tanpa K. Mutu hanya
        hidup di dalam pencocokan AHSP, tempat yang tak dilihat siapa pun
        saat menyusun pesanan.

        f'c di depan (itu yang dipakai menghitung dan tertulis di lembar
        bertanda tangan), K di kurung (itu yang dipakai memesan).

        Mutu ditaruh SEBELUM kode elemen, bukan sesudahnya: `gabungUsulan`
        membuang TOKEN TERAKHIR untuk melepas kode ("Beton balok B1" ->
        "Beton balok"). Dengan mutu di belakang, yang termakan justru
        "(K-300)" — dan sisanya masih terlihat wajar, jadi cacatnya tak
        berteriak. Ketahuan dari MENJALANKAN rutenya.

        Elemen tanpa mutu beton — baja, kayu — tak mendapat tambahan apa pun.
      */
      uraian: el.jenis === 'kuda_kuda_kayu'
        ? `Konstruksi kayu ${el.kode}`
        : `Beton ${namaElemen(el.jenis)}${imbuhanMutu(el.fcMpa)} ${el.kode}`,
      kuantitas: el.volume.betonM3,
      satuan: 'm3',
      assemblyPola: el.jenis === 'kuda_kuda_kayu'
        ? POLA_KAYU
        : polaBeton(el.fcMpa),
      asal,
      catatan,
    })
  }

  if (el.volume.bekistingM2 > 0) {
    const pola = POLA_BEKISTING[el.jenis] ?? POLA_BEKISTING.balok
    usulan.push({
      jenis: 'bekisting',
      uraian: `Bekisting ${namaElemen(el.jenis)} ${el.kode}`,
      kuantitas: el.volume.bekistingM2,
      satuan: 'm2',
      assemblyPola: pola,
      asal,
      catatan,
    })
  }

  /*
    BESI DIPECAH per baris, bukan dijumlahkan jadi satu angka kilogram.

    Alasannya bukan kerapian: tulangan beton (BjTS/BjTP) dan baja profil punya
    AHSP yang SAMA SEKALI BERBEDA — pembesian dihitung per kg dengan upah
    tukang besi, sementara baja profil butuh pabrikasi, pengelasan, dan crane.
    Menjumlahkannya berarti seluruh baja profil dihargai sebagai tulangan
    beton, dan selisihnya besar.

    Diameter juga dibawa: D16 dan D10 berbeda harganya, dan RAB yang menyebut
    "besi 500 kg" tanpa diameter tak bisa dipesan ke supplier.
  */
  for (const b of el.volume.besi) {
    if (b.totalKg <= 0) continue

    const profil = b.peran.startsWith('profil ')
    /*
      Baja RINGAN dipisahkan dari baja profil berat. Keduanya berperan
      `profil …`, tetapi AHSP-nya berbeda jauh: baja ringan dipasang per
      meter kaso oleh tukang atap, baja profil difabrikasi dan diereksi
      dengan las dan crane.
    */
    const ringan = el.jenis === 'baja_ringan'

    /*
      ══════════════════════════════════════════════════════════════════════
      SATUAN BELI dihitung di sini — RAB memakai kg, RAP memakai BATANG.

      Besi dan baja dijual utuh: lonjor 12 m untuk tulangan, batang 12 m untuk
      profil. RAP yang disusun dengan satuan RAB (kg) selalu lebih kecil
      daripada belanja sesungguhnya, karena tiap potongan menyisakan ujung yang
      tetap terbeli.

      Diukur pada usulan nyata: 132,58 kg D16 = 8 lonjor, yang beratnya 151,7
      kg. Selisih 19 kg (14%) itu bukan pemborosan — itu barang yang memang
      dibeli, dan RAP yang tak memuatnya membuat belanja terlihat membengkak
      padahal rencananya yang kurang.

      ⚠ Modul `satuan-beli.ts` ini SEMPAT ditulis lengkap (25 aturan) lalu
      tak pernah dipanggil sama sekali — field `beli` dideklarasikan di tipe,
      dan selalu `undefined` di jalan. Ketahuan bukan dari test (semuanya
      hijau) melainkan dari MELIHAT layarnya: kolom "Dibeli" berisi "—" pada
      sembilan barisnya. Kode yang tak terpanggil sama dengan kode yang tak
      ada, dengan tambahan biaya perawatan.
      ══════════════════════════════════════════════════════════════════════
    */
    const konv = profil
      ? konversiBajaProfil(b.beratKgPerM, b.totalKg)
      : konversiBesiBeton(b.diameterMm, b.totalKg)

    usulan.push({
      jenis: ringan ? 'baja-ringan' : profil ? 'baja-profil' : 'pembesian',
      /*
        Baja ringan diusulkan per METER, bukan kg.

        AHSP-nya `2.1.1.3` "Pemasangan 1 m Kaso Baja Ringan C75"
        bersatuan m — dan `assemblyCocok` mensyaratkan satuan cocok,
        jadi usulan bersatuan kg tak pernah menemukan pasangannya.

        Ini bukan sekadar konversi: baja ringan memang DIBELI dan DIPASANG per
        batang/meter. Tulangan beton ditimbang karena diameternya bermacam;
        kaso baja ringan dihitung panjangnya karena profilnya seragam.
      */
      uraian: profil
        ? `${b.peran} — ${el.kode}`
        : `Pembesian ${b.tipe} Ø${b.diameterMm} (${b.peran}) — ${el.kode}`,
      kuantitas: ringan
        ? b.jumlahBatang * b.panjangPerBatangM
        : b.totalKg,
      satuan: ringan ? 'm' : 'kg',
      assemblyPola: ringan
        ? POLA_BAJA_RINGAN
        : profil ? POLA_BAJA_PROFIL : POLA_PEMBESIAN,
      asal,
      catatan,
      beli: {
        kuantitas: konv.kuantitasBeli,
        satuan: konv.satuanBeli,
        ukuranPerSatuan: `${formatKg(konv.isiPerSatuan)} kg per ${konv.satuanBeli}`,
        asumsi: konv.asumsi,
        terpasangKg: b.totalKg,
      },
    })
  }

  return usulan
}

/**
 * Gabungkan usulan dari banyak elemen.
 *
 * DIGABUNG per (jenis pekerjaan, satuan, pola assembly, uraian dasar) — bukan
 * per elemen. Satu proyek dengan 40 balok tak boleh menghasilkan 40 baris
 * "beton balok" di RAB: yang dibeli beton, sekali, sejumlah totalnya.
 *
 * Yang TETAP terpisah: diameter besi yang berbeda, dan profil baja yang
 * berbeda. Keduanya barang berbeda yang dipesan terpisah.
 *
 * `asal` dikumpulkan jadi daftar supaya angka gabungan tetap bisa ditelusuri
 * balik ke elemen penyusunnya — tanpa itu, RAB berisi angka yang tak bisa
 * ditanya "dari mana?".
 */
export interface UsulanGabungan {
  jenis: JenisPekerjaan
  uraian: string
  kuantitas: number
  satuan: SatuanUsulan
  assemblyPola: string[]
  /** Elemen penyusunnya — supaya angkanya bisa ditelusuri. */
  asal: { kodeElemen: string; jenisElemen: string }[]
  catatan: string[]
  /** Satuan pembelian untuk RAP — lihat `UsulanItemRab.beli`. */
  beli?: {
    kuantitas: number
    /*
      Tipe kanoniknya diambil dari `satuan-beli.ts`, bukan ditulis ulang.
      Versi sebelumnya menulis `'btg' | 'lbr'` dan langsung tak cocok begitu
      konversinya benar-benar dipanggil — modul itu juga mengenal `rol`, `zak`,
      dan lainnya. Dua daftar yang harus sama, disimpan di dua tempat.
    */
    satuan: SatuanBeli
    ukuranPerSatuan: string
    asumsi: string
    terpasangKg: number
  }
}

/** Angka kg ringkas untuk label — dua desimal, koma sebagai pemisah. */
function formatKg(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

export function gabungUsulan(usulan: UsulanItemRab[]): UsulanGabungan[] {
  const peta = new Map<string, UsulanGabungan>()

  for (const u of usulan) {
    /*
      Kunci penggabungan menyertakan URAIAN TANPA kode elemen.

      "Beton balok B1" dan "Beton balok B2" harus tergabung; "Pembesian BjTS
      Ø16" dan "Pembesian BjTS Ø10" TIDAK boleh — keduanya barang berbeda.
      Karena itu yang dibuang dari kunci cuma bagian setelah tanda pisah.
    */
    const uraianDasar = u.uraian.split(' — ')[0].replace(/\s+\S+$/, (s) =>
      // Buang kode elemen di akhir untuk beton/bekisting ("Beton balok B1").
      (u.jenis === 'beton' || u.jenis === 'bekisting') ? '' : s)
    const kunci = `${u.jenis}|${u.satuan}|${uraianDasar}|${u.assemblyPola[0]}`

    const ada = peta.get(kunci)
    if (ada) {
      ada.kuantitas += u.kuantitas
      ada.asal.push(u.asal)
      for (const c of u.catatan) if (!ada.catatan.includes(c)) ada.catatan.push(c)
    } else {
      peta.set(kunci, {
        jenis: u.jenis,
        uraian: uraianDasar.trim(),
        kuantitas: u.kuantitas,
        satuan: u.satuan,
        assemblyPola: u.assemblyPola,
        asal: [u.asal],
        catatan: [...u.catatan],
        beli: u.beli,
      })
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    SATUAN BELI DIHITUNG ULANG dari kuantitas GABUNGAN — bukan dijumlahkan.

    Menjumlahkan hasil pembulatan tiap elemen memesan jauh lebih banyak
    daripada yang dibutuhkan. Contoh nyata dari data di layar:

        B1  24,2 kg Ø8  →  1 lonjor
        B2  24,2 kg Ø8  →  1 lonjor
        dijumlahkan        2 lonjor  (2 × 4,74 kg/lonjor = 9,5 kg… salah arah)

    Yang benar: 48,4 kg digabung DULU, baru dibagi isi per lonjor. Sisa
    potongan dari batang yang sama dipakai untuk elemen berikutnya — itulah
    cara besi dipotong di lapangan.

    ⚠ `beli` sempat hilang seluruhnya di sini: `usulanDariElemen` mengisinya
    dengan benar (dan test-nya hijau), tetapi fungsi ini membangun objek baru
    tanpa menyalin field itu. Kolom "Dibeli" di layar berisi "—" pada sembilan
    barisnya sementara 32 test tetap hijau — karena semua test menguji
    `usulanDariElemen`, tak satu pun menguji jalur yang benar-benar dipakai
    endpoint.
    ══════════════════════════════════════════════════════════════════════════
  */
  for (const g of peta.values()) {
    if (!g.beli) continue
    const isiPerSatuan = g.beli.terpasangKg > 0 && g.beli.kuantitas > 0
      ? g.beli.terpasangKg / g.beli.kuantitas
      : 0
    if (isiPerSatuan <= 0) { g.beli = undefined; continue }
    g.beli = {
      kuantitas: Math.ceil(g.kuantitas / isiPerSatuan),
      satuan: g.beli.satuan,
      ukuranPerSatuan: g.beli.ukuranPerSatuan,
      asumsi: g.beli.asumsi,
      terpasangKg: g.kuantitas,
    }
  }

  // Urut: beton → bekisting → pembesian → baja, mengikuti urutan pengerjaan
  // di lapangan. RAB yang urutannya acak sulit diperiksa orang.
  const urutan: Record<JenisPekerjaan, number> = {
    beton: 1, bekisting: 2, pembesian: 3, 'baja-profil': 4,
    /* Rangka atap dikerjakan terakhir — mengikuti urutan lapangan. */
    kayu: 5, 'baja-ringan': 6,
  }
  return [...peta.values()].sort(
    (a, b) => urutan[a.jenis] - urutan[b.jenis] || a.uraian.localeCompare(b.uraian),
  )
}

/** Nama jenis elemen dalam bahasa lapangan. */
function namaElemen(jenis: string): string {
  const nama: Record<string, string> = {
    balok: 'balok', kolom: 'kolom', kolom_bulat: 'kolom bulat',
    plat: 'pelat lantai', footplat: 'pondasi footplat',
    pilecap: 'pilecap', tiang: 'tiang pancang',
    balok_baja: 'balok baja', kolom_baja: 'kolom baja',
  }
  return nama[jenis] ?? jenis
}

/**
 * Apakah NAMA assembly cocok dengan satu POLA pencarian?
 *
 * Ditaruh di lib, bukan di rute, supaya bisa diuji TANPA basis. Kedua cacat
 * di bawah ditemukan dengan MENJALANKAN endpoint sementara test tetap hijau —
 * dan itu tanda bahwa fungsinya berada di tempat yang salah.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * DUA BENTUK POLA, karena satu bentuk saja salah di salah satu sisi.
 *
 * ── Daftar KATA (bawaan): semua katanya harus ada, urutan bebas.
 *
 * Nama assembly di basis ini tak seragam. Contoh nyata yang membongkarnya:
 *
 *     "1 KG TULANGAN  BETON  DENGAN BESI POLOS / ULIR  (SNI.2013)"
 *                   ^^      ^^                        ^^
 *
 * Spasi ganda, huruf besar semua, tanda baca, dan sisipan kata. Pencocokan
 * frasa utuh memulangkan NOL untuk baris itu — padahal itu justru AHSP yang
 * dicari. Bentuk kata-lepas tahan terhadap semuanya, dan tetap cukup ketat:
 * "bekisting balok" tak cocok dengan "bekisting kolom".
 *
 * ── FRASA (awalan `~`): harus muncul berurutan dan utuh.
 *
 * Kata-lepas gagal justru pada ANGKA, dan gagalnya senyap. Setiap nama AHSP
 * beton mengandung `slump (100 ± 25) mm`, jadi pola `beton 25 mpa` menemukan
 * angka `25` pada SLUMP-nya dan memilih AHSP mutu yang salah:
 *
 *     balok f'c 25 MPa  →  "beton mutu rendah f'c 7,5 MPa"   ← harga separuh
 *
 * RAB-nya terlihat wajar karena angkanya memang angka beton. Frasa `~f'c 25
 * mpa` hanya cocok pada penyebutan mutu.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function assemblyCocok(nama: string, pola: string): boolean {
  /*
    Nama AHSP dinormalkan lebih dulu: spasi ganda dirapatkan (nama sungguhan
    berbunyi `TULANGAN  BETON  DENGAN`) dan apostrof lengkung disamakan
    dengan apostrof lurus (`f'c` vs `f'c`) — dua hal yang membuat versi
    sebelumnya gagal mencocokkan baris yang jelas-jelas benar.
  */
  const n = nama.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ')

  /*
    Awalan `~` menandai pola FRASA — harus muncul berurutan dan utuh.

    Dipakai untuk angka yang bermakna hanya bersama kata sebelumnya, seperti
    mutu beton. Tanpa ini, pola kata-lepas `beton 25 mpa` mencocokkan angka
    `25` pada `slump (100 +- 25) mm` dan memilih AHSP mutu yang SALAH tanpa
    satu pun galat.
  */
  if (pola.startsWith('~')) {
    return n.includes(pola.slice(1).toLowerCase().replace(/\s+/g, ' '))
  }

  /*
    Selain itu: daftar KATA yang semuanya harus ada, dalam urutan bebas.
    Bentuk ini tahan terhadap spasi ganda, tanda baca, dan urutan kata.
  */
  return pola.toLowerCase().split(/\s+/).filter(Boolean).every((kata) => n.includes(kata))
}
