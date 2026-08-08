/**
 * TUJUAN GRUP — ke mana klik pada baris menu induk harus membawa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MASALAHNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-09: *"klik menu itu harusnya bisa sekaligus link halaman dan
 * expand, ngga dipisah"*.
 *
 * Sebelum ini, baris induk hanya membuka/menutup. `/keuangan` sudah lama punya
 * halamannya, tetapi satu-satunya cara ke sana adalah membuka grupnya lalu
 * mengklik anak bernama "Ringkasan Keuangan" — dua klik untuk halaman yang
 * seharusnya satu.
 *
 * ── Kenapa induknya TIDAK diberi href sendiri
 *
 * Godaan pertama: isi `menu_items.href` untuk 13 induk yang sekarang NULL.
 * Itu melanggar keputusan founder sendiri, migrasi 232 R-1/R-2:
 *
 *   R-1  satu route = tepat satu link
 *   R-2  kelompok adalah WADAH: `href` NULL
 *
 * Alasannya tercatat di migrasi itu, dan masih berlaku:
 *
 *   *"ketika 1 halaman dibuka, link di sidebarnya harus aktif dan menu
 *    induknya terbuka, tapi kalo link sidebar yg aktifnya 2 kan jadi aneh."*
 *
 * Kalau induk `g-keuangan` DAN anak `keuangan` sama-sama menunjuk `/keuangan`,
 * penanda aktif kembali punya dua kandidat — persis cacat yang dibereskan
 * migrasi 232, dihidupkan lagi.
 *
 * ── Jalan keluarnya: PINJAM href anak, jangan menduplikasinya
 *
 * Tiap grup sudah punya satu anak yang memegang halaman ringkasannya
 * ("Ringkasan Keuangan" → `/keuangan`, "Daftar Proyek" → `/proyek`). Baris
 * induk tidak diberi href baru; ia MENGARAHKAN ke href anak itu.
 *
 * Hasilnya memenuhi keduanya: satu klik membuka halaman sekaligus meng-expand
 * (permintaan founder), dan route-nya tetap dimiliki tepat satu item menu
 * (R-1 utuh, penanda aktif tetap tunggal).
 *
 * ── Aturan pemilihan, dan kenapa BUKAN "ambil anak pertama"
 *
 * Anak pertama tidak selalu halaman ringkasan. Di grup "Gudang" anak
 * pertamanya "Rekonsiliasi Material" — halaman kerja spesifik, bukan
 * ikhtisar. Mengirim orang ke sana saat mengklik "Gudang" salah arah.
 *
 * Yang dicari: anak satu-ruas yang **menaungi anak terbanyak** di grup itu.
 *
 * ── Kenapa "menaungi terbanyak", bukan "satu-satunya yang satu ruas"
 *
 * Percobaan pertama menuntut kandidat satu-ruas itu TUNGGAL, dan itu terlalu
 * ketat — diukur di sidebar sungguhan, hanya 7 dari 13 grup lolos:
 *
 *   Kontrak    `/kontrak` + `/tender`                    → 2 akar, ditolak
 *   Estimasi   `/estimasi` + `/laporan` + `/akuntansi`   → 3 akar, ditolak
 *   Proyek     `/proyek` + `/jadwal` + `/kalender` + …   → 4 akar, ditolak
 *
 * Padahal ketiganya JELAS punya ikhtisar: `/kontrak` menaungi `/kontrak/rfi`
 * dan `/kontrak/asuransi`; `/tender` tak menaungi apa pun. Yang membedakan
 * bukan jumlah kandidat melainkan **berapa anak yang berada di bawahnya**.
 *
 * Kalau tak satu pun kandidat menaungi anak lain (Gudang: semua dua ruas;
 * Administrasi: 15 halaman lepas), grup itu memang tak punya ikhtisar dan
 * fungsinya mengembalikan `null` — barisnya kembali jadi toggle biasa.
 */

export interface NodeMenuRingkas {
  href?: string | null
  children?: NodeMenuRingkas[] | null
}

/** Jumlah ruas path: `/keuangan` → 1, `/keuangan/invoice` → 2. */
function ruas(href: string): number {
  return href.split('/').filter(Boolean).length
}

/**
 * Href tujuan untuk baris induk, atau `null` bila grup ini tak punya halaman
 * ringkasan.
 *
 * `null` BUKAN kegagalan — ia keadaan sah yang berarti "grup ini murni wadah".
 * Pemanggil wajib menanganinya dengan tetap merender toggle biasa; kalau
 * `null` dipaksa jadi `"#"` atau `"/"`, orang akan dikirim ke tempat acak.
 */
export function tujuanGrup(node: NodeMenuRingkas): string | null {
  const anak = (node.children ?? []).filter(
    (a): a is NodeMenuRingkas & { href: string } =>
      typeof a?.href === 'string' && a.href.startsWith('/'),
  )
  if (anak.length === 0) return null

  /*
    Kandidat hanya yang SATU RUAS. `/mutu/ncr` adalah halaman kerja, bukan
    ikhtisar grup — kalau tak ada satu pun anak satu-ruas, grup itu memang
    tak punya halaman ringkasan.

    Query-string diabaikan saat menghitung ruas: `/jadwal?bagian=cpm` tetap
    satu ruas, dan itu benar — ia halaman `/jadwal` dengan tab tertentu,
    bukan halaman yang lebih dalam.
  */
  const kandidat = anak.filter((a) => ruas(a.href.split('?')[0]) === 1)
  if (kandidat.length === 0) return null

  /*
    Skor tiap kandidat = berapa anak LAIN yang berada di bawah path-nya.

    `/kontrak` menaungi `/kontrak/rfi` dan `/kontrak/asuransi` → skor 2.
    `/tender` tak menaungi apa pun → skor 0. Jadi `/kontrak` menang, dan itu
    memang ikhtisar grupnya.

    Pembandingnya memakai awalan `path + "/"`, bukan `startsWith(path)` polos:
    tanpa garis miring, `/kas` akan dianggap menaungi `/kasbon` — dua modul
    yang sama sekali berbeda.
  */
  const skor = (href: string): number => {
    const path = href.split('?')[0]
    return anak.filter((b) => b !== null && b.href.split('?')[0].startsWith(path + '/')).length
  }

  let terpilih: (NodeMenuRingkas & { href: string }) | null = null
  let skorMaks = -1
  let seri = 0

  for (const k of kandidat) {
    const s = skor(k.href)
    if (s > skorMaks) { skorMaks = s; terpilih = k; seri = 1 }
    else if (s === skorMaks) { seri++ }
  }

  /*
    Kalau kandidat TERBAIK pun tak menaungi apa pun, grup ini bukan hierarki
    melainkan kumpulan halaman lepas — "Administrasi" (15 halaman tak
    berhubungan) dan "Gudang" (semua dua ruas) keduanya begitu. Memilih salah
    satunya berarti menebak, jadi barisnya tetap toggle.

    Pengecualian: grup dengan satu-satunya anak, dan anak itu satu ruas. Di
    situ tak ada yang bisa dinaungi, tetapi juga tak ada yang bisa keliru —
    grup "Piutang" (`/piutang` sendirian) jelas ikhtisarnya.
  */
  if (skorMaks === 0 && anak.length > 1) return null

  /*
    Seri pada skor tertinggi = dua kandidat sama kuat, tak ada dasar memilih.
    Menebak berarti separuh pemakai dikirim ke halaman yang bukan mereka cari.
  */
  if (seri !== 1) return null

  return terpilih?.href ?? null
}
