// REKAP ABSENSI LAPANGAN — dari catatan harian jadi "berapa hari & berapa jam".
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA MODUL INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Angka yang keluar dari sini MENENTUKAN UPAH. `wage_items.days_worked` dulu
// diketik mandor dari ingatan; `absensi_harian` menjadi sumbernya, dan rekap
// inilah yang mengubah catatan harian jadi angka yang dibayarkan.
//
// Aritmetikanya sebelumnya hidup di dalam handler `routes/v1/absensi.ts`, dan
// diukur 2026-08-08: **nol test menyentuh `porsi_hari` maupun `jam_lembur`**.
// Handler itu sudah sadar akan jebakan NUMERIC-string dan menulis komentar
// yang tepat tentangnya — tapi kesadaran yang tak diuji bukan jaminan: siapa
// pun boleh menghapus `Number()` saat menyunting, dan tak satu pun test
// berbunyi. Yang berubah cuma nominal di slip upah.
//
// ── Kenapa fungsi murni, bukan tetap di route
//
// Tiga alasan, semuanya terukur:
//
//   1. Aritmetika di dalam handler hanya bisa diuji lewat basis. Test integrasi
//      yang membutuhkan fixture pekerja + lingkup + tanggal berjalan ~1,3 detik
//      per kasus; yang murni berjalan dalam mikrodetik, jadi kasus tepinya
//      benar-benar ditulis alih-alih dilewati karena mahal.
//   2. Kasus yang paling penting justru yang paling sulit disiapkan di basis:
//      NUMERIC yang datang sebagai string, pekerja tanpa nama, porsi pecahan
//      yang berulang (1/3 hari × 3).
//   3. Handler tetap yang menentukan siapa boleh melihat apa. Yang dipindah
//      hanya hitungannya — tenancy TIDAK ikut pindah, dan tak boleh.

/**
 * NUMERIC Postgres tiba sebagai STRING lewat driver ini.
 *
 * `"1" + "1"` menghasilkan `"11"`, bukan 2 — dan 11 hari kerja masuk ke
 * laporan upah tanpa satu pun error. Ini bukan hipotesis: pola yang sama
 * sudah menggigit di modul lain repo ini.
 *
 * Nilai yang tak bisa jadi angka dihitung 0, bukan NaN: NaN akan merambat ke
 * seluruh total dan membuat SATU baris rusak menghapus rekap satu lingkup.
 */
function angka(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface BarisAbsensi {
  worker_id: string
  /** Porsi hari kerja: 1 = penuh, 0.5 = setengah, 0 = tidak hadir. */
  porsi_hari: number | string | null
  /** Jam lembur — DIHITUNG TERPISAH, tak pernah dilebur ke `porsi_hari`. */
  jam_lembur: number | string | null
  nama?: string | null
  tipe?: string | null
}

export interface RekapPekerja {
  worker_id: string
  nama: string
  tipe: string | null
  /** Jumlah porsi hari sepanjang rentang. Boleh pecahan. */
  hari: number
  /** Jumlah jam lembur sepanjang rentang. */
  lembur: number
  /** Berapa HARI KALENDER pekerja ini punya catatan — bukan jumlah porsinya. */
  jumlah_catatan: number
}

export interface HasilRekap {
  rekap: RekapPekerja[]
  total_hari: number
  total_lembur: number
  /** Pekerja yang catatannya ada tapi porsinya nol sepanjang rentang. */
  jumlah_tanpa_kehadiran: number
}

/**
 * Rekap absensi per pekerja.
 *
 * INVARIAN yang diuji (`__tests__/rekap-absensi.test.ts`):
 *
 *  1. NUMERIC string dijumlahkan sebagai ANGKA. `"1" + "1"` = 2, bukan "11".
 *  2. Lembur TIDAK PERNAH menambah `hari`. Lembur dibayar dengan tarif
 *     berbeda; meleburnya membuat 8 jam lembur terbaca sebagai satu hari
 *     kerja biasa, dan selisihnya persis di bagian yang paling mahal.
 *  3. Porsi pecahan dijumlahkan apa adanya — 0.5 + 0.5 = 1, bukan 2 hari
 *     (dua catatan) dan bukan 1 catatan.
 *  4. Pekerja yang sama pada tanggal berbeda DIGABUNG ke satu baris.
 *  5. Pekerja tanpa nama tetap muncul, dengan penanda — hilang dari rekap
 *     berarti upahnya tak terhitung, dan itu tak akan diprotes siapa pun
 *     sampai orangnya menagih.
 *  6. `total_hari` sama dengan jumlah `hari` seluruh baris. Total yang
 *     dihitung dari sumber berbeda bisa berselisih diam-diam.
 *  7. Urutan berdasarkan nama, memakai perbandingan Indonesia.
 */
export function rekapAbsensi(baris: BarisAbsensi[]): HasilRekap {
  const per = new Map<string, RekapPekerja>()

  for (const b of baris) {
    let e = per.get(b.worker_id)
    if (!e) {
      e = {
        worker_id: b.worker_id,
        // INVARIAN 5: nama kosong TIDAK menghapus barisnya. Penandanya
        // sengaja terbaca sebagai anomali, bukan sebagai nama.
        nama: b.nama?.trim() || '(tanpa nama)',
        tipe: b.tipe ?? null,
        hari: 0,
        lembur: 0,
        jumlah_catatan: 0,
      }
      per.set(b.worker_id, e)
    }
    // Nama menyusul bila baris pertama kebetulan tak membawanya.
    if (b.nama?.trim() && e.nama === '(tanpa nama)') e.nama = b.nama.trim()
    if (b.tipe && !e.tipe) e.tipe = b.tipe

    // INVARIAN 1 & 2: keduanya dijumlahkan sebagai angka, ke ember MASING-MASING.
    e.hari += angka(b.porsi_hari)
    e.lembur += angka(b.jam_lembur)
    e.jumlah_catatan += 1
  }

  const rekap = [...per.values()].sort((a, b) =>
    a.nama.localeCompare(b.nama, 'id'))

  return {
    rekap,
    // INVARIAN 6: diturunkan dari `rekap` yang sama, bukan dijumlahkan ulang
    // dari `baris` — dua jalur hitung yang berbeda akan berselisih begitu
    // salah satunya disunting.
    total_hari: rekap.reduce((s, r) => s + r.hari, 0),
    total_lembur: rekap.reduce((s, r) => s + r.lembur, 0),
    jumlah_tanpa_kehadiran: rekap.filter((r) => r.hari === 0).length,
  }
}
