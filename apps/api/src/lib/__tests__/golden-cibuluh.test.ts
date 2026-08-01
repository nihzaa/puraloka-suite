import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import XLSX from 'xlsx'
import { bacaBoQ, bacaRentangSubtotal, periksaKonsistensi } from '../golden-boq-adapter'

/**
 * PARITAS GOLDEN — RAB nyata Rp 3,63 M (ROADMAP #17).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Klaim "kemampuan sistem = Excel" selama berbulan-bulan hanya terbukti pada
 * level HSP per item. Yang belum pernah dibuktikan: apakah SELURUH DOKUMEN —
 * 55 item, 9 divisi, Rp 3,63 miliar — terbaca dan terjumlah persis sama.
 *
 * Perbedaannya bukan akademis. Kesalahan yang tak terlihat per item menumpuk
 * jadi ratusan juta di level dokumen. Hari yang sama test ini ditulis, Kurva-S
 * ketahuan kehilangan Rp 755,7 juta dari AC selama berbulan-bulan — cacat yang
 * bertahan justru karena tak ada yang membandingkannya dengan angka nyata.
 *
 * ── Yang diuji: KONSISTENSI INTERNAL Excel
 *
 * Tiga level, dari bawah ke atas (GOLDEN-FILE-SPEC §D):
 *   1. item.jumlah    = volume × harga satuan
 *   2. divisi.subtotal = Σ item DI DALAM rentang SUM-nya
 *   3. total          = Σ subtotal divisi
 *
 * Ini menetapkan apakah dokumen sumbernya layak jadi acuan. Kalau Excel-nya
 * sendiri tak konsisten, "sistem berbeda dari Excel" jadi pernyataan tanpa
 * makna — berbeda dari yang mana?
 *
 * ── Kenapa di-skip bila berkasnya tak ada
 *
 * `_source/` ter-gitignore (berisi angka RAB nyata & harga yang tak boleh
 * masuk repo). Di CI berkasnya tak ada, jadi test ini SKIP — bukan gagal.
 * Test yang merah karena berkas yang memang sengaja tak di-commit akan
 * melatih orang mengabaikan CI merah, dan itu jauh lebih berbahaya.
 */

const BERKAS = join(
  import.meta.dirname, '..', '..', '..', '..', '..',
  '_source', 'ahsp', 'golden', 'RAB Gudang Cibuluh Sumedang bobot.xlsx',
)
const ada = existsSync(BERKAS)

/** Angka yang tertulis di dokumen — dicatat supaya perubahan berkas terdeteksi. */
const HARAPAN = {
  divisi: 9,
  item: 55,
  totalBiaya: 3_629_860_295.31,
  /** Rp 37.876.001 di luar rentang SUM — Retaining Wall yang TIDAK jadi
   *  dikerjakan (dikonfirmasi founder 2026-08-01). Dikunci sebagai acuan. */
  diLuarSubtotal: 37_876_001,
} as const

describe.skipIf(!ada)('Paritas golden — RAB Gudang Cibuluh Sumedang (Rp 3,63 M)', () => {
  const wb = ada ? XLSX.read(readFileSync(BERKAS), { type: 'buffer', cellFormula: true }) : null
  const ws = wb?.Sheets['BoQ']
  const hasil = ws
    ? bacaBoQ(
        XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }),
        bacaRentangSubtotal(ws as Record<string, { f?: string }>),
      )
    : null

  it('membaca struktur dokumen: 9 divisi, 55 item', () => {
    expect(hasil!.divisi).toHaveLength(HARAPAN.divisi)
    const item = hasil!.divisi.reduce((s, d) => s + d.items.length, 0)
    expect(item).toBe(HARAPAN.item)
  })

  it('TOTAL BIAYA terbaca persis Rp 3.629.860.295,31', () => {
    expect(hasil!.totalTertulis).toBeCloseTo(HARAPAN.totalBiaya, 2)
  })

  it('KONSISTEN sampai rupiah di ketiga level — nol selisih', () => {
    const lap = periksaKonsistensi(hasil!)
    // Pesan kegagalan menyebut lokasinya, bukan cuma "ada selisih". Dengan 65
    // pemeriksaan, "gagal" tanpa lokasi memaksa orang mencari sendiri.
    const gagal = lap.periksa.filter((p) => !p.lolos)
      .map((p) => `${p.level} ${p.label}: Excel ${p.excel} vs hitung ${p.hitung} (selisih ${p.selisih})`)
    expect(gagal).toEqual([])
    expect(lap.totalSelisihAbsolut).toBe(0)
    expect(lap.jumlahPeriksa).toBeGreaterThan(60)
  })

  it('Rp 37,8 juta di luar subtotal — DISENGAJA, dikonfirmasi founder', () => {
    // Rumus subtotal divisi III berbunyi `=SUM(Q34:Q65)` sementara "Retaining
    // Wall" ada di baris 30–33, jadi Rp 37.876.001 tertulis di dokumen tapi tak
    // ikut dijumlahkan.
    //
    // ✅ TERJAWAB 2026-08-01 — founder: **"tidak dikerjakan retaining wall itu"**.
    // Jadi ini DISENGAJA: pekerjaannya batal, barisnya ditinggal sebagai
    // catatan, dan rentang SUM yang melewatinya memang benar. Total
    // Rp 3.629.860.295,31 SAHIH — RAB tidak kurang Rp 37,8 juta.
    //
    // Angkanya tetap di-assert, tapi alasannya kini BERBEDA: bukan lagi
    // "sedang dipertanyakan", melainkan supaya perubahan pada dokumen acuan
    // tak lewat begitu saja. Kalau angkanya bergeser, dokumennya disunting —
    // dan itu harus disadari, bukan diam-diam mengubah golden file.
    const total = hasil!.diLuarSubtotal.reduce((s, x) => s + x.nilai, 0)
    expect(Math.round(total)).toBe(HARAPAN.diLuarSubtotal)
    expect(hasil!.catatan.some((c) => c.includes('DI LUAR'))).toBe(true)
  })

  it('anomali penomoran dilaporkan, bukan didiamkan', () => {
    // Dokumen ini punya `IV.` dua kali (PEKERJAAN BAJA & PEKERJAAN PASANGAN).
    // Sistem membedakannya otomatis agar ketertelusuran terjaga, TAPI tetap
    // melaporkannya — memperbaiki diam-diam berarti founder tak pernah tahu
    // penomoran dokumennya perlu dirapikan.
    expect(hasil!.catatan.some((c) => c.includes('muncul 2×'))).toBe(true)
  })
})

describe.skipIf(ada)('Paritas golden — berkas tak tersedia', () => {
  it('dilewati karena `_source/` ter-gitignore (bukan kegagalan)', () => {
    expect(ada).toBe(false)
  })
})
