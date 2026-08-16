/**
 * ALOKASI KAS TERBATAS (2.15) — "kas segini, dibagi ke proyek mana?"
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DATANG SAAT KAS TAK CUKUP UNTUK SEMUANYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Berbeda dari `prioritas_bayar` (8.3) yang mengurutkan tagihan SUPPLIER.
 * Yang ini melihat ke dalam: kasbon dan pengeluaran yang menunggu dana, per
 * PROYEK — karena keputusan pemilik biasanya "proyek mana yang jalan terus",
 * bukan "faktur mana yang dibayar".
 *
 * Diukur 2026-08-16:
 *
 *   kasbons `pending`            3 · Rp 5.000.000
 *   project_expenses `submitted` 5 · Rp 22.090.000
 *
 * Keduanya sudah diajukan manusia dan menunggu keputusan — jadi ia permintaan
 * nyata, bukan perkiraan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MENYAJIKAN TIGA ANGKA, TIDAK MEMILIH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Untuk tiap proyek disebutkan: berapa yang diminta, berapa piutang yang
 * menggantung di sana, dan seberapa tertinggal jadwalnya.
 *
 * Ketiganya sengaja TIDAK diringkas jadi satu skor. Skor tunggal menyembunyikan
 * pertukarannya — proyek yang paling tertinggal jadwalnya belum tentu yang
 * paling mendesak dananya, dan pemilik yang membaca satu angka kehilangan
 * justru bagian yang membuatnya bisa memutuskan.
 *
 * Nomor 2.15 di katalog bernama "Advisor". Yang disajikan di sini bahan untuk
 * memutuskan, bukan putusannya — dan kalimat penutupnya menyatakan itu.
 */

import type { DefinisiToolAi } from './ai-tool-dasar.js'
import { bungkusData, potong, rupiah } from './ai-tool-dasar.js'
import { porsiWaktu } from './ai-tool-banding-proyek.js'

interface BarisProyek {
  id: string
  name: string
  status: string | null
  progress_pct: unknown
  start_date: string | null
  end_date: string | null
}

export const toolAlokasiKas: DefinisiToolAi = {
  nama: 'alokasi_kas',
  label: 'Alokasi kas ke proyek',
  keterangan:
    'Menunjukkan permintaan dana yang MENUNGGU di tiap proyek (kasbon + pengeluaran belum ' +
    'disetujui), dibandingkan saldo kas yang ada, plus piutang & deviasi jadwal proyek itu. ' +
    'Pakai untuk "kas terbatas, proyek mana yang didahulukan", "siapa yang minta dana". ' +
    'Tool ini MENYAJIKAN bahan, tidak memilih — sampaikan bahwa keputusannya di pengguna.',
  izin: 'finance:view',
  skema: { type: 'object', properties: {} },
  async jalan({ db }) {
    // ── Saldo yang tersedia ───────────────────────────────────────────────
    const { data: kas, error: errKas } = await db
      .from('cash_accounts')
      .select('balance, is_active')
      .limit(100)

    if (errKas) {
      return { isi: `Gagal membaca saldo kas: ${errKas.message}`, isError: true, entitas: [] }
    }

    const saldo = ((kas ?? []) as unknown as Array<{ balance: unknown; is_active: boolean | null }>)
      .filter((r) => r.is_active !== false)
      .reduce((s, r) => s + (Number(r.balance) || 0), 0)

    // ── Proyek berjalan ───────────────────────────────────────────────────
    const { data: pr, error: errPr } = await db
      .from('projects')
      .select('id, name, status, progress_pct, start_date, end_date')
      .eq('is_deleted', false)
      .in('status', ['active', 'on_hold'])
      .limit(500)

    if (errPr) {
      return { isi: `Gagal membaca proyek: ${errPr.message}`, isError: true, entitas: [] }
    }

    const proyek = (pr ?? []) as unknown as BarisProyek[]
    if (proyek.length === 0) {
      return {
        isi: bungkusData('alokasi_kas', 'Tak ada proyek berjalan.'),
        isError: false,
        entitas: [],
      }
    }

    const idProyek = proyek.map((p) => p.id)

    /*
     * `kasbons` kategori B — `.from()` sah. `project_expenses` dan `invoices`
     * kategori C, jadi keduanya lewat `unsafe()` + saringan `project_id`
     * eksplisit, pola yang sama dengan `ai-tool-arus-kas.ts`.
     */
    const { data: kb } = await db
      .from('kasbons')
      .select('project_id, amount, status')
      .eq('status', 'pending')
      .limit(500)

    const { data: pe } = await db
      .unsafe(
        'project_expenses',
        'tool AI: permintaan dana lintas proyek milik tenant, disaring project_id',
      )
      .select('project_id, total_amount, status')
      .in('project_id', idProyek)
      .eq('status', 'submitted')
      .limit(500)

    const { data: iv } = await db
      .unsafe('invoices', 'tool AI: piutang lintas proyek milik tenant, disaring project_id')
      .select('project_id, amount_due, status')
      .in('project_id', idProyek)
      .neq('status', 'paid')
      .limit(500)

    const jumlahkan = <T extends Record<string, unknown>>(
      baris: T[] | null | undefined,
      kolomNilai: string,
    ): Map<string, number> => {
      const m = new Map<string, number>()
      for (const b of (baris ?? []) as T[]) {
        const id = String(b.project_id ?? '')
        if (!id) continue
        m.set(id, (m.get(id) ?? 0) + (Number(b[kolomNilai]) || 0))
      }
      return m
    }

    const kasbonPer = jumlahkan(kb as never[], 'amount')
    const bebanPer = jumlahkan(pe as never[], 'total_amount')
    const piutangPer = jumlahkan(iv as never[], 'amount_due')

    interface Baris {
      p: BarisProyek
      minta: number
      piutang: number
      deviasi: number | null
    }

    const daftar: Baris[] = proyek.map((p) => {
      const waktu = porsiWaktu(p.start_date, p.end_date)
      const progres = Number(p.progress_pct)
      return {
        p,
        minta: (kasbonPer.get(p.id) ?? 0) + (bebanPer.get(p.id) ?? 0),
        piutang: piutangPer.get(p.id) ?? 0,
        // `null` = tanggal tak lengkap. TIDAK diganti nol — nol berarti
        // "tepat jadwal", dan itu klaim yang datanya tak dukung.
        deviasi: waktu === null || !Number.isFinite(progres) ? null : progres - waktu,
      }
    })

    const minta = daftar.filter((b) => b.minta > 0)

    if (minta.length === 0) {
      return {
        isi: bungkusData(
          'alokasi_kas',
          `Tak ada permintaan dana yang menunggu. Saldo kas ${rupiah(saldo)}.`,
        ),
        isError: false,
        entitas: [],
      }
    }

    // Yang paling banyak diminta di atas — itu yang paling menentukan
    // apakah kas cukup.
    minta.sort((a, b) => b.minta - a.minta)

    const totalMinta = minta.reduce((s, b) => s + b.minta, 0)
    const { data: tampil, dipotong } = potong(minta)

    const bagian: string[] = [
      `Saldo kas ${rupiah(saldo)} · total permintaan menunggu ${rupiah(totalMinta)}` +
        ` dari ${minta.length} proyek.`,
      totalMinta > saldo
        ? `Kas TIDAK menutup semuanya — kurang ${rupiah(totalMinta - saldo)}.`
        : 'Kas menutup seluruh permintaan.',
      '',
      ...tampil.map((b) => {
        const dev =
          b.deviasi === null
            ? 'jadwal tak terukur'
            : `${b.deviasi >= 0 ? '+' : ''}${b.deviasi.toFixed(0)} jadwal`
        return (
          `· ${b.p.name}: minta ${rupiah(b.minta)}` +
          (b.piutang > 0 ? ` · piutang ${rupiah(b.piutang)}` : '') +
          ` · ${dev}` +
          (b.p.status === 'on_hold' ? ' · DITAHAN' : '')
        )
      }),
      ...(dipotong > 0 ? [`… dan ${dipotong} proyek lagi.`] : []),
      '',
      'Tiga angka sengaja TIDAK diringkas jadi satu skor: proyek yang paling',
      'tertinggal jadwalnya belum tentu yang paling mendesak dananya, dan',
      'piutang besar di satu proyek bisa jadi alasan mendanainya — atau alasan',
      'menahannya. Ini bahan untuk memutuskan, bukan putusannya.',
    ]

    return {
      isi: bungkusData('alokasi_kas', bagian.join('\n'), dipotong),
      isError: false,
      entitas: tampil.map((b) => b.p.name),
    }
  },
}
