/**
 * AMBANG OTOMASI — dari `company_settings`, bukan dari angka di kode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder, 2026-08-15: *"kalo bisa workflownya itu kalo bisa jangan di
 * hardcode langsung yaa"*.
 *
 * Tepat, dan tepat waktu: saya baru saja menulis `angka(q.ambang, 5_000_000)`
 * untuk automation 2.11 — lima juta yang saya pilih sendiri, untuk uang
 * perusahaan orang lain.
 *
 * Angka seperti itu bukan detail teknis. "Saldo di bawah berapa yang bikin
 * khawatir" berbeda antara kontraktor rumah tinggal dan kontraktor
 * infrastruktur, dan satu-satunya yang tahu adalah pemiliknya.
 *
 * ── Kenapa `company_settings`, bukan tabel baru
 *
 * Mekanismenya SUDAH ADA dan sudah dipakai — diukur: lima baris aktif
 * (`kasbon.limit.enabled`, `tax.ppn_rate`, `project.dp_default_pct`, …),
 * dibaca `lib/kasbon-limit.ts` dan `routes/v1/procurement.ts`, dengan halaman
 * pengaturannya sendiri.
 *
 * Membuat tabel `ambang_otomasi` terpisah berarti tempat KEDUA untuk hal yang
 * sama, dan pengguna harus tahu mana yang berlaku. Yang sudah ada dipakai.
 *
 * ── Kenapa tetap ada bawaan di kode
 *
 * Bukan hardcode yang mengikat, melainkan JARING: tenant yang belum mengisi
 * ambangnya tetap mendapat otomasi yang bekerja, alih-alih otomasi yang diam
 * karena satu baris pengaturan belum ada.
 *
 * Bedanya menentukan, dan sudah terbukti mahal: `stok-menipis` memakai kolom
 * `materials.min_stock` yang WAJIB diisi manusia — dari 24 material, satu yang
 * terisi, dan automation-nya diam berbulan-bulan sambil melaporkan sehat.
 *
 * Jadi urutannya: **pengaturan tenant → query → bawaan**. Yang pertama menang,
 * yang terakhir menjaga agar tak pernah mati diam.
 */

import type { FastifyRequest } from 'fastify'

/**
 * Katalog ambang yang dipakai otomasi terjadwal.
 *
 * Ditulis di satu tempat, bukan tersebar di tiap rute — supaya "ambang apa
 * saja yang bisa diatur tenant" bisa dijawab dengan membaca satu berkas, dan
 * supaya migrasi seed-nya tak berselisih dengan yang dibaca kode.
 *
 * `bawaan` sengaja konservatif: lebih baik otomasi menegur sedikit terlalu
 * sering (yang bisa dilonggarkan tenant) daripada diam untuk masalah nyata.
 */
export const AMBANG_OTOMASI = {
  'otomasi.invoice_terlambat.hari': {
    bawaan: 1,
    min: 0,
    max: 90,
    label: 'Hari keterlambatan invoice sebelum ditegur',
  },
  'otomasi.saldo_menipis.rupiah': {
    bawaan: 5_000_000,
    min: 0,
    max: 1_000_000_000,
    label: 'Saldo kas minimum sebelum diperingatkan',
  },
  'otomasi.milestone_berisiko.hari': {
    bawaan: 7,
    min: 1,
    max: 60,
    label: 'Hari sebelum tenggat milestone mulai ditegur',
  },
  'otomasi.hutang_supplier.hari': {
    bawaan: 7,
    min: 0,
    max: 60,
    label: 'Hari sebelum jatuh tempo hutang supplier ditegur',
  },
  'otomasi.harga_material.persen': {
    bawaan: 10,
    min: 1,
    max: 100,
    label: 'Kenaikan harga material yang dianggap signifikan (%)',
  },
  /*
    Dua ambang EVM, dan DESIMAL — satu-satunya di daftar ini.

    Dan pemotongan di `jepit()` HARUS mengikuti bentuknya — lihat komentar di
    sana. Saya sempat menulis di sini bahwa "`ambilAmbang` tak membulatkan
    (diperiksa)"; itu SALAH. `Math.trunc(0.75)` menghasilkan 0, lalu dijepit
    naik ke `min` — ambang 0.75 diam-diam jadi 0.1, dan otomasinya praktis
    berhenti menegur siapa pun tanpa satu pun galat. Test `otomasi-evm`
    menangkapnya; pembacaan kode saya tidak.

    Bawaan 0.90, bukan 1.00. SPI persis 1.00 hampir tak pernah terjadi pada
    proyek nyata; ambang di 1.00 berarti notifikasi yang selalu menyala, dan
    yang selalu menyala berhenti dibaca.
  */
  /*
    Bawaan 30 hari — sama dengan `AMBANG_SEGERA_HARI` di
    `lib/register-asuransi.ts`, dan itu disengaja.

    Kalau keduanya berbeda, layar Register Asuransi menandai polis "segera
    berakhir" pada hari yang berbeda dari hari notifikasinya dikirim — dan
    yang membuka layar sesudah menerima pesan menemukan status yang tak cocok
    dengan pesannya.
  */
  'otomasi.polis_berakhir.hari': {
    bawaan: 30,
    min: 1,
    max: 180,
    label: 'Hari sebelum polis asuransi berakhir mulai diperingatkan',
  },
  /*
    Bawaan 7 hari. Bukan angka bulat yang dipilih asal: konfirmasi terima
    dokumen konstruksi lazimnya seminggu, dan menegur lebih cepat dari itu
    membuat pesannya terbaca sebagai desakan alih-alih pengingat.
  */
  'otomasi.transmittal_menggantung.hari': {
    bawaan: 7,
    min: 1,
    max: 90,
    label: 'Hari transmittal terkirim tanpa konfirmasi sebelum ditegur',
  },
  'otomasi.evm_spi.minimum': {
    bawaan: 0.9,
    min: 0.1,
    max: 1,
    label: 'Batas bawah indeks jadwal (SPI) — di bawah ini proyek tertinggal',
  },
  'otomasi.evm_cpi.minimum': {
    bawaan: 0.9,
    min: 0.1,
    max: 1,
    label: 'Batas bawah indeks biaya (CPI) — di bawah ini proyek boros',
  },
} as const

export type KunciAmbang = keyof typeof AMBANG_OTOMASI

/**
 * Batasi ke rentang waras — angka di luar itu dipangkas, bukan ditolak.
 *
 * ── Kenapa `Math.trunc` HANYA untuk ambang bilangan bulat
 *
 * Bentuk pertama fungsi ini memotong SEMUA nilai dengan `Math.trunc`. Itu
 * benar selama seluruh ambang bilangan bulat (hari, rupiah, persen), dan
 * memang begitu sampai 2026-08-16.
 *
 * Kedua ambang EVM desimal (SPI/CPI, bawaan 0.9), dan `Math.trunc(0.75)`
 * menghasilkan **0** — lalu dijepit naik ke `min`. Jadi bukan sekadar
 * kehilangan ketelitian: ambang 0.75 diam-diam berubah jadi 0.1, dan otomasi
 * yang seharusnya menegur proyek di bawah 0.75 praktis tak pernah menegur
 * siapa pun. Nol notifikasi terlihat persis seperti "semua proyek sehat".
 *
 * Ditemukan test, bukan pembacaan kode — saya menulis komentar di
 * `AMBANG_OTOMASI` yang menyatakan "ambilAmbang tak membulatkan (diperiksa)",
 * dan pemeriksaan itu keliru.
 *
 * Sekarang pemotongan mengikuti BENTUK AMBANGNYA: bulat kalau bawaan dan
 * batasnya bulat, apa adanya kalau ada yang desimal. Ambang hari yang diberi
 * "7.9" tetap jadi 7 seperti sebelumnya.
 */
function jepit(n: number, min: number, max: number): number {
  const bulat = Number.isInteger(min) && Number.isInteger(max)
  return Math.min(Math.max(bulat ? Math.trunc(n) : n, min), max)
}

/**
 * Ambil ambang yang BERLAKU untuk tenant ini.
 *
 * Urutan: query (`?ambang=`) → `company_settings` → bawaan katalog.
 *
 * Query menang atas pengaturan karena ia dipakai untuk pengujian dan untuk
 * penjadwal yang sengaja memakai angka berbeda pada satu jalannya — bukan
 * untuk mengubah kebijakan. Kebijakan tetap di pengaturan.
 *
 * ⚠ Kegagalan baca TIDAK dilempar. Otomasi yang mati karena tabel pengaturan
 * sedang tak terbaca lebih merugikan daripada otomasi yang jalan dengan
 * bawaan — dan bawaannya sendiri sudah dipilih aman. Tetapi ia DICATAT, supaya
 * "kenapa ambangnya tidak terpakai" punya jejak.
 */
export async function ambilAmbang(
  request: FastifyRequest,
  kunci: KunciAmbang,
  dariQuery?: unknown,
): Promise<number> {
  const meta = AMBANG_OTOMASI[kunci]

  // 1. Query — menang, dan sengaja tak menyentuh basis.
  if (dariQuery !== undefined && dariQuery !== null && dariQuery !== '') {
    const n = Number(dariQuery)
    if (Number.isFinite(n)) return jepit(n, meta.min, meta.max)
  }

  // 2. Pengaturan tenant.
  const { data, error } = await request.db!
    .from('company_settings')
    .select('value')
    .eq('key', kunci)
    .maybeSingle()

  if (error) {
    request.log.warn(
      { err: error, kunci },
      'ambang otomasi: gagal baca company_settings — memakai bawaan',
    )
    return meta.bawaan
  }

  if (data) {
    const n = Number((data as { value?: unknown }).value)
    if (Number.isFinite(n)) return jepit(n, meta.min, meta.max)
    request.log.warn(
      { kunci, nilai: (data as { value?: unknown }).value },
      'ambang otomasi: nilai di company_settings bukan angka — memakai bawaan',
    )
  }

  // 3. Bawaan.
  return meta.bawaan
}
