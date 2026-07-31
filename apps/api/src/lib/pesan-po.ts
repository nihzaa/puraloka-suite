// ROADMAP #12 / Modul 9b — susun pesan PO untuk vendor. Fungsi MURNI, ber-test.
//
// Pesan yang dipakai hari ini (dirakit di UI, `procurement/page.tsx`) hanya
// memuat nomor PO, nama proyek, dan TOTAL. Supplier menerima "Total: Rp 12 juta"
// tanpa tahu apa yang dipesan — jadi ia tetap harus menelepon balik, dan tujuan
// mengirim PO lewat WhatsApp gagal tercapai.
//
// Di sini pesannya memuat rincian item. Disusun di server, bukan di UI: teks
// yang sama dipakai WhatsApp dan email, dan kalau dirakit dua kali di dua
// tempat, keduanya akan berbeda begitu salah satunya disunting.

export interface ItemPo {
  nama: string
  qty: number | string | null
  unit?: string | null
  harga_satuan?: number | string | null
}

export interface DataPesanPo {
  po_number: string
  nama_proyek?: string | null
  nama_supplier?: string | null
  kontak_person?: string | null
  tanggal_kirim?: string | null
  alamat_kirim?: string | null
  syarat_bayar?: string | null
  catatan?: string | null
  items: ItemPo[]
  total: number | string | null
  nama_perusahaan?: string | null
}

function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Rupiah tanpa desimal — format yang lazim dibaca di WhatsApp. */
export function rupiah(v: number | string | null | undefined): string {
  return `Rp ${Math.round(angka(v)).toLocaleString('id-ID')}`
}

/** Kuantitas: buang nol desimal yang tak bermakna (2.000 → 2; 2.500 → 2,5). */
function qty(v: number | string | null | undefined): string {
  const n = angka(v)
  return Number.isInteger(n) ? String(n) : n.toLocaleString('id-ID')
}

/**
 * Susun teks pesan PO.
 *
 * `*tebal*` adalah markup WhatsApp. Di email ia tampil sebagai tanda bintang
 * biasa — tidak merusak keterbacaan, dan menyatukan satu sumber teks jauh lebih
 * berharga daripada dua varian yang bisa saling menyimpang.
 *
 * INVARIANT yang diuji:
 *  - nomor PO SELALU muncul (tanpa itu supplier tak bisa merujuk balik)
 *  - setiap item muncul satu baris; nol item tetap menghasilkan pesan yang sah
 *  - total ditulis apa adanya dari data, tidak dihitung ulang dari item —
 *    perbedaan angka di pesan vs sistem adalah sengketa dengan supplier
 *  - field kosong DILEWATI, tidak mencetak "null" atau baris kosong
 */
export function susunPesanPo(d: DataPesanPo): string {
  const baris: string[] = []

  const sapaan = d.kontak_person?.trim() || d.nama_supplier?.trim()
  baris.push(sapaan ? `Halo ${sapaan},` : 'Halo,')
  baris.push('')
  baris.push(`Berikut Purchase Order dari ${d.nama_perusahaan?.trim() || 'kami'}:`)
  baris.push('')
  baris.push(`*${d.po_number}*`)
  if (d.nama_proyek?.trim()) baris.push(`Proyek: ${d.nama_proyek.trim()}`)
  if (d.tanggal_kirim?.trim()) baris.push(`Diharapkan tiba: ${d.tanggal_kirim.trim()}`)
  if (d.alamat_kirim?.trim()) baris.push(`Alamat kirim: ${d.alamat_kirim.trim()}`)

  if (d.items.length) {
    baris.push('')
    baris.push('*Rincian:*')
    d.items.forEach((it, i) => {
      const satuan = it.unit?.trim() ? ` ${it.unit.trim()}` : ''
      const harga = angka(it.harga_satuan) > 0 ? ` @ ${rupiah(it.harga_satuan)}` : ''
      baris.push(`${i + 1}. ${it.nama} — ${qty(it.qty)}${satuan}${harga}`)
    })
  }

  baris.push('')
  baris.push(`*Total: ${rupiah(d.total)}*`)
  if (d.syarat_bayar?.trim()) baris.push(`Pembayaran: ${d.syarat_bayar.trim()}`)
  if (d.catatan?.trim()) {
    baris.push('')
    baris.push(`Catatan: ${d.catatan.trim()}`)
  }

  baris.push('')
  baris.push('Mohon konfirmasi ketersediaan dan waktu pengiriman. Terima kasih.')

  return baris.join('\n')
}

/**
 * Normalisasi nomor telepon Indonesia ke format wa.me (62…).
 *
 * Mengembalikan null kalau nomornya tak bisa dipakai — pemanggil WAJIB
 * menanganinya, bukan menerima tautan rusak yang membuka WhatsApp ke nomor
 * ngawur.
 */
export function nomorWa(telepon: string | null | undefined): string | null {
  if (!telepon) return null
  let n = telepon.replace(/\D/g, '')
  if (!n) return null

  if (n.startsWith('62')) {
    // sudah berformat internasional
  } else if (n.startsWith('0')) {
    n = '62' + n.slice(1)
  } else if (n.startsWith('8')) {
    // Ditulis tanpa 0 di depan — lazim saat disalin dari kartu nama.
    n = '62' + n
  } else {
    return null
  }

  // 62 + 9..13 digit. Di luar itu hampir pasti salah ketik, dan tautan ke nomor
  // yang salah lebih buruk daripada tombol yang tak muncul.
  return n.length >= 11 && n.length <= 15 ? n : null
}

/** Tautan wa.me lengkap, atau null kalau nomornya tak sah. */
export function tautanWa(telepon: string | null | undefined, pesan: string): string | null {
  const n = nomorWa(telepon)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(pesan)}` : null
}
