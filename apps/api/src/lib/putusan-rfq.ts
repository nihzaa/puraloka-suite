// F5 PEMBEDA — Memutuskan pemenang RFQ dan menyusun PO dari penawarannya.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `tabulasi-penawaran.ts` menjawab "siapa yang termurah". Modul ini menjawab
// pertanyaan yang berbeda dan lebih berbahaya: **"boleh tidak vendor ini
// dimenangkan, dan apa yang harus dicatat kalau boleh"**.
//
// Diukur 2026-08-08, sebelum modul ini ada: migrasi 195 sudah menyediakan
// `rfq.po_id` dan `rfq.alasan_pilih`, dan `rfq.ts` sudah **membaca** keduanya
// di dua endpoint — tapi tak ada satu baris pun yang **menulisnya**. Status
// `selesai` ada di CHECK constraint dan tak pernah tercapai. Halaman RFQ
// menutup dirinya dengan kalimat *"Yang penting keputusannya tercatat —
// termasuk saat yang lebih mahal sengaja dipilih"*: janji yang tak punya
// tombol.
//
// Komentar di migrasi 195 sudah menyatakan aturannya sejak awal:
//
//   > `alasan_pilih` — WAJIB diisi lewat aplikasi saat vendor termurah TIDAK
//   > dipilih — dan itulah seluruh gunanya modul ini.
//
// "Lewat aplikasi", bukan lewat basis: di basis ia nullable karena RFQ draft
// belum punya keputusan untuk dijelaskan. Jadi penegakannya HARUS di sini,
// dan harus ber-test — kalau tidak, ia hanya kalimat di dalam file SQL.
//
// ── Kenapa fungsi murni, terpisah dari route
//
// Yang keluar dari sini MENERBITKAN PO: uang perusahaan berpindah ke vendor
// yang ditunjuk angka-angka ini. Tak satu pun jalur salahnya melempar error —
// semuanya menghasilkan PO yang tampak wajar. Satu-satunya cara mengetahuinya
// benar adalah menguji tiap aturannya secara terpisah dari basis.

import type { HasilTabulasi } from './tabulasi-penawaran.js'

/** NUMERIC Postgres tiba sebagai string; null/NaN → 0. */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface ItemPo {
  material_id: string
  qty_ordered: number
  unit: string
  unit_price: number
  /** Nama material — untuk pesan galat yang bisa ditindaklanjuti, bukan untuk DB. */
  material_name: string
}

export interface RencanaPo {
  supplier_id: string
  supplier_name: string
  item: ItemPo[]
  /** Σ qty × harga. Dihitung di sini supaya sama dengan yang masuk PO. */
  total: number
  /**
   * Vendor ini termurah di SELURUH material yang ia menangkan.
   *
   * Kalau `false`, `alasan_pilih` wajib — itu seluruh guna modul RFQ.
   */
  seluruhnya_termurah: boolean
  /**
   * Material yang dimenangkan vendor ini padahal ADA yang lebih murah,
   * beserta selisihnya. Dipakai UI untuk menjelaskan kenapa alasan diminta,
   * dan masuk ke pesan galat kalau alasannya kosong.
   */
  lebih_mahal: Array<{
    material_name: string
    harga_dipilih: number
    harga_termurah: number
    selisih: number
  }>
  /** Σ selisih terhadap harga termurah. 0 bila seluruhnya termurah. */
  selisih_total: number
}

export type HasilPutusan =
  | { ok: true; rencana: RencanaPo }
  | { ok: false; alasan: string }

export interface OpsiPutusan {
  /** Vendor yang dimenangkan. */
  supplier_id: string
  /**
   * Alasan pemilihan, apa adanya dari pemakai.
   *
   * WAJIB (setelah `.trim()`) bila vendor ini tidak termurah di seluruh
   * material yang dimenangkannya.
   */
  alasan?: string | null
  /**
   * Batas panjang alasan yang dianggap sungguh-sungguh.
   *
   * Bukan pagar keamanan — pagar terhadap **alasan basa-basi**. "ok", "yes",
   * "sudah" secara teknis mengisi kolom dan secara praktis tak menjelaskan
   * apa pun kepada auditor yang membacanya setahun kemudian.
   */
  panjangAlasanMinimal?: number
}

const PANJANG_ALASAN_MINIMAL = 10

/**
 * Susun rencana PO dari tabulasi + vendor yang dimenangkan.
 *
 * INVARIAN yang diuji (`__tests__/putusan-rfq.test.ts`):
 *
 *  1. Vendor yang TIDAK MENAWAR satu pun material tak bisa menang — PO
 *     kosong bukan PO, dan `purchase_order_items` kosong membuat GR dan
 *     invoice di belakangnya tak punya apa pun untuk dicocokkan.
 *  2. Material yang vendornya `tidak_menawar` TIDAK masuk PO — bukan masuk
 *     dengan harga 0. Harga 0 mengalir ke `total_price` sebagai potongan
 *     diam-diam, dan ke laporan sebagai material yang "sudah dibeli gratis".
 *  3. Alasan WAJIB bila ada satu saja material yang dimenangkan lebih mahal
 *     daripada penawaran terendah. Ini aturan pokok migrasi 195.
 *  4. Alasan yang terlalu pendek DITOLAK — lihat `panjangAlasanMinimal`.
 *  5. Alasan TIDAK diminta bila vendornya memang termurah di semuanya:
 *     memaksa mengetik alasan untuk keputusan yang sudah benar melatih orang
 *     mengetik apa saja supaya tombolnya menyala.
 *  6. NUMERIC string dihitung sebagai ANGKA, bukan dirangkai sebagai teks.
 */
export function susunPutusan(
  tabulasi: HasilTabulasi,
  opsi: OpsiPutusan,
): HasilPutusan {
  const minimal = opsi.panjangAlasanMinimal ?? PANJANG_ALASAN_MINIMAL

  const vendor = tabulasi.vendor.find((v) => v.supplier_id === opsi.supplier_id)
  if (!vendor) {
    return { ok: false, alasan: 'Vendor itu tidak menawar di RFQ ini' }
  }

  const item: ItemPo[] = []
  const lebih_mahal: RencanaPo['lebih_mahal'] = []

  for (const b of tabulasi.baris) {
    const sel = b.sel.find((s) => s.supplier_id === opsi.supplier_id)

    // INVARIAN 2: `harga_satuan == null` berarti vendor ini tak menawar
    // material ini — entah karena menandai `tidak_menawar`, entah karena tak
    // mengirim barisnya sama sekali. Keduanya sama artinya bagi PO: tak ada
    // yang bisa dipesan, jadi barisnya tak ikut.
    if (!sel || sel.harga_satuan == null) continue

    const harga = angka(sel.harga_satuan)
    const qty = angka(b.qty)
    if (qty <= 0) continue

    item.push({
      material_id: b.material_id,
      material_name: b.material_name,
      qty_ordered: qty,
      unit: b.unit ?? 'unit',
      unit_price: harga,
    })

    // INVARIAN 3. Dibandingkan ke `harga_termurah`, bukan ke `sel.termurah`.
    //
    // Hari ini keduanya SETARA: `susunTabulasi` menandai `termurah: true` pada
    // SETIAP sel yang harganya sama dengan terendah (`tabulasi-penawaran.ts:197`),
    // jadi harga seri tak menuntut alasan lewat jalur mana pun. Diuji dengan
    // mutasi 2026-08-08: menukarnya ke `!sel.termurah` TIDAK memerahkan satu
    // test pun — dan itu jujur, karena perilakunya memang tak berubah.
    //
    // Perbandingan angka tetap dipertahankan karena kesetaraan itu bergantung
    // pada satu baris di modul LAIN. Kalau suatu saat `termurah` diubah jadi
    // "pemenang tunggal" (mis. yang tercepat kirim di antara yang seri), maka
    // `!sel.termurah` diam-diam mulai menuntut alasan dari vendor yang harganya
    // sama dengan terendah — pertanyaan yang tak punya jawaban benar. Di sini
    // syaratnya dinyatakan pada besaran yang benar-benar menentukan: harganya.
    if (b.harga_termurah != null && harga > b.harga_termurah) {
      lebih_mahal.push({
        material_name: b.material_name,
        harga_dipilih: harga,
        harga_termurah: b.harga_termurah,
        selisih: (harga - b.harga_termurah) * qty,
      })
    }
  }

  // INVARIAN 1.
  if (item.length === 0) {
    return {
      ok: false,
      alasan: `${vendor.supplier_name} tidak menawar satu pun material di RFQ ini — tak ada yang bisa dipesan`,
    }
  }

  const seluruhnya_termurah = lebih_mahal.length === 0
  const alasan = (opsi.alasan ?? '').trim()

  if (!seluruhnya_termurah) {
    const contoh = lebih_mahal[0]
    const ekor = lebih_mahal.length > 1 ? ` (dan ${lebih_mahal.length - 1} material lain)` : ''

    // INVARIAN 3 + 4. Pesannya menyebut MATERIAL dan SELISIHNYA, bukan sekadar
    // "alasan wajib" — yang membaca pesan ini sedang memilih vendor yang lebih
    // mahal, dan ia berhak tahu persis di mana lebih mahalnya sebelum menulis.
    if (!alasan) {
      return {
        ok: false,
        alasan:
          `${vendor.supplier_name} bukan yang termurah untuk ${contoh.material_name}${ekor}. ` +
          `Alasan pemilihan wajib diisi — inilah yang dibaca saat seseorang bertanya ` +
          `kenapa yang lebih mahal yang dipilih.`,
      }
    }
    if (alasan.length < minimal) {
      return {
        ok: false,
        alasan:
          `Alasan terlalu pendek (${alasan.length} huruf, minimal ${minimal}). ` +
          `Tulis yang bisa dibaca orang lain setahun lagi — mis. mutu, waktu kirim, ` +
          `atau ketersediaan stok.`,
      }
    }
  }

  return {
    ok: true,
    rencana: {
      supplier_id: vendor.supplier_id,
      supplier_name: vendor.supplier_name,
      item,
      total: item.reduce((s, i) => s + i.qty_ordered * i.unit_price, 0),
      seluruhnya_termurah,
      lebih_mahal,
      selisih_total: lebih_mahal.reduce((s, x) => s + x.selisih, 0),
    },
  }
}
