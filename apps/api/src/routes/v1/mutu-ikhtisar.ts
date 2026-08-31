/**
 * GET /api/v1/mutu/ikhtisar — dashboard menu induk "Mutu & K3".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * GRUP TERAKHIR YANG BELUM PUNYA IKHTISAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `uji-induk-punya-ikhtisar` menandai `g-mutu-kepatuhan` sebagai satu-satunya
 * grup induk yang tersisa (lantai 1). Dengan halaman ini, lantainya turun ke
 * NOL — setiap menu induk punya tempat untuk melihat gambaran modulnya.
 *
 * ── Pertanyaan yang dibawa ke halaman ini
 *
 * "Apa yang belum beres, dan mana yang paling mendesak?" Mutu dan K3 punya
 * sifat yang sama: temuannya terbuka satu per satu di lima halaman berbeda
 * (NCR, inspeksi, punch, izin kerja, dokumen kepatuhan), dan tak ada satu
 * layar pun yang menjawab "berapa banyak yang menganggur".
 *
 * ── Yang PALING penting di modul ini: dokumen yang KEDALUWARSA
 *
 * Berbeda dari modul lain, kepatuhan punya kelas masalah yang muncul TANPA
 * ada yang melakukan apa pun: sertifikat dan asuransi yang habis masa
 * berlakunya. Tak ada notifikasi yang lahir dari ketiadaan tindakan, jadi ia
 * hanya ketahuan saat dibutuhkan — yaitu saat sudah terlambat.
 *
 * Karena itu ia dihitung terpisah, bukan digabung ke "dokumen".
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate } from '../../plugins/auth.js'
import { requireModul } from '../../utils/gerbang-modul.js'

interface BarisNcr {
  nomor: string | null
  judul: string | null
  severity: string | null
  status: string | null
  target_selesai: string | null
  project_id: string
}

interface BarisInspeksi {
  nomor: string | null
  judul: string | null
  status: string | null
  project_id: string
}

interface BarisDokumen {
  pihak_nama: string | null
  jenis: string | null
  berlaku_sampai: string | null
  terverifikasi: boolean | null
}

interface BarisIzin {
  nomor: string | null
  jenis: string | null
  status: string | null
  berlaku_sampai: string | null
}

interface BarisEvaluasi {
  pihak_nama: string | null
  skor_k3: unknown
  jumlah_kecelakaan: number | null
  masuk_daftar_hitam: boolean | null
}

const angka = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : 0
}

/** Hari sampai tanggal; negatif = sudah lewat. */
function sisaHari(tanggal: string | null): number | null {
  if (!tanggal) return null
  return Math.ceil((new Date(tanggal).getTime() - Date.now()) / 86_400_000)
}

export async function ringkasMutu(request: FastifyRequest) {
  const db = request.db!

  /*
   * `projectIds()` lebih dulu: `ncr_items` dan `inspection_requests` kategori
   * C, dan menyaringnya lewat daftar proyek milik tenant adalah satu-satunya
   * cara membaca LINTAS proyek tanpa melepas tenancy.
   */
  const idProyek = await db.projectIds()

  const [ncr, inspeksi, dokumen, izin, evaluasi, punch] = await Promise.all([
    idProyek.length
      ? db
          .unsafe('ncr_items', 'ikhtisar mutu: NCR lintas proyek milik tenant, disaring project_id')
          .select('nomor, judul, severity, status, target_selesai, project_id')
          .in('project_id', idProyek)
      : Promise.resolve({ data: [], error: null }),
    idProyek.length
      ? db
          .unsafe('inspection_requests', 'ikhtisar mutu: inspeksi lintas proyek milik tenant')
          .select('nomor, judul, status, project_id')
          .in('project_id', idProyek)
      : Promise.resolve({ data: [], error: null }),
    db.from('dokumen_kepatuhan').select('pihak_nama, jenis, berlaku_sampai, terverifikasi'),
    db.from('izin_kerja').select('nomor, jenis, status, berlaku_sampai'),
    db
      .from('evaluasi_subkon')
      .select('pihak_nama, skor_k3, jumlah_kecelakaan, masuk_daftar_hitam'),
    idProyek.length
      ? db
          .unsafe('punch_items', 'ikhtisar mutu: punch item lintas proyek milik tenant')
          .select('status')
          .in('project_id', idProyek)
      : Promise.resolve({ data: [], error: null }),
  ])

  /*
   * Galat DIPERIKSA sebelum apa pun dihitung.
   *
   * Untuk halaman ikhtisar, `?? []` mengubah "tak bisa membaca" jadi "tak ada
   * masalah" — dan itu kebalikan dari yang dibutuhkan orang yang membukanya.
   */
  const gagal = [ncr, inspeksi, dokumen, izin, evaluasi, punch].find((r) => r.error)
  if (gagal) throw new Error(`Gagal membaca data mutu: ${gagal.error!.message}`)

  const barisNcr = ncr.data as unknown as BarisNcr[]
  const barisInspeksi = inspeksi.data as unknown as BarisInspeksi[]
  const barisDokumen = dokumen.data as unknown as BarisDokumen[]
  const barisIzin = izin.data as unknown as BarisIzin[]
  const barisEvaluasi = evaluasi.data as unknown as BarisEvaluasi[]
  const barisPunch = punch.data as unknown as Array<{ status: string | null }>

  const ncrTerbuka = barisNcr.filter((n) => n.status !== 'ditutup' && n.status !== 'closed')

  // Dokumen yang HABIS atau hampir habis. 30 hari dipilih karena perpanjangan
  // sertifikat/asuransi di Indonesia lazimnya butuh 2-4 minggu — peringatan
  // yang datang seminggu sebelumnya sudah terlambat untuk ditindaklanjuti.
  const AMBANG_HARI = 30
  const dokumenBermasalah = barisDokumen
    .map((d) => ({ ...d, sisa: sisaHari(d.berlaku_sampai) }))
    .filter((d) => d.sisa !== null && d.sisa <= AMBANG_HARI)
    .sort((a, b) => (a.sisa ?? 0) - (b.sisa ?? 0))

  return {
    ncr: {
      total: barisNcr.length,
      terbuka: ncrTerbuka.length,
      // Yang berat DIPISAH: satu NCR "major" menuntut tindakan berbeda dari
      // sepuluh yang "minor", dan jumlah total menyamarkan bedanya.
      berat: ncrTerbuka.filter((n) => /major|mayor|tinggi|high/i.test(n.severity ?? '')).length,
      daftar: ncrTerbuka.slice(0, 8).map((n) => ({
        nomor: n.nomor ?? '(tanpa nomor)',
        judul: n.judul ?? '—',
        severity: n.severity ?? '—',
        status: n.status ?? '—',
        sisa_hari: sisaHari(n.target_selesai),
      })),
    },
    inspeksi: {
      total: barisInspeksi.length,
      menunggu: barisInspeksi.filter((i) => i.status === 'diminta' || i.status === 'pending').length,
    },
    punch: {
      total: barisPunch.length,
      terbuka: barisPunch.filter((p) => p.status !== 'closed' && p.status !== 'selesai').length,
    },
    dokumen: {
      total: barisDokumen.length,
      belum_terverifikasi: barisDokumen.filter((d) => !d.terverifikasi).length,
      kedaluwarsa: dokumenBermasalah.filter((d) => (d.sisa ?? 0) < 0).length,
      segera_habis: dokumenBermasalah.filter((d) => (d.sisa ?? 0) >= 0).length,
      daftar: dokumenBermasalah.slice(0, 8).map((d) => ({
        pihak: d.pihak_nama ?? '—',
        jenis: d.jenis ?? '—',
        sisa_hari: d.sisa,
      })),
    },
    izin_kerja: {
      total: barisIzin.length,
      aktif: barisIzin.filter((i) => i.status === 'disetujui' || i.status === 'aktif').length,
      menunggu: barisIzin.filter((i) => i.status === 'diajukan' || i.status === 'pending').length,
    },
    k3: {
      // Kecelakaan dijumlahkan dari evaluasi subkon — satu-satunya tempat
      // angkanya tercatat hari ini. Kalau kelak ada tabel insiden sendiri,
      // sumbernya berpindah ke sana dan angkanya TIDAK dijumlahkan dua kali.
      kecelakaan: barisEvaluasi.reduce((n, e) => n + (e.jumlah_kecelakaan ?? 0), 0),
      daftar_hitam: barisEvaluasi.filter((e) => e.masuk_daftar_hitam).length,
      skor_k3_terendah: barisEvaluasi.length
        ? Math.min(...barisEvaluasi.map((e) => angka(e.skor_k3)))
        : null,
    },
  }
}

export default async function mutuIkhtisarRoutes(app: FastifyInstance) {
  /*
   * TANPA `requirePermission`, hanya `authenticate`.
   *
   * Sengaja, dan bukan kelalaian: sub-menu di grup ini pun tak menyaring
   * permission (diukur dari `menu_items.required_permissions` — semuanya
   * array KOSONG). Menuntut izin di ikhtisar berarti halaman induknya lebih
   * ketat daripada isinya, dan orang melihat "akses ditolak" untuk ringkasan
   * dari data yang boleh ia buka satu per satu.
   *
   * Tenancy tetap dijaga `request.db` di tiap query.
   */
  app.get(
    '/api/v1/mutu/ikhtisar',
    { preHandler: [authenticate, requireModul('modul.uji_mutu')] },
    async (request, reply) => {
      try {
        return reply.send(await ringkasMutu(request))
      } catch (e) {
        request.log.error({ err: e }, 'mutu: gagal menyusun ikhtisar')
        return reply.status(500).send({ error: 'Gagal menyusun ikhtisar mutu' })
      }
    },
  )
}
