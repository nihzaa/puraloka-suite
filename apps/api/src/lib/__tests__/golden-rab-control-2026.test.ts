import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import XLSX from 'xlsx'

/**
 * PARITAS GOLDEN KEDUA — Engineering Estimate SE-47, Rp 1,66 M (F0-10).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mandat audit menyebut lima angka jangkar untuk mengunci mesin perhitungan.
 * Dua di antaranya (`278300`, `266600`) sudah lama diuji `ahsp-engine.test.ts`,
 * dan total RAB Cibuluh (Rp 3,63 M) dikunci `golden-cibuluh.test.ts`.
 *
 * Tiga sisanya — `1.657.839.590,39`, `109,5`, `7875` — sempat dilaporkan
 * "tidak ditemukan", dan laporan itu SALAH: pencariannya hanya menyentuh
 * `_source/ahsp/golden/`, bukan `_source/ahsp/` seluruhnya. Setelah founder
 * meminta sapuan diperluas (R-005), ketiganya ketemu di berkas LAIN:
 *
 *     Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm  (23 MB, 117 sheet)
 *
 * Ini **proyek yang berbeda** dari Cibuluh, bukan versi lain dari angka yang
 * sama: Engineering Estimate template SE-47 (Rp 1,66 M, 8 divisi A–H) vs RAB
 * gudang nyata (Rp 3,63 M, 9 divisi, 55 item). Itulah jawaban atas pertanyaan
 * mandat "kenapa 3.629.860.295,31 ≠ 1.657.839.590,39".
 *
 * ── Yang diuji: KONSISTENSI INTERNAL, bukan sekadar nilai sel
 *
 * Menguji `E18 === 1657839590,39` saja lemah — ia hanya membuktikan berkasnya
 * tak berubah, bukan bahwa angkanya bermakna. Yang dikunci di sini adalah
 * RANTAI ARITMETIKANYA:
 *
 *   1. Σ subtotal 8 divisi (E10:E17) = TOTAL BIAYA (E18)
 *   2. TOTAL BIAYA × tarif PPN (D19) = nilai PPN (E19)
 *   3. TOTAL BIAYA + PPN            = TOTAL akhir (E20)
 *   4. volume × harga satuan        = jumlah baris (LAPORAN RAB)
 *
 * Kalau salah satu rantai putus, dokumennya sendiri tak konsisten — dan
 * "sistem berbeda dari Excel" jadi pernyataan tanpa makna.
 *
 * ── Temuan yang dikunci di sini: PPN DUA-ANGKA
 *
 * Baris PPN berlabel **"PPN 11%"** tetapi pengalinya **0,12** (D19), dan
 * hasilnya cocok sampai desimal. Ini persis model dua-angka yang dijaga
 * `ppn-dpp-guardrail.test.ts` (`ppn_rate 0,12 × dpp_factor 11/12`) — dan
 * membuktikan model itu **berasal dari praktik dokumen nyata**, bukan karangan.
 *
 * Guardrail itu sendiri masih melaporkan dirinya *vacuous* (nol record ber-PPN
 * di lingkungan uji). Test ini menutup sebagian celah itu dari sisi dokumen.
 *
 * ── Kenapa di-skip bila berkasnya tak ada
 *
 * `_source/` ter-gitignore (berisi angka RAB & harga nyata yang tak boleh masuk
 * repo publik). Di CI berkasnya tak ada, jadi test ini SKIP — bukan gagal.
 * Test yang merah karena berkas yang memang sengaja tak di-commit akan melatih
 * orang mengabaikan CI merah, dan itu jauh lebih berbahaya daripada satu test
 * yang tak berjalan. Pola ini sama dengan `golden-cibuluh.test.ts`.
 */

const BERKAS = join(
  import.meta.dirname, '..', '..', '..', '..', '..',
  '_source', 'ahsp', 'Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm',
)
const ada = existsSync(BERKAS)

/**
 * Angka jangkar apa adanya dari dokumen.
 *
 * Nilai mentahnya menyimpan ekor pecahan (mis. `1657839590.3853106`) karena
 * Excel menjumlah float; yang tercetak di dokumen adalah versi 2 desimal.
 * Toleransi 0,01 dipakai agar test menguji NILAI, bukan cara Excel menyimpan.
 */
const JANGKAR = {
  totalBiaya: 1_657_839_590.39,   // REKAPITULASI!E18 — sebelum PPN
  tarifPpn: 0.12,                 // REKAPITULASI!D19 — label "11%", pengali 0,12
  nilaiPpn: 198_940_750.85,       // REKAPITULASI!E19
  totalAkhir: 1_856_780_341.23,   // REKAPITULASI!E20
  volumeBata: 109.5,              // LAPORAN RAB!H114 — m² pasangan bata ½ batu
  hargaSatuanBata: 146_308.162,   // LAPORAN RAB!I114
  jumlahBata: 16_020_743.739,     // LAPORAN RAB!J114
  buahBataPerSatuan: 7_875,       // DINDING BATA MERAH!L41 — koefisien kebutuhan
  jumlahDivisi: 8,                // A–H
} as const

const wb = ada ? XLSX.read(readFileSync(BERKAS), { type: 'buffer' }) : null
const sel = (sheet: string, alamat: string): unknown =>
  (wb?.Sheets[sheet] as Record<string, { v?: unknown }> | undefined)?.[alamat]?.v

describe.skipIf(!ada)('Paritas golden — Engineering Estimate SE-47 (Rp 1,66 M)', () => {
  it('berkas terbaca & sheet kunci ada', () => {
    expect(wb).not.toBeNull()
    for (const s of ['REKAPITULASI', 'LAPORAN RAB', 'DINDING BATA MERAH']) {
      expect(wb!.SheetNames, `sheet '${s}' hilang`).toContain(s)
    }
  })

  it('TOTAL BIAYA = Rp 1.657.839.590,39 (jangkar mandat)', () => {
    expect(sel('REKAPITULASI', 'C18')).toBe('TOTAL BIAYA')
    expect(sel('REKAPITULASI', 'E18') as number).toBeCloseTo(JANGKAR.totalBiaya, 1)
  })

  it('Σ subtotal 8 divisi = TOTAL BIAYA (rantai 1)', () => {
    // Kalau ini putus, "total" hanyalah angka yang diketik, bukan hasil hitung.
    let jumlah = 0
    let divisi = 0
    for (let r = 10; r <= 17; r++) {
      const v = sel('REKAPITULASI', `E${r}`)
      if (typeof v === 'number') { jumlah += v; divisi++ }
    }
    expect(divisi, 'jumlah divisi berubah — struktur dokumen bergeser').toBe(JANGKAR.jumlahDivisi)
    expect(jumlah).toBeCloseTo(sel('REKAPITULASI', 'E18') as number, 1)
  })

  it('PPN berlabel "11%" tetapi pengalinya 0,12 — dan hasilnya cocok (rantai 2)', () => {
    // Inilah bukti dokumenter model PPN dua-angka. Label dan pengali memang
    // BERBEDA di praktik nyata; sistem harus meniru keduanya, bukan memilih satu.
    expect(String(sel('REKAPITULASI', 'C19'))).toMatch(/PPN\s+11%/)
    expect(sel('REKAPITULASI', 'D19') as number).toBeCloseTo(JANGKAR.tarifPpn, 4)

    const total = sel('REKAPITULASI', 'E18') as number
    const tarif = sel('REKAPITULASI', 'D19') as number
    expect(total * tarif).toBeCloseTo(sel('REKAPITULASI', 'E19') as number, 1)
    expect(sel('REKAPITULASI', 'E19') as number).toBeCloseTo(JANGKAR.nilaiPpn, 1)
  })

  it('TOTAL BIAYA + PPN = TOTAL akhir (rantai 3)', () => {
    const t = sel('REKAPITULASI', 'E18') as number
    const p = sel('REKAPITULASI', 'E19') as number
    expect(t + p).toBeCloseTo(sel('REKAPITULASI', 'E20') as number, 1)
    expect(sel('REKAPITULASI', 'E20') as number).toBeCloseTo(JANGKAR.totalAkhir, 1)
  })

  it('volume 109,5 m² × harga satuan = jumlah baris (rantai 4, jangkar mandat)', () => {
    // `109,5` adalah VOLUME (m² pasangan bata merah ½ batu 1SP:3PP) — bukan
    // koefisien, seperti sempat diduga sebelum sumbernya ditemukan.
    expect(String(sel('LAPORAN RAB', 'F114'))).toMatch(/Bata Merah/i)
    expect(String(sel('LAPORAN RAB', 'G114'))).toMatch(/M2/i)

    const vol = sel('LAPORAN RAB', 'H114') as number
    const harga = sel('LAPORAN RAB', 'I114') as number
    const jumlah = sel('LAPORAN RAB', 'J114') as number

    expect(vol).toBeCloseTo(JANGKAR.volumeBata, 3)
    expect(harga).toBeCloseTo(JANGKAR.hargaSatuanBata, 2)
    expect(vol * harga).toBeCloseTo(jumlah, 2)
    expect(jumlah).toBeCloseTo(JANGKAR.jumlahBata, 2)
  })

  it('koefisien 7875 buah bata — jangkar mandat, dengan satuannya', () => {
    // Dikunci BERSAMA label & satuannya. Angka telanjang `7875` bisa muncul di
    // mana saja; yang bermakna adalah "7875 Buah bata merah".
    expect(sel('DINDING BATA MERAH', 'L41') as number).toBe(JANGKAR.buahBataPerSatuan)
    expect(String(sel('DINDING BATA MERAH', 'I41'))).toMatch(/Bata Merah/i)
    expect(String(sel('DINDING BATA MERAH', 'M41'))).toMatch(/Buah/i)
  })

  it('BERBEDA dari golden Cibuluh — dua proyek, bukan dua versi angka yang sama', () => {
    // Menjawab pertanyaan mandat secara eksplisit, dan menjaga agar kedua golden
    // file tak pernah tertukar: kalau suatu saat keduanya menghasilkan total yang
    // sama, salah satu berkas pasti tergantikan tanpa disadari.
    const CIBULUH = 3_629_860_295.31
    expect(sel('REKAPITULASI', 'E18') as number).not.toBeCloseTo(CIBULUH, 1)
    expect(Math.abs((sel('REKAPITULASI', 'E18') as number) - CIBULUH)).toBeGreaterThan(1_000_000_000)
  })
})

describe.skipIf(ada)('Paritas golden SE-47 — berkas tak tersedia', () => {
  it('dilewati: _source/ ter-gitignore, jadi tak ada di CI', () => {
    expect(ada).toBe(false)
  })
})
