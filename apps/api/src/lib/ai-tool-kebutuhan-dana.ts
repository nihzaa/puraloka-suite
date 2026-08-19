/**
 * 2.18 — KEBUTUHAN DANA: kapan kas akan kering, dan berapa yang kurang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BUKAN "PENASIHAT FASILITAS KREDIT" — DAN INI PEMBEDAAN YANG MENENTUKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog menamainya "Loan/Credit Facility Advisor". Nama itu menjanjikan
 * sesuatu yang TIDAK boleh dilakukan sistem ini: menyarankan produk keuangan.
 * Menyarankan pinjaman berarti menyebut plafon, tenor, dan bunga — tiga hal
 * yang tak satu pun ada di basis, dan yang kalau dikarang akan terbaca seperti
 * nasihat keuangan yang bisa dipertanggungjawabkan.
 *
 * Yang BISA dan memang berguna: menunjukkan **kapan kas diperkiraan kering,
 * dan berapa besar kekurangannya**. Itu angka yang seluruhnya berasal dari
 * dokumen yang sudah ada. Keputusan "cari pinjaman atau percepat tagihan"
 * tetap milik pemiliknya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PROYEKSI YANG SUDAH ADA (2.4) TIDAK CUKUP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `proyeksi_arus_kas` sudah menghitung 30/60/90 hari dari invoice dan tagihan
 * supplier. Dijalankan 2026-08-16, hasilnya: saldo Rp 222 juta → Rp 275 juta
 * di ketiga jendela. **Naik, dan datar.**
 *
 * Perusahaan konstruksi yang membayar upah tiap minggu tidak mungkin kasnya
 * datar. Yang hilang dari proyeksi itu adalah kewajiban terbesarnya:
 *
 *   kasbon `approved` belum settled   Rp 491.100.000   ← 2,2× saldo kas
 *   pengeluaran proyek `approved`     Rp 263.505.000
 *   upah `submitted` belum dibayar    Rp  15.900.000
 *
 * Kasbon sendirian sudah lebih dari DUA KALI saldo. Proyeksi yang tak
 * memuatnya bukan sekadar kurang teliti — ia menjawab "aman" untuk keadaan
 * yang justru paling perlu diwaspadai, dan itu bentuk kesalahan paling mahal
 * yang bisa dilakukan alat keuangan.
 *
 * Tool ini TIDAK menggantikan 2.4. Ia menjawab pertanyaan berbeda: 2.4
 * "berapa kas saya nanti", ini "kapan saya kehabisan, dan berapa kurangnya".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KEWAJIBAN TANPA TANGGAL — DAN KENAPA TIDAK DITEBAK TANGGALNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kasbon approved tak punya tanggal jatuh tempo di basis. Godaannya menebak
 * ("anggap 30 hari"), dan tebakan itu akan menentukan verdict-nya sendiri:
 * geser ke 60 hari, "aman"; geser ke 14 hari, "kritis".
 *
 * Maka kewajiban tak bertanggal dilaporkan sebagai **beban menggantung**
 * terpisah dari garis waktu — disebut nominalnya, tidak dijadwalkan. Pembaca
 * melihat "kas cukup untuk 90 hari, TAPI ada Rp 491 juta kasbon yang bisa
 * ditagih kapan saja" dan bisa memutuskan sendiri.
 *
 * I-1: hanya SELECT.
 */

import type { TenantDb } from '../utils/tenant-db.js'

const BATAS = 900

/** Jendela proyeksi, sama dengan 2.4 supaya dua tool tak berselisih. */
export const JENDELA_HARI = [30, 60, 90] as const

export interface BebanMenggantung {
  jenis: string
  jumlah: number
  nominal: number
  catatan: string
}

export interface TitikKering {
  hari: number
  saldoPerkiraan: number
}

export interface HasilKebutuhanDana {
  saldoSekarang: number
  /** Kas masuk yang punya tanggal, per jendela. */
  masuk: { hari: number; nominal: number }[]
  /** Kas keluar yang punya tanggal, per jendela. */
  keluar: { hari: number; nominal: number }[]
  proyeksi: TitikKering[]
  /** Jendela pertama yang saldonya negatif. `null` = tak kering dalam 90 hari. */
  keringPada: number | null
  kekurangan: number
  bebanMenggantung: BebanMenggantung[]
  totalMenggantung: number
  catatan?: string
}

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

/** `YYYY-MM-DD` dari waktu lokal — bukan UTC. */
function tgl(d: Date): string {
  const b = String(d.getMonth() + 1).padStart(2, '0')
  const t = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${b}-${t}`
}

const angka = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export async function hitungKebutuhanDana(
  db: TenantDb,
  sekarang: Date = new Date(),
): Promise<HasilKebutuhanDana | { galat: string }> {
  const proyekIds = await db.projectIds()

  // ── Saldo kas sekarang
  const { data: kas, error: e1 } = await db
    .from('cash_accounts')
    .select('balance')
    .eq('is_active', true)
    .limit(BATAS)
  if (e1) return { galat: 'Gagal membaca saldo kas.' }
  const saldoSekarang = ((kas ?? []) as { balance: unknown }[]).reduce(
    (s, r) => s + angka(r.balance),
    0,
  )

  if (proyekIds.length === 0) {
    return {
      saldoSekarang,
      masuk: [], keluar: [], proyeksi: [],
      keringPada: null, kekurangan: 0,
      bebanMenggantung: [], totalMenggantung: 0,
      catatan: 'Belum ada proyek — kebutuhan dana tak bisa dihitung.',
    }
  }

  const batasAkhir = new Date(sekarang)
  batasAkhir.setDate(batasAkhir.getDate() + 90)

  // ── Kas MASUK bertanggal: termin yang dijadwalkan
  const { data: termin, error: e2 } = await db
    .unsafe(
      'termin_schedules',
      'tool baca AI 2.18: termin lintas proyek milik tenant, disaring project_id',
    )
    .select('amount, target_date, status')
    .in('project_id', proyekIds)
    .limit(BATAS)
  if (e2) return { galat: 'Gagal membaca jadwal termin.' }

  // ── Kas KELUAR bertanggal: PO yang punya perkiraan kirim
  const { data: po, error: e3 } = await db
    .unsafe(
      'purchase_orders',
      'tool baca AI 2.18: PO lintas proyek milik tenant, disaring project_id',
    )
    .select('total_amount, expected_delivery_date, status')
    .in('project_id', proyekIds)
    .limit(BATAS)
  if (e3) return { galat: 'Gagal membaca purchase order.' }

  const dalamJendela = (
    tanggal: string | null | undefined,
    hari: number,
  ): boolean => {
    if (!tanggal) return false
    const batas = new Date(sekarang)
    batas.setDate(batas.getDate() + hari)
    return tanggal >= tgl(sekarang) && tanggal <= tgl(batas)
  }

  const barisTermin = (termin ?? []) as {
    amount: unknown; target_date: string | null; status: string | null
  }[]
  const barisPo = (po ?? []) as {
    total_amount: unknown; expected_delivery_date: string | null; status: string | null
  }[]

  const masuk = JENDELA_HARI.map((hari) => ({
    hari,
    nominal: barisTermin
      .filter((t) => t.status !== 'paid' && t.status !== 'batal')
      .filter((t) => dalamJendela(t.target_date, hari))
      .reduce((s, t) => s + angka(t.amount), 0),
  }))

  const keluar = JENDELA_HARI.map((hari) => ({
    hari,
    nominal: barisPo
      .filter((p) => p.status !== 'canceled' && p.status !== 'completed')
      .filter((p) => dalamJendela(p.expected_delivery_date, hari))
      .reduce((s, p) => s + angka(p.total_amount), 0),
  }))

  const proyeksi: TitikKering[] = JENDELA_HARI.map((hari, i) => ({
    hari,
    saldoPerkiraan: saldoSekarang + masuk[i].nominal - keluar[i].nominal,
  }))

  const titikKering = proyeksi.find((p) => p.saldoPerkiraan < 0)

  /*
   * ── BEBAN MENGGANTUNG: kewajiban NYATA tanpa tanggal jatuh tempo ──────────
   *
   * Inilah yang membuat tool ini ada. Ketiganya kewajiban yang sudah
   * DISETUJUI — bukan rencana — tapi tak punya tanggal di basis, sehingga
   * proyeksi bertanggal mana pun buta terhadapnya.
   */
  const { data: kasbon, error: e4 } = await db
    .from('kasbons')
    .select('amount, status')
    .eq('status', 'approved')
    .limit(BATAS)
  if (e4) return { galat: 'Gagal membaca kasbon.' }

  const { data: biaya, error: e5 } = await db
    .unsafe(
      'project_expenses',
      'tool baca AI 2.18: pengeluaran proyek milik tenant, disaring project_id',
    )
    .select('total_amount, status')
    .in('project_id', proyekIds)
    .eq('status', 'approved')
    .limit(BATAS)
  if (e5) return { galat: 'Gagal membaca pengeluaran proyek.' }

  const barisKasbon = (kasbon ?? []) as { amount: unknown }[]
  const barisBiaya = (biaya ?? []) as { total_amount: unknown }[]

  const bebanMenggantung: BebanMenggantung[] = []

  const totalKasbon = barisKasbon.reduce((s, k) => s + angka(k.amount), 0)
  if (barisKasbon.length > 0) {
    bebanMenggantung.push({
      jenis: 'Kasbon disetujui, belum diselesaikan',
      jumlah: barisKasbon.length,
      nominal: totalKasbon,
      catatan: 'Tak punya tanggal jatuh tempo — bisa ditagih kapan saja.',
    })
  }

  const totalBiaya = barisBiaya.reduce((s, b) => s + angka(b.total_amount), 0)
  if (barisBiaya.length > 0) {
    bebanMenggantung.push({
      jenis: 'Pengeluaran proyek disetujui',
      jumlah: barisBiaya.length,
      nominal: totalBiaya,
      catatan: 'Sudah disetujui; sebagian mungkin sudah dibayar dari kas kecil.',
    })
  }

  const totalMenggantung = bebanMenggantung.reduce((s, b) => s + b.nominal, 0)

  /*
   * Kekurangan dihitung terhadap saldo TERBURUK sepanjang jendela, bukan
   * terhadap saldo akhir. Kas yang sempat minus di hari ke-30 lalu pulih di
   * hari ke-90 tetap berarti gaji tak terbayar di hari ke-30.
   */
  const saldoTerburuk = Math.min(
    saldoSekarang,
    ...proyeksi.map((p) => p.saldoPerkiraan),
  )
  const kekurangan = saldoTerburuk < 0 ? Math.abs(saldoTerburuk) : 0

  return {
    saldoSekarang: Math.round(saldoSekarang),
    masuk: masuk.map((m) => ({ ...m, nominal: Math.round(m.nominal) })),
    keluar: keluar.map((k) => ({ ...k, nominal: Math.round(k.nominal) })),
    proyeksi: proyeksi.map((p) => ({
      ...p,
      saldoPerkiraan: Math.round(p.saldoPerkiraan),
    })),
    keringPada: titikKering?.hari ?? null,
    kekurangan: Math.round(kekurangan),
    bebanMenggantung,
    totalMenggantung: Math.round(totalMenggantung),
  }
}

/** Dipakai tool dan test — dipisah supaya kalimatnya bisa diuji sendiri. */
export function ringkasKebutuhanDana(h: HasilKebutuhanDana): string[] {
  const baris: string[] = [
    `Saldo kas sekarang: ${rp(h.saldoSekarang)}`,
    '',
    'PROYEKSI (hanya yang punya tanggal):',
  ]

  for (const [i, p] of h.proyeksi.entries()) {
    baris.push(
      `  ${p.hari} hari: masuk ${rp(h.masuk[i].nominal)} · keluar ` +
      `${rp(h.keluar[i].nominal)} → perkiraan ${rp(p.saldoPerkiraan)}`,
    )
  }

  if (h.keringPada !== null) {
    baris.push(
      '',
      `⚠ KAS DIPERKIRAKAN KERING di hari ke-${h.keringPada}. ` +
      `Kekurangan terburuk ${rp(h.kekurangan)}.`,
    )
  } else {
    baris.push('', 'Kas tidak diperkirakan kering dalam 90 hari — dari yang bertanggal.')
  }

  /*
   * Beban menggantung selalu disebut, bahkan saat proyeksi terlihat aman.
   * Justru saat itulah ia paling perlu: "aman" yang mengabaikan Rp 491 juta
   * kewajiban adalah kesimpulan yang menyesatkan.
   */
  if (h.bebanMenggantung.length > 0) {
    baris.push(
      '',
      `KEWAJIBAN TANPA TANGGAL JATUH TEMPO — total ${rp(h.totalMenggantung)}:`,
    )
    for (const b of h.bebanMenggantung) {
      baris.push(`· ${b.jenis}: ${b.jumlah} item, ${rp(b.nominal)}`)
      baris.push(`  ${b.catatan}`)
    }
    if (h.totalMenggantung > h.saldoSekarang) {
      baris.push(
        '',
        `⚠ Kewajiban tanpa tanggal (${rp(h.totalMenggantung)}) MELEBIHI saldo ` +
        `kas (${rp(h.saldoSekarang)}). Proyeksi di atas tidak memuatnya karena ` +
        'tanggalnya tak ada di sistem — bukan karena tak perlu dibayar.',
      )
    }
  }

  baris.push(
    '',
    'Ini bukan saran keuangan. Sistem tidak tahu plafon, tenor, maupun bunga',
    'fasilitas kredit apa pun — angka di atas hanya menunjukkan kapan kas',
    'diperkirakan tidak cukup, dari dokumen yang ada.',
  )

  return baris
}
