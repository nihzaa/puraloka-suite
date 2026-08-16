/**
 * IKHTISAR PERUSAHAAN (2.17 + 8.9) — angka yang dibawa ke bank.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU TOOL UNTUK DUA NOMOR, DAN ITU DISENGAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2.17 "Financial Report Auto-Generation" dan 8.9 "Board/Investor Report"
 * meminta hal yang sama dari sudut berbeda: ringkasan keadaan perusahaan.
 * Bedanya cuma siapa yang membaca.
 *
 * Membuat dua tool berarti dua tempat menghitung angka yang sama — dan yang
 * kedua akan menyimpang. Bank yang menerima Rp 6,06 miliar dari satu laporan
 * dan Rp 5,9 miliar dari laporan lain berhenti memercayai keduanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA ANGKA YANG SERING TERTUKAR — DAN DI SINI DIPISAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16:
 *
 *   nilai kontrak berjalan   Rp 6.060.000.000   ← yang DIJANJIKAN
 *   sudah ditagih            Rp 2.092.560.000   ← yang sudah jadi invoice
 *   sudah diterima           Rp 1.992.165.000   ← yang benar-benar masuk
 *
 * Ketiganya sering disebut "omzet" bergantian, dan selisihnya Rp 4 miliar.
 * Laporan yang menyebut satu angka tanpa menamainya membuat pembacanya
 * menyimpulkan hal yang berbeda dari maksud penulisnya — dan untuk laporan
 * yang dibawa ke bank, itu bukan kesalahpahaman kecil.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIDAK ADA RASIO YANG DIKARANG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang TIDAK dihitung di sini: margin, laba, ROI, dan proyeksi pertumbuhan.
 * Ketiganya menuntut biaya per proyek yang lengkap — diukur, hanya 4 dari 13
 * proyek punya pengeluaran tercatat (lihat `ai-tool-serapan-biaya.ts`).
 *
 * Angka "laba" yang dihitung dari data seperempat lengkap akan terlihat
 * bagus dan salah. Untuk laporan yang dibawa ke pihak luar, kesalahan itu
 * bukan cuma memalukan — ia menyesatkan keputusan kredit.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, rupiah } from './ai-tool-dasar.js'

interface BarisProyek {
  id: string
  status: string | null
  contract_value: unknown
}

export const toolIkhtisar: DefinisiToolAi = {
  nama: 'ikhtisar_perusahaan',
  label: 'Ikhtisar perusahaan',
  keterangan:
    'Ringkasan keadaan perusahaan: jumlah proyek per status, nilai kontrak berjalan, yang ' +
    'sudah ditagih, yang sudah diterima, piutang, dan saldo kas. Pakai untuk "bagaimana ' +
    'keadaan perusahaan", "buatkan ringkasan untuk bank", "laporan bulanan". Ketiga angka ' +
    'pendapatan DIPISAH namanya — jangan menyebutnya "omzet" begitu saja.',
  izin: 'finance:view',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    // ── Proyek ────────────────────────────────────────────────────────────
    const { data: pr, error: errPr } = await db
      .from('projects')
      .select('id, status, contract_value')
      .eq('is_deleted', false)
      .limit(1000)

    if (errPr) {
      return { isi: `Gagal membaca proyek: ${errPr.message}`, isError: true, entitas: [] }
    }

    const proyek = (pr ?? []) as unknown as BarisProyek[]
    if (proyek.length === 0) {
      return {
        isi: bungkusData('ikhtisar', 'Belum ada proyek.'),
        isError: false,
        entitas: [],
      }
    }

    const perStatus = new Map<string, number>()
    for (const p of proyek) {
      const s = p.status ?? 'tanpa status'
      perStatus.set(s, (perStatus.get(s) ?? 0) + 1)
    }

    const berjalan = proyek.filter((p) => p.status === 'active' || p.status === 'on_hold')
    const nilaiBerjalan = berjalan.reduce((s, p) => s + (Number(p.contract_value) || 0), 0)

    // ── Invoice: ditagih vs diterima ──────────────────────────────────────
    const { data: iv, error: errIv } = await db
      .unsafe('invoices', 'tool AI: ikhtisar keuangan lintas proyek milik tenant, disaring project_id')
      .select('total_amount, amount_paid, amount_due, status')
      .in('project_id', proyek.map((p) => p.id))
      .limit(1000)

    if (errIv) {
      return { isi: `Gagal membaca invoice: ${errIv.message}`, isError: true, entitas: [] }
    }

    type Inv = { total_amount: unknown; amount_paid: unknown; amount_due: unknown; status: string }
    const invoices = (iv ?? []) as unknown as Inv[]

    const ditagih = invoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
    const diterima = invoices.reduce((s, i) => s + (Number(i.amount_paid) || 0), 0)
    const piutang = invoices
      .filter((i) => i.status !== 'paid')
      .reduce((s, i) => s + (Number(i.amount_due) || 0), 0)

    // ── Kas ───────────────────────────────────────────────────────────────
    const { data: kas } = await db
      .from('cash_accounts')
      .select('balance, is_active')
      .limit(200)

    const saldo = ((kas ?? []) as unknown as Array<{ balance: unknown; is_active: boolean | null }>)
      .filter((r) => r.is_active !== false)
      .reduce((s, r) => s + (Number(r.balance) || 0), 0)

    // ── Hutang supplier ───────────────────────────────────────────────────
    const { data: sup } = await db
      .from('supplier_invoices')
      .select('amount_due, status')
      .neq('status', 'paid')
      .limit(500)

    const hutang = ((sup ?? []) as unknown as Array<{ amount_due: unknown }>)
      .reduce((s, b) => s + (Number(b.amount_due) || 0), 0)

    const urutStatus = ['active', 'on_hold', 'completed', 'draft']
    const daftarStatus = [...perStatus.entries()].sort(
      (a, b) => urutStatus.indexOf(a[0]) - urutStatus.indexOf(b[0]),
    )

    const bagian: string[] = [
      `PROYEK (${proyek.length} total)`,
      ...daftarStatus.map(([s, n]) => `  ${s}: ${n}`),
      '',
      'NILAI',
      `  Kontrak berjalan : ${rupiah(nilaiBerjalan)}   (${berjalan.length} proyek aktif/ditahan)`,
      `  Sudah ditagih    : ${rupiah(ditagih)}`,
      `  Sudah diterima   : ${rupiah(diterima)}`,
      `  Piutang berjalan : ${rupiah(piutang)}`,
      '',
      'KAS',
      `  Saldo rekening   : ${rupiah(saldo)}`,
      `  Hutang supplier  : ${rupiah(hutang)}`,
      `  Selisih          : ${rupiah(saldo - hutang)}` +
        (saldo - hutang < 0 ? '  ⚠ MINUS' : ''),
      '',
      /*
       * Ketiga angka DINAMAI, dan bedanya dijelaskan.
       *
       * "Kontrak berjalan", "ditagih", dan "diterima" sering disebut "omzet"
       * bergantian, dan selisihnya di sini miliaran. Pembaca yang menyimpulkan
       * angka yang salah dari laporan yang dibawa ke bank bukan
       * kesalahpahaman kecil.
       */
      'Ketiga angka nilai BERBEDA artinya: "kontrak berjalan" yang dijanjikan,',
      '"ditagih" yang sudah jadi invoice, "diterima" yang benar-benar masuk.',
      'Jangan menyebut salah satunya sebagai "omzet" tanpa menyebut yang mana.',
      '',
      'TIDAK dihitung di sini: margin, laba, dan ROI — keduanya menuntut biaya',
      'per proyek yang lengkap, dan hanya sebagian proyek punya pengeluaran',
      'tercatat. Angka laba dari data separuh lengkap akan terlihat bagus dan',
      'salah.',
    ]

    return {
      isi: bungkusData('ikhtisar', bagian.join('\n')),
      isError: false,
      entitas: [],
    }
  },
}
