/**
 * FORMAT — satu-satunya sumber tampilan angka, uang, dan tanggal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08: **127 pemanggilan `toLocaleString`/`Intl` tersebar** di
 * `app/` dan `components/`, 83 di antaranya di `page.tsx`. Dua bentuk mendominasi:
 *
 *     53 ×  Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", … })
 *     51 ×  toLocaleString("id-ID")
 *
 * Selama formatnya disalin dari halaman ke halaman, tiap penyalinan adalah
 * kesempatan berbeda satu detail — dan detail nominal yang berbeda antar
 * halaman terbaca sebagai aplikasi yang tidak dipercaya, bukan sebagai
 * ketidakrapian.
 *
 * ── Tiga jebakan yang diselesaikan di sini, bukan di 127 tempat
 *
 * 1. **Spasi tak-putus.** ICU mengeluarkan U+00A0 di `Rp 1.000`, bukan spasi
 *    biasa. Perbandingan string dan pencarian teks gagal dengan cara yang di
 *    layar terlihat identik. Dinormalkan sekali di sini.
 *
 * 2. **`numeric` Postgres tiba sebagai STRING.** Driver mengirimnya begitu
 *    supaya presisi tak hilang. Kalau helper hanya menerima `number`, tiap
 *    pemanggil menulis `Number(...)` sendiri — dan sebagian akan lupa,
 *    menghasilkan `Rp NaN` di layar.
 *
 * 3. **Zona waktu.** Jam tanpa zona ikut zona MESIN. Server UTC menampilkan
 *    jam berbeda dari yang dilihat mandor di lapangan, dan selisih itu tak
 *    pernah muncul sebagai galat — hanya sebagai angka yang salah.
 *
 * ── Aturan yang mengikat (brief redesign §5)
 *
 *   - Desimal KOMA, ribuan TITIK.
 *   - Skala pendek Indonesia: rb · jt · M · T. **Dilarang** "Cr"/"L" (skala
 *     India dari gambar referensi).
 *   - Zona Asia/Jakarta.
 *   - Nominal negatif pada kolom mutasi/varians: `(Rp 1,2 jt)`, bukan minus.
 *
 * ── Nilai kosong
 *
 * Semua fungsi mengembalikan `—` (em-dash) untuk null/undefined/NaN. Bukan
 * `"0"`: nol adalah FAKTA ("kas Rp 0"), sedangkan tak-ada-data adalah keadaan
 * yang berbeda. Menyamakannya pernah membuat laporan menampilkan Rp 0 untuk
 * biaya yang sebenarnya tak terbaca (lihat `d66956d`).
 *
 * Perilakunya dikunci `format.test.ts` — dibuat SEBELUM berkas ini.
 */

/** Tanda untuk "tidak ada nilai" — dibedakan dari nol. */
export const KOSONG = '—'

/** Nilai apa pun yang bisa datang dari API untuk sebuah angka. */
export type NilaiAngka = number | string | null | undefined

/**
 * `numeric` Postgres tiba sebagai string; `""` dan teks non-angka harus jatuh
 * ke KOSONG, bukan jadi `NaN` yang lolos ke layar.
 */
function keAngka(nilai: NilaiAngka): number | null {
  if (nilai === null || nilai === undefined || nilai === '') return null
  const n = typeof nilai === 'number' ? nilai : Number(nilai)
  return Number.isFinite(n) ? n : null
}

/** ICU memakai U+00A0 di antara "Rp" dan angkanya. Disamakan jadi spasi biasa. */
function spasiBiasa(s: string): string {
  return s.replace(/ /g, ' ')
}

const ID = 'id-ID'
const ZONA = 'Asia/Jakarta'

/* ── Uang ─────────────────────────────────────────────────────────────── */

const fmtRupiah = new Intl.NumberFormat(ID, {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

/** `formatRupiah(1250000000)` → `"Rp 1.250.000.000"` */
export function formatRupiah(nilai: NilaiAngka): string {
  const n = keAngka(nilai)
  if (n === null) return KOSONG
  return spasiBiasa(fmtRupiah.format(n))
}

const TANGGA = [
  { batas: 1_000_000_000_000, satuan: 'T' },
  { batas: 1_000_000_000, satuan: 'M' },
  { batas: 1_000_000, satuan: 'jt' },
  { batas: 1_000, satuan: 'rb' },
] as const

/**
 * `formatRupiahSingkat(1250000)` → `"Rp 1,25 jt"`
 *
 * Untuk kartu KPI dan grafik, di mana `Rp 1.250.000.000` memakan lebar yang
 * tak tersedia. Untuk tabel dan nota, pakai `formatRupiah` — di sana angka
 * penuh justru yang dibutuhkan.
 */
export function formatRupiahSingkat(nilai: NilaiAngka): string {
  const n = keAngka(nilai)
  if (n === null) return KOSONG

  const negatif = n < 0
  const abs = Math.abs(n)
  const tanda = negatif ? '-' : ''

  for (const { batas, satuan } of TANGGA) {
    if (abs >= batas) {
      const skala = abs / batas
      // 2 desimal, lalu nol di ujung dibuang: "2,00" -> "2", "1,25" -> "1,25".
      const teks = skala
        .toFixed(2)
        .replace(/\.?0+$/, '')
        .replace('.', ',')
      return `${tanda}Rp ${teks} ${satuan}`
    }
  }
  return `${tanda}Rp ${Math.round(abs)}`
}

/**
 * `formatMutasi(-1200000)` → `"(Rp 1.200.000)"`
 *
 * Konvensi akuntansi untuk kolom mutasi/varians: negatif dalam kurung. Tanda
 * minus mudah hilang saat dicetak, difoto, atau dibaca cepat — kurung tidak.
 */
export function formatMutasi(nilai: NilaiAngka): string {
  const n = keAngka(nilai)
  if (n === null) return KOSONG
  if (n < 0) return `(${formatRupiah(Math.abs(n))})`
  return formatRupiah(n)
}

/* ── Angka & persen ───────────────────────────────────────────────────── */

/** `formatAngka(1248.5, 1)` → `"1.248,5"` */
export function formatAngka(nilai: NilaiAngka, desimal = 0): string {
  const n = keAngka(nilai)
  if (n === null) return KOSONG
  return spasiBiasa(
    new Intl.NumberFormat(ID, {
      minimumFractionDigits: desimal,
      maximumFractionDigits: desimal,
    }).format(n),
  )
}

/**
 * `formatPersen(0.685)` → `"68,5%"`
 *
 * Bakunya menerima **pecahan** (0–1). Sumber yang sudah berupa angka persen
 * (68,5) harus menyatakannya lewat `sudahPersen` — salah tebak menghasilkan
 * "0,7%" di tempat yang seharusnya "68,5%", dan itu tak terlihat seperti bug,
 * hanya seperti angka yang salah.
 */
export function formatPersen(
  nilai: NilaiAngka,
  opsi: { desimal?: number; sudahPersen?: boolean } = {},
): string {
  const n = keAngka(nilai)
  if (n === null) return KOSONG
  const { desimal = 1, sudahPersen = false } = opsi
  const persen = sudahPersen ? n : n * 100
  return `${formatAngka(persen, desimal)}%`
}

/** `formatVolume(1248.5, 'm³')` → `"1.248,5 m³"` */
export function formatVolume(nilai: NilaiAngka, satuan?: string, desimal = 1): string {
  const n = keAngka(nilai)
  if (n === null) return KOSONG
  const angka = formatAngka(n, desimal)
  return satuan ? `${angka} ${satuan}` : angka
}

/**
 * `formatKuantitas(1)` → `"1"` · `formatKuantitas(0.25)` → `"0,25"`
 *
 * Untuk kolom kuantitas yang skalanya besar tapi isinya sering bulat.
 * `formatVolume` memaku jumlah desimalnya, jadi volume bulat tampil "1,0"
 * atau — pada kolom `numeric(_,4)` — "1,0000". Di tabel dengan ratusan baris,
 * nol-nol itu memenuhi kolom tanpa menyampaikan apa pun, dan justru
 * menyulitkan memindai mana yang benar-benar pecahan.
 *
 * Bakunya 4 desimal karena itu skala terbesar yang dipakai skema
 * (`estimate_items.quantity`, `rap_material_line.qty_ahsp`). `toLocaleString`
 * bawaan berhenti di 3 desimal — jadi kode yang memakainya sudah diam-diam
 * memotong digit keempat, dan pemakai tak punya cara tahu.
 */
export function formatKuantitas(nilai: NilaiAngka, desimalMaks = 4): string {
  const n = keAngka(nilai)
  if (n === null) return KOSONG
  return spasiBiasa(
    new Intl.NumberFormat(ID, {
      minimumFractionDigits: 0,
      maximumFractionDigits: desimalMaks,
    }).format(n),
  )
}

/* ── Tanggal ──────────────────────────────────────────────────────────── */

export type NilaiTanggal = Date | string | number | null | undefined

function keTanggal(nilai: NilaiTanggal): Date | null {
  if (nilai === null || nilai === undefined || nilai === '') return null
  const d = nilai instanceof Date ? nilai : new Date(nilai)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `formatTanggal(d)` → `"20 Mei 2026"` */
export function formatTanggal(nilai: NilaiTanggal): string {
  const d = keTanggal(nilai)
  if (!d) return KOSONG
  return spasiBiasa(
    new Intl.DateTimeFormat(ID, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: ZONA,
    }).format(d),
  )
}

/** `formatTanggalPanjang(d)` → `"Rabu, 20 Mei 2026"` */
export function formatTanggalPanjang(nilai: NilaiTanggal): string {
  const d = keTanggal(nilai)
  if (!d) return KOSONG
  return spasiBiasa(
    new Intl.DateTimeFormat(ID, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: ZONA,
    }).format(d),
  )
}

/**
 * `formatTanggalJam(d)` → `"20 Mei 2026 · 10.45"`
 *
 * Jamnya WIB, bukan zona mesin — lihat jebakan 3 di kepala berkas.
 */
export function formatTanggalJam(nilai: NilaiTanggal): string {
  const d = keTanggal(nilai)
  if (!d) return KOSONG
  const jam = new Intl.DateTimeFormat(ID, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ZONA,
  }).format(d)
  // ICU id-ID memakai titik pemisah jam ("10.45"); disamakan bila ia memakai titik dua.
  return `${formatTanggal(d)} · ${spasiBiasa(jam).replace(':', '.')}`
}

const MENIT = 60_000
const JAM = 60 * MENIT
const HARI = 24 * JAM

/**
 * `formatRelatif(d)` → `"2 jam lalu"` · `"kemarin"`
 *
 * Lewat seminggu, waktu relatif berhenti membantu ("37 hari lalu" tak berarti
 * apa-apa) dan diganti tanggal penuh.
 *
 * `acuan` bisa disuntik supaya test tidak bergantung jam berjalan.
 */
export function formatRelatif(nilai: NilaiTanggal, acuan: Date = new Date()): string {
  const d = keTanggal(nilai)
  if (!d) return KOSONG

  const selisih = acuan.getTime() - d.getTime()
  if (selisih < MENIT) return 'baru saja'
  if (selisih < JAM) return `${Math.floor(selisih / MENIT)} menit lalu`
  if (selisih < HARI) return `${Math.floor(selisih / JAM)} jam lalu`
  if (selisih < 2 * HARI) return 'kemarin'
  if (selisih < 7 * HARI) return `${Math.floor(selisih / HARI)} hari lalu`
  return formatTanggal(d)
}
