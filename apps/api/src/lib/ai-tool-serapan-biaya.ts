/**
 * SERAPAN BIAYA vs PROGRES (8.4) — "uangnya mendahului pekerjaannya?"
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN "SIMULASI PROFITABILITAS" SEPERTI JUDUL KATALOGNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog 8.4 menyebut "Profitability Simulation dengan parameter berbeda
 * (skenario RAB)". Diukur 2026-08-16 sebelum ditulis, dan hasilnya membatalkan
 * bentuk itu:
 *
 *   proyek berjalan            13
 *   punya RAB                   2
 *   RAB > nilai kontrak         2   ← KEDUANYA
 *
 * Contoh: Rumah Bu Sari — kontrak Rp 1.095 juta, RAB Rp 3.630 juta. Tool yang
 * menghitung margin dari RAB akan melaporkan rugi Rp 2,5 miliar untuk proyek
 * yang tidak rugi — angka yang salah, disajikan dengan penuh keyakinan, di
 * layar yang dipakai memutuskan.
 *
 * Membangunnya tetap berarti membuat alat yang berbohong untuk 11 dari 13
 * proyek (nol RAB → "margin 100%") dan untuk 2 sisanya (RAB seed → "rugi
 * total"). Itu lebih buruk daripada tak ada alat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBANGUN: SERAPAN BIAYA TERHADAP PROGRES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang bisa dipercaya: uang yang BENAR-BENAR keluar (pengeluaran disetujui +
 * kasbon disetujui/lunas) dibandingkan `contract_value` dan `progress_pct` —
 * ketiganya terisi untuk seluruh 13 proyek.
 *
 * Sinyalnya: **selisih serapan − progres**.
 *
 *   +22  Renovasi Pak Andi: 74% uang keluar, 52% pekerjaan   ← uang mendahului
 *   -72  Renovasi Dapur   : 13% uang keluar, 85% pekerjaan   ← belum tercatat
 *
 * Positif besar = uang mendahului pekerjaan, dan itu pertanda margin tergerus.
 * Negatif besar BUKAN kabar baik: hampir selalu berarti biayanya belum masuk
 * pembukuan, dan tool ini menyebutkan itu apa adanya alih-alih memujinya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * NILAI KONTRAK NOL DIPISAH, TIDAK DIBAGI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pembagian dengan nol menghasilkan `Infinity`, dan `Infinity` yang lolos ke
 * kalimat jawaban terbaca sebagai angka. Proyek tanpa nilai kontrak karena itu
 * dikeluarkan dari perbandingan dan disebut terpisah.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong, rupiah } from './ai-tool-dasar.js'

/** Selisih yang dianggap patut disorot. Di bawah ini, wajar. */
const AMBANG_SOROT = 15

interface BarisProyek {
  id: string
  name: string
  status: string | null
  contract_value: unknown
  progress_pct: unknown
}

export const toolSerapanBiaya: DefinisiToolAi = {
  nama: 'serapan_biaya',
  label: 'Serapan biaya vs progres',
  keterangan:
    'Membandingkan uang yang sudah keluar dengan progres pekerjaan, per proyek — untuk melihat ' +
    'proyek mana yang biayanya mendahului pekerjaannya. Pakai untuk "proyek mana yang boros", ' +
    '"margin tergerus di mana", "uangnya habis tapi kerjaannya belum". Yang dihitung uang ' +
    'NYATA keluar, bukan RAB.',
  izin: 'finance:view',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    const { data: pr, error: errPr } = await db
      .from('projects')
      .select('id, name, status, contract_value, progress_pct')
      .eq('is_deleted', false)
      .in('status', ['active', 'on_hold'])
      .limit(500)

    if (errPr) {
      return { isi: `Gagal membaca proyek: ${errPr.message}`, isError: true, entitas: [] }
    }

    const proyek = (pr ?? []) as unknown as BarisProyek[]
    if (proyek.length === 0) {
      return {
        isi: bungkusData('serapan_biaya', 'Tak ada proyek berjalan.'),
        isError: false,
        entitas: [],
      }
    }

    const idProyek = proyek.map((p) => p.id)

    /*
     * Uang yang BENAR-BENAR keluar — dua sumber, dan keduanya perlu.
     *
     * `project_expenses` kategori C (lewat `unsafe()` + saringan project_id),
     * `kasbons` kategori B (`.from()` sah). Kasbon ikut karena di lapangan ia
     * sering jadi jalur utama uang keluar: mengabaikannya membuat proyek yang
     * banyak kasbonnya terlihat paling hemat.
     */
    const { data: pe } = await db
      .unsafe(
        'project_expenses',
        'tool AI: serapan biaya lintas proyek milik tenant, disaring project_id',
      )
      .select('project_id, total_amount, status')
      .in('project_id', idProyek)
      .eq('status', 'approved')
      .limit(1000)

    const { data: kb } = await db
      .from('kasbons')
      .select('project_id, amount, status')
      .in('status', ['approved', 'settled'])
      .limit(1000)

    const perProyek = new Map<string, number>()
    for (const b of (pe ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(b.project_id ?? '')
      if (id) perProyek.set(id, (perProyek.get(id) ?? 0) + (Number(b.total_amount) || 0))
    }
    for (const b of (kb ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(b.project_id ?? '')
      if (id) perProyek.set(id, (perProyek.get(id) ?? 0) + (Number(b.amount) || 0))
    }

    interface Nilai {
      p: BarisProyek
      keluar: number
      kontrak: number
      serapanPct: number
      progres: number
      selisih: number
    }

    const terukur: Nilai[] = []
    const tanpaKontrak: BarisProyek[] = []

    for (const p of proyek) {
      const kontrak = Number(p.contract_value)
      const progres = Number(p.progress_pct)
      const keluar = perProyek.get(p.id) ?? 0

      // Nilai kontrak nol → pembagian menghasilkan Infinity, dan Infinity yang
      // lolos ke kalimat terbaca sebagai angka. DIPISAH, tidak dibagi.
      if (!Number.isFinite(kontrak) || kontrak <= 0 || !Number.isFinite(progres)) {
        tanpaKontrak.push(p)
        continue
      }

      const serapanPct = (keluar / kontrak) * 100
      terukur.push({ p, keluar, kontrak, serapanPct, progres, selisih: serapanPct - progres })
    }

    // Selisih paling POSITIF di atas — uang paling mendahului pekerjaan.
    terukur.sort((a, b) => b.selisih - a.selisih)

    const bagian: string[] = []

    if (terukur.length > 0) {
      const { data: tampil, dipotong } = potong(terukur)
      bagian.push(
        `${terukur.length} proyek dibandingkan (biaya paling mendahului pekerjaan di atas):`,
        ...tampil.map((n) => {
          const tanda = n.selisih >= AMBANG_SOROT ? ' ⚠' : ''
          return (
            `${n.selisih >= 0 ? '+' : ''}${n.selisih.toFixed(0)} — ${n.p.name}: ` +
            `keluar ${rupiah(n.keluar)} (${n.serapanPct.toFixed(0)}% kontrak), ` +
            `progres ${n.progres.toFixed(0)}%` +
            (n.p.status === 'on_hold' ? ' · DITAHAN' : '') +
            tanda
          )
        }),
        ...(dipotong > 0 ? [`… dan ${dipotong} lagi.`] : []),
        '',
        'Angka di depan = persen serapan biaya dikurangi persen progres.',
        `PLUS besar (⚠ ${AMBANG_SOROT}+) berarti uang mendahului pekerjaan — margin tergerus.`,
        'MINUS besar BUKAN kabar baik: hampir selalu berarti biayanya belum',
        'masuk pembukuan, bukan berarti proyeknya hemat.',
      )
    }

    if (tanpaKontrak.length > 0) {
      bagian.push(
        '',
        `${tanpaKontrak.length} proyek tak bisa dibandingkan (nilai kontrak belum diisi):`,
        ...tanpaKontrak.slice(0, 10).map((p) => `· ${p.name}`),
      )
    }

    bagian.push(
      '',
      'Yang dihitung: pengeluaran disetujui + kasbon disetujui/lunas. RAB TIDAK',
      'dipakai — diukur 2026-08-16, hanya 2 dari 13 proyek punya RAB dan pada',
      'keduanya RAB melebihi nilai kontrak, jadi margin yang dihitung darinya',
      'akan salah besar.',
    )

    return {
      isi: bungkusData('serapan_biaya', bagian.join('\n')),
      isError: false,
      entitas: terukur.slice(0, 10).map((n) => n.p.name),
    }
  },
}
