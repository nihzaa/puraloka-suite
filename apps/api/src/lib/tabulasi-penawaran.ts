// F5 PEMBEDA — Perbandingan penawaran vendor (bid tabulation).
//
// ── Kenapa modul ini ada
//
// Diukur pada data nyata (2026-08-06): material yang SAMA dibeli dari
// beberapa supplier dengan harga berbeda, tanpa satu pun jejak kenapa yang
// mahal dipilih.
//
//   Besi Beton Ø12mm SNI   3 supplier   Rp100.000 .. Rp120.000   (+20%)
//   Pasir Pasang           2 supplier   Rp185.000 .. Rp195.000
//   Besi Beton Ø10mm SNI   3 supplier   Rp 80.000 .. Rp 85.000
//
// Saat auditor bertanya "kenapa vendor ini", tak ada yang bisa dijawab
// selain ingatan orang.
//
// ── Kenapa fungsi MURNI dan ber-test
//
// Angka yang keluar dari sini MEMILIH VENDOR. "Termurah" yang salah hitung
// mengarahkan uang perusahaan ke tempat yang keliru, dan tak satu pun jalur
// salahnya akan melempar error — semuanya menghasilkan tabel yang rapi.

/** Konversi aman: NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface BarisPenawaran {
  supplier_id: string
  supplier_name?: string
  material_id: string
  material_name?: string
  unit?: string | null
  qty: number | string
  harga_satuan: number | string
  /**
   * Vendor menyatakan TIDAK menawarkan item ini.
   *
   * Dibedakan dari harga 0 dengan sengaja: 0 akan memenangkan perbandingan
   * sebagai "termurah", padahal artinya vendor itu tak menawarkan apa pun.
   */
  tidak_menawar?: boolean | null
  waktu_kirim_hari?: number | null
}

export interface SelPerbandingan {
  supplier_id: string
  supplier_name: string
  /** null bila vendor tak menawar item ini. */
  harga_satuan: number | null
  /** `harga_satuan × qty`. null bila tak menawar. */
  total: number | null
  /** Harga satuan ini yang paling murah di antara yang MENAWAR. */
  termurah: boolean
  /**
   * Selisih terhadap yang termurah, dalam persen. 0 untuk yang termurah,
   * null bila tak menawar atau pembandingnya tak ada.
   */
  selisih_pct: number | null
  waktu_kirim_hari: number | null
}

export interface BarisTabulasi {
  material_id: string
  material_name: string
  unit: string | null
  qty: number
  sel: SelPerbandingan[]
  /** null bila TAK SATU PUN vendor menawar material ini. */
  harga_termurah: number | null
  /**
   * Rentang harga antar vendor yang menawar, dalam persen terhadap termurah.
   * null bila kurang dari dua vendor menawar — tak ada yang bisa dibandingkan.
   */
  rentang_pct: number | null
}

export interface RingkasanVendor {
  supplier_id: string
  supplier_name: string
  /** Berapa material yang ia tawar dari seluruh yang diminta. */
  jumlah_ditawar: number
  /** Berapa material yang ia menangi (harga terendah). */
  jumlah_termurah: number
  /**
   * Total nilai penawarannya untuk material yang IA TAWAR saja.
   *
   * ⚠️ Angka ini TIDAK sebanding antar vendor kalau mereka menawar item yang
   * berbeda — vendor yang hanya menawar satu item murah akan tampak "paling
   * murah total". Karena itu `lengkap` ikut dinyatakan.
   */
  total_penawaran: number
  /** Vendor menawar SELURUH material yang diminta. */
  lengkap: boolean
}

export interface HasilTabulasi {
  baris: BarisTabulasi[]
  vendor: RingkasanVendor[]
  /**
   * Total belanja bila tiap material diambil dari vendor termurahnya
   * masing-masing. Ini yang jadi pembanding "berapa yang bisa dihemat".
   */
  total_termurah_gabungan: number
  /** Jumlah material yang tak satu pun vendor menawar. */
  jumlah_tanpa_penawaran: number
}

/**
 * Susun tabulasi perbandingan dari daftar penawaran mentah.
 *
 * INVARIANT yang diuji:
 *  - string NUMERIC dibandingkan sebagai ANGKA, bukan sebagai teks
 *    ("100000" > "99000" benar sebagai angka, SALAH sebagai teks)
 *  - `tidak_menawar` tak pernah menang sebagai "termurah"
 *  - harga 0 dari vendor yang MENAWAR tetap dianggap penawaran sah
 *  - vendor yang tak menawar semua item ditandai `lengkap: false`
 *  - material tanpa satu pun penawaran tetap muncul, dengan harga null
 */
export function susunTabulasi(penawaran: BarisPenawaran[]): HasilTabulasi {
  type AkumMaterial = {
    material_id: string
    material_name: string
    unit: string | null
    qty: number
    sel: Map<string, SelPerbandingan>
  }

  const perMaterial = new Map<string, AkumMaterial>()
  const namaVendor = new Map<string, string>()
  const semuaVendor = new Set<string>()

  for (const p of penawaran) {
    semuaVendor.add(p.supplier_id)
    if (p.supplier_name) namaVendor.set(p.supplier_id, p.supplier_name)

    let m = perMaterial.get(p.material_id)
    if (!m) {
      m = {
        material_id: p.material_id,
        material_name: p.material_name ?? '—',
        unit: p.unit ?? null,
        qty: angka(p.qty),
        sel: new Map(),
      }
      perMaterial.set(p.material_id, m)
    }
    if (p.material_name) m.material_name = p.material_name
    if (p.unit !== undefined) m.unit = p.unit ?? null
    // Qty diminta sama untuk semua vendor dalam satu RFQ; ambil yang terbesar
    // supaya salah-ketik pada satu baris tak mengecilkan total seluruhnya.
    m.qty = Math.max(m.qty, angka(p.qty))

    const menawar = !p.tidak_menawar
    const harga = menawar ? angka(p.harga_satuan) : null

    m.sel.set(p.supplier_id, {
      supplier_id: p.supplier_id,
      supplier_name: p.supplier_name ?? p.supplier_id,
      harga_satuan: harga,
      total: harga == null ? null : harga * m.qty,
      termurah: false,
      selisih_pct: null,
      waktu_kirim_hari: p.waktu_kirim_hari ?? null,
    })
  }

  const daftarVendor = [...semuaVendor]

  const baris: BarisTabulasi[] = [...perMaterial.values()].map((m) => {
    // Vendor yang tak mengirim baris sama sekali untuk material ini tetap
    // muncul sebagai kolom kosong — kalau tidak, tabelnya berlubang dan
    // pembaca tak bisa tahu apakah vendor itu mahal atau sekadar diam.
    for (const sid of daftarVendor) {
      if (!m.sel.has(sid)) {
        m.sel.set(sid, {
          supplier_id: sid,
          supplier_name: namaVendor.get(sid) ?? sid,
          harga_satuan: null,
          total: null,
          termurah: false,
          selisih_pct: null,
          waktu_kirim_hari: null,
        })
      }
    }

    const sel = daftarVendor.map((sid) => m.sel.get(sid)!)
    const menawar = sel.filter((s) => s.harga_satuan != null)

    const harga_termurah = menawar.length > 0
      ? Math.min(...menawar.map((s) => s.harga_satuan!))
      : null

    if (harga_termurah != null) {
      for (const s of menawar) {
        s.termurah = s.harga_satuan === harga_termurah
        // Pembagian hanya bila termurah > 0. Kalau termurah 0 (penawaran sah
        // bernilai nol — mis. barang bonus), persentase selisihnya tak
        // terdefinisi dan Infinity akan mengalir ke layar sebagai teks aneh.
        s.selisih_pct = harga_termurah > 0
          ? ((s.harga_satuan! - harga_termurah) / harga_termurah) * 100
          : null
      }
    }

    const termahal = menawar.length > 0
      ? Math.max(...menawar.map((s) => s.harga_satuan!))
      : null

    return {
      material_id: m.material_id,
      material_name: m.material_name,
      unit: m.unit,
      qty: m.qty,
      sel,
      harga_termurah,
      // Butuh MINIMAL DUA penawar. Satu vendor tak punya pembanding, dan
      // "rentang 0%" akan terbaca sebagai "harganya seragam" padahal yang
      // benar adalah "tak ada yang bisa dibandingkan".
      rentang_pct:
        menawar.length >= 2 && harga_termurah != null && harga_termurah > 0 && termahal != null
          ? ((termahal - harga_termurah) / harga_termurah) * 100
          : null,
    }
  })

  // Yang selisihnya paling lebar lebih dulu — di situ uang paling banyak
  // bisa salah arah. Material tanpa penawaran ditaruh setelahnya: ia perlu
  // dilihat, tapi bukan keputusan harga.
  baris.sort((a, b) => {
    const av = a.rentang_pct ?? -1
    const bv = b.rentang_pct ?? -1
    return bv - av || a.material_name.localeCompare(b.material_name, 'id')
  })

  const vendor: RingkasanVendor[] = daftarVendor.map((sid) => {
    const selVendor = baris.map((b) => b.sel.find((s) => s.supplier_id === sid)!)
    const ditawar = selVendor.filter((s) => s.harga_satuan != null)
    return {
      supplier_id: sid,
      supplier_name: namaVendor.get(sid) ?? sid,
      jumlah_ditawar: ditawar.length,
      jumlah_termurah: selVendor.filter((s) => s.termurah).length,
      total_penawaran: ditawar.reduce((s, x) => s + (x.total ?? 0), 0),
      lengkap: ditawar.length === baris.length && baris.length > 0,
    }
  })

  vendor.sort((a, b) => b.jumlah_termurah - a.jumlah_termurah || a.supplier_name.localeCompare(b.supplier_name, 'id'))

  return {
    baris,
    vendor,
    total_termurah_gabungan: baris.reduce(
      (s, b) => s + (b.harga_termurah == null ? 0 : b.harga_termurah * b.qty), 0),
    jumlah_tanpa_penawaran: baris.filter((b) => b.harga_termurah == null).length,
  }
}
