/**
 * PENOMORAN DOKUMEN (F1) — aturan seri nomor. PURE, tanpa I/O.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 135 membangun counter transaksional `next_document_number()` dan
 * menutup empat cacat pola `COUNT(*) + 1`. Diukur 2026-08-12, tiga tertinggal:
 *
 *   1. `document_number_series.prefix` TAK PERNAH DIBACA. Fungsinya
 *      mengembalikan BIGINT saja; prefix hanya tersimpan saat baris counter
 *      pertama dibuat. Keempat baris di dev berprefix ''.
 *
 *   2. `termin-payment.ts` masih memakai `COUNT(*) + 1` untuk nomor INVOICE —
 *      dokumen yang keluar ke klien.
 *
 *   3. Tabelnya NOL rute, NOL halaman: 41 kolom nomor di basis, dan tak satu
 *      tempat pun menunjukkan nomor terakhir tiap seri. Saat orang bertanya
 *      "PO terakhir nomor berapa", jawabannya hanya ada di psql.
 *
 * ── Yang TIDAK boleh bisa dilakukan dari UI
 *
 * MEMUNDURKAN counter. Nomor dokumen yang sudah terbit tak boleh lahir
 * kembali, bahkan kalau dokumennya dibatalkan — lubang pada urutan nomor
 * adalah perilaku yang benar (migrasi 135 menulisnya, dan itu masih berlaku).
 *
 * Ini bukan kehati-hatian berlebihan: satu-satunya alasan orang ingin
 * memundurkan counter adalah "supaya nomornya rapi kembali", dan hasilnya
 * dokumen kembar yang sudah terlanjur terkirim ke pihak ketiga.
 */

/** Batas prefix — sama dengan CHECK `document_number_series_prefix_wajar`. */
export const PREFIX_MAKS = 12
/** Batas padding — sama dengan CHECK `document_number_series_padding_wajar`. */
export const PADDING_MIN = 1
export const PADDING_MAKS = 12

export type HasilValidasi =
  | { ok: true; prefix: string; padding: number }
  | { ok: false; galat: string }

/**
 * Validasi pengaturan seri, SEBELUM menyentuh basis.
 *
 * Basis juga menegakkannya lewat CHECK — importer dan psql menulis ke sini
 * juga — tetapi galat Postgres tak bisa ditindaklanjuti pengguna. Di sini
 * alasannya dijelaskan.
 */
export function validasiSeri(m: {
  prefix?: string | null
  padding?: number | string | null
}): HasilValidasi {
  // Prefix KOSONG sah: nomor tanpa awalan (`2026-0001`) adalah pilihan, bukan
  // kelalaian. Yang dilarang adalah prefix yang merusak bentuk nomornya.
  const prefixMentah = (m.prefix ?? '').trim()

  if (prefixMentah.length > PREFIX_MAKS) {
    return {
      ok: false,
      galat: `Prefix maksimal ${PREFIX_MAKS} karakter — lebih dari itu nomornya `
        + 'lebih panjang daripada isinya, dan tak muat di kolom laporan.',
    }
  }
  if (/\s/.test(prefixMentah)) {
    return {
      ok: false,
      galat: 'Prefix tak boleh mengandung spasi. Nomor dokumen dibaca dan disalin '
        + 'sebagai satu kata; spasi membuatnya terpotong saat ditempel ke sistem lain.',
    }
  }
  if (prefixMentah.includes('-')) {
    // Pemisahnya sendiri. Prefix "INV-2026" menghasilkan `INV-2026-2026-0001`
    // — dua kali periode, dan tak seorang pun menyadarinya sampai nomor itu
    // tercetak di dokumen yang keluar.
    return {
      ok: false,
      galat: 'Prefix tak boleh mengandung tanda hubung — itu pemisah yang dipakai '
        + 'format nomornya sendiri. Prefix "INV-2026" menghasilkan INV-2026-2026-0001.',
    }
  }

  // `Number('') === 0`, bukan NaN — kosong ditangani SEBELUM konversi supaya
  // "tak diisi" tak berubah jadi "padding nol".
  if (m.padding === null || m.padding === undefined || String(m.padding).trim() === '') {
    return { ok: false, galat: 'Lebar nomor wajib diisi' }
  }
  const padding = Number(m.padding)
  if (!Number.isInteger(padding)) {
    return { ok: false, galat: 'Lebar nomor harus bilangan bulat' }
  }
  if (padding < PADDING_MIN || padding > PADDING_MAKS) {
    return {
      ok: false,
      galat: `Lebar nomor harus ${PADDING_MIN}–${PADDING_MAKS}. Lebar nol membuat `
        + 'nomor kehilangan urutan alfabetisnya (2 muncul sesudah 10).',
    }
  }

  return { ok: true, prefix: prefixMentah, padding }
}

/**
 * Bentuk nomor BERIKUTNYA — untuk pratinjau, bukan untuk menomori.
 *
 * Dipisahkan dari `next_document_number_full()` di basis dengan sengaja: yang
 * di basis MENAIKKAN counter, jadi memanggilnya untuk pratinjau akan membakar
 * satu nomor tiap kali seseorang membuka halaman pengaturan. Lubang pada
 * urutan nomor karena orang melihat-lihat adalah cacat yang sulit dijelaskan.
 *
 * Bentuknya WAJIB sama dengan fungsi basis. Kalau keduanya berbeda, pratinjau
 * berbohong — dan pengguna menyetel prefix berdasarkan tampilan yang salah.
 */
export function contohNomor(m: {
  prefix: string
  periode: string
  padding: number
  urut: number
}): string {
  const p = (m.prefix ?? '').trim()
  const nomor = String(Math.max(0, Math.trunc(m.urut))).padStart(m.padding, '0')

  // Periode '-' berarti seri TAK berperiode (nomor berlanjut selamanya).
  // Nilai itu berasal dari `next_document_number` yang memakainya sebagai
  // default; menuliskannya apa adanya menghasilkan `INV---0001`.
  const berperiode = m.periode !== '' && m.periode !== '-'

  if (p === '') return berperiode ? `${m.periode}-${nomor}` : nomor
  return berperiode ? `${p}-${m.periode}-${nomor}` : `${p}-${nomor}`
}

export interface SeriRingkas {
  doc_type: string
  period: string
  prefix: string
  padding: number
  last_number: number | string
}

/** Label manusia untuk `doc_type` — yang tak dikenal ditampilkan apa adanya. */
export const LABEL_JENIS: Record<string, string> = {
  invoice: 'Invoice ke klien',
  po: 'Purchase Order',
  mr: 'Permintaan Material',
  gr: 'Penerimaan Barang',
}

export function labelJenis(doc_type: string): string {
  return LABEL_JENIS[doc_type] ?? doc_type
}

/**
 * Kelompokkan seri per jenis dokumen.
 *
 * Satu jenis bisa punya BANYAK periode (invoice punya 2025-01 … 2026-12), dan
 * daftar rata membuat halamannya jadi 30 baris yang semuanya bernama
 * "invoice". Yang dicari pembacanya adalah "sampai nomor berapa invoice bulan
 * ini", jadi periode TERBARU yang ditonjolkan.
 */
export function kelompokPerJenis(daftar: readonly SeriRingkas[]): Array<{
  doc_type: string
  label: string
  prefix: string
  padding: number
  periode: SeriRingkas[]
  terbaru: SeriRingkas | null
  totalTerbit: number
}> {
  const peta = new Map<string, SeriRingkas[]>()
  for (const s of daftar) {
    const k = s.doc_type
    if (!peta.has(k)) peta.set(k, [])
    peta.get(k)!.push(s)
  }

  return [...peta.entries()]
    .map(([doc_type, periode]) => {
      // Urutan periode DESC secara leksikal — bentuk 'YYYY' dan 'YYYY-MM'
      // keduanya benar dibandingkan begitu, dan '-' (tanpa periode) jatuh
      // paling akhir, yang memang tempatnya.
      const urut = [...periode].sort((a, b) => b.period.localeCompare(a.period))
      const terbaru = urut[0] ?? null
      return {
        doc_type,
        label: labelJenis(doc_type),
        // Prefix & padding milik SERI, dan tiap periode menyimpannya sendiri.
        // Yang ditampilkan adalah milik periode terbaru — itu yang akan
        // dipakai dokumen berikutnya.
        prefix: terbaru?.prefix ?? '',
        padding: terbaru?.padding ?? 4,
        periode: urut,
        terbaru,
        // Σ seluruh periode: "berapa dokumen jenis ini pernah terbit".
        // Angka ini TIDAK sama dengan jumlah baris yang ada — counter tak
        // pernah mundur saat dokumen dihapus, dan itu memang disengaja.
        totalTerbit: urut.reduce((t, s) => t + Number(s.last_number ?? 0), 0),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}
