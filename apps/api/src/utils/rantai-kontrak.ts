/**
 * Lapisan I/O untuk rantai kontrak — membaca syarat LD dari `financial_config`
 * dan meresolusinya dengan override per proyek.
 *
 * Aritmetikanya ada di `lib/rantai-kontrak.ts` (murni, tanpa I/O, ber-uji
 * mutasi). Pemisahan yang sama dipakai `penalty.ts` (091), dan alasannya sama:
 * angka finansial harus bisa diuji tanpa DB, sementara pembacaan config harus
 * bisa berubah tanpa menyentuh rumusnya.
 */

import { getEffectiveFinancialValue } from './financial-config.js'
import { todayWIB } from '../lib/financial-config.js'
import {
  resolveSyaratLD, hitungLD, tanggalSelesaiEfektif,
  type SyaratLD, type BasisLD, type SyaratLDOverride,
  type BarisEOT, type HasilLD,
} from '../lib/rantai-kontrak.js'

/**
 * Fallback statis — dipakai HANYA bila config hilang sama sekali.
 *
 * `aktif: false` bukan pilihan malas: kalau config tak terbaca karena apa pun,
 * yang benar adalah TIDAK menagih denda. Denda yang muncul karena kegagalan
 * baca config adalah tagihan yang tak seorang pun memutuskan.
 */
const LD_DEFAULT: SyaratLD = {
  aktif: false, basis: 'nilai_kontrak',
  tarifPerHari: 0.001, batasPct: 0.05, hariTenggang: 0,
}

const BASIS_SAH: BasisLD[] = ['nilai_kontrak', 'sisa_pekerjaan']

function keBasis(v: unknown): BasisLD {
  return BASIS_SAH.includes(v as BasisLD) ? (v as BasisLD) : LD_DEFAULT.basis
}

function keBool(v: unknown, bawaan: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return bawaan
}

function keAngka(v: unknown, bawaan: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : bawaan
}

/** Baca syarat LD global yang berlaku pada tanggal tertentu. */
export async function getSyaratLDGlobal(atDate?: string, companyId?: string): Promise<SyaratLD> {
  const tgl = atDate ?? todayWIB()
  const [aktif, basis, tarif, batas, tenggang] = await Promise.all([
    getEffectiveFinancialValue('ld.enabled', tgl, companyId),
    getEffectiveFinancialValue('ld.basis', tgl, companyId),
    getEffectiveFinancialValue('ld.rate_per_day', tgl, companyId),
    getEffectiveFinancialValue('ld.cap_pct', tgl, companyId),
    getEffectiveFinancialValue('ld.grace_days', tgl, companyId),
  ])

  return {
    aktif:        keBool(aktif, LD_DEFAULT.aktif),
    basis:        keBasis(basis),
    tarifPerHari: keAngka(tarif, LD_DEFAULT.tarifPerHari),
    batasPct:     keAngka(batas, LD_DEFAULT.batasPct),
    hariTenggang: keAngka(tenggang, LD_DEFAULT.hariTenggang),
  }
}

/** Bentuk baris proyek yang dibutuhkan perhitungan LD. */
export interface ProyekUntukLD {
  id: string
  contract_value: number | null
  end_date: string
  actual_end_date: string | null
  progress_pct: number | null
  ld_enabled: boolean | null
  ld_basis: string | null
  ld_rate_per_day: number | null
  ld_cap_pct: number | null
  ld_grace_days: number | null
  ld_waived: boolean | null
}

export interface HasilLDProyek extends HasilLD {
  /** `true` bila angkanya OTORITATIF (proyek sudah selesai), `false` = estimasi. */
  otoritatif: boolean
  syarat: SyaratLD
}

/**
 * Hitung LD satu proyek.
 *
 * **Otoritatif vs estimasi** dibedakan oleh `actual_end_date`, bukan oleh
 * fungsi yang berbeda. Selama proyek belum selesai, angkanya masih bergerak
 * tiap hari dan HARUS dilabeli estimasi — angka yang tampak final padahal
 * masih berubah mengundang penagihan yang keliru.
 */
export async function hitungLDProyek(
  p: ProyekUntukLD,
  daftarEOT: BarisEOT[],
  companyId?: string,
): Promise<HasilLDProyek> {
  const selesai = p.actual_end_date ?? null
  const tanggalAcuan = selesai ?? todayWIB()

  // Syarat dibaca pada TANGGAL ACUAN, bukan hari ini: kontrak yang selesai
  // tahun lalu harus dinilai dengan tarif yang berlaku saat itu — itulah guna
  // effective-dating, dan mengabaikannya membuat angka lama berubah sendiri.
  const global = await getSyaratLDGlobal(tanggalAcuan, companyId)

  const override: SyaratLDOverride = {
    aktif:        p.ld_enabled,
    basis:        BASIS_SAH.includes(p.ld_basis as BasisLD) ? (p.ld_basis as BasisLD) : null,
    tarifPerHari: p.ld_rate_per_day,
    batasPct:     p.ld_cap_pct,
    hariTenggang: p.ld_grace_days,
  }
  const syarat = resolveSyaratLD(override, global)

  const hasil = hitungLD({
    syarat,
    nilaiKontrak: Number(p.contract_value ?? 0),
    progressPct: Number(p.progress_pct ?? 0),
    tanggalKontrak: String(p.end_date),
    daftarEOT,
    tanggalAcuan,
    diputihkan: p.ld_waived === true,
  })

  return { ...hasil, otoritatif: selesai != null, syarat }
}

export { tanggalSelesaiEfektif }
