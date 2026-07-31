import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// scope-item WAJIB disaring company — bukan cuma pm_id/mandor_id.
//
// ── Cacat yang dijaga
//
// `resolveScopeItemOwnership()` dulu hanya menerima `itemId`, mencari barisnya
// dengan `.eq('id', itemId)` SAJA, lalu pemanggilnya memeriksa `pm_id` (untuk
// PM) dan `mandor_id` (untuk mandor).
//
// Yang terlewat: **admin tidak difilter sama sekali**. Admin di company A yang
// mengetahui UUID sebuah scope-item milik company B bisa:
//   · PATCH  /mandor/scope-items/:id           → ubah volume, harga satuan, nama
//   · DELETE /mandor/scope-items/:id           → hapus item pekerjaan
//   · PATCH  /mandor/scope-items/:id/progress  → ubah realisasi volume
//
// Ketiganya menulis, dan `unit_price × volume` masuk ke nilai pekerjaan mandor.
//
// Dibuktikan di dev sebelum diperbaiki (transaksi di-rollback): query by-id
// yang sama persis memulangkan baris milik company lain, nol saringan tenant.
//
// ── Kenapa penjaganya di level SUMBER, bukan HTTP
//
// Menguji lewat HTTP butuh dua company nyata berisi rantai lengkap
// projects → mandor_assignments → work_scopes → work_scope_items, dan
// `work_scope_items` tak punya `company_id` sendiri (ia mewarisi lewat 3 join).
// Membangun fixture itu di schema `test` lebih rapuh daripada yang dijaganya.
//
// Yang dikunci di sini adalah BENTUK yang membuat cacatnya mungkin: helper
// menerima `request`, query membawa `company_id`, dan hasilnya dibandingkan
// dengan `request.companyId`. Kalau salah satu hilang, cacatnya kembali —
// dan test ini merah.
// ============================================================

const MANDOR = join(import.meta.dirname, '..', 'mandor.ts')
const isi = () => readFileSync(MANDOR, 'utf8')

/** Badan `resolveScopeItemOwnership` saja, supaya penjaga tak kena kode lain. */
function badanHelper(): string {
  const s = isi()
  const mulai = s.indexOf('async function resolveScopeItemOwnership')
  expect(mulai, 'helper resolveScopeItemOwnership tak ditemukan').toBeGreaterThan(-1)
  // Batas diambil dari `app.` BERIKUTNYA, bukan panjang tetap. Versi pertama
  // memotong 1400 karakter dan langsung rapuh: menambahkan komentar penjelas
  // di dalam helper mendorong penjaganya keluar potongan, lalu test merah
  // padahal kodenya benar. Ambang berbasis panjang selalu jadi jebakan waktu.
  const akhir = s.indexOf('\n  app.', mulai)
  return s.slice(mulai, akhir === -1 ? mulai + 3000 : akhir)
}

describe('resolveScopeItemOwnership menyaring company', () => {
  it('menerima `request`, bukan hanya itemId', () => {
    // Tanpa `request`, helper ini TAK BISA tahu company aktif — jadi cacatnya
    // bukan "lupa memfilter", melainkan "tak punya bahan untuk memfilter".
    expect(badanHelper()).toMatch(/resolveScopeItemOwnership\(\s*request: FastifyRequest/)
  })

  it('query mengambil company_id proyek induk', () => {
    // `work_scope_items` tak punya company_id sendiri; ia mewarisi lewat
    // work_scopes → mandor_assignments → projects. Kalau kolomnya tak ikut
    // di-select, perbandingan di bawah selalu undefined.
    expect(badanHelper()).toMatch(/projects!inner\([^)]*company_id/)
  })

  it('membandingkan company proyek dengan company aktif, dan menolak bila beda', () => {
    const b = badanHelper()
    // Pola dilonggarkan dari `!== request.companyId` yang KAKU: perbandingannya
    // boleh ditulis bagaimana pun (`!==`, `===` + negasi, di dalam penjaga
    // gabungan), asal `request.companyId` benar-benar dipakai untuk memutuskan
    // dan hasilnya `return null`. Versi kaku sebelumnya memerahkan refactor
    // yang justru MEMPERBAIKI penyempitan tipe — test yang menolak perbaikan
    // adalah test yang salah, bukan kodenya.
    expect(b).toMatch(/request\.companyId/)
    expect(b).toMatch(/company_id[\s\S]{0,120}request\.companyId[\s\S]{0,80}return null/)
  })

  it('SELURUH pemanggil meneruskan request', () => {
    // Satu pemanggil yang tertinggal = satu rute yang tetap bocor. Ini yang
    // paling mudah terlewat saat menambah endpoint baru.
    const s = isi()
    const panggilan = [...s.matchAll(/resolveScopeItemOwnership\(([^)]*)\)/g)]
      .map((m) => m[1].trim())
      .filter((arg) => !arg.startsWith('request: FastifyRequest'))   // buang deklarasinya
    expect(panggilan.length, 'nol pemanggil — helper ini mati?').toBeGreaterThan(0)
    for (const arg of panggilan) {
      expect(arg, `pemanggil tanpa request: ${arg}`).toMatch(/^request\s*,/)
    }
  })

  it('ketiga rute scope-item memakai helper ini', () => {
    // Jalur hidup (AUTOPILOT §9a): penjaga yang tak dipanggil rute mana pun
    // tak melindungi apa pun.
    const s = isi()
    for (const rute of [
      "'/api/v1/mandor/scope-items/:id'",
      "'/api/v1/mandor/scope-items/:id/progress'",
    ]) {
      expect(s, `rute ${rute} hilang`).toContain(rute)
    }
    // PATCH + DELETE + PATCH progress = 3 pemanggil.
    const jml = [...s.matchAll(/await resolveScopeItemOwnership\(request,/g)].length
    expect(jml, 'harus dipanggil ketiga rute scope-item').toBe(3)
  })
})

describe('gerbang tenant pada rute yang ditemukan audit-gerbang', () => {
  // Kelima celah ini ditemukan dengan meninjau keluaran
  // `audit-gerbang-tenancy.mjs` satu per satu, bukan dari membaca berurutan.
  // Yang dikunci di sini BENTUKNYA — kalau saringannya dihapus, cacatnya
  // kembali dan tak ada gejala apa pun sampai badan usaha kedua berdiri.
  const baca = (f: string) =>
    readFileSync(join(import.meta.dirname, '..', f), 'utf8')

  it('rekap-pajak: daftar & ubah status sama-sama disaring proyek', () => {
    const s = baca('reports.ts')
    // GET: `.in('invoice.project_id', …)` — tax_records kategori C lewat invoice.
    expect(s).toMatch(/\.in\('invoice\.project_id', idProyekPajak\)/)
    // PATCH :id/status: rekap diambil dulu, proyeknya diperiksa, baru di-update.
    expect(s).toMatch(/proyekBolehDibaca\(request, proyekRekap\)/)
  })

  it('stok: movements per project_id diperiksa kepemilikannya', () => {
    expect(baca('procurement.ts'))
      .toMatch(/projectIds\(\)\)\.includes\(project_id\)/)
  })

  it('summary pengeluaran disaring ke proyek tenant — termasuk saat tanpa filter', () => {
    // Justru kasus TANPA `project_id` yang paling berbahaya: tanpa `.in(...)`
    // ia menjumlahkan pengeluaran SEMUA perusahaan jadi satu angka.
    //
    // ⚠️ Dicocokkan DI DALAM handler-nya, bukan di mana pun dalam berkas.
    // `cash.ts` punya 3 kemunculan `.in('project_id', idProyek)`; uji mutasi
    // membuktikan assertion se-berkas tak berguna — menghapus yang di sini
    // tetap hijau karena dua lainnya masih ada.
    const s = baca('cash.ts')
    const i = s.indexOf("summary-by-category")
    expect(i, 'rute summary-by-category hilang').toBeGreaterThan(-1)
    const handler = s.slice(i, i + 1600)
    expect(handler).toMatch(/\.in\('project_id', idProyek\)/)
    expect(handler).toMatch(/projectIds\(\)/)
  })

  it('work-scope baru: assignment_id dari body DIVERIFIKASI', () => {
    const s = baca('mandor.ts')
    expect(s).toMatch(/from\('mandor_assignments'\)[\s\S]{0,200}?eq\('id', body\.assignment_id\)/)
    expect(s).toMatch(/includes\(penugasan\.project_id\)/)
  })

  it('daftar mandor dibatasi anggota company aktif', () => {
    // Di-anchor ke rute `/mandor/list` — sama alasannya dengan cash.ts.
    const s = baca('mandor.ts')
    const i = s.indexOf("'/api/v1/mandor/list'")
    expect(i, 'rute /mandor/list hilang').toBeGreaterThan(-1)
    const handler = s.slice(i, i + 1600)
    expect(handler).toMatch(/\.in\('id', idAnggota\)/)
    expect(handler).toMatch(/eq\('company_id', request\.companyId!\)/)
  })

  it('role custom lahir dengan company_id, bukan sebagai baris bersama', () => {
    // `roles` kategori AB: NULL = bawaan (bersama). Role custom tanpa
    // company_id akan dianggap bawaan oleh tolakRoleTenantLain() dan lolos
    // ke perusahaan lain.
    expect(baca('roles.ts')).toMatch(/is_builtin: false,[\s\S]{0,600}?company_id: request\.companyId/)
  })
})
