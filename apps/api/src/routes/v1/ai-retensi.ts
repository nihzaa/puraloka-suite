/**
 * POST /api/v1/ai/retensi/bersihkan — retensi percakapan yang BERJALAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KOLOM RETENSI YANG TAK MENGHAPUS APA PUN ADALAH JANJI KOSONG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 252 menambahkan `ai_pengaturan_tenant.retensi_hari`, dan halaman
 * Perilaku Asisten menampilkannya. Sampai berkas ini ada, **tak satu pun baris
 * pernah dihapus** — angka "30 hari" di layar tak berarti apa-apa.
 *
 * Itu bentuk cacat yang paling meyakinkan: tenant membaca "riwayat disimpan 30
 * hari", menyimpulkan datanya sudah dibersihkan, dan percakapan dua tahun lalu
 * masih utuh di basis. Kalau kelak ada kebocoran, yang terbuka jauh lebih
 * banyak daripada yang mereka kira mereka tanggung.
 *
 * ── Kenapa lewat rute, bukan pg_cron
 *
 * Pola yang sama dengan `cek-tenggat` dan `cek-milestone` (TJS-A2): penjadwal
 * memanggil rute HTTP. pg_cron hanya bisa menjalankan SQL, sementara keputusan
 * "berapa hari untuk tenant mana" hidup di aplikasi — dan menduplikasinya ke
 * SQL berarti dua sumber yang bisa tak sepakat.
 *
 * ── Kenapa DELETE, bukan penandaan
 *
 * Retensi yang menandai "sudah kedaluwarsa" tanpa menghapus tidak mengurangi
 * apa pun saat basis bocor. Yang dijanjikan ke tenant adalah datanya HILANG.
 *
 * `ai_pesan` ikut terhapus lewat `ON DELETE CASCADE` dari `ai_percakapan`
 * (migrasi 252) — dibuktikan di test, bukan diasumsikan dari deklarasi.
 *
 * ── Yang TIDAK dihapus: `ai_biaya_token`
 *
 * Biaya adalah catatan keuangan, bukan isi percakapan. Menghapusnya membuat
 * "berapa yang saya habiskan bulan lalu" kehilangan jawabannya, dan batas
 * bulanan menghitung dari data yang sudah dipotong. Retensi di sini soal ISI
 * yang memuat kutipan data operasional — bukan angka tagihan.
 */

import type { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { logAuditEvent } from '../../utils/audit.js'
import { pengaturanAiLintasTenant, percakapanAiLintasTenant } from '../../lib/jadwal.js'

/** Bandingkan rahasia tanpa membocorkan panjangnya lewat waktu. */
function rahasiaCocok(diberikan: string, benar: string): boolean {
  const a = Buffer.from(diberikan)
  const b = Buffer.from(benar)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export interface HasilBersih {
  company_id: string
  retensi_hari: number
  percakapan_dihapus: number
}

/**
 * Menghitung batas waktu dari hari retensi.
 *
 * Dipisah supaya bisa diuji tanpa basis: aritmetika tanggal adalah tempat
 * kesalahan diam-diam paling sering — 30 hari yang keliru jadi 30 jam tak
 * menimbulkan galat, hanya menghapus lebih banyak dari yang dijanjikan.
 */
export function batasRetensi(retensiHari: number, sekarang: Date): string {
  return new Date(sekarang.getTime() - retensiHari * 24 * 60 * 60 * 1000).toISOString()
}

export default async function aiRetensiRoutes(app: FastifyInstance) {
  app.post('/api/v1/ai/retensi/bersihkan', async (request, reply) => {
    // Dipanggil penjadwal, bukan pengguna. Rahasia yang sama dengan rute
    // jadwal lain — kalau tak disetel, rutenya MATI alih-alih terbuka.
    const rahasia = process.env.SCHEDULER_SECRET?.trim()
    if (!rahasia) {
      request.log.error('ai/retensi: SCHEDULER_SECRET belum disetel — rute dimatikan')
      return reply.status(503).send({ error: 'Penjadwal belum terkonfigurasi' })
    }
    const diberikan = (request.headers['x-scheduler-secret'] as string | undefined)?.trim() ?? ''
    if (!diberikan || !rahasiaCocok(diberikan, rahasia)) {
      return reply.status(401).send({ error: 'Rahasia penjadwal tidak cocok' })
    }

    const sekarang = new Date()
    // Hanya tenant yang BENAR-BENAR punya batas. `retensi_hari IS NULL`
    // berarti "simpan selamanya" — pilihan sadar yang tak boleh ditimpa
    // bawaan apa pun.
    const { data, error } = await (await pengaturanAiLintasTenant())
      .select('company_id, retensi_hari')
      .not('retensi_hari', 'is', null)

    if (error) {
      request.log.error({ err: error }, 'ai/retensi: gagal membaca pengaturan tenant')
      return reply.status(500).send({ error: 'Gagal membaca pengaturan retensi' })
    }

    const hasil: HasilBersih[] = []
    let gagal = 0

    for (const baris of (data ?? []) as Array<{ company_id: string; retensi_hari: number }>) {
      const batas = batasRetensi(baris.retensi_hari, sekarang)

      // `.select('id')` WAJIB: tanpa itu `count` tak pernah terisi dan
      // laporannya selalu nol — angka yang salah lebih buruk daripada tak ada
      // angka, karena ia dipercaya.
      const { data: dihapus, error: errHapus } = await (await percakapanAiLintasTenant())
        .delete()
        .eq('company_id', baris.company_id)
        .lt('diperbarui_pada', batas)
        .select('id')

      if (errHapus) {
        // Satu tenant gagal TIDAK menghentikan yang lain. Melemparnya berarti
        // tenant ke-2 sampai ke-N tak pernah dibersihkan karena tenant
        // pertama bermasalah.
        request.log.error(
          { err: errHapus, companyId: baris.company_id },
          'ai/retensi: gagal membersihkan percakapan tenant',
        )
        gagal++
        continue
      }

      const jumlah = (dihapus ?? []).length
      hasil.push({
        company_id: baris.company_id,
        retensi_hari: baris.retensi_hari,
        percakapan_dihapus: jumlah,
      })

      // Penghapusan data dicatat. Tanpa jejak, "kenapa riwayat saya hilang"
      // tak punya jawaban — dan retensi yang tak bisa dijelaskan terbaca
      // sebagai kehilangan data.
      if (jumlah > 0) {
        void logAuditEvent(request, {
          tableName: 'ai_percakapan',
          recordId: baris.company_id,
          action: 'ai.retensi.bersih',
          // Penjadwal bukan manusia; `system` menandainya tanpa mengarang pelaku.
          actorId: 'system',
          newValues: { retensi_hari: baris.retensi_hari, dihapus: jumlah, batas },
          severity: 'warning',
          via: 'penjadwal',
        })
      }
    }

    const total = hasil.reduce((a, h) => a + h.percakapan_dihapus, 0)
    request.log.info({ tenant: hasil.length, total, gagal }, 'ai/retensi: pembersihan selesai')

    return reply.send({
      ok: gagal === 0,
      tenant_diperiksa: hasil.length,
      percakapan_dihapus: total,
      // `gagal` DILAPORKAN, bukan disembunyikan di balik ok:true. Penjadwal
      // yang selalu melihat sukses tak pernah memicu peninjauan.
      tenant_gagal: gagal,
      rincian: hasil.filter((h) => h.percakapan_dihapus > 0),
    })
  })
}
