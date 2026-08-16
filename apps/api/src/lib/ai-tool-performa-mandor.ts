/**
 * 6.12 — RINGKASAN PERFORMA MANDOR (hari orang, kehadiran, lembur).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG SELAMA INI TAK ADA JAWABANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Mandor mana yang paling banyak menurunkan orang bulan ini?" — pertanyaan
 * paling wajar seorang pemilik, dan sampai hari ini asisten hanya bisa
 * menjawabnya dengan menyebut satu-satu isi absensi. 1.279 baris absensi tak
 * bisa dibacakan; yang dicari adalah RINGKASANNYA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA `porsi_hari` DIJUMLAH, BUKAN BARISNYA DIHITUNG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: `porsi_hari` bernilai 1.00 (1.166 baris) atau 0.50
 * (113 baris). Menghitung `count(*)` memperlakukan setengah hari sama dengan
 * sehari penuh — dan 113 baris setengah hari akan dilaporkan sebagai 113
 * hari orang, melebihkan 56,5 hari.
 *
 * Yang dijumlah karena itu `porsi_hari`, dan istilahnya disebut "hari orang"
 * di keluaran supaya pembacanya tak menyangka itu jumlah kehadiran.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TENANCY: DUA LOMPATAN, DAN KENAPA TAK BOLEH DIPENDEKKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `absensi_harian` TIDAK punya `company_id`. Ia kategori C lewat rantai:
 *
 *   absensi_harian.scope_id → work_scopes.assignment_id
 *                           → mandor_assignments.project_id → projects
 *
 * Jadi daftar scope-nya harus dibangun dari proyek tenant lebih dulu. Godaan
 * memendekkannya — membaca absensi lalu menyaring belakangan — adalah cara
 * paling halus data tenant lain ikut terbaca: penyaringannya benar untuk
 * baris yang TERBACA, dan yang bocor adalah yang sudah terlanjur masuk
 * memori proses sebelum disaring.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * I-1: TOOL INI TIDAK MENULIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hanya SELECT. Ditegakkan `audit-tool-ai-read-only.mjs` (ambang NOL).
 */

import type { TenantDb } from '../utils/tenant-db.js'

/** Batas baris tiap bacaan — di bawah plafon senyap PostgREST (1.000). */
const BATAS = 900

export interface BarisPerformaMandor {
  mandor: string
  hariOrang: number
  jumlahTukang: number
  jamLembur: number
  hariAktif: number
}

export interface HasilPerformaMandor {
  sejak: string
  sampai: string
  totalHariOrang: number
  mandor: BarisPerformaMandor[]
  catatan?: string
}

/** `YYYY-MM-DD` dari waktu lokal — bukan UTC, agar tak bergeser sehari. */
function tgl(d: Date): string {
  const b = String(d.getMonth() + 1).padStart(2, '0')
  const t = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${b}-${t}`
}

/**
 * Menyusun ringkasan performa per mandor dalam rentang tanggal.
 *
 * `sejak`/`sampai` wajib diisi pemanggil (blok konteks penanya sudah memberi
 * model rentang "minggu ini"/"bulan ini" yang dihitung server). Tanpa rentang
 * eksplisit, bawaannya 30 hari terakhir — dinyatakan di keluaran supaya
 * pembacanya tahu angka itu mewakili apa.
 */
export async function ringkasPerformaMandor(
  db: TenantDb,
  opsi: { sejak?: string; sampai?: string } = {},
): Promise<HasilPerformaMandor | { galat: string }> {
  const sampai = opsi.sampai ?? tgl(new Date())
  const sejak =
    opsi.sejak ??
    tgl(new Date(new Date(sampai + 'T00:00:00').getTime() - 29 * 864e5))

  const proyekIds = await db.projectIds()
  if (proyekIds.length === 0) {
    return { sejak, sampai, totalHariOrang: 0, mandor: [], catatan: 'Belum ada proyek.' }
  }

  /*
   * Lompatan 1: proyek → penugasan mandor.
   *
   * `mandor_assignments` juga kategori C, dan `viaProject` hanya menerima SATU
   * project_id — sementara yang dicari ringkasan LINTAS proyek. Maka `unsafe()`
   * dengan `.in('project_id', …)` atas daftar proyek tenant sendiri, persis
   * pola `ai-tool-beban-mandor.ts` yang sudah terbukti.
   *
   * Nama mandor diambil sekalian lewat relasi yang DINAMAI constraint-nya:
   * tabel ini punya dua FK ke `users` (`mandor_id` dan `assigned_by`), jadi
   * `users(name)` polos ambigu dan ditolak PostgREST.
   */
  const { data: tugas, error: e1 } = await db
    .unsafe(
      'mandor_assignments',
      'tool baca AI: performa mandor lintas proyek milik tenant, disaring project_id',
    )
    .select('id, mandor_id, users!mandor_assignments_mandor_id_fkey(name)')
    .in('project_id', proyekIds)
    .limit(BATAS)

  if (e1) {
    return { galat: 'Gagal membaca daftar penugasan mandor.' }
  }
  const daftarTugas = (tugas ?? []) as unknown as {
    id: string
    mandor_id: string
    users?: { name?: string | null } | null
  }[]
  if (daftarTugas.length === 0) {
    return { sejak, sampai, totalHariOrang: 0, mandor: [], catatan: 'Belum ada mandor yang ditugaskan.' }
  }

  /*
   * Lompatan 2: penugasan → lingkup kerja. Kategori C juga, lewat
   * `assignment_id` — dan penugasannya SUDAH tersaring proyek tenant di atas,
   * jadi `.in()` di sini tak bisa menjangkau lingkup milik siapa pun lain.
   */
  const { data: scopes, error: e2 } = await db
    .unsafe(
      'work_scopes',
      'tool baca AI: lingkup kerja dari penugasan yang sudah tersaring proyek tenant',
    )
    .select('id, assignment_id')
    .in(
      'assignment_id',
      daftarTugas.map((t) => t.id),
    )
    .limit(BATAS)

  if (e2) {
    return { galat: 'Gagal membaca daftar lingkup kerja.' }
  }
  const daftarScope = (scopes ?? []) as { id: string; assignment_id: string }[]
  if (daftarScope.length === 0) {
    return { sejak, sampai, totalHariOrang: 0, mandor: [], catatan: 'Belum ada lingkup kerja.' }
  }

  /*
   * Absensi dibaca PER SCOPE, karena `viaProject` menerima satu nilai kolom
   * penunjuk. Terlihat boros, tapi jumlah scope kecil dan tiap bacaan tersaring
   * di basis — bukan disaring di memori setelah semuanya terbaca.
   */
  const perScope = new Map<string, string>() // scopeId → mandorId
  const mandorDariTugas = new Map(daftarTugas.map((t) => [t.id, t.mandor_id]))
  for (const s of daftarScope) {
    const m = mandorDariTugas.get(s.assignment_id)
    if (m) perScope.set(s.id, m)
  }

  const kum = new Map<
    string,
    { hariOrang: number; tukang: Set<string>; lembur: number; hari: Set<string> }
  >()

  for (const [scopeId, mandorId] of perScope) {
    const { data: abs, error: e3 } = await db
      .viaProject('absensi_harian', scopeId)
      .select('worker_id, tanggal, porsi_hari, jam_lembur')
      .gte('tanggal', sejak)
      .lte('tanggal', sampai)
      .limit(BATAS)

    if (e3) {
      return { galat: 'Gagal membaca absensi.' }
    }

    const baris = (abs ?? []) as {
      worker_id: string
      tanggal: string
      porsi_hari: string | number | null
      jam_lembur: string | number | null
    }[]

    /*
     * Pemotongan senyap: kalau satu scope memulangkan tepat BATAS baris,
     * angkanya SUDAH salah dan tak ada galat yang mengatakannya. Lebih baik
     * menolak menjawab daripada melaporkan total yang kurang.
     */
    if (baris.length >= BATAS) {
      return {
        galat:
          'Data absensi pada rentang ini terlalu banyak untuk diringkas sekaligus. ' +
          'Persempit rentang tanggalnya.',
      }
    }

    /*
     * Entri dibuat HANYA kalau ada absensinya.
     *
     * Versi pertama membuatnya sebelum memeriksa `baris`, jadi rentang tanggal
     * yang kosong tetap memulangkan satu baris per mandor dengan nol di semua
     * kolom — "tidak ada data" terbaca sebagai "enam mandor, semuanya nol
     * hari". Ditemukan test rentang-masa-depan, bukan oleh pembacaan ulang.
     */
    if (baris.length === 0) continue

    let k = kum.get(mandorId)
    if (!k) {
      k = { hariOrang: 0, tukang: new Set(), lembur: 0, hari: new Set() }
      kum.set(mandorId, k)
    }
    for (const b of baris) {
      k.hariOrang += Number(b.porsi_hari ?? 0)
      k.lembur += Number(b.jam_lembur ?? 0)
      if (b.worker_id) k.tukang.add(b.worker_id)
      if (b.tanggal) k.hari.add(b.tanggal)
    }
  }

  if (kum.size === 0) {
    return {
      sejak,
      sampai,
      totalHariOrang: 0,
      mandor: [],
      catatan: 'Tidak ada absensi tercatat pada rentang ini.',
    }
  }

  /*
   * Nama mandor sudah ikut dari embed di lompatan 1 — tak perlu bacaan `users`
   * terpisah. Satu `unsafe()` lebih sedikit bukan sekadar hemat query: tiap
   * escape hatch adalah tempat penyaringan tenant bisa salah ditulis kelak.
   */
  const nama = new Map<string, string>()
  for (const t of daftarTugas) {
    if (t.mandor_id && !nama.has(t.mandor_id)) {
      nama.set(t.mandor_id, t.users?.name ?? '(tanpa nama)')
    }
  }

  const daftar: BarisPerformaMandor[] = [...kum.entries()]
    .map(([id, k]) => ({
      mandor: nama.get(id) ?? '(tanpa nama)',
      hariOrang: Math.round(k.hariOrang * 100) / 100,
      jumlahTukang: k.tukang.size,
      jamLembur: Math.round(k.lembur * 100) / 100,
      hariAktif: k.hari.size,
    }))
    .sort((a, b) => b.hariOrang - a.hariOrang)

  return {
    sejak,
    sampai,
    totalHariOrang:
      Math.round(daftar.reduce((s, d) => s + d.hariOrang, 0) * 100) / 100,
    mandor: daftar,
  }
}
