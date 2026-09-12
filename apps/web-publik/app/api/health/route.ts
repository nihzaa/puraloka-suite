import { NextResponse } from 'next/server'

/**
 * Health check ringan untuk container `web-publik`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA RUTE INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebelumnya `docker-compose.yml` menembak `/` — HALAMAN DEPAN — tiap 30
 * detik. Itu bekerja, tetapi mahal dan berisik:
 *
 * 1. **Halaman depan di-render penuh** setiap denyut: ia mengambil profil
 *    perusahaan, seksi, dan foto dari Supabase. Sehat atau tidaknya proses
 *    Next.js tak perlu dibuktikan dengan pekerjaan sebanyak itu.
 *
 * 2. **Ia MENGOTORI log API dengan peringatan yang tak bisa
 *    ditindaklanjuti.** Diukur di produksi 2026-09-12:
 *
 *        48 dari 48 peringatan (level 40) dalam 24 jam berbunyi
 *        "host situs tak terdaftar di situs_domain", host 127.0.0.1
 *
 *    Sebabnya benar dan disengaja: situs publik meresolusi TENANT DARI
 *    HOSTNAME (migrasi 564), dan `127.0.0.1` memang bukan domain tenant
 *    mana pun. `situs.ts:386` menolaknya dengan 404 — gagal-tertutup,
 *    persis yang diinginkan.
 *
 *    Yang salah bukan penolakannya, melainkan SIAPA yang mengetuk.
 *
 * ── Kenapa ini penting, bukan sekadar kerapian
 *
 * Log produksi di sini JSON ke stdout tanpa agregator, dengan rotasi 30 MB
 * (3 × 10 MB). Satu-satunya peringatan yang muncul tiap hari adalah
 * peringatan yang TIDAK BERARTI APA-APA.
 *
 * Itu melatih siapa pun yang membuka log untuk mengabaikan level 40 — dan
 * peringatan sungguhan berikutnya akan tenggelam di antaranya. Kelas cacat
 * yang sudah tercatat di repo ini: `audit-jadwal-company-hidup` lahir dari
 * "kegagalan WAJAR yang berulang mengajari orang mengabaikan kolom status".
 *
 * ── Yang DIBUKTIKAN rute ini, dan yang tidak
 *
 * Ia membuktikan proses Next.js hidup dan bisa menjawab. Ia TIDAK
 * membuktikan basis terjangkau atau halaman depan merender — dan itu
 * disengaja: healthcheck yang gagal karena Supabase lambat akan
 * me-restart container yang sebenarnya sehat, lalu memperburuk keadaan.
 *
 * Kesehatan data sudah dijaga di tempat yang tepat: `perbarui-vps.sh`
 * langkah 5 menembak `/` lewat domain PUBLIK sesudah deploy — satu kali,
 * saat keadaannya bermakna, dan lewat hostname yang benar-benar terdaftar.
 */

/*
  `force-dynamic` supaya ia tak pernah di-prerender jadi HTML statis saat
  build. Health check yang menjawab dari cache tak membuktikan apa pun
  tentang proses yang sedang berjalan.
*/
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ ok: true, layanan: 'web-publik' })
}
