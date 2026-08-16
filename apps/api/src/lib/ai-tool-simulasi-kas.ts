/**
 * SIMULASI KAS (8.1) — "kalau saya bayar supplier X minggu ini, bagaimana?"
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA TOOL YANG MENJAWAB PERTANYAAN ANDAI-ANDAI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tool lain menjawab "bagaimana keadaannya". Yang ini menjawab "bagaimana
 * JADINYA kalau" — dan bedanya menentukan cara ia bisa salah.
 *
 * Nominalnya datang dari KALIMAT, bukan dari basis. Model bisa salah dengar
 * ("lima puluh juta" untuk "lima juta"), dan angka yang salah di sini
 * menghasilkan kesimpulan "aman" untuk keputusan yang sebenarnya menguras kas.
 *
 * Karena itu: nominal divalidasi, dan yang disimulasikan SELALU disebut
 * kembali dalam kalimat jawaban. Pengguna yang melihat "Rp 50.000.000" di
 * ringkasan tahu ia salah didengar sebelum memutuskan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MEMBANDINGKAN DUA KEADAAN, BUKAN MENYEBUT SATU ANGKA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Sisa kas Rp 170 juta" tak berarti apa-apa sendirian. Yang berarti:
 * **sebelum vs sesudah**, plus apakah kewajiban yang sudah terjadwal masih
 * tertutup.
 *
 * Yang dihitung, memakai sumber yang sama dengan 2.4 supaya dua angka tak
 * pernah berselisih:
 *
 *   saldo sekarang − nominal simulasi = sisa
 *   sisa vs tagihan supplier yang jatuh tempo 30 hari
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIDAK MENYIMPAN APA PUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Simulasi adalah pertanyaan, bukan tindakan. Tool ini murni membaca —
 * `audit-tool-ai-read-only` berambang NOL dan tetap hijau. Kalau pembayarannya
 * benar-benar dilakukan, ia lewat halaman Pembayaran seperti biasa.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong, rupiah } from './ai-tool-dasar.js'

/**
 * Batas atas nominal yang boleh disimulasikan.
 *
 * Bukan batas pembayaran — ini batas KEWARASAN. Angka di atas satu triliun
 * hampir pasti salah dengar atau salah ketik nol, dan menjawabnya dengan
 * perhitungan serius membuat kekeliruannya terlihat seperti hasil yang sah.
 */
const BATAS_SIMULASI = 1_000_000_000_000

/** Jendela kewajiban yang diperiksa. Sama dengan jendela pertama di 2.4. */
const HARI_JENDELA = 30

export const toolSimulasiKas: DefinisiToolAi = {
  nama: 'simulasi_kas',
  label: 'Simulasi pengeluaran kas',
  keterangan:
    'Menghitung dampak SATU pengeluaran hipotetis terhadap kas: sisa saldo, dan apakah ' +
    'kewajiban 30 hari ke depan masih tertutup. Pakai untuk "kalau saya bayar X sekarang ' +
    'bagaimana", "sanggup tidak kalau keluar sekian". Nominal datang dari kalimat pengguna — ' +
    'SEBUTKAN KEMBALI angkanya di jawaban supaya salah dengar ketahuan sebelum diputuskan. ' +
    'Tool ini tidak menyimpan apa pun.',
  izin: 'finance:view',
  skema: {
    type: 'object',
    properties: {
      nominal: {
        type: 'number',
        description: 'Nominal rupiah yang akan dikeluarkan, angka saja.',
      },
      keterangan: {
        type: 'string',
        description: 'Untuk apa/ke siapa — dipakai menyebut ulang di jawaban.',
      },
    },
    required: ['nominal'],
  },
  async jalan({ db }, argumen) {
    const nominal = Number(argumen.nominal)

    if (!Number.isFinite(nominal) || nominal <= 0) {
      return {
        isi: 'Nominalnya berapa? Sebutkan angka rupiah lebih dari 0.',
        isError: true,
        entitas: [],
      }
    }
    if (nominal > BATAS_SIMULASI) {
      /*
       * Ditolak, bukan dihitung.
       *
       * Menjawabnya dengan perhitungan serius membuat salah ketik nol terlihat
       * seperti hasil yang sah — dan yang membacanya menyimpulkan kasnya jauh
       * lebih buruk daripada kenyataan.
       */
      return {
        isi: `Nominal ${rupiah(nominal)} tak masuk akal untuk disimulasikan. `
          + 'Pastikan dulu angkanya benar.',
        isError: true,
        entitas: [],
      }
    }

    const untuk = typeof argumen.keterangan === 'string' ? argumen.keterangan.trim() : ''

    // ── Saldo sekarang — sumber yang SAMA dengan 2.4 ──────────────────────
    const { data: kas, error: errKas } = await db
      .from('cash_accounts')
      .select('name, balance, is_active')
      .limit(100)

    if (errKas) {
      return { isi: `Gagal membaca saldo kas: ${errKas.message}`, isError: true, entitas: [] }
    }

    const rekening = ((kas ?? []) as unknown as Array<{
      name: string; balance: unknown; is_active: boolean | null
    }>).filter((r) => r.is_active !== false)

    const saldo = rekening.reduce((s, r) => s + (Number(r.balance) || 0), 0)
    const sisa = saldo - nominal

    // ── Kewajiban yang sudah terjadwal dalam 30 hari ──────────────────────
    const { data: sup, error: errSup } = await db
      .from('supplier_invoices')
      .select('invoice_number, amount_due, due_date, status')
      .neq('status', 'paid')
      .limit(500)

    if (errSup) {
      return { isi: `Gagal membaca tagihan: ${errSup.message}`, isError: true, entitas: [] }
    }

    type B = { invoice_number: string | null; amount_due: unknown; due_date: string | null }
    const semua = (sup ?? []) as unknown as B[]

    /*
     * Termasuk yang SUDAH lewat tempo.
     *
     * Yang lewat justru paling mengikat: ia kewajiban yang seharusnya sudah
     * dibayar. Mengeluarkannya membuat sisa kas terlihat lebih longgar
     * daripada kenyataannya — arah kesalahan yang paling berbahaya di sini.
     */
    const jatuh = semua.filter((b) => {
      if (!b.due_date) return false
      const n = Math.floor((new Date(b.due_date).getTime() - Date.now()) / 86_400_000)
      return Number.isFinite(n) && n <= HARI_JENDELA
    })

    const kewajiban = jatuh.reduce((s, b) => s + (Number(b.amount_due) || 0), 0)
    const setelahKewajiban = sisa - kewajiban

    const bagian: string[] = [
      `Simulasi: mengeluarkan ${rupiah(nominal)}${untuk ? ` untuk ${untuk}` : ''}.`,
      '',
      `Saldo sekarang : ${rupiah(saldo)}`,
      `Sesudah keluar : ${rupiah(sisa)}${sisa < 0 ? '  ⚠ MINUS' : ''}`,
    ]

    if (kewajiban > 0) {
      bagian.push(
        `Kewajiban ${HARI_JENDELA} hari : ${rupiah(kewajiban)} (${jatuh.length} tagihan supplier)`,
        `Sisa setelah itu : ${rupiah(setelahKewajiban)}` +
          (setelahKewajiban < 0 ? '  ⚠ TIDAK CUKUP' : ''),
      )

      if (setelahKewajiban < 0) {
        const { data: tampil, dipotong } = potong(jatuh)
        bagian.push(
          '',
          'Tagihan yang jatuh tempo di jendela itu:',
          ...tampil.map(
            (b) => `· ${b.invoice_number ?? '-'}: ${rupiah(Number(b.amount_due) || 0)}` +
              (b.due_date ? ` (${String(b.due_date).slice(0, 10)})` : ''),
          ),
          ...(dipotong > 0 ? [`… dan ${dipotong} lagi.`] : []),
        )
      }
    } else {
      bagian.push(`Kewajiban ${HARI_JENDELA} hari : tak ada tagihan supplier jatuh tempo.`)
    }

    bagian.push(
      '',
      `Angka yang disimulasikan: ${rupiah(nominal)} — pastikan ini yang Anda maksud.`,
      'Yang dihitung hanya kas dan tagihan supplier yang sudah berdokumen; gaji,',
      'biaya rutin, dan uang masuk yang belum tertagih TIDAK termasuk.',
      'Tidak ada yang tersimpan — ini perhitungan, bukan pembayaran.',
    )

    return {
      isi: bungkusData('simulasi_kas', bagian.join('\n')),
      isError: false,
      entitas: [],
    }
  },
}
