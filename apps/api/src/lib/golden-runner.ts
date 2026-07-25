// Golden-File Acceptance Harness (CECEP) — PURE. "Satu-satunya bukti" paritas Excel.
//
// Menjalankan satu FIXTURE (input RAB + METODE + angka EXPECTED per level) melalui
// engine murni (computeRabDocument) lalu membandingkan tiap level SAMPAI RUPIAH.
// Header `method` membuat selisih Control-unrounded vs SNI-ROUNDDOWN dinyatakan
// EKSPLISIT — jadi beda-metode ≠ bug (permintaan founder, GOLDEN-FILE-SPEC §E).
//
// Adapter Excel→GoldenFixture dibangun BERSAMA file RAB nyata; harness ini generik.

import {
  computeRabDocument, type RabItemInput,
} from './rab-compute.js'
import type { RoundingRule, PpnConfig } from './ahsp-engine.js'

export interface GoldenMethod {
  rounding: RoundingRule // sni_rounddown_100 { down,100 } vs control_unrounded { none,0 }
  bukFraction: number    // BUK (mis 0,10)
  ppn: PpnConfig         // excel_12pct_full {rate:.12,1,1} vs effective_11pct {rate:.12,11,12}
  seVersion?: string
  docDate?: string
}

/** Angka expected per level (dari Excel). Level yang tak diisi tidak diperiksa. */
export interface GoldenExpected {
  items?: { code: string; hspRounded?: number; total?: number }[]
  groups?: { name: string; subtotal: number }[]
  totalBiaya?: number
  ppn?: number
  grandTotal?: number
}

export interface GoldenFixture {
  name: string
  method: GoldenMethod
  items: RabItemInput[]
  expected: GoldenExpected
  /** Toleransi rupiah (default 0,005 → praktis eksak sampai rupiah). */
  tolerance?: number
}

export interface GoldenCheck {
  level: string            // 'item.hspRounded' | 'item.total' | 'group.subtotal' | 'totalBiaya' | 'ppn' | 'grandTotal'
  label: string            // kode/nama untuk lokasi
  expected: number
  actual: number
  diff: number             // actual − expected
  pass: boolean
}

export interface GoldenReport {
  name: string
  passed: boolean
  failedCount: number
  checks: GoldenCheck[]
}

/**
 * Jalankan fixture → laporan per level. `passed` true HANYA bila SEMUA level yang
 * di-expect cocok dalam toleransi. Harness ini MENOLAK angka salah (bukan stempel):
 * satu level meleset → `passed=false` + `diff` menunjukkan besaran gesernya.
 */
export function runGolden(fixture: GoldenFixture): GoldenReport {
  const tol = fixture.tolerance ?? 0.005
  const doc = computeRabDocument(fixture.items, {
    bukFraction: fixture.method.bukFraction,
    rounding: fixture.method.rounding,
    ppn: fixture.method.ppn,
  })
  const checks: GoldenCheck[] = []
  const cmp = (level: string, label: string, expected: number, actual: number) => {
    const diff = actual - expected
    checks.push({ level, label, expected, actual, diff, pass: Math.abs(diff) <= tol })
  }

  const byCode = new Map(doc.items.map(i => [i.code, i]))
  for (const ei of fixture.expected.items ?? []) {
    const got = byCode.get(ei.code)
    if (!got) { // item yang di-expect tak ada di hasil = pelanggaran nyata, bukan skip
      checks.push({ level: 'item.missing', label: ei.code, expected: 1, actual: 0, diff: -1, pass: false })
      continue
    }
    if (ei.hspRounded !== undefined) cmp('item.hspRounded', ei.code, ei.hspRounded, got.hspRounded)
    if (ei.total !== undefined) cmp('item.total', ei.code, ei.total, got.total)
  }
  const byGroup = new Map(doc.groups.map(g => [g.name, g]))
  for (const eg of fixture.expected.groups ?? []) {
    const got = byGroup.get(eg.name)
    if (!got) { checks.push({ level: 'group.missing', label: eg.name, expected: 1, actual: 0, diff: -1, pass: false }); continue }
    cmp('group.subtotal', eg.name, eg.subtotal, got.subtotal)
  }
  if (fixture.expected.totalBiaya !== undefined) cmp('totalBiaya', fixture.name, fixture.expected.totalBiaya, doc.totalBiaya)
  if (fixture.expected.ppn !== undefined) cmp('ppn', fixture.name, fixture.expected.ppn, doc.ppn)
  if (fixture.expected.grandTotal !== undefined) cmp('grandTotal', fixture.name, fixture.expected.grandTotal, doc.grandTotal)

  const failedCount = checks.filter(c => !c.pass).length
  return { name: fixture.name, passed: failedCount === 0, failedCount, checks }
}
