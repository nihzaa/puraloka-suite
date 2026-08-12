/**
 * A2 — penyusunan jurnal penyusutan (murni, tanpa basis).
 *
 * Jalur nyatanya — penulisan ke `journal_entries` dan pengisian
 * `penyusutan_alat.journal_entry_id` — diuji di
 * `routes/v1/__tests__/penyusutan-jurnal.test.ts` terhadap Postgres sungguhan.
 */
import { describe, it, expect } from 'vitest'
import {
  susunJurnalPenyusutan, seimbang,
  AKUN_BEBAN_PENYUSUTAN, AKUN_AKUMULASI_PENYUSUTAN,
} from '../jurnal-penyusutan.js'

const B = (nilai: unknown, periode = '2026-05-31', namaAlat = 'Excavator') =>
  ({ id: crypto.randomUUID(), periode, nilai, namaAlat } as never)

describe('bentuk jurnal', () => {
  it('debit beban + kredit akumulasi, jumlah sama besar', () => {
    const h = susunJurnalPenyusutan([B(18_000_000), B(2_500_000, '2026-05-31', 'Molen')])
    expect(h.ok).toBe(true)
    if (!h.ok) return

    const debit = h.lines.filter(l => l.debit > 0)
    const kredit = h.lines.filter(l => l.credit > 0)
    expect(debit).toHaveLength(2)
    expect(kredit).toHaveLength(1)
    expect(debit.every(l => l.account_code === AKUN_BEBAN_PENYUSUTAN)).toBe(true)
    expect(kredit[0].account_code).toBe(AKUN_AKUMULASI_PENYUSUTAN)
    expect(h.total).toBe(20_500_000)
    expect(seimbang(h.lines)).toBe(true)
  })

  it('sisi kredit DIRINGKAS jadi satu baris', () => {
    // Memecahnya per alat tak menambah informasi apa pun — akumulasi
    // penyusutan satu akun, dan rinciannya sudah ada di sisi debit.
    const h = susunJurnalPenyusutan([B(1), B(2), B(3)])
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.lines.filter(l => l.credit > 0)).toHaveLength(1)
  })

  it('keterangan baris debit menyebut nama alatnya', () => {
    // Rincian per-alat harus tetap terbaca di buku besar meski jurnalnya satu.
    const h = susunJurnalPenyusutan([B(1_000, '2026-05-31', 'Genset 10kVA')])
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.lines[0].description).toMatch(/Genset 10kVA/)
  })

  it('tanggal jurnal = periode penyusutannya', () => {
    const h = susunJurnalPenyusutan([B(1_000, '2026-03-31')])
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.entryDate).toBe('2026-03-31')
  })
})

describe('penolakan', () => {
  it('nol baris ditolak', () => {
    const h = susunJurnalPenyusutan([])
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.sebab).toMatch(/tak ada baris/i)
  })

  it('periode BERBEDA dalam satu jurnal ditolak', () => {
    // Mencampur periode membuat beban Mei tercatat bertanggal Juni. Total
    // setahunnya tetap benar, jadi tak ada yang menemukannya sampai
    // seseorang membandingkan laba per bulan.
    const h = susunJurnalPenyusutan([B(1_000, '2026-05-31'), B(1_000, '2026-06-30')])
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.sebab).toMatch(/periode berbeda/i)
  })

  it('nilai nol ditolak', () => {
    // Jurnal bernilai nol LOLOS pemeriksaan seimbang (0 = 0) dan menambah
    // baris yang tak berarti apa-apa.
    const h = susunJurnalPenyusutan([B(0)])
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.sebab).toMatch(/lebih dari nol/i)
  })

  it('nilai negatif ditolak', () => {
    const h = susunJurnalPenyusutan([B(-500_000)])
    expect(h.ok).toBe(false)
  })

  it('nilai kosong ditolak SEBELUM konversi', () => {
    // `Number('') === 0`, bukan NaN — kelas cacat yang berulang di repo ini.
    // Kalau pemeriksaannya sesudah konversi, string kosong lolos jadi nol.
    for (const v of ['', null, undefined]) {
      const h = susunJurnalPenyusutan([B(v)])
      expect(h.ok, String(v)).toBe(false)
      if (!h.ok) expect(h.sebab).toMatch(/tanpa nilai/i)
    }
  })

  it('nilai tak terbaca ditolak', () => {
    const h = susunJurnalPenyusutan([B('sejuta')])
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.sebab).toMatch(/tak terbaca/i)
  })
})

describe('nominal — numeric, bukan float', () => {
  it('nilai bertipe STRING dari numeric Postgres diterima apa adanya', () => {
    // Driver pg memulangkan `numeric` sebagai string supaya presisinya tak
    // hilang. Menolaknya berarti seluruh baris dari basis ditolak.
    const h = susunJurnalPenyusutan([B('18000000.00')])
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.total).toBe(18_000_000)
  })

  it('pecahan sen tetap seimbang', () => {
    const h = susunJurnalPenyusutan([B('0.10'), B('0.20')])
    expect(h.ok).toBe(true)
    if (h.ok) {
      // 0.1 + 0.2 = 0.30000000000000004 di IEEE754. Kalau pembulatannya
      // lalai, sisi debit dan kredit berbeda dan trigger basis menolak
      // seluruh jurnal.
      expect(h.total).toBe(0.3)
      expect(seimbang(h.lines)).toBe(true)
    }
  })
})
