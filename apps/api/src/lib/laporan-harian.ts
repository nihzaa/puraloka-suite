/**
 * LAPORAN HARIAN (DPR) — menyusun catatan lapangan jadi dokumen per-hari.
 *
 * ── Yang diukur 2026-08-12
 *
 * `progress_logs` berisi 271 baris, dan 98 di antaranya bermode `daily`
 * dengan `weather` + `worker_count` + `notes` terisi. Datanya dikumpulkan
 * mandor setiap hari lewat portal.
 *
 * Yang tak ada: layar yang membacanya sebagai LAPORAN. Dashboard hanya
 * menampilkan tanggal update terakhir; `/lapangan` menampilkan rerata dan
 * grafik. Catatan kendala yang ditulis mandor tak pernah terbaca siapa pun.
 *
 * ── Kenapa hanya mode `daily`
 *
 * `progress_logs` menampung DUA jenis catatan:
 *
 *   daily   laporan harian proyek — cuaca, jumlah pekerja, kendala
 *   detail  progres per-item RAB — dipakai kurva-S dan EVM
 *
 * Mencampurnya membuat satu hari terlihat punya 48 "laporan harian" padahal
 * itu 48 item RAB yang diperbarui sekaligus. Diukur: 2026-06-16 punya 48
 * baris, hanya 3 di antaranya bercuaca.
 *
 * ── Kenapa jumlah pekerja DIJUMLAH, bukan dirata-rata
 *
 * Tiap laporan berasal dari satu mandor/lingkup kerja. Dua mandor melapor 6
 * dan 8 pekerja berarti 14 orang di lapangan hari itu, bukan 7.
 */

export interface BarisProgres {
  id: string
  project_id: string
  mode: string | null
  logged_at: string
  pct_overall: number | string | null
  weather: string | null
  worker_count: number | string | null
  notes: string | null
  reporter?: { id?: string; name?: string } | null
}

export interface HariLaporan {
  tanggal: string
  /** Jumlah laporan `daily` pada hari itu — bukan jumlah baris progress_logs. */
  laporan: number
  /**
   * Laporan yang isinya PERSIS SAMA dengan laporan lain pada hari & proyek
   * yang sama, dan karenanya tak ikut dijumlahkan.
   *
   * Diukur 2026-08-12: 2026-06-16 punya TIGA baris identik (teks, cuaca, dan
   * `worker_count` 18 semuanya sama). Menjumlahkannya menghasilkan 54 pekerja
   * untuk hari yang sesungguhnya 18 — angka yang salah tiga kali lipat, tanpa
   * satu pun galat.
   *
   * Ditampilkan, bukan disembunyikan: yang membaca berhak tahu bahwa harinya
   * punya kiriman ganda, karena itu gejala alur pelaporan yang perlu
   * dibereskan di hulu.
   */
  duplikat: number
  proyek: number
  /** Total pekerja lintas laporan hari itu. */
  pekerja: number | null
  /** Cuaca yang tercatat, unik dan berurutan seperti dilaporkan. */
  cuaca: string[]
  /** Catatan kendala yang ditulis mandor — inti dokumen ini. */
  catatan: Array<{ proyek_id: string; teks: string; pelapor: string | null }>
  /** Progres tertinggi yang dilaporkan hari itu, per proyek. */
  progres: Array<{ proyek_id: string; pct: number }>
}

/** Ambil bagian tanggal dari timestamptz — tanpa menggeser zona waktu. */
const tanggalDari = (iso: string) => String(iso).slice(0, 10)

/**
 * Susun baris `progress_logs` jadi laporan per hari.
 *
 * Baris bermode selain `daily` DIBUANG, bukan diikutkan dengan bobot lebih
 * kecil: ia jenis catatan yang berbeda, bukan versi lemah dari yang sama.
 */
export function susunLaporanHarian(baris: BarisProgres[]): HariLaporan[] {
  const perHari = new Map<string, {
    laporan: number
    duplikat: number
    /** Sidik isi laporan (proyek+teks+cuaca+pekerja) yang sudah dihitung. */
    sidik: Set<string>
    proyek: Set<string>
    pekerja: number
    adaPekerja: boolean
    cuaca: string[]
    catatan: HariLaporan['catatan']
    progres: Map<string, number>
  }>()

  for (const b of baris) {
    if (b.mode !== 'daily') continue
    if (!b.logged_at) continue

    const tgl = tanggalDari(b.logged_at)
    const e = perHari.get(tgl) ?? {
      laporan: 0, duplikat: 0, sidik: new Set<string>(),
      proyek: new Set<string>(), pekerja: 0, adaPekerja: false,
      cuaca: [], catatan: [], progres: new Map<string, number>(),
    }

    // Kiriman ganda dikenali dari ISINYA, bukan dari id.
    //
    // Tiga baris dengan proyek, teks, cuaca, dan jumlah pekerja yang persis
    // sama adalah satu laporan yang terkirim tiga kali — bukan tiga mandor
    // yang kebetulan menulis kalimat identik. Menjumlahkannya melipatgandakan
    // jumlah pekerja tanpa satu pun galat.
    const sidik = [
      b.project_id,
      (b.notes ?? '').trim(),
      (b.weather ?? '').trim(),
      String(b.worker_count ?? ''),
    ].join('|')
    if (e.sidik.has(sidik)) {
      e.duplikat += 1
      perHari.set(tgl, e)
      continue
    }
    e.sidik.add(sidik)

    e.laporan += 1
    if (b.project_id) e.proyek.add(b.project_id)

    // `Number('')` bernilai 0, bukan NaN — kelas cacat yang berulang di repo
    // ini. Kosong ditangani SEBELUM konversi supaya "tak melapor" tak
    // berubah jadi "nol pekerja". Bedanya nyata: nol pekerja berarti
    // pekerjaan berhenti hari itu.
    if (b.worker_count !== null && b.worker_count !== undefined && b.worker_count !== '') {
      const n = Number(b.worker_count)
      if (Number.isFinite(n) && n >= 0) {
        e.pekerja += n
        e.adaPekerja = true
      }
    }

    const cuaca = (b.weather ?? '').trim()
    if (cuaca && !e.cuaca.includes(cuaca)) e.cuaca.push(cuaca)

    const teks = (b.notes ?? '').trim()
    if (teks) {
      e.catatan.push({
        proyek_id: b.project_id,
        teks,
        pelapor: b.reporter?.name ?? null,
      })
    }

    if (b.pct_overall !== null && b.pct_overall !== undefined && b.pct_overall !== '') {
      const p = Number(b.pct_overall)
      // Progres TERTINGGI per proyek, bukan yang terakhir masuk.
      //
      // Laporan susulan atau koreksi bisa masuk dengan angka lebih rendah;
      // memakai "yang terakhir" membuat progres proyek terlihat MUNDUR pada
      // hari yang sama. Pola yang sama dipakai `alat-operasional` untuk
      // pembacaan meter.
      if (Number.isFinite(p)) {
        const lama = e.progres.get(b.project_id)
        if (lama === undefined || p > lama) e.progres.set(b.project_id, p)
      }
    }

    perHari.set(tgl, e)
  }

  return [...perHari.entries()]
    .map(([tanggal, e]) => ({
      tanggal,
      laporan: e.laporan,
      duplikat: e.duplikat,
      proyek: e.proyek.size,
      // `null` bila TAK SATU PUN laporan menyebut jumlah pekerja — dibedakan
      // dari 0 yang berarti benar-benar nol orang di lapangan.
      pekerja: e.adaPekerja ? e.pekerja : null,
      cuaca: e.cuaca,
      catatan: e.catatan,
      progres: [...e.progres.entries()].map(([proyek_id, pct]) => ({ proyek_id, pct })),
    }))
    // Terbaru di atas: yang membaca laporan harian hampir selalu mencari
    // hari ini atau kemarin.
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
}

/** Ringkasan satu rentang — untuk kartu di atas daftar. */
export function ringkasRentang(hari: HariLaporan[]): {
  hariBerlaporan: number
  totalLaporan: number
  totalCatatan: number
  rerataPekerja: number | null
} {
  const totalLaporan = hari.reduce((a, h) => a + h.laporan, 0)
  const totalCatatan = hari.reduce((a, h) => a + h.catatan.length, 0)

  // Rerata hanya atas hari yang MELAPORKAN pekerja. Membagi dengan seluruh
  // hari akan menurunkan angkanya tiap kali ada hari tanpa data — dan
  // "tak ada laporan" bukan "nol pekerja".
  const berpekerja = hari.filter(h => h.pekerja !== null)
  const rerataPekerja = berpekerja.length === 0
    ? null
    : Math.round(berpekerja.reduce((a, h) => a + (h.pekerja ?? 0), 0) / berpekerja.length)

  return {
    hariBerlaporan: hari.length,
    totalLaporan,
    totalCatatan,
    rerataPekerja,
  }
}
