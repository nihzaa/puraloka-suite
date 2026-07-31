/**
 * KURVA RENCANA dari TANGGAL GANTT — sumber PV tingkat kedua.
 *
 * ── Kenapa ada
 *
 * `PV` (Planned Value) di EVM menentukan SPI (`EV / PV`). Sebelum ini PV punya
 * dua sumber saja:
 *
 *   1. `rab_schedule` — rencana per item per minggu, DIKETIK MANUAL oleh PM.
 *      Paling akurat, tapi di dev berisi **0 baris**: tak seorang pun mengisinya.
 *   2. Normal CDF — kurva-S berbentuk lonceng yang di-generate saat (1) kosong.
 *
 * Masalahnya bukan (2) salah secara matematis; masalahnya (2) **tak ada
 * hubungannya dengan rencana proyek ini**. Ia mengasumsikan pekerjaan menyebar
 * simetris sepanjang durasi, apa pun isi RAB-nya. SPI yang dihitung darinya
 * mengukur penyimpangan terhadap tebakan, bukan terhadap rencana.
 *
 * Sementara itu `rab_items.planned_start`/`planned_end` SUDAH ADA (migrasi 052,
 * dipakai Gantt Chart) dan berisi rencana yang benar-benar disusun manusia —
 * tapi `kurva-s.ts` tak pernah membacanya.
 *
 * Modul ini menutup celah itu: tingkat kedua di antara "jadwal manual mingguan"
 * dan "tebakan lonceng".
 *
 * ── Cara membagi nilai item ke minggu
 *
 * LINEAR sepanjang rentang tanggalnya. Ini keputusan sadar, bukan penyederhanaan
 * malas: yang kita tahu dari Gantt hanyalah KAPAN item mulai dan selesai. Bentuk
 * penyerapan di dalam rentang itu tidak diketahui, dan menebaknya (mis. lonceng
 * lagi) akan menambah asumsi tanpa menambah informasi.
 *
 * Kalau PM tahu bentuknya tidak linear, tempatnya menyatakan itu adalah
 * `rab_schedule` — tingkat 1, yang memang untuk itu dan selalu menang.
 */

export interface ItemBerjadwal {
  /** Nilai item (Rp). Nol/negatif diabaikan — tak menyumbang kurva. */
  totalPrice: number
  /** 'YYYY-MM-DD' atau ISO. Null = item tak ikut (belum dijadwalkan). */
  plannedStart: string | null
  plannedEnd: string | null
}

const MS_PER_HARI = 86_400_000
const MS_PER_MINGGU = 7 * MS_PER_HARI

/**
 * Bagi nilai tiap item ke ember mingguan menurut rentang tanggalnya.
 *
 * @returns array sepanjang `totalWeeks` berisi nilai absolut (Rp) per minggu,
 *          atau `null` bila TIDAK ADA satu pun item berjadwal — pemanggil
 *          harus jatuh ke fallback, bukan memakai array nol yang membuat
 *          PV = 0 dan SPI ikut nol secara diam-diam.
 */
export function nilaiRencanaPerMinggu(
  items: ItemBerjadwal[],
  mulaiProyek: Date,
  totalWeeks: number,
): number[] | null {
  if (totalWeeks <= 0) return null

  const berjadwal = items.filter(
    (it) => it.plannedStart && it.plannedEnd && Number(it.totalPrice) > 0,
  )
  if (berjadwal.length === 0) return null

  const ember = new Array<number>(totalWeeks).fill(0)
  let adaYangMasuk = false

  for (const it of berjadwal) {
    const mulai = new Date(it.plannedStart as string)
    const selesai = new Date(it.plannedEnd as string)
    if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime())) continue

    // Rentang terbalik (end < start) = data rusak. Dilewati, BUKAN
    // dinormalkan diam-diam: menukarnya akan menyembunyikan kesalahan input
    // dan menghasilkan kurva yang terlihat benar padahal jadwalnya salah.
    if (selesai.getTime() < mulai.getTime()) continue

    // Durasi minimal 1 hari supaya item satu-hari tetap dapat nilai penuh.
    const durasiHari = Math.max(1, Math.round((selesai.getTime() - mulai.getTime()) / MS_PER_HARI) + 1)
    const nilaiPerHari = Number(it.totalPrice) / durasiHari

    for (let h = 0; h < durasiHari; h++) {
      const hari = new Date(mulai.getTime() + h * MS_PER_HARI)
      const idx = Math.floor((hari.getTime() - mulaiProyek.getTime()) / MS_PER_MINGGU)
      // Hari di LUAR rentang proyek dibuang, tidak dijepit ke minggu pertama/
      // terakhir. Menjepitnya akan menumpuk nilai palsu di ujung kurva dan
      // membuat PV melonjak di minggu yang sebenarnya tak direncanakan apa pun.
      if (idx >= 0 && idx < totalWeeks) {
        ember[idx] += nilaiPerHari
        adaYangMasuk = true
      }
    }
  }

  // Seluruh item berjadwal DI LUAR rentang proyek → sama tak berguna dengan
  // tak punya jadwal. Kembalikan null supaya fallback yang dipakai.
  return adaYangMasuk ? ember : null
}

/** Ringkasan untuk ditampilkan ke pemakai: berapa item yang benar-benar dipakai. */
export function ringkasCakupan(items: ItemBerjadwal[]): {
  total: number
  berjadwal: number
  pctNilai: number
} {
  const total = items.length
  const nilaiTotal = items.reduce((s, it) => s + Math.max(0, Number(it.totalPrice) || 0), 0)
  const terjadwal = items.filter((it) => it.plannedStart && it.plannedEnd && Number(it.totalPrice) > 0)
  const nilaiTerjadwal = terjadwal.reduce((s, it) => s + Number(it.totalPrice), 0)
  return {
    total,
    berjadwal: terjadwal.length,
    // Cakupan diukur dari NILAI, bukan jumlah item: 5 item besar terjadwal
    // lebih bermakna daripada 50 item kecil. Angka inilah yang menentukan
    // apakah PV layak dipercaya.
    pctNilai: nilaiTotal > 0 ? parseFloat(((nilaiTerjadwal / nilaiTotal) * 100).toFixed(2)) : 0,
  }
}
