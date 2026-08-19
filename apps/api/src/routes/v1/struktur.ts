import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { logAuditEvent } from '../../utils/audit.js'
import { proyekMilikTenant } from '../../utils/tenant-guard.js'
import { supabase } from '../../utils/supabase.js'

import { analisaBalok, analisaKolom, rekapVolume, type VolumeElemen } from '../../lib/struktur-beton.js'
import { analisaKolomBulat } from '../../lib/struktur-kolom-bulat.js'
import { analisaPlat } from '../../lib/struktur-plat.js'
import { analisaFootplat } from '../../lib/struktur-footplat.js'
import { analisaPilecap } from '../../lib/struktur-pilecap.js'
import { analisaTiang } from '../../lib/struktur-tiang.js'
import { analisaKolomLengkap, analisaKolomBulatLengkap } from '../../lib/struktur-kolom-lengkap.js'
import { jelaskan, ringkasanAwam, tingkatBahaya, apakahBiner } from '../../lib/struktur-awam.js'
import {
  usulanDariElemen, gabungUsulan, assemblyCocok,
  type UsulanGabungan,
} from '../../lib/struktur-ke-rab.js'
import { analisaBalokBaja, analisaKolomBaja } from '../../lib/struktur-baja.js'
import {
  analisaSambunganBaut, analisaSambunganLas,
} from '../../lib/struktur-baja-sambungan.js'
import { analisaBasePlate, analisaAngkur } from '../../lib/struktur-baja-tumpuan.js'
import { analisaRangka } from '../../lib/struktur-baja-rangka.js'
import {
  analisaGording, analisaBracing, analisaInteraksiTekanMomen,
} from '../../lib/struktur-baja-gording.js'
import {
  gambarPenampang, gambarDiagramPM, gambarPenampangLingkaran,
  gambarPotonganPelat, gambarPondasi, gambarTiang, gambarMeteranKekuatan,
} from '../../lib/struktur-gambar.js'

/**
 * ANALISA STRUKTUR — rute penyimpanan & perhitungan.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PEMBAGIAN TUGAS: basis MENYIMPAN, pustaka MENGHITUNG
 *
 * Rute ini TIDAK punya aritmetika sendiri. Seluruh angka datang dari
 * `lib/struktur-*.ts` yang pure dan ber-golden-test terhadap workbook.
 *
 * Alasannya bukan kerapian: begitu ada rumus di rute, ia tak bisa diuji tanpa
 * basis dan tanpa login — dan yang tak murah diuji akan berhenti diuji.
 * Pola yang sama dipakai `estimate-versions.ts` (computeAhsp) dan
 * `rap.ts` (computeMaterialAggregation).
 *
 * ── Yang disimpan cuma INPUT + RINGKASAN
 *
 * Hasil lengkap (kurva P-M 200 titik, posisi tiap batang, SVG) DIHITUNG SAAT
 * DIMINTA, tidak disimpan. Fungsi analisanya pure, jadi input yang sama selalu
 * memberi keluaran yang sama — menyimpannya berarti punya dua sumber kebenaran
 * yang bisa berselisih diam-diam saat rumus diperbaiki.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/** Jenis elemen yang dikenali — cerminan CHECK di migrasi 458. */
/**
 * Jenis elemen yang dikenali — cerminan CHECK di migrasi 458 + 463.
 *
 * ⚠ Daftar ini WAJIB sama dengan CHECK `struktur_elemen_jenis_check` di basis.
 * Kalau berbeda, salah satu arah gagal tanpa gejala yang menunjuk sebabnya:
 * jenis yang ada di sini tetapi tidak di basis ditolak dengan pesan constraint
 * mentah; yang ada di basis tetapi tidak di sini ditolak rute sebagai "jenis
 * tak dikenal" padahal barisnya sah.
 *
 * Dijaga `audit-jenis-struktur-cocok.mjs`.
 */
const JENIS = [
  // Beton
  'balok', 'kolom', 'kolom_bulat', 'plat', 'footplat', 'pilecap', 'tiang',
  // Baja
  'baja_balok', 'baja_kolom', 'baja_gording', 'baja_bracing',
  'baja_rangka', 'baja_base_plate', 'baja_angkur',
  'baja_sambungan_baut', 'baja_sambungan_las', 'baja_interaksi',
] as const
type Jenis = (typeof JENIS)[number]

interface BarisElemen {
  id: string
  kode: string
  nama: string | null
  jenis: Jenis
  jumlah: number
  input: Record<string, unknown>
  aman: boolean | null
  basi: boolean
}

/**
 * Jalankan modul analisa yang sesuai jenisnya.
 *
 * `input` datang sebagai jsonb — bentuknya TIDAK dijamin TypeScript, jadi tiap
 * modul memvalidasi sendiri lewat `throw`. Kesalahan bentuk karena itu muncul
 * sebagai pesan yang menyebut medannya ("Panjang balok harus > 0"), bukan
 * `undefined is not a number` di tengah perhitungan.
 */
function hitung(jenis: Jenis, input: Record<string, unknown>, jumlah: number) {
  const dgnJumlah = { ...input, jumlah }
  switch (jenis) {
    // Kolom memakai varian LENGKAP — verdict-nya termasuk diagram P-M penuh.
    // Memakai `analisaKolom` polos di sini akan mengembalikan batas Fase 1
    // yang sudah ditutup Fase 2: kolom bermomen besar lolos dengan "aman".
    case 'kolom': return analisaKolomLengkap(dgnJumlah as never)
    case 'kolom_bulat': return analisaKolomBulatLengkap(dgnJumlah as never)
    case 'balok': return analisaBalok(dgnJumlah as never)
    case 'plat': return analisaPlat(dgnJumlah as never)
    case 'footplat': return analisaFootplat(dgnJumlah as never)
    case 'pilecap': return analisaPilecap(dgnJumlah as never)
    case 'tiang': return analisaTiang(dgnJumlah as never)

    /*
      ── BAJA

      Tiap jenis punya bentuk INPUT yang berbeda, dan validasinya dilakukan
      modulnya sendiri lewat `throw` — sama seperti beton. Yang membedakan:
      sebagian jenis baja TIDAK punya `volume` (sambungan baut, las, angkur,
      interaksi), karena yang dihitung kapasitas sambungan, bukan kuantitas
      material.

      `volumeDari` memulangkan null untuk mereka, dan `rekap-volume`
      melewatkannya — itu benar, tetapi harus DISENGAJA. Lihat catatan di
      `volumeDari`.
    */
    case 'baja_balok': return analisaBalokBaja(dgnJumlah as never)
    case 'baja_kolom': return analisaKolomBaja(dgnJumlah as never)
    case 'baja_gording': return analisaGording(dgnJumlah as never)
    case 'baja_bracing': return analisaBracing(dgnJumlah as never)
    case 'baja_rangka': return analisaRangka(dgnJumlah as never)
    case 'baja_base_plate': return analisaBasePlate(dgnJumlah as never)
    case 'baja_angkur': return analisaAngkur(dgnJumlah as never)
    case 'baja_sambungan_baut': return analisaSambunganBaut(dgnJumlah as never)
    case 'baja_sambungan_las': return analisaSambunganLas(dgnJumlah as never)
    case 'baja_interaksi': return analisaInteraksiTekanMomen(dgnJumlah as never)
  }
}

/**
 * Jenis yang memang TIDAK menghasilkan volume material.
 *
 * Dinyatakan sebagai daftar, bukan disimpulkan dari `volume === undefined`:
 * modul yang LUPA memulangkan volume akan terlihat sama dengan yang memang
 * tak punya, dan bedanya besar — yang pertama cacat, yang kedua benar.
 *
 * Sambungan menghitung KAPASITAS (apakah sambungannya kuat), bukan KUANTITAS.
 * Baut dan las-nya sendiri tetap perlu dianggarkan, tetapi lewat AHSP
 * `2.3.1.2` (angkur) dan `2.3.1.3` (mur & baut) yang dihitung per kilogram —
 * bukan dari geometri sambungan.
 */
const TANPA_VOLUME: ReadonlySet<string> = new Set([
  'baja_sambungan_baut', 'baja_sambungan_las', 'baja_angkur', 'baja_interaksi',
])

/** Ambil `volume` dari hasil apa pun bentuknya. */
function volumeDari(h: unknown): VolumeElemen | null {
  const v = (h as { volume?: VolumeElemen; dasar?: { volume?: VolumeElemen } })
  return v.volume ?? v.dasar?.volume ?? null
}

/** Ambil daftar `periksa` dari hasil apa pun bentuknya. */
function periksaDari(h: unknown): unknown[] {
  const v = h as { periksa?: unknown[] }
  return Array.isArray(v.periksa) ? v.periksa : []
}

export default async function strukturRoutes(app: FastifyInstance) {
  // ── GET /projects/:projectId/struktur — daftar elemen ─────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/struktur',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      if (!(await proyekMilikTenant(request, request.params.projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('struktur_elemen')
        // Satu literal utuh — JANGAN dipecah dengan `+`. Tipe Supabase mengurai
        // daftar kolom dari string literalnya; begitu dirangkai, hasilnya jatuh
        // ke `GenericStringError` dan seluruh akses medan di bawah kehilangan tipe.
        .select('id, kode, nama, jenis, jumlah, input, aman, basi, beton_m3, bekisting_m2, besi_kg, dihitung_pada, catatan, created_at')
        .eq('project_id', request.params.projectId)
        .order('kode', { ascending: true })
        .limit(500)
      if (error) return reply.status(500).send({ error: error.message })

      const baris = data ?? []
      /*
        Rekap dihitung dari kolom RINGKASAN, bukan dengan menjalankan ulang
        analisa tiap elemen. Daftar 200 elemen berarti 200 diagram P-M kalau
        dihitung ulang — dan halaman daftar tak butuh ketelitian itu.

        Elemen `basi` DIKECUALIKAN dari rekap: menjumlahkan ringkasan yang
        tak lagi sesuai inputnya menghasilkan total yang salah tanpa gejala.
      */
      const segar = baris.filter((b) => !b.basi)
      const rekap = {
        jumlahElemen: baris.length,
        jumlahBasi: baris.length - segar.length,
        jumlahTidakAman: baris.filter((b) => b.aman === false).length,
        jumlahBelumDihitung: baris.filter((b) => b.aman == null).length,
        betonM3: segar.reduce((s, b) => s + Number(b.beton_m3 ?? 0), 0),
        bekistingM2: segar.reduce((s, b) => s + Number(b.bekisting_m2 ?? 0), 0),
        besiKg: segar.reduce((s, b) => s + Number(b.besi_kg ?? 0), 0),
      }

      return reply.send({ data: baris, rekap })
    })

  // ── POST /projects/:projectId/struktur — buat elemen ──────────────────────
  app.post<{
    Params: { projectId: string }
    Body: { kode?: string; nama?: string; jenis?: string; jumlah?: number; input?: Record<string, unknown>; catatan?: string }
  }>(
    '/api/v1/projects/:projectId/struktur',
    { preHandler: [authenticate, requirePermission('cecep:struktur:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const kode = request.body?.kode?.trim()
      const jenis = request.body?.jenis as Jenis | undefined
      const input = request.body?.input
      if (!kode) return reply.status(400).send({ error: 'kode wajib diisi' })
      if (!jenis || !JENIS.includes(jenis)) {
        return reply.status(400).send({ error: `jenis harus salah satu dari: ${JENIS.join(', ')}` })
      }
      if (!input || typeof input !== 'object') {
        return reply.status(400).send({ error: 'input wajib berupa objek' })
      }
      const jumlah = request.body?.jumlah ?? 1
      if (!Number.isInteger(jumlah) || jumlah < 1) {
        return reply.status(400).send({ error: 'jumlah harus bilangan bulat ≥ 1' })
      }

      /*
        Input DIUJI HITUNG sebelum disimpan.

        Menyimpan input yang tak bisa dihitung berarti menaruh baris rusak di
        basis: daftar menampilkannya, orang mengkliknya, lalu halaman galat.
        Lebih murah menolaknya di sini dengan pesan yang menyebut medannya.
      */
      try {
        hitung(jenis, input, jumlah)
      } catch (e) {
        return reply.status(400).send({
          error: `Input tak bisa dihitung: ${(e as Error).message}`,
        })
      }

      const { data: proyek } = await request.db!
        .from('projects').select('company_id').eq('id', projectId).maybeSingle()
      if (!proyek) return reply.status(404).send({ error: 'Proyek tidak ditemukan' })

      const { data: row, error } = await supabase
        .from('struktur_elemen')
        .insert({
          company_id: proyek.company_id,
          project_id: projectId,
          kode, nama: request.body?.nama?.trim() ?? null,
          jenis, jumlah, input,
          catatan: request.body?.catatan?.trim() ?? null,
          created_by: request.currentUser!.id,
          updated_by: request.currentUser!.id,
        })
        .select('id').single()

      if (error) {
        // Kode ganda punya pesan sendiri — "duplicate key" tak berarti apa pun
        // bagi estimator yang cuma memakai nama yang sudah dipakai.
        if (/struktur_elemen_kode_unik/.test(error.message)) {
          return reply.status(409).send({ error: `Kode "${kode}" sudah dipakai di proyek ini` })
        }
        return reply.status(500).send({ error: error.message })
      }

      void logAuditEvent(request, {
        tableName: 'struktur_elemen', recordId: row.id,
        action: 'struktur.elemen_created', actorId: request.currentUser!.id,
        newValues: { kode, jenis, jumlah, project_id: projectId },
      })

      return reply.status(201).send({ id: row.id })
    })

  // ── PATCH /struktur/:id — ubah input ──────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: { kode?: string; nama?: string; jumlah?: number; input?: Record<string, unknown>; catatan?: string }
  }>(
    '/api/v1/struktur/:id',
    { preHandler: [authenticate, requirePermission('cecep:struktur:manage')] },
    async (request, reply) => {
      const el = await ambilElemen(request, request.params.id)
      if (!el) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      const input = request.body?.input ?? el.input
      const jumlah = request.body?.jumlah ?? el.jumlah
      if (!Number.isInteger(jumlah) || jumlah < 1) {
        return reply.status(400).send({ error: 'jumlah harus bilangan bulat ≥ 1' })
      }

      try {
        hitung(el.jenis, input, jumlah)
      } catch (e) {
        return reply.status(400).send({
          error: `Input tak bisa dihitung: ${(e as Error).message}`,
        })
      }

      const ubah: Record<string, unknown> = { updated_by: request.currentUser!.id }
      if (request.body?.kode !== undefined) ubah.kode = request.body.kode.trim()
      if (request.body?.nama !== undefined) ubah.nama = request.body.nama?.trim() ?? null
      if (request.body?.catatan !== undefined) ubah.catatan = request.body.catatan?.trim() ?? null
      if (request.body?.input !== undefined) ubah.input = input
      if (request.body?.jumlah !== undefined) ubah.jumlah = jumlah

      /*
        `.select('id')` bukan hiasan: `{ error }` saja tak bisa membedakan
        "satu baris berubah" dari "tak ada baris yang cocok". Elemen yang
        terhapus sesaat sebelumnya akan menghasilkan 200 "tersimpan" tanpa
        satu pun baris berubah.
      */
      const { data: terubah, error } = await supabase
        .from('struktur_elemen').update(ubah).eq('id', request.params.id).select('id')
      if (error) {
        if (/struktur_elemen_kode_unik/.test(error.message)) {
          return reply.status(409).send({ error: 'Kode sudah dipakai di proyek ini' })
        }
        return reply.status(500).send({ error: error.message })
      }
      if (!terubah?.length) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      void logAuditEvent(request, {
        tableName: 'struktur_elemen', recordId: request.params.id,
        action: 'struktur.elemen_updated', actorId: request.currentUser!.id,
        oldValues: { input: el.input, jumlah: el.jumlah }, newValues: ubah,
      })

      return reply.send({ success: true })
    })

  // ── DELETE /struktur/:id ──────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/struktur/:id',
    { preHandler: [authenticate, requirePermission('cecep:struktur:manage')] },
    async (request, reply) => {
      const el = await ambilElemen(request, request.params.id)
      if (!el) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      const { error, count } = await supabase
        .from('struktur_elemen').delete({ count: 'exact' }).eq('id', request.params.id)
      if (error) return reply.status(500).send({ error: error.message })
      if (!count) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      void logAuditEvent(request, {
        tableName: 'struktur_elemen', recordId: request.params.id,
        action: 'struktur.elemen_deleted', actorId: request.currentUser!.id,
        oldValues: { kode: el.kode, jenis: el.jenis },
      })

      return reply.send({ success: true })
    })

  // ── GET /struktur/:id — hasil analisa LENGKAP ─────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { gambar?: string } }>(
    '/api/v1/struktur/:id',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      const el = await ambilElemen(request, request.params.id)
      if (!el) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      let hasil: unknown
      try {
        hasil = hitung(el.jenis, el.input, el.jumlah)
      } catch (e) {
        // Elemen tersimpan yang tak bisa dihitung — mungkin rumusnya berubah
        // sesudah elemen dibuat. Dilaporkan apa adanya, bukan 500.
        return reply.status(422).send({
          error: `Elemen tak bisa dihitung: ${(e as Error).message}`,
          elemen: { id: el.id, kode: el.kode, jenis: el.jenis },
        })
      }

      const badan: Record<string, unknown> = { elemen: el, hasil }

      /*
        ══════════════════════════════════════════════════════════════════════
        LAPISAN AWAM — untuk yang memutuskan tapi tidak mengerti teknik

        Yang memutuskan membangun sering BUKAN insinyur: pemilik proyek,
        klien, manajer. Bagi mereka "φMn = 0.9 · As · fy · (d − a/2)" tak bisa
        ditindak — dan yang tak bisa ditindak akan diterima begitu saja,
        TERMASUK saat ia merah.

        Dikirim BERSAMA hasil teknisnya, bukan menggantikannya: insinyur tetap
        butuh angka dan rumusnya untuk memeriksa ulang. Keduanya turunan dari
        verdict yang SAMA, jadi tak bisa berselisih.
      */
      const daftarPeriksa = periksaDari(hasil) as Array<{
        nama: string; aman: boolean; rasio: number
      }>
      badan.awam = {
        ringkasan: ringkasanAwam(daftarPeriksa),
        pemeriksaan: daftarPeriksa.map((pp) => ({
          nama: pp.nama,
          tingkat: tingkatBahaya(pp.rasio, pp.aman),
          persenTerpakai: Math.round(pp.rasio * 100),
          penjelasan: jelaskan(pp.nama),
        })),
      }

      // Gambar HANYA bila diminta — SVG penampang + diagram P-M menambah
      // beberapa KB, dan halaman daftar tak membutuhkannya.
      if (request.query.gambar === '1') {
        badan.gambar = gambarUntuk(el, hasil)

        /*
          METERAN dibuat DI SINI, bukan di `gambarUntuk`.

          `gambarUntuk` menggambar BENDANYA (penampang, potongan, denah);
          meteran menggambar VERDICT-nya. Dua hal berbeda, dan memisahkannya
          membuat jelas bahwa meteran berlaku untuk SEMUA jenis elemen —
          sementara gambar benda selalu khas per jenis.
        */
        if (daftarPeriksa.length > 0) {
          try {
            (badan.gambar as Record<string, string>).meteran = gambarMeteranKekuatan(
              daftarPeriksa.map((pp) => ({
                judul: jelaskan(pp.nama)?.judul ?? pp.nama,
                rasio: pp.rasio,
                aman: pp.aman,
                biner: apakahBiner(pp.nama),
              })),
              { judul: `Seberapa terpakai kekuatannya — ${el.kode}` },
            )
          } catch {
            (badan.gambar as Record<string, string>).meteranGagal =
              'Meteran kekuatan tak dapat digambar'
          }
        }
      }

      return reply.send(badan)
    })

  // ── POST /struktur/:id/hitung — simpan ringkasan hasil ────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/struktur/:id/hitung',
    { preHandler: [authenticate, requirePermission('cecep:struktur:manage')] },
    async (request, reply) => {
      const el = await ambilElemen(request, request.params.id)
      if (!el) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      let hasil: unknown
      try {
        hasil = hitung(el.jenis, el.input, el.jumlah)
      } catch (e) {
        return reply.status(422).send({ error: `Tak bisa dihitung: ${(e as Error).message}` })
      }

      const v = volumeDari(hasil)
      const aman = (hasil as { aman?: boolean }).aman ?? null

      const { data: terubah, error } = await supabase
        .from('struktur_elemen')
        .update({
          aman,
          beton_m3: v?.betonM3 ?? null,
          bekisting_m2: v?.bekistingM2 ?? null,
          besi_kg: v?.besiTotalKg ?? null,
          hasil_ringkas: { periksa: periksaDari(hasil), catatan: (hasil as { catatan?: string[] }).catatan ?? [] },
          dihitung_pada: new Date().toISOString(),
          updated_by: request.currentUser!.id,
        })
        .eq('id', request.params.id)
        .select('id')
      if (error) return reply.status(500).send({ error: error.message })
      // Nol baris = elemen lenyap di antara pembacaan dan penulisan. Membalas
      // 200 di sini berarti melaporkan angka yang tak tersimpan di mana pun.
      if (!terubah?.length) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      return reply.send({
        success: true, aman,
        volume: v ? { betonM3: v.betonM3, bekistingM2: v.bekistingM2, besiKg: v.besiTotalKg } : null,
      })
    })

  // ── POST /projects/:projectId/struktur/hitung-semua ───────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/struktur/hitung-semua',
    { preHandler: [authenticate, requirePermission('cecep:struktur:manage')] },
    async (request, reply) => {
      if (!(await proyekMilikTenant(request, request.params.projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('struktur_elemen')
        .select('id, kode, jenis, jumlah, input')
        .eq('project_id', request.params.projectId)
        .limit(500)
      if (error) return reply.status(500).send({ error: error.message })

      const berhasil: string[] = []
      /*
        Elemen yang GAGAL dihitung dilaporkan beserta ALASANNYA, bukan
        dilewati diam-diam. "Berhasil 18 dari 20" tanpa menyebut yang dua
        adalah laporan yang menyesatkan — orang menyangka semuanya beres.
      */
      const gagal: { kode: string; alasan: string }[] = []

      for (const el of data ?? []) {
        try {
          const h = hitung(el.jenis as Jenis, el.input as Record<string, unknown>, el.jumlah)
          const v = volumeDari(h)
          /*
            Hasil update DIPERIKSA. Tanpa ini, elemen yang perhitungannya
            berhasil tetapi penyimpanannya gagal akan masuk daftar `berhasil` —
            lalu tetap bertanda `basi` di layar tanpa satu pun pesan galat.
            Kegagalan menyimpan adalah kegagalan elemen, jadi ia masuk `gagal`.
          */
          const { data: tersimpan, error: eSimpan } = await supabase.from('struktur_elemen').update({
            aman: (h as { aman?: boolean }).aman ?? null,
            beton_m3: v?.betonM3 ?? null,
            bekisting_m2: v?.bekistingM2 ?? null,
            besi_kg: v?.besiTotalKg ?? null,
            hasil_ringkas: { periksa: periksaDari(h), catatan: (h as { catatan?: string[] }).catatan ?? [] },
            dihitung_pada: new Date().toISOString(),
            updated_by: request.currentUser!.id,
          }).eq('id', el.id).select('id')
          if (eSimpan) {
            gagal.push({ kode: el.kode, alasan: `Gagal menyimpan hasil: ${eSimpan.message}` })
            continue
          }
          if (!tersimpan?.length) {
            gagal.push({ kode: el.kode, alasan: 'Elemen lenyap saat hasil disimpan' })
            continue
          }
          berhasil.push(el.kode)
        } catch (e) {
          gagal.push({ kode: el.kode, alasan: (e as Error).message })
        }
      }

      return reply.send({ berhasil: berhasil.length, gagal })
    })

  // ── GET /projects/:projectId/struktur/rekap-volume ────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/struktur/rekap-volume',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      if (!(await proyekMilikTenant(request, request.params.projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data, error } = await supabase
        .from('struktur_elemen')
        .select('kode, jenis, jumlah, input')
        .eq('project_id', request.params.projectId)
        .limit(500)
      if (error) return reply.status(500).send({ error: error.message })

      /*
        Rekap DIHITUNG ULANG dari input, bukan dari kolom ringkasan.

        Bedanya dengan daftar: di sini yang diminta adalah rekap besi PER
        DIAMETER — dan itu tak tersimpan di kolom mana pun (hanya totalnya).
        Menghitung ulang juga membuat rekap ini kebal terhadap ringkasan basi.
      */
      const hasil: { volume: VolumeElemen }[] = []
      const gagal: { kode: string; alasan: string }[] = []
      /*
        CATATAN IKUT NAIK KE SINI — dan itu bukan kelengkapan kosmetik.

        Volume besi Fase 1 TIDAK menghitung panjang penyaluran, kait, dan
        sambungan lewatan. Diukur pada balok 300×520 L=6m: BBS memberi 1,26×
        (terpasang) sampai 1,41× (dibeli) dari angka ini.

        Endpoint inilah yang dipakai RAP. Mengirim angka yang 26% kurang tanpa
        satu kalimat pun keterangan adalah cara paling rapi membuat orang
        salah — angkanya terlihat wajar, tak ada galat, dan selisihnya baru
        ketahuan saat besi di lapangan kurang.

        Dikumpulkan sebagai himpunan: catatan yang sama dari 40 balok cukup
        muncul sekali.
      */
      const catatan = new Set<string>()

      /*
        Elemen yang memang TAK punya volume dilaporkan TERPISAH, bukan
        dilewati diam-diam.

        Sambungan baut/las/angkur menghitung KAPASITAS, bukan kuantitas — jadi
        tak masuk rekap material, dan itu benar. Tetapi pembaca yang menghitung
        sendiri "10 elemen, kok cuma 6 yang terjumlah?" akan menyimpulkan ada
        yang hilang.

        Menyebutnya membuat perbedaan itu jadi keterangan, bukan kecurigaan.
      */
      const tanpaVolume: { kode: string; jenis: string }[] = []

      for (const el of data ?? []) {
        try {
          const h = hitung(el.jenis as Jenis, el.input as Record<string, unknown>, el.jumlah)
          const v = volumeDari(h)
          if (v) {
            hasil.push({ volume: v })
          } else if (TANPA_VOLUME.has(el.jenis)) {
            tanpaVolume.push({ kode: el.kode, jenis: el.jenis })
          } else {
            /*
              Jenis yang SEHARUSNYA punya volume tetapi tak memulangkannya
              adalah CACAT, bukan keadaan sah — dan ia harus terlihat sebagai
              kegagalan, bukan sebagai baris yang hilang dari total.
            */
            gagal.push({
              kode: el.kode,
              alasan: `Jenis "${el.jenis}" seharusnya menghasilkan volume, `
                + 'tetapi modulnya tak memulangkannya. Ini cacat modul, bukan '
                + 'kesalahan input.',
            })
          }
          for (const c of (h as { catatan?: string[] }).catatan ?? []) catatan.add(c)
        } catch (e) {
          gagal.push({ kode: el.kode, alasan: (e as Error).message })
        }
      }

      const r = rekapVolume(hasil)
      return reply.send({
        rekap: {
          betonM3: r.betonM3,
          bekistingM2: r.bekistingM2,
          besiTotalKg: r.besiTotalKg,
          beratSendiriKg: r.beratSendiriKg,
          besi: r.besi,
        },
        jumlahElemen: hasil.length,
        catatan: [...catatan],
        /*
          Elemen yang memang tak bervolume — disebut supaya selisih antara
          jumlah elemen proyek dan `jumlahElemen` di sini punya penjelasan.
        */
        tanpaVolume,
        gagal,
      })
    })

  // ── GET /projects/:projectId/struktur/usulan-rab ──────────────────────────
  //
  // ══════════════════════════════════════════════════════════════════════════
  // TUJUAN AWAL SELURUH MODUL STRUKTUR
  //
  // Modul ini menghitung volume; basis punya 3.043 assembly AHSP lengkap
  // dengan bahan, upah, dan alat. Yang TIDAK ada di antaranya: apa pun yang
  // menyambungkan — sehingga estimator MENGETIK ULANG angka dari layar
  // analisa ke RAB, dan begitu desainnya berubah RAB tidak ikut berubah.
  //
  // Endpoint ini MENGUSULKAN, tidak MENERAPKAN. Yang memasukkannya ke
  // `estimate_items` adalah manusia lewat tombol — alasannya sama dengan
  // takeoff dimensi: menimpa `quantity` otomatis menggeser nilai kontrak dan
  // progres lapangan yang tak bisa dibuat ulang, tanpa galat dan tanpa
  // keputusan siapa pun.
  //
  // ── Pencocokan assembly dilakukan DI SINI, bukan di modul pure
  //
  // `struktur-ke-rab.ts` memulangkan POLA pencarian, bukan id. Kode assembly
  // berbeda antar edisi AHSP dan antar tenant, jadi id yang dipaku akan rusak
  // diam-diam begitu tenant memakai edisi lain — dan rusaknya berupa item RAB
  // yang menunjuk pekerjaan yang salah, bukan galat.
  // ══════════════════════════════════════════════════════════════════════════
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/struktur/usulan-rab',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      if (!(await proyekMilikTenant(request, request.params.projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const susun = await susunUsulan(request, request.params.projectId, reply)
      if ('kirim' in susun) return susun.kirim

      return reply.send({
        usulan: susun.hasil,
        jumlahUsulan: susun.hasil.length,
        tanpaAssembly: susun.tanpaAssembly,
        gagal: susun.gagal,
        catatan: susun.catatan,
        belumSegar: susun.belumSegar,
      })
    })

  /**
   * Penanda pada `notes` estimate item yang berasal dari analisa struktur.
   *
   * Dipakai dua arah: menandai asalnya supaya bisa ditelusuri, DAN mengenali
   * kiriman sebelumnya supaya tombol yang ditekan dua kali tak menggandakan
   * RAB. Jangan diubah tanpa memindahkan data lama — item yang sudah terkirim
   * dikenali dari awalan ini.
   */
  const PENANDA_ASAL = 'Dari analisa struktur: '

  /*
    ══════════════════════════════════════════════════════════════════════════
    KIRIM USULAN KE VERSI ESTIMASI — ujung jembatan volume→RAB.

    ── Kenapa lewat ESTIMASI, bukan langsung ke `rab_items`

    Menulis langsung ke `rab_items` terlihat lebih pendek dan salah. Yang
    dibutuhkan RAB bukan cuma kuantitas: ia butuh `unit_price` yang benar,
    dan harga itu lahir dari analisa AHSP × price book pada TANGGAL tertentu,
    berikut BUK, pembulatan, dan `hsp_snapshot` yang menjadikan angkanya bisa
    ditelusuri kembali. Semua itu sudah dikerjakan
    `POST /estimate-versions/:id/items`.

    Jalur kedua yang menghitung harga sendiri berarti dua rumus harga di satu
    aplikasi — dan yang kedua tak akan ikut berubah saat yang pertama
    diperbaiki. Sambungan yang benar: struktur → estimasi → `terapkan-ke-rab`
    (yang sudah ada, dan sudah dipakai Komposer).

    ── Yang TIDAK dilakukan di sini

    Usulan tanpa assembly TIDAK dikirim sebagai lumpsum bernilai nol. Item
    berharga nol menumpang di RAB tanpa terlihat kurang — persis kelas cacat
    yang dijaga di seluruh repo ini. Yang tak ketemu dipulangkan sebagai
    `dilewati` supaya estimator memutuskannya sendiri.
    ══════════════════════════════════════════════════════════════════════════
  */
  app.post<{
    Params: { projectId: string }
    Body: {
      estimateVersionId?: string
      priceDate?: string
      /**
       * Lokasi harga — diteruskan apa adanya ke resolver price book.
       *
       * WAJIB diisi bila price book tenant memakai harga berlokasi. Resolver
       * sengaja MENOLAK memakai entri berlokasi saat lokasi tak diminta
       * (`price-resolver.ts`): memakai harga Kabupaten Bandung untuk proyek di
       * kota lain adalah kesalahan yang tak meninggalkan jejak apa pun.
       *
       * Diukur di dev: AHSP pembesian `CIB-STD-13#6` memakai resource
       * berlokasi, jadi tanpa lokasi ia gagal ter-resolve — sementara AHSP
       * beton (resource-nya berlokasi NULL) berhasil. Empat dari sembilan
       * usulan terlewat karena ini, dan sebabnya hanya terlihat karena
       * kegagalannya dilaporkan per baris.
       */
      location?: string | null
      bukFraction?: number
      rounding?: { mode: 'down' | 'up' | 'nearest' | 'none'; step: number }
      /** Izinkan baris kedua untuk elemen yang sudah pernah dikirim. */
      izinkanGanda?: boolean
    }
  }>(
    '/api/v1/projects/:projectId/struktur/kirim-ke-estimasi',
    { preHandler: [authenticate, requirePermission('cecep:estimate:manage')] },
    async (request, reply) => {
      const { projectId } = request.params
      if (!(await proyekMilikTenant(request, projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const b = request.body ?? {}
      if (!b.estimateVersionId) {
        return reply.status(400).send({ error: 'estimateVersionId wajib' })
      }

      /*
        Versi WAJIB milik proyek yang sama.

        Tanpa pemeriksaan ini, volume proyek A bisa masuk ke estimasi proyek B
        milik tenant yang sama — lolos gerbang tenant, tetap salah, dan
        salahnya baru ketahuan saat penawaran sudah dikirim.
      */
      const { data: versi, error: eVersi } = await request.db!
        .unsafe(
          'estimate_versions',
          'Dibaca justru UNTUK memeriksa kepemilikannya: project_id versi '
          + 'dibandingkan dengan projectId yang sudah lolos proyekMilikTenant '
          + 'beberapa baris di atas, dan permintaan ditolak bila berbeda. '
          + 'Menyaringnya lebih dulu lewat viaProject membuat versi milik '
          + 'proyek lain memulangkan "tidak ditemukan" — pesan yang salah '
          + 'untuk keadaan yang sebenarnya terjadi.',
        )
        .select('id, status, scenario:scenarios!inner(project_id)')
        .eq('id', b.estimateVersionId)
        .maybeSingle()
      if (eVersi) return reply.status(500).send({ error: eVersi.message })
      if (!versi) return reply.status(404).send({ error: 'Versi estimasi tidak ditemukan' })

      const sc = versi.scenario as { project_id: string } | { project_id: string }[] | undefined
      const pidVersi = (Array.isArray(sc) ? sc[0] : sc)?.project_id
      if (pidVersi !== projectId) {
        return reply.status(400).send({
          error: 'Versi estimasi itu milik proyek lain — volume struktur hanya '
            + 'boleh dikirim ke estimasi proyek yang sama.',
        })
      }
      if (versi.status !== 'draft') {
        return reply.status(409).send({
          error: `Versi estimasi berstatus ${versi.status} — item hanya bisa `
            + 'ditambah saat draft.',
        })
      }

      /*
        Usulannya dihitung ULANG di sini, tidak diterima dari badan permintaan.

        Kuantitas yang dikirim klien bisa sudah basi (elemennya diubah sesudah
        layar dimuat) atau dikarang. Yang masuk estimasi harus turunan dari
        input struktur yang tersimpan — itu justru seluruh alasan modul ini
        dibangun.
      */
      const asal = await susunUsulan(request, projectId, reply)
      if ('kirim' in asal) return asal.kirim
      const { hasil, catatan } = asal

      /*
        ══════════════════════════════════════════════════════════════════════
        KIRIMAN GANDA DITAHAN — ditemukan dengan menjalankan dua kali.

        Uji pertama menghasilkan 14 baris estimasi dari 9 usulan: sembilan
        dari jalan kedua menumpuk di atas lima yang sudah masuk. Tak ada galat,
        dan di layar Estimasi hasilnya terlihat seperti RAB yang memang punya
        dua baris beton — nilainya jadi dua kali lipat tanpa sebab yang
        terlihat.

        Tombolnya sendiri gampang ditekan dua kali (jaringan lambat, halaman
        di-refresh), jadi menahannya di sini bukan kemewahan.

        Yang ditahan: usulan yang SUDAH punya item dengan assembly yang sama
        DAN penanda asal yang sama. Item yang dibuat manual dengan assembly
        yang sama TIDAK menghalangi — itu keputusan estimator, bukan duplikat.

        Bisa dilewati dengan `izinkanGanda: true` untuk hal yang sah: desain
        berubah, volumenya beda, dan estimator memang mau baris kedua.
        ══════════════════════════════════════════════════════════════════════
      */
      const { data: sudahAda, error: eAda } = await request.db!
        .unsafe(
          'estimate_items',
          'Disaring dengan estimate_version_id yang kepemilikannya SUDAH '
          + 'diverifikasi tepat di atas (pidVersi === projectId). Kategori C '
          + 'lewat estimate_version_id → scenarios.project_id; viaProject tak '
          + 'menjangkau rantai dua tingkat itu.',
        )
        .select('assembly_id, notes')
        .eq('estimate_version_id', b.estimateVersionId)
      if (eAda) return reply.status(500).send({ error: eAda.message })

      const terkirim = new Set(
        (sudahAda ?? [])
          .filter((r) => typeof r.notes === 'string' && r.notes.startsWith(PENANDA_ASAL))
          .map((r) => `${r.assembly_id}|${(r.notes as string).slice(PENANDA_ASAL.length)}`),
      )

      const masuk: Array<{ uraian: string; kuantitas: number; satuan: string; assembly: string }> = []
      const dilewati: Array<{ uraian: string; alasan: string }> = []

      for (const u of hasil) {
        if (!u.assembly) {
          dilewati.push({
            uraian: u.uraian,
            alasan: 'Tak ada AHSP yang cocok — tambahkan analisanya lebih dulu, '
              + 'atau masukkan manual sebagai lumpsum.',
          })
          continue
        }

        const kunci = `${u.assembly.id}|${u.asal.map((a) => a.kodeElemen).join(', ')}`
        if (!b.izinkanGanda && terkirim.has(kunci)) {
          dilewati.push({
            uraian: u.uraian,
            alasan: 'Sudah pernah dikirim ke versi estimasi ini dari elemen yang '
              + 'sama. Kirim ulang dengan izinkanGanda:true bila memang ingin '
              + 'baris kedua.',
          })
          continue
        }

        /*
          Dipanggil lewat HTTP ke rutenya sendiri, bukan dengan menyalin
          logikanya. `app.inject` menjalankan preHandler yang sama (auth,
          izin, gerbang tenant) dan perhitungan harga yang sama — jadi tak ada
          jalur kedua yang bisa menyimpang saat yang pertama diperbaiki.
        */
        const r = await app.inject({
          method: 'POST',
          url: `/api/v1/estimate-versions/${b.estimateVersionId}/items`,
          headers: {
            cookie: request.headers.cookie ?? '',
            authorization: request.headers.authorization ?? '',
          },
          payload: {
            item_type: 'assembly',
            assembly_id: u.assembly.id,
            quantity: u.kuantitas,
            price_date: b.priceDate,
            location: b.location ?? null,
            buk_fraction: b.bukFraction ?? 0,
            rounding: b.rounding ?? { mode: 'none', step: 0 },
            notes: `${PENANDA_ASAL}${u.asal.map((a) => a.kodeElemen).join(', ')}`,
          },
        })

        if (r.statusCode !== 201) {
          /*
            Kegagalan per baris DILAPORKAN, bukan menggagalkan seluruhnya.
            Sebagian masuk lebih berguna daripada nol masuk — asalkan yang
            tidak masuk terlihat jelas.
          */
          let alasan = `HTTP ${r.statusCode}`
          try {
            alasan = (JSON.parse(r.body) as { error?: string }).error ?? alasan
          } catch (eParse) {
            /*
              Badan bukan JSON. Kode statusnya sudah cukup untuk PENGGUNA, tapi
              galatnya tetap dicatat: rute yang membalas non-JSON pada
              kegagalan adalah cacat tersendiri, dan menelannya di sini membuat
              cacat itu tak pernah terlihat siapa pun.
            */
            app.log.warn(
              { err: eParse, statusCode: r.statusCode, body: r.body.slice(0, 200) },
              'Balasan non-JSON dari penambahan item estimasi',
            )
          }

          /*
            Kegagalan harga tanpa lokasi punya SEBAB yang bisa disebutkan, dan
            menyebutkannya menghemat penelusuran panjang. Pesan asli hanya
            berbunyi "Harga tidak ter-resolve dari price book" — benar, tapi
            tak memberi tahu bahwa yang kurang adalah LOKASI, bukan harganya.
          */
          if (!b.location && /tidak ter-resolve/i.test(alasan)) {
            alasan += '. Price book tenant ini memuat harga BERLOKASI, dan '
              + 'resolver sengaja tak memakainya saat lokasi tak diminta. '
              + 'Isi lokasi proyek lalu kirim ulang.'
          }
          dilewati.push({ uraian: u.uraian, alasan })
          continue
        }

        masuk.push({
          uraian: u.uraian,
          kuantitas: u.kuantitas,
          satuan: u.satuan,
          assembly: u.assembly.code,
        })
      }

      return reply.send({
        masuk,
        dilewati,
        jumlahMasuk: masuk.length,
        jumlahDilewati: dilewati.length,
        catatan,
        /*
          Langkah berikutnya DISEBUTKAN. Item yang masuk estimasi belum
          terlihat di RAB sampai "Terapkan ke Proyek" dijalankan — dan tanpa
          kalimat ini estimator menyimpulkan pengirimannya gagal.
        */
        langkahBerikut: 'Item sudah masuk versi estimasi. Jalankan "Terapkan ke '
          + 'Proyek" di layar Estimasi supaya angkanya muncul di RAB, Kurva S, dan EVM.',
      })
    })
}

/** Ambil satu elemen dengan gerbang tenant. */
async function ambilElemen(request: FastifyRequest, id: string): Promise<BarisElemen | null> {
  const { data } = await supabase
    .from('struktur_elemen')
    .select('id, kode, nama, jenis, jumlah, input, aman, basi, project_id')
    .eq('id', id).maybeSingle()
  if (!data) return null

  /*
    Gerbang tenant lewat PROYEKNYA, bukan `company_id` baris.

    `supabase` di sini adalah klien service-role yang MELEWATI RLS — itu
    disengaja (rute perlu membaca sebelum tahu pemiliknya), tetapi berarti
    pemeriksaan tenant harus eksplisit. Tanpa baris ini, siapa pun yang tahu
    UUID elemen bisa membacanya lintas tenant.
  */
  if (!(await proyekMilikTenant(request, data.project_id))) return null
  return data as unknown as BarisElemen
}

/** Susun SVG yang relevan untuk jenis elemen ini. */
function gambarUntuk(el: BarisElemen, hasil: unknown): Record<string, string> {
  const g: Record<string, string> = {}
  const i = el.input as Record<string, number | number[]>

  // Penampang: hanya untuk elemen yang punya b × h persegi.
  if (el.jenis === 'balok' || el.jenis === 'kolom') {
    try {
      g.penampang = gambarPenampang({
        bMm: Number(i.bMm), hMm: Number(i.hMm),
        selimutMm: Number(i.selimutMm), dSengkangMm: Number(i.dSengkangMm),
        dUtamaMm: Number(i.dUtamaMm),
        /*
          Jumlah batang di gambar HARUS sama dengan yang ditimbang di volume.

          Versi pertama menggambar `nTarik >= 2 ? 2 : 0` batang atas — angka
          karangan yang tak muncul di perhitungan mana pun. Gambar kerja
          dipakai estimator untuk memesan besi; batang yang tergambar tapi tak
          terhitung (atau sebaliknya) adalah selisih yang baru ketahuan di
          lapangan. `nTekan` sekarang medan sungguhan di InputBalok, dengan
          default yang sama (2) di kedua tempat.
        */
        tulanganBawah: el.jenis === 'balok'
          ? [Number(i.nTarik)]
          : [Number(i.nBarisX)],
        tulanganAtas: el.jenis === 'balok'
          ? [Number(i.nTekan ?? 2)]
          : [Number(i.nBarisX)],
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      // Gambar gagal bukan alasan seluruh permintaan gagal — hasil analisa
      // tetap berguna tanpa SVG. Ditandai supaya diamnya tak terbaca sebagai
      // "elemen ini memang tak punya penampang".
      g.penampangGagal = 'Penampang tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    EMPAT JENIS YANG SEBELUMNYA TAK PUNYA GAMBAR SAMA SEKALI.

    Diukur lewat API hidup: dari 7 jenis, hanya balok & kolom persegi yang
    menghasilkan SVG. Kolom bulat cuma punya diagram P-M — kurva kapasitas
    tanpa pernah memperlihatkan susunan tulangan yang menghasilkannya —
    sementara pelat, footplat, dan pilecap kosong.

    Pelat justru elemen bertonase besi TERBESAR (1.746 kg pada contoh 200 m²,
    dua puluh kali balok tunggal). Estimator memesan besi terbanyak untuk
    elemen yang tak bisa ia lihat gambarnya.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'kolom_bulat') {
    try {
      g.penampang = gambarPenampangLingkaran({
        diameterMm: Number(i.diameterMm), selimutMm: Number(i.selimutMm),
        dPengekangMm: Number(i.dPengekangMm), dUtamaMm: Number(i.dUtamaMm),
        nTulangan: Number(i.nTulangan),
        pengekang: (el.input.pengekang === 'spiral' ? 'spiral' : 'sengkang'),
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.penampangGagal = 'Penampang tak dapat digambar dari input ini'
    }
  }

  if (el.jenis === 'plat') {
    try {
      g.potongan = gambarPotonganPelat({
        // Bentang yang digambar = sisi PENDEK, yaitu yang menentukan momen.
        bentangM: Math.min(Number(i.lxM), Number(i.lyM)),
        tebalM: Number(i.hM), dTulanganMm: Number(i.dTulanganMm),
        jarakTulanganMm: Number(i.jarakTulanganMm), selimutMm: Number(i.selimutMm),
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.potonganGagal = 'Potongan pelat tak dapat digambar dari input ini'
    }
  }

  if (el.jenis === 'footplat' || el.jenis === 'pilecap') {
    try {
      /*
        Pilecap: posisi tiang diambil dari hasil `analisaPilecap`, BUKAN
        dihitung ulang di sini. Menghitungnya dua kali berarti gambar dan
        beban-per-tiang bisa berselisih diam-diam saat rumusnya diperbaiki —
        dan yang tergambar salah posisi adalah yang dipakai orang di lapangan.
      */
      const tg = (hasil as { tiang?: { xM: number; yM: number }[] }).tiang
      const lx = el.jenis === 'pilecap'
        ? (Number(i.nx) - 1) * Number(i.dxM) + 2 * Number(i.axM)
        : Number(i.lxM)
      const ly = el.jenis === 'pilecap'
        ? (Number(i.ny) - 1) * Number(i.dyM) + 2 * Number(i.ayM)
        : Number(i.lyM)

      g.pondasi = gambarPondasi({
        lxM: lx, lyM: ly, hM: Number(i.hM),
        bxM: Number(i.bxM), byM: Number(i.byM),
        dTulanganMm: Number(i.dTulanganMm), jarakTulanganMm: Number(i.jarakTulanganMm),
        ...(el.jenis === 'pilecap' && tg?.length
          ? { tiang: tg.map((t) => ({ xM: t.xM, yM: t.yM })), diameterTiangM: Number(i.diameterTiangM) }
          : {}),
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.pondasiGagal = 'Gambar pondasi tak dapat dibuat dari input ini'
    }
  }

  if (el.jenis === 'tiang') {
    try {
      /*
        Tiang adalah satu-satunya elemen yang kapasitasnya ditentukan oleh
        sesuatu DI LUAR dirinya — lapisan tanah yang ditembusnya. Gambar tanpa
        profil tanah menyembunyikan justru variabel yang menentukan, dan
        membuat dua tiang berdimensi identik dengan kapasitas berbeda tiga
        kali lipat terlihat sama persis.

        `pIjinKn` dan `penentu` diambil dari HASIL, bukan dihitung ulang:
        "P ijin 300 kN" tanpa menyebut apa yang membatasinya tak bisa
        ditindak — kalau bahan yang membatasi, memperpanjang tiang tak
        menolong; kalau tanah, justru itu satu-satunya yang menolong.
      */
      const h = hasil as { pIjinKn?: number; penentu?: string }
      g.potongan = gambarTiang({
        diameterM: Number(i.diameterM), panjangM: Number(i.panjangM),
        lapisan: (el.input.lapisan as { tebalM: number; nSpt?: number; qcKgCm2?: number }[]) ?? [],
        pIjinKn: h.pIjinKn, penentu: h.penentu,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.potonganGagal = 'Potongan tiang tak dapat digambar dari input ini'
    }
  }

  // Diagram P-M: hanya kolom, dan hanya bila kurvanya benar-benar ada.
  const d = (hasil as { diagram?: { titik?: { phiMnKnm: number; phiPnKn: number }[] } }).diagram
  if (d?.titik?.length) {
    try {
      g.diagramPM = gambarDiagramPM({
        kurva: d.titik,
        beban: [{
          muKnm: Number(i.muKnm ?? 0), puKn: Number(i.puKn ?? 0),
          label: el.kode,
        }],
        judul: `Diagram P-M ${el.kode}`,
      })
    } catch {
      g.diagramPMGagal = 'Diagram P-M tak dapat digambar dari kurva ini'
    }
  }

  return g
}

/**
 * Susun usulan item RAB dari seluruh elemen struktur satu proyek.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * DIPAKAI DUA RUTE — dan itu justru alasannya diekstrak.
 *
 *   GET  …/usulan-rab           → menampilkan usulannya
 *   POST …/kirim-ke-estimasi    → mengirimkannya
 *
 * Kalau keduanya menyusun sendiri-sendiri, yang DITAMPILKAN dan yang DIKIRIM
 * bisa berbeda tanpa ada satu pun galat — dan estimator menyetujui angka di
 * layar sementara angka lain yang masuk. Satu penyusun berarti selisih itu
 * mustahil.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Memulangkan `{ kirim }` bila ada galat basis: pemanggilnya meneruskan balasan
 * itu apa adanya, tanpa perlu tahu galat apa yang terjadi.
 */
async function susunUsulan(
  request: FastifyRequest,
  projectId: string,
  reply: FastifyReply,
): Promise<
  | { kirim: unknown }
  | {
      hasil: Array<UsulanGabungan & {
        assembly: { id: string; code: string; name: string; unit: string } | null
      }>
      tanpaAssembly: { uraian: string; satuan: string; pola: string[] }[]
      gagal: { kode: string; alasan: string }[]
      catatan: string[]
      /**
       * Elemen yang ringkasannya tak lagi berlaku (`basi`) atau belum pernah
       * dihitung (`aman == null`) — tetapi volumenya TETAP ikut di sini.
       *
       * Usulan ini dihitung ULANG dari input, jadi angkanya benar menurut
       * desain terkini. Daftar elemen di layar yang sama MENGECUALIKANNYA.
       * Dua angka berbeda di satu layar tanpa keterangan membuat pembaca
       * menyimpulkan salah satunya salah hitung — kelas cacat yang sudah
       * ditemukan sekali di kartu rekap besi halaman ini.
       */
      belumSegar: number
    }
> {
    const { data, error } = await request.db!
      .from('struktur_elemen')
      .select('kode, jenis, jumlah, input, basi, aman')
      .eq('project_id', projectId)
      .limit(500)
    if (error) return { kirim: reply.status(500).send({ error: error.message }) }

    const mentah = []
    const gagal: { kode: string; alasan: string }[] = []

    for (const el of data ?? []) {
      try {
        const h = hitung(el.jenis as Jenis, el.input as Record<string, unknown>, el.jumlah)
        const v = volumeDari(h)
        if (!v) continue      // sambungan/angkur: kapasitas, bukan kuantitas
        /*
          MUTU BETON diteruskan supaya AHSP-nya cocok mutunya.

          Ada belasan AHSP beton per mutu di basis, dari f'c 7,5 sampai 45
          MPa, dan harganya berbeda jauh. Tanpa ini, balok f'c 25 dihargai
          memakai baris pertama yang cocok — f'c 7,5 MPa — dan RAB-nya
          terlihat wajar karena angkanya memang angka beton.

          Dibaca dari `mutu.fcMpa` (balok/kolom/pelat/pondasi) atau `fcMpa`
          (tiang, yang menyimpannya di akar). Yang tak punya keduanya —
          elemen baja — memulangkan undefined, dan itu benar.
        */
        const inp = el.input as Record<string, unknown>
        const mutu = inp.mutu as { fcMpa?: number } | undefined
        const fcMpa = typeof mutu?.fcMpa === 'number'
          ? mutu.fcMpa
          : typeof inp.fcMpa === 'number' ? inp.fcMpa : undefined

        mentah.push(...usulanDariElemen({
          kode: el.kode,
          jenis: el.jenis,
          volume: v,
          catatan: (h as { catatan?: string[] }).catatan ?? [],
          fcMpa,
        }))
      } catch (e) {
        gagal.push({ kode: el.kode, alasan: (e as Error).message })
      }
    }

    const usulan = gabungUsulan(mentah)

    /*
      ══════════════════════════════════════════════════════════════════════
      DICARI PER-KATA DI BASIS — dua percobaan sebelumnya keduanya salah.

      1. `.or(name.ilike.…)` dengan pola digabung koma. GAGAL TOTAL: pola
         yang mengandung KOMA atau GARIS MIRING memutus sintaks `.or()`
         PostgREST, dan kuerinya memulangkan hasil salah TANPA galat.

      2. Memuat SELURUH assembly lalu cocokkan di memori. Juga gagal, dan
         sebabnya sudah dijaga penjaga di repo ini: **PostgREST memotong
         senyap di 1.000 baris**. Ada 3.043 assembly, jadi dua pertiganya tak
         pernah termuat — dan AHSP pembesian yang dicari ada di sana.
         `data` terisi, `error` null, kodenya jalan terus.

      Sekarang: satu kueri per KATA PERTAMA tiap pola, dengan `ilike` yang
      menyaring di basis. Jumlah kuerinya kecil (pola unik biasanya < 10),
      hasilnya jauh di bawah 1.000, dan pencocokan kata sisanya tetap di
      memori — yang bisa diuji tanpa basis.
      ══════════════════════════════════════════════════════════════════════
    */
    /*
      Kata penyaring diambil dari kata PERTAMA tiap pola, sesudah awalan
      `~` (penanda pola frasa) dilucuti. Tanpa pelucutan itu, penyaringnya
      berbunyi `~f'c` — tak cocok apa pun di basis, dan seluruh baris beton
      jadi "tak ketemu" tanpa galat.
    */
    const kataPertama = [...new Set(
      usulan.flatMap((u) => u.assemblyPola)
        .map((x) => x.replace(/^~/, '').split(/\s+/)[0])
        .filter(Boolean),
    )]

    const daftar: Array<{ id: string; code: string; name: string; output_unit_code: string }> = []
    for (const kata of kataPertama) {
      const { data: sebagian, error: eCari } = await request.db!
        .shared('assemblies')
        .select('id, code, name, output_unit_code')
        .eq('status', 'active')
        .ilike('name', `%${kata}%`)
        .limit(400)
      if (eCari) return { kirim: reply.status(500).send({ error: eCari.message }) }
      /*
        Batas 400 per kata jauh di bawah 1.000 (batas potong senyap
        PostgREST), tetapi tetap bisa tercapai untuk kata yang sangat umum.
        Yang tercapai DILAPORKAN, bukan dilewati — daftar terpotong
        menghasilkan usulan "tak ketemu" yang sebabnya tak terlihat.
      */
      if ((sebagian?.length ?? 0) >= 400) {
        gagal.push({
          kode: `(pencarian AHSP "${kata}")`,
          alasan: `Kata "${kata}" memulangkan 400+ assembly dan hasilnya `
            + 'terpotong — pencocokan bisa melewatkan yang benar. Persempit '
            + 'polanya di lib/struktur-ke-rab.ts.',
        })
      }
      for (const a of sebagian ?? []) {
        if (!daftar.some((x) => x.id === a.id)) daftar.push(a)
      }
    }

    const hasil = usulan.map((u) => {
      /*
        Pola dicoba BERURUTAN dari yang paling spesifik. Yang pertama cocok
        menang — "bekisting untuk balok" harus menang atas "bekisting".

        Satuan WAJIB cocok: assembly bersatuan m3 tak boleh dipasangkan ke
        usulan bersatuan kg, betapa pun namanya mirip. Itu jenis kesalahan
        yang menghasilkan rupiah yang terlihat wajar sambil salah 1.000x.
      */
      let cocok: (typeof daftar)[number] | undefined
      for (const pola of u.assemblyPola) {
        cocok = daftar.find((a) =>
          assemblyCocok(a.name, pola) && a.output_unit_code === u.satuan)
        if (cocok) break
      }

      return {
        ...u,
        assembly: cocok
          ? { id: cocok.id, code: cocok.code, name: cocok.name, unit: cocok.output_unit_code }
          : null,
      }
    })

    /*
      Yang TAK ketemu DILAPORKAN, bukan dilewati.

      Item RAB yang hilang diam-diam adalah kekurangan anggaran — dan
      kekurangannya tak terlihat karena yang tersisa terlihat lengkap.
    */
    const tanpaAssembly = hasil
      .filter((u) => !u.assembly)
      .map((u) => ({ uraian: u.uraian, satuan: u.satuan, pola: u.assemblyPola }))

  return {
    hasil,
    tanpaAssembly,
    gagal,
    catatan: [...new Set(usulan.flatMap((u) => u.catatan))],
    belumSegar: (data ?? []).filter(
      (el) => (el as { basi?: boolean }).basi
        || (el as { aman?: boolean | null }).aman == null,
    ).length,
  }
}
