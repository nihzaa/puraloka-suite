/**
 * KURVA S SEBAGAI GAMBAR — untuk kanal yang tak punya sesi login.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA, PADAHAL RUTE GRAFIK SUDAH ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `routes/v1/ai-grafik.ts` merender dengan memanggil
 * `/api/v1/projects/:id/kurva-s` lewat `server.inject`, meneruskan token
 * pemanggil. Itu benar untuk WEB, tempat penggunanya memang sedang login.
 *
 * WhatsApp tak punya token. Rancangan pertama saya tetap memakai `inject`
 * sambil meneruskan `request.headers.authorization` — yang di webhook SELALU
 * KOSONG. Rutenya akan membalas 401 dan cabang gambarnya tak pernah hidup:
 * kode yang terlihat lengkap sambil tak pernah mengirim satu gambar pun.
 *
 * Memberi webhook token akun layanan ditolak dengan alasan yang sama seperti
 * jalur tulis (`lib/tulis-klaim.ts`): grafik akan dirender dengan kewenangan
 * jauh lebih besar daripada penanyanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIGAMBAR DI SINI LEBIH SEDERHANA — DAN ITU DINYATAKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rute kurva-S menghitung EVM lengkap: PV dari jadwal RAB atau Gantt atau CDF
 * normal, serapan dana manual, aktual kas dari kasbon+expense+upah, lalu SPI/
 * CPI/EAC. Sekitar 450 baris yang sudah diperbaiki berkali-kali.
 *
 * Menyalinnya ke sini berarti DUA sumber angka untuk satu kurva, dan yang
 * kedua pasti menyimpang. Grafik yang berbeda dari halaman proyek lebih buruk
 * daripada tak ada grafik: dua-duanya terlihat resmi.
 *
 * Maka yang digambar di sini hanya apa yang bisa dibaca LANGSUNG dan tak
 * punya tafsir: **progres fisik terlapor dari `progress_logs`**, terhadap
 * garis waktu proyek. Judulnya menyebutkan itu apa adanya, dan subjudulnya
 * mengarahkan ke halaman proyek untuk kurva EVM penuh.
 *
 * Lebih sedikit daripada yang di web — dan dinyatakan, bukan disamarkan.
 */

import type { TenantDb } from '../utils/tenant-db.js'
import { grafikGarisSvg, svgKePng, WARNA_DERET } from './grafik-svg.js'
import type { DeretGrafik } from './grafik-svg.js'

interface BarisProyek {
  name: string
  start_date: string | null
  end_date: string | null
}

interface BarisLog {
  pct_overall: number | string | null
  logged_at: string | null
}

/**
 * Merender progres terlapor satu proyek jadi PNG.
 *
 * Melempar bila proyeknya tak terbaca — pemanggil menangkapnya dan jatuh ke
 * teks. Proyek yang tak ada BUKAN keadaan normal di sini: idnya sudah
 * diverifikasi tool sebelum sampai ke fungsi ini.
 */
export async function renderKurvaSPng(db: TenantDb, projectId: string): Promise<Buffer> {
  const { data: proyek, error: errProyek } = await db
    .from('projects')
    .select('name, start_date, end_date')
    .eq('id', projectId)
    .maybeSingle()

  if (errProyek) throw new Error(`gagal membaca proyek: ${errProyek.message}`)
  if (!proyek) throw new Error('proyek tidak ditemukan')

  const p = proyek as unknown as BarisProyek

  const { data: log, error: errLog } = await db
    .viaProject('progress_logs', projectId)
    .select('pct_overall, logged_at')
    .eq('project_id', projectId)
    .order('logged_at', { ascending: true })
    .limit(1000)

  if (errLog) throw new Error(`gagal membaca progres: ${errLog.message}`)

  const semua = ((log ?? []) as unknown as BarisLog[])
    .map((l) => ({
      pct: typeof l.pct_overall === 'number' ? l.pct_overall : Number(l.pct_overall),
      tgl: l.logged_at ? new Date(l.logged_at) : null,
    }))
    .filter((l) => Number.isFinite(l.pct) && l.tgl && !Number.isNaN(l.tgl.getTime()))

  /*
   * Progres dijadikan KUMULATIF-MAKSIMUM, bukan dipakai apa adanya.
   *
   * `pct_overall` adalah angka yang diketik orang lapangan, dan angka yang
   * turun (60 → 55) hampir selalu salah ketik, bukan pekerjaan yang dibongkar.
   * Menggambarnya turun membuat grafik terlihat seperti proyek yang mundur.
   *
   * Yang TIDAK dilakukan: mengisi minggu yang kosong. Lubang tetap lubang —
   * lihat kepala `grafik-svg.ts`.
   */
  const label: string[] = []
  const titik: Array<number | null> = []
  let tertinggi = 0

  for (const l of semua) {
    tertinggi = Math.max(tertinggi, l.pct)
    label.push(
      l.tgl!.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    )
    titik.push(tertinggi)
  }

  /*
   * Garis RENCANA hanya digambar bila tanggal proyeknya lengkap.
   *
   * Tanpa tanggal mulai/selesai, "rencana" apa pun adalah karangan. Lebih baik
   * satu garis jujur daripada dua garis yang salah satunya dibuat-buat.
   */
  const mulai = p.start_date ? new Date(p.start_date) : null
  const selesai = p.end_date ? new Date(p.end_date) : null
  const punyaRentang =
    mulai && selesai && !Number.isNaN(mulai.getTime()) && !Number.isNaN(selesai.getTime())
      && selesai.getTime() > mulai.getTime()

  const deret: DeretGrafik[] = [
    {
      nama: 'Progres terlapor',
      warna: WARNA_DERET.aktual,
      titik,
    },
  ]

  if (punyaRentang && semua.length > 0) {
    const rentang = selesai!.getTime() - mulai!.getTime()
    deret.unshift({
      nama: 'Rencana (linear)',
      warna: WARNA_DERET.rencana,
      titik: semua.map((l) => {
        const lewat = (l.tgl!.getTime() - mulai!.getTime()) / rentang
        return Math.max(0, Math.min(100, lewat * 100))
      }),
    })
  }

  const svg = grafikGarisSvg({
    judul: `Progres terlapor — ${p.name}`,
    subjudul:
      'Dari laporan lapangan. Kurva S penuh (EVM, serapan biaya) ada di halaman proyek.',
    satuan: '%',
    labelX: label,
    deret,
  })

  return svgKePng(svg)
}
