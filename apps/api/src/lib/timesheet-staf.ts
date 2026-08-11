// TIMESHEET STAF KANTOR (G2b).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA, DAN BEDANYA DARI ABSENSI LAPANGAN
// ══════════════════════════════════════════════════════════════════════════
//
// `absensi_harian` (1.279 baris) mencatat kehadiran pekerja HARIAN: hadir
// setengah atau penuh, dan upahnya dibayar mingguan. Pertanyaannya "berapa
// upah minggu ini".
//
// Timesheet staf menjawab pertanyaan yang BERBEDA: **berapa jam waktu staf
// kantor dibebankan ke tiap proyek.** Staf digaji bulanan tetap — jamnya
// tidak menentukan gajinya. Yang ditentukan jamnya adalah berapa besar biaya
// overhead yang jatuh ke proyek A dan berapa ke proyek B.
//
// Menyamakan keduanya menghasilkan angka yang salah di dua arah sekaligus:
// gaji staf jadi bergantung kehadiran (padahal tidak), dan biaya proyek
// kehilangan komponen overhead-nya (padahal ada).
//
// ── Kenapa lembur DIHITUNG TERPISAH, bukan diturunkan dari total
//
// Godaannya: `lembur = max(0, total - jam_standar)`. Itu salah untuk staf
// kantor, dan salahnya merugikan pegawai:
//
//   • lembur harus DIPERINTAHKAN, bukan terjadi karena orang pulang telat.
//     Menurunkannya otomatis membuat setiap keterlambatan pulang jadi
//     tagihan lembur yang tak pernah disetujui siapa pun.
//   • sebaliknya, lembur di hari libur adalah lembur PENUH meski totalnya
//     di bawah jam standar — rumus `total - standar` menghasilkan nol.
//
// Karena itu `jam_lembur` adalah kolom yang diisi manusia, dan modul ini
// hanya MELAPORKAN bila totalnya tak sejalan dengan jam standar — tanpa
// mengubahnya. Pola yang sama dengan `nilaiUji` di G1d: selisih pendapat
// adalah informasi, bukan kesalahan.
//
// ── Kenapa `null` bukan 0 untuk "belum ada timesheet"
//
// Hari tanpa baris timesheet berarti BELUM DIISI, bukan "nol jam kerja".
// Menghitungnya sebagai nol membuat pegawai yang lupa mengisi terbaca
// seperti tidak bekerja — dan itu angka yang masuk ke laporan biaya proyek.

export type StatusTimesheet = 'draf' | 'diajukan' | 'disetujui' | 'ditolak'

export interface BarisTimesheet {
  id: string
  tanggal: string
  /** `numeric` dari Postgres tiba sebagai string. */
  jam_kerja: number | string
  jam_lembur: number | string
  project_id: string | null
  kegiatan: string | null
  status: StatusTimesheet
  alasan_tolak: string | null
}

/** Angka dari Postgres. NaN, string kosong, dan sampah jadi `null`. */
export function angka(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  // `Number('')` adalah 0, bukan NaN — pelajaran dari G2a (`tarif-payroll.ts`).
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface BarisDinilai extends BarisTimesheet {
  jam_kerja_n: number
  jam_lembur_n: number
  total: number
  /**
   * Jam kerja normal MELEBIHI jam standar tanpa dicatat sebagai lembur.
   *
   * BUKAN berarti salah — bisa jadi memang disepakati, atau jam standarnya
   * yang perlu diperbarui. Yang penting selisihnya TERLIHAT supaya bisa
   * ditanyakan sebelum masuk laporan biaya.
   */
  melebihi_standar: boolean
  /** Jam kerja normal di bawah standar — hari tak penuh. */
  di_bawah_standar: boolean
}

export interface RingkasanTimesheet {
  baris: BarisDinilai[]
  total_jam_kerja: number
  total_jam_lembur: number
  /** Hari yang PUNYA baris timesheet. */
  hari_terisi: number
  /**
   * Hari kerja dalam rentang yang BELUM punya baris sama sekali.
   *
   * Dibedakan tegas dari "nol jam": belum diisi ≠ tidak bekerja, dan
   * menyamakannya membuat pegawai yang lupa mengisi terbaca seperti
   * menganggur di laporan biaya proyek.
   */
  hari_kosong: string[]
  per_status: Record<StatusTimesheet, number>
  /** Jam per proyek — `null` sebagai kunci untuk waktu overhead kantor. */
  per_proyek: Array<{ project_id: string | null; jam: number; lembur: number }>
  /** Baris yang jamnya tak sejalan dengan jam standar. */
  perlu_ditanya: BarisDinilai[]
}

/** `YYYY-MM-DD` → hari dalam minggu (0 Minggu … 6 Sabtu), tanpa zona waktu. */
function hariDalamMinggu(iso: string): number {
  // `Date.UTC` supaya zona waktu mesin tak menggeser tanggalnya. Memakai
  // `new Date('2026-08-03')` lalu `.getDay()` menghasilkan hari yang BERBEDA
  // di zona barat UTC — dan itu menggeser "akhir pekan" satu hari.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Daftar tanggal `YYYY-MM-DD` dari awal sampai akhir (inklusif). */
export function rentangTanggal(awal: string, akhir: string): string[] {
  const hasil: string[] = []
  const [ya, ma, da] = awal.split('-').map(Number)
  const [yz, mz, dz] = akhir.split('-').map(Number)
  let t = Date.UTC(ya, ma - 1, da)
  const habis = Date.UTC(yz, mz - 1, dz)
  // Batas kewarasan: rentang terbalik menghasilkan daftar kosong, bukan
  // perulangan tak berujung.
  while (t <= habis) {
    hasil.push(new Date(t).toISOString().slice(0, 10))
    t += 86400000
  }
  return hasil
}

/**
 * Ringkas timesheet satu pegawai dalam satu rentang.
 *
 * INVARIAN yang diuji (`__tests__/timesheet-staf.test.ts`):
 *  1. hari tanpa baris masuk `hari_kosong`, TIDAK dihitung nol jam
 *  2. akhir pekan TIDAK masuk `hari_kosong` — ia memang bukan hari kerja
 *  3. lembur tak pernah diturunkan dari total; jam yang melebihi standar
 *     hanya DITANDAI
 *  4. jam per proyek dijumlahkan terpisah, dan `null` (overhead kantor)
 *     tetap muncul sebagai kelompoknya sendiri
 *  5. urutan baris menurut tanggal, terbaru dulu
 */
export function ringkasTimesheet(
  baris: BarisTimesheet[],
  jamStandar: number,
  rentang?: { awal: string; akhir: string },
): RingkasanTimesheet {
  const dinilai: BarisDinilai[] = baris.map((b) => {
    const jk = angka(b.jam_kerja) ?? 0
    const jl = angka(b.jam_lembur) ?? 0
    return {
      ...b,
      jam_kerja_n: jk,
      jam_lembur_n: jl,
      total: jk + jl,
      // Dibandingkan dengan jam KERJA NORMAL, bukan total: lembur yang
      // dicatat memang seharusnya membuat total melebihi standar, dan
      // menandainya akan membanjiri layar dengan peringatan untuk hal yang
      // benar.
      melebihi_standar: jk > jamStandar,
      di_bawah_standar: jk > 0 && jk < jamStandar,
    }
  }).sort((a, b) => b.tanggal.localeCompare(a.tanggal))

  const per_status: Record<StatusTimesheet, number> = {
    draf: 0, diajukan: 0, disetujui: 0, ditolak: 0,
  }
  for (const b of dinilai) per_status[b.status] = (per_status[b.status] ?? 0) + 1

  // Jam per proyek. `null` dipakai sebagai kunci untuk overhead kantor —
  // Map menerima `null` sebagai kunci, jadi tak perlu sentinel string yang
  // bisa bentrok dengan id proyek.
  const peta = new Map<string | null, { jam: number; lembur: number }>()
  for (const b of dinilai) {
    const k = b.project_id ?? null
    const p = peta.get(k) ?? { jam: 0, lembur: 0 }
    p.jam += b.jam_kerja_n
    p.lembur += b.jam_lembur_n
    peta.set(k, p)
  }
  const per_proyek = [...peta.entries()]
    .map(([project_id, v]) => ({ project_id, ...v }))
    // Terbesar dulu — yang paling banyak menyerap waktu adalah yang dicari.
    .sort((a, b) => (b.jam + b.lembur) - (a.jam + a.lembur))

  let hari_kosong: string[] = []
  if (rentang) {
    const terisi = new Set(dinilai.map((b) => b.tanggal))
    hari_kosong = rentangTanggal(rentang.awal, rentang.akhir).filter((t) => {
      // Akhir pekan bukan hari kerja — memasukkannya ke "belum diisi"
      // menghasilkan peringatan yang selalu menyala, dan peringatan yang
      // selalu menyala berhenti dibaca.
      const h = hariDalamMinggu(t)
      if (h === 0 || h === 6) return false
      return !terisi.has(t)
    })
  }

  return {
    baris: dinilai,
    total_jam_kerja: dinilai.reduce((s, b) => s + b.jam_kerja_n, 0),
    total_jam_lembur: dinilai.reduce((s, b) => s + b.jam_lembur_n, 0),
    hari_terisi: dinilai.length,
    hari_kosong,
    per_status,
    per_proyek,
    perlu_ditanya: dinilai.filter((b) => b.melebihi_standar),
  }
}

export interface PenghalangAjukan {
  kode: 'kosong' | 'sudah-diajukan' | 'ada-hari-kosong'
  pesan: string
  tanggal?: string[]
}

/**
 * Boleh tidaknya timesheet diajukan untuk persetujuan.
 *
 * INVARIAN yang diuji:
 *  1. nol baris draf → tak bisa diajukan
 *  2. hari kerja yang kosong dilaporkan sebagai PERINGATAN, bukan penghalang
 *     — pegawai yang cuti sehari tak boleh terkunci dari mengajukan sisanya
 *  3. yang sudah diajukan/disetujui tak masuk hitungan lagi
 */
export function bolehDiajukan(
  ringkasan: RingkasanTimesheet,
): { boleh: boolean; penghalang: PenghalangAjukan[]; peringatan: PenghalangAjukan[] } {
  const penghalang: PenghalangAjukan[] = []
  const peringatan: PenghalangAjukan[] = []

  if (ringkasan.per_status.draf === 0) {
    penghalang.push({
      kode: ringkasan.hari_terisi === 0 ? 'kosong' : 'sudah-diajukan',
      pesan: ringkasan.hari_terisi === 0
        ? 'Belum ada satu pun baris timesheet untuk diajukan.'
        : 'Tak ada baris berstatus draf — semuanya sudah diajukan atau diputuskan.',
    })
  }

  if (ringkasan.hari_kosong.length > 0) {
    // PERINGATAN, bukan penghalang: pegawai yang cuti sehari tak boleh
    // terkunci dari mengajukan sisanya, dan memaksanya mengisi hari cuti
    // dengan nol jam justru merusak angka yang dicari.
    peringatan.push({
      kode: 'ada-hari-kosong',
      pesan: `${ringkasan.hari_kosong.length} hari kerja belum diisi. `
        + 'Kalau memang tak bekerja (cuti, libur, sakit), abaikan — '
        + 'yang kosong tidak dihitung nol jam.',
      tanggal: ringkasan.hari_kosong,
    })
  }

  return { boleh: penghalang.length === 0, penghalang, peringatan }
}
