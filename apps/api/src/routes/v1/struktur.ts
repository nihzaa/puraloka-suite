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
import { analisaSloof } from '../../lib/struktur-sloof.js'
import { analisaTangga } from '../../lib/struktur-tangga.js'
import { analisaBalokT } from '../../lib/struktur-balok-t.js'
import {
  analisaPondasiMenerus, analisaRaft,
} from '../../lib/struktur-pondasi-dangkal.js'
import {
  analisaDindingPenahan, analisaDindingGeser,
} from '../../lib/struktur-dinding.js'
import {
  analisaKolomKomposit, analisaBondek,
} from '../../lib/struktur-komposit.js'
import {
  analisaGusset, analisaSambunganMomen,
} from '../../lib/struktur-baja-sambungan-lanjut.js'
import {
  analisaKudaKudaKayu, analisaBajaRingan, PROFIL_BAJA_RINGAN,
} from '../../lib/struktur-atap-ringan.js'
import {
  analisaSambunganKayu, analisaSekrupBajaRingan,
} from '../../lib/struktur-sambungan-ringan.js'
import {
  analisaGempaStatik, analisaAngin, analisaDrift, analisaPDelta,
  SISTEM_STRUKTUR, KATEGORI_RISIKO, KOEF_PERIODA, EKSPOSUR,
} from '../../lib/struktur-beban-lateral.js'
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
  gambarProfilBaja,
  gambarDindingPenahan,
  gambarTangga,
  gambarKolomKomposit,
  gambarBondek,
  gambarDindingGeser,
  gambarRaft,
  gambarPondasiMenerus,
  gambarPolaSambungan,
  gambarGusset,
  gambarLas,
  gambarPenampangKayu,
} from '../../lib/struktur-gambar.js'
import { bandingkan, kandidatDariVariasi } from '../../lib/struktur-banding.js'
import { analisaBebanBalok } from '../../lib/struktur-beban-balok.js'
import {
  FUNGSI_RUANG, JENIS_DINDING, LAPIS_MATI,
} from '../../lib/struktur-katalog-beban.js'
import { gambarDiagramBeban } from '../../lib/struktur-gambar-beban.js'
import {
  dampakMutu, fcDesainDari, mutuBetonTerukur,
} from '../../lib/struktur-mutu-nyata.js'
import { catatRiwayat, inputBerbeda } from '../../lib/struktur-riwayat.js'
import { susunLembar } from '../../lib/struktur-lembar.js'
import { susunPdfLembar } from '../../lib/struktur-lembar-pdf.js'

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
  'sloof', 'tangga', 'balok_t',
  'pondasi_menerus', 'raft', 'dinding_penahan', 'dinding_geser',
  'kolom_komposit', 'bondek',
  // Baja & atap ringan
  'baja_gusset', 'baja_sambungan_momen', 'kuda_kuda_kayu', 'baja_ringan',
  'sambungan_kayu', 'sekrup_baja_ringan',
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
/**
 * Apakah input elemen memuat data beban yang cukup untuk menghitung momen?
 *
 * Ditulis SEKALI dan dipakai dua tempat (`hitung` dan `gambarUntuk`).
 * Versi sebelumnya menyalinnya di dua tempat, dan keduanya sama-sama tak
 * mengenali bentuk KATALOG (`fungsiRuangKunci` / `lapisMati`) begitu itu
 * ditambahkan — elemen berbeban lengkap diam-diam diperlakukan seolah tak
 * punya beban. Tak ada galat, tak ada gejala.
 */
function punyaDataBeban(input: Record<string, unknown>): boolean {
  const adaBentang = Number.isFinite(Number(input.bentangM))
  /* Beban hidup: angka langsung ATAU pilihan fungsi ruang. */
  const adaHidup = Number.isFinite(Number(input.bebanHidupKnM2))
    || typeof input.fungsiRuangKunci === 'string'
  /* Beban mati: daftar angka ATAU pilihan katalog. Keduanya boleh KOSONG —
     yang penting dinyatakan, bukan hilang. */
  const adaMati = Array.isArray(input.bebanMatiTambahan)
    || Array.isArray(input.lapisMati)
  return adaBentang && adaHidup && adaMati
}
function hitung(jenis: Jenis, input: Record<string, unknown>, jumlah: number) {
  const dgnJumlah = { ...input, jumlah }
  switch (jenis) {
    // Kolom memakai varian LENGKAP — verdict-nya termasuk diagram P-M penuh.
    // Memakai `analisaKolom` polos di sini akan mengembalikan batas Fase 1
    // yang sudah ditutup Fase 2: kolom bermomen besar lolos dengan "aman".
    case 'kolom': return analisaKolomLengkap(dgnJumlah as never)
    case 'kolom_bulat': return analisaKolomBulatLengkap(dgnJumlah as never)
    /*
      ══════════════════════════════════════════════════════════════════════
      BALOK: momen DIHITUNG dari beban bila datanya ada

      `muKnm`/`vuKn` boleh diisi langsung (jalur lama, dan sebagian orang
      memang sudah punya angkanya dari analisa rangka). Tapi bila input
      memuat data BEBAN yang lengkap, momen dihitung dari situ dan
      MENIMPA angka yang diketik.

      Kenapa menimpa, bukan menolak salah satunya: angka yang DIHITUNG bisa
      diperiksa orang lain lewat rinciannya, sementara angka yang diketik
      tak bisa. Membiarkan keduanya hidup berdampingan berarti dua sumber
      kebenaran untuk satu angka — dan yang dipercaya jadi bergantung pada
      urutan medan di form, hal yang tak dilihat siapa pun.

      Syaratnya KERAS (bentang + beban hidup + daftar beban mati). Kurang
      satu pun, jalur lama yang dipakai — bukan diam-diam menganggapnya nol.
      ══════════════════════════════════════════════════════════════════════
    */
    case 'balok': {
      const i = dgnJumlah as Record<string, unknown>
      const punyaBeban = punyaDataBeban(i)
      if (!punyaBeban) return analisaBalok(dgnJumlah as never)

      const beban = analisaBebanBalok({
        bentangM: Number(i.bentangM),
        lebarPikulM: Number(i.lebarPikulM ?? 0),
        bMm: Number(i.bMm), hMm: Number(i.hMm),
        tebalPelatMm: Number(i.tebalPelatMm ?? 0),
        bebanMatiTambahan: i.bebanMatiTambahan as never,
        lapisMati: i.lapisMati as never,
        bebanHidupKnM2: i.bebanHidupKnM2 as never,
        fungsiRuangKunci: i.fungsiRuangKunci as never,
        jenisDinding: i.jenisDinding as never,
        tinggiDindingM: i.tinggiDindingM as never,
        bebanDindingKnM: Number(i.bebanDindingKnM ?? 0),
        bebanTerpusatKn: Number(i.bebanTerpusatKn ?? 0),
        skema: i.skema as never,
      })
      const hasil = analisaBalok({
        ...(dgnJumlah as object),
        muKnm: beban.muKnm,
        vuKn: beban.vuKn,
      } as never) as { catatan?: string[] }

      /*
        Catatan bebannya IKUT NAIK ke hasil — termasuk rincian beban matinya.
        Momen yang muncul tanpa asal-usul tak bisa diaudit siapa pun, dan
        lembar bertanda tangan yang memuatnya jadi tak bisa dipertanggung-
        jawabkan.
      */
      const asal = beban.rincianMati
        .map((x) => `${x.nama} = ${Math.round(x.knM * 100) / 100} kN/m`).join(' · ')
      return {
        ...hasil,
        catatan: [
          ...(hasil.catatan ?? []),
          `Mu ${Math.round(beban.muKnm * 100) / 100} kNm dan Vu `
            + `${Math.round(beban.vuKn * 100) / 100} kN DIHITUNG dari beban, `
            + 'bukan diketik.',
          `Beban mati: ${asal}.`,
          ...beban.catatan,
        ],
      }
    }
    case 'plat': return analisaPlat(dgnJumlah as never)
    case 'footplat': return analisaFootplat(dgnJumlah as never)
    case 'pilecap': return analisaPilecap(dgnJumlah as never)
    case 'tiang': return analisaTiang(dgnJumlah as never)
    /*
      Sloof & tangga: elemen beton yang paling sering muncul di RAB nyata
      (diukur 2026-08-19: sloof 15 baris, tangga 8) dan paling lama tak punya
      penguji. Keduanya punya modul sendiri, bukan memakai balok/pelat apa
      adanya — alasannya di kepala berkas masing-masing.
    */
    case 'sloof': return analisaSloof(dgnJumlah as never)
    case 'tangga': return analisaTangga(dgnJumlah as never)
    /*
      Balok T / balok anak: hampir semua balok lantai beton dicor MENYATU
      dengan pelat, dan menghitungnya sebagai persegi memperbesar setiap balok
      anak di proyek tanpa perlu. Modulnya menghitung DUA kondisi — momen
      positif (flens tertekan, penampang T) dan negatif (flens tarik, kembali
      persegi) — bukan mengambil yang menguntungkan.
    */
    case 'balok_t': return analisaBalokT(dgnJumlah as never)
    /*
      Pondasi dangkal & dinding. Empat elemen yang menutup sisa celah beton:

        pondasi_menerus  paling umum di Indonesia, hampir tak pernah dihitung —
                         ukurannya diwariskan turun-temurun
        raft             dipakai justru saat tanahnya lemah, dan di situlah
                         kesalahan paling mahal
        dinding_penahan  tiga cara gagal (guling/geser/tekanan); yang paling
                         sering dilewatkan adalah GESER
        dinding_geser    yang diperiksa URUTAN kegagalannya, bukan hanya
                         kuatnya — geser yang lebih lemah runtuh mendadak
    */
    case 'pondasi_menerus': return analisaPondasiMenerus(dgnJumlah as never)
    case 'raft': return analisaRaft(dgnJumlah as never)
    case 'dinding_penahan': return analisaDindingPenahan(dgnJumlah as never)
    case 'dinding_geser': return analisaDindingGeser(dgnJumlah as never)
    /*
      Enam elemen terakhir — menutup cakupan pondasi→atap sepenuhnya.

      Yang khas pada masing-masing, dan tak ada di elemen lain:

        kolom_komposit  beton menyumbang > separuh kapasitas; menghitungnya
                        sebagai kolom baja saja mengabaikan porsi itu
        bondek          diperiksa DUA tahap — pelaksanaan (bondek memikul
                        beton basah sendirian) dan layan. Tahap pertama yang
                        paling sering menentukan dan paling sering dilewatkan
        baja_gusset     TEKUK pelat buhul, yang terjadi KELUAR BIDANG dan tak
                        terlihat pada gambar sambungan
        baja_sambungan_momen  KEKAKUAN, bukan hanya kekuatan — sambungan yang
                        "kelihatan kaku" sering semi-rigid
        kuda_kuda_kayu  TUMPU TEGAK LURUS SERAT, yang paling sering gagal dan
                        paling jarang diperiksa
        baja_ringan     TEKUK LOKAL mengendalikan; luas efektif bisa hanya
                        sepertiga luas bruto
    */
    case 'kolom_komposit': return analisaKolomKomposit(dgnJumlah as never)
    case 'bondek': return analisaBondek(dgnJumlah as never)
    case 'baja_gusset': return analisaGusset(dgnJumlah as never)
    case 'baja_sambungan_momen': return analisaSambunganMomen(dgnJumlah as never)
    case 'kuda_kuda_kayu': return analisaKudaKudaKayu(dgnJumlah as never)
    case 'baja_ringan': return analisaBajaRingan(dgnJumlah as never)
    /*
      SAMBUNGAN rangka atap — titik gagal SESUNGGUHNYA.

      Empat modul lain menyebutkan hal yang sama sebagai batasnya: "pada
      kuda-kuda kayu, sambungan hampir selalu lebih lemah daripada batangnya".
      Sampai keduanya ada, aplikasi menghitung batang dengan teliti lalu
      menyerahkan titik gagal sesungguhnya ke perkiraan.

      Keduanya TAK bervolume: alat sambung dibeli per kilogram sebagai bahan
      pembantu, bukan item RAB tersendiri.
    */
    case 'sambungan_kayu': return analisaSambunganKayu(dgnJumlah as never)
    case 'sekrup_baja_ringan': return analisaSekrupBajaRingan(dgnJumlah as never)

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
  'baja_sambungan_baut', 'baja_sambungan_las', 'baja_angkur',
  /*
    ⚠ `baja_interaksi` DIKELUARKAN dari daftar ini 2026-08-19.

    Ia MEMULANGKAN volume (`HasilGording.volume`), jadi mendaftarkannya di
    sini membuat volumenya dilewati SENYAP — elemen itu hilang dari rekap
    proyek tanpa satu pun galat. Ditemukan `audit-jenis-volume-terdaftar.mjs`.
  */
  /*
    Ditambahkan bersama modul sambungan lanjut. Keduanya menghitung KAPASITAS
    sambungan, bukan kuantitas material — pelat buhul dan pelat ujung dibeli
    sebagai bagian dari pekerjaan fabrikasi baja, bukan item RAB tersendiri.

    Jenis yang TIDAK terdaftar di sini tetapi juga tak memulangkan volume akan
    dilaporkan `rekap-volume` sebagai KEGAGALAN ("modulnya tak memulangkan
    volume") — dan itu benar: diam-diam melewatkannya membuat elemen hilang
    dari rekap tanpa ada yang tahu.
  */
  'baja_gusset', 'baja_sambungan_momen',
  /*
    Sambungan rangka atap: yang dihitung KAPASITAS, bukan kuantitas. Paku,
    baut, dan sekrup dibeli per kilogram sebagai bahan pembantu — memasukkan
    keduanya ke rekap volume sebagai item tersendiri membuat RAB berisi baris
    yang tak pernah ditawarkan supplier.
  */
  'sambungan_kayu', 'sekrup_baja_ringan',
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

      /*
        RIWAYAT dicatat SEBELUM ditimpa, dan HANYA bila inputnya berubah.

        Mengubah nama atau catatan bukan perubahan desain — melahirkan revisi
        untuk itu membuat riwayat penuh baris yang tak menjelaskan apa pun,
        dan perubahan dimensi yang sesungguhnya tenggelam di antaranya.

        Kegagalan mencatat TIDAK menggagalkan penyuntingan; alasannya ada di
        kepala `lib/struktur-riwayat.ts`.
      */
      if (request.body?.input !== undefined && inputBerbeda(el.input, input)) {
        await catatRiwayat(
          el as never, request.currentUser!.id,
          request.body?.catatan ?? null, request.log,
        )
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

  /*
    ══════════════════════════════════════════════════════════════════════════
    GET /struktur/:id/riwayat — daftar revisi elemen, terbaru dulu

    Menjawab "kenapa dulu 300x500?" — pertanyaan yang sebelumnya tak punya
    jawaban di mana pun, karena hitung-ulang menimpa satu-satunya salinan.

    Yang dipulangkan adalah INPUT tiap revisi (sebabnya), bukan angka antara.
    Alasannya sama dengan migrasi 458: fungsi analisa PURE, jadi angka
    turunan yang disimpan bisa berselisih diam-diam dengan rumus yang sudah
    diperbaiki — dan yang berselisih diam-diam adalah yang paling berbahaya.
    ══════════════════════════════════════════════════════════════════════════
  */
  app.get<{ Params: { id: string } }>(
    '/api/v1/struktur/:id/riwayat',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      const el = await ambilElemen(request, request.params.id)
      if (!el) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      const { data, error } = await supabase
        .from('struktur_riwayat')
        .select('urutan, input, jenis, jumlah, aman, beton_m3, bekisting_m2, besi_kg, alasan, dicatat_pada, dicatat_oleh')
        .eq('elemen_id', request.params.id)
        .order('urutan', { ascending: false })
        .limit(200)
      if (error) return reply.status(500).send({ error: error.message })

      /*
        Keadaan SEKARANG ikut dipulangkan sebagai puncak daftar, ditandai
        `sekarang: true`.

        Tanpa itu layar riwayat memperlihatkan revisi-revisi lama tanpa
        pembanding, dan pembacanya harus mengingat sendiri angka yang berlaku
        hari ini untuk tahu apa yang berubah.
      */
      return reply.send({
        sekarang: {
          input: el.input, jenis: el.jenis, jumlah: el.jumlah,
          aman: el.aman ?? null, sekarang: true,
        },
        data: data ?? [],
      })
    })

  /*
    ══════════════════════════════════════════════════════════════════════════
    POST /struktur/:id/banding — "kalau baloknya 450 saja, masih kuat?"

    Pertanyaan itu ditanyakan di tiap proyek, dan sampai sekarang dijawab
    dengan cara yang mahal: UBAH inputnya, hitung ulang, lihat, lalu
    KEMBALIKAN kalau ternyata tak kuat. Elemen aslinya sempat menyimpan
    desain yang belum diputuskan, dan mencoba lima kandidat berarti sepuluh
    kali bolak-balik.

    ── TIDAK MENULIS APA PUN

    Ini rute POST yang murni membaca. POST-nya dipilih karena badan
    permintaannya bisa panjang (daftar kandidat), bukan karena ada yang
    berubah di basis.

    Konsekuensinya disengaja: mencoba-coba desain TIDAK meninggalkan jejak di
    riwayat revisi. Riwayat mencatat keputusan, bukan penjajakan — kalau tiap
    percobaan tercatat, riwayat yang dibangun untuk menjawab "kenapa dulu
    300x500?" akan tenggelam dalam puluhan baris yang tak pernah dipakai.

    ── TIDAK menghitung harga

    Godaan besarnya adalah menjawab "mana yang PALING MURAH". Ditolak dengan
    alasan yang sama yang sudah ditulis di rute `usulan-rab`: harga lahir dari
    AHSP x price book pada TANGGAL tertentu, dan jalur kedua yang menghitung
    harga sendiri berarti dua rumus harga di satu aplikasi.

    Yang dibandingkan adalah yang benar-benar dimiliki modul ini: lolos/tidak,
    seberapa terpakai kapasitasnya, dan volume bahannya.
    ══════════════════════════════════════════════════════════════════════════
  */
  /*
    ══════════════════════════════════════════════════════════════════════════
    POST /struktur/beban-balok — momen & gaya lintang DARI BEBAN, bukan diketik

    `analisaBalok` menerima `muKnm` dan `vuKn` sebagai ANGKA JADI: momen
    rencana harus dihitung sendiri di kertas lalu diketik. Itu persis yang
    modul SLOOF sengaja hindari, dan alasannya sudah tertulis di halaman
    UI-nya:

        "Estimator yang harus menghitung momen sloof sendiri di kertas akan
         salah, dan salahnya tak terlihat karena angka momen tak punya
         'rasa benar' seperti dimensi."

    Dimensi salah ketik TERLIHAT (balok 3000 mm jelas keliru). Momen salah
    TIDAK: 120 kNm dan 210 kNm sama-sama wajar, dan yang salah menghasilkan
    balok yang LOLOS pemeriksaan tapi tak kuat.

    ── TIDAK MENULIS apa pun

    Rute ini murni menghitung. POST dipilih karena badan permintaannya
    memuat daftar beban mati, bukan karena ada yang berubah di basis.
    ══════════════════════════════════════════════════════════════════════════
  */
  /*
    GET /struktur/katalog-beban — beban hidup SNI & katalog beban mati.

    Dipisah dari rute hitung supaya UI bisa mengisi pemilihnya SEBELUM ada
    angka apa pun untuk dihitung. Tanpa ini, layar harus memaku daftarnya
    sendiri — dan daftar yang dipaku di dua tempat akan menyimpang, dengan
    akibat yang tak terlihat: beban hidup di layar berbeda dari yang dipakai
    menghitung.
  */
  app.get('/api/v1/struktur/katalog-beban',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (_request, reply) => reply.send({
      fungsiRuang: FUNGSI_RUANG,
      lapisMati: LAPIS_MATI,
      jenisDinding: JENIS_DINDING,
      acuan: "SNI 1727:2020 Tabel 4.3-1 (beban hidup) — nilai beban mati "
        + "adalah angka LAZIM untuk perencanaan awal; berat sesungguhnya "
        + "datang dari spesifikasi pabrik.",
    }))
  app.post<{
    Body: {
      bentangM?: number; lebarPikulM?: number
      bMm?: number; hMm?: number; tebalPelatMm?: number
      bebanMatiTambahan?: Array<{ nama?: string; nilai?: number }>
      bebanHidupKnM2?: number; bebanDindingKnM?: number
      bebanTerpusatKn?: number; skema?: string
      gambar?: boolean
    }
  }>(
    '/api/v1/struktur/beban-balok',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      try {
        const hasil = analisaBebanBalok(request.body as never)
        /*
          Gambarnya OPSIONAL — SVG tiga panel ~6 KB, dan pemanggil yang cuma
          butuh angkanya (mis. mengisi form) tak perlu menanggungnya.
        */
        const gambar = request.body?.gambar === false
          ? undefined
          : gambarDiagramBeban(hasil, Number(request.body?.bentangM))
        return reply.send({ hasil, gambar })
      } catch (e) {
        /*
          400, bukan 500: yang salah adalah masukannya, dan pesannya sudah
          menjelaskan medan mana. Membalas 500 membuat kesalahan isi form
          terbaca seperti kerusakan server.
        */
        return reply.status(400).send({ error: (e as Error).message })
      }
    })
  app.post<{
    Params: { id: string }
    Body: {
      medan?: string
      nilai?: Array<number | string>
      kandidat?: Array<{ label?: string; input?: Record<string, unknown> }>
    }
  }>(
    '/api/v1/struktur/:id/banding',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      const el = await ambilElemen(request, request.params.id)
      if (!el) return reply.status(404).send({ error: 'Elemen tidak ditemukan' })

      /*
        Dua cara memberi kandidat. Yang pertama (medan + nilai) menutup kasus
        yang jauh paling sering, dan menutup satu cacat sekaligus: input penuh
        yang disalin per kandidat bisa menyimpang di lebih dari satu medan,
        dan perbandingannya lalu membandingkan dua hal yang berbeda tanpa ada
        yang tahu.
      */
      let kandidat
      if (request.body?.medan) {
        const nilai = request.body?.nilai
        if (!Array.isArray(nilai) || !nilai.length) {
          return reply.status(400).send({ error: '`nilai` wajib berupa larik tak kosong' })
        }
        if (nilai.length > 12) {
          /*
            Batas atas yang disebutkan, bukan pemotongan diam-diam: daftar
            yang dipotong tanpa kabar terbaca seperti daftar yang lengkap.
          */
          return reply.status(400).send({ error: 'Maksimal 12 kandidat sekali banding' })
        }
        try {
          kandidat = kandidatDariVariasi(el.input, request.body.medan, nilai)
        } catch (e) {
          return reply.status(400).send({ error: (e as Error).message })
        }
      } else if (Array.isArray(request.body?.kandidat) && request.body.kandidat.length) {
        if (request.body.kandidat.length > 12) {
          return reply.status(400).send({ error: 'Maksimal 12 kandidat sekali banding' })
        }
        kandidat = request.body.kandidat.map((k, i) => ({
          label: k.label?.trim() || `Kandidat ${i + 1}`,
          input: k.input ?? el.input,
        }))
      } else {
        return reply.status(400).send({
          error: 'Kirim `medan` + `nilai`, atau `kandidat` berisi daftar input',
        })
      }

      /*
        Dispatcher yang SAMA dengan jalur simpan. Dispatcher kedua yang
        "mirip" akan berselisih diam-diam begitu salah satunya diperbaiki.
      */
      /*
        Keadaan SEKARANG dihitung DI DALAM set yang sama, bukan lewat
        panggilan terpisah.

        Versi pertama memanggilnya sendiri — dan itu membuat
        `puncakBerubahPersen` miliknya SELALU null, karena pemeriksaan mana
        yang "berubah" hanya kelihatan dari perbandingan lintas kandidat.
        Akibatnya baris pembanding tak bisa dibandingkan pada kolom yang
        justru paling menentukan.

        Dispatcher yang dipakai SAMA dengan jalur simpan. Dispatcher kedua
        yang "mirip" akan berselisih diam-diam begitu salah satunya
        diperbaiki.
      */
      const semua = bandingkan([{ label: 'Sekarang', input: el.input }, ...kandidat],
        el.jumlah, (input) => hitung(el.jenis, input, el.jumlah))

      return reply.send({
        elemen: { kode: el.kode, jenis: el.jenis, jumlah: el.jumlah },
        sekarang: semua[0],
        data: semua.slice(1),
      })
    })

  /*
    ══════════════════════════════════════════════════════════════════════════
    GET /projects/:projectId/struktur/mutu-nyata

    Pertanyaan yang selama ini tak pernah diajukan siapa pun.

    `uji_material` menyimpan kuat tekan NYATA dari laboratorium.
    `struktur_elemen.input.mutu.fcMpa` menyimpan yang DIASUMSIKAN saat
    menghitung. Diukur 2026-08-20: tak ada satu pun yang membandingkan
    keduanya — `uji_material` hanya disentuh `mutu.ts`.

    Data sungguhan yang sudah ada di basis ini:

        Beton K-250 zona A lantai   231,0 / 250,0 kg/cm2  -> tidak_memenuhi

    Sistem mencatatnya "tidak memenuhi", lalu BERHENTI. Lanjutannya —
    "balok yang dihitung dengan fc 25 MPa, apakah masih aman pada mutu yang
    benar-benar terpasang?" — adalah pertanyaan yang menentukan boleh
    tidaknya lantai dibebani, dan jawabannya sudah bisa dihitung sejak lama.
    Yang hilang cuma sambungannya.

    ── TIDAK MENULIS apa pun

    Hasil uji tak boleh menimpa input desain. Desain adalah KEPUTUSAN; hasil
    uji adalah PENGUKURAN — menimpa yang satu dengan yang lain menghapus jejak
    apa yang sebenarnya direncanakan, dan itu justru yang dicari saat proyek
    disengketakan. Alasan lengkapnya di kepala `lib/struktur-mutu-nyata.ts`.
    ══════════════════════════════════════════════════════════════════════════
  */
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/struktur/mutu-nyata',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      if (!(await proyekMilikTenant(request, request.params.projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: ujiMentah, error: eUji } = await request.db!
        .viaProject('uji_material', request.params.projectId)
        .select('id, objek, jenis_uji, nilai_hasil, nilai_syarat, satuan, tanggal_uji, kesimpulan')
        .order('tanggal_uji', { ascending: false })
        .limit(300)
      if (eUji) {
        request.log.error({ err: eUji, projectId: request.params.projectId },
          'gagal memuat uji material untuk banding mutu')
        return reply.status(500).send({ error: 'Gagal memuat hasil uji material' })
      }

      const terukur = mutuBetonTerukur((ujiMentah ?? []) as never)
      if (!terukur.length) {
        /*
          Dibedakan dari "semua aman": proyek yang BELUM punya uji tekan beton
          bukan proyek yang mutunya terbukti baik. Menyamakannya membuat
          layar hijau untuk proyek yang sama sekali belum diperiksa.
        */
        return reply.send({
          adaUji: false,
          terukur: [],
          data: [],
          catatan: 'Belum ada hasil uji kuat tekan beton di proyek ini. '
            + 'Ini BUKAN berarti mutunya sudah terbukti sesuai desain.',
        })
      }

      const { data: elemen, error } = await supabase
        .from('struktur_elemen')
        .select('id, kode, nama, jenis, jumlah, input')
        .eq('project_id', request.params.projectId)
        .order('kode', { ascending: true })
        .limit(500)
      if (error) return reply.status(500).send({ error: error.message })

      const hasil = []
      for (const el of elemen ?? []) {
        const input = el.input as Record<string, unknown>
        const fcDesain = fcDesainDari(input)
        /*
          Elemen tanpa mutu beton (baja, kayu) DILEWATI — bukan dilaporkan
          sebagai "aman". Melaporkannya aman berarti mengklaim sesuatu yang
          tak diperiksa sama sekali.
        */
        if (fcDesain === null) continue

        const dampak = dampakMutu(terukur, fcDesain)
        if (!dampak) continue

        /*
          Dihitung ULANG pada mutu NYATA lewat dispatcher yang SAMA dengan
          jalur simpan — bukan dengan menyetel ulang rasio secara kira-kira.
        */
        const inputNyata = structuredClone(input)
        const mutu = inputNyata.mutu as Record<string, unknown> | undefined
        if (mutu && typeof mutu === 'object') mutu.fcMpa = dampak.fcNyataMpa
        else inputNyata.fcMpa = dampak.fcNyataMpa

        const banding = bandingkan(
          [
            { label: 'Desain', input },
            { label: 'Mutu nyata', input: inputNyata },
          ],
          el.jumlah ?? 1,
          (i) => hitung(el.jenis as Jenis, i, el.jumlah ?? 1))

        const [desain, nyata] = banding
        hasil.push({
          kode: el.kode,
          nama: el.nama,
          jenis: el.jenis,
          fcDesainMpa: dampak.fcDesainMpa,
          fcNyataMpa: dampak.fcNyataMpa,
          selisihPersen: dampak.selisihPersen,
          final: dampak.final,
          amanDesain: desain?.aman ?? null,
          amanNyata: nyata?.aman ?? null,
          /*
            Inilah temuan yang dicari: elemen yang tadinya lolos, TIDAK lagi
            lolos pada mutu yang benar-benar terpasang.
          */
          berubahJadiTidakAman: desain?.aman === true && nyata?.aman === false,
          gagalNyata: nyata?.gagalPeriksa ?? [],
          terpakaiDesain: desain?.puncakPersen ?? null,
          terpakaiNyata: nyata?.puncakPersen ?? null,
        })
      }

      return reply.send({
        adaUji: true,
        terukur,
        jumlahBerubah: hasil.filter((h) => h.berubahJadiTidakAman).length,
        data: hasil,
      })
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
  /*
    ══════════════════════════════════════════════════════════════════════════
    GET /struktur/lembar.pdf — LEMBAR PERHITUNGAN yang bisa ditandatangani

    Modul ini menyatakan sendiri batasnya: "MEMBANTU estimasi, bukan
    menggantikan perhitungan bertanda tangan insinyur". Kalimat itu benar —
    dan selama ini menggantung, karena insinyur yang mau menandatangani TAK
    PUNYA LEMBAR untuk ditandatangani.

    Seluruh hasilnya hanya hidup di layar: tak bisa dilampirkan ke pengajuan
    IMB, tak bisa dikirim ke pemilik proyek, tak bisa diarsipkan saat proyek
    disengketakan bertahun-tahun kemudian.

    ── Kegagalan memuat identitas penerbit TIDAK menghentikan pencetakan

    Pola yang sama dengan `penawaran.ts` dan `contracts.ts`: dokumen yang tak
    bisa terbit jauh lebih merugikan daripada dokumen berkop tipis.
    ══════════════════════════════════════════════════════════════════════════
  */
  app.get<{
    Params: { projectId: string }
    Querystring: { nomor?: string; disusun?: string; diperiksa?: string }
  }>(
    '/api/v1/projects/:projectId/struktur/lembar.pdf',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      if (!(await proyekMilikTenant(request, request.params.projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }

      const { data: baris, error } = await supabase
        .from('struktur_elemen')
        .select('id, kode, nama, jenis, jumlah, input')
        .eq('project_id', request.params.projectId)
        .order('kode', { ascending: true })
        .limit(500)
      if (error) return reply.status(500).send({ error: error.message })

      const elemen = baris ?? []
      if (!elemen.length) {
        return reply.status(400).send({
          error: 'Belum ada elemen struktur di proyek ini — tak ada yang bisa '
            + 'dicetak. Tambahkan elemen lebih dulu di layar Analisa Struktur.',
        })
      }

      /*
        Dihitung ULANG di sini, bukan memakai `hasil_ringkas` yang tersimpan.

        Ringkasan tersimpan bisa BASI (kolom `basi` ada justru untuk itu), dan
        lembar bertanda tangan yang memuat angka basi jauh lebih berbahaya
        daripada lembar yang lambat terbit beberapa detik.
      */
      const disusun = []
      for (const el of elemen) {
        let hasil = null
        let gambar
        try {
          hasil = hitung(el.jenis as Jenis, el.input as Record<string, unknown>,
            Number(el.jumlah ?? 1)) as never
          gambar = gambarUntuk(el as never, hasil)
        } catch {
          /*
            Elemen yang tak bisa dihitung TETAP masuk lembar, dengan bagian
            pemeriksaan kosong. Menghilangkannya diam-diam membuat lembar
            terlihat lengkap padahal ada elemen yang terlewat — dan yang
            menandatangani takkan tahu.
          */
          hasil = null
        }
        disusun.push({
          kode: el.kode, nama: el.nama, jenis: el.jenis,
          jumlah: Number(el.jumlah ?? 1),
          input: el.input as Record<string, unknown>,
          hasil, gambar,
        })
      }

      const { data: proyek } = await request.db!
        .from('projects').select('name, location').eq('id', request.params.projectId)
        .maybeSingle()

      const { data: perusahaan } = await request.db!
        .unsafe('companies', 'identitas penerbit dokumen; disaring eq(id, companyId)')
        .select('name, legal_name, address, city, phone')
        .eq('id', request.companyId!)
        .maybeSingle()

      const pr = proyek as { name?: string; location?: string } | null
      const pe = perusahaan as Record<string, string> | null

      const lembar = susunLembar(disusun as never, {
        nomor: request.query.nomor,
        proyek: { nama: pr?.name ?? 'Proyek', lokasi: pr?.location ?? null },
        penerbit: {
          nama: pe?.legal_name || pe?.name || null,
          alamat: pe?.address ?? null,
          kota: pe?.city ?? null,
          telepon: pe?.phone ?? null,
        },
        disusunOleh: request.query.disusun ?? null,
        diperiksaOleh: request.query.diperiksa ?? null,
      })

      const pdf = await susunPdfLembar(lembar)
      const namaBerkas = `Lembar_Struktur_${(pr?.name ?? 'Proyek')
        .replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)}.pdf`

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${namaBerkas}"`)
        .send(pdf)
    })

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
  /*
    ══════════════════════════════════════════════════════════════════════════
    BEBAN LATERAL — gempa, angin, simpangan. BUKAN jenis elemen.

    Tiga perhitungan ini berlaku untuk SELURUH BANGUNAN, bukan satu penampang:
    gaya gempa lahir dari berat semua tingkat sekaligus, dan hasilnya adalah
    gaya yang lalu dibagikan ke elemen-elemennya.

    Karena itu ia tidak masuk `struktur_elemen` (yang satu baris = satu
    penampang) melainkan berdiri sendiri. Memaksakannya jadi "elemen" akan
    membuat rekap volume mencoba menghitung beton dari gaya gempa.

    ── Kenapa TIDAK DISIMPAN

    Endpoint ini menghitung dan memulangkan, tanpa menulis apa pun. Masukannya
    (berat tiap tingkat, SDS/SD1 lokasi, sistem struktur) adalah keputusan
    perencana yang belum punya tempat penyimpanan di aplikasi ini — dan
    menyimpan hasilnya tanpa masukannya menghasilkan angka yang tak bisa
    ditelusuri, persis yang dihindari seluruh modul struktur.
    ══════════════════════════════════════════════════════════════════════════
  */
  app.post<{
    Params: { projectId: string }
    Body: {
      gempa?: Record<string, unknown>
      angin?: Record<string, unknown>
      drift?: Record<string, unknown>
      pdelta?: Record<string, unknown>
    }
  }>(
    '/api/v1/projects/:projectId/struktur/beban-lateral',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (request, reply) => {
      if (!(await proyekMilikTenant(request, request.params.projectId))) {
        return reply.status(404).send({ error: 'Proyek tidak ditemukan' })
      }
      const b = request.body ?? {}
      if (!b.gempa && !b.angin && !b.drift && !b.pdelta) {
        return reply.status(400).send({
          error: 'Isi minimal satu dari: gempa, angin, drift, pdelta',
        })
      }

      /*
        Masukan cacat memulangkan 400 (salah pengguna), bukan 500 (salah
        server) — dua hal yang menuntut tindakan berbeda. Modulnya melempar
        Error biasa dengan pesan yang sudah bisa dibaca orang.
      */
      try {
        return reply.send({
          gempa: b.gempa ? analisaGempaStatik(b.gempa as never) : null,
          angin: b.angin ? analisaAngin(b.angin as never) : null,
          drift: b.drift ? analisaDrift(b.drift as never) : null,
          /*
            P-DELTA — bangunan yang sudah miring dijatuhkan beratnya sendiri.

            Ditaruh bersama drift, bukan sebagai jenis elemen: keduanya
            sifat SELURUH bangunan, bukan sifat satu balok atau satu kolom.
            Menjadikannya elemen akan membuat rekap volume mencoba
            menghitung beton dari koefisien stabilitas.
          */
          pdelta: b.pdelta ? analisaPDelta(b.pdelta as never) : null,
        })
      } catch (e) {
        return reply.status(400).send({ error: (e as Error).message })
      }
    })

  /*
    Katalog pilihan untuk layar: sistem struktur beserta R/Cd-nya, kategori
    risiko, koefisien perioda, dan eksposur angin.

    Dipulangkan dari SATU tempat — konstanta di `struktur-beban-lateral.ts` —
    bukan diketik ulang di UI. Daftar yang disalin ke layar akan berpisah dari
    kodenya saat salah satunya dikoreksi, dan memilih R yang salah adalah
    kesalahan paling mahal di seluruh perhitungan gempa.
  */
  app.get(
    '/api/v1/struktur/katalog-seismik',
    { preHandler: [authenticate, requirePermission('cecep:struktur:view')] },
    async (_request, reply) => reply.send({
      sistem: Object.entries(SISTEM_STRUKTUR).map(([kunci, v]) => ({ kunci, ...v })),
      risiko: Object.entries(KATEGORI_RISIKO).map(([kunci, v]) => ({ kunci, ...v })),
      perioda: Object.entries(KOEF_PERIODA).map(([kunci, v]) => ({ kunci, ...v })),
      eksposur: Object.entries(EKSPOSUR).map(([kunci, v]) => ({ kunci, ...v })),
    }))

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
    /*
      `company_id` dan ketiga volume IKUT DIAMBIL — dibutuhkan riwayat.

      Tanpa `company_id`, insert ke `struktur_riwayat` masuk dengan nilai
      undefined dan DITOLAK RLS tanpa galat yang terlihat di layar mana pun:
      penyuntingan tetap berhasil, riwayatnya diam-diam kosong selamanya.
      Cacat ini lolos dari tsc karena pemanggilnya memakai `as never`.
    */
    .select('id, kode, nama, jenis, jumlah, input, aman, basi, project_id, company_id, beton_m3, bekisting_m2, besi_kg')
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

  /*
    ══════════════════════════════════════════════════════════════════════════
    DIAGRAM BEBAN — hanya bila elemennya MEMANG memuat data beban

    Balok yang inputnya cuma `muKnm` (momen diketik langsung) TIDAK bisa
    digambar diagramnya: kita tak tahu bebannya seperti apa, bentangnya
    berapa, atau tumpuannya apa. Menggambar diagram karangan dari momen
    tunggal jauh lebih berbahaya daripada tak menggambar — pembacanya akan
    memercayai bentuk yang tak pernah dihitung siapa pun.

    Jadi syaratnya keras: ada `bentangM` DAN `bebanHidupKnM2` DAN daftar
    `bebanMatiTambahan`. Kurang satu pun, diagramnya tak terbit.
    ══════════════════════════════════════════════════════════════════════════
  */
  const punyaBeban = punyaDataBeban(el.input as Record<string, unknown>)

  if (punyaBeban && (el.jenis === 'balok' || el.jenis === 'sloof')) {
    try {
      const beban = analisaBebanBalok({
        bentangM: Number(i.bentangM),
        lebarPikulM: Number(i.lebarPikulM ?? 0),
        bMm: Number(i.bMm), hMm: Number(i.hMm),
        tebalPelatMm: Number(i.tebalPelatMm ?? 0),
        bebanMatiTambahan: (el.input as Record<string, unknown>).bebanMatiTambahan as never,
        lapisMati: (el.input as Record<string, unknown>).lapisMati as never,
        bebanHidupKnM2: (el.input as Record<string, unknown>).bebanHidupKnM2 as never,
        fungsiRuangKunci: (el.input as Record<string, unknown>).fungsiRuangKunci as never,
        jenisDinding: (el.input as Record<string, unknown>).jenisDinding as never,
        tinggiDindingM: (el.input as Record<string, unknown>).tinggiDindingM as never,
        bebanDindingKnM: Number(i.bebanDindingKnM ?? 0),
        bebanTerpusatKn: Number(i.bebanTerpusatKn ?? 0),
        skema: (el.input as never as { skema?: never }).skema,
      })
      g.diagramBeban = gambarDiagramBeban(beban, Number(i.bentangM),
        { uraian: `Diagram beban, momen, dan gaya lintang ${el.kode}` })
    } catch (e) {
      /*
        Gagal menggambar BUKAN alasan seluruh permintaan gagal — pola yang
        sama dengan gambar lain di fungsi ini. Tapi juga TIDAK BOLEH SENYAP:
        medan `…Gagal` dibaca layar dan ditampilkan, jadi orang tahu ada
        diagram yang seharusnya ada tapi tak terbit.

        `catch {}` kosong yang sempat saya tulis di sini ditangkap penjaga
        `audit-catch-senyap` — dan tuduhannya BENAR.
      */
      g.diagramBebanGagal = `Diagram beban tak dapat digambar: ${(e as Error).message}`
    }
  }

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

  /*
    ══════════════════════════════════════════════════════════════════════════
    TANGGA — satu-satunya elemen yang kegagalannya BUKAN runtuh.

    Tangga yang kuat sempurna tetap gagal kalau ORANG TERJATUH di atasnya, dan
    itu jauh lebih sering terjadi daripada tangga beton yang patah. Tiga dari
    tujuh pemeriksaannya karena itu bukan tentang kekuatan sama sekali:
    Blondel, tinggi anak tangga, lebar injakan — semuanya GEOMETRI.

    Optrede yang dipakai diambil dari HASIL (`optredeNyataMm`), bukan dari
    input: modulnya MENGHITUNG ULANG optrede supaya tinggi total habis dibagi
    rata, dan anak tangga terakhir yang berbeda sendirian adalah penyebab
    tersandung paling sering. Menggambar dari input akan menyembunyikan
    perbaikan itu.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'tangga') {
    try {
      const g2 = (hasil as {
        geometri?: { jumlahOptrede?: number; kemiringanDerajat?: number }
        antara?: { optredeNyataMm?: number; jumlahOptrede?: number; kemiringanDerajat?: number }
      })
      const optrede = g2.antara?.optredeNyataMm ?? Number(i.optredeMm)
      g.potongan = gambarTangga({
        tinggiM: Number(i.tinggiM),
        optredeMm: optrede,
        antredeMm: Number(i.antredeMm),
        tebalPelatMm: Number(i.tebalPelatMm),
        jumlahOptrede: g2.geometri?.jumlahOptrede ?? g2.antara?.jumlahOptrede,
        kemiringanDerajat: g2.geometri?.kemiringanDerajat ?? g2.antara?.kemiringanDerajat,
        blondelMm: 2 * optrede + Number(i.antredeMm),
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.potonganGagal = 'Potongan tangga tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    KOLOM KOMPOSIT & BONDEK — dua bahan yang harus terlihat sebagai DUA bahan.

    Kolom komposit TERBUNGKUS dan TERISI memakai koefisien berbeda (0,85 vs
    0,95, karena baja yang membungkus MENGEKANG betonnya). Dari daftar angka
    perbedaan itu cuma satu kata; dari gambar ia langsung terlihat.

    Bondek: gelombangnya BUKAN hiasan — ia yang membuat lembaran setipis
    0,75 mm sanggup memikul beton basah sebelum mengeras. Digambar rata,
    gambar itu membuat orang menyangka perancah sementara tak diperlukan.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'kolom_komposit') {
    try {
      g.penampang = gambarKolomKomposit({
        jenis: String(el.input.jenis ?? 'terbungkus'),
        lebarBetonMm: Number(i.lebarBetonMm),
        tinggiBetonMm: Number(i.tinggiBetonMm),
        asBajaMm2: Number(i.asBajaMm2),
        asTulanganMm2: Number(i.asTulanganMm2),
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.penampangGagal = 'Penampang kolom komposit tak dapat digambar dari input ini'
    }
  }

  if (el.jenis === 'bondek') {
    try {
      const hb = hasil as {
        antara?: { lendutanPelaksanaanMm?: number; batasLendutanPelaksanaanMm?: number }
      }
      g.potongan = gambarBondek({
        tebalTotalMm: Number(i.tebalTotalMm),
        tinggiGelombangMm: Number(i.tinggiGelombangMm),
        tebalBajaMm: Number(i.tebalBajaMm),
        bentangM: Number(i.bentangM),
        lendutanPelaksanaanMm: hb.antara?.lendutanPelaksanaanMm,
        batasLendutanMm: hb.antara?.batasLendutanPelaksanaanMm,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.potonganGagal = 'Potongan bondek tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    DINDING GESER — perbandingan hw/lw yang menentukan perilakunya.

    hw/lw >= 2 langsing (lentur menentukan, DIINGINKAN — meleleh pelan dan
    memberi peringatan); hw/lw <= 1 gemuk (geser menentukan, kegagalannya
    GETAS). Itu satu-satunya hal yang tak bisa dibaca dari daftar angka tanpa
    membagi dua bilangan di kepala.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'dinding_geser') {
    try {
      const per = periksaDari(hasil) as Array<{ nama: string; aman: boolean; rasio: number }>
      const geser = per.find((x) => /geser/i.test(x.nama))
      const urutan = per.find((x) => /lentur.*sebelum.*geser/i.test(x.nama))
      g.tampak = gambarDindingGeser({
        panjangM: Number(i.panjangM),
        tinggiM: Number(i.tinggiM),
        tebalMm: Number(i.tebalMm),
        asUjungMm2: Number(i.asUjungMm2),
        vuKn: Number(i.vuKn),
        rasioGeser: geser?.rasio,
        lenturDuluan: urutan ? urutan.aman : undefined,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.tampakGagal = 'Tampak dinding geser tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    RAFT — yang berbahaya adalah TEPI, bukan rata-rata.

    Tekanan rata-rata (beban ÷ luas) hampir selalu aman. Yang membuat raft
    gagal adalah tekanan di TEPI begitu resultan bergeser dari pusat. Denah
    memperlihatkan pergeseran itu sebagai jarak yang bisa dilihat.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'raft') {
    try {
      const hr = hasil as {
        tekanan?: { qMaksKnM2?: number; qMinKnM2?: number }
        antara?: { qMaksKnM2?: number; qMinKnM2?: number }
      }
      g.denah = gambarRaft({
        panjangM: Number(i.panjangM),
        lebarM: Number(i.lebarM),
        tebalMm: Number(i.tebalMm),
        eksentrisitasXM: Number(i.eksentrisitasXM ?? 0),
        eksentrisitasYM: Number(i.eksentrisitasYM ?? 0),
        qMaksKnM2: hr.tekanan?.qMaksKnM2 ?? hr.antara?.qMaksKnM2,
        qMinKnM2: hr.tekanan?.qMinKnM2 ?? hr.antara?.qMinKnM2,
        qaKnM2: Number(i.qaKnM2),
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.denahGagal = 'Denah raft tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    PONDASI MENERUS — ukuran warisan (60/30/60) yang tak pernah diperiksa.

    Lebar DASAR yang menentukan tekanan ke tanah, bukan lebar atasnya, dan
    pada trapesium keduanya berbeda jauh. Aanstamping & pasir urug digambar
    karena selalu dikerjakan tetapi sering hilang dari RAB.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'pondasi_menerus') {
    try {
      const hp = hasil as { antara?: { qKnM2?: number }; tekanan?: { qKnM2?: number } }
      g.potongan = gambarPondasiMenerus({
        lebarBawahM: Number(i.lebarBawahM),
        lebarAtasM: Number(i.lebarAtasM),
        tinggiM: Number(i.tinggiM),
        kedalamanM: Number(i.kedalamanM),
        tebalPasirM: Number(i.tebalPasirM ?? 0),
        tinggiAanstampingM: Number(i.tinggiAanstampingM ?? 0),
        qKnM2: hp.antara?.qKnM2 ?? hp.tekanan?.qKnM2,
        qaKnM2: Number(i.qaKnM2),
        jenis: String(el.input.jenis ?? 'batu_kali'),
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.potonganGagal = 'Potongan pondasi menerus tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    KUDA-KUDA KAYU & BAJA RINGAN — dua jenis yang laporan cakupan SANGKA
    sudah bergambar, padahal tidak.

    Laporan itu menghitung keduanya karena modulnya menyebut medan `profil`.
    Tetapi `profil` pada baja ringan adalah KUNCI KATALOG berupa teks
    ("C75_100"), bukan objek berdimensi seperti pada baja profil berat — jadi
    cabang penampang baja melewatinya, dengan benar.

    Ketahuan hanya karena `uji-gambar-semua-jenis.mjs` MEMBUAT elemennya dan
    membuka balasannya: 30/32, bukan 32/32 seperti yang dilaporkan. Ini
    keempat kalinya laporan berbasis pembacaan kode salah dalam satu sesi.

    ── Kayu digambar berbeda dari beton dan baja, dan itu perlu

    Kayu kuat sepanjang serat, LEMAH tegak lurus serat — pada kelas II hanya
    sepertiganya. Dua kegagalan tersering keduanya soal arah: tumpuan yang
    PENYOK (bukan patah) dan belah mengikuti serat. Digambar sebagai kotak
    polos, arah itu hilang.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'kuda_kuda_kayu') {
    try {
      const per = periksaDari(hasil) as Array<{ nama: string; rasio: number }>
      g.penampang = gambarPenampangKayu({
        lebarMm: Number(i.lebarMm),
        tinggiMm: Number(i.tinggiMm),
        kelas: String(el.input.kelas ?? ''),
        panjangM: Number(i.panjangM),
        gayaKn: Number(i.gayaKn),
        lebarTumpuanMm: Number(i.lebarTumpuanMm),
        rasioTumpu: per.find((x) => /tumpu/i.test(x.nama))?.rasio,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.penampangGagal = 'Penampang kayu tak dapat digambar dari input ini'
    }
  }

  if (el.jenis === 'baja_ringan') {
    try {
      /*
        Dimensi diambil dari KATALOG modulnya, bukan dari input — input hanya
        memuat kunci teksnya. Membaca dari katalog yang sama dengan yang
        dipakai perhitungan menjamin gambar dan angka tak berselisih.
      */
      const kunci = String(el.input.profil ?? '')
      const pr = (PROFIL_BAJA_RINGAN as Record<string, {
        tinggiMm: number; lebarMm: number; tebalMm: number
      }>)[kunci]
      if (!pr) throw new Error(`Profil baja ringan tak dikenal: ${kunci}`)
      g.penampang = gambarProfilBaja({
        hMm: pr.tinggiMm, bMm: pr.lebarMm,
        twMm: pr.tebalMm, tfMm: pr.tebalMm,
        bentuk: 'C', designation: kunci,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.penampangGagal = 'Penampang baja ringan tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    GUSSET — hanya SEPOTONG pelatnya yang bekerja, dan itu tak terlihat.

    Kesalahpahaman paling mahal pada pelat buhul: menyangka SELURUH lebar pelat
    memikul gaya batangnya. Yang bekerja hanya sepotong yang menyebar 30° dari
    baris alat sambung pertama — lebar efektif Whitmore. Pelat selebar 400 mm
    bisa jadi hanya 180 mm-nya yang bekerja, dan MEMPERLEBAR pelat tak menolong
    kalau penyebarannya sudah terhalang tepi.

    Lebar Whitmore diambil dari HASIL, bukan dihitung ulang.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'baja_gusset') {
    try {
      const hg = hasil as { antara?: { lebarWhitmoreMm?: number } }
      const per = periksaDari(hasil) as Array<{ nama: string; rasio: number }>
      g.pola = gambarGusset({
        tebalMm: Number(i.tebalMm),
        lebarSambunganMm: Number(i.lebarSambunganMm),
        panjangSambunganMm: Number(i.panjangSambunganMm),
        panjangBebasMm: Number(i.panjangBebasMm),
        lebarWhitmoreMm: hg.antara?.lebarWhitmoreMm,
        gayaKn: Number(i.gayaKn),
        rasioTekuk: per.find((x) => /tekuk/i.test(x.nama))?.rasio,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.polaGagal = 'Pelat buhul tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    LAS SUDUT — yang menahan TENGGOROKAN, bukan kakinya.

    Ukuran yang ditulis di gambar ("las 6 mm") adalah panjang KAKI. Yang
    sesungguhnya menahan adalah tenggorokan, sebesar 0,707 × kaki — 29% lebih
    kecil. Menghitungnya dengan ukuran kaki memberi kapasitas terlalu besar,
    dan sambungan las yang gagal jarang memberi peringatan lebih dulu.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'baja_sambungan_las') {
    try {
      const per = periksaDari(hasil) as Array<{ nama: string; rasio: number }>
      g.pola = gambarLas({
        ukuranMm: Number(i.ukuranMm),
        panjangMm: Number(i.panjangMm),
        tebalPelatMm: Number(i.tebalPelatMm),
        vuKn: Number(i.vuKn),
        rasio: per[0]?.rasio,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.polaGagal = 'Potongan las tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    POLA SAMBUNGAN — satu gambar untuk baut, gusset, sekrup, dan paku.

    Yang membuat sambungan gagal jarang berupa kekurangan JUMLAH alat sambung;
    hampir selalu berupa PENEMPATANNYA — terlalu dekat ujung (membelah, GETAS),
    terlalu dekat tepi, atau terlalu rapat (menambah alat sambung justru
    MEMPERLEMAH). Ketiganya jarak, dan jarak hanya bisa diperiksa dengan mata.

    Empat jenis berbeda rumusnya tetapi SAMA bentuk gambarnya, jadi satu
    fungsi — empat fungsi berarti empat tempat yang bisa menyimpang.
    ══════════════════════════════════════════════════════════════════════════
  */
  {
    const polaSambungan: Record<string, () => Parameters<typeof gambarPolaSambungan>[0]> = {
      baja_sambungan_baut: () => ({
        jumlah: Number(i.jumlahBaut),
        diameterMm: Number(i.diameterMm),
        /* SNI 1729 §A3.5: jarak ujung >= 1,5d, jarak antar >= 3d. */
        minUjungMm: 1.5 * Number(i.diameterMm),
        minAntarMm: 3 * Number(i.diameterMm),
        alat: 'baut',
        gayaKn: Number(i.vuKn),
      }),
      baja_angkur: () => ({
        jumlah: Number(i.jumlahAngkur),
        diameterMm: Number(i.diameterMm),
        alat: 'angkur',
        gayaKn: Number(i.tuKn),
      }),
      sambungan_kayu: () => ({
        jumlah: Number(i.jumlahAlat),
        diameterMm: Number(i.diameterMm),
        jarakUjungMm: Number(i.jarakTepiSejajarMm),
        jarakTepiMm: Number(i.jarakTepiTegakMm),
        jarakAntarMm: Number(i.jarakAntarAlatMm),
        /* SNI 7973 §12.5 untuk paku: ujung 15d, tepi 5d, antar 10d. */
        minUjungMm: 15 * Number(i.diameterMm),
        minTepiMm: 5 * Number(i.diameterMm),
        minAntarMm: 10 * Number(i.diameterMm),
        alat: String(el.input.alat ?? 'paku'),
        gayaKn: Number(i.gayaKn),
      }),
      /*
        SAMBUNGAN MOMEN: yang digambar baut di SAYAP TARIK, karena di situlah
        momen dipindahkan. Jumlahnya diturunkan dari luas baut tarik yang
        dipakai perhitungan — bukan dari medan tersendiri, yang memang tak ada.
      */
      baja_sambungan_momen: () => {
        const dBaut = 22
        const luasSatu = (Math.PI / 4) * dBaut ** 2
        const n = Math.max(2, Math.round(Number(i.asBautTarikMm2) / luasSatu))
        return {
          jumlah: n,
          diameterMm: dBaut,
          minUjungMm: 1.5 * dBaut,
          minAntarMm: 3 * dBaut,
          alat: 'baut sayap tarik',
          gayaKn: Number(i.vuKn),
        }
      },
      sekrup_baja_ringan: () => ({
        jumlah: Number(i.jumlahSekrup),
        diameterMm: Number(i.diameterMm),
        jarakUjungMm: Number(i.jarakTepiMm),
        /* SNI 7971 §5.4: jarak tepi >= 3d. */
        minUjungMm: 3 * Number(i.diameterMm),
        alat: 'sekrup',
        gayaKn: Number(i.gayaGeserKn),
      }),
    }

    const buat = polaSambungan[el.jenis]
    if (buat) {
      try {
        g.pola = gambarPolaSambungan(buat(), {
          judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}`,
        })
      } catch {
        g.polaGagal = 'Pola sambungan tak dapat digambar dari input ini'
      }
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    DINDING PENAHAN TANAH — gambar yang menjelaskan VERDICT-nya.

    Ini satu-satunya elemen di aplikasi ini yang bisa runtuh TANPA satu pun
    bahannya gagal: betonnya utuh, tulangannya utuh, dan dindingnya terguling
    atau tergeser sebagai satu benda. Tiga dari empat pemeriksaannya bukan
    tentang kekuatan bahan sama sekali.

    Angka stabilitas diambil dari HASIL, bukan dihitung ulang di sini —
    aturan yang sama dengan pilecap. Menghitungnya dua kali berarti gambar dan
    verdict bisa berselisih diam-diam saat rumusnya diperbaiki, dan yang
    tergambar salah adalah yang dipakai orang.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'dinding_penahan') {
    try {
      const st = (hasil as {
        stabilitas?: {
          qMaksKnM2?: number; qMinKnM2?: number
          sfGuling?: number; sfGeser?: number; paKnPerM?: number
        }
      }).stabilitas
      g.potongan = gambarDindingPenahan({
        tinggiM: Number(i.tinggiM),
        tebalAtasM: Number(i.tebalAtasM),
        tebalBawahM: Number(i.tebalBawahM),
        panjangTelapakM: Number(i.panjangTelapakM),
        tebalTelapakM: Number(i.tebalTelapakM),
        kakiM: Number(i.kakiM),
        qMaksKnM2: st?.qMaksKnM2,
        qMinKnM2: st?.qMinKnM2,
        sfGuling: st?.sfGuling,
        sfGeser: st?.sfGeser,
        paKnPerM: st?.paKnPerM,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.potonganGagal = 'Potongan dinding penahan tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    SLOOF & BALOK T — dua elemen beton yang penampangnya sudah bisa digambar
    oleh primitif yang ADA, dan tak digambar selama ini hanya karena tak ada
    yang menyambungkannya.

    Keduanya berpenampang b × h bertulangan atas-bawah, persis bentuk yang
    `gambarPenampang()` sudah tangani untuk balok. Menuliskan primitif baru
    untuk keduanya berarti dua tempat yang bisa menyimpang dari satu bentuk
    yang sama.

    ── BALOK T digambar sebagai PERSEGI badannya, dan itu disengaja

    Balok T bekerja sebagai T untuk momen POSITIF (sayapnya menekan) tetapi
    sebagai PERSEGI untuk momen NEGATIF — di tumpuan, sayapnya justru tertarik
    dan tak bisa diandalkan. Modulnya sudah membedakan keduanya.

    Yang digambar di sini badan (bw × h) dengan tulangannya, yaitu penampang
    yang dipakai tukang saat merakit besi. Sayapnya adalah PELAT, dan pelat
    punya gambarnya sendiri — menggambar keduanya menyatu akan membuat besi
    pelat terlihat seperti bagian dari balok dan terpesan dua kali.
    ══════════════════════════════════════════════════════════════════════════
  */
  if (el.jenis === 'sloof' || el.jenis === 'balok_t') {
    try {
      const bt = el.jenis === 'balok_t'
      g.penampang = gambarPenampang({
        bMm: Number(bt ? i.bwMm : i.bMm),
        hMm: Number(i.hMm),
        selimutMm: Number(i.selimutMm),
        dSengkangMm: Number(i.dSengkangMm),
        dUtamaMm: Number(i.dUtamaMm),
        /*
          Jumlah batang di gambar HARUS sama dengan yang ditimbang di volume —
          aturan yang sama dengan balok. Batang yang tergambar tapi tak
          terhitung (atau sebaliknya) adalah selisih yang baru ketahuan di
          lapangan.
        */
        tulanganBawah: [Number(bt ? i.nTarik : i.nBawah)],
        tulanganAtas: [Number(i.nAtas)],
      }, {
        judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}`
          + (bt ? ' (badan)' : ''),
      })
    } catch {
      g.penampangGagal = 'Penampang tak dapat digambar dari input ini'
    }
  }

  /*
    ══════════════════════════════════════════════════════════════════════════
    PENAMPANG PROFIL BAJA — sepuluh jenis, satu gambar.

    Diukur 2026-08-19 lewat `lapor-cakupan-gambar.mjs`: dari 32 jenis, hanya
    TUJUH menghasilkan gambar, dan ketujuhnya beton. Seluruh sisi baja tak
    punya satu pun — termasuk `baja_rangka`, yang justru elemen dengan
    batang terbanyak.

    Profil diambil dari `input.profil`, medan yang SUDAH ada di tiap modul
    baja (dipakai untuk berat per meter di RAB). Tak ada data baru yang perlu
    diminta ke pengguna.

    Yang digambar bukan sekadar bentuknya: TEBAL BADAN dan TEBAL SAYAP
    ditunjuk terpisah. Keduanya berdampingan di penamaan profil
    ("200x100x5,5x8") dan tertukar tanpa gejala sampai batangnya datang.
    ══════════════════════════════════════════════════════════════════════════
  */
  const profil = (el.input as { profil?: Record<string, unknown> }).profil
  if (profil && typeof profil === 'object') {
    try {
      g.penampang = gambarProfilBaja({
        hMm: Number(profil.hMm), bMm: Number(profil.bMm),
        twMm: Number(profil.t1Mm), tfMm: Number(profil.t2Mm),
        bentuk: String(profil.profile_type ?? 'WF'),
        designation: profil.designation ? String(profil.designation) : undefined,
      }, { judul: `${el.kode}${el.nama ? ` — ${el.nama}` : ''}` })
    } catch {
      g.penampangGagal = 'Penampang profil tak dapat digambar dari input ini'
    }
  }

  /*
    RANGKA batang: profilnya ada DI DALAM tiap batang, bukan di akar input.
    Digambar untuk batang PERTAMA yang punya profil — rangka bisa memakai
    beberapa profil berbeda, dan menggambar semuanya membuat balasan membengkak
    tanpa diminta. Yang butuh semuanya membuka tiap batangnya.
  */
  if (!g.penampang && Array.isArray((el.input as { batang?: unknown[] }).batang)) {
    const batang = (el.input as { batang: Array<{ nama?: string; profil?: Record<string, unknown> }> }).batang
    const b0 = batang.find((b) => b?.profil)
    if (b0?.profil) {
      try {
        g.penampang = gambarProfilBaja({
          hMm: Number(b0.profil.hMm), bMm: Number(b0.profil.bMm),
          twMm: Number(b0.profil.t1Mm), tfMm: Number(b0.profil.t2Mm),
          bentuk: String(b0.profil.profile_type ?? 'WF'),
          designation: b0.profil.designation ? String(b0.profil.designation) : undefined,
        }, { judul: `${el.kode} — batang ${b0.nama ?? '1'}` })
      } catch {
        g.penampangGagal = 'Penampang batang rangka tak dapat digambar'
      }
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
