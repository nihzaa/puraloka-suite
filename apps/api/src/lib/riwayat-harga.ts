// F5 PEMBEDA — Riwayat harga material: bagaimana harga bergerak sepanjang waktu.
//
// ── Kenapa modul ini ada, dan kenapa BUKAN "Eskalasi Harga"
//
// Triase menamainya "Eskalasi harga" — kenaikan harga material terhadap
// kontrak lama. Diukur pada data nyata (2026-08-06), arahnya justru
// KEBALIKANNYA:
//
//   Besi Beton Ø12mm SNI
//      17 Mar 2026   120.000   jangkar
//      10 Mei 2026   120.000    0,0%
//      04 Agu 2026   100.000   −16,7%    ← TURUN
//
// Saya sempat melaporkan material ini "+20%" — karena menghitung `max − min`
// tanpa memperhatikan urutan waktu. Rentangnya memang 20%, tapi arahnya
// terbalik dari yang saya klaim.
//
// Modul ini karena itu NETRAL TERHADAP ARAH: ia menampilkan naik dan turun
// apa adanya. Layar yang bernama "eskalasi" akan menjanjikan kenaikan, dan
// pembacanya menyimpulkan kenaikan bahkan saat angkanya turun.
//
// ── Kenapa VENDOR dipisahkan dari WAKTU
//
// `Pasir Pasang` punya dua harga — 185.000 dan 195.000 — di TANGGAL YANG
// SAMA, dari dua supplier berbeda. Menghitungnya sebagai "naik 5,4%" adalah
// salah baca: itu rentang antar-vendor, urusan RFQ, bukan pergerakan harga.
//
// Karena itu pergerakan waktu dihitung dari HARGA TERBAIK per tanggal, dan
// sebaran antar-vendor dilaporkan terpisah.
//
// ── Kenapa jangkarnya PEMBELIAN PERTAMA, bukan `materials.unit_price`
//
// `materials.unit_price` adalah harga TERKINI, bukan acuan kontrak — ia
// ditimpa setiap kali harga master diperbarui. Diukur: Besi Ø12mm acuan
// 120.000 dan tertinggi-dibeli 120.000 → "0% naik", padahal riwayatnya jelas
// bergerak. Layar yang memakainya akan selamanya melaporkan "aman".

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface BarisPembelian {
  material_id: string
  material_name?: string
  unit?: string | null
  /** Tanggal PO. ISO `YYYY-MM-DD` atau Date. */
  tanggal: string | Date
  unit_price: number | string
  supplier_id?: string | null
  supplier_name?: string | null
  qty?: number | string | null
}

export interface TitikHarga {
  tanggal: string
  /** Harga TERBAIK (termurah) pada tanggal ini — lihat catatan vendor di kepala. */
  harga: number
  /** Berapa vendor menawarkan harga pada tanggal ini. */
  jumlah_vendor: number
  /** Sebaran antar-vendor pada tanggal yang SAMA, dalam persen. null bila satu vendor. */
  sebaran_vendor_pct: number | null
  /** Nama vendor dengan harga terbaik pada tanggal ini. */
  vendor_terbaik: string | null
  /** Perubahan terhadap titik PERTAMA, dalam persen. 0 pada titik pertama. */
  perubahan_pct: number
}

export interface RiwayatMaterial {
  material_id: string
  material_name: string
  unit: string | null
  titik: TitikHarga[]
  harga_awal: number
  harga_akhir: number
  /**
   * `(akhir − awal) / awal × 100`. POSITIF berarti naik, NEGATIF berarti
   * turun — keduanya sah dan keduanya ditampilkan.
   */
  perubahan_pct: number
  /** Selisih hari antara pembelian pertama dan terakhir. */
  rentang_hari: number
  /**
   * Cukup titik untuk menyebutnya sebuah TREN?
   *
   * Satu titik bukan tren — ia satu harga. Dua titik pun rapuh: satu
   * pembelian borongan yang kebetulan murah akan terbaca sebagai "harga
   * turun". Dinyatakan supaya pembaca tahu seberapa jauh angkanya bisa
   * dipercaya, bukan disembunyikan di balik persentase yang terlihat pasti.
   */
  cukup_untuk_tren: boolean
}

export interface HasilRiwayatHarga {
  material: RiwayatMaterial[]
  /** Material yang harganya NAIK (perubahan > 0) dan punya cukup titik. */
  jumlah_naik: number
  /** Material yang harganya TURUN. */
  jumlah_turun: number
  /** Material dengan hanya satu tanggal beli — belum bisa dilihat pergerakannya. */
  jumlah_satu_titik: number
  /**
   * Material yang punya sebaran antar-vendor pada tanggal yang sama.
   * Ini urusan RFQ, BUKAN pergerakan harga — dinyatakan supaya tak tertukar.
   */
  jumlah_beda_vendor: number
}

/** Ambang minimal titik untuk disebut tren. Tiga, bukan dua — lihat `cukup_untuk_tren`. */
export const MIN_TITIK_TREN = 3

const keTanggal = (v: string | Date): string =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10)

/**
 * Susun riwayat harga per material dari daftar pembelian mentah.
 *
 * INVARIANT yang diuji:
 *  - string NUMERIC dibandingkan sebagai ANGKA, bukan teks
 *  - urutan mengikuti TANGGAL, bukan urutan baris dari basis
 *  - beda harga pada tanggal SAMA = sebaran vendor, BUKAN perubahan waktu
 *  - penurunan harga dilaporkan sebagai negatif, tidak disembunyikan
 *  - satu titik tidak pernah menghasilkan persentase perubahan
 */
export function susunRiwayatHarga(pembelian: BarisPembelian[]): HasilRiwayatHarga {
  type Akum = {
    material_id: string
    material_name: string
    unit: string | null
    perTanggal: Map<string, { harga: number[]; vendor: Map<string, number> }>
  }

  const peta = new Map<string, Akum>()

  for (const p of pembelian) {
    let m = peta.get(p.material_id)
    if (!m) {
      m = {
        material_id: p.material_id,
        material_name: p.material_name ?? '—',
        unit: p.unit ?? null,
        perTanggal: new Map(),
      }
      peta.set(p.material_id, m)
    }
    if (p.material_name) m.material_name = p.material_name
    if (p.unit !== undefined) m.unit = p.unit ?? null

    const tgl = keTanggal(p.tanggal)
    let t = m.perTanggal.get(tgl)
    if (!t) { t = { harga: [], vendor: new Map() }; m.perTanggal.set(tgl, t) }

    const harga = angka(p.unit_price)
    t.harga.push(harga)
    const nama = p.supplier_name ?? p.supplier_id ?? '—'
    // Satu vendor bisa punya beberapa baris pada tanggal sama; ambil termurah
    // supaya ia tak terhitung sebagai dua vendor berbeda.
    const lama = t.vendor.get(nama)
    if (lama === undefined || harga < lama) t.vendor.set(nama, harga)
  }

  const material: RiwayatMaterial[] = [...peta.values()].map((m) => {
    // URUT TANGGAL, bukan urutan baris dari basis. Inilah yang salah pada
    // pembacaan pertama saya: `max − min` tanpa urutan menyembunyikan arah.
    const tanggalUrut = [...m.perTanggal.keys()].sort()

    const titikMentah = tanggalUrut.map((tgl) => {
      const t = m.perTanggal.get(tgl)!
      const hargaVendor = [...t.vendor.entries()]
      const terbaik = hargaVendor.reduce((a, b) => (b[1] < a[1] ? b : a))
      const termurah = terbaik[1]
      const termahal = Math.max(...hargaVendor.map(([, h]) => h))
      return {
        tanggal: tgl,
        harga: termurah,
        jumlah_vendor: t.vendor.size,
        // Sebaran antar-vendor pada tanggal SAMA. Ini BUKAN perubahan harga —
        // ia perbandingan penawaran, dan mencampurnya membuat "naik 5,4%"
        // dilaporkan untuk dua supplier di hari yang sama.
        sebaran_vendor_pct:
          t.vendor.size >= 2 && termurah > 0 ? ((termahal - termurah) / termurah) * 100 : null,
        vendor_terbaik: terbaik[0],
        perubahan_pct: 0,
      }
    })

    const awal = titikMentah[0]?.harga ?? 0
    const akhir = titikMentah[titikMentah.length - 1]?.harga ?? 0

    const titik: TitikHarga[] = titikMentah.map((t) => ({
      ...t,
      // Pembagian hanya bila jangkarnya > 0 — jangkar nol membuat Infinity
      // mengalir ke layar sebagai teks yang tak berarti.
      perubahan_pct: awal > 0 ? ((t.harga - awal) / awal) * 100 : 0,
    }))

    const hari = titik.length >= 2
      ? Math.round(
          (new Date(titik[titik.length - 1].tanggal).getTime() -
            new Date(titik[0].tanggal).getTime()) / 86_400_000)
      : 0

    return {
      material_id: m.material_id,
      material_name: m.material_name,
      unit: m.unit,
      titik,
      harga_awal: awal,
      harga_akhir: akhir,
      // Satu titik TIDAK menghasilkan persentase: tak ada yang bisa
      // dibandingkan, dan "0%" akan terbaca sebagai "harganya stabil".
      //
      // Diuji-mutasi 2026-08-06: membuang `titik.length >= 2` di sini adalah
      // MUTAN SETARA — dengan satu titik `awal === akhir`, jadi rumusnya
      // menghasilkan tepat 0 dengan atau tanpa syarat itu (dibuktikan untuk
      // harga 0, 1, dan 999.000). Tak ada test yang bisa menangkapnya, dan
      // ketiadaan testnya BUKAN lubang.
      //
      // Syaratnya tetap ditulis: ia menyatakan maksud ("satu titik bukan
      // perubahan") di tempat pembaca berikutnya membutuhkannya. Yang benar-
      // benar menjaga pembacanya adalah `jumlah_satu_titik` dan
      // `cukup_untuk_tren` — keduanya ada testnya dan keduanya tertangkap
      // saat dimutasi.
      perubahan_pct: titik.length >= 2 && awal > 0 ? ((akhir - awal) / awal) * 100 : 0,
      rentang_hari: hari,
      cukup_untuk_tren: titik.length >= MIN_TITIK_TREN,
    }
  })

  // Yang pergerakannya paling besar lebih dulu — ke ARAH MANA PUN. Mengurut
  // hanya menurut kenaikan akan mengubur penurunan tajam, padahal penurunan
  // 30% juga kabar penting (kualitas turun? vendor baru? salah input?).
  material.sort((a, b) =>
    Math.abs(b.perubahan_pct) - Math.abs(a.perubahan_pct) ||
    a.material_name.localeCompare(b.material_name, 'id'))

  return {
    material,
    jumlah_naik: material.filter((m) => m.titik.length >= 2 && m.perubahan_pct > 0).length,
    jumlah_turun: material.filter((m) => m.titik.length >= 2 && m.perubahan_pct < 0).length,
    jumlah_satu_titik: material.filter((m) => m.titik.length < 2).length,
    jumlah_beda_vendor: material.filter((m) =>
      m.titik.some((t) => t.sebaran_vendor_pct != null && t.sebaran_vendor_pct > 0)).length,
  }
}
