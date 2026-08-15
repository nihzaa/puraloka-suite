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
} as const

export type KunciAmbang = keyof typeof AMBANG_OTOMASI

/** Batasi ke rentang waras — angka di luar itu dipangkas, bukan ditolak. */
function jepit(n: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(n), min), max)
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
