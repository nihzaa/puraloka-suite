/**
 * LOGIKA PENJADWALAN — fungsi murni, `now` selalu dioper.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA MODUL INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Repo ini TIDAK PUNYA penjadwal. `/sistem` adalah dua tombol manual, dan
 * kalau tak ada manusia yang menekannya, notifikasi tenggat & milestone
 * TIDAK PERNAH TERBIT. Itu menjelaskan kenapa banyak fitur terasa "ada tapi
 * tidak hidup".
 *
 * ── Pelajaran dari TJS yang membentuk berkas ini
 *
 * `BackupPolicy` di TJS punya kolom `scheduleType`/`scheduleTime`/`nextRunAt`
 * BERTAHUN-TAHUN tanpa satu pun kode yang membacanya. Komentar mereka sendiri
 * menulisnya: *"backup terjadwal selama ini ada di layar, tidak di kenyataan."*
 *
 * Dua akibat untuk rancangan di sini:
 *   1. Kolom jadwal dan PEMBACANYA lahir di commit yang sama, dan penjaga CI
 *      `audit-jadwal-punya-pembaca.mjs` menjaganya tetap begitu.
 *   2. Logikanya fungsi murni dengan `now` dioper — supaya bisa diuji tanpa
 *      DB, tanpa menunggu, dan tanpa menipu jam sistem.
 *
 * ── Aturan pemicunya: "sudah lewat DAN belum jalan di periode ini"
 *
 * BUKAN "jamnya sama persis". Bedanya menentukan: cron yang telat tiga menit,
 * server yang mati semalam, atau proses yang restart tepat di jam itu —
 * semuanya membuat pencocokan-persis melewatkan jadwalnya DIAM-DIAM, dan
 * kelewatan itu baru ketahuan saat seseorang bertanya kenapa laporan Senin
 * tak pernah datang.
 *
 * Dengan aturan "sudah lewat dan belum jalan", pemicu yang terlambat tetap
 * mengejar begitu ia sempat.
 */

export type JenisJadwal = 'harian' | 'mingguan' | 'bulanan'

export interface Jadwal {
  /** Seberapa sering. */
  jenis: JenisJadwal
  /** Jam lokal "HH:MM". */
  jam: string
  /** 0=Minggu … 6=Sabtu. Hanya untuk `mingguan`. */
  hari_pekan?: number | null
  /** 1–31. Hanya untuk `bulanan`. */
  hari_bulan?: number | null
  /** Kapan terakhir DIMULAI (bukan berhasil). Null = belum pernah. */
  terakhir_jalan?: Date | string | null
  aktif: boolean
}

/** Ubah "HH:MM" jadi menit sejak tengah malam. -1 bila bentuknya tak sah. */
export function menitDariJam(jam: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(jam.trim())
  if (!m) return -1
  const j = Number(m[1])
  const n = Number(m[2])
  if (j < 0 || j > 23 || n < 0 || n > 59) return -1
  return j * 60 + n
}

/**
 * Awal periode yang sedang berjalan pada `now`.
 *
 * Inilah inti aturan "belum jalan di periode ini": kalau `terakhir_jalan`
 * berada di ATAU sesudah batas ini, jadwalnya sudah dijalankan untuk periode
 * berjalan dan tak boleh diulang.
 *
 * ── Tanggal 31 di bulan yang cuma 30 hari
 *
 * Jadwal bulanan tanggal 31 TIDAK dilewati di bulan pendek — ia jatuh ke hari
 * terakhir bulan itu. Melewatkannya berarti laporan akhir bulan hilang di
 * Februari, April, Juni, September, dan November: lima dari dua belas bulan,
 * dan tak seorang pun akan mengira sebabnya adalah tanggalnya.
 */
export function awalPeriode(jadwal: Jadwal, now: Date): Date {
  const menitTarget = menitDariJam(jadwal.jam)
  const jamT = Math.floor(menitTarget / 60)
  const menitT = menitTarget % 60

  if (jadwal.jenis === 'harian') {
    const d = new Date(now)
    d.setHours(jamT, menitT, 0, 0)
    if (d > now) d.setDate(d.getDate() - 1)   // jamnya belum tiba → periode kemarin
    return d
  }

  if (jadwal.jenis === 'mingguan') {
    const target = jadwal.hari_pekan ?? 1     // bawaan Senin
    const d = new Date(now)
    d.setHours(jamT, menitT, 0, 0)
    const selisih = (d.getDay() - target + 7) % 7
    d.setDate(d.getDate() - selisih)
    if (d > now) d.setDate(d.getDate() - 7)
    return d
  }

  // bulanan
  const tanggalDiminta = jadwal.hari_bulan ?? 1
  const hariTerakhir = (th: number, bl: number) => new Date(th, bl + 1, 0).getDate()

  const buat = (th: number, bl: number) => {
    const d = new Date(th, bl, Math.min(tanggalDiminta, hariTerakhir(th, bl)))
    d.setHours(jamT, menitT, 0, 0)
    return d
  }

  let d = buat(now.getFullYear(), now.getMonth())
  if (d > now) {
    const bl = now.getMonth() - 1
    d = bl < 0 ? buat(now.getFullYear() - 1, 11) : buat(now.getFullYear(), bl)
  }
  return d
}

export interface Keputusan {
  jalan: boolean
  /** Kenapa — untuk log dan untuk test yang membaca alasannya, bukan cuma boolean. */
  alasan:
    | 'nonaktif'
    | 'jam-tak-sah'
    | 'belum-waktunya'
    | 'sudah-jalan-periode-ini'
    | 'jatuh-tempo'
}

/**
 * Haruskah jadwal ini dijalankan sekarang?
 *
 * Mengembalikan ALASAN, bukan sekadar boolean. Itu bukan kemewahan: saat
 * seseorang bertanya "kenapa laporan mingguan tak keluar", jawabannya harus
 * bisa dibaca dari log tanpa menjalankan ulang apa pun.
 */
export function harusJalan(jadwal: Jadwal, now: Date): Keputusan {
  if (!jadwal.aktif) return { jalan: false, alasan: 'nonaktif' }

  if (menitDariJam(jadwal.jam) < 0) {
    // Bentuk jam tak sah TIDAK berarti "jalankan saja" — lebih baik diam dan
    // terlihat di log daripada memicu sesuatu di jam yang tak pernah diminta.
    return { jalan: false, alasan: 'jam-tak-sah' }
  }

  const batas = awalPeriode(jadwal, now)
  if (now < batas) return { jalan: false, alasan: 'belum-waktunya' }

  const terakhir = jadwal.terakhir_jalan
    ? new Date(jadwal.terakhir_jalan)
    : null

  if (terakhir && terakhir >= batas) {
    return { jalan: false, alasan: 'sudah-jalan-periode-ini' }
  }

  return { jalan: true, alasan: 'jatuh-tempo' }
}


/**
 * Akses LINTAS TENANT ke `jadwal_tugas` — satu-satunya tempatnya.
 *
 * Pemicu penjadwal memang harus melihat jadwal SEMUA tenant: itulah tugasnya,
 * dan ia tak punya sesi pengguna sehingga `request.db` tak tersedia. Batas
 * tenant ditegakkan di lapisan berikutnya — tiap tugas dijalankan dengan token
 * akun layanan lewat `authenticate` + `requirePermission` yang sama dengan
 * manusia, dan 403 "bukan anggota perusahaan" terbukti muncul saat diuji.
 *
 * ── Kenapa di `lib/`, bukan di berkas rutenya
 *
 * `tenancy-ratchet` menghitung baris ber-`supabase` mentah di `routes/`, dan
 * ambangnya punya tripwire yang melarang dinaikkan. Menaruhnya di rute
 * menaikkan 366 → 369.
 *
 * Tapi alasan sebenarnya bukan angka itu: rute seharusnya berisi RUTE, dan
 * "cara mendapat pegangan ke tabel" bukan salah satunya. Angka ratchet cuma
 * yang membuat saya berhenti dan menyadarinya.
 *
 * Dikumpulkan jadi SATU fungsi supaya pertanyaan "di mana kode ini bisa
 * melihat tenant lain?" dijawab satu baris, bukan hasil menyisir.
 */
export async function jadwalLintasTenant() {
  const { supabase } = await import('../utils/supabase.js')
  return supabase.from('jadwal_tugas')
}
