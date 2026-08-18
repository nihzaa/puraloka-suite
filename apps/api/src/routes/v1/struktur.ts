import type { FastifyInstance, FastifyRequest } from 'fastify'
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
import {
  gambarPenampang, gambarDiagramPM, gambarPenampangLingkaran,
  gambarPotonganPelat, gambarPondasi, gambarTiang,
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
const JENIS = ['balok', 'kolom', 'kolom_bulat', 'plat', 'footplat', 'pilecap', 'tiang'] as const
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
  }
}

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

      // Gambar HANYA bila diminta — SVG penampang + diagram P-M menambah
      // beberapa KB, dan halaman daftar tak membutuhkannya.
      if (request.query.gambar === '1') {
        badan.gambar = gambarUntuk(el, hasil)
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

      for (const el of data ?? []) {
        try {
          const h = hitung(el.jenis as Jenis, el.input as Record<string, unknown>, el.jumlah)
          const v = volumeDari(h)
          if (v) hasil.push({ volume: v })
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
        gagal,
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
