/**
 * PERINGATAN KRITIS — satu sumber, dua tempat tampil.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIPISAH JADI FUNGSI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-09 minta Peringatan Kritis ada di DUA tempat: kartu tengah
 * (rinciannya) dan rail kanan (supaya terjangkau tanpa scroll).
 *
 * Dua tempat yang menghitung sendiri-sendiri adalah cara paling pasti untuk
 * membuat keduanya menyimpang — dan saat menyimpang, tak ada yang tahu mana
 * yang benar. Jadi aturannya ditulis SEKALI di sini, dan keduanya membacanya.
 *
 * ── Kenapa urutannya ditentukan di sini, bukan di komponen
 *
 * Urutan adalah bagian dari maknanya: uang yang tertahan lebih mendesak
 * daripada persetujuan yang menunggu. Kalau urutannya diserahkan ke tiap
 * pemanggil, kartu tengah dan rail bisa menampilkan prioritas berbeda untuk
 * data yang sama.
 */

export interface Peringatan {
  id: string
  judul: string
  /** Satu kalimat: kenapa ini penting. Kosong di tempat sempit. */
  sub: string
  href: string
  tingkat: 'tinggi' | 'sedang'
}

/** Bentuk `alerts` dari `GET /api/v1/dashboard`. */
export interface MasukanPeringatan {
  invoice_overdue?: number | null
  milestone_late?: number | null
  kasbon_pending?: number | null
}

const angka = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0

/**
 * Menyusun daftar peringatan, TERURUT dari yang paling mendesak.
 *
 * Urutannya bukan selera: invoice lewat tempo adalah uang yang seharusnya
 * sudah masuk (kerugian berjalan), milestone telat adalah janji ke klien yang
 * meleset (kerugian reputasi + denda), kasbon menunggu adalah orang yang
 * menunggu keputusan (mendesak, tetapi belum merugikan).
 */
export function susunPeringatan(alerts: MasukanPeringatan | null | undefined): Peringatan[] {
  const a = alerts ?? {}
  const hasil: Peringatan[] = []

  const invoice = angka(a.invoice_overdue)
  if (invoice > 0) {
    hasil.push({
      id: 'invoice',
      judul: `${invoice} invoice lewat jatuh tempo`,
      sub: 'Uang yang seharusnya sudah masuk',
      href: '/keuangan/invoice',
      tingkat: 'tinggi',
    })
  }

  const milestone = angka(a.milestone_late)
  if (milestone > 0) {
    hasil.push({
      id: 'milestone',
      judul: `${milestone} milestone terlambat`,
      sub: 'Pekerjaan meleset dari janji ke klien',
      href: '/kalender',
      tingkat: 'tinggi',
    })
  }

  const kasbon = angka(a.kasbon_pending)
  if (kasbon > 0) {
    hasil.push({
      id: 'kasbon',
      judul: `${kasbon} kasbon menunggu persetujuan`,
      sub: 'Mandor menunggu keputusan Anda',
      href: '/mandor/kasbon',
      tingkat: 'sedang',
    })
  }

  return hasil
}
